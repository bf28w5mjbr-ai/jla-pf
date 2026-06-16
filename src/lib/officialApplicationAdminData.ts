import type { PrismaClient } from "@prisma/client";
import type { OfficialApplicationsCsvRow } from "@/components/OfficialApplicationsCsvExportButton";
import type { OfficialAttendancesCsvRow } from "@/components/OfficialAttendancesCsvExportButton";
import { qualificationJapaneseLabel } from "@/lib/qualificationLabels";

export type OfficialApplicationCounts = {
  pending: number;
  approved: number;
  rejected: number;
  attendance: number;
};

export type OfficialApplicationListItem = {
  id: string;
  createdAt: string;
  status: string;
  positionName: string;
  userName: string;
};

const officialApplicationSelect = {
  id: true,
  createdAt: true,
  userId: true,
  status: true,
  positionName: true,
  message: true,
  user: {
    select: {
      email: true,
      profile: {
        select: {
          familyName: true,
          givenName: true,
          familyNameKana: true,
          givenNameKana: true,
        },
      },
      contact: { select: { phoneNumber: true } },
      jlaProfile: { select: { jlaMemberNumber: true } },
      primaryClub: { select: { name: true } },
      memberships: {
        where: { status: "APPROVED" as const },
        select: { club: { select: { name: true } } },
      },
      qualifications: {
        where: { status: "APPROVED" as const },
        select: { kind: true },
        orderBy: { kind: "asc" as const },
      },
    },
  },
} as const;

function refereeQualificationsDisplay(quals: { kind: string }[]): string {
  return quals
    .filter((q) => q.kind.startsWith("Referee"))
    .map((q) => qualificationJapaneseLabel(q.kind))
    .join("、");
}

function formatOfficialCsvDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function uniqueJoinedClubNames(names: Array<string | null | undefined>): string {
  return [...new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .join(" / ");
}

function technicalOfficialClubNameFromPosition(positionName: string | null | undefined): string {
  const match = positionName?.match(/^テクニカルオフィシャル（([^）]+)）/);
  return match?.[1]?.trim() ?? "";
}

function resolveOfficialCsvClubName({
  user,
  assignmentClubNames = [],
  positionName,
}: {
  user: {
    primaryClub: { name: string } | null;
    memberships: { club: { name: string } }[];
  };
  assignmentClubNames?: string[];
  positionName?: string | null;
}): string {
  const primaryClubName = user.primaryClub?.name?.trim();
  if (primaryClubName) return primaryClubName;

  const assignmentClubName = uniqueJoinedClubNames(assignmentClubNames);
  if (assignmentClubName) return assignmentClubName;

  const membershipClubName = uniqueJoinedClubNames(
    user.memberships.map((membership) => membership.club.name)
  );
  if (membershipClubName) return membershipClubName;

  return technicalOfficialClubNameFromPosition(positionName);
}

export async function loadOfficialApplicationCounts(
  prisma: PrismaClient,
  competitionId: string
): Promise<OfficialApplicationCounts> {
  const grouped = await prisma.competitionOfficialApplication.groupBy({
    by: ["status"],
    where: { competitionId },
    _count: { _all: true },
  });
  const officialAttendanceCount = await prisma.competitionOfficialAttendance.count({
    where: { competitionId },
  });

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const row of grouped) {
    if (row.status === "PENDING") pending = row._count._all;
    else if (row.status === "APPROVED") approved = row._count._all;
    else if (row.status === "REJECTED") rejected = row._count._all;
  }

  return {
    pending,
    approved,
    rejected,
    attendance: officialAttendanceCount,
  };
}

export async function loadOfficialApplicationsDayOpsData(
  prisma: PrismaClient,
  competitionId: string
): Promise<{
  applications: OfficialApplicationListItem[];
  applicationsCsvRows: OfficialApplicationsCsvRow[];
  attendancesCsvRows: OfficialAttendancesCsvRow[];
  competitionTypeLabel: string;
  attendanceCountAdditionLabel: string;
}> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { competitionType: true },
  });
  const competitionType = competition?.competitionType ?? null;
  const competitionTypeLabel =
    competitionType === "A" ? "A級" : competitionType === "B" ? "B級" : "未設定";
  const attendanceCountAdditionLabel =
    competitionType === "A" ? "1.0" : competitionType === "B" ? "0.5" : "0.0";

  const apps = await prisma.competitionOfficialApplication.findMany({
    where: { competitionId },
    orderBy: { createdAt: "desc" },
    select: officialApplicationSelect,
  });
  const atts = await prisma.competitionOfficialAttendance.findMany({
    where: { competitionId },
    orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
    select: {
      userId: true,
      attendanceDate: true,
      method: true,
      user: {
        select: {
          email: true,
          profile: { select: { familyName: true, givenName: true } },
          contact: { select: { phoneNumber: true } },
          primaryClub: { select: { name: true } },
          memberships: {
            where: { status: "APPROVED" },
            select: { club: { select: { name: true } } },
          },
        },
      },
    },
  });
  const assignments = await prisma.competitionTechnicalOfficialAssignment.findMany({
    where: { competitionId },
    select: {
      userId: true,
      club: { select: { name: true } },
    },
  });

  const attendanceDatesByUserId = new Map<string, string[]>();
  for (const attendance of atts) {
    const list = attendanceDatesByUserId.get(attendance.userId) ?? [];
    list.push(formatOfficialCsvDate(attendance.attendanceDate));
    attendanceDatesByUserId.set(attendance.userId, list);
  }
  for (const [userId, dates] of attendanceDatesByUserId) {
    attendanceDatesByUserId.set(userId, [...new Set(dates)].sort());
  }

  const assignmentClubNamesByUserId = new Map<string, string[]>();
  for (const assignment of assignments) {
    const list = assignmentClubNamesByUserId.get(assignment.userId) ?? [];
    list.push(assignment.club.name);
    assignmentClubNamesByUserId.set(assignment.userId, list);
  }

  const applicationMetaByUserId = new Map<string, { message: string; positionName: string }>();
  for (const application of apps) {
    applicationMetaByUserId.set(application.userId, {
      message: application.message?.trim() ?? "",
      positionName: application.positionName,
    });
  }

  const applications: OfficialApplicationListItem[] = apps.map((application) => ({
    id: application.id,
    createdAt: application.createdAt.toISOString(),
    status: application.status,
    positionName: application.positionName,
    userName: `${application.user.profile?.familyName ?? ""} ${application.user.profile?.givenName ?? ""}`.trim(),
  }));

  const applicationsCsvRows: OfficialApplicationsCsvRow[] = apps.map((application, index) => ({
    通し番号: String(index + 1),
    JLA番号: application.user.jlaProfile?.jlaMemberNumber ?? "",
    氏名: `${application.user.profile?.familyName ?? ""} ${application.user.profile?.givenName ?? ""}`.trim(),
    フリガナ: `${application.user.profile?.familyNameKana ?? ""} ${application.user.profile?.givenNameKana ?? ""}`.trim(),
    所属クラブ: resolveOfficialCsvClubName({
      user: application.user,
      assignmentClubNames: assignmentClubNamesByUserId.get(application.userId),
      positionName: application.positionName,
    }),
    出席日: (attendanceDatesByUserId.get(application.userId) ?? []).join(" / "),
    審判員資格: refereeQualificationsDisplay(application.user.qualifications),
    メールアドレス: application.user.email ?? "",
    電話番号: application.user.contact?.phoneNumber ?? "",
    "メモ（特筆事項）": application.message?.trim() ?? "",
  }));

  const attendancesCsvRows: OfficialAttendancesCsvRow[] = atts.map((attendance) => ({
    出席日: formatOfficialCsvDate(attendance.attendanceDate),
    氏名: `${attendance.user.profile?.familyName ?? ""} ${attendance.user.profile?.givenName ?? ""}`.trim(),
    所属クラブ: resolveOfficialCsvClubName({
      user: attendance.user,
      assignmentClubNames: assignmentClubNamesByUserId.get(attendance.userId),
      positionName: applicationMetaByUserId.get(attendance.userId)?.positionName,
    }),
    メールアドレス: attendance.user.email ?? "",
    電話番号: attendance.user.contact?.phoneNumber ?? "",
    出席方法: attendance.method === "NFC" ? "NFC" : "手動",
    大会種別: competitionTypeLabel,
    カウント追加分: attendanceCountAdditionLabel,
    "メモ（特筆事項）": applicationMetaByUserId.get(attendance.userId)?.message ?? "",
  }));

  return {
    applications,
    applicationsCsvRows,
    attendancesCsvRows,
    competitionTypeLabel,
    attendanceCountAdditionLabel,
  };
}

export const officialStatusLabel = {
  PENDING: "審査中",
  APPROVED: "受付済",
  REJECTED: "却下",
} as const;
