"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { ListChecks, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { StartListMarshalViewMode } from "@/lib/startListEventTypes";
import type { NextRoundSlStatusResponse } from "@/lib/heatResultCaptureApi";
import { shouldShowNextRoundSlSection } from "@/lib/startListNextRoundSlUi";

type Props = {
  tabId: string;
  tabCount: number;
  roundName: string;
  mode: StartListMarshalViewMode;
  showMarshalOps: boolean;
  showResultOps: boolean;
  onModeChange: (tabId: string, mode: StartListMarshalViewMode) => void;
  nextRoundSl?: {
    loading: boolean;
    busy: boolean;
    status: NextRoundSlStatusResponse | null;
    onGenerate: (mode: "create" | "regenerate" | "rescue") => void | Promise<void>;
  };
};

export function StartListMarshalModeBar({
  tabId,
  tabCount,
  roundName,
  mode,
  showMarshalOps,
  showResultOps,
  onModeChange,
  nextRoundSl,
}: Props) {
  const highlightMarshal = mode === "marshal";
  const highlightResult = mode === "result";
  const [rescueOpen, setRescueOpen] = useState(false);

  const sl = nextRoundSl?.status;
  const slBusy = Boolean(nextRoundSl?.busy);
  const slLoading = Boolean(nextRoundSl?.loading);
  const showSlSection =
    Boolean(nextRoundSl) && shouldShowNextRoundSlSection(sl ?? null, slLoading);

  return (
    <div
      className={cn(
        "rounded-xl border p-3 shadow-sm transition-colors sm:p-3.5",
        highlightMarshal
          ? "border-emerald-200/90 bg-emerald-50/40 dark:border-emerald-800/80 dark:bg-emerald-950/30"
          : "border-violet-200/90 bg-violet-50/40 dark:border-violet-800/80 dark:bg-violet-950/25"
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
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:w-[min(100%,22rem)]">
          <div className="flex flex-wrap gap-0 rounded-lg border border-border/80 bg-background p-0.5 shadow-inner">
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

      {showSlSection ? (
        <div className="mt-2.5 border-t border-border/60 pt-2.5">
          <p className="text-[10px] font-semibold text-foreground">次ラウンド SL</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            {slLoading
              ? "状態を確認しています…"
              : sl?.canGenerate
                ? "前ラウンドの全ヒート確定済みです。スタートリストを生成してください。"
                : sl?.canRegenerate
                  ? "前ラ結果に変更があります。マーシャル開始前に SL を再生成できます。"
                  : sl?.canRescueRegenerate
                    ? "前ラ結果に変更があります。救済再生成は配置のみ更新し、召集済み状態は維持します。"
                    : sl?.blockedReason ?? "前ラウンドのリザルト確定後に利用できます。"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sl?.canGenerate ? (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[10px]"
                disabled={slBusy || slLoading}
                onClick={() => void nextRoundSl!.onGenerate("create")}
              >
                {slBusy ? "処理中…" : "SL生成"}
              </Button>
            ) : null}
            {sl?.canRegenerate ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 px-2.5 text-[10px]"
                disabled={slBusy || slLoading}
                onClick={() => void nextRoundSl!.onGenerate("regenerate")}
              >
                {slBusy ? "処理中…" : "SL再生成"}
              </Button>
            ) : null}
            {sl?.canRescueRegenerate ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 px-2.5 text-[10px]"
                disabled={slBusy || slLoading}
                onClick={() => setRescueOpen(true)}
              >
                SL再生成（救済）
              </Button>
            ) : null}
          </div>

          <AlertDialog open={rescueOpen} onOpenChange={(open) => !slBusy && setRescueOpen(open)}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>SL再生成（救済）</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-left text-sm text-foreground">
                    <p>
                      次ラウンドのマーシャルが開始済みです。進出者の
                      <span className="font-semibold"> 召集済み・終了ステータスは維持 </span>
                      し、ヒート・レーン配置のみ前ラ結果に合わせて組み直します。
                    </p>
                    <p className="text-muted-foreground">
                      通常は前ラ修正後・次ラマーシャル前に SL 再生成してください。
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel type="button" disabled={slBusy}>
                  キャンセル
                </AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={slBusy}
                  onClick={() => {
                    setRescueOpen(false);
                    void nextRoundSl?.onGenerate("rescue");
                  }}
                >
                  {slBusy ? "処理中…" : "実行する"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}
