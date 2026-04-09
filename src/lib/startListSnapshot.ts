import { prisma } from "@/server/db";
import { hasIndividualWithdrawalForEvent } from "@/lib/entryWithdrawalAdminLabel";
import {
  normalizeRoundTabs,
  parseStartListSettings,
  primaryHeatSettingFromEventConfig,
  roundTabToHeatSetting,
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
  computeHeatCountFromMaxLanes,
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
};

/** 手動記録で HEAT を差し替えつつ、既存の次ラウンド以降（進行生成済み）を残す */
function mergeSnapshotPreservingTailRounds(
  previous: unknown,
  next: StartListSnapshotPayload
): StartListSnapshotPayload {
  if (!previous || typeof previous !== "object") return next;
  const p = previous as { events?: SnapshotEvent[] };
  if (!Array.isArray(p.events)) return next;
  const prevById = new Map(p.events.map((e) => [e.eventId, e]));
  const events = next.events.map((ev) => {
    const old = prevById.get(ev.eventId);
    if (!old?.rounds || old.rounds.length <= 1) return ev;
    const [, ...tail] = old.rounds;
    const head = ev.rounds[0];
    if (!head) return ev;
    return { ...ev, rounds: [head, ...tail] };
  });
  return { ...next, events };
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
        OR: [{ totalFee: { lte: 0 } }, { checkoutSessions: { some: { status: "COMPLETED" } } }],
      },
    }),
    prisma.teamEntry.count({ where: { competitionId } }),
  ]);
  return individuals + teams > 0;
}

/**
 * 現在のエントリーとヒート設定からスナップショット用 JSON を組み立てる（DB 書き込みなし）。
 */
export async function buildStartListSnapshotPayload(
  competitionId: string,
  firstRoundGeneratedBy: FirstRoundGeneratedBy
): Promise<StartListSnapshotPayload> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      startListSettings: true,
      events: {
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

  const [entries, teamEntries] = await Promise.all([
    prisma.competitionEntry.findMany({
      where: {
        competitionId,
        status: "SUBMITTED",
        OR: [{ totalFee: { lte: 0 } }, { checkoutSessions: { some: { status: "COMPLETED" } } }],
      },
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
      where: { competitionId },
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
    const fromLanes = computeHeatCountFromMaxLanes(n, event.preliminaryHeatLaneCount);
    const roundTabs = normalizeRoundTabs(eventSettings[event.id] ?? {});
    const firstTab = roundTabs[0];
    const preferAutoLanes =
      fromLanes !== null && (firstTab?.useAutoHeatFromMaxLanes !== false);
    const heatCountRaw = preferAutoLanes
      ? fromLanes!
      : resolveHeatCount(
          n,
          firstTab
            ? roundTabToHeatSetting(firstTab)
            : primaryHeatSettingFromEventConfig(eventSettings[event.id])
        );
    const heatCount = enforceMinHeatCountForMaxLanes(
      n,
      heatCountRaw,
      event.preliminaryHeatLaneCount
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
 */
export async function replaceCompetitionStartListSnapshot(params: {
  competitionId: string;
  createdByUserId?: string;
}): Promise<ReplaceStartListSnapshotResult> {
  const { competitionId, createdByUserId } = params;
  const fresh = await buildStartListSnapshotPayload(competitionId, "RECORD_CAPTURE");
  const existing = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { id: true, data: true },
  });
  const now = new Date();
  const payload = mergeSnapshotPreservingTailRounds(existing?.data, fresh);

  if (existing) {
    await prisma.competitionStartListSnapshot.update({
      where: { competitionId },
      data: {
        data: payload,
        capturedAt: now,
        createdByUserId: createdByUserId ?? null,
      },
    });
    return { ok: true, snapshotId: existing.id, wasUpdate: true };
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
  return { ok: true, snapshotId: created.id, wasUpdate: false };
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
        OR: [{ totalFee: { lte: 0 } }, { checkoutSessions: { some: { status: "COMPLETED" } } }],
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
 * エントリー受付終了後に、成立エントリーが増減したときにスナップショットを現在の状態へ合わせる。
 * - 締切前は何もしない（初回スナップショットは締切後まで作らない運用を維持）
 * - 締切後かつスナップショット行がある → 先頭 HEAT だけ再生成し、次ラ以降は {@link mergeSnapshotPreservingTailRounds} で保持
 * - 締切後かつ行がまだない → {@link createStartListSnapshotIfNeeded}（例: 締切直後は未作成で、初めての遅延エントリーで初回作成）
 */
export async function refreshStartListSnapshotAfterEligibleEntryChange(
  competitionId: string
): Promise<void> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { entryEndDate: true },
  });
  if (!competition) return;

  const now = new Date();
  const afterEntryWindow =
    competition.entryEndDate == null || now >= new Date(competition.entryEndDate);

  if (!afterEntryWindow) {
    return;
  }

  const existing = await prisma.competitionStartListSnapshot.findUnique({
    where: { competitionId },
    select: { id: true },
  });

  if (existing) {
    await replaceCompetitionStartListSnapshot({ competitionId });
    return;
  }

  await createStartListSnapshotIfNeeded({
    competitionId,
    firstRoundGeneratedBy: "ENTRY_CLOSE",
  });
}

/**
 * 初回のみスナップショット行を作成（次ラウンド生成 API などが既存 JSON を更新する前提）。
 * 呼び出し: Cron（`runScheduledStartListSnapshotPass`）、主催・関係者が大会エントリー／スタートリスト関連画面を開いたときの補完。
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

/** エントリー締切済みで未スナップショットの大会に、先頭ラウンド（HEAT）の固定データを作成する */
export async function ensureStartListSnapshotIfEligible(competitionId: string): Promise<boolean> {
  const row = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      entryEndDate: true,
      startListSnapshot: { select: { id: true } },
    },
  });
  if (!row) return false;
  if (row.startListSnapshot) return false;

  const now = new Date();
  if (row.entryEndDate && now < new Date(row.entryEndDate)) {
    return false;
  }

  const r = await createStartListSnapshotIfNeeded({
    competitionId,
    firstRoundGeneratedBy: "ENTRY_CLOSE",
    skipEntryDeadlineGate: true,
    assumeSnapshotAbsent: true,
    entryEndDateForGate: row.entryEndDate,
  });
  return r.captured === true;
}

export const ensureStartListSnapshotAfterDeadline = ensureStartListSnapshotIfEligible;

export type ScheduledStartListSnapshotPassResult = {
  examined: number;
  captured: number;
  skipped: number;
  errors: number;
};

/**
 * Cron 用: `entryEndDate` を過ぎておりスナップショットがない大会だけ処理する。
 */
export async function runScheduledStartListSnapshotPass(): Promise<ScheduledStartListSnapshotPassResult> {
  const now = new Date();
  const pending = await prisma.competition.findMany({
    where: {
      entryEndDate: { not: null, lte: now },
      startListSnapshot: { is: null },
    },
    select: { id: true },
  });

  let captured = 0;
  let skipped = 0;
  let errors = 0;
  for (const row of pending) {
    try {
      const r = await createStartListSnapshotIfNeeded({
        competitionId: row.id,
        firstRoundGeneratedBy: "ENTRY_CLOSE",
      });
      if (r.captured) captured += 1;
      else skipped += 1;
    } catch (e) {
      errors += 1;
      console.error("runScheduledStartListSnapshotPass failed for", row.id, e);
    }
  }

  return {
    examined: pending.length,
    captured,
    skipped,
    errors,
  };
}
