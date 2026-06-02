"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  postHeatLaneTerminalStatus,
  postParticipantTerminalRevert,
} from "@/lib/heatResultCaptureApi";
import {
  dayOpsParticipantStatusLabelJa,
  dispatchJlaDayOpsParticipantStatusChanged,
} from "@/lib/dayOpsParticipantStatusDisplay";
import type { DsqManagementPageData } from "@/lib/dsqManagementLoad";
import { displayResultRoundLabel, type ResultRoundUiKey } from "@/lib/resultRoundLabels";

type ResultRoundKey = "HEAT" | "SEMI" | "FINAL";

type StatusRow = DsqManagementPageData["statuses"][number];

type HeatSummaryRow = DsqManagementPageData["heats"][number];

function applyPageData(
  data: DsqManagementPageData,
  setters: {
    setHeats: (heats: HeatSummaryRow[]) => void;
    setStatuses: (statuses: StatusRow[]) => void;
    setAdjustedRound: (round: ResultRoundKey | null) => void;
  }
) {
  setters.setHeats(data.heats);
  setters.setStatuses(data.statuses);
  setters.setAdjustedRound(data.roundWasAdjusted ? data.round : null);
}

export function EventDsqManagementClient({
  competitionId,
  eventId,
  eventName,
  initialRound,
  roundLabels,
  initialData,
  backHref,
}: {
  competitionId: string;
  eventId: string;
  eventName: string;
  initialRound: ResultRoundKey;
  roundLabels: Partial<Record<ResultRoundUiKey, string>>;
  initialData: DsqManagementPageData | null;
  backHref?: string;
}) {
  const [adjustedRound, setAdjustedRound] = useState<ResultRoundKey | null>(
    initialData?.roundWasAdjusted ? initialData.round : null
  );
  const marshalRound = adjustedRound ?? initialRound;
  const [heats, setHeats] = useState<HeatSummaryRow[]>(initialData?.heats ?? []);
  const [pageLoading, setPageLoading] = useState(!initialData);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [statuses, setStatuses] = useState<StatusRow[]>(initialData?.statuses ?? []);

  const [applyHeatIndex, setApplyHeatIndex] = useState<string>("");
  const [applyLane, setApplyLane] = useState<string>("");
  const [applyStatus, setApplyStatus] = useState<"DSQ" | "DNS" | "WITHDRAWN" | "DNF">("DSQ");
  const [applyReason, setApplyReason] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);

  const [revertOpen, setRevertOpen] = useState(false);
  const [revertRow, setRevertRow] = useState<StatusRow | null>(null);
  const [revertTarget, setRevertTarget] = useState<"PENDING" | "CALLED">("PENDING");
  const [revertReason, setRevertReason] = useState("");
  const [revertBusy, setRevertBusy] = useState(false);

  const refreshData = useCallback(
    async (fetchRound: ResultRoundKey, opts?: { fullPage?: boolean }) => {
      if (opts?.fullPage) {
        setPageLoading(true);
      } else {
        setListRefreshing(true);
      }
      try {
        const res = await fetch(
          `/api/competitions/${competitionId}/day-ops/dsq-management?eventId=${encodeURIComponent(eventId)}&round=${encodeURIComponent(fetchRound)}`
        );
        const data = (await res.json().catch(() => ({}))) as DsqManagementPageData & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "読み込みに失敗しました");
        }
        applyPageData(data, { setHeats, setStatuses, setAdjustedRound });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "読み込みに失敗しました");
        if (opts?.fullPage) {
          setStatuses([]);
          setHeats([]);
          setAdjustedRound(null);
        }
      } finally {
        if (opts?.fullPage) {
          setPageLoading(false);
        } else {
          setListRefreshing(false);
        }
      }
    },
    [competitionId, eventId]
  );

  useEffect(() => {
    if (initialData) return;
    void refreshData(initialRound, { fullPage: true });
  }, [initialData, initialRound, refreshData]);

  const terminalRows = useMemo(
    () => statuses.filter((s) => ["DSQ", "DNS", "WITHDRAWN", "DNF"].includes(s.status)),
    [statuses]
  );

  const selectedHeat = useMemo(() => {
    const idx = parseInt(applyHeatIndex, 10);
    if (!Number.isFinite(idx) || idx < 1) return null;
    return heats.find((h) => h.heatIndex === idx) ?? null;
  }, [applyHeatIndex, heats]);

  const openRevert = (row: StatusRow) => {
    setRevertRow(row);
    setRevertTarget("PENDING");
    setRevertReason("");
    setRevertOpen(true);
  };

  const submitApply = async () => {
    const heatIndex = parseInt(applyHeatIndex, 10);
    const lane = parseInt(applyLane.trim(), 10);
    if (!Number.isFinite(heatIndex) || heatIndex < 1) {
      toast.error("ヒートを選択してください");
      return;
    }
    if (!Number.isFinite(lane) || lane < 1) {
      toast.error("1 以上のレーン番号を入力してください");
      return;
    }
    setApplyBusy(true);
    try {
      const res = await postHeatLaneTerminalStatus(competitionId, {
        eventId,
        round: marshalRound,
        heatIndex,
        lane,
        status: applyStatus,
        reason: applyReason.trim() || undefined,
      });
      if (res.alreadyApplied) {
        toast.info("すでに登録済みです");
      } else {
        toast.success(
          `ヒート ${heatIndex} レーン ${lane} を ${dayOpsParticipantStatusLabelJa(applyStatus)} にしました`
        );
      }
      if (res.officialSyncSkipped) {
        toast.warning(
          "種目全体の公式結果が確定済みのため、公開用の公式結果行は更新されませんでした"
        );
      }
      setApplyLane("");
      setApplyReason("");
      await refreshData(marshalRound);
      dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "終了ステータスの登録に失敗しました");
    } finally {
      setApplyBusy(false);
    }
  };

  const submitRevert = async () => {
    if (!revertRow) return;
    const r = revertReason.trim();
    if (r.length < 1) {
      toast.error("取り消し理由を入力してください");
      return;
    }
    const participantType = revertRow.participantType === "TEAM" ? "TEAM" : "INDIVIDUAL";
    setRevertBusy(true);
    try {
      const revertRes = await postParticipantTerminalRevert(competitionId, {
        eventId,
        participantType,
        competitionEntryId: revertRow.competitionEntryId ?? undefined,
        teamEntryId: revertRow.teamEntryId ?? undefined,
        targetStatus: revertTarget,
        reason: r,
        marshalRound,
        fromStatus:
          revertRow.status === "DNS" ||
          revertRow.status === "WITHDRAWN" ||
          revertRow.status === "DNF" ||
          revertRow.status === "DSQ"
            ? revertRow.status
            : undefined,
      });
      toast.success("終了ステータスを取り消しました");
      if (revertRes.officialSyncSkipped) {
        toast.warning(
          "種目全体の公式結果が確定済みのため、公開用の公式結果行は更新されませんでした"
        );
      }
      setRevertOpen(false);
      setRevertRow(null);
      await refreshData(marshalRound);
      dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setRevertBusy(false);
    }
  };

  const resolvedBackHref =
    backHref ?? `/competitions/${competitionId}/start-list/${eventId}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
          <Link href={resolvedBackHref}>← スタートリストへ</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-lg font-semibold leading-tight">終了ステータス管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">{eventName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          対象ラウンド: {displayResultRoundLabel(marshalRound, roundLabels)}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">終了ステータス登録</CardTitle>
          <CardDescription>
            対象ラウンドのスナップショットに対し、ヒートとレーンを選択して終了ステータス（DNS/棄権/DNF/DSQ）を付与します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pageLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : heats.length === 0 ? (
            <p className="text-sm text-muted-foreground">このラウンドにヒートがありません。</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>ヒート</Label>
                <Select value={applyHeatIndex} onValueChange={setApplyHeatIndex}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {heats.map((h) => (
                      <SelectItem key={h.heatIndex} value={String(h.heatIndex)}>
                        ヒート {h.heatIndex}（{h.participantCount} レーン）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>対象レーン</Label>
                <Select
                  value={applyLane}
                  onValueChange={(v) => setApplyLane(v)}
                  disabled={applyBusy || !selectedHeat}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder={selectedHeat ? "選択" : "先にヒートを選択"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedHeat?.participants ?? []).map((p) => (
                      <SelectItem key={`${p.lane}`} value={String(p.lane)}>
                        レーン {p.lane}: {p.label}
                        {p.clubName ? `（${p.clubName}）` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>ステータス</Label>
                <Select
                  value={applyStatus}
                  onValueChange={(v) => {
                    if (v === "DSQ" || v === "DNS" || v === "WITHDRAWN" || v === "DNF") {
                      setApplyStatus(v);
                    }
                  }}
                  disabled={applyBusy}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNS">欠場（DNS）</SelectItem>
                    <SelectItem value="WITHDRAWN">棄権</SelectItem>
                    <SelectItem value="DNF">DNF（途中辞退）</SelectItem>
                    <SelectItem value="DSQ">失格（DSQ）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dsq-reason-apply">理由（任意・監査用）</Label>
                <Textarea
                  id="dsq-reason-apply"
                  className="min-h-[4rem] text-sm"
                  value={applyReason}
                  onChange={(e) => setApplyReason(e.target.value)}
                  disabled={applyBusy}
                  maxLength={500}
                />
              </div>
              <Button type="button" disabled={applyBusy} onClick={() => void submitApply()}>
                {applyBusy ? "処理中…" : "確定"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">終了ステータスの取り消し</CardTitle>
          <CardDescription>
            現在終了ステータス（DNS/棄権/DNF/DSQ）の参加者を、未召集（PENDING）または召集済み（CALLED）に戻します。召集締切や種目召集締切の制約に従います。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pageLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : terminalRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">終了ステータス中の参加者はいません。</p>
          ) : (
            <div className="space-y-2">
              {listRefreshing ? (
                <p className="text-xs text-muted-foreground">一覧を更新中…</p>
              ) : null}
              <ul className="space-y-2">
                {terminalRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {dayOpsParticipantStatusLabelJa(row.status)}
                        {row.reason ? ` · ${row.reason}` : ""}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => openRevert(row)}>
                      取り消し
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={revertOpen} onOpenChange={(o) => !revertBusy && setRevertOpen(o)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>終了ステータスの取り消し</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-foreground">
                <p>
                  {revertRow ? (
                    <>
                      <span className="font-medium">{revertRow.label}</span>
                      を終了ステータスから戻します。
                    </>
                  ) : null}
                </p>
                <div className="space-y-1">
                  <Label>戻す状態</Label>
                  <Select
                    value={revertTarget}
                    onValueChange={(v) => {
                      if (v === "PENDING" || v === "CALLED") setRevertTarget(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">未召集（PENDING）</SelectItem>
                      <SelectItem value="CALLED">召集済み（CALLED）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="revert-reason">理由（必須・監査用）</Label>
                  <Textarea
                    id="revert-reason"
                    className="min-h-[4rem]"
                    value={revertReason}
                    onChange={(e) => setRevertReason(e.target.value)}
                    disabled={revertBusy}
                    maxLength={500}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={revertBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button type="button" disabled={revertBusy} onClick={() => void submitRevert()}>
              {revertBusy ? "処理中…" : "取り消す"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
