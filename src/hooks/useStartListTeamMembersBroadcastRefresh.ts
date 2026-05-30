"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeStartListTeamMembersChanged } from "@/lib/startListTeamMembersBroadcast";

/** 同一ブラウザの別タブでメンバー割当が保存されたとき、スタートリストを即時 refresh する */
export function useStartListTeamMembersBroadcastRefresh(competitionId: string, enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !competitionId) return;
    return subscribeStartListTeamMembersChanged(competitionId, () => {
      router.refresh();
    });
  }, [competitionId, enabled, router]);
}
