"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  settingsFlatEditSurface,
  settingsFlatHint,
  settingsFlatList,
  settingsFlatRow,
} from "@/components/competitions/management/competitionSettingsFlatUi";
import {
  buildEventAddedAnnouncement,
  buildEventSexOptionExpandAnnouncement,
  eventSexOptionAddsGenders,
} from "@/lib/autoEntryChangeAnnouncement";
import { resolveAllowedAgeCategoryIds } from "@/lib/competitionEventAgeEligibility";
import { buildStoredCompetitionEventName } from "@/lib/competitionEventStoredName";
import {
  displayEventInnerName,
  formatEventEligibilitySubtitle,
  formatEventListRowLabel,
} from "@/lib/competitionEventListLabel";
import {
  eventCardGroupKey,
  getEventSexOptionFromEvents,
  sexOptionLabel,
  type EventSexOption,
} from "@/lib/competitionEventSexOption";
import { toEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";
import { cn } from "@/lib/utils";

export type CompetitionEventRow = {
  id: string;
  name: string;
  category: "POOL" | "OCEAN";
  type: "INDIVIDUAL" | "TEAM";
  sex: "MALE" | "FEMALE" | "OTHER";
  ageCategoryId?: string | null;
  allowedAgeCategoryIds?: unknown;
  eligibleBirthDateFrom?: Date | string | null;
  eligibleBirthDateTo?: Date | string | null;
  teamRelayPositionCount?: number | null;
  teamRelayPositionNames?: unknown;
  maxTeamEntriesPerClub?: number | null;
  displayOrder: number;
};

export type CompetitionAgeCategoryLite = {
  id: string;
  name: string;
};

type EventFormDraft = {
  name: string;
  sexOption: EventSexOption;
  allowedCategoryIds: string[];
  birthFrom: string;
  birthTo: string;
  teamPositionCount: string;
  teamPositionNames: string;
  maxTeamEntriesPerClub: string;
};

type Props = {
  competitionId: string;
  canEdit: boolean;
  category: "POOL" | "OCEAN";
  type: "INDIVIDUAL" | "TEAM";
  eventsInScope: CompetitionEventRow[];
  ageCategories: CompetitionAgeCategoryLite[];
  eventScopeTabId: string;
  useEventCategoryAllowList: boolean;
  requiresParticipantNotice: boolean;
  onEventsChange: (events: CompetitionEventRow[]) => void;
  headerBadge: React.ReactNode;
  headerDescription: string;
  onAddDefaults?: () => void;
  onDeleteAll?: () => void;
  isAddingDefaults?: boolean;
};

function parseTeamRelayNamesFromEvent(e: CompetitionEventRow): string[] {
  const v = e.teamRelayPositionNames;
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyDraft(
  eventScopeTabId: string,
  useEventCategoryAllowList: boolean
): EventFormDraft {
  return {
    name: "",
    sexOption: "BOTH",
    allowedCategoryIds:
      useEventCategoryAllowList && eventScopeTabId !== "__NONE__"
        ? [eventScopeTabId]
        : [],
    birthFrom: "",
    birthTo: "",
    teamPositionCount: "",
    teamPositionNames: "",
    maxTeamEntriesPerClub: "",
  };
}

function draftFromEvent(
  event: CompetitionEventRow,
  eventsInScope: CompetitionEventRow[],
  ageCategoryName: string | null,
  useEventCategoryAllowList: boolean
): EventFormDraft {
  const sexOption = getEventSexOptionFromEvents(
    eventsInScope,
    event.name,
    event.category,
    event.type
  );
  const allowed = resolveAllowedAgeCategoryIds(event) ?? [];
  const names = parseTeamRelayNamesFromEvent(event);
  const count =
    typeof event.teamRelayPositionCount === "number" && event.teamRelayPositionCount >= 1
      ? String(event.teamRelayPositionCount)
      : "";
  const maxCap =
    typeof event.maxTeamEntriesPerClub === "number" && event.maxTeamEntriesPerClub >= 1
      ? String(event.maxTeamEntriesPerClub)
      : "";

  return {
    name: displayEventInnerName(event.name, ageCategoryName),
    sexOption,
    allowedCategoryIds: useEventCategoryAllowList ? allowed : [],
    birthFrom: toEligibleBirthDateInput(event.eligibleBirthDateFrom),
    birthTo: toEligibleBirthDateInput(event.eligibleBirthDateTo),
    teamPositionCount: count,
    teamPositionNames: names.join("\n"),
    maxTeamEntriesPerClub: maxCap,
  };
}

function validateDraft(
  draft: EventFormDraft,
  useEventCategoryAllowList: boolean,
  type: "INDIVIDUAL" | "TEAM"
): string | null {
  if (!draft.name.trim()) return "種目名を入力してください";
  if (useEventCategoryAllowList && draft.allowedCategoryIds.length === 0) {
    return "参加可能な年齢カテゴリを1件以上選んでください";
  }
  if (!useEventCategoryAllowList) {
    const from = draft.birthFrom.trim();
    const to = draft.birthTo.trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !iso.test(from)) return "生年月日（開始）は YYYY-MM-DD で入力してください";
    if (to && !iso.test(to)) return "生年月日（終了）は YYYY-MM-DD で入力してください";
    if (from && to && from > to) return "生年月日の開始は終了以前にしてください";
  }
  if (type === "TEAM") {
    const countRaw = draft.teamPositionCount.trim();
    const lines = draft.teamPositionNames
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (countRaw === "" && lines.length === 0) return null;
    if (countRaw === "" && lines.length > 0) {
      return "ポジション数を入力してください";
    }
    const n = Number(countRaw);
    if (!Number.isInteger(n) || n < 1 || n > 32) {
      return "ポジション数は1〜32の整数にしてください";
    }
    if (lines.length !== n) {
      return `ポジション名は${n}行（1行に1ポジション）にしてください`;
    }
    const maxRaw = draft.maxTeamEntriesPerClub.trim();
    if (maxRaw !== "") {
      const nMax = Number(maxRaw);
      if (!Number.isInteger(nMax) || nMax < 1 || nMax > 999) {
        return "同一クラブあたりチーム上限は1〜999、または空欄にしてください";
      }
    }
  }
  return null;
}

function buildCreatePayload(
  draft: EventFormDraft,
  params: {
    category: "POOL" | "OCEAN";
    type: "INDIVIDUAL" | "TEAM";
    eventScopeTabId: string;
    useEventCategoryAllowList: boolean;
    requiresParticipantNotice: boolean;
  }
): Record<string, unknown> {
  const innerName = draft.name.trim();
  const payload: Record<string, unknown> = {
    name: innerName,
    type: params.type,
    category: params.category,
    sexOption: draft.sexOption,
    ageCategoryId: params.eventScopeTabId === "__NONE__" ? null : params.eventScopeTabId,
    announcementMessage: buildEventAddedAnnouncement(innerName, params.requiresParticipantNotice),
  };

  if (params.useEventCategoryAllowList) {
    payload.allowedAgeCategoryIds = draft.allowedCategoryIds;
  } else {
    const from = draft.birthFrom.trim();
    const to = draft.birthTo.trim();
    payload.eligibleBirthDateFrom = from === "" ? null : from;
    payload.eligibleBirthDateTo = to === "" ? null : to;
  }

  if (params.type === "TEAM") {
    const countRaw = draft.teamPositionCount.trim();
    const lines = draft.teamPositionNames
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (countRaw !== "" || lines.length > 0) {
      payload.teamRelayPositionCount = countRaw === "" ? null : Number(countRaw);
      payload.teamRelayPositionNames = lines;
    }
    const maxRaw = draft.maxTeamEntriesPerClub.trim();
    if (maxRaw !== "") {
      payload.maxTeamEntriesPerClub = Number(maxRaw);
    }
  }

  return payload;
}

function SexOptionButtons({
  value,
  onChange,
  disabled,
}: {
  value: EventSexOption;
  onChange: (next: EventSexOption) => void;
  disabled: boolean;
}) {
  const options: { value: EventSexOption; label: string }[] = [
    { value: "BOTH", label: "男女" },
    { value: "MALE_ONLY", label: "男" },
    { value: "FEMALE_ONLY", label: "女" },
    { value: "MIXED_ONLY", label: "混" },
  ];
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-input bg-background p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={cn(
            "rounded px-2 py-1 text-[11px] transition",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EventFormFields({
  draft,
  setDraft,
  disabled,
  useEventCategoryAllowList,
  ageCategories,
  type,
  idPrefix,
}: {
  draft: EventFormDraft;
  setDraft: React.Dispatch<React.SetStateAction<EventFormDraft>>;
  disabled: boolean;
  useEventCategoryAllowList: boolean;
  ageCategories: CompetitionAgeCategoryLite[];
  type: "INDIVIDUAL" | "TEAM";
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground">種目名</p>
        <Input
          id={`${idPrefix}-name`}
          className="h-8 text-xs"
          value={draft.name}
          disabled={disabled}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="例: ボードレース"
        />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground">性別区分</p>
        <SexOptionButtons
          value={draft.sexOption}
          disabled={disabled}
          onChange={(sexOption) => setDraft((d) => ({ ...d, sexOption }))}
        />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground">参加条件</p>
        {useEventCategoryAllowList ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {ageCategories.map((cat) => {
              const selected = draft.allowedCategoryIds.includes(cat.id);
              return (
                <label
                  key={cat.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-[11px]"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => {
                      setDraft((d) => ({
                        ...d,
                        allowedCategoryIds: selected
                          ? d.allowedCategoryIds.filter((id) => id !== cat.id)
                          : [...d.allowedCategoryIds, cat.id],
                      }));
                    }}
                  />
                  <span>{cat.name}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <label className="inline-flex flex-wrap items-center gap-1 text-[11px]">
            <Input
              type="date"
              className="h-8 w-[9.5rem] px-1.5 text-xs"
              value={draft.birthFrom}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, birthFrom: e.target.value }))}
              aria-label="参加可能な生年月日（開始）"
            />
            <span className="text-muted-foreground">〜</span>
            <Input
              type="date"
              className="h-8 w-[9.5rem] px-1.5 text-xs"
              value={draft.birthTo}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, birthTo: e.target.value }))}
              aria-label="参加可能な生年月日（終了）"
            />
          </label>
        )}
      </div>
      {type === "TEAM" ? (
        <div className="space-y-2 border-t border-border/50 pt-2">
          <p className="text-[10px] font-medium text-muted-foreground">チームポジション（任意）</p>
          <div className="grid gap-2 sm:grid-cols-[5.5rem,1fr]">
            <Input
              numericInput="integer"
              min={1}
              max={32}
              placeholder="例: 4"
              className="h-8 text-xs tabular-nums"
              value={draft.teamPositionCount}
              disabled={disabled}
              onChange={(e) =>
                setDraft((d) => ({ ...d, teamPositionCount: e.target.value }))
              }
            />
            <Textarea
              rows={3}
              className="min-h-[3.5rem] resize-y text-xs"
              placeholder={"ポジション名（1行1つ）\n1st\n2nd"}
              value={draft.teamPositionNames}
              disabled={disabled}
              onChange={(e) =>
                setDraft((d) => ({ ...d, teamPositionNames: e.target.value }))
              }
            />
          </div>
          <Input
            numericInput="integer"
            min={1}
            max={999}
            placeholder="同一クラブ上限（空欄=制限なし）"
            className="h-8 max-w-[14rem] text-xs tabular-nums"
            value={draft.maxTeamEntriesPerClub}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({ ...d, maxTeamEntriesPerClub: e.target.value }))
            }
          />
        </div>
      ) : null}
    </div>
  );
}

export default function CompetitionEventsSection({
  competitionId,
  canEdit,
  category,
  type,
  eventsInScope,
  ageCategories,
  eventScopeTabId,
  useEventCategoryAllowList,
  requiresParticipantNotice,
  onEventsChange,
  headerBadge,
  headerDescription,
  onAddDefaults,
  onDeleteAll,
  isAddingDefaults = false,
}: Props) {
  const sectionEvents = useMemo(
    () => eventsInScope.filter((e) => e.category === category && e.type === type),
    [eventsInScope, category, type]
  );

  const representatives = useMemo(
    () =>
      Array.from(
        new Map(sectionEvents.map((e) => [eventCardGroupKey(e), e] as const)).values()
      ).sort((a, b) => a.displayOrder - b.displayOrder),
    [sectionEvents]
  );

  const tabAgeCategoryName =
    eventScopeTabId !== "__NONE__"
      ? (ageCategories.find((c) => c.id === eventScopeTabId)?.name ?? null)
      : null;

  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EventFormDraft | null>(null);
  const [addDraft, setAddDraft] = useState<EventFormDraft>(() =>
    emptyDraft(eventScopeTabId, useEventCategoryAllowList)
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const resetAddDraft = () => {
    setAddDraft(emptyDraft(eventScopeTabId, useEventCategoryAllowList));
  };

  const handleAdd = async () => {
    const err = validateDraft(addDraft, useEventCategoryAllowList, type);
    if (err) {
      toast.error(err);
      return;
    }
    setBusyKey("__add__");
    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildCreatePayload(addDraft, {
            category,
            type,
            eventScopeTabId,
            useEventCategoryAllowList,
            requiresParticipantNotice,
          })
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "追加に失敗しました");
      }
      if (Array.isArray(body.events)) {
        onEventsChange(body.events as CompetitionEventRow[]);
      }
      resetAddDraft();
      toast.success(`種目「${addDraft.name.trim()}」を追加しました`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const startEdit = (event: CompetitionEventRow) => {
    const gk = eventCardGroupKey(event);
    setEditingGroupKey(gk);
    setEditDraft(
      draftFromEvent(event, sectionEvents, tabAgeCategoryName, useEventCategoryAllowList)
    );
  };

  const cancelEdit = () => {
    setEditingGroupKey(null);
    setEditDraft(null);
  };

  useEffect(() => {
    resetAddDraft();
    setEditingGroupKey(null);
    setEditDraft(null);
  }, [eventScopeTabId, useEventCategoryAllowList]);

  const handleSaveEdit = async (event: CompetitionEventRow) => {
    if (!editDraft) return;
    const err = validateDraft(editDraft, useEventCategoryAllowList, type);
    if (err) {
      toast.error(err);
      return;
    }

    const gk = eventCardGroupKey(event);
    setBusyKey(gk);
    try {
      let liveEvents = [...eventsInScope];
      const siblingIds = new Set(
        liveEvents
          .filter(
            (e) =>
              e.category === event.category &&
              e.type === event.type &&
              e.name === event.name &&
              (e.ageCategoryId ?? null) === (event.ageCategoryId ?? null)
          )
          .map((e) => e.id)
      );
      const groupEvents = () => liveEvents.filter((e) => siblingIds.has(e.id));
      const repEvent = () => liveEvents.find((e) => e.id === event.id) ?? event;

      const patchJson = async (body: Record<string, unknown>) => {
        const response = await fetch(
          `/api/competitions/${competitionId}/events/${event.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
          events?: CompetitionEventRow[];
        };
        if (!response.ok) {
          throw new Error(typeof data.message === "string" ? data.message : "保存に失敗しました");
        }
        if (Array.isArray(data.events)) {
          liveEvents = data.events;
        }
      };

      const storedName = buildStoredCompetitionEventName({
        tabInnerName: editDraft.name.trim(),
        ageCategoryId: eventScopeTabId === "__NONE__" ? null : eventScopeTabId,
        ageCategoryName: tabAgeCategoryName,
      });
      if (storedName !== event.name.trim()) {
        await patchJson({ name: storedName });
      }

      const currentSex = getEventSexOptionFromEvents(
        groupEvents(),
        repEvent().name,
        event.category,
        event.type
      );
      if (editDraft.sexOption !== currentSex) {
        const addsGenders = eventSexOptionAddsGenders(
          groupEvents(),
          repEvent(),
          editDraft.sexOption
        );
        const announce = addsGenders
          ? buildEventSexOptionExpandAnnouncement(
              displayEventInnerName(repEvent().name, tabAgeCategoryName),
              requiresParticipantNotice
            )
          : undefined;
        await patchJson({
          sexOption: editDraft.sexOption,
          ...(announce ? { announcementMessage: announce } : {}),
        });
      }

      const latestRep = repEvent();
      if (useEventCategoryAllowList) {
        const serverIds = resolveAllowedAgeCategoryIds(latestRep) ?? [];
        const draftSorted = [...editDraft.allowedCategoryIds].sort();
        const serverSorted = [...serverIds].sort();
        if (draftSorted.join(",") !== serverSorted.join(",")) {
          await patchJson({ allowedAgeCategoryIds: editDraft.allowedCategoryIds });
        }
      } else {
        const fromTrim = editDraft.birthFrom.trim();
        const toTrim = editDraft.birthTo.trim();
        await patchJson({
          eligibleBirthDateFrom: fromTrim === "" ? null : fromTrim,
          eligibleBirthDateTo: toTrim === "" ? null : toTrim,
        });
      }

      if (type === "TEAM") {
        const countRaw = editDraft.teamPositionCount.trim();
        const lines = editDraft.teamPositionNames
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const maxTrim = editDraft.maxTeamEntriesPerClub.trim();
        const relayBody =
          countRaw === "" && lines.length === 0
            ? { teamRelayPositionCount: null, teamRelayPositionNames: [] as string[] }
            : {
                teamRelayPositionCount: Number(countRaw),
                teamRelayPositionNames: lines,
              };
        await patchJson({
          ...relayBody,
          maxTeamEntriesPerClub: maxTrim === "" ? null : Number(maxTrim),
        });
      }

      onEventsChange(liveEvents);
      cancelEdit();
      toast.success("種目を更新しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (event: CompetitionEventRow) => {
    const inner = displayEventInnerName(event.name, tabAgeCategoryName);
    if (
      !confirm(
        `「${inner}」を削除しますか？\n男子・女子はまとめて削除されます。`
      )
    ) {
      return;
    }
    const gk = eventCardGroupKey(event);
    setBusyKey(gk);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/events/${event.id}`,
        { method: "DELETE" }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "削除に失敗しました");
      }
      if (Array.isArray(body.events)) {
        onEventsChange(body.events as CompetitionEventRow[]);
      }
      if (editingGroupKey === gk) cancelEdit();
      toast.success("種目を削除しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusyKey(null);
    }
  };

  const formLocked = busyKey !== null || (editingGroupKey !== null && editDraft !== null);

  return (
    <section className="space-y-3 rounded-lg border border-border/90 bg-muted/20 p-3 sm:p-4 dark:border-border dark:bg-muted/10">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {headerBadge}
          <span className="text-xs text-muted-foreground">{headerDescription}</span>
        </div>
        {canEdit && (onAddDefaults || onDeleteAll) ? (
          <div className="flex flex-wrap items-center gap-1">
            {onAddDefaults ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={onAddDefaults}
                disabled={isAddingDefaults || busyKey !== null}
              >
                {isAddingDefaults ? "追加中…" : "＋デフォルト"}
              </Button>
            ) : null}
            {onDeleteAll ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[11px] text-destructive hover:text-destructive"
                onClick={onDeleteAll}
                disabled={busyKey !== null}
              >
                全削除
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {representatives.length === 0 ? (
        <p className={settingsFlatHint}>種目はまだありません。</p>
      ) : (
        <ul className={settingsFlatList} role="list">
          {representatives.map((event) => {
            const gk = eventCardGroupKey(event);
            const isEditing = editingGroupKey === gk;
            const busy = busyKey === gk;
            const sexOption = getEventSexOptionFromEvents(
              sectionEvents,
              event.name,
              event.category,
              event.type
            );
            const eligibilitySubtitle = formatEventEligibilitySubtitle({
              event,
              ageCategories,
              useCategoryAllowList: useEventCategoryAllowList,
            });
            const label = formatEventListRowLabel({
              storedEventName: event.name,
              ageCategoryName: tabAgeCategoryName,
              sexOption,
              eligibilitySubtitle,
            });

            if (isEditing && editDraft) {
              return (
                <li key={gk}>
                  <div className={cn(settingsFlatEditSurface, "space-y-2")}>
                    <EventFormFields
                      draft={editDraft}
                      setDraft={(updater) =>
                        setEditDraft((prev) => {
                          if (!prev) return prev;
                          return typeof updater === "function" ? updater(prev) : updater;
                        })
                      }
                      disabled={busy}
                      useEventCategoryAllowList={useEventCategoryAllowList}
                      ageCategories={ageCategories}
                      type={type}
                      idPrefix={`edit-${gk}`}
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2.5 text-[11px]"
                        disabled={busy}
                        onClick={() => void handleSaveEdit(event)}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                            保存中
                          </>
                        ) : (
                          "保存"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-[11px]"
                        disabled={busy}
                        onClick={cancelEdit}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={gk} className={settingsFlatRow}>
                <p className="min-w-0 flex-1 truncate text-xs leading-snug" title={label}>
                  <span className="font-medium text-foreground">{label}</span>
                </p>
                {canEdit ? (
                  <div className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={formLocked && !isEditing}
                      aria-label={`${label} を編集`}
                      onClick={() => startEdit(event)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={formLocked}
                      aria-label={`${label} を削除`}
                      onClick={() => void handleDelete(event)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-2 border-t border-border/40 pt-2">
          <p className="text-[10px] font-medium text-muted-foreground">種目を追加</p>
          <EventFormFields
            draft={addDraft}
            setDraft={setAddDraft}
            disabled={busyKey === "__add__" || editingGroupKey !== null}
            useEventCategoryAllowList={useEventCategoryAllowList}
            ageCategories={ageCategories}
            type={type}
            idPrefix="add"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 px-3 text-[11px]"
              disabled={
                busyKey !== null ||
                editingGroupKey !== null ||
                !addDraft.name.trim()
              }
              onClick={() => void handleAdd()}
            >
              {busyKey === "__add__" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  追加中
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  追加
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
