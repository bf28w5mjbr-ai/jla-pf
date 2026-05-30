"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  parseStartListRefreshMeta,
  shouldRefreshStartListPage,
  type StartListRefreshMeta,
} from "@/lib/startListRefreshMeta";
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
  const lastMetaRef = useRef<StartListRefreshMeta | null>(null);

  useEffect(() => {
    if (!enabled || !competitionId) return;

    const ms = resolveStartListPeriodicSyncIntervalSec(intervalSec) * 1000;

    let cancelled = false;
    let timerId: number | undefined;

    const scheduleNext = () => {
      if (cancelled) return;
      timerId = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        scheduleNext();
        return;
      }
      if (inFlightRef.current) {
        scheduleNext();
        return;
      }
      inFlightRef.current = true;
      try {
        if (snapshotSync) {
          void fetch(
            `/api/competitions/${encodeURIComponent(competitionId)}/start-list-snapshot/sync-if-needed`,
            { method: "POST", credentials: "same-origin" }
          ).catch(() => undefined);
          router.refresh();
        } else {
          const res = await fetch(
            `/api/competitions/${encodeURIComponent(competitionId)}/start-list-snapshot/meta`,
            { credentials: "same-origin" }
          ).catch(() => null);
          if (res?.ok) {
            const nextMeta = parseStartListRefreshMeta(await res.json());
            if (shouldRefreshStartListPage(lastMetaRef.current, nextMeta)) {
              router.refresh();
            }
            lastMetaRef.current = nextMeta;
          }
        }
      } finally {
        inFlightRef.current = false;
        scheduleNext();
      }
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [competitionId, enabled, snapshotSync, intervalSec, router]);
}
