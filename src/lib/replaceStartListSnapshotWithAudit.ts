import type { NextRequest } from "next/server";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import {
  replaceCompetitionStartListSnapshot,
  type ReplaceStartListSnapshotResult,
} from "@/lib/startListSnapshot";

/** スナップショット置換と監査ログ（capture API と設定 PUT のインライン capture で共有） */
export async function replaceCompetitionStartListSnapshotWithAudit(
  request: NextRequest,
  params: {
    competitionId: string;
    sessionUserId: string | null;
    /**
     * 省略時は全会場フル再計算（手動 capture API）。
     * 配列を渡すとその種目のヒート分割変化に応じて部分再計算またはスキップする。
     */
    onlyRebuildEventIds?: readonly string[];
  }
): Promise<ReplaceStartListSnapshotResult> {
  const { competitionId, sessionUserId, onlyRebuildEventIds } = params;
  const result = await replaceCompetitionStartListSnapshot({
    competitionId,
    createdByUserId: sessionUserId ?? undefined,
    ...(onlyRebuildEventIds !== undefined ? { onlyRebuildEventIds } : {}),
  });

  await logAuditAction({
    action: "COMPETITION_START_LIST_SNAPSHOT_CAPTURE",
    actorType: sessionUserId ? "USER" : "SYSTEM",
    actorKey: sessionUserId ? `user:${sessionUserId}` : "dayops:unlock",
    actorUserId: sessionUserId ?? undefined,
    targetType: "CompetitionStartListSnapshot",
    targetId: result.snapshotId,
    targetKey: `competition:${competitionId}`,
    metadata: {
      competitionId,
      wasUpdate: result.wasUpdate,
      snapshotSkipped: result.skipped ?? false,
      partialSnapshotRebuild: result.partialRebuild ?? false,
    },
    request: getRequestContext(request),
    result: "SUCCESS",
  });

  return result;
}
