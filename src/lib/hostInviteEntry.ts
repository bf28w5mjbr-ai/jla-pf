import type { Prisma } from "@prisma/client";
import { clubTeamNameBaseFromClub } from "@/lib/teamEntryClubBaseName";
import {
  normalizeTeamNamesForEvent,
  type TeamEntryDraftRow,
} from "@/lib/teamEntryDraftNormalize";
import { getTeamEntryMarshalAssignmentBlockedMap } from "@/lib/teamMemberAssignmentWindow";
import { prisma } from "@/server/db";

export const HOST_INVITE_SNAPSHOT_SOURCE = "HOST_INVITE" as const;

export type HostInviteCompetitionEvent = {
  id: string;
  name: string;
  type: string;
  requiresEntryTime: boolean;
  maxTeamEntriesPerClub?: number | null;
};

export type ParsedHostInviteItem = {
  eventId: string;
  entryTime: string | null;
};

export type HostInviteTeamAdjustment = {
  eventId: string;
  targetCount: number;
};

export type HostInviteIndividualPayload = {
  mode: "individual";
  targetUserId: string;
  notes: string | null;
  items: ParsedHostInviteItem[];
};

export type HostInviteTeamPayload = {
  mode: "team";
  notes: string | null;
  clubId: string;
  adjustments: HostInviteTeamAdjustment[];
};

export type HostInvitePayload = HostInviteIndividualPayload | HostInviteTeamPayload;

export type ExistingTeamRow = {
  id: string;
  teamName: string;
};

export type HostInviteTeamAdjustResult = {
  createdTeamEntryIds: string[];
  deletedTeamEntryIds: string[];
  createdCount: number;
  deletedCount: number;
};

export class HostInviteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostInviteValidationError";
  }
}

function parseItemsRaw(
  itemsRaw: unknown[] | null,
  eventMap: Map<string, HostInviteCompetitionEvent>
): ParsedHostInviteItem[] {
  if (!itemsRaw) return [];
  const parsedItems: ParsedHostInviteItem[] = [];
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const eventId = typeof r.eventId === "string" ? r.eventId.trim() : "";
    if (!eventId) continue;
    const ev = eventMap.get(eventId);
    if (!ev || ev.type !== "INDIVIDUAL") {
      throw new HostInviteValidationError("個人種目のみ指定できます");
    }
    const entryTime =
      r.entryTime == null ? null : String(r.entryTime).trim() || null;
    if (ev.requiresEntryTime && (!entryTime || !entryTime.length)) {
      throw new HostInviteValidationError(`「${ev.name}」のエントリータイムが必要です`);
    }
    parsedItems.push({ eventId, entryTime });
  }
  const dedupedByEvent = new Map<string, ParsedHostInviteItem>();
  for (const item of parsedItems) {
    dedupedByEvent.set(item.eventId, item);
  }
  return [...dedupedByEvent.values()];
}

function parseTargetCountRaw(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return Math.floor(Number(raw));
  }
  return NaN;
}

function parseAdjustmentsRaw(
  adjustmentsRaw: unknown[] | null,
  eventMap: Map<string, HostInviteCompetitionEvent>
): HostInviteTeamAdjustment[] {
  if (!adjustmentsRaw) return [];
  const byEvent = new Map<string, number>();
  for (const row of adjustmentsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const eventId = typeof r.eventId === "string" ? r.eventId.trim() : "";
    if (!eventId) continue;
    const ev = eventMap.get(eventId);
    if (!ev || ev.type !== "TEAM") {
      throw new HostInviteValidationError("チーム種目のみ指定できます");
    }
    const targetCount = parseTargetCountRaw(r.targetCount);
    if (!Number.isFinite(targetCount) || targetCount < 0) {
      throw new HostInviteValidationError(
        `「${ev.name}」の登録組数は0以上の整数で指定してください`
      );
    }
    byEvent.set(eventId, targetCount);
  }
  return [...byEvent.entries()].map(([eventId, targetCount]) => ({ eventId, targetCount }));
}

export function parseHostInviteBody(
  body: unknown,
  eventMap: Map<string, HostInviteCompetitionEvent>
): HostInvitePayload {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const notes =
    typeof b.notes === "string" && b.notes.trim().length > 0
      ? b.notes.trim().slice(0, 2000)
      : null;

  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  const clubId = typeof b.clubId === "string" ? b.clubId.trim() : "";
  const itemsRaw = Array.isArray(b.items) ? b.items : null;
  const adjustmentsRaw = Array.isArray(b.adjustments) ? b.adjustments : null;
  const hasItems = itemsRaw != null && itemsRaw.length > 0;
  const hasAdjustments = adjustmentsRaw != null && adjustmentsRaw.length > 0;

  if (Array.isArray(b.additions) && b.additions.length > 0) {
    throw new HostInviteValidationError(
      "チーム種目は adjustments（eventId と targetCount）で指定してください"
    );
  }

  if (Array.isArray(b.teamEntries) && b.teamEntries.length > 0) {
    throw new HostInviteValidationError(
      "チーム種目は adjustments（eventId と targetCount）で指定してください"
    );
  }

  if (hasItems && hasAdjustments) {
    throw new HostInviteValidationError("個人種目とチーム種目は同時に指定できません");
  }

  if (hasAdjustments) {
    if (userId) {
      throw new HostInviteValidationError("チーム種目の変更ではユーザーを指定できません");
    }
    if (!clubId) {
      throw new HostInviteValidationError("チーム種目を登録する場合はクラブを指定してください");
    }
    const adjustments = parseAdjustmentsRaw(adjustmentsRaw, eventMap);
    if (adjustments.length === 0) {
      throw new HostInviteValidationError("有効なチーム種目がありません");
    }
    return { mode: "team", notes, clubId, adjustments };
  }

  if (hasItems) {
    if (!userId) {
      throw new HostInviteValidationError("対象ユーザーを指定してください");
    }
    if (clubId) {
      throw new HostInviteValidationError("個人種目の招待ではクラブを指定できません");
    }
    const items = parseItemsRaw(itemsRaw, eventMap);
    if (items.length === 0) {
      throw new HostInviteValidationError("有効な種目がありません");
    }
    return { mode: "individual", targetUserId: userId, notes, items };
  }

  throw new HostInviteValidationError("種目（1つ以上）を指定してください");
}

export function assertHostInviteEventCountLimits(params: {
  uniqueEventCount: number;
  allowMultiple: boolean;
  maxPerPerson: number | null;
}): void {
  const { uniqueEventCount, allowMultiple, maxPerPerson } = params;
  if (!allowMultiple && uniqueEventCount > 1) {
    throw new HostInviteValidationError("この大会は1種目のみ選択可能です");
  }
  if (allowMultiple && maxPerPerson !== null && uniqueEventCount > maxPerPerson) {
    throw new HostInviteValidationError(`この大会は${maxPerPerson}種目まで選択可能です`);
  }
}

/** 追加後のチーム名を決め、既存行の rename と新規 create 名を返す */
export function computeTeamNamesAfterAdd(
  existing: ExistingTeamRow[],
  addCount: number,
  base: string
): { updates: { id: string; teamName: string }[]; creates: { teamName: string }[] } {
  if (addCount < 1) {
    throw new HostInviteValidationError("追加組数は1以上で指定してください");
  }

  const eventId = "_host_invite_normalize";
  const draft: TeamEntryDraftRow[] = [
    ...existing.map((row) => ({
      id: row.id,
      eventId,
      teamName: row.teamName,
      persistedId: row.id,
    })),
    ...Array.from({ length: addCount }, (_, index) => ({
      id: `new-${index}`,
      eventId,
      teamName: "",
    })),
  ];

  const normalized = normalizeTeamNamesForEvent(draft, eventId, base);

  const updates: { id: string; teamName: string }[] = [];
  for (let i = 0; i < existing.length; i++) {
    const nextName = normalized[i]?.teamName ?? "";
    if (nextName !== existing[i]!.teamName) {
      updates.push({ id: existing[i]!.id, teamName: nextName });
    }
  }

  const creates = normalized.slice(existing.length).map((row) => ({
    teamName: row.teamName,
  }));

  return { updates, creates };
}

/** 目標組数に合わせて更新・追加・削除対象を決める（削除は末尾から） */
export function computeTeamNamesAfterTargetCount(
  existing: ExistingTeamRow[],
  targetCount: number,
  base: string
): {
  updates: { id: string; teamName: string }[];
  creates: { teamName: string }[];
  deleteIds: string[];
} {
  if (!Number.isInteger(targetCount) || targetCount < 0) {
    throw new HostInviteValidationError("登録組数は0以上の整数で指定してください");
  }

  if (targetCount > existing.length) {
    const { updates, creates } = computeTeamNamesAfterAdd(
      existing,
      targetCount - existing.length,
      base
    );
    return { updates, creates, deleteIds: [] };
  }

  const kept = existing.slice(0, targetCount);
  const deleteIds = existing.slice(targetCount).map((r) => r.id);

  if (targetCount === 0) {
    return { updates: [], creates: [], deleteIds };
  }

  const eventId = "_host_invite_normalize";
  const draft: TeamEntryDraftRow[] = kept.map((row) => ({
    id: row.id,
    eventId,
    teamName: row.teamName,
    persistedId: row.id,
  }));
  const normalized = normalizeTeamNamesForEvent(draft, eventId, base);

  const updates: { id: string; teamName: string }[] = [];
  for (let i = 0; i < kept.length; i++) {
    const nextName = normalized[i]?.teamName ?? "";
    if (nextName !== kept[i]!.teamName) {
      updates.push({ id: kept[i]!.id, teamName: nextName });
    }
  }

  return { updates, creates: [], deleteIds };
}

export function formatHostInviteTeamAdjustResultMessage(result: HostInviteTeamAdjustResult): string {
  const parts: string[] = [];
  if (result.createdCount > 0) parts.push(`${result.createdCount} 組追加`);
  if (result.deletedCount > 0) parts.push(`${result.deletedCount} 組削除`);
  if (parts.length === 0) return "チーム登録組数を更新しました";
  return `チームエントリーを${parts.join("・")}しました`;
}

export async function applyHostInviteTeamAdjustments(
  tx: Prisma.TransactionClient,
  params: {
    competitionId: string;
    clubId: string;
    clubBase: string;
    adjustments: HostInviteTeamAdjustment[];
    eventMap: Map<string, HostInviteCompetitionEvent>;
  }
): Promise<HostInviteTeamAdjustResult> {
  const { competitionId, clubId, clubBase, adjustments, eventMap } = params;
  const createdTeamEntryIds: string[] = [];
  const deletedTeamEntryIds: string[] = [];

  for (const adjustment of adjustments) {
    const ev = eventMap.get(adjustment.eventId);
    if (!ev || ev.type !== "TEAM") {
      throw new HostInviteValidationError("チーム種目のみ指定できます");
    }

    const existing = await tx.teamEntry.findMany({
      where: {
        competitionId,
        clubId,
        eventId: adjustment.eventId,
      },
      select: { id: true, teamName: true },
      orderBy: [{ teamName: "asc" }, { id: "asc" }],
    });

    const cap = ev.maxTeamEntriesPerClub ?? null;
    if (cap != null && adjustment.targetCount > cap) {
      throw new HostInviteValidationError(
        `「${ev.name}」では同一クラブあたり最大${cap}組までです。`
      );
    }

    const { updates, creates, deleteIds } = computeTeamNamesAfterTargetCount(
      existing,
      adjustment.targetCount,
      clubBase
    );

    if (deleteIds.length > 0) {
      const toDeleteRows = existing.filter((r) => deleteIds.includes(r.id));
      const blockMap = await getTeamEntryMarshalAssignmentBlockedMap(
        prisma,
        competitionId,
        toDeleteRows.map((r) => ({ id: r.id, eventId: adjustment.eventId }))
      );
      for (const row of toDeleteRows) {
        if (blockMap.get(row.id)) {
          throw new HostInviteValidationError(
            `「${ev.name}」の ${row.teamName} はマーシャル締切済みのため削除できません`
          );
        }
      }

      await tx.competitionParticipantStatus.deleteMany({
        where: { teamEntryId: { in: deleteIds } },
      });
      await tx.teamEntry.deleteMany({
        where: { id: { in: deleteIds } },
      });
      deletedTeamEntryIds.push(...deleteIds);
    }

    for (const update of updates) {
      await tx.teamEntry.update({
        where: { id: update.id },
        data: { teamName: update.teamName },
      });
    }

    for (const create of creates) {
      const created = await tx.teamEntry.create({
        data: {
          competitionId,
          clubId,
          eventId: adjustment.eventId,
          teamName: create.teamName,
        },
      });
      createdTeamEntryIds.push(created.id);
    }
  }

  return {
    createdTeamEntryIds,
    deletedTeamEntryIds,
    createdCount: createdTeamEntryIds.length,
    deletedCount: deletedTeamEntryIds.length,
  };
}

export function clubTeamNameBaseFromApprovedClub(club: {
  abbreviation?: string | null;
  name: string;
}): string {
  return clubTeamNameBaseFromClub(club);
}

export function buildHostInviteSnapshot(payload: HostInviteIndividualPayload): {
  notes: string | null;
  items: ParsedHostInviteItem[];
  teamEntries: [];
  clubId: null;
  registrationSource: typeof HOST_INVITE_SNAPSHOT_SOURCE;
} {
  return {
    notes: payload.notes,
    items: payload.items,
    teamEntries: [],
    clubId: null,
    registrationSource: HOST_INVITE_SNAPSHOT_SOURCE,
  };
}
