"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resolveStartListPeriodicSyncIntervalSec } from "@/lib/startListPeriodicSync";

type Args = {
  competitionId: string;
  /** false のときポーリングしない */
  enabled?: boolean;
  /** true のとき refresh 前に sync-if-needed API を呼ぶ */
  snapshotSync?: boolean;
  intervalSec?: number | null;
};

/** 大会スタートリスト全体: スナップショット同期（任意）＋ router.refresh */
export function useStartListPeriodicSync({
  competitionId,
  enabled = true,
  snapshotSync = true,
  intervalSec,
}: Args) {
  const router = useRouter();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !competitionId) return;

    const ms = resolveStartListPeriodicSyncIntervalSec(intervalSec) * 1000;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (snapshotSync) {
          await fetch(
            `/api/competitions/${encodeURIComponent(competitionId)}/start-list-snapshot/sync-if-needed`,
            { method: "POST", credentials: "same-origin" }
          ).catch(() => undefined);
        }
        router.refresh();
      } finally {
        inFlightRef.current = false;
      }
    };

    const id = window.setInterval(() => void tick(), ms);
    return () => window.clearInterval(id);
  }, [competitionId, enabled, snapshotSync, intervalSec, router]);
}
