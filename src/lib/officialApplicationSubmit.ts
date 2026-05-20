import type { PrismaClient } from "@prisma/client";
import { hasOrgAdminAccess, hostOrgAdminCanManageCompetition } from "@/lib/roleScopes";
import {
  isQualificationExpired,
  normalizeQualificationKind,
} from "@/lib/qualificationTemplateRules";
import { OFFICIAL_RECRUITMENT_REQUIRED_LIFESAVING_KINDS } from "@/lib/technicalOfficialRules";

export type OfficialApplicationEntryType = "GENERAL" | "TECHNICAL";

export type OfficialApplicationCompetitionForSubmit = {
  id: string;
  status: string;
  entryStartDate: Date | null;
  entryEndDate: Date | null;
  officialRecruitmentEnabled: boolean;
  officialQualificationFilterEnabled: boolean;
  technicalOfficialRecruitmentEnabled: boolean;
  organization: {
    status: string;
    admins: { role: string }[];
  };
};

type GateError = { ok: false; status: number; error: string };
type GateOk<T> = { ok: true } & T;
type GateOkEmpty = { ok: true };

export async function loadOfficialApplicationCompetition(
  prisma: PrismaClient,
  competitionId: string,
  sessionUserId: string
): Promise<GateError | GateOk<{ competition: OfficialApplicationCompetitionForSubmit; isHostAdmin: boolean }>> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      status: true,
      entryStartDate: true,
      entryEndDate: true,
      officialRecruitmentEnabled: true,
      officialQualificationFilterEnabled: true,
      technicalOfficialRecruitmentEnabled: true,
      organization: {
        select: {
          status: true,
          admins: {
            where: { userId: sessionUserId },
            select: { role: true },
          },
        },
      },
    },
  });

  if (!competition) {
    return { ok: false, status: 404, error: "大会が見つかりません" };
  }

  const isHostAdmin = hostOrgAdminCanManageCompetition(competition.organization.admins, competition.organization.status);
  if (competition.status === "DRAFT" && !isHostAdmin) {
    return { ok: false, status: 404, error: "大会が見つかりません" };
  }
  if (competition.status === "CANCELLED") {
    return { ok: false, status: 400, error: "この大会は中止のため応募できません" };
  }
  if (!competition.officialRecruitmentEnabled) {
    return { ok: false, status: 400, error: "現在オフィシャル募集は停止中です" };
  }

  const now = new Date();
  const entryStart = competition.entryStartDate ? new Date(competition.entryStartDate) : null;
  const entryEnd = competition.entryEndDate ? new Date(competition.entryEndDate) : null;
  const entryWindowOpen = entryStart && entryEnd ? now >= entryStart && now <= entryEnd : false;
  if (!entryWindowOpen && !isHostAdmin) {
    return {
      ok: false,
      status: 403,
      error: "競技者エントリー受付期間外のため、オフィシャル応募はできません",
    };
  }

  return { ok: true, competition, isHostAdmin };
}

export function parseOfficialApplicationMessage(message: unknown): string | null {
  const messageRaw = typeof message === "string" ? message.trim() : "";
  return messageRaw.length > 0 ? messageRaw.slice(0, 2000) : null;
}

export function parseOfficialApplicationBody(body: unknown): {
  message: string | null;
  entryType: OfficialApplicationEntryType;
  clubId: string;
} {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    message: parseOfficialApplicationMessage(o.message),
    entryType: o.entryType === "TECHNICAL" ? "TECHNICAL" : "GENERAL",
    clubId: typeof o.clubId === "string" ? o.clubId.trim() : "",
  };
}

export async function resolveOfficialApplicationPositionName(
  prisma: PrismaClient,
  competitionId: string,
  competition: OfficialApplicationCompetitionForSubmit,
  entryType: OfficialApplicationEntryType,
  clubId: string,
  sessionUserId: string
): Promise<GateError | GateOk<{ positionName: string }>> {
  let positionName = "オフィシャル";
  if (entryType === "TECHNICAL") {
    if (!competition.technicalOfficialRecruitmentEnabled) {
      return {
        ok: false,
        status: 400,
        error: "この大会ではテクニカルオフィシャル機能が無効です",
      };
    }
    if (!clubId) {
      return { ok: false, status: 400, error: "TO応募にはクラブ選択が必要です" };
    }
    const [club, individualEntryExists, teamEntryExists, approvedMembership] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { id: true, name: true },
      }),
      prisma.competitionEntry.findFirst({
        where: {
          competitionId,
          clubId,
          status: { not: "CANCELLED" },
        },
        select: { id: true },
      }),
      prisma.teamEntry.findFirst({
        where: {
          competitionId,
          clubId,
        },
        select: { id: true },
      }),
      prisma.membership.findFirst({
        where: {
          userId: sessionUserId,
          clubId,
          status: "APPROVED",
        },
        select: { id: true },
      }),
    ]);
    const hasCompetitionEntryForClub = Boolean(individualEntryExists || teamEntryExists);
    const isApprovedMemberOfClub = Boolean(approvedMembership);
    if (!club || (!isApprovedMemberOfClub && !hasCompetitionEntryForClub)) {
      return {
        ok: false,
        status: 400,
        error:
          "選択したクラブについて、承認済みの所属がないか、この大会への競技エントリーがまだありません。所属クラブを選ぶか、主催者へお問い合わせください。",
      };
    }
    positionName = `テクニカルオフィシャル（${club.name}）`;
  }
  return { ok: true, positionName };
}

export async function assertOfficialQualificationFilterForUser(
  prisma: PrismaClient,
  applicantUserId: string,
  filterEnabled: boolean
): Promise<GateError | GateOkEmpty> {
  if (!filterEnabled) {
    return { ok: true };
  }

  const requiredKinds = [...OFFICIAL_RECRUITMENT_REQUIRED_LIFESAVING_KINDS];
  const refereeKinds = ["RefereeC", "RefereeB", "RefereeA", "RefereeS"];
  const allKinds = [...requiredKinds, ...refereeKinds];

  const [templates, userQualifications] = await Promise.all([
    prisma.qualificationTemplate.findMany({
      where: { kind: { in: allKinds } },
      select: { kind: true, name: true },
    }),
    prisma.qualification.findMany({
      where: {
        userId: applicantUserId,
        status: "APPROVED",
      },
      select: {
        kind: true,
        expiryDate: true,
      },
    }),
  ]);

  const availableKindSet = new Set(templates.map((t) => normalizeQualificationKind(t.kind)));
  const hasTemplateCoverage = allKinds.every((k) =>
    availableKindSet.has(normalizeQualificationKind(k))
  );
  if (!hasTemplateCoverage) {
    return {
      ok: false,
      status: 400,
      error: "現在この大会の応募資格を確認できません。主催者へお問い合わせください。",
    };
  }

  const approvedValidKindSet = new Set(
    userQualifications
      .filter((q) => !isQualificationExpired(q.expiryDate))
      .map((q) => normalizeQualificationKind(q.kind))
  );

  const missingRequired = requiredKinds.filter(
    (kind) => !approvedValidKindSet.has(normalizeQualificationKind(kind))
  );
  const hasAnyReferee = refereeKinds.some((kind) =>
    approvedValidKindSet.has(normalizeQualificationKind(kind))
  );

  if (missingRequired.length > 0 || !hasAnyReferee) {
    const nameOf = (kind: string) =>
      templates.find((t) => normalizeQualificationKind(t.kind) === normalizeQualificationKind(kind))
        ?.name ?? kind;
    const missingLabel = missingRequired.map(nameOf).join(" / ");
    const refereeLabel = refereeKinds.map(nameOf).join(" / ");
    return {
      ok: false,
      status: 403,
      error:
        missingRequired.length > 0
          ? `応募には ${missingLabel} の承認済み資格が必要です`
          : `応募には審判資格（${refereeLabel} のいずれか）の承認済み資格が必要です`,
    };
  }

  return { ok: true };
}

/** POST / PATCH 共通: 応募内容（positionName / message）まで確定する */
export async function buildOfficialApplicationSubmitPayload(
  prisma: PrismaClient,
  params: {
    competitionId: string;
    sessionUserId: string;
    competition: OfficialApplicationCompetitionForSubmit;
    entryType: OfficialApplicationEntryType;
    clubId: string;
    message: string | null;
  }
): Promise<GateError | GateOk<{ positionName: string; message: string | null }>> {
  const qual = await assertOfficialQualificationFilterForUser(
    prisma,
    params.sessionUserId,
    params.competition.officialQualificationFilterEnabled
  );
  if (!qual.ok) return qual;

  const pos = await resolveOfficialApplicationPositionName(
    prisma,
    params.competitionId,
    params.competition,
    params.entryType,
    params.clubId,
    params.sessionUserId
  );
  if (!pos.ok) return pos;

  return { ok: true, positionName: pos.positionName, message: params.message };
}
