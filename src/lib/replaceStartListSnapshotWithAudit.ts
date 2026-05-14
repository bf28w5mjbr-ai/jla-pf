import type { NextRequest } from "next/server";
import { getRequestContext, logAuditAction } from "@/lib/auditLog";
import {
  replaceCompetitionStartListSnapshot,
  type ReplaceStartListSnapshotResult,
} from "@/lib/startListSnapshot";

/** スナップショット置換と監査ログ（capture API と設定 PUT のインライン capture で共有） */
export async function replaceCompetitionStartListSnapshotWithAudit(
  request: NextRequest,
  params: { competitionId: string; sessionUserId: string | null }
): Promise<ReplaceStartListSnapshotResult> {
  const { competitionId, sessionUserId } = params;
  const result = await replaceCompetitionStartListSnapshot({
    competitionId,
    createdByUserId: sessionUserId ?? undefined,
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
    },
    request: getRequestContext(request),
    result: "SUCCESS",
  });

  return result;
}
