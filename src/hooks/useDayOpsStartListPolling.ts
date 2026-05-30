"use client";

import { useEffect } from "react";
import { JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED } from "@/lib/dayOpsParticipantStatusDisplay";

const DAY_OPS_POLL_INTERVAL_NORMAL_MS = 20_000;
const DAY_OPS_POLL_INTERVAL_SYNC_MS = 6_000;

type Args = {
  enabled: boolean;
  competitionId: string;
  eventId: string;
  /** いずれかのタブがマーシャル/リザルトモードのときは同期間隔を短くする */
  dayOpsListsSyncActive: boolean;
  refreshParticipantStatuses: () => void | Promise<void>;
  refreshMarshalAndResultLists: (opts?: { skipMarshalHeat?: boolean }) => void;
};

/** 当日運用のポーリング・visibility・SSE・カスタムイベント同期 */
export function useDayOpsStartListPolling({
  enabled,
  competitionId,
  eventId,
  dayOpsListsSyncActive,
  refreshParticipantStatuses,
  refreshMarshalAndResultLists,
}: Args) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refreshParticipantStatuses();
      refreshMarshalAndResultLists();
    };
    const intervalMs = dayOpsListsSyncActive
      ? DAY_OPS_POLL_INTERVAL_SYNC_MS
      : DAY_OPS_POLL_INTERVAL_NORMAL_MS;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [
    enabled,
    dayOpsListsSyncActive,
    refreshParticipantStatuses,
    refreshMarshalAndResultLists,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      void refreshParticipantStatuses();
      refreshMarshalAndResultLists();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, refreshParticipantStatuses, refreshMarshalAndResultLists]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (ev: Event) => {
      const d = (
        ev as CustomEvent<{
          competitionId?: string;
          eventId?: string;
          skipMarshalHeatRefetch?: boolean;
        }>
      ).detail;
      if (d?.competitionId === competitionId && d?.eventId === eventId) {
        void refreshParticipantStatuses();
        refreshMarshalAndResultLists(
          d.skipMarshalHeatRefetch ? { skipMarshalHeat: true } : undefined
        );
      }
    };
    window.addEventListener(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, handler);
    return () => window.removeEventListener(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, handler);
  }, [
    enabled,
    competitionId,
    eventId,
    refreshParticipantStatuses,
    refreshMarshalAndResultLists,
  ]);

  useEffect(() => {
    if (!enabled || process.env.NEXT_PUBLIC_DAY_OPS_LIVE_STREAM !== "1") return;
    const url = `/api/competitions/${competitionId}/day-ops/live-events?eventId=${encodeURIComponent(eventId)}`;
    const es = new EventSource(url, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "changes") {
          void refreshParticipantStatuses();
          refreshMarshalAndResultLists();
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      es.close();
    };
  }, [
    enabled,
    competitionId,
    eventId,
    refreshParticipantStatuses,
    refreshMarshalAndResultLists,
  ]);
}
