"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  dayOpsParticipantStatusLabelJa,
  isDayOpsTerminalParticipantStatus,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { postHeatMarshalComplete } from "@/lib/heatMarshalApi";
import { isNfcScanSupportedSync, startNfcScanSession } from "@/lib/nfc/nfcScanSession";
import { cn } from "@/lib/utils";
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
    return `I:${p.competitionEntryId}`;
  }
  if (p.teamMemberUserId) {
    return `T:${p.teamEntryId}:${p.teamMemberUserId}`;
  }
  return `T:${p.teamEntryId}`;
}

type Props = {
  competitionId: string;
  eventId: string;
  marshalRound: MarshalRoundKey;
  heat: HeatMarshalHeatRow;
  /** ステップ1未確定など */
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
  }, [heat]);

  const applyMarshalResponse = useCallback((data: { lane?: unknown }) => {
    const lane = Number(data.lane);
    if (!Number.isFinite(lane)) return;
    setParticipants((prev) =>
      prev.map((p) => (p.lane === lane ? { ...p, status: "CALLED" } : p))
    );
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
  }, [marshalDialogBlocked, heat.heatIndex, runHeatMarshalComplete]);

  const listTitleClass = compact ? "text-[11px] font-medium text-foreground" : "text-sm font-medium text-foreground";
  const textSm = compact ? "text-xs" : "text-sm";
  const textXs = compact ? "text-[10px]" : "text-xs";
  const boxSize = compact ? "size-3.5" : "size-4";

  return (
    <>
      {marshalDialogBlocked ? (
        <p className={compact ? "text-[11px] text-red-600" : "text-sm text-red-600"}>
          {marshalOpsBlocked
            ? compact
              ? "ステップ1未確定のためマーシャルできません。"
              : "先にスタートリストでステップ1（ヒート設定）を確定してください。"
            : compact
              ? "種目の召集締切のためマーシャルできません。"
              : "種目全体の召集が締切済みのため、ここからのマーシャルは実行できません。"}
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className={listTitleClass}>
              レーン
              <span className="font-normal text-muted-foreground">
                {compact ? "（タップでチェック＝マーシャル完了）" : "（チェックでマーシャル完了）"}
              </span>
            </p>
            <ul className={compact ? "space-y-1.5" : "space-y-2"} role="list">
              {participants.map((p) => {
                const pKey = marshalParticipantKey(p);
                const done = p.status === "CALLED";
                const isTerminal = isDayOpsTerminalParticipantStatus(p.status);
                const globallyBusy = marshalPendingKey !== null;
                const rowBusy = marshalPendingKey === pKey;
                const checkboxDisabled =
                  marshalDialogBlocked || globallyBusy || isTerminal || done;
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
                            rowBusy && "invisible"
                          )}
                          onCheckedChange={(checked) => {
                            if (checked !== true || done) return;
                            void (async () => {
                              setMarshalPendingKey(pKey);
                              try {
                                await runHeatMarshalComplete({
                                  mode: "manual",
                                  heatIndex: heat.heatIndex,
                                  participant: p,
                                });
                              } catch (error) {
                                toast.error(
                                  error instanceof Error ? error.message : "マーシャルに失敗しました"
                                );
                              } finally {
                                setMarshalPendingKey(null);
                              }
                            })();
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
