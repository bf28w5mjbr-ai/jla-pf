"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildStartListSettingsPayload,
  parseStartListSettings,
  type HeatSetting,
} from "@/lib/startListSettings";
import { defaultResultRoundLabelJa } from "@/lib/resultRoundLabels";
import { secondaryClubLabelForTeamRow } from "@/lib/startListTeamDisplay";

type EventInfo = {
  id: string;
  name: string;
  sex?: string | null;
  type: "INDIVIDUAL" | "TEAM";
};

type IndividualEntry = {
  name: string;
};

type TeamEntry = {
  teamName: string;
  clubName?: string | null;
  members: string[];
};

type StartListConfiguratorProps = {
  events: EventInfo[];
  individualByEvent: Record<string, IndividualEntry[]>;
  teamByEvent: Record<string, TeamEntry[]>;
  competitionId: string;
  initialSettings?: unknown;
};

const sexLabel = (sex?: string | null) =>
  sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : "その他";

const buildHeats = <T,>(items: T[], count: number) => {
  if (count <= 0) return [] as T[][];
  const base = Math.floor(items.length / count);
  const remainder = items.length % count;
  const result: T[][] = [];
  let offset = 0;

  for (let i = 0; i < count; i += 1) {
    const size = base + (i < remainder ? 1 : 0);
    result.push(items.slice(offset, offset + size));
    offset += size;
  }

  return result;
};

export default function StartListConfigurator({
  events,
  individualByEvent,
  teamByEvent,
  competitionId,
  initialSettings,
}: StartListConfiguratorProps) {
  const parsedInitialSettings = parseStartListSettings(initialSettings);
  const computedDefaults = useMemo(() => {
    const next: Record<string, HeatSetting> = {};
    events.forEach((event) => {
      const total = event.type === "TEAM"
        ? (teamByEvent[event.id]?.length ?? 0)
        : (individualByEvent[event.id]?.length ?? 0);
      next[event.id] = {
        mode: "count",
        heatCount: total > 0 ? "1" : "",
        heatSize: total > 0 ? String(total) : "",
      };
    });
    return next;
  }, [events, individualByEvent, teamByEvent]);

  const [settings, setSettings] = useState<Record<string, HeatSetting>>(
    Object.keys(parsedInitialSettings.eventSettings).length > 0
      ? parsedInitialSettings.eventSettings
      : computedDefaults
  );
  const [teamAssignmentDeadline, setTeamAssignmentDeadline] = useState(
    parsedInitialSettings.teamAssignmentDeadline
      ? new Date(parsedInitialSettings.teamAssignmentDeadline).toISOString().slice(0, 16)
      : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isGeneratingRound, setIsGeneratingRound] = useState<string | null>(null);
  const [roundOptions, setRoundOptions] = useState<
    Record<
      string,
      {
        fromRound: "HEAT" | "SEMI";
        toRound: "SEMI" | "FINAL";
        topPerHeat: string;
        heatCount: string;
        useLegacyUniformTop: boolean;
      }
    >
  >({});

  const [progressionDraft, setProgressionDraft] = useState<Record<string, { r1: string; r2: string }>>(
    () => {
      const next: Record<string, { r1: string; r2: string }> = {};
      events.forEach((e) => {
        const p = parsedInitialSettings.eventSettings[e.id]?.progressionHeatCounts;
        next[e.id] = {
          r1: typeof p?.[0] === "number" ? String(p[0]) : "",
          r2: typeof p?.[1] === "number" ? String(p[1]) : "",
        };
      });
      return next;
    }
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const mergedEventSettings: Record<string, HeatSetting> = { ...settings };
      for (const e of events) {
        const d = progressionDraft[e.id] ?? { r1: "", r2: "" };
        const r1 = parseInt(d.r1.trim(), 10);
        const r2 = parseInt(d.r2.trim(), 10);
        const arr: number[] = [];
        if (Number.isFinite(r1) && r1 >= 1) arr.push(Math.min(64, r1));
        if (Number.isFinite(r2) && r2 >= 1) arr.push(Math.min(64, r2));
        const base = mergedEventSettings[e.id] ?? { mode: "count" as const, heatCount: "1", heatSize: "8" };
        if (arr.length > 0) {
          mergedEventSettings[e.id] = { ...base, progressionHeatCounts: arr };
        } else {
          const { progressionHeatCounts, ...rest } = base;
          void progressionHeatCounts;
          mergedEventSettings[e.id] = rest;
        }
      }

      const response = await fetch(`/api/competitions/${competitionId}/start-list-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startListSettings: buildStartListSettingsPayload({
            eventSettings: mergedEventSettings,
            teamAssignmentDeadline: teamAssignmentDeadline || null,
          }),
        }),
      });

      if (!response.ok) {
        throw new Error("スタートリスト設定の更新に失敗しました");
      }

      setSettings(mergedEventSettings);
      setSavedAt(new Date());
    } catch (error) {
      console.error("Start list settings save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          {savedAt ? `保存済み ${savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "未保存"}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
        >
          {isSaving ? "保存中..." : "設定を保存"}
        </button>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="space-y-2">
          <Label htmlFor="teamAssignmentDeadline">チームメンバー割当の目安日時（通知用）</Label>
          <Input
            id="teamAssignmentDeadline"
            type="datetime-local"
            value={teamAssignmentDeadline}
            onChange={(e) => setTeamAssignmentDeadline(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            編集の確定は、各チームがスタートリスト上で乗るヒートのマーシャル締切までです。ここに保存する日時は通知や運用の目安用であり、編集可否の上限には使いません。
          </p>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          種目が登録されていません。
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const isTeam = event.type === "TEAM";
            const individualItems = individualByEvent[event.id] ?? [];
            const teamItems = teamByEvent[event.id] ?? [];
            const total = isTeam ? teamItems.length : individualItems.length;

            const setting = settings[event.id] ?? {
              mode: "count",
              heatCount: "",
              heatSize: "",
            };

            const heatCount = setting.mode === "count"
              ? Math.max(1, parseInt(setting.heatCount || "1", 10))
              : Math.max(1, Math.ceil(total / Math.max(1, parseInt(setting.heatSize || "1", 10))));

            const individualHeats = !isTeam
              ? buildHeats<IndividualEntry>(individualItems, total === 0 ? 0 : heatCount)
              : [];
            const teamHeats = isTeam
              ? buildHeats<TeamEntry>(teamItems, total === 0 ? 0 : heatCount)
              : [];
            const roundOption = roundOptions[event.id] ?? {
              fromRound: "HEAT" as const,
              toRound: "FINAL" as const,
              topPerHeat: "2",
              heatCount: "1",
              useLegacyUniformTop: false,
            };
            const prog = settings[event.id]?.progressionHeatCounts;

            return (
              <div
                key={event.id}
                className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {event.name}（{sexLabel(event.sex)}）
                    </p>
                    <p className="text-xs text-gray-500">
                      {isTeam ? "チーム" : "個人"} / 合計 {total} 件
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="radio"
                        name={`heat-mode-${event.id}`}
                        checked={setting.mode === "count"}
                        onChange={() =>
                          setSettings((prev) => ({
                            ...prev,
                            [event.id]: {
                              ...setting,
                              mode: "count",
                            },
                          }))
                        }
                      />
                      ヒート数
                    </label>
                    <Input
                      numericInput="integer"
                      min="1"
                      value={setting.heatCount}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          [event.id]: {
                            ...setting,
                            mode: "count",
                            heatCount: e.target.value,
                          },
                        }))
                      }
                      disabled={setting.mode !== "count"}
                      className="h-8 w-20 text-xs"
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="radio"
                        name={`heat-mode-${event.id}`}
                        checked={setting.mode === "size"}
                        onChange={() =>
                          setSettings((prev) => ({
                            ...prev,
                            [event.id]: {
                              ...setting,
                              mode: "size",
                            },
                          }))
                        }
                      />
                      レーン数
                    </label>
                    <Input
                      numericInput="integer"
                      min="1"
                      value={setting.heatSize}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          [event.id]: {
                            ...setting,
                            mode: "size",
                            heatSize: e.target.value,
                          },
                        }))
                      }
                      disabled={setting.mode !== "size"}
                      className="h-8 w-24 text-xs"
                    />
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  設定結果: {total === 0 ? "—" : `${heatCount} ヒート`}
                </div>

                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    本戦のヒート数（保存時に種目設定へ）
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                    先頭ラウンドの次のヒート数・さらにその次のヒート数を保存します。次ラ生成で「生成ヒート数」が空のときこの値が使われます。按分アップは種目の「1レースあたりの最大レーン数」（全ラウンド共通）×次ヒート数が定員になります。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <div>
                      <Label className="text-xs">先頭の次（準決など）</Label>
                      <Input
                        numericInput="integer"
                        min={1}
                        max={64}
                        className="mt-0.5 h-8 w-20 text-xs"
                        placeholder="例 4"
                        value={progressionDraft[event.id]?.r1 ?? ""}
                        onChange={(e) =>
                          setProgressionDraft((prev) => ({
                            ...prev,
                            [event.id]: { r1: e.target.value, r2: prev[event.id]?.r2 ?? "" },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">その次（決勝など）</Label>
                      <Input
                        numericInput="integer"
                        min={1}
                        max={64}
                        className="mt-0.5 h-8 w-20 text-xs"
                        placeholder="例 1"
                        value={progressionDraft[event.id]?.r2 ?? ""}
                        onChange={(e) =>
                          setProgressionDraft((prev) => ({
                            ...prev,
                            [event.id]: { r1: prev[event.id]?.r1 ?? "", r2: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    次ラウンド生成（ラウンド進行）
                  </p>
                  <p className="mt-1 text-[11px] text-amber-900/70 dark:text-amber-200/80">
                    デフォルトは「全ラウンド共通の最大レーン×次ヒート数」に合わせ各ヒートから着順で按分アップ。チェックを入れると各ヒート上位n名の従来方式です。
                  </p>
                  <div className="mt-2 grid gap-2 md:grid-cols-5">
                    <div>
                      <Label className="text-xs">元ラウンド</Label>
                      <select
                        value={roundOption.fromRound}
                        onChange={(e) =>
                          setRoundOptions((prev) => ({
                            ...prev,
                            [event.id]: {
                              ...roundOption,
                              fromRound: e.target.value as "HEAT" | "SEMI",
                            },
                          }))
                        }
                        className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="HEAT">{defaultResultRoundLabelJa("HEAT")}</option>
                        <option value="SEMI">{defaultResultRoundLabelJa("SEMI")}</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">生成先</Label>
                      <select
                        value={roundOption.toRound}
                        onChange={(e) =>
                          setRoundOptions((prev) => ({
                            ...prev,
                            [event.id]: {
                              ...roundOption,
                              toRound: e.target.value as "SEMI" | "FINAL",
                            },
                          }))
                        }
                        className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="SEMI">{defaultResultRoundLabelJa("SEMI")}</option>
                        <option value="FINAL">{defaultResultRoundLabelJa("FINAL")}</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                        <input
                          type="checkbox"
                          checked={roundOption.useLegacyUniformTop}
                          onChange={(e) =>
                            setRoundOptions((prev) => ({
                              ...prev,
                              [event.id]: {
                                ...roundOption,
                                useLegacyUniformTop: e.target.checked,
                              },
                            }))
                          }
                          className="rounded border-amber-400"
                        />
                        各ヒート上位n名
                      </label>
                      <Input
                        numericInput="integer"
                        min="1"
                        title="従来モード時のみ送信されます"
                        disabled={!roundOption.useLegacyUniformTop}
                        value={roundOption.topPerHeat}
                        onChange={(e) =>
                          setRoundOptions((prev) => ({
                            ...prev,
                            [event.id]: {
                              ...roundOption,
                              topPerHeat: e.target.value,
                            },
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">生成ヒート数（空＝保存済み本戦設定）</Label>
                      <Input
                        numericInput="integer"
                        min="1"
                        placeholder={
                          roundOption.fromRound === "SEMI"
                            ? prog?.[1] != null
                              ? String(prog[1])
                              : ""
                            : prog?.[0] != null
                              ? String(prog[0])
                              : ""
                        }
                        value={roundOption.heatCount}
                        onChange={(e) =>
                          setRoundOptions((prev) => ({
                            ...prev,
                            [event.id]: {
                              ...roundOption,
                              heatCount: e.target.value,
                            },
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={async () => {
                          setIsGeneratingRound(event.id);
                          try {
                            const heatRaw = roundOption.heatCount.trim();
                            const heatParsed = parseInt(heatRaw, 10);
                            const body: Record<string, unknown> = {
                              eventId: event.id,
                              fromRound: roundOption.fromRound,
                              toRound: roundOption.toRound,
                              mode: "count",
                            };
                            if (Number.isFinite(heatParsed) && heatParsed >= 1) {
                              body.heatCount = Math.min(64, heatParsed);
                            }
                            if (roundOption.useLegacyUniformTop) {
                              body.topPerHeat = Math.max(
                                1,
                                parseInt(roundOption.topPerHeat || "2", 10)
                              );
                            }
                            const response = await fetch(
                              `/api/competitions/${competitionId}/start-list-snapshot/rounds`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(body),
                              }
                            );
                            if (!response.ok) {
                              throw new Error("次ラウンドの生成に失敗しました");
                            }
                            setSavedAt(new Date());
                          } catch (error) {
                            console.error("Round generation error:", error);
                          } finally {
                            setIsGeneratingRound(null);
                          }
                        }}
                        disabled={isGeneratingRound === event.id}
                        className="inline-flex h-8 w-full items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-gray-950 dark:text-amber-300"
                      >
                        {isGeneratingRound === event.id ? "生成中..." : "次ラウンド生成"}
                      </button>
                    </div>
                  </div>
                </div>

                {total === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">エントリーなし</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {!isTeam &&
                      individualHeats.map((heatItems, heatIndex) => (
                        <div
                          key={`${event.id}-heat-${heatIndex}`}
                          className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        >
                          <p className="text-xs font-semibold text-gray-500">
                            ヒート {heatIndex + 1}（{heatItems.length}件）
                          </p>
                          <ul className="mt-2 space-y-1">
                            {heatItems.map((item, itemIndex) => (
                              <li key={`${event.id}-${heatIndex}-${itemIndex}`}>
                                <span>{item.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                    {isTeam &&
                      teamHeats.map((heatItems, heatIndex) => (
                        <div
                          key={`${event.id}-heat-${heatIndex}`}
                          className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        >
                          <p className="text-xs font-semibold text-gray-500">
                            ヒート {heatIndex + 1}（{heatItems.length}件）
                          </p>
                          <ul className="mt-2 space-y-1">
                            {heatItems.map((item, itemIndex) => {
                              const clubSecondary = secondaryClubLabelForTeamRow(
                                item.teamName,
                                item.clubName
                              );
                              return (
                                <li key={`${event.id}-${heatIndex}-${itemIndex}`}>
                                  <div>
                                    <span className="font-medium">{item.teamName}</span>
                                    {clubSecondary ? (
                                      <span className="ml-2 text-xs text-gray-500">
                                        ({clubSecondary})
                                      </span>
                                    ) : null}
                                    {item.members.length > 0 && (
                                      <div className="mt-1 text-xs text-gray-500">
                                        {item.members.join(" / ")}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
