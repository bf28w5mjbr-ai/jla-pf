import type { Competition } from "@prisma/client";
import {
  isPeriodShortening,
  PUBLISHED_ENTRY_PERIOD_SHORTEN_FORBIDDEN_MESSAGE,
} from "@/lib/autoEntryChangeAnnouncement";
import { prisma } from "@/server/db";
import { createNotification } from "@/lib/notificationService";

export class CompetitionEditForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetitionEditForbiddenError";
  }
}

export type CompetitionMutationState = {
  isPublished: boolean;
  /** 決済フロー開始済み（Checkout 作成済み） */
  hasPaymentFlowStarted: boolean;
  /** 業務上のエントリー成立: 無料エントリー確定 or 決済完了 */
  hasEstablishedEntry: boolean;
};

function parseQualificationList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function isQualificationTightening(oldList: unknown, newList: string[]): boolean {
  const oldArr = parseQualificationList(oldList);
  const oldSet = new Set(oldArr);
  return newList.some((q) => !oldSet.has(q));
}

export async function loadCompetitionMutationState(
  competitionId: string
): Promise<CompetitionMutationState> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { isPublished: true },
  });

  const [checkoutCount, established] = await Promise.all([
    prisma.entryCheckoutSession.count({
      where: {
        competitionId,
        status: { in: ["PENDING", "COMPLETED"] },
      },
    }),
    prisma.competitionEntry.findFirst({
      where: {
        competitionId,
        status: "SUBMITTED",
        OR: [
          { totalFee: { lte: 0 } },
          {
            checkoutSessions: { some: { status: "COMPLETED" } },
          },
        ],
      },
      select: { id: true },
    }),
  ]);

  return {
    isPublished: Boolean(competition?.isPublished),
    hasPaymentFlowStarted: checkoutCount > 0,
    hasEstablishedEntry: Boolean(established),
  };
}

export function assertEntryFeeEditable(
  state: CompetitionMutationState
): void {
  if (!state.isPublished) return;
  if (state.hasPaymentFlowStarted || state.hasEstablishedEntry) {
    throw new CompetitionEditForbiddenError(
      "エントリーまたは決済が発生しているため、参加費を変更できません。"
    );
  }
}

export type EntrySettingsBody = {
  entryStartDate?: unknown;
  entryEndDate?: unknown;
  allowMultipleEventEntries?: unknown;
  maxEventEntriesPerPerson?: unknown;
  requireClubMembership?: unknown;
  minAge?: unknown;
  maxAge?: unknown;
  /** 公開後かつエントリー成立後の緩和・延長時に必須 */
  announcementMessage?: unknown;
};

function mergeDate(body: unknown, current: Date | null): Date | null {
  if (body === undefined) return current;
  if (body === null || body === "") return null;
  if (typeof body === "string") return new Date(body);
  return current;
}

function mergeBool(body: unknown, current: boolean): boolean {
  if (typeof body === "boolean") return body;
  return current;
}

function mergeAge(body: unknown, current: number | null): number | null {
  if (body === undefined) return current;
  if (body === null) return null;
  if (typeof body === "number") return body;
  return current;
}

function mergeEventEntryLimit(body: unknown, current: number | null): number | null {
  if (body === undefined) return current;
  if (body === null) return null;
  if (typeof body === "number") return body;
  return current;
}

function isPeriodExtension(
  oldStart: Date | null,
  oldEnd: Date | null,
  newStart: Date | null,
  newEnd: Date | null
): boolean {
  if (oldEnd && newEnd && newEnd.getTime() > oldEnd.getTime()) return true;
  if (oldStart && newStart && newStart.getTime() < oldStart.getTime()) return true;
  return false;
}

function isAgeTightening(
  oldMin: number | null,
  oldMax: number | null,
  newMin: number | null,
  newMax: number | null
): boolean {
  if (newMin != null && oldMin != null && newMin > oldMin) return true;
  if (newMax != null && oldMax != null && newMax < oldMax) return true;
  if (newMin != null && oldMin === null) return true;
  if (newMax != null && oldMax === null) return true;
  return false;
}

function isEventEntryLimitTightening(
  oldLimit: number | null,
  newLimit: number | null
): boolean {
  if (newLimit === null) return false;
  if (oldLimit === null) return true;
  return newLimit < oldLimit;
}

export function assertEntrySettingsChange(
  competition: Competition,
  body: EntrySettingsBody,
  state: CompetitionMutationState
): void {
  if (!state.isPublished) return;

  const oldStart = competition.entryStartDate;
  const oldEnd = competition.entryEndDate;
  const newStart = mergeDate(body.entryStartDate, oldStart);
  const newEnd = mergeDate(body.entryEndDate, oldEnd);

  if (isPeriodShortening(oldStart, oldEnd, newStart, newEnd)) {
    throw new CompetitionEditForbiddenError(
      PUBLISHED_ENTRY_PERIOD_SHORTEN_FORBIDDEN_MESSAGE
    );
  }

  const extension = isPeriodExtension(oldStart, oldEnd, newStart, newEnd);
  const announce =
    typeof body.announcementMessage === "string" && body.announcementMessage.trim().length > 0;

  if (extension && state.hasEstablishedEntry && !announce) {
    throw new CompetitionEditForbiddenError(
      "エントリーが成立しているため、受付期間の延長・前倒しを行う場合は announcementMessage で参加者への告知内容を入力してください。"
    );
  }

  const nextAllowMulti = mergeBool(
    body.allowMultipleEventEntries,
    competition.allowMultipleEventEntries
  );
  if (competition.allowMultipleEventEntries && !nextAllowMulti && state.hasEstablishedEntry) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後は、複数種目エントリーを禁止する変更（厳格化）はできません。"
    );
  }

  const nextEventEntryLimit = mergeEventEntryLimit(
    body.maxEventEntriesPerPerson,
    competition.maxEventEntriesPerPerson
  );
  if (
    isEventEntryLimitTightening(
      competition.maxEventEntriesPerPerson,
      nextEventEntryLimit
    ) &&
    state.hasEstablishedEntry
  ) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後は、1人あたりのエントリー可能種目数上限を厳しくする変更はできません。"
    );
  }

  const nextRequireClub = mergeBool(
    body.requireClubMembership,
    competition.requireClubMembership
  );
  if (!competition.requireClubMembership && nextRequireClub && state.hasEstablishedEntry) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後は、所属クラブ必須への変更（厳格化）はできません。"
    );
  }

  const nextMin = mergeAge(body.minAge, competition.minAge);
  const nextMax = mergeAge(body.maxAge, competition.maxAge);
  if (isAgeTightening(competition.minAge, competition.maxAge, nextMin, nextMax)) {
    if (state.hasEstablishedEntry) {
      throw new CompetitionEditForbiddenError(
        "エントリー成立後は、年齢条件を厳しくする変更はできません。"
      );
    }
  }
}

export function assertRequiredQualificationsChange(
  competition: Competition,
  newQuals: string[],
  state: CompetitionMutationState,
  announcementMessage: string | undefined
): void {
  if (!state.isPublished) return;
  if (!state.hasEstablishedEntry) return;

  const oldRaw = competition.requiredQualifications;
  if (isQualificationTightening(oldRaw, newQuals)) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後は、必要資格を厳しくする変更はできません。"
    );
  }

  const oldArr = parseQualificationList(oldRaw);
  const newSet = new Set(newQuals);
  const isRelaxed = oldArr.some((q) => !newSet.has(q));
  if (isRelaxed && !announcementMessage?.trim()) {
    throw new CompetitionEditForbiddenError(
      "必要資格を緩和する場合は announcementMessage で参加者への告知内容を入力してください。"
    );
  }
}

export function assertEventDeletionAllowed(state: CompetitionMutationState): void {
  if (!state.isPublished) return;
  if (state.hasEstablishedEntry) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後は種目を削除できません。"
    );
  }
}

export function assertEventAgePatchAllowed(state: CompetitionMutationState): void {
  if (!state.isPublished) return;
  if (state.hasEstablishedEntry) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後は種目の年齢条件を変更できません。"
    );
  }
}

export function assertEventAddAllowed(
  state: CompetitionMutationState,
  announcementMessage: string | undefined
): void {
  if (!state.isPublished) return;
  if (!state.hasEstablishedEntry) return;
  if (!announcementMessage?.trim()) {
    throw new CompetitionEditForbiddenError(
      "エントリー成立後に種目を追加する場合は announcementMessage で参加者への告知内容を入力してください。"
    );
  }
}

export async function notifyCompetitionEntrants(params: {
  competitionId: string;
  title: string;
  body: string;
}): Promise<void> {
  const entrants = await prisma.competitionEntry.findMany({
    where: { competitionId: params.competitionId, status: "SUBMITTED" },
    distinct: ["userId"],
    select: { userId: true },
  });

  const linkUrl = `/competitions/${params.competitionId}`;

  for (const { userId } of entrants) {
    await createNotification({
      userId,
      category: "COMPETITION",
      type: "COMPETITION_RULES_UPDATED",
      title: params.title,
      body: params.body,
      relatedId: params.competitionId,
      linkUrl,
    });
  }
}

export async function announceCompetitionRuleChange(params: {
  competitionId: string;
  title: string;
  body: string;
}): Promise<void> {
  await prisma.competitionAnnouncement.create({
    data: {
      competitionId: params.competitionId,
      title: params.title,
      content: params.body,
      // 仕様上、運用変更の告知は即時公開する
      publishedAt: new Date(),
    },
  });

  await notifyCompetitionEntrants({
    competitionId: params.competitionId,
    title: params.title,
    body: params.body,
  });
}
