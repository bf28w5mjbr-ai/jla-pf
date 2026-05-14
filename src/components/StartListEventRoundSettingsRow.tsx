"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StartListEventBarItem } from "@/lib/startListEventBarTypes";
import type { StartListRoundTab } from "@/lib/startListSettings";

const sexLabel = (sex: string) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

export type StartListEventRoundSettingsRowProps = {
  event: StartListEventBarItem;
  scheduleText: string | null;
  displayTabs: StartListRoundTab[];
  draftN: number;
  savedN: number;
  roundCountValue: string;
  onRoundCountChange: (value: string) => void;
  heatUiLocked: boolean;
  roundSaveDisabled: boolean;
  savingRound: boolean;
  onSaveRoundCount: () => void;
  onUpdateHeatTab: (tabIndex: number, patch: Partial<StartListRoundTab>) => void;
  heatSaveDisabled: boolean;
  heatSaving: boolean;
  heatPlanConfirming: boolean;
  onSaveHeatPlan: () => void;
};

export function StartListEventRoundSettingsRow({
  event,
  scheduleText,
  displayTabs,
  draftN,
  savedN,
  roundCountValue,
  onRoundCountChange,
  heatUiLocked,
  roundSaveDisabled,
  savingRound,
  onSaveRoundCount,
  onUpdateHeatTab,
  heatSaveDisabled,
  heatSaving,
  heatPlanConfirming,
  onSaveHeatPlan,
}: StartListEventRoundSettingsRowProps) {
  const entryMeta =
    typeof event.preliminaryHeatLaneCount === "number"
      ? `エントリー ${event.entryCount ?? 0} 件 · 最大レーン ${event.preliminaryHeatLaneCount}`
      : `エントリー ${event.entryCount ?? 0} 件`;

  return (
    <li className="flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-0 px-2 py-1 text-left text-sm sm:flex-row sm:items-center sm:gap-2 sm:py-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">{event.name}</span>
              {scheduleText ? (
                <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                  {scheduleText}
                </span>
              ) : null}
              <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                {entryMeta}
              </span>
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {sexLabel(event.sex)}
              {event.type === "TEAM" ? " · 団体" : " · 個人"}
              {event.ageCategoryName ? ` · ${event.ageCategoryName}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-1 sm:w-auto sm:border-l sm:border-t-0 sm:py-1 sm:pl-2 sm:pr-2">
          <span className="whitespace-nowrap text-[10px] text-muted-foreground">ラウンド</span>
          <Input
            numericInput="integer"
            min={1}
            max={32}
            className="h-7 w-11 px-1 text-center text-[11px] tabular-nums"
            aria-label={`${event.name} のスタートリストのラウンド数`}
            value={roundCountValue}
            onChange={(e) => onRoundCountChange(e.target.value)}
            disabled={heatUiLocked}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 px-2 text-[11px]"
            onClick={onSaveRoundCount}
            disabled={roundSaveDisabled}
          >
            {savingRound ? "保存中" : "保存"}
          </Button>
        </div>
      </div>
      {draftN >= 1 ? (
        <div className="border-t border-border/50 bg-muted/5 px-2 py-1.5">
          <p className="mb-1 text-[10px] leading-snug text-muted-foreground">
            ラウンドごとのヒート数・最大レーン（空の最大レーンは種目の既定）
          </p>
          <ul className="divide-y divide-border/40">
            {displayTabs.map((tab, tabIdx) => (
              <li
                key={tab.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 first:pt-0 last:pb-0"
              >
                <span className="w-[6.5rem] shrink-0 truncate text-[10px] font-medium text-foreground">
                  {tab.label?.trim() ? tab.label : `ラウンド ${tabIdx + 1}`}
                </span>
                {tab.mode === "size" ? (
                  <>
                    <span className="text-[10px] text-muted-foreground">1ヒート人数</span>
                    <Input
                      numericInput="integer"
                      min={1}
                      max={64}
                      className="h-7 w-11 px-1 text-center text-[11px] tabular-nums"
                      value={tab.heatSize ?? ""}
                      onChange={(e) => onUpdateHeatTab(tabIdx, { heatSize: e.target.value })}
                      disabled={heatUiLocked}
                    />
                  </>
                ) : (
                  <>
                    <span className="text-[10px] text-muted-foreground">ヒート数</span>
                    <Input
                      numericInput="integer"
                      min={1}
                      max={64}
                      className="h-7 w-11 px-1 text-center text-[11px] tabular-nums"
                      value={tab.heatCount ?? "1"}
                      onChange={(e) => onUpdateHeatTab(tabIdx, { heatCount: e.target.value })}
                      disabled={heatUiLocked}
                    />
                  </>
                )}
                <span className="text-[10px] text-muted-foreground">最大レーン</span>
                <Input
                  numericInput="integer"
                  min={1}
                  max={32}
                  title="最大レーン（空なら種目の既定）"
                  placeholder={
                    typeof event.preliminaryHeatLaneCount === "number"
                      ? String(event.preliminaryHeatLaneCount)
                      : "—"
                  }
                  className="h-7 w-11 px-1 text-center text-[11px] tabular-nums"
                  value={typeof tab.maxLanesPerHeat === "number" ? String(tab.maxLanesPerHeat) : ""}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    if (t === "") {
                      onUpdateHeatTab(tabIdx, { maxLanesPerHeat: undefined });
                      return;
                    }
                    const v = parseInt(t, 10);
                    if (Number.isInteger(v) && v >= 1 && v <= 32) {
                      onUpdateHeatTab(tabIdx, { maxLanesPerHeat: v });
                    }
                  }}
                  disabled={heatUiLocked}
                />
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 w-fit px-2 text-[11px]"
              onClick={onSaveHeatPlan}
              disabled={heatSaveDisabled}
            >
              {heatSaving
                ? !event.startListHeatPlanConfirmedAt && !event.marshalStartedAt
                  ? "保存・確定中…"
                  : "保存中…"
                : heatPlanConfirming
                  ? "確定を記録中…"
                  : "ヒート・レーンを保存"}
            </Button>
            {event.startListHeatPlanConfirmedAt ? (
              <span className="text-[10px] text-muted-foreground">ヒート・レーン確定済み</span>
            ) : null}
            {draftN !== savedN ? (
              <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                先に上の「保存」でラウンド数を確定してください。
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
