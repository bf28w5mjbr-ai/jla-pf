"use client";

import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateForDatetimeLocalInput } from "@/lib/datetimeLocal";
import { formatEventStartJa } from "@/lib/eventScheduleDisplay";
import {
  competitionScheduleDatetimeLocalMinMax,
  isInstantWithinCompetitionEventSchedule,
} from "@/lib/eventScheduleWithinCompetition";
import { cn } from "@/lib/utils";

export type StartListEventBarItem = {
  id: string;
  name: string;
  sex: string;
  type: "INDIVIDUAL" | "TEAM";
  displayOrder: number;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  /** スタートリストのラウンド数（全ラウンド） */
  startListRoundCount?: number;
};

type Props = {
  competitionId: string;
  competitionName?: string;
  competitionStartDate: Date | string;
  competitionEndDate: Date | string;
  events: StartListEventBarItem[];
  canReorder: boolean;
  /** 主催者管理者のみ。開始時刻のみ一覧から編集 */
  canEditSchedule?: boolean;
  /** 主催者管理者または承認済みオフィシャル。ラウンド数（1〜32） */
  canEditRoundCount?: boolean;
};

const sexLabel = (sex: string) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

function sortEvents(list: StartListEventBarItem[]) {
  return [...list].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

/** サーバー由来の一覧・開始時刻が変わったときだけ同期するためのキー（{@link sortEvents} 済み配列用・二重ソート回避） */
function serverEventsSyncKeyFromSorted(sorted: StartListEventBarItem[]) {
  return sorted
    .map(
      (e) =>
        `${e.id}:${e.displayOrder}:${e.scheduledStartAt ? new Date(e.scheduledStartAt).getTime() : ""}:${e.startListRoundCount ?? 1}`
    )
    .join("|");
}

/** 並べ替え用: 入力欄の下書きがあればそれを優先し、なければ保存済みの開始時刻。未設定は後ろへ */
function effectiveStartMsForSort(
  e: StartListEventBarItem,
  drafts: Record<string, string>
): number {
  const draft = drafts[e.id]?.trim();
  if (draft) {
    const d = new Date(draft);
    return Number.isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime();
  }
  if (e.scheduledStartAt) {
    const t = new Date(e.scheduledStartAt).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }
  return Number.POSITIVE_INFINITY;
}

function sortByStartTimeOrder(
  list: StartListEventBarItem[],
  drafts: Record<string, string>
): StartListEventBarItem[] {
  return [...list].sort((a, b) => {
    const da = effectiveStartMsForSort(a, drafts);
    const db = effectiveStartMsForSort(b, drafts);
    if (da !== db) return da - db;
    return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);
  });
}

const AUTO_SORT_STORAGE_KEY = "jla-pf:start-list:auto-sort-after-save";

type SchedulePatchResponseEvent = { id: string; scheduledStartAt: string | null };

export default function StartListEventIndexBars({
  competitionId,
  competitionName,
  competitionStartDate,
  competitionEndDate,
  events,
  canReorder,
  canEditSchedule = false,
  canEditRoundCount = false,
}: Props) {
  const router = useRouter();
  const compStart = useMemo(() => new Date(competitionStartDate), [competitionStartDate]);
  const compEnd = useMemo(() => new Date(competitionEndDate), [competitionEndDate]);
  const scheduleMinMax = useMemo(
    () => competitionScheduleDatetimeLocalMinMax(compStart, compEnd),
    [compStart, compEnd]
  );
  const [order, setOrder] = useState<StartListEventBarItem[]>(() => sortEvents(events));
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [timeSavingId, setTimeSavingId] = useState<string | null>(null);
  const [roundCounts, setRoundCounts] = useState<Record<string, string>>({});
  const [roundSavingId, setRoundSavingId] = useState<string | null>(null);
  const [autoSortAfterSaveStart, setAutoSortAfterSaveStart] = useState(true);
  const [staggerBase, setStaggerBase] = useState("");
  const [staggerMinutes, setStaggerMinutes] = useState("15");
  const [bulkApplying, setBulkApplying] = useState(false);

  const { sortedFromServer, serverSyncKey } = useMemo(() => {
    const sorted = sortEvents(events);
    return {
      sortedFromServer: sorted,
      serverSyncKey: serverEventsSyncKeyFromSorted(sorted),
    };
  }, [events]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(AUTO_SORT_STORAGE_KEY) === "0") {
      setAutoSortAfterSaveStart(false);
    }
  }, []);

  useEffect(() => {
    setOrder(sortedFromServer);
    const m: Record<string, string> = {};
    for (const e of sortedFromServer) {
      m[e.id] = e.scheduledStartAt
        ? formatDateForDatetimeLocalInput(new Date(e.scheduledStartAt))
        : "";
    }
    setStarts(m);
    const rc: Record<string, string> = {};
    for (const e of sortedFromServer) {
      const n =
        typeof e.startListRoundCount === "number" && e.startListRoundCount >= 1
          ? Math.min(32, e.startListRoundCount)
          : 1;
      rc[e.id] = String(n);
    }
    setRoundCounts(rc);
    // 配列参照を依存にすると React 19 で依存配列の長さが種目数に連動することがあるため、文字列キーのみ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverSyncKey に表示順・開始時刻の実体が含まれる
  }, [serverSyncKey]);

  const persistOrder = async (nextOrder: StartListEventBarItem[], successMessage?: string) => {
    setReorderSaving(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/events/display-order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedEventIds: nextOrder.map((e) => e.id) }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "並べ替えの保存に失敗しました");
      toast.success(successMessage ?? "表示順を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "並べ替えの保存に失敗しました");
      setOrder(sortEvents(events));
    } finally {
      setReorderSaving(false);
    }
  };

  const setAutoSortPreference = (enabled: boolean) => {
    setAutoSortAfterSaveStart(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTO_SORT_STORAGE_KEY, enabled ? "1" : "0");
    }
  };

  const saveRoundCount = async (eventId: string) => {
    const raw = (roundCounts[eventId] ?? "1").trim();
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 32) {
      toast.error("ラウンド数は1〜32の整数にしてください");
      return;
    }
    setRoundSavingId(eventId);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startListRoundCount: n }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "ラウンド数の保存に失敗しました");
      toast.success(data.message || "ラウンド数を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ラウンド数の保存に失敗しました");
    } finally {
      setRoundSavingId(null);
    }
  };

  const saveStart = async (eventId: string) => {
    const raw = starts[eventId] ?? "";
    if (raw.trim() !== "") {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        toast.error("日時の形式が不正です");
        return;
      }
      if (!isInstantWithinCompetitionEventSchedule(parsed, compStart, compEnd)) {
        toast.error("開始日時は大会の開催期間内にしてください");
        return;
      }
    }
    setTimeSavingId(eventId);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledStartAt: raw.trim() === "" ? null : raw,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        events?: SchedulePatchResponseEvent[];
      };
      if (!res.ok) throw new Error(data.message || "開始時刻の保存に失敗しました");

      const apiEvents = data.events;
      let mergedStarts = starts;
      let mergedOrder = order;

      if (apiEvents?.length) {
        const byId = new Map(apiEvents.map((ev) => [ev.id, ev]));
        mergedStarts = { ...starts };
        const u = byId.get(eventId);
        if (u) {
          mergedStarts[eventId] = u.scheduledStartAt
            ? formatDateForDatetimeLocalInput(new Date(u.scheduledStartAt))
            : "";
        }
        setStarts(mergedStarts);
        mergedOrder = order.map((row) => {
          const up = byId.get(row.id);
          return up ? { ...row, scheduledStartAt: up.scheduledStartAt } : row;
        });
      }

      if (canReorder && autoSortAfterSaveStart && apiEvents?.length) {
        const nextSorted = sortByStartTimeOrder(mergedOrder, mergedStarts);
        const changed = !nextSorted.every((e, i) => e.id === order[i]?.id);
        if (changed) {
          setOrder(nextSorted);
          await persistOrder(nextSorted, "開始時刻を保存し、時刻順に並べ替えました");
          return;
        }
      }

      toast.success(data.message || "開始時刻を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "開始時刻の保存に失敗しました");
    } finally {
      setTimeSavingId(null);
    }
  };

  const applyStaggerAndSave = async () => {
    const baseStr = staggerBase.trim();
    if (!baseStr) {
      toast.error("1件目の開始日時を入力してください");
      return;
    }
    const base = new Date(baseStr);
    if (Number.isNaN(base.getTime())) {
      toast.error("1件目の開始日時の形式が不正です");
      return;
    }
    const step = Number.parseInt(staggerMinutes, 10);
    if (!Number.isFinite(step) || step < 1 || step > 24 * 60) {
      toast.error("間隔は1〜1440分（24時間）以内で指定してください");
      return;
    }
    if (!isInstantWithinCompetitionEventSchedule(base, compStart, compEnd)) {
      toast.error("1件目の開始日時は大会の開催期間内にしてください");
      return;
    }

    const slots: { id: string; at: Date }[] = [];
    for (let i = 0; i < order.length; i++) {
      const at = new Date(base.getTime() + i * step * 60_000);
      if (!isInstantWithinCompetitionEventSchedule(at, compStart, compEnd)) {
        toast.error(
          `「${order[i]?.name ?? ""}」の時刻が開催期間外になります（${i + 1}件目）。間隔または開始を見直してください。`
        );
        return;
      }
      slots.push({ id: order[i]!.id, at });
    }

    setBulkApplying(true);
    try {
      for (const { id, at } of slots) {
        const payload = formatDateForDatetimeLocalInput(at);
        const res = await fetch(`/api/competitions/${competitionId}/events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledStartAt: payload }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message || "一括保存に失敗しました");
        }
      }

      const nextStarts: Record<string, string> = { ...starts };
      for (const { id, at } of slots) {
        nextStarts[id] = formatDateForDatetimeLocalInput(at);
      }
      setStarts(nextStarts);

      const mergedOrder = order.map((row) => {
        const slot = slots.find((s) => s.id === row.id);
        return slot ? { ...row, scheduledStartAt: slot.at.toISOString() } : row;
      });

      if (canReorder && autoSortAfterSaveStart) {
        const nextSorted = sortByStartTimeOrder(mergedOrder, nextStarts);
        const changed = !nextSorted.every((e, i) => e.id === order[i]?.id);
        if (changed) {
          setOrder(nextSorted);
          await persistOrder(nextSorted, "一括で開始時刻を保存し、時刻順に並べ替えました");
          return;
        }
      }

      toast.success("一括で開始時刻を保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "一括保存に失敗しました");
    } finally {
      setBulkApplying(false);
    }
  };

  const handleDropOn = (targetId: string) => {
    if (!canReorder || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = [...order];
    const fi = next.findIndex((x) => x.id === dragId);
    const ti = next.findIndex((x) => x.id === targetId);
    if (fi < 0 || ti < 0) {
      setDragId(null);
      return;
    }
    const [item] = next.splice(fi, 1);
    next.splice(ti, 0, item);
    setOrder(next);
    setDragId(null);
    void persistOrder(next);
  };

  const handleSortByStartTime = () => {
    const hasComparable = order.some((e) =>
      Number.isFinite(effectiveStartMsForSort(e, starts))
    );
    if (!hasComparable) {
      toast.info("開始時刻が入力または保存されている種目がありません");
      return;
    }
    const next = sortByStartTimeOrder(order, starts);
    const unchanged = next.every((e, i) => e.id === order[i]?.id);
    if (unchanged) {
      toast.info("すでに開始時刻順です");
      return;
    }
    setOrder(next);
    void persistOrder(next, "開始時刻の早い順に並べ替えました");
  };

  const publicScheduleBarsOnly =
    !canReorder && !canEditSchedule && !canEditRoundCount;

  const hintCompact = (() => {
    if (publicScheduleBarsOnly) {
      return "開催（表示）順です。行をタップでスタートリストを表示します。";
    }
    const parts: string[] = [];
    if (canReorder) {
      parts.push("握りをドラッグして並べ替え（自動保存）");
    }
    parts.push("行をタップで詳細");
    if (canEditSchedule) {
      parts.push("開始は開催期内・終了は種目ページ");
    }
    if (canEditRoundCount) {
      parts.push("ラウンド数は全ラウンドで1〜32");
    }
    return parts.join(" · ");
  })();

  if (order.length === 0) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/15 px-2.5 py-1.5">
          <CardTitle className="text-sm font-semibold">種目一覧</CardTitle>
          {competitionName ? (
            <p className="truncate text-[10px] text-muted-foreground">{competitionName}</p>
          ) : null}
        </CardHeader>
        <CardContent className="px-2.5 py-2.5">
          <p className="text-xs text-muted-foreground">種目が登録されていません。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="space-y-0.5 border-b border-border/80 bg-muted/15 px-2.5 py-1.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold leading-tight">種目一覧</CardTitle>
            {competitionName ? (
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{competitionName}</p>
            ) : null}
          </div>
          {canReorder ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-0.5 px-2 text-[11px]"
                onClick={() => void handleSortByStartTime()}
                disabled={reorderSaving || bulkApplying || timeSavingId !== null || roundSavingId !== null}
              >
                <Clock className="h-3 w-3" />
                時刻順
              </Button>
              {canEditSchedule ? (
                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3 rounded border-input accent-primary"
                    checked={autoSortAfterSaveStart}
                    onChange={(e) => setAutoSortPreference(e.target.checked)}
                  />
                  保存後に時刻順へ
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">{hintCompact}</p>
      </CardHeader>
      <CardContent className="p-0">
        {canEditSchedule ? (
          <details className="group border-b border-border/50 bg-muted/5">
            <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground marker:content-none hover:bg-muted/25 [&::-webkit-details-marker]:hidden">
              <span className="underline decoration-dotted underline-offset-2 group-open:no-underline">
                一括で開始時刻（表示順に分刻みで保存）
              </span>
            </summary>
            <div className="flex flex-wrap items-end gap-2 border-t border-border/40 px-2.5 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="stagger-base" className="text-[10px] text-muted-foreground">
                  1件目
                </Label>
                <Input
                  id="stagger-base"
                  type="datetime-local"
                  className="h-7 max-w-[10.5rem] text-[11px]"
                  min={scheduleMinMax.min}
                  max={scheduleMinMax.max}
                  value={staggerBase}
                  onChange={(e) => setStaggerBase(e.target.value)}
                  disabled={bulkApplying}
                />
              </div>
              <div className="space-y-0.5">
                <Label htmlFor="stagger-step" className="text-[10px] text-muted-foreground">
                  間隔(分)
                </Label>
                <Input
                  id="stagger-step"
                  numericInput="integer"
                  min={1}
                  max={1440}
                  className="h-7 w-[4.25rem] text-[11px]"
                  value={staggerMinutes}
                  onChange={(e) => setStaggerMinutes(e.target.value)}
                  disabled={bulkApplying}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-[11px]"
                onClick={() => void applyStaggerAndSave()}
                disabled={bulkApplying || reorderSaving || timeSavingId !== null || roundSavingId !== null}
              >
                {bulkApplying ? "保存中…" : "全種目に保存"}
              </Button>
            </div>
          </details>
        ) : null}
        <ul className="divide-y divide-border/50">
          {order.map((event) => {
            const scheduleText = canEditSchedule
              ? null
              : formatEventStartJa(event.scheduledStartAt);
            const rowDrop = canReorder
              ? {
                  onDragOver: (e: DragEvent) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  },
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    handleDropOn(event.id);
                  },
                }
              : {};
            return (
              <li
                key={event.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-stretch",
                  dragId === event.id ? "bg-muted/40" : ""
                )}
              >
                <div className="flex min-w-0 flex-1 items-stretch">
                  {canReorder ? (
                    <button
                      type="button"
                      draggable
                      aria-label={`${event.name} の並べ替え`}
                      className="flex shrink-0 cursor-grab touch-none items-center border-r border-border/50 px-1 text-muted-foreground active:cursor-grabbing"
                      onDragStart={(e) => {
                        setDragId(event.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", event.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      {...rowDrop}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <Link
                    href={`/competitions/${competitionId}/start-list/${event.id}`}
                    className="flex min-w-0 flex-1 flex-col gap-0 px-2 py-1 text-left text-sm transition hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-2 sm:py-1"
                    {...rowDrop}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-tight">{event.name}</span>
                      {scheduleText ? (
                        <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                          {scheduleText}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {sexLabel(event.sex)}
                      {event.type === "TEAM" ? " · 団体" : " · 個人"}
                    </span>
                  </Link>
                </div>
                {canEditSchedule ? (
                  <div className="flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-1 sm:w-auto sm:border-l sm:border-t-0 sm:py-1 sm:pl-2 sm:pr-2">
                    <Input
                      type="datetime-local"
                      aria-label={`${event.name} の開始時刻`}
                      className="h-7 max-w-[10.5rem] text-[11px]"
                      min={scheduleMinMax.min}
                      max={scheduleMinMax.max}
                      value={starts[event.id] ?? ""}
                      onChange={(e) =>
                        setStarts((p) => ({ ...p, [event.id]: e.target.value }))
                      }
                      disabled={bulkApplying}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => void saveStart(event.id)}
                      disabled={bulkApplying || timeSavingId === event.id}
                    >
                      {timeSavingId === event.id ? "保存中" : "保存"}
                    </Button>
                  </div>
                ) : null}
                {canEditRoundCount ? (
                  <div className="flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-1 sm:w-auto sm:border-l sm:border-t-0 sm:py-1 sm:pl-2 sm:pr-2">
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">ラウンド</span>
                    <Input
                      numericInput="integer"
                      min={1}
                      max={32}
                      className="h-7 w-11 px-1 text-center text-[11px] tabular-nums"
                      aria-label={`${event.name} のスタートリストのラウンド数`}
                      value={roundCounts[event.id] ?? "1"}
                      onChange={(e) =>
                        setRoundCounts((p) => ({ ...p, [event.id]: e.target.value }))
                      }
                      disabled={bulkApplying || timeSavingId !== null}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => void saveRoundCount(event.id)}
                      disabled={
                        bulkApplying || roundSavingId === event.id || timeSavingId !== null
                      }
                    >
                      {roundSavingId === event.id ? "保存中" : "保存"}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canReorder && reorderSaving ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            並べ替え保存中…
          </p>
        ) : null}
        {canEditSchedule && bulkApplying ? (
          <p className="border-t border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            一括保存中…
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
