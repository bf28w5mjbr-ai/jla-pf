"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  dayOpsParticipantStatusLabelJa,
  isDayOpsTerminalParticipantStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { isCalledLikeStatus } from "@/lib/dayOpsTeamStatus";
import { postHeatMarshalComplete, postParticipantStatusesBulk } from "@/lib/heatMarshalApi";
import { isNfcScanSupportedSync, startNfcScanSession } from "@/lib/nfc/nfcScanSession";
import { cn } from "@/lib/utils";
import {
  marshalIndividualKey,
  marshalTeamLegacyKey,
  marshalTeamMemberKey,
} from "@/lib/dayOpsParticipantKeys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type HeatMarshalParticipant = {
  lane: number;
  participantType: "INDIVIDUAL" | "TEAM";
  competitionEntryId?: string | null;
  teamEntryId?: string | null;
  /** チーム種目の構成員（メンバー未割当時は null） */
  teamMemberUserId?: string | null;
  label: string;
  clubName: string | null;
  status: string;
};

export type HeatMarshalHeatRow = {
  heatIndex: number;
  callClosedAt: string | null;
  /** 公式リザルトがあるため締切解除不可（API の heat-marshal GET） */
  marshalReopenBlocked?: boolean;
  participants: HeatMarshalParticipant[];
};

type MarshalRoundKey = "HEAT" | "SEMI" | "FINAL";

export function marshalParticipantKey(p: HeatMarshalParticipant) {
  if (p.participantType === "INDIVIDUAL") {
    return marshalIndividualKey(String(p.competitionEntryId));
  }
  if (p.teamMemberUserId) {
    return marshalTeamMemberKey(String(p.teamEntryId), p.teamMemberUserId);
  }
  return marshalTeamLegacyKey(String(p.teamEntryId));
}

type Props = {
  competitionId: string;
  eventId: string;
  marshalRound: MarshalRoundKey;
  heat: HeatMarshalHeatRow;
  /** ヒート・レーン未確定など */
  marshalOpsBlocked: boolean;
  /** 種目全体の召集締切 */
  isCallClosed: boolean;
  /** サーバー再取得（親の heat 更新） */
  onSuccess?: () => void | Promise<void>;
  /** コンパクト表示（ヒート表内） */
  compact?: boolean;
};

export function HeatMarshalLanePanel({
  competitionId,
  eventId,
  marshalRound,
  heat,
  marshalOpsBlocked,
  isCallClosed,
  onSuccess,
  compact = false,
}: Props) {
  const marshalDialogBlocked = marshalOpsBlocked || isCallClosed;
  const marshalBlockedRef = useRef(marshalDialogBlocked);
  marshalBlockedRef.current = marshalDialogBlocked;
  const [participants, setParticipants] = useState<HeatMarshalParticipant[]>(heat.participants);
  const [marshalPendingKey, setMarshalPendingKey] = useState<string | null>(null);
  const [marshalDraftOps, setMarshalDraftOps] = useState<
    Record<
      string,
      {
        opKey: string;
        eventId: string;
        round: MarshalRoundKey;
        heatIndex: number;
        participantType: "INDIVIDUAL" | "TEAM";
        competitionEntryId?: string;
        teamEntryId?: string;
        teamMemberUserId?: string | null;
        status: "CALLED" | "PENDING";
      }
    >
  >({});
  const [marshalDraftErrors, setMarshalDraftErrors] = useState<Record<string, string>>({});
  const [marshalBulkSubmitting, setMarshalBulkSubmitting] = useState(false);
  const [nfcDialogStatus, setNfcDialogStatus] = useState<
    "idle" | "listening" | "unsupported" | "error"
  >("idle");
  const marshalDialogNfcAbortRef = useRef<AbortController | null>(null);
  const [marshalResult, setMarshalResult] = useState<{
    lane: number;
    label: string;
    clubName: string | null;
    alreadyMarshalled: boolean;
  } | null>(null);

  useEffect(() => {
    setParticipants(heat.participants);
    setMarshalDraftOps({});
    setMarshalDraftErrors({});
  }, [heat]);

  const applyMarshalResponse = useCallback((data: { lane?: unknown }) => {
    const lane = Number(data.lane);
    if (!Number.isFinite(lane)) return;
    setParticipants((prev) =>
      prev.map((p) => (p.lane === lane ? { ...p, status: "CALLED" } : p))
    );
  }, []);

  const applyPendingResponse = useCallback((lane: number) => {
    if (!Number.isFinite(lane)) return;
    setParticipants((prev) => prev.map((p) => (p.lane === lane ? { ...p, status: "PENDING" } : p)));
  }, []);

  const runHeatMarshalComplete = useCallback(
    async (payload: {
      mode: "nfc" | "manual";
      heatIndex: number;
      nfcTagId?: string;
      participant?: HeatMarshalParticipant;
    }) => {
      const body =
        payload.mode === "nfc"
          ? {
              mode: "nfc" as const,
              eventId,
              round: marshalRound,
              heatIndex: payload.heatIndex,
              nfcTagId: payload.nfcTagId ?? "",
            }
          : {
              mode: "manual" as const,
              eventId,
              round: marshalRound,
              heatIndex: payload.heatIndex,
              participantType: payload.participant!.participantType,
              competitionEntryId:
                payload.participant!.participantType === "INDIVIDUAL"
                  ? payload.participant!.competitionEntryId ?? undefined
                  : undefined,
              teamEntryId:
                payload.participant!.participantType === "TEAM"
                  ? payload.participant!.teamEntryId ?? undefined
                  : undefined,
              teamMemberUserId:
                payload.participant!.participantType === "TEAM"
                  ? payload.participant!.teamMemberUserId ?? undefined
                  : undefined,
            };
      const data = await postHeatMarshalComplete(competitionId, body);
      applyMarshalResponse(data);
      setMarshalResult({
        lane: Number(data.lane),
        label: String(data.label ?? ""),
        clubName: typeof data.clubName === "string" ? data.clubName : null,
        alreadyMarshalled: Boolean(data.alreadyMarshalled),
      });
      await onSuccess?.();
    },
    [applyMarshalResponse, competitionId, eventId, marshalRound, onSuccess]
  );

  const queueMarshalDraftToggle = useCallback(
    (p: HeatMarshalParticipant, targetStatus: "CALLED" | "PENDING") => {
      const pKey = marshalParticipantKey(p);
      setMarshalDraftErrors((prev) => {
        if (!prev[pKey]) return prev;
        const next = { ...prev };
        delete next[pKey];
        return next;
      });
      if (targetStatus === "CALLED") {
        applyMarshalResponse({ lane: p.lane });
      } else {
        applyPendingResponse(p.lane);
      }
      setMarshalDraftOps((prev) => ({
        ...prev,
        [pKey]: {
          opKey: pKey,
          eventId,
          round: marshalRound,
          heatIndex: heat.heatIndex,
          participantType: p.participantType,
          ...(p.participantType === "INDIVIDUAL"
            ? { competitionEntryId: p.competitionEntryId ?? undefined }
            : { teamEntryId: p.teamEntryId ?? undefined, teamMemberUserId: p.teamMemberUserId ?? null }),
          status: targetStatus,
        },
      }));
    },
    [applyMarshalResponse, applyPendingResponse, eventId, heat.heatIndex, marshalRound]
  );

  const submitMarshalDraftOps = useCallback(async () => {
    const operations = Object.values(marshalDraftOps);
    if (operations.length === 0) return;
    setMarshalBulkSubmitting(true);
    try {
      const result = await postParticipantStatusesBulk(competitionId, operations);
      const failedMap: Record<string, string> = {};
      for (const f of result.failed) failedMap[f.opKey] = f.error;
      setMarshalDraftErrors(failedMap);
      setMarshalDraftOps((prev) => {
        if (result.failed.length === 0) return {};
        const next: typeof prev = {};
        for (const f of result.failed) {
          if (prev[f.opKey]) next[f.opKey] = prev[f.opKey];
        }
        return next;
      });
      if (result.success.length > 0) toast.success(`${result.success.length}件を確定しました`);
      if (result.failed.length > 0) toast.error(`${result.failed.length}件の確定に失敗しました`);
      await onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "一括確定に失敗しました");
      await onSuccess?.();
    } finally {
      setMarshalBulkSubmitting(false);
    }
  }, [competitionId, marshalDraftOps, onSuccess]);

  useEffect(() => {
    if (marshalDialogBlocked) {
      marshalDialogNfcAbortRef.current?.abort();
      marshalDialogNfcAbortRef.current = null;
      setNfcDialogStatus("idle");
      return;
    }
    if (!isNfcScanSupportedSync()) {
      setNfcDialogStatus("unsupported");
      return;
    }
    marshalDialogNfcAbortRef.current?.abort();
    const ac = new AbortController();
    marshalDialogNfcAbortRef.current = ac;
    setNfcDialogStatus("idle");
    const heatIndex = heat.heatIndex;
    void (async () => {
      try {
        await startNfcScanSession(
          {
            signal: ac.signal,
            iosSessionType: "tag",
            invalidateAfterFirstRead: false,
            alertMessage: "NFCタグをかざしてマーシャル記録",
          },
          (serial) => {
            void (async () => {
              if (marshalBlockedRef.current) return;
              if (Object.keys(marshalDraftOps).length > 0) {
                toast.error("未確定チェックがあります。先に「確定」で反映してください");
                return;
              }
              if (!serial.trim()) {
                toast.error("タグIDを読み取れませんでした");
                return;
              }
              setMarshalPendingKey("nfc-auto");
              try {
                await runHeatMarshalComplete({
                  mode: "nfc",
                  heatIndex,
                  nfcTagId: serial,
                });
                toast.success("NFCでマーシャル記録しました");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "NFCマーシャルに失敗しました");
              } finally {
                setMarshalPendingKey(null);
              }
            })();
          }
        );
        if (!ac.signal.aborted) {
          setNfcDialogStatus("listening");
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setNfcDialogStatus("error");
        if (e instanceof Error && e.message.includes("対応していません")) {
          setNfcDialogStatus("unsupported");
        }
      }
    })();
    return () => {
      ac.abort();
      marshalDialogNfcAbortRef.current = null;
      setNfcDialogStatus("idle");
    };
  }, [marshalDialogBlocked, heat.heatIndex, marshalDraftOps, runHeatMarshalComplete]);

  const listTitleClass = compact ? "text-[11px] font-medium text-foreground" : "text-sm font-medium text-foreground";
  const textSm = compact ? "text-xs" : "text-sm";
  const textXs = compact ? "text-[10px]" : "text-xs";
  const boxSize = compact ? "size-3.5" : "size-4";
  const marshalDraftCount = Object.keys(marshalDraftOps).length;

  return (
    <>
      {marshalDialogBlocked ? (
        <p className={compact ? "text-[11px] text-red-600" : "text-sm text-red-600"}>
          {marshalOpsBlocked
            ? compact
              ? "ヒート・レーンが未確定のためマーシャルできません。"
              : "先にスタートリストでヒート・レーンを保存・確定してください。"
            : compact
              ? "種目の召集締切のためマーシャルできません。"
              : "種目全体の召集が締切済みのため、ここからのマーシャルは実行できません。"}
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {marshalDraftCount > 0 ? (
              <div className={cn("rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5", textXs)}>
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-semibold text-foreground">未確定 {marshalDraftCount}件</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={marshalBulkSubmitting}
                      onClick={() => {
                        setMarshalDraftOps({});
                        setMarshalDraftErrors({});
                        setParticipants(heat.participants);
                      }}
                    >
                      取り消し
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={marshalBulkSubmitting}
                      onClick={() => void submitMarshalDraftOps()}
                    >
                      {marshalBulkSubmitting ? "確定中…" : "確定"}
                    </Button>
                  </div>
                </div>
                {Object.keys(marshalDraftErrors).length > 0 ? (
                  <p className="mt-1 text-destructive">失敗した行があります。修正して再度確定してください。</p>
                ) : null}
              </div>
            ) : null}
            <p className={listTitleClass}>
              レーン
              <span className="font-normal text-muted-foreground">
                {compact ? "（タップでチェック＝マーシャル完了）" : "（チェックでマーシャル完了）"}
              </span>
            </p>
            <ul className={compact ? "space-y-1.5" : "space-y-2"} role="list">
              {participants.map((p) => {
                const pKey = marshalParticipantKey(p);
                const done = isCalledLikeStatus(p.status);
                const isTerminal = isDayOpsTerminalParticipantStatus(p.status);
                const globallyBusy = marshalPendingKey !== null || marshalBulkSubmitting;
                const rowBusy = marshalPendingKey === pKey;
                const checkboxDisabled =
                  marshalDialogBlocked || globallyBusy || isTerminal;
                const inputId = `marshal-h${heat.heatIndex}-lane${p.lane}-${pKey.replace(/[^a-zA-Z0-9_-]/g, "")}`;
                const rowInteractive = !done && !isTerminal && !marshalDialogBlocked && !globallyBusy;

                return (
                  <li key={pKey} className="list-none">
                    <label
                      htmlFor={inputId}
                      className={cn(
                        "flex items-start rounded-lg border transition-[border-color,background-color,box-shadow,transform] duration-150",
                        compact ? "gap-2.5 p-2" : "gap-3 p-3",
                        done &&
                          "border-emerald-500/50 bg-gradient-to-r from-emerald-500/[0.08] via-transparent to-transparent shadow-sm dark:border-emerald-500/40 dark:from-emerald-500/[0.12]",
                        !done &&
                          !isTerminal &&
                          rowInteractive &&
                          "cursor-pointer border-border bg-card hover:border-primary/45 hover:bg-muted/50 active:scale-[0.998]",
                        !done &&
                          isTerminal &&
                          "cursor-not-allowed border-amber-200/70 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/25",
                        !done &&
                          !isTerminal &&
                          globallyBusy &&
                          !rowBusy &&
                          "border-border/80 bg-muted/20 opacity-75",
                        rowBusy && "border-primary/50 ring-2 ring-primary/25 ring-offset-2 ring-offset-background"
                      )}
                    >
                      <div className={cn("mt-0.5 grid shrink-0 place-items-center", boxSize)}>
                        <Checkbox
                          id={inputId}
                          checked={done}
                          disabled={checkboxDisabled}
                          className={cn(
                            "col-start-1 row-start-1",
                            boxSize,
                            compact && "rounded-[5px] [&_svg]:size-2.5",
                            done &&
                              "border-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600",
                            rowBusy && "invisible",
                            marshalDraftErrors[pKey] && "border-destructive"
                          )}
                          onCheckedChange={(checked) => {
                            if (checked === true && !done) {
                              queueMarshalDraftToggle(p, "CALLED");
                              return;
                            }
                            if (checked === false && done) {
                              queueMarshalDraftToggle(p, "PENDING");
                            }
                          }}
                        />
                        {rowBusy ? (
                          <Loader2
                            className={cn(
                              "col-start-1 row-start-1 animate-spin text-primary",
                              compact ? "size-3.5" : "size-4"
                            )}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <div className={cn("min-w-0 flex-1", textSm)}>
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                          <span className="inline-flex items-center rounded bg-muted/80 px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
                            L{p.lane}
                          </span>
                          <span className="font-medium text-foreground">{p.label}</span>
                        </div>
                        <div className={cn("mt-0.5", textXs, "text-muted-foreground")}>
                          所属: {p.clubName?.trim() ? p.clubName : "—"}
                        </div>
                        {!compact ? (
                          <div className="mt-0.5 text-xs text-muted-foreground/90">状態: {p.status}</div>
                        ) : null}
                        {marshalDraftErrors[pKey] ? (
                          <div className="mt-0.5 text-[10px] text-destructive">
                            {marshalDraftErrors[pKey]}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-start pt-0.5">
                        {done && !rowBusy ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded-full bg-emerald-600/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200",
                              !compact && "text-xs"
                            )}
                          >
                            <CheckCircle2 className="size-3 shrink-0" aria-hidden />
                            召集済
                          </span>
                        ) : isTerminal ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
                            {dayOpsParticipantStatusLabelJa(p.status)}
                          </span>
                        ) : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <p
            className={cn(
              compact ? "mt-2 border-t pt-2 text-[10px]" : "mt-4 border-t pt-3 text-xs",
              "border-orange-200/50 leading-snug dark:border-orange-900/50",
              nfcDialogStatus === "listening" &&
                "font-medium text-orange-900 dark:text-orange-200",
              nfcDialogStatus === "unsupported" && "text-muted-foreground",
              nfcDialogStatus === "error" &&
                "font-medium text-amber-800 dark:text-amber-200",
              nfcDialogStatus === "idle" && "text-muted-foreground"
            )}
            role="status"
          >
            {nfcDialogStatus === "listening"
              ? "NFC 待機中（タグをかざすとこのヒートに記録）"
              : nfcDialogStatus === "unsupported"
                ? "この環境では NFC を利用できません。上のチェックで記録してください。"
                : nfcDialogStatus === "error"
                  ? "NFC を開始できませんでした。ダイアログを閉じて開き直すか、チェックで記録してください。"
                  : "NFC を準備しています…"}
          </p>
        </>
      )}

      <AlertDialog
        open={marshalResult !== null}
        onOpenChange={(o) => {
          if (!o) setMarshalResult(null);
        }}
      >
        <AlertDialogContent className={compact ? "max-w-sm" : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>マーシャル完了</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                {marshalResult ? (
                  <>
                    <p>
                      <span className="text-muted-foreground">レーン</span> {marshalResult.lane}
                    </p>
                    <p className="text-base font-semibold">{marshalResult.label}</p>
                    <p>
                      <span className="text-muted-foreground">所属</span>{" "}
                      {marshalResult.clubName?.trim() ? marshalResult.clubName : "—"}
                    </p>
                    {marshalResult.alreadyMarshalled ? (
                      <p className="text-amber-700 dark:text-amber-300">すでに召集済みでした。</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
