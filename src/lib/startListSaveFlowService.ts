import type { NextRequest } from "next/server";
import type { HeatSetting } from "@/lib/startListSettings";
import { eventIdsWhereHeatPlanSplitChanged } from "@/lib/startListSnapshot";
import { replaceCompetitionStartListSnapshotWithAudit } from "@/lib/replaceStartListSnapshotWithAudit";

export type SnapshotCapturePayload =
  | {
      ok: true;
      snapshotId: string;
      wasUpdate: boolean;
      skipped?: boolean;
      partialRebuild?: boolean;
      tailInvalidated?: boolean;
      tailInvalidatedMessage?: string;
    }
  | { ok: false; error: string };

type RunSnapshotCaptureForSettingsArgs = {
  request: NextRequest;
  competitionId: string;
  sessionUserId: string | null;
  shouldCaptureSnapshot: boolean;
  orderedEventIds: string[];
  previousEventSettings: Record<string, HeatSetting | undefined>;
  nextEventSettings: Record<string, HeatSetting | undefined>;
};

/**
 * 設定保存後のスナップショット更新を共通化する。
 * 変更がある種目だけ部分再計算し、失敗時は「設定保存は成功」を維持してエラー情報だけ返す。
 */
export async function runSnapshotCaptureForSettings(
  args: RunSnapshotCaptureForSettingsArgs
): Promise<SnapshotCapturePayload | undefined> {
  const {
    request,
    competitionId,
    sessionUserId,
    shouldCaptureSnapshot,
    orderedEventIds,
    previousEventSettings,
    nextEventSettings,
  } = args;
  if (!shouldCaptureSnapshot) {
    return undefined;
  }

  const heatPlanChangedIds = eventIdsWhereHeatPlanSplitChanged({
    orderedEventIds,
    previous: previousEventSettings,
    next: nextEventSettings,
  });
  try {
    const snap = await replaceCompetitionStartListSnapshotWithAudit(request, {
      competitionId,
      sessionUserId,
      onlyRebuildEventIds: heatPlanChangedIds,
    });
    const tailInvalidated = Boolean(snap.droppedResultBasedTail?.length);
    return {
      ok: true,
      snapshotId: snap.snapshotId,
      wasUpdate: snap.wasUpdate,
      skipped: snap.skipped,
      partialRebuild: snap.partialRebuild,
      ...(tailInvalidated
        ? {
            tailInvalidated: true,
            tailInvalidatedMessage:
              "先頭ラウンドの記録を更新したため、前ラ結果に基づく次ラウンド記録を削除しました。",
          }
        : {}),
    };
  } catch (snapErr) {
    return {
      ok: false,
      error:
        snapErr instanceof Error
          ? snapErr.message
          : "スタートリスト記録の更新に失敗しました（設定は保存済みです）。",
    };
  }
}

export type RoundSetupConfirmableEvent = {
  id: string;
  startListHeatPlanConfirmedAt: Date | null;
};

/**
 * 一括保存時にステップ1確定対象とする eventId を解決する。
 * `requestedIds` が有効ならそれを優先、未指定時は「未確定かつマーシャル締切前」の dirty items を対象にする。
 */
export function resolveRoundSetupConfirmEventIds(args: {
  requestedIds: unknown;
  itemsEventIds: string[];
  allEventIds: Set<string>;
  eventsById: Map<string, RoundSetupConfirmableEvent>;
  marshalCallClosedEventIds?: ReadonlySet<string>;
}): string[] {
  const { requestedIds, itemsEventIds, allEventIds, eventsById, marshalCallClosedEventIds } =
    args;
  const isMarshalLocked = (id: string) => marshalCallClosedEventIds?.has(id) ?? false;
  if (Array.isArray(requestedIds) && requestedIds.length > 0) {
    return requestedIds.filter(
      (id): id is string => typeof id === "string" && allEventIds.has(id)
    );
  }
  return itemsEventIds.filter((id) => {
    const ev = eventsById.get(id);
    return Boolean(ev && !ev.startListHeatPlanConfirmedAt && !isMarshalLocked(id));
  });
}
