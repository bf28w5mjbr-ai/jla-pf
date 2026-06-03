"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  marshalParticipantKey,
  type HeatMarshalHeatRow,
} from "@/components/HeatMarshalLanePanel";
import type { MarshalResultPayload } from "@/components/MarshalStartListWidgets";
import { postHeatMarshalComplete } from "@/lib/heatMarshalApi";
import { postHeatResultCaptureAppend } from "@/lib/heatResultCaptureApi";
import { toast } from "sonner";
import { isNfcScanSupportedSync, startNfcScanSession } from "@/lib/nfc/nfcScanSession";
import { dispatchJlaDayOpsParticipantStatusChanged } from "@/lib/dayOpsParticipantStatusDisplay";
import type { LiveRoundMarshalContext } from "@/hooks/liveRound/types";
import { resolveTieWithPreviousForNfcAppend } from "@/hooks/liveRound/resultCaptureTieSession";

type ResultCaptureSlice = NonNullable<LiveRoundMarshalContext>["resultCapture"];

export function useLiveRoundNfc(args: {
  eventId: string;
  m: LiveRoundMarshalContext;
  mRef: RefObject<LiveRoundMarshalContext>;
  marshalInline: boolean;
  resultCaptureVisible: boolean;
  resultCapture: ResultCaptureSlice | undefined;
  heatsRef: RefObject<HeatMarshalHeatRow[]>;
  confirmedHeatsRef: RefObject<number[]>;
  resultInputOrder: "asc" | "desc";
  patchLaneCalled: (heatIndex1Based: number, lane: number) => void;
  removeMarshalDraftOp?: (opKey: string, heatIndex: number) => void;
  handleMarshalResult: (r: MarshalResultPayload) => void;
  handleRankRecorded: (payload: {
    heatIndex: number;
    lane: number;
    rank: number;
    participantType: "INDIVIDUAL" | "TEAM";
    competitionEntryId: string | null;
    teamEntryId: string | null;
  }) => void;
  setMarshalPendingKey: (key: string | null) => void;
  setResultCapturePendingKey: (key: string | null) => void;
  tieModeHeatIndexRef: RefObject<number | null>;
  nfcTieSessionStartedByHeatRef: RefObject<Record<number, boolean>>;
}) {
  const {
    eventId,
    m,
    mRef,
    marshalInline,
    resultCaptureVisible,
    resultCapture,
    heatsRef,
    confirmedHeatsRef,
    resultInputOrder,
    patchLaneCalled,
    removeMarshalDraftOp,
    handleMarshalResult,
    handleRankRecorded,
    setMarshalPendingKey,
    setResultCapturePendingKey,
    tieModeHeatIndexRef,
    nfcTieSessionStartedByHeatRef,
  } = args;

  const [nfcMarshalInline, setNfcMarshalInline] = useState<
    "idle" | "listening" | "unsupported" | "error"
  >("idle");
  const [nfcResultInline, setNfcResultInline] = useState<
    "idle" | "listening" | "unsupported" | "error"
  >("idle");

  const skipPassiveNfcRef = useRef(false);
  const skipPassiveResultNfcRef = useRef(false);
  const marshalNfcAbortRef = useRef<AbortController | null>(null);
  const marshalNfcInFlightRef = useRef(false);
  const resultNfcAbortRef = useRef<AbortController | null>(null);
  const resultNfcInFlightRef = useRef(false);

  const stopMarshalNfcInline = useCallback(() => {
    marshalNfcAbortRef.current?.abort();
    marshalNfcAbortRef.current = null;
  }, []);

  const processMarshalNfcTag = useCallback(
    async (serial: string) => {
      const mm = mRef.current;
      if (
        !mm ||
        mm.marshalUiMode !== "inline" ||
        mm.loading ||
        mm.marshalOpsBlocked ||
        mm.marshalRoundMismatch ||
        mm.isCallClosed
      ) {
        return;
      }
      if (marshalNfcInFlightRef.current) return;

      const openHeats = [...heatsRef.current]
        .filter((h) => !h.callClosedAt)
        .sort((a, b) => a.heatIndex - b.heatIndex);
      if (openHeats.length === 0) return;

      marshalNfcInFlightRef.current = true;
      setMarshalPendingKey("nfc-auto");
      let lastMsg = "";
      try {
        for (const h of openHeats) {
          try {
            const data = await postHeatMarshalComplete(mm.competitionId, {
              mode: "nfc",
              eventId,
              round: mm.round,
              heatIndex: h.heatIndex,
              nfcTagId: serial,
            });
            const lane = Number(data.lane);
            if (Number.isFinite(lane)) {
              patchLaneCalled(h.heatIndex, lane);
              const participant = h.participants.find((p) => p.lane === lane);
              if (participant) {
                removeMarshalDraftOp?.(marshalParticipantKey(participant), h.heatIndex);
              }
            }
            handleMarshalResult({
              lane,
              label: String(data.label ?? ""),
              clubName: typeof data.clubName === "string" ? data.clubName : null,
              alreadyMarshalled: Boolean(data.alreadyMarshalled),
            });
            if (data.alreadyMarshalled) {
              toast.info("すでに召集済みです");
            } else {
              toast.success("NFCでマーシャル記録しました");
            }
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastMsg = msg;
            if (
              msg.includes("このヒートの参加者ではありません") ||
              msg.includes("召集締切済みのためマーシャル完了できません")
            ) {
              continue;
            }
            toast.error(msg);
            return;
          }
        }
        if (lastMsg) toast.error(lastMsg);
      } finally {
        marshalNfcInFlightRef.current = false;
        setMarshalPendingKey(null);
      }
    },
    [
      eventId,
      handleMarshalResult,
      patchLaneCalled,
      removeMarshalDraftOp,
      mRef,
      heatsRef,
      setMarshalPendingKey,
    ]
  );

  const stopResultNfcInline = useCallback(() => {
    resultNfcAbortRef.current?.abort();
    resultNfcAbortRef.current = null;
  }, []);

  const processResultNfcTag = useCallback(
    async (serial: string) => {
      const mm = mRef.current;
      const rc = mm?.resultCapture;
      if (
        !mm ||
        mm.marshalUiMode !== "result" ||
        !rc ||
        rc.loading ||
        rc.locked ||
        mm.marshalOpsBlocked ||
        mm.marshalRoundMismatch ||
        mm.loading
      ) {
        return;
      }
      if (resultNfcInFlightRef.current) return;

      const confirmedSet = new Set(confirmedHeatsRef.current);
      const candidateHeats = [...heatsRef.current]
        .filter((h) => !confirmedSet.has(h.heatIndex) && Boolean(h.callClosedAt))
        .sort((a, b) => a.heatIndex - b.heatIndex);
      if (candidateHeats.length === 0) return;

      resultNfcInFlightRef.current = true;
      setResultCapturePendingKey("nfc-result-auto");
      let lastMsg = "";
      try {
        for (const h of candidateHeats) {
          try {
            const tieModeOn = tieModeHeatIndexRef.current === h.heatIndex;
            const nfcTieSessionStarted = Boolean(
              nfcTieSessionStartedByHeatRef.current[h.heatIndex]
            );
            const tieWithPrevious = resolveTieWithPreviousForNfcAppend({
              tieModeOn,
              heatIndex: h.heatIndex,
              nfcTieSessionStarted,
            });
            const data = await postHeatResultCaptureAppend(mm.competitionId, {
              mode: "nfc",
              eventId,
              round: mm.round,
              heatIndex: h.heatIndex,
              nfcTagId: serial,
              tieWithPrevious,
              inputOrder: resultInputOrder,
            });
            if (tieModeOn) {
              nfcTieSessionStartedByHeatRef.current[h.heatIndex] = true;
            }
            handleRankRecorded({
              heatIndex: h.heatIndex,
              lane: data.lane,
              rank: data.rank,
              participantType: data.participantType,
              competitionEntryId: data.competitionEntryId,
              teamEntryId: data.teamEntryId,
            });
            toast.success(`NFCで着順 ${data.rank} 位を記録しました（ヒート ${h.heatIndex}）`);
            dispatchJlaDayOpsParticipantStatusChanged(mm.competitionId, eventId);
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastMsg = msg;
            if (
              msg.includes("このヒートの参加者ではありません") ||
              msg.includes("スタートリストに該当ヒートがありません")
            ) {
              continue;
            }
            if (msg.includes("すでに順位が記録")) {
              toast.info(msg);
              return;
            }
            if (msg.includes("このヒートのリザルトは確定済み")) {
              continue;
            }
            if (msg.includes("マーシャル（召集チェック）が完了していない")) {
              continue;
            }
            if (
              msg.includes("公式結果が確定済みのため記録できません") ||
              msg.includes("先にスタートリストで")
            ) {
              toast.error(msg);
              return;
            }
            toast.error(msg);
            return;
          }
        }
        if (lastMsg) toast.error(lastMsg);
      } finally {
        resultNfcInFlightRef.current = false;
        setResultCapturePendingKey(null);
      }
    },
    [
      eventId,
      handleRankRecorded,
      resultInputOrder,
      mRef,
      heatsRef,
      confirmedHeatsRef,
      setResultCapturePendingKey,
      tieModeHeatIndexRef,
      nfcTieSessionStartedByHeatRef,
    ]
  );

  const startResultNfcInline = useCallback(() => {
    const mm = mRef.current;
    const rc = mm?.resultCapture;
    if (
      !mm ||
      mm.marshalUiMode !== "result" ||
      !rc ||
      rc.loading ||
      rc.locked ||
      mm.marshalOpsBlocked ||
      mm.marshalRoundMismatch ||
      mm.loading
    ) {
      stopResultNfcInline();
      setNfcResultInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      stopResultNfcInline();
      setNfcResultInline("unsupported");
      return;
    }
    stopResultNfcInline();
    const ac = new AbortController();
    resultNfcAbortRef.current = ac;
    setNfcResultInline("idle");
    void (async () => {
      try {
        await startNfcScanSession(
          {
            signal: ac.signal,
            iosSessionType: "tag",
            invalidateAfterFirstRead: false,
            alertMessage: "NFCタグをかざしてリザルト記録",
          },
          (tag) => {
            void processResultNfcTag(tag);
          }
        );
        if (!ac.signal.aborted) {
          setNfcResultInline("listening");
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setNfcResultInline("error");
        if (e instanceof Error && e.message.includes("対応していません")) {
          setNfcResultInline("unsupported");
        }
      }
    })();
  }, [processResultNfcTag, stopResultNfcInline, mRef]);

  const startMarshalNfcInline = useCallback(() => {
    const mm = mRef.current;
    if (
      !mm ||
      mm.marshalUiMode !== "inline" ||
      mm.loading ||
      mm.marshalOpsBlocked ||
      mm.marshalRoundMismatch ||
      mm.isCallClosed
    ) {
      stopMarshalNfcInline();
      setNfcMarshalInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      stopMarshalNfcInline();
      setNfcMarshalInline("unsupported");
      return;
    }
    stopMarshalNfcInline();
    const ac = new AbortController();
    marshalNfcAbortRef.current = ac;
    setNfcMarshalInline("idle");
    void (async () => {
      try {
        await startNfcScanSession(
          {
            signal: ac.signal,
            iosSessionType: "tag",
            invalidateAfterFirstRead: false,
            alertMessage: "NFCタグをかざしてマーシャル記録",
          },
          (tag) => {
            void processMarshalNfcTag(tag);
          }
        );
        if (!ac.signal.aborted) {
          setNfcMarshalInline("listening");
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setNfcMarshalInline("error");
        if (e instanceof Error && e.message.includes("対応していません")) {
          setNfcMarshalInline("unsupported");
        }
      }
    })();
  }, [processMarshalNfcTag, stopMarshalNfcInline, mRef]);

  useEffect(() => {
    const onArm = () => {
      skipPassiveNfcRef.current = true;
      startMarshalNfcInline();
    };
    window.addEventListener("jla-marshal-nfc-arm", onArm);
    return () => window.removeEventListener("jla-marshal-nfc-arm", onArm);
  }, [startMarshalNfcInline]);

  useEffect(() => {
    if (
      !marshalInline ||
      !m ||
      m.loading ||
      m.marshalOpsBlocked ||
      m.marshalRoundMismatch ||
      m.isCallClosed
    ) {
      stopMarshalNfcInline();
      setNfcMarshalInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      setNfcMarshalInline("unsupported");
      return;
    }
    if (skipPassiveNfcRef.current) {
      skipPassiveNfcRef.current = false;
      return;
    }
    startMarshalNfcInline();
    return () => {
      stopMarshalNfcInline();
      setNfcMarshalInline("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    marshalInline,
    m?.competitionId,
    m?.round,
    eventId,
    m?.loading,
    m?.marshalOpsBlocked,
    m?.marshalRoundMismatch,
    m?.isCallClosed,
    startMarshalNfcInline,
    stopMarshalNfcInline,
  ]);

  useEffect(() => {
    const onArm = () => {
      skipPassiveResultNfcRef.current = true;
      startResultNfcInline();
    };
    window.addEventListener("jla-result-nfc-arm", onArm);
    return () => window.removeEventListener("jla-result-nfc-arm", onArm);
  }, [startResultNfcInline]);

  useEffect(() => {
    if (
      !resultCaptureVisible ||
      !m ||
      !resultCapture ||
      m.loading ||
      resultCapture.loading ||
      resultCapture.locked ||
      m.marshalOpsBlocked ||
      m.marshalRoundMismatch
    ) {
      stopResultNfcInline();
      setNfcResultInline("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      setNfcResultInline("unsupported");
      return;
    }
    if (skipPassiveResultNfcRef.current) {
      skipPassiveResultNfcRef.current = false;
      return;
    }
    startResultNfcInline();
    return () => {
      stopResultNfcInline();
      setNfcResultInline("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resultCaptureVisible,
    m?.competitionId,
    m?.round,
    eventId,
    m?.loading,
    m?.marshalOpsBlocked,
    m?.marshalRoundMismatch,
    resultCapture?.locked,
    resultCapture?.loading,
    startResultNfcInline,
    stopResultNfcInline,
  ]);

  return {
    nfcMarshalInline,
    nfcResultInline,
  };
}
