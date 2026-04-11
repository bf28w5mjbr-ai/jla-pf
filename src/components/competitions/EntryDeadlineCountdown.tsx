"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function formatRemainingJa(ms: number): string {
  if (ms <= 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) {
    return `${days}日${hours}時間${minutes}分`;
  }
  if (hours > 0) {
    return `${hours}時間${minutes}分${seconds}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

type Props = {
  entryStartISO: string | null;
  entryEndISO: string | null;
  /** 表示用（サーバーで整形済み） */
  formattedStart: string | null;
  formattedEnd: string | null;
};

export function EntryDeadlineCountdown({
  entryStartISO,
  entryEndISO,
  formattedStart,
  formattedEnd,
}: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const start = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, []);

  const startMs = entryStartISO ? Date.parse(entryStartISO) : NaN;
  const endMs = entryEndISO ? Date.parse(entryEndISO) : NaN;
  const hasValidEnd = Number.isFinite(endMs);

  if (!hasValidEnd) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>締切日時は未設定です。</span>
      </div>
    );
  }

  if (now === null) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse" />
        <span>締切: {formattedEnd ?? "—"}</span>
      </div>
    );
  }

  const beforeOpen = Number.isFinite(startMs) && now < startMs;
  const afterClose = now > endMs;
  const open = !beforeOpen && !afterClose;

  if (afterClose) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 text-xs">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-0.5 leading-snug">
          <p className="font-semibold text-foreground">締切済み</p>
          <p className="tabular-nums text-muted-foreground">締切 {formattedEnd}</p>
        </div>
      </div>
    );
  }

  if (beforeOpen) {
    const toStart = startMs - now;
    const remaining = formatRemainingJa(toStart);
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2.5 text-xs dark:border-amber-900/40 dark:bg-amber-950/25">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 space-y-0.5 leading-snug">
          <p className="font-semibold text-foreground">受付前</p>
          <p className="tabular-nums text-muted-foreground">開始 {formattedStart ?? "—"}</p>
          {remaining ? (
            <p className="font-semibold tabular-nums text-amber-900 dark:text-amber-200">
              開始まで {remaining}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (open) {
    const toEnd = endMs - now;
    const remaining = formatRemainingJa(toEnd);
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2.5 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/25">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <div className="min-w-0 space-y-0.5 leading-snug">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">受付中</p>
          <p className="tabular-nums text-muted-foreground">締切 {formattedEnd}</p>
          {remaining ? (
            <p className="text-sm font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
              あと {remaining}
            </p>
          ) : (
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">まもなく締切</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
