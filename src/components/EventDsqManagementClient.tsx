"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
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
import { postHeatLaneDsq, postParticipantDsqRevert } from "@/lib/heatResultCaptureApi";
import {
  dayOpsParticipantStatusLabelJa,
  dispatchJlaDayOpsParticipantStatusChanged,
} from "@/lib/dayOpsParticipantStatusDisplay";
import { displayResultRoundLabel, type ResultRoundUiKey } from "@/lib/resultRoundLabels";

type ResultRoundKey = "HEAT" | "SEMI" | "FINAL";

type StatusRow = {
  id: string;
  participantType: string;
  competitionEntryId: string | null;
  teamEntryId: string | null;
  status: string;
  reason: string | null;
};

type CandidatesPayload = {
  individuals: { participantType: "INDIVIDUAL"; competitionEntryId: string; label: string }[];
  teams: {
    participantType: "TEAM";
    teamEntryId: string;
    label: string;
    memberUsers?: { userId: string; label: string }[];
  }[];
};

function labelForDsqRow(row: StatusRow, candidates: CandidatesPayload | null): string {
  if (!candidates) return "（読込中）";
  if (row.participantType === "INDIVIDUAL" && row.competitionEntryId) {
    const hit = candidates.individuals.find((i) => i.competitionEntryId === row.competitionEntryId);
    return hit?.label ?? row.competitionEntryId;
  }
  if (row.participantType === "TEAM" && row.teamEntryId) {
    const hit = candidates.teams.find((t) => t.teamEntryId === row.teamEntryId);
    return hit?.label ?? row.teamEntryId;
  }
  return "—";
}

export function EventDsqManagementClient({
  competitionId,
  eventId,
  eventName,
  initialRound,
  roundLabels,
}: {
  competitionId: string;
  eventId: string;
  eventName: string;
  initialRound: ResultRoundKey;
  roundLabels: Partial<Record<ResultRoundUiKey, string>>;
}) {
  const router = useRouter();
  /** heat-marshal が URL のラウンドを補正したときの実効ラウンド（未補正時はタブ／URL の initialRound をそのまま使う） */
  const [adjustedRound, setAdjustedRound] = useState<ResultRoundKey | null>(null);
  const marshalRound = adjustedRound ?? initialRound;
  const [heats, setHeats] = useState<HeatMarshalHeatRow[]>([]);
  const [heatLoading, setHeatLoading] = useState(true);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [candidates, setCandidates] = useState<CandidatesPayload | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [applyHeatIndex, setApplyHeatIndex] = useState<string>("");
  const [applyLane, setApplyLane] = useState("");
  const [applyReason, setApplyReason] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);

  const [revertOpen, setRevertOpen] = useState(false);
  const [revertRow, setRevertRow] = useState<StatusRow | null>(null);
  const [revertTarget, setRevertTarget] = useState<"PENDING" | "CALLED">("PENDING");
  const [revertReason, setRevertReason] = useState("");
  const [revertBusy, setRevertBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/day-ops/participant-statuses?eventId=${encodeURIComponent(eventId)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        statuses?: StatusRow[];
        candidates?: CandidatesPayload;
      };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "状態の取得に失敗しました");
      }
      setStatuses(Array.isArray(data.statuses) ? data.statuses : []);
      setCandidates(data.candidates ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "状態の取得に失敗しました");
      setStatuses([]);
      setCandidates(null);
    } finally {
      setMetaLoading(false);
    }
  }, [competitionId, eventId]);

  const loadHeats = useCallback(async () => {
    setHeatLoading(true);
    try {
      const res = await fetch(
        `/api/competitions/${competitionId}/day-ops/heat-marshal?eventId=${encodeURIComponent(eventId)}&round=${encodeURIComponent(marshalRound)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        heats?: HeatMarshalHeatRow[];
        round?: string;
        roundWasAdjusted?: boolean;
      };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "ヒート一覧の取得に失敗しました");
      }
      setHeats(Array.isArray(data.heats) ? data.heats : []);
      if (
        data.roundWasAdjusted &&
        (data.round === "HEAT" || data.round === "SEMI" || data.round === "FINAL")
      ) {
        setAdjustedRound(data.round);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ヒート一覧の取得に失敗しました");
      setHeats([]);
    } finally {
      setHeatLoading(false);
    }
  }, [competitionId, eventId, marshalRound]);

  useEffect(() => {
    setAdjustedRound(null);
  }, [initialRound]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadHeats();
  }, [loadHeats]);

  const dsqRows = useMemo(
    () => statuses.filter((s) => s.status === "DSQ"),
    [statuses]
  );

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
      const res = await postHeatLaneDsq(competitionId, {
        eventId,
        round: marshalRound,
        heatIndex,
        lane,
        reason: applyReason.trim() || undefined,
      });
      if (res.alreadyDsq) {
        toast.info("すでに失格登録済みです");
      } else {
        toast.success(`ヒート ${heatIndex} レーン ${lane} を失格（DSQ）にしました`);
      }
      setApplyLane("");
      setApplyReason("");
      await loadMeta();
      await loadHeats();
      dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失格の登録に失敗しました");
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
      await postParticipantDsqRevert(competitionId, {
        eventId,
        participantType,
        competitionEntryId: revertRow.competitionEntryId ?? undefined,
        teamEntryId: revertRow.teamEntryId ?? undefined,
        targetStatus: revertTarget,
        reason: r,
        marshalRound,
      });
      toast.success("失格を取り消しました");
      setRevertOpen(false);
      setRevertRow(null);
      await loadMeta();
      await loadHeats();
      dispatchJlaDayOpsParticipantStatusChanged(competitionId, eventId);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setRevertBusy(false);
    }
  };

  const backHref = `/competitions/${competitionId}/start-list/${eventId}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
          <Link href={backHref}>← スタートリストへ</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-lg font-semibold leading-tight">失格管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">{eventName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          対象ラウンド: {displayResultRoundLabel(marshalRound, roundLabels)}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">失格申請</CardTitle>
          <CardDescription>
            スタートリストで開いているラウンドのスナップショットに対し、ヒートと左端のレーン番号を指定して失格（DSQ）にします。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {heatLoading ? (
            <p className="text-sm text-muted-foreground">ヒートを読み込み中…</p>
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
                        ヒート {h.heatIndex}（{h.participants?.length ?? 0} レーン）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dsq-lane">レーン番号</Label>
                <Input
                  id="dsq-lane"
                  numericInput="integer"
                  className="max-w-xs"
                  placeholder="例: 3"
                  value={applyLane}
                  onChange={(e) => setApplyLane(e.target.value)}
                  disabled={applyBusy}
                />
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
              <Button type="button" disabled={applyBusy} variant="destructive" onClick={() => void submitApply()}>
                {applyBusy ? "処理中…" : "失格を確定"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">失格の取り消し</CardTitle>
          <CardDescription>
            現在失格（DSQ）の参加者を、未召集（PENDING）または召集済み（CALLED）に戻します。召集締切や種目召集締切の制約に従います。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metaLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : dsqRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">失格中の参加者はいません。</p>
          ) : (
            <ul className="space-y-2">
              {dsqRows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{labelForDsqRow(row, candidates)}</p>
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
          )}
        </CardContent>
      </Card>

      <AlertDialog open={revertOpen} onOpenChange={(o) => !revertBusy && setRevertOpen(o)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>失格の取り消し</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-foreground">
                <p>
                  {revertRow ? (
                    <>
                      <span className="font-medium">{labelForDsqRow(revertRow, candidates)}</span>
                      を失格から戻します。
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
