"use client";

import { useCallback, useEffect, useRef } from "react";
import { JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED } from "@/lib/dayOpsParticipantStatusDisplay";
import { dayOpsFetch } from "@/lib/dayOpsFetch";

const DAY_OPS_POLL_INTERVAL_NORMAL_MS = 20_000;
const DAY_OPS_POLL_INTERVAL_FALLBACK_MS = 60_000;

type RefreshOpts = {
  skipMarshalHeat?: boolean;
  skipResultCapture?: boolean;
  skipParticipantPoll?: boolean;
  /** true のとき heat-marshal / heat-result-capture を省略し draft pull のみ */
  draftOnly?: boolean;
};

type Args = {
  enabled: boolean;
  competitionId: string;
  eventId: string;
  /** いずれかのタブがマーシャル/リザルトモードのときは同期間隔を短くする */
  dayOpsListsSyncActive: boolean;
  refreshDayOpsListsFromPoll: (opts?: RefreshOpts) => void;
};

async function fetchDayOpsLiveFingerprint(
  competitionId: string,
  eventId: string
): Promise<string | null> {
  try {
    const res = await dayOpsFetch(
      `/api/competitions/${competitionId}/day-ops/live-fingerprint?eventId=${encodeURIComponent(eventId)}`
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { fingerprint?: unknown };
    return typeof data.fingerprint === "string" ? data.fingerprint : null;
  } catch {
    return null;
  }
}

/** 当日運用のポーリング・visibility・SSE・カスタムイベント同期 */
export function useDayOpsStartListPolling({
  enabled,
  competitionId,
  eventId,
  dayOpsListsSyncActive,
  refreshDayOpsListsFromPoll,
}: Args) {
  const lastFingerprintRef = useRef<string | null>(null);
  const sseConnectedRef = useRef(false);
  const refreshRef = useRef(refreshDayOpsListsFromPoll);
  refreshRef.current = refreshDayOpsListsFromPoll;

  useEffect(() => {
    lastFingerprintRef.current = null;
  }, [competitionId, eventId]);

  /** ページ復帰直後に fingerprint 待ちせず draft pull を 1 回走らせる */
  useEffect(() => {
    if (!enabled) return;
    refreshRef.current({ draftOnly: true });
  }, [enabled, competitionId, eventId]);

  const refreshIfFingerprintChanged = useCallback(async () => {
    const fp = await fetchDayOpsLiveFingerprint(competitionId, eventId);
    if (fp == null) return;
    if (lastFingerprintRef.current === fp) return;
    lastFingerprintRef.current = fp;
    refreshRef.current();
  }, [competitionId, eventId]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (sseConnectedRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refreshIfFingerprintChanged();
    };
    const intervalMs = dayOpsListsSyncActive
      ? DAY_OPS_POLL_INTERVAL_FALLBACK_MS
      : DAY_OPS_POLL_INTERVAL_NORMAL_MS;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, dayOpsListsSyncActive, refreshIfFingerprintChanged]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      void refreshIfFingerprintChanged();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, refreshIfFingerprintChanged]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (ev: Event) => {
      const d = (
        ev as CustomEvent<{
          competitionId?: string;
          eventId?: string;
          skipMarshalHeatRefetch?: boolean;
          skipResultCaptureRefetch?: boolean;
          skipParticipantPoll?: boolean;
        }>
      ).detail;
      if (d?.competitionId === competitionId && d?.eventId === eventId) {
        lastFingerprintRef.current = null;
        refreshRef.current({
          ...(d.skipMarshalHeatRefetch ? { skipMarshalHeat: true } : {}),
          ...(d.skipResultCaptureRefetch ? { skipResultCapture: true } : {}),
          ...(d.skipParticipantPoll ? { skipParticipantPoll: true } : {}),
        });
      }
    };
    window.addEventListener(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, handler);
    return () => window.removeEventListener(JLA_DAY_OPS_PARTICIPANT_STATUS_CHANGED, handler);
  }, [enabled, competitionId, eventId]);

  useEffect(() => {
    if (!enabled || process.env.NEXT_PUBLIC_DAY_OPS_LIVE_STREAM !== "1") return;
    const url = `/api/competitions/${competitionId}/day-ops/live-events?eventId=${encodeURIComponent(eventId)}`;
    const es = new EventSource(url, { withCredentials: true });
    es.onopen = () => {
      sseConnectedRef.current = true;
    };
    es.onerror = () => {
      sseConnectedRef.current = false;
    };
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string; fingerprint?: string };
        if (msg.type === "hello") {
          sseConnectedRef.current = true;
          return;
        }
        if (msg.type === "changes") {
          sseConnectedRef.current = true;
          if (typeof msg.fingerprint === "string") {
            lastFingerprintRef.current = msg.fingerprint;
          } else {
            lastFingerprintRef.current = null;
          }
          refreshRef.current({
            skipMarshalHeat: true,
            skipResultCapture: true,
            draftOnly: true,
          });
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      sseConnectedRef.current = false;
      es.close();
    };
  }, [enabled, competitionId, eventId]);
}
