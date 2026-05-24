"use client";

import { flushSync } from "react-dom";
import { LayoutList, ListChecks, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StartListMarshalViewMode } from "@/components/StartListEventUnifiedCard";

type Props = {
  tabId: string;
  tabCount: number;
  roundName: string;
  mode: StartListMarshalViewMode;
  showMarshalOps: boolean;
  showResultOps: boolean;
  onModeChange: (tabId: string, mode: StartListMarshalViewMode) => void;
};

export function StartListMarshalModeBar({
  tabId,
  tabCount,
  roundName,
  mode,
  showMarshalOps,
  showResultOps,
  onModeChange,
}: Props) {
  const highlightMarshal = mode === "marshal";
  const highlightResult = mode === "result";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 shadow-sm transition-colors sm:p-3.5",
        highlightMarshal
          ? "border-emerald-200/90 bg-emerald-50/40 dark:border-emerald-800/80 dark:bg-emerald-950/30"
          : highlightResult
            ? "border-violet-200/90 bg-violet-50/40 dark:border-violet-800/80 dark:bg-violet-950/25"
            : "border-border/70 bg-muted/15"
      )}
      role="region"
      aria-label={`${roundName}のスタートリスト表示`}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="min-w-0 text-xs font-semibold text-foreground">
            表示モード
            {tabCount > 1 ? (
              <span className="ml-1.5 font-normal text-muted-foreground">（{roundName}）</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            現在: {mode === "normal" ? "通常" : mode === "marshal" ? "マーシャル" : "リザルト"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:w-[min(100%,22rem)]">
          <div className="flex flex-wrap gap-0 rounded-lg border border-border/80 bg-background p-0.5 shadow-inner">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 min-w-0 flex-1 gap-0.5 rounded-md px-1.5 text-[11px] font-medium sm:px-2",
                mode === "normal" && "bg-muted text-foreground shadow-sm"
              )}
              aria-pressed={mode === "normal"}
              onClick={() => onModeChange(tabId, "normal")}
            >
              <LayoutList className="size-3.5 shrink-0 opacity-80" aria-hidden />
              通常
            </Button>
            {showMarshalOps ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 min-w-0 flex-1 gap-0.5 rounded-md px-1.5 text-[11px] font-medium sm:px-2",
                  highlightMarshal &&
                    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:text-white dark:bg-emerald-700 dark:hover:bg-emerald-600"
                )}
                aria-pressed={highlightMarshal}
                onClick={() => {
                  flushSync(() => {
                    onModeChange(tabId, "marshal");
                  });
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new Event("jla-marshal-nfc-arm"));
                  }
                }}
              >
                <ListChecks className="size-3.5 shrink-0 opacity-90" aria-hidden />
                マーシャル
              </Button>
            ) : null}
            {showResultOps ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 min-w-0 flex-1 gap-0.5 rounded-md px-1.5 text-[11px] font-medium sm:px-2",
                  highlightResult &&
                    "bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:text-white dark:bg-violet-700 dark:hover:bg-violet-600"
                )}
                aria-pressed={highlightResult}
                onClick={() => {
                  flushSync(() => {
                    onModeChange(tabId, "result");
                  });
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new Event("jla-result-nfc-arm"));
                  }
                }}
              >
                <Trophy className="size-3.5 shrink-0 opacity-90" aria-hidden />
                リザルト
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
