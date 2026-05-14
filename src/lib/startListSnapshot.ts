import { prisma } from "@/server/db";
import { competitionEntryPaidCheckoutWhere } from "@/lib/entryCheckoutSessionPaid";
import { heatPlanSplitFingerprint } from "@/lib/eventHeatPlanMarshal";
import { hasIndividualWithdrawalForEvent } from "@/lib/entryWithdrawalAdminLabel";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  primaryHeatSettingFromEventConfig,
  resolveTabMaxLanes,
  roundTabToHeatSetting,
  type HeatSetting,
} from "@/lib/startListSettings";
import {
  buildDispersedIndividualParticipantHeats,
  buildDispersedTeamParticipantHeats,
  computePlacementSeed,
  createStartListRng,
} from "@/lib/startListHeatPlacement";
import {
  normalizeSnapshotRoundKey,
  parseStartListSnapshotLooseForRoundRead,
} from "@/lib/heatMarshalFromSnapshot";
import {
  enforceMinHeatCountForMaxLanes,
  reorderRounds,
  resolveHeatCount,
  type StartListHeat,
  type StartListParticipant,
  type StartListRoundData,
} from "@/lib/startListRounds";

type FirstRoundGeneratedBy = StartListRoundData["generatedBy"];

type SnapshotEvent = {
  eventId: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  type: "INDIVIDUAL" | "TEAM";
  rounds: StartListRoundData[];
};

export type StartListSnapshotPayload = {
  version: 1;
  capturedAt: string;
  events: SnapshotEvent[];
};

export type CreateStartListSnapshotResult =
  | { captured: true; snapshotId: string }
  | { captured: false; snapshotId: string }
  | { captured: false; snapshotId: null; reason: "BEFORE_ENTRY_END" }
  | { captured: false; snapshotId: null; reason: "PENDING_ENTRY_CHECKOUTS" }
  | { captured: false; snapshotId: null; reason: "NO_ELIGIBLE_ENTRIES" };

export type ReplaceStartListSnapshotResult = {
  ok: true;
  snapshotId: string;
  wasUpdate: boolean;
  /** 先頭 HEAT の分割に変更がなく、スナップショット行を更新しなかった */
  skipped?: boolean;
  /** 種目の一部だけヒートを再計算した */
  partialRebuild?: boolean;
};

/** 先頭ラウンド（HEAT）だけ差し替え、既存の次ラウンド以降を残す */
function mergeNewHeatHeadOntoPreviousTailForEvent(
  old: SnapshotEvent | undefined,
  freshForEvent: SnapshotEvent
): SnapshotEvent {
  if (!old?.rounds || old.rounds.length <= 1) return freshForEvent;
  const [, ...tail] = old.rounds;
  const head = freshForEvent.rounds[0];
  if (!head) return freshForEvent;
  return { ...freshForEvent, rounds: [head, ...tail] };
}

/** 手動記録で HEAT を差し替えつつ、既存の次ラウンド以降（進行生成済み）を残す */
function mergeSnapshotPreservingTailRounds(
  previous: unknown,
  next: StartListSnapshotPayload
): StartListSnapshotPayload {
  if (!previous || typeof previous !== "object") return next;
  const p = previous as { events?: SnapshotEvent[] };
  if (!Array.isArray(p.events)) return next;
  const prevById = new Map(p.events.map((e) => [e.eventId, e]));
  const events = next.events.map((ev) => mergeNewHeatHeadOntoPreviousTailForEvent(prevById.get(ev.eventId), ev));
  return { ...next, events };
}

/** 一部種目だけ fresh に含み、それ以外は previous の種目ブロックをそのまま引き継ぐ */
function mergePartialFreshSnapshotPreservingTailRounds(
  previous: unknown,
  freshPartial: StartListSnapshotPayload,
  orderedEventIds: readonly string[]
): StartListSnapshotPayload {
  if (!previous || typeof previous !== "object") return freshPartial;
  const p = previous as { events?: SnapshotEvent[] };
  if (!Array.isArray(p.events)) return freshPartial;
  const prevById = new Map(p.events.map((e) => [e.eventId, e]));
  const freshById = new Map(freshPartial.events.map((e) => [e.eventId, e]));
  const events: SnapshotEvent[] = [];
  for (const id of orderedEventIds) {
    const freshEv = freshById.get(id);
    if (freshEv) {
      events.push(mergeNewHeatHeadOntoPreviousTailForEvent(prevById.get(id), freshEv));
    } else {
      const old = prevById.get(id);
      if (old) events.push(old);
    }
  }
  return { version: 1, capturedAt: freshPartial.capturedAt, events };
}

async function countPendingEntryCheckoutSessions(competitionId: string): Promise<number> {
  return prisma.entryCheckoutSession.count({
    where: { competitionId, status: "PENDING" },
  });
}

async function competitionHasEligibleParticipantsForSnapshot(competitionId: string): Promise<boolean> {
  const [individuals, teams] = await Promise.all([
    prisma.competitionEntry.count({
      where: {
        competitionId,
        status: "SUBMITTED",
        OR: [{ totalFee: { lte: 0 } }, competitionEntryPaidCheckoutWhere],
      },
    }),
    prisma.teamEntry.count({ where: { competitionId } }),
  ]);
  return individuals + teams > 0;
}

export type BuildStartListSnapshotPayloadOptions = {
  /** 指定した種目だけヒート再計算（エントリー取得もこの種目に絞る） */
  onlyEventIds?: ReadonlySet<string>;
};

async function loadCompetitionEventIdsOrdered(competitionId: string): Promise<string[]> {
  const rows = await prisma.event.findMany({
    where: { competitionId },
    select: { id: true },
    orderBy: { displayOrder: "asc" },
  });
  return rows.map((r) => r.id);
}

/**
 * 先頭 HEAT の分割に効く設定が変わった種目 id のみ返す（スナップショット部分再計算用）。
 */
export function eventIdsWhereHeatPlanSplitChanged(params: {
  orderedEventIds: readonly string[];
  previous: Record<string, HeatSetting | undefined>;
  next: Record<string, HeatSetting | undefined>;
}): string[] {
  const out: string[] = [];
  for (const id of params.orderedEventIds) {
    if (heatPlanSplitFingerprint(params.previous[id]) !== heatPlanSplitFingerprint(params.next[id])) {
      out.push(id);
    }
  }
  return out;
}

/**
 * 現在のエントリーとヒート設定からスナップショット用 JSON を組み立てる（DB 書き込みなし）。
 */
export async function buildStartListSnapshotPayload(
  competitionId: string,
  firstRoundGeneratedBy: FirstRoundGeneratedBy,
  options?: BuildStartListSnapshotPayloadOptions
): Promise<StartListSnapshotPayload> {
  const only = options?.onlyEventIds;
  const onlyArray = only && only.size > 0 ? [...only] : null;

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      startListSettings: true,
      events:
        onlyArray && onlyArray.length > 0
          ? {
              where: { id: { in: onlyArray } },
              select: {
                id: true,
                name: true,
                sex: true,
                type: true,
                displayOrder: true,
                preliminaryHeatLaneCount: true,
              },
              orderBy: { displayOrder: "asc" },
            }
          : {
              select: {
                id: true,
                name: true,
                sex: true,
                type: true,
                displayOrder: true,
                preliminaryHeatLaneCount: true,
              },
              orderBy: { displayOrder: "asc" },
            },
    },
  });
  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  const entryWhere = {
    competitionId,
    status: "SUBMITTED" as const,
    OR: [{ totalFee: { lte: 0 } }, competitionEntryPaidCheckoutWhere],
    ...(onlyArray
      ? {
          items: { some: { eventId: { in: onlyArray } } },
        }
      : {}),
  };

  const teamWhere =
    onlyArray && onlyArray.length > 0
      ? { competitionId, eventId: { in: onlyArray } }
      : { competitionId };

  const [entries, teamEntries] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: entryWhere,
      include: {
        user: {
          select: {
            id: true,
            familyName: true,
            givenName: true,
          },
        },
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          select: {
            eventId: true,
          },
        },
        participantStatuses: {
          select: { eventId: true, status: true, reason: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamEntry.findMany({
      where: teamWhere,
      include: {
        club: {
          select: { id: true, name: true },
        },
        members: {
          include: {
            user: {
              select: {
                familyName: true,
                givenName: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const { eventSettings } = parseStartListSettings(competition.startListSettings);

  const individualByEvent = new Map<string, StartListParticipant[]>();
  for (const entry of entries) {
    for (const item of entry.items) {
      if (only && !only.has(item.eventId)) continue;
      if (hasIndividualWithdrawalForEvent(entry.participantStatuses, item.eventId)) {
        continue;
      }
      const list = individualByEvent.get(item.eventId) ?? [];
      list.push({
        kind: "INDIVIDUAL",
        entryId: entry.id,
        userId: entry.user.id,
        name: `${entry.user.familyName} ${entry.user.givenName}`,
        clubId: entry.club?.id ?? null,
        clubName: entry.club?.name ?? null,
      });
      individualByEvent.set(item.eventId, list);
    }
  }

  const teamByEvent = new Map<string, StartListParticipant[]>();
  for (const teamEntry of teamEntries) {
    if (only && !only.has(teamEntry.eventId)) continue;
    const list = teamByEvent.get(teamEntry.eventId) ?? [];
    list.push({
      kind: "TEAM",
      teamEntryId: teamEntry.id,
      teamName: teamEntry.teamName,
      clubId: teamEntry.club?.id ?? null,
      clubName: teamEntry.club?.name ?? null,
      members: teamEntry.members
        .map((member) => `${member.user.familyName} ${member.user.givenName}`)
        .filter(Boolean),
    });
    teamByEvent.set(teamEntry.eventId, list);
  }

  const capturedAt = new Date().toISOString();
  const snapshotEvents: SnapshotEvent[] = competition.events.map((event) => {
    const participants =
      event.type === "TEAM"
        ? teamByEvent.get(event.id) ?? []
        : individualByEvent.get(event.id) ?? [];
    const n = participants.length;
    const roundTabs = normalizeRoundTabs(eventSettings[event.id] ?? {});
    const firstTab = roundTabs[0];
    const heatCountRaw = resolveHeatCount(
      n,
      firstTab
        ? roundTabToHeatSetting(firstTab)
        : primaryHeatSettingFromEventConfig(eventSettings[event.id])
    );
    const heatCount = enforceMinHeatCountForMaxLanes(
      n,
      heatCountRaw,
      resolveTabMaxLanes(firstTab, event.preliminaryHeatLaneCount)
    );
    const sortedIds =
      event.type === "TEAM"
        ? participants
            .filter((p): p is Extract<StartListParticipant, { kind: "TEAM" }> => p.kind === "TEAM")
            .map((p) => p.teamEntryId)
            .sort()
            .join(",")
        : participants
            .filter(
              (p): p is Extract<StartListParticipant, { kind: "INDIVIDUAL" }> =>
                p.kind === "INDIVIDUAL"
            )
            .map((p) => p.entryId)
            .sort()
            .join(",");
    const placementSeed = computePlacementSeed(
      competition.id,
      event.id,
      `${capturedAt}:${sortedIds}`
    );
    const tabSeed = (placementSeed ^ 1 * 0x9e37_79b9) >>> 0;
    const rng = createStartListRng(tabSeed);

    let heats: StartListHeat[];
    if (event.type === "TEAM") {
      const teamRows = participants.filter(
        (p): p is Extract<StartListParticipant, { kind: "TEAM" }> => p.kind === "TEAM"
      );
      heats = buildDispersedTeamParticipantHeats({
        teams: teamRows.map((p) => ({
          teamEntryId: p.teamEntryId,
          teamName: p.teamName,
          clubId: p.clubId,
          clubName: p.clubName,
          members: p.members,
          rank: null,
        })),
        heatCount,
        tabIndex: 0,
        officialRanksByRound: null,
        rng,
      });
    } else {
      const indRows = participants.filter(
        (p): p is Extract<StartListParticipant, { kind: "INDIVIDUAL" }> => p.kind === "INDIVIDUAL"
      );
      heats = buildDispersedIndividualParticipantHeats({
        individuals: indRows.map((p) => ({
          entryId: p.entryId,
          userId: p.userId,
          name: p.name,
          clubId: p.clubId,
          clubName: p.clubName,
          rank: null,
        })),
        heatCount,
        tabIndex: 0,
        officialRanksByRound: null,
        rng,
      });
    }
    return {
      eventId: event.id,
      name: event.name,
      sex: event.sex as "MALE" | "FEMALE" | "OTHER",
      type: event.type as "INDIVIDUAL" | "TEAM",
      rounds: reorderRounds([
        {
          round: "HEAT",
          generatedAt: capturedAt,
          generatedBy: firstRoundGeneratedBy,
          heats,
        },
      ]),
    };
  });

  return {
    version: 1,
    capturedAt,
    events: snapshotEvents,
  };
}

/**
 * 主催の明示操作で、現在のエントリー状態をスナップショットに上書き保存する（記録・監査用）。
 * 画面表示は常にライブデータを使い、本データは参照用。
 *
 * @param onlyRebuildEventIds `undefined` のときは全会場フル再計算（capture API 相当）。
 * 空配列は「先頭 HEAT 分割に変更なし」で、既存スナップショットがあれば DB 更新を省略する。
 */
export async function replaceCompetitionStartListSnapshot(params: {
  competitionId: string;
  createdByUserId?: string;
  /** 省略時フル再計算。空は分割変更なしでスキップ可 */
  onlyRebuildEventIds?: readonly string[] | undefined;
}): Promise<ReplaceStartListSnapshotResult> {
  const { competitionId, createdByUserId, onlyRebuildEventIds: requestedRebuild } = params;

  const [existing, orderedIds] = await Promise.all([
    prisma.competitionStartListSnapshot.findUnique({
      where: { competitionId },
      select: { id: true, data: true },
    }),
    loadCompetitionEventIdsOrdered(competitionId),
  ]);

  const prevEvents =
    existing?.data &&
    typeof existing.data === "object" &&
    Array.isArray((existing.data as { events?: unknown }).events)
      ? (existing.data as { events: SnapshotEvent[] }).events
      : [];
  const prevEventIdSet = new Set(prevEvents.map((e) => e.eventId));

  const hasUsablePrior = prevEvents.length > 0 && Boolean(existing?.id);

  if (requestedRebuild !== undefined && requestedRebuild.length === 0) {
    if (hasUsablePrior && existing) {
      return {
        ok: true,
        snapshotId: existing.id,
        wasUpdate: false,
        skipped: true,
      };
    }
  }

  const fullMode = requestedRebuild === undefined;
  const rebuildIds = fullMode
    ? orderedIds
    : [...new Set((requestedRebuild ?? []).filter((id) => orderedIds.includes(id)))];

  const anyCurrentEventMissingFromPriorSnapshot =
    hasUsablePrior && orderedIds.some((id) => !prevEventIdSet.has(id));

  const usePartial =
    !fullMode &&
    hasUsablePrior &&
    rebuildIds.length > 0 &&
    rebuildIds.length < orderedIds.length &&
    !anyCurrentEventMissingFromPriorSnapshot;

  const fresh = await buildStartListSnapshotPayload(
    competitionId,
    "RECORD_CAPTURE",
    usePartial ? { onlyEventIds: new Set(rebuildIds) } : undefined
  );

  const payload = hasUsablePrior
    ? usePartial
      ? mergePartialFreshSnapshotPreservingTailRounds(existing!.data, fresh, orderedIds)
      : mergeSnapshotPreservingTailRounds(existing!.data, fresh)
    : mergeSnapshotPreservingTailRounds(undefined, fresh);

  const now = new Date();
  const partialRebuild = Boolean(usePartial);

  if (existing) {
    await prisma.competitionStartListSnapshot.update({
      where: { competitionId },
      data: {
        data: payload,
        capturedAt: now,
        createdByUserId: createdByUserId ?? null,
      },
    });
    return {
      ok: true,
      snapshotId: existing.id,
      wasUpdate: true,
      partialRebuild,
    };
  }

  const created = await prisma.competitionStartListSnapshot.create({
    data: {
      competitionId,
      createdByUserId: createdByUserId ?? null,
      data: payload,
      capturedAt: now,
    },
    select: { id: true },
  });
  return {
    ok: true,
    snapshotId: created.id,
    wasUpdate: false,
    partialRebuild,
  };
}

/**
 * DB 上のスナップショットで先頭 HEAT の `heats` が空なのに、現在の成立エントリーから組み立てるとヒートが付く場合に
 * {@link replaceCompetitionStartListSnapshot} で修復する。
 *
 * 発生しうる状況: 初回作成時は参加者ゼロで空 HEAT が保存されたあとエントリーが増えたが更新に失敗した、マージ不整合など。
 * マーシャル API・スタートリスト画面の直前に呼ぶと、空ヒートによる誤った「スナップショットに未登録」を防げる。
 */
export async function repairStartListSnapshotEmptyHeadHeatsWhenEntriesExist(params: {
  competitionId: string;
  createdByUserId?: string;
}): Promise<boolean> {
  const { competitionId, createdByUserId } = params;

  const row = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { data: true },
  });
  if (!row?.data) return false;

  const parsed = parseStartListSnapshotLooseForRoundRead(row.data);
  if (!parsed?.events?.length) return false;

  const emptyHeadEventIds: string[] = [];
  for (const ev of parsed.events) {
    const heatRound = ev.rounds?.find((r) => normalizeSnapshotRoundKey(r.round) === "HEAT");
    if (heatRound && Array.isArray(heatRound.heats) && heatRound.heats.length === 0) {
      emptyHeadEventIds.push(ev.eventId);
    }
  }
  if (emptyHeadEventIds.length === 0) return false;

  const [entryHeadCount, teamHeadCount] = await Promise.all([
    prisma.competitionEntry.count({
      where: {
        competitionId,
        status: "SUBMITTED",
        OR: [{ totalFee: { lte: 0 } }, competitionEntryPaidCheckoutWhere],
      },
    }),
    prisma.teamEntry.count({ where: { competitionId } }),
  ]);
  if (entryHeadCount + teamHeadCount === 0) return false;

  const fresh = await buildStartListSnapshotPayload(competitionId, "RECORD_CAPTURE");
  let needsRepair = false;
  for (const eid of emptyHeadEventIds) {
    const freshEv = fresh.events.find((e) => e.eventId === eid);
    const freshHeat = freshEv?.rounds?.find((r) => normalizeSnapshotRoundKey(r.round) === "HEAT");
    if ((freshHeat?.heats?.length ?? 0) > 0) {
      needsRepair = true;
      break;
    }
  }
  if (!needsRepair) return false;

  await replaceCompetitionStartListSnapshot({ competitionId, createdByUserId });
  return true;
}

/**
 * 互換のため残すが、初回 HEAT は主催の明示 capture のみのため何もしない。
 * @deprecated スタートリストは {@link replaceCompetitionStartListSnapshot}（capture API）で更新する。
 */
export async function refreshStartListSnapshotAfterEligibleEntryChange(
  _competitionId: string
): Promise<void> {
  return;
}

/**
 * 初回のみスナップショット行を作成（次ラウンド生成 API などが既存 JSON を更新する前提）。
 * 呼び出し: 次ラウンド生成 API など。初回 HEAT の自動 Cron／ページ補完は行わない。
 */
export async function createStartListSnapshotIfNeeded(params: {
  competitionId: string;
  createdByUserId?: string;
  skipPaymentStabilityCheck?: boolean;
  /** true のときエントリー締切前でも作成可（管理 API 用） */
  skipEntryDeadlineGate?: boolean;
  /**
   * true のとき、呼び出し元でスナップショット未作成を確認済みであること。
   * 先頭の findUnique を省略し DB 往復を減らす（{@link ensureStartListSnapshotIfEligible} 用）。
   */
  assumeSnapshotAbsent?: boolean;
  /** assumeSnapshotAbsent 時に既に取得済みの entryEndDate（締切ゲートの再取得を省略） */
  entryEndDateForGate?: Date | null;
  /** 先頭 HEAT の generatedBy（スケジュールは ENTRY_CLOSE を推奨） */
  firstRoundGeneratedBy?: FirstRoundGeneratedBy;
}): Promise<CreateStartListSnapshotResult> {
  const {
    competitionId,
    createdByUserId,
    skipPaymentStabilityCheck = false,
    skipEntryDeadlineGate = false,
    assumeSnapshotAbsent = false,
    entryEndDateForGate,
    firstRoundGeneratedBy = "BASELINE",
  } = params;

  if (!assumeSnapshotAbsent) {
    const existing = await prisma.competitionStartListSnapshot.findUnique({
      where: { competitionId },
      select: { id: true },
    });
    if (existing) {
      return { captured: false, snapshotId: existing.id };
    }
  }

  let competition: { id: string; entryEndDate: Date | null } | null;
  if (assumeSnapshotAbsent && entryEndDateForGate !== undefined) {
    competition = { id: competitionId, entryEndDate: entryEndDateForGate };
  } else {
    competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        entryEndDate: true,
      },
    });
  }
  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  const now = new Date();
  if (!skipEntryDeadlineGate && competition.entryEndDate && now < new Date(competition.entryEndDate)) {
    return { captured: false, snapshotId: null, reason: "BEFORE_ENTRY_END" };
  }

  if (!competition.entryEndDate && !skipPaymentStabilityCheck) {
    const pendingCheckouts = await countPendingEntryCheckoutSessions(competitionId);
    if (pendingCheckouts > 0) {
      return { captured: false, snapshotId: null, reason: "PENDING_ENTRY_CHECKOUTS" };
    }
    const hasEligible = await competitionHasEligibleParticipantsForSnapshot(competitionId);
    if (!hasEligible) {
      return { captured: false, snapshotId: null, reason: "NO_ELIGIBLE_ENTRIES" };
    }
  }

  const payload = await buildStartListSnapshotPayload(competitionId, firstRoundGeneratedBy);

  const snapshot = await prisma.competitionStartListSnapshot.create({
    data: {
      competitionId,
      createdByUserId: createdByUserId ?? null,
      data: payload,
    },
    select: { id: true },
  });

  return { captured: true, snapshotId: snapshot.id };
}

/**
 * 互換のため残すが、初回 HEAT は capture のみ作成するため常に false。
 * @deprecated {@link replaceCompetitionStartListSnapshot} を主催操作で呼ぶ。
 */
export async function ensureStartListSnapshotIfEligible(_competitionId: string): Promise<boolean> {
  return false;
}

export const ensureStartListSnapshotAfterDeadline = ensureStartListSnapshotIfEligible;

export type ScheduledStartListSnapshotPassResult = {
  examined: number;
  captured: number;
  skipped: number;
  errors: number;
};

/**
 * Cron 用の互換エントリ。初回 HEAT は主催 capture のみのため DB を走査しない。
 */
export async function runScheduledStartListSnapshotPass(): Promise<ScheduledStartListSnapshotPassResult> {
  return {
    examined: 0,
    captured: 0,
    skipped: 0,
    errors: 0,
  };
}
