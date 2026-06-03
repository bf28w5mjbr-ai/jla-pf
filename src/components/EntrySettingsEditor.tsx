"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  datetimeLocalInputValueToUtcIsoString,
  formatDateForDatetimeLocalInput,
} from "@/lib/datetimeLocal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bold, Coins, Eye, Info, Plus, Trash2, Undo2 } from "lucide-react";
import {
  competitionEventCategoryScopeLabel,
  resolveCompetitionEventCategoryScope,
} from "@/lib/competitionEventCategoryScope";
import { cn } from "@/lib/utils";
import { birthRangeFormKey } from "@/lib/eventSiblingGroup";
import {
  buildEntryPeriodExtensionAnnouncement,
  buildEventAddedAnnouncement,
  buildEventSexOptionExpandAnnouncement,
  eventSexOptionAddsGenders,
  isPeriodShortening,
  PUBLISHED_ENTRY_PERIOD_SHORTEN_FORBIDDEN_MESSAGE,
} from "@/lib/autoEntryChangeAnnouncement";
import {
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
} from "@/lib/competitionEntryAgeTiered";
import { toEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";
import {
  ENTRY_PLEDGE_TEXT_MAX_CHARS,
  wrapMarkdownBoldAroundSelection,
} from "@/lib/entryPledge";
import SimpleMarkdown from "@/components/SimpleMarkdown";
import CompetitionEntryQualificationsEditor from "@/components/CompetitionEntryQualificationsEditor";

// デフォルト種目リスト
const DEFAULT_EVENTS = {
  POOL: {
    INDIVIDUAL: [
      "障害物スイム（200m）",
      "マネキンキャリー（50m）",
      "レスキューメドレー（100m）",
      "マネキンキャリー・ウィズフィン（100m）",
      "マネキントウ・ウィズフィン（100m）",
      "スーパーライフセーバー（200m）",
    ],
    TEAM: [
      "ラインスロー（12.5m）",
      "マネキンリレー（4×25m）",
      "障害物リレー（4×50m）",
      "メドレーリレー（4×50m）",
      "プールライフセーバーリレー（4×50m）",
    ],
  },
  OCEAN: {
    INDIVIDUAL: [
      "サーフレース",
      "サーフスキー",
      "ボードレース",
      "ビーチフラッグス",
      "ビーチスプリント",
      "2kmビーチラン",
      "オーシャンマン",
      "オーシャンウーマン",
    ],
    TEAM: [
      "レスキューチューブレスキュー",
      "ボードレスキュー",
      "ビーチリレー",
      "オーシャンマンリレー",
      "オーシャンウーマンリレー",
    ],
  },
};

/** 種目設定カードのアンカー（クイックナビからジャンプ） */
function eventSettingsCardDomId(eventId: string) {
  return `ev-settings-${eventId}`;
}

type Event = {
  id: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  type: "INDIVIDUAL" | "TEAM";
  category: "POOL" | "OCEAN";
  requiresEntryTime: boolean;
  displayOrder: number;
  minAge?: number | null;
  maxAge?: number | null;
  eligibleBirthDateFrom?: Date | string | null;
  eligibleBirthDateTo?: Date | string | null;
  /** 1レースあたりの最大レーン数（全ラウンド共通・プール／オーシャン） */
  preliminaryHeatLaneCount?: number | null;
  /** スタートリストのラウンド数（全ラウンドのタブ数） */
  startListRoundCount?: number;
  /** チーム種目: リレー等のポジション数 */
  teamRelayPositionCount?: number | null;
  /** チーム種目: ポジション名（JSON 配列） */
  teamRelayPositionNames?: unknown;
  /** チーム種目: 同一クラブあたりのチーム数上限（null は制限なし） */
  maxTeamEntriesPerClub?: number | null;
  /** 年齢カテゴリに連動する場合（手動の生年月日一括保存で解除される） */
  ageCategoryId?: string | null;
};

/** 種目カードで男女行をまとめるキー（代表行の id と種目名ドラフトの整合用） */
function eventCardGroupKey(event: Pick<Event, "category" | "type" | "name">) {
  return `${event.category}:${event.type}:${event.name}`;
}

function groupHasDeleteDraft(
  rep: Pick<Event, "category" | "type" | "name">,
  scope: Event[],
  eventDeleteDrafts: Record<string, boolean>
) {
  const gk = eventCardGroupKey(rep);
  return scope.some((e) => eventCardGroupKey(e) === gk && eventDeleteDrafts[e.id]);
}

function getNameDraftTextForGroup(
  rep: Pick<Event, "id" | "name" | "category" | "type">,
  eventNameDrafts: Record<string, string>,
  scope: Event[]
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(eventNameDrafts, rep.id)) {
    return eventNameDrafts[rep.id];
  }
  const gk = eventCardGroupKey(rep);
  for (const e of scope) {
    if (eventCardGroupKey(e) !== gk) continue;
    if (Object.prototype.hasOwnProperty.call(eventNameDrafts, e.id)) {
      return eventNameDrafts[e.id];
    }
  }
  return undefined;
}

export type CompetitionAgeCategoryDraft = {
  id: string;
  name: string;
  displayOrder: number;
  eligibleBirthDateFrom: Date | string | null;
  eligibleBirthDateTo: Date | string | null;
};

function buildCategoryFeeDraft(
  categories: CompetitionAgeCategoryDraft[],
  tiers: ReturnType<typeof parseAgeCategoryFeeTiers>
): Record<string, { individual: string; team: string }> {
  const map: Record<string, { individual: string; team: string }> = {};
  for (const c of categories) {
    const t = tiers?.find((x) => x.ageCategoryId === c.id);
    map[c.id] = {
      individual: String(t?.individualEntryFee ?? 0),
      team: String(t?.teamEntryFeePerTeam ?? 0),
    };
  }
  return map;
}

function teamRelayStateKey(
  category: "POOL" | "OCEAN",
  eventName: string,
  ageCategoryId?: string | null
) {
  return `${category}:${ageCategoryId ?? "__NONE__"}:${eventName}`;
}

function parseTeamRelayNamesFromEvent(e: Event): string[] {
  const v = e.teamRelayPositionNames;
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTeamRelayPositionsMap(evts: Event[]) {
  const map: Record<
    string,
    { count: string; namesText: string; maxTeamEntriesPerClub: string }
  > = {};
  for (const e of evts) {
    if (e.type !== "TEAM") continue;
    const k = teamRelayStateKey(e.category, e.name, e.ageCategoryId);
    if (map[k]) continue;
    const count =
      typeof e.teamRelayPositionCount === "number" && e.teamRelayPositionCount >= 1
        ? String(e.teamRelayPositionCount)
        : "";
    const maxCap =
      typeof e.maxTeamEntriesPerClub === "number" && e.maxTeamEntriesPerClub >= 1
        ? String(e.maxTeamEntriesPerClub)
        : "";
    map[k] = {
      count,
      namesText: parseTeamRelayNamesFromEvent(e).join("\n"),
      maxTeamEntriesPerClub: maxCap,
    };
  }
  return map;
}

type SexOption = "BOTH" | "MALE_ONLY" | "FEMALE_ONLY" | "MIXED_ONLY";

type EntryFee = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
  ageFeeTiers?: AgeFeeTier[];
};

export type EntrySettingsFocusSection =
  | "period"
  | "qualifications"
  | "eligibility"
  | "ageClub"
  | "multiEvent"
  | "events"
  | "pledge";

type EntrySettingsEditorProps = {
  competitionId: string;
  /** 編集するブロック（項目別編集） */
  focusSection: EntrySettingsFocusSection;
  /** 公開済みかつエントリー成立済みのとき、延長・緩和・種目追加等で告知が必要 */
  requiresParticipantNotice?: boolean;
  isPublished?: boolean;
  initialData: {
    entryStartDate: Date | null;
    entryEndDate: Date | null;
    entryFee?: EntryFee;
    /** フラット配列または `{ ageQualificationTiers }` */
    requiredQualifications?: unknown;
    participantEligibilityText?: string | null;
    allowMultipleEventEntries?: boolean | null;
    maxEventEntriesPerPerson?: number | null;
    requireClubMembership?: boolean | null;
    minAge?: number | null;
    maxAge?: number | null;
    competitionCategory?: string | null;
    entryPledgeEnabled?: boolean | null;
    entryPledgeText?: string | null;
    entryPledgeLockNoOffer?: boolean | null;
    underAgeSystemEnabled?: boolean | null;
    underAgeUThresholds?: number[] | null;
    underAgeOpenEnabled?: boolean | null;
  };
  initialEvents?: Event[];
  initialAgeCategories?: CompetitionAgeCategoryDraft[];
  qualificationTemplates?: { id: string; name: string; kind: string | null }[];
  canEdit: boolean;
  /** 保存成功後に親へ通知（エントリー設定の一覧へ戻す等） */
  onSuccessfulSectionSave?: () => void;
  /** 種目一覧が API 応答で更新されたとき（一覧画面の件数・チップを同期。router.refresh の代替） */
  onEventsChange?: (events: Event[]) => void;
};

/** 種目カード内の種目名編集（男女行の代表1行につき1つ） */
function EventNameField({
  eventId,
  value,
  disabled,
  onChange,
}: {
  eventId: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <Label htmlFor={`ev-name-${eventId}`} className="text-[10px] text-muted-foreground">
        種目名（変更は保存まで保留）
      </Label>
      <Input
        id={`ev-name-${eventId}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 text-sm font-semibold"
      />
    </div>
  );
}

function withOptionalAnnounce(
  message: string | undefined,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return message && message.trim().length > 0
    ? { ...payload, announcementMessage: message.trim() }
    : payload;
}

export default function EntrySettingsEditor({
  competitionId,
  focusSection,
  requiresParticipantNotice = false,
  isPublished = false,
  initialData,
  initialEvents = [],
  initialAgeCategories = [],
  qualificationTemplates = [],
  canEdit,
  onSuccessfulSectionSave,
  onEventsChange,
}: EntrySettingsEditorProps) {
  const router = useRouter();
  const notifySectionSaved = () => {
    onSuccessfulSectionSave?.();
  };
  const [entryStartDate, setEntryStartDate] = useState(
    initialData.entryStartDate
      ? formatDateForDatetimeLocalInput(new Date(initialData.entryStartDate), {
          timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
        })
      : ""
  );
  const [entryEndDate, setEntryEndDate] = useState(
    initialData.entryEndDate
      ? formatDateForDatetimeLocalInput(new Date(initialData.entryEndDate), {
          timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
        })
      : ""
  );

  const initialEntryStartMs =
    initialData.entryStartDate == null
      ? null
      : (() => {
          const t = new Date(initialData.entryStartDate).getTime();
          return Number.isNaN(t) ? null : t;
        })();
  const initialEntryEndMs =
    initialData.entryEndDate == null
      ? null
      : (() => {
          const t = new Date(initialData.entryEndDate).getTime();
          return Number.isNaN(t) ? null : t;
        })();
  const entryPeriodFromServer = useMemo(() => {
    const start =
      initialEntryStartMs == null
        ? ""
        : formatDateForDatetimeLocalInput(new Date(initialEntryStartMs), {
            timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
          });
    const end =
      initialEntryEndMs == null
        ? ""
        : formatDateForDatetimeLocalInput(new Date(initialEntryEndMs), {
            timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
          });
    return { start, end };
  }, [initialEntryStartMs, initialEntryEndMs]);
  useEffect(() => {
    setEntryStartDate(entryPeriodFromServer.start);
    setEntryEndDate(entryPeriodFromServer.end);
  }, [entryPeriodFromServer]);
  const [allowMultipleEventEntries, setAllowMultipleEventEntries] = useState(
    initialData.allowMultipleEventEntries ?? true
  );
  const [maxEventEntriesPerPerson, setMaxEventEntriesPerPerson] = useState(
    typeof initialData.maxEventEntriesPerPerson === "number"
      ? initialData.maxEventEntriesPerPerson.toString()
      : ""
  );
  const [requireClubMembership, setRequireClubMembership] = useState(
    initialData.requireClubMembership ?? false
  );
  const [competitionMinAge, setCompetitionMinAge] = useState(
    typeof initialData.minAge === "number" ? initialData.minAge.toString() : ""
  );
  const [competitionMaxAge, setCompetitionMaxAge] = useState(
    typeof initialData.maxAge === "number" ? initialData.maxAge.toString() : ""
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const [entryPledgeEnabled, setEntryPledgeEnabled] = useState(
    initialData.entryPledgeEnabled ?? false
  );
  const [entryPledgeText, setEntryPledgeText] = useState(
    initialData.entryPledgeText ?? ""
  );
  const [isUpdatingPledge, setIsUpdatingPledge] = useState(false);
  const pledgeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyPledgeBold = useCallback(() => {
    const el = pledgeTextareaRef.current;
    if (!el || !canEdit) return;
    const current = el.value;
    const { value: next, caretStart, caretEnd } = wrapMarkdownBoldAroundSelection(
      current,
      el.selectionStart,
      el.selectionEnd
    );
    flushSync(() => {
      setEntryPledgeText(next);
    });
    el.focus();
    el.setSelectionRange(caretStart, caretEnd);
  }, [canEdit]);

  const isSection = (s: EntrySettingsFocusSection) => focusSection === s;

  // 参加対象者
  const [participantEligibilityText, setParticipantEligibilityText] = useState(
    initialData.participantEligibilityText ?? ""
  );

  // エントリー費用設定
  const [individualEntryFee, setIndividualEntryFee] = useState(
    (
      initialData.entryFee?.individualEntryFee ??
      initialData.entryFee?.baseFee ??
      0
    ).toString()
  );
  const [teamEntryFeePerTeam, setTeamEntryFeePerTeam] = useState(
    (initialData.entryFee?.teamEntryFeePerTeam ?? 0).toString()
  );
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);

  const initialParsedCategoryFeeTiers = parseAgeCategoryFeeTiers(initialData.entryFee as unknown);
  const legacyFeeTiers = useMemo(
    () => parseAgeFeeTiers(initialData.entryFee as unknown),
    [initialData.entryFee]
  );
  const hasLegacyFeeBands = legacyFeeTiers != null && legacyFeeTiers.length > 0;

  const [feeTierMode, setFeeTierMode] = useState<"flat" | "byAgeCategory">(() =>
    initialParsedCategoryFeeTiers?.length ? "byAgeCategory" : "flat"
  );

  const [categoryFeeDraft, setCategoryFeeDraft] = useState<
    Record<string, { individual: string; team: string }>
  >(() => buildCategoryFeeDraft(initialAgeCategories, initialParsedCategoryFeeTiers));

  const [underSystemEnabled, setUnderSystemEnabled] = useState(
    initialData.underAgeSystemEnabled ?? false
  );
  const [underOpenEnabled, setUnderOpenEnabled] = useState(initialData.underAgeOpenEnabled ?? true);
  const [underUThresholdRows, setUnderUThresholdRows] = useState<string[]>(() =>
    [...(initialData.underAgeUThresholds ?? [])]
      .filter((n) => typeof n === "number" && Number.isFinite(n))
      .sort((a, b) => a - b)
      .map((n) => String(n))
  );
  const [isUpdatingUnderAgeSettings, setIsUpdatingUnderAgeSettings] = useState(false);

  useEffect(() => {
    setUnderSystemEnabled(initialData.underAgeSystemEnabled ?? false);
    setUnderOpenEnabled(initialData.underAgeOpenEnabled ?? true);
    setUnderUThresholdRows(
      [...(initialData.underAgeUThresholds ?? [])]
        .filter((n) => typeof n === "number" && Number.isFinite(n))
        .sort((a, b) => a - b)
        .map((n) => String(n))
    );
  }, [
    initialData.underAgeOpenEnabled,
    initialData.underAgeSystemEnabled,
    initialData.underAgeUThresholds,
  ]);

  // 種目管理
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [eventBirthDateRanges, setEventBirthDateRanges] = useState<
    Record<string, { from: string; to: string }>
  >(() => {
    const map: Record<string, { from: string; to: string }> = {};
    initialEvents.forEach((event) => {
      const k = birthRangeFormKey(event);
      if (!map[k]) {
        map[k] = {
          from: toEligibleBirthDateInput(event.eligibleBirthDateFrom),
          to: toEligibleBirthDateInput(event.eligibleBirthDateTo),
        };
      }
    });
    return map;
  });

  const initialAgeCategoriesFingerprint = useMemo(
    () =>
      (initialAgeCategories ?? [])
        .map(
          (c) =>
            `${c.id}\t${c.name}\t${toEligibleBirthDateInput(c.eligibleBirthDateFrom)}\t${toEligibleBirthDateInput(c.eligibleBirthDateTo)}`
        )
        .join("\n"),
    [initialAgeCategories]
  );

  /** 種目を編集するスコープ: 年齢カテゴリ ID / 未分類 */
  const [eventScopeTabId, setEventScopeTabId] = useState<string>(() => {
    const cats = initialAgeCategories ?? [];
    if (cats.length > 0) return cats[0]!.id;
    return "__NONE__";
  });

  const [ageCategories, setAgeCategories] = useState<CompetitionAgeCategoryDraft[]>(
    () => initialAgeCategories ?? []
  );

  useEffect(() => {
    setAgeCategories(initialAgeCategories ?? []);
  }, [initialAgeCategoriesFingerprint, initialAgeCategories]);

  const eventsInTabScope = useMemo(() => {
    if (eventScopeTabId === "__NONE__") {
      return events.filter((e) => e.ageCategoryId == null || e.ageCategoryId === "");
    }
    return events.filter((e) => e.ageCategoryId === eventScopeTabId);
  }, [events, eventScopeTabId]);

  useEffect(() => {
    if (eventScopeTabId === "__NONE__") {
      const hasUncategorizedEvents = events.some(
        (e) => e.ageCategoryId == null || e.ageCategoryId === ""
      );
      if (ageCategories.length > 0 && !hasUncategorizedEvents) {
        setEventScopeTabId(ageCategories[0]!.id);
      }
      return;
    }
    if (!ageCategories.some((c) => c.id === eventScopeTabId)) {
      const next = ageCategories[0]?.id ?? "__NONE__";
      setEventScopeTabId(next);
    }
  }, [ageCategories, eventScopeTabId, events]);

  const mergeEventBirthDateRangesFromSync = (
    prev: Record<string, { from: string; to: string }>,
    updatedEvents: Event[]
  ) => {
    const next: Record<string, { from: string; to: string }> = {};
    updatedEvents.forEach((event) => {
      const k = birthRangeFormKey(event);
      if (next[k]) return;
      const kept = prev[k];
      if (kept) {
        next[k] = { ...kept };
      } else {
        next[k] = {
          from: toEligibleBirthDateInput(event.eligibleBirthDateFrom),
          to: toEligibleBirthDateInput(event.eligibleBirthDateTo),
        };
      }
    });
    return next;
  };

  const mergeTeamRelayPositionsFromSync = (
    prev: Record<
      string,
      { count: string; namesText: string; maxTeamEntriesPerClub?: string }
    >,
    updatedEvents: Event[]
  ) => {
    const next = buildTeamRelayPositionsMap(updatedEvents);
    for (const key of Object.keys(prev)) {
      const stillThere = updatedEvents.some(
        (e) =>
          e.type === "TEAM" && teamRelayStateKey(e.category, e.name, e.ageCategoryId) === key
      );
      if (stillThere) {
        const p = prev[key];
        next[key] = {
          ...next[key],
          count: p.count,
          namesText: p.namesText,
          maxTeamEntriesPerClub:
            p.maxTeamEntriesPerClub ?? next[key].maxTeamEntriesPerClub,
        };
      }
    }
    return next;
  };

  const [eventTeamRelayPositions, setEventTeamRelayPositions] = useState<
    Record<
      string,
      { count: string; namesText: string; maxTeamEntriesPerClub: string }
    >
  >(() => buildTeamRelayPositionsMap(initialEvents));
  const [bulkSavingAllEventTables, setBulkSavingAllEventTables] = useState(false);
  type SyncEventsOptions = {
    /** 保存直後の再取得など、サーバー値でフォームを上書きするとき true */
    resetEventTableForm?: boolean;
  };

  const syncEvents = (updatedEvents: Event[], options?: SyncEventsOptions) => {
    setEvents(updatedEvents);
    if (options?.resetEventTableForm) {
      const updatedMap: Record<string, { from: string; to: string }> = {};
      updatedEvents.forEach((event) => {
        const k = birthRangeFormKey(event);
        if (!updatedMap[k]) {
          updatedMap[k] = {
            from: toEligibleBirthDateInput(event.eligibleBirthDateFrom),
            to: toEligibleBirthDateInput(event.eligibleBirthDateTo),
          };
        }
      });
      setEventBirthDateRanges(updatedMap);
      setEventTeamRelayPositions(buildTeamRelayPositionsMap(updatedEvents));
      onEventsChange?.(updatedEvents);
      return;
    }

    setEventBirthDateRanges((prev) => mergeEventBirthDateRangesFromSync(prev, updatedEvents));
    setEventTeamRelayPositions((prev) => mergeTeamRelayPositionsFromSync(prev, updatedEvents));
    onEventsChange?.(updatedEvents);
  };

  const [poolIndividualName, setPoolIndividualName] = useState("");
  const [poolTeamName, setPoolTeamName] = useState("");
  const [oceanIndividualName, setOceanIndividualName] = useState("");
  const [oceanTeamName, setOceanTeamName] = useState("");
  const [isAddingPoolIndividual, setIsAddingPoolIndividual] = useState(false);
  const [isAddingPoolTeam, setIsAddingPoolTeam] = useState(false);
  const [isAddingOceanIndividual, setIsAddingOceanIndividual] = useState(false);
  const [isAddingOceanTeam, setIsAddingOceanTeam] = useState(false);
  const [poolIndividualError, setPoolIndividualError] = useState<string | null>(null);
  const [poolTeamError, setPoolTeamError] = useState<string | null>(null);
  const [oceanIndividualError, setOceanIndividualError] = useState<string | null>(null);
  const [oceanTeamError, setOceanTeamError] = useState<string | null>(null);

  // デフォルト種目追加のローディング状態
  const [isAddingDefaultEvents, setIsAddingDefaultEvents] = useState<string | null>(null);

  const categoryScope = resolveCompetitionEventCategoryScope(
    initialData.competitionCategory
  );
  const hasTeamEvents = events.some((event) => event.type === "TEAM");
  const hasIndividualEvents = events.some((event) => event.type === "INDIVIDUAL");

  const [eventSexOptionDrafts, setEventSexOptionDrafts] = useState<Record<string, SexOption>>({});
  const [eventNameDrafts, setEventNameDrafts] = useState<Record<string, string>>({});
  const [eventDeleteDrafts, setEventDeleteDrafts] = useState<Record<string, boolean>>({});
  const eventCardRepresentativesInScope = useMemo(
    () =>
      Array.from(
        new Map(
          eventsInTabScope.map((e) => [eventCardGroupKey(e), e] as const)
        ).values()
      ),
    [eventsInTabScope]
  );

  const getEventSexOption = useCallback(
    (eventName: string, category: "POOL" | "OCEAN", type: "INDIVIDUAL" | "TEAM"): SexOption => {
      const sexes = new Set(
        eventsInTabScope
          .filter(
            (event) =>
              event.name === eventName &&
              event.category === category &&
              event.type === type
          )
          .map((event) => event.sex)
      );
      if (sexes.has("OTHER")) return "MIXED_ONLY";
      if (sexes.has("MALE") && sexes.has("FEMALE")) return "BOTH";
      if (sexes.has("MALE")) return "MALE_ONLY";
      if (sexes.has("FEMALE")) return "FEMALE_ONLY";
      return "BOTH";
    },
    [eventsInTabScope]
  );

  const hasPendingEventSexOptionChanges = useMemo(
    () =>
      eventCardRepresentativesInScope.some((event) => {
        const key = makeEventSexOptionKey(event);
        if (!Object.prototype.hasOwnProperty.call(eventSexOptionDrafts, key)) return false;
        return eventSexOptionDrafts[key] !== getEventSexOption(event.name, event.category, event.type);
      }),
    [eventCardRepresentativesInScope, eventSexOptionDrafts, getEventSexOption]
  );

  const hasPendingEventNameChanges = useMemo(
    () =>
      eventCardRepresentativesInScope.some((event) => {
        if (groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) return false;
        const raw = getNameDraftTextForGroup(event, eventNameDrafts, eventsInTabScope);
        if (raw === undefined) return false;
        const draft = raw.trim();
        return draft.length > 0 && draft !== event.name.trim();
      }),
    [eventCardRepresentativesInScope, eventDeleteDrafts, eventNameDrafts, eventsInTabScope]
  );

  const hasPendingEventDeleteChanges = useMemo(
    () =>
      eventCardRepresentativesInScope.some((event) =>
        groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)
      ),
    [eventCardRepresentativesInScope, eventDeleteDrafts, eventsInTabScope]
  );

  /** 種目ごとの性別区分ドラフトを API に反映（トースト・再取得・ドラフトクリアは呼び出し側） */
  const applyEventSexOptionDraftsToServer = async () => {
    const loadEvents = async (): Promise<Event[]> => {
      const listRes = await fetch(`/api/competitions/${competitionId}/events`);
      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(
          typeof err.message === "string" ? err.message : "種目一覧の取得に失敗しました"
        );
      }
      const data = (await listRes.json()) as { events: Event[] };
      return data.events;
    };

    let liveEvents = await loadEvents();

    const resolvePatchTargetId = (ev: Event): string | null => {
      if (liveEvents.some((e) => e.id === ev.id)) return ev.id;
      const nm = ev.name.trim();
      const hit = liveEvents.find(
        (e) =>
          e.category === ev.category && e.type === ev.type && e.name.trim() === nm
      );
      return hit?.id ?? null;
    };

    for (const event of eventCardRepresentativesInScope) {
      if (groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) continue;
      const key = makeEventSexOptionKey(event);
      const hasDraft = Object.prototype.hasOwnProperty.call(eventSexOptionDrafts, key);
      if (!hasDraft) continue;
      const nextSexOption = eventSexOptionDrafts[key];
      const currentSexOption = getEventSexOption(event.name, event.category, event.type);
      if (currentSexOption === nextSexOption) continue;

      const addsGenders = eventSexOptionAddsGenders(eventsInTabScope, event, nextSexOption);
      const announce = addsGenders
        ? buildEventSexOptionExpandAnnouncement(event.name, requiresParticipantNotice)
        : undefined;

      const targetId = resolvePatchTargetId(event);
      if (!targetId || !liveEvents.some((e) => e.id === targetId)) {
        throw new Error(
          `「${event.name}」に対応する種目が見つかりません。ページを再読み込みしてからやり直してください。`
        );
      }

      const response = await fetch(`/api/competitions/${competitionId}/events/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(announce, {
            sexOption: nextSexOption,
          })
        ),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        events?: Event[];
      };
      if (!response.ok) {
        throw new Error(
          typeof body.message === "string" ? body.message : "種目性別の更新に失敗しました"
        );
      }
      if (Array.isArray(body.events) && body.events.length > 0) {
        liveEvents = body.events;
      }
    }
  };

  /** 種目名ドラフトを API に反映（削除予定の種目は除外） */
  const applyEventNameDraftsToServer = async () => {
    const listRes = await fetch(`/api/competitions/${competitionId}/events`);
    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      throw new Error(
        typeof err.message === "string" ? err.message : "種目一覧の取得に失敗しました"
      );
    }
    const { events: liveEvents } = (await listRes.json()) as { events: Event[] };
    const liveById = new Map(liveEvents.map((e) => [e.id, e]));

    for (const event of eventCardRepresentativesInScope) {
      if (groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) continue;
      const rawDraft = getNameDraftTextForGroup(event, eventNameDrafts, eventsInTabScope);
      if (rawDraft === undefined) continue;
      const next = rawDraft.trim();
      if (!next || next === event.name.trim()) continue;

      let targetId = event.id;
      if (!liveById.has(targetId)) {
        const group = liveEvents.find(
          (e) =>
            e.category === event.category &&
            e.type === event.type &&
            e.name.trim() === event.name.trim()
        );
        if (!group) {
          throw new Error(
            `「${event.name}」に対応する種目が見つかりません。ページを再読み込みしてからやり直してください。`
          );
        }
        targetId = group.id;
      }

      const response = await fetch(`/api/competitions/${competitionId}/events/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          typeof err.message === "string" ? err.message : `「${event.name}」の種目名更新に失敗しました`
        );
      }
    }
  };

  /** 削除ドラフトを API に反映（男女行まとめて削除） */
  const applyEventDeleteDraftsToServer = async () => {
    for (const event of eventCardRepresentativesInScope) {
      if (!groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) continue;
      const response = await fetch(`/api/competitions/${competitionId}/events/${event.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          typeof err.message === "string" ? err.message : `「${event.name}」の削除に失敗しました`
        );
      }
    }
  };

  const selectedCategory: "POOL" | "OCEAN" =
    categoryScope === "OCEAN_ONLY" ? "OCEAN" : "POOL";
  const categoryMeta =
    selectedCategory === "POOL"
      ? {
          title: "種目設定（プール）",
          shortHint: "エントリー時は種目ごとのタイム入力が必要です。",
          toneClass: "border-orange-200/70",
        }
      : {
          title: "種目設定（オーシャン）",
          shortHint: "エントリーは種目の選択のみです（タイム入力なし）。",
          toneClass: "border-cyan-200/70",
        };

  const sexOptionLabel = (sexOption: SexOption) => {
    if (sexOption === "MALE_ONLY") return "男子";
    if (sexOption === "FEMALE_ONLY") return "女子";
    if (sexOption === "MIXED_ONLY") return "混合";
    return "男子・女子";
  };

  const sexSetForOption = (option: SexOption): Set<"MALE" | "FEMALE" | "OTHER"> => {
    if (option === "MALE_ONLY") return new Set(["MALE"]);
    if (option === "FEMALE_ONLY") return new Set(["FEMALE"]);
    if (option === "MIXED_ONLY") return new Set(["OTHER"]);
    return new Set(["MALE", "FEMALE"]);
  };

  const renderSexOptionButtons = (
    value: SexOption,
    onChange: (next: SexOption) => void,
    disabled: boolean,
    compact = false
  ) => {
    const options: { value: SexOption; label: string }[] = [
      { value: "BOTH", label: "男女" },
      { value: "MALE_ONLY", label: "男" },
      { value: "FEMALE_ONLY", label: "女" },
      { value: "MIXED_ONLY", label: "混" },
    ];
    return (
      <div
        className={`inline-flex items-center rounded-md border border-input bg-background p-1 ${
          compact ? "h-8" : "h-10"
        }`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`rounded px-2 py-1 transition ${
              compact ? "text-[11px]" : "text-xs"
            } ${
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  };

  const getEventGenderLabel = (
    eventName: string,
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ) => {
    const sexes = new Set(
      eventsInTabScope
        .filter(
          (event) =>
            event.name === eventName &&
            event.category === category &&
            event.type === type
        )
        .map((event) => event.sex)
    );
    if (sexes.has("MALE") && sexes.has("FEMALE")) return "（男女）";
    if (sexes.has("OTHER")) return "（混合）";
    if (sexes.has("MALE")) return "（男子）";
    if (sexes.has("FEMALE")) return "（女子）";
    return "";
  };

  function makeEventSexOptionKey(event: Event) {
    return `${event.category}-${event.type}-${event.name}`;
  }

  // デフォルト種目を一括追加
  const handleAddDefaultEvents = async (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM",
    sexOption: SexOption = "BOTH"
  ) => {
    const loadingKey = `${category}-${type}`;
    setIsAddingDefaultEvents(loadingKey);
    const defaultEventNames = DEFAULT_EVENTS[category][type];
    const requestedSexes: Array<"MALE" | "FEMALE" | "OTHER"> =
      sexOption === "MALE_ONLY"
        ? ["MALE"]
        : sexOption === "FEMALE_ONLY"
          ? ["FEMALE"]
          : sexOption === "MIXED_ONLY"
            ? ["OTHER"]
            : ["MALE", "FEMALE"];

    const categoryEvents = eventsInTabScope.filter((e) => e.category === category && e.type === type);
    const newEventNames = defaultEventNames.filter((name) => {
      const sameNameEvents = categoryEvents.filter((event) => event.name === name);
      if (sameNameEvents.length === 0) return true;
      const existingSexes = new Set(sameNameEvents.map((event) => event.sex));
      return requestedSexes.some((sex) => !existingSexes.has(sex));
    });

    if (newEventNames.length === 0) {
      toast.info(
        `${category === "POOL" ? "プール" : "オーシャン"}${
          type === "INDIVIDUAL" ? "個人" : "チーム"
        }種目は、選択中の性別（${sexOptionLabel(sexOption)}）で既に登録済みです`
      );
      setIsAddingDefaultEvents(null);
      return;
    }

    const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
    const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";
    
    const loadingToastId = toast.loading(`${categoryLabel}${typeLabel}種目を追加中...`);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ageCategoryId: eventScopeTabId === "__NONE__" ? null : eventScopeTabId,
          items: newEventNames.map((eventName) =>
            withOptionalAnnounce(
              buildEventAddedAnnouncement(eventName, requiresParticipantNotice),
              {
                name: eventName,
                type,
                category,
                sexOption,
              }
            )
          ),
        }),
      });

      toast.dismiss(loadingToastId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          typeof err.message === "string" ? err.message : "種目の一括追加に失敗しました"
        );
      }

      const { events: updatedEvents } = await response.json();
      syncEvents(updatedEvents);
      toast.success(
        `${categoryLabel}${typeLabel}種目を追加しました（${sexOptionLabel(sexOption)} / ${newEventNames.length}件）`
      );
    } catch (error) {
      console.error("デフォルト種目追加エラー:", error);
      toast.dismiss(loadingToastId);
      toast.error(
        error instanceof Error ? error.message : "デフォルト種目の追加に失敗しました"
      );
    } finally {
      setIsAddingDefaultEvents(null);
    }
  };

  // 種目を一括削除（ドラフト）
  const handleDeleteAllEvents = async (category: "POOL" | "OCEAN", type: "INDIVIDUAL" | "TEAM") => {
    const targetEvents = Array.from(
      new Map(
        eventsInTabScope
          .filter((e) => e.category === category && e.type === type)
          .map((e) => [eventCardGroupKey(e), e] as const)
      ).values()
    );
    if (targetEvents.length === 0) {
      toast.info("削除する種目がありません");
      return;
    }

    const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
    const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";

    if (
      !confirm(
        `${categoryLabel}${typeLabel}種目をすべて削除予定にしますか？（${targetEvents.length}種目）\n\n「このタブを保存」で確定されます。`
      )
    ) {
      return;
    }
    setEventDeleteDrafts((prev) => {
      const next = { ...prev };
      for (const ev of targetEvents) {
        const gk = eventCardGroupKey(ev);
        for (const e of eventsInTabScope) {
          if (eventCardGroupKey(e) === gk) next[e.id] = true;
        }
      }
      return next;
    });
    toast.success(`${categoryLabel}${typeLabel}種目を削除予定に追加しました`);
  };

  const handleSavePeriod = async () => {
    if (!entryStartDate || !entryEndDate) {
      toast.error("エントリー期間を入力してください");
      return;
    }
    const entryStartUtcIso = datetimeLocalInputValueToUtcIsoString(entryStartDate, {
      timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
    });
    const entryEndUtcIso = datetimeLocalInputValueToUtcIsoString(entryEndDate, {
      timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
    });
    if (!entryStartUtcIso || !entryEndUtcIso) {
      toast.error("エントリー期間の日時形式が正しくありません");
      return;
    }
    if (new Date(entryStartUtcIso) > new Date(entryEndUtcIso)) {
      toast.error("エントリー終了日時はエントリー開始日時より後にしてください");
      return;
    }
    if (
      isPublished &&
      isPeriodShortening(
        initialData.entryStartDate,
        initialData.entryEndDate,
        new Date(entryStartUtcIso),
        new Date(entryEndUtcIso)
      )
    ) {
      toast.error(PUBLISHED_ENTRY_PERIOD_SHORTEN_FORBIDDEN_MESSAGE);
      return;
    }
    const announce = buildEntryPeriodExtensionAnnouncement(
      initialData.entryStartDate,
      initialData.entryEndDate,
      entryStartUtcIso,
      entryEndUtcIso,
      requiresParticipantNotice
    );
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(announce, {
            entryStartDate: entryStartUtcIso,
            entryEndDate: entryEndUtcIso,
          })
        ),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg =
          typeof errBody === "object" &&
          errBody !== null &&
          "message" in errBody &&
          typeof (errBody as { message: unknown }).message === "string"
            ? (errBody as { message: string }).message
            : "エントリー期間の更新に失敗しました";
        toast.error(msg);
        return;
      }
      toast.success("エントリー期間を更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("エントリー期間の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "エントリー期間の更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveUnderAgeSettings = async (applyTemplate: boolean) => {
    const parts = underUThresholdRows
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 150);
    const unique = Array.from(new Set(parts)).sort((a, b) => a - b);
    setIsUpdatingUnderAgeSettings(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/under-age-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          underAgeSystemEnabled: underSystemEnabled,
          underAgeUThresholds: unique,
          underAgeOpenEnabled: underOpenEnabled,
          applyTemplate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.message === "string" ? err.message : "更新に失敗しました");
      }
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      toast.success(
        typeof data.message === "string"
          ? data.message
          : applyTemplate
            ? "アンダー制テンプレートを AGEカテゴリへ反映しました"
            : "アンダー制テンプレートを保存しました"
      );
      router.refresh();
      notifySectionSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setIsUpdatingUnderAgeSettings(false);
    }
  };

  const handleSaveAgeClub = async () => {
    const minAgeValue = competitionMinAge.trim() === "" ? null : Number(competitionMinAge);
    const maxAgeValue = competitionMaxAge.trim() === "" ? null : Number(competitionMaxAge);
    if (minAgeValue !== null && (Number.isNaN(minAgeValue) || minAgeValue < 0)) {
      toast.error("最小年齢は0以上の数値で入力してください");
      return;
    }
    if (maxAgeValue !== null && (Number.isNaN(maxAgeValue) || maxAgeValue < 0)) {
      toast.error("最大年齢は0以上の数値で入力してください");
      return;
    }
    if (minAgeValue !== null && maxAgeValue !== null && minAgeValue > maxAgeValue) {
      toast.error("最小年齢は最大年齢以下にしてください");
      return;
    }
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireClubMembership,
          minAge: minAgeValue,
          maxAge: maxAgeValue,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "年齢・所属クラブ設定の更新に失敗しました");
      }
      toast.success("年齢・所属クラブを更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("年齢・所属クラブの更新エラー:", error);
      toast.error(
        error instanceof Error ? error.message : "年齢・所属クラブ設定の更新に失敗しました"
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveMultiEvent = async () => {
    const maxEventEntriesValue =
      maxEventEntriesPerPerson.trim() === "" ? null : Number(maxEventEntriesPerPerson);
    if (
      maxEventEntriesValue !== null &&
      (!Number.isInteger(maxEventEntriesValue) || maxEventEntriesValue < 1)
    ) {
      toast.error("エントリー可能種目数の上限は1以上の整数で入力してください");
      return;
    }
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowMultipleEventEntries,
          maxEventEntriesPerPerson: allowMultipleEventEntries ? maxEventEntriesValue : 1,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "種目エントリー数の更新に失敗しました");
      }
      toast.success("種目エントリー数の設定を更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("種目エントリー数の更新エラー:", error);
      toast.error(
        error instanceof Error ? error.message : "種目エントリー数の更新に失敗しました"
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSavePledge = async () => {
    if (entryPledgeEnabled && !entryPledgeText.trim()) {
      toast.error("誓約を有効にする場合は誓約文を入力してください");
      return;
    }
    if (entryPledgeText.length > ENTRY_PLEDGE_TEXT_MAX_CHARS) {
      toast.error(`誓約文は${ENTRY_PLEDGE_TEXT_MAX_CHARS}文字以内にしてください`);
      return;
    }
    setIsUpdatingPledge(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryPledgeEnabled,
          entryPledgeText: entryPledgeText.trim(),
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg =
          typeof errBody === "object" &&
          errBody !== null &&
          "message" in errBody &&
          typeof (errBody as { message: unknown }).message === "string"
            ? (errBody as { message: string }).message
            : "誓約設定の更新に失敗しました";
        toast.error(msg);
        return;
      }
      toast.success("誓約設定を更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("誓約設定の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "誓約設定の更新に失敗しました");
    } finally {
      setIsUpdatingPledge(false);
    }
  };

  const handleSaveEligibility = async () => {
    setIsUpdating(true);
    try {
      const eligibilityResponse = await fetch(
        `/api/competitions/${competitionId}/participant-eligibility`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantEligibilityText,
          }),
        }
      );
      if (!eligibilityResponse.ok) {
        const error = await eligibilityResponse.json();
        throw new Error(error.message || "参加対象者の更新に失敗しました");
      }
      toast.success("参加対象者の説明を更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("参加対象者の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "参加対象者の更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  // エントリー費用更新
  const handleUpdateEntryFee = async () => {
    if (!hasIndividualEvents && !hasTeamEvents) {
      toast.error("種目を登録してから参加費を設定してください");
      return;
    }

    let payload: Record<string, unknown>;

    if (feeTierMode === "byAgeCategory") {
      if (ageCategories.length === 0) {
        toast.error("AGEカテゴリを大会出場条件で作成してから、AGEカテゴリ別の参加費を設定してください");
        return;
      }
      const tiers: {
        ageCategoryId: string;
        individualEntryFee: number;
        teamEntryFeePerTeam: number;
      }[] = [];
      for (const cat of ageCategories) {
        const row = categoryFeeDraft[cat.id] ?? { individual: "0", team: "0" };
        const individualEntryFee = parseFloat(row.individual);
        const teamEntryFeePerTeam = parseFloat(row.team);
        if (
          hasIndividualEvents &&
          (!Number.isFinite(individualEntryFee) || individualEntryFee < 0)
        ) {
          toast.error("各カテゴリの個人エントリー料金を正しく入力してください");
          return;
        }
        if (hasTeamEvents && (!Number.isFinite(teamEntryFeePerTeam) || teamEntryFeePerTeam < 0)) {
          toast.error("各カテゴリのチーム1組あたり料金を正しく入力してください");
          return;
        }
        tiers.push({
          ageCategoryId: cat.id,
          individualEntryFee: hasIndividualEvents ? individualEntryFee : 0,
          teamEntryFeePerTeam: hasTeamEvents ? teamEntryFeePerTeam : 0,
        });
      }
      payload = { pricingMode: "byAgeCategory", ageCategoryFeeTiers: tiers };
    } else {
      const individualEntryFeeNum = hasIndividualEvents
        ? parseFloat(individualEntryFee)
        : 0;
      if (hasIndividualEvents && (isNaN(individualEntryFeeNum) || individualEntryFeeNum < 0)) {
        toast.error("個人エントリー料金を正しく入力してください");
        return;
      }

      const teamEntryFeePerTeamNum = hasTeamEvents ? parseFloat(teamEntryFeePerTeam) : 0;
      if (hasTeamEvents && (isNaN(teamEntryFeePerTeamNum) || teamEntryFeePerTeamNum < 0)) {
        toast.error("チーム種目の1チームあたり料金を正しく入力してください");
        return;
      }

      payload = {
        pricingMode: "flat",
        individualEntryFee: individualEntryFeeNum,
        teamEntryFeePerTeam: teamEntryFeePerTeamNum,
      };
    }

    setIsUpdatingFee(true);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-fee`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const feeBody = (await response.json().catch(() => ({}))) as {
        message?: string;
        entryFee?: unknown;
      };
      if (!response.ok) {
        throw new Error(feeBody.message || "エントリー費用設定の更新に失敗しました");
      }

      if (feeBody.entryFee != null && feeTierMode === "byAgeCategory") {
        setCategoryFeeDraft(
          buildCategoryFeeDraft(ageCategories, parseAgeCategoryFeeTiers(feeBody.entryFee))
        );
      }

      toast.success("エントリー費用設定を更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("エントリー費用設定の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "エントリー費用設定の更新に失敗しました");
    } finally {
      setIsUpdatingFee(false);
    }
  };

  const handleAddPoolIndividual = async () => {
    if (!poolIndividualName.trim()) {
      setPoolIndividualError("種目名を入力してください");
      return;
    }

    if (isAddingPoolIndividual) return; // 二重送信防止

    setIsAddingPoolIndividual(true);
    setPoolIndividualError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(
            buildEventAddedAnnouncement(poolIndividualName.trim(), requiresParticipantNotice),
            {
              name: poolIndividualName.trim(),
              type: "INDIVIDUAL",
              category: "POOL",
              sexOption: "BOTH",
              ageCategoryId: eventScopeTabId === "__NONE__" ? null : eventScopeTabId,
            }
          )
        ),
      });

      if (!response.ok) {
        const error = await response.json();
        setPoolIndividualError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      syncEvents(newEvents);
      const addedName = poolIndividualName.trim();
      setPoolIndividualName("");
      toast.success(`プール個人種目「${addedName}」を追加しました（${sexOptionLabel("BOTH")}）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setPoolIndividualError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingPoolIndividual(false);
    }
  };

  const handleAddPoolTeam = async () => {
    if (!poolTeamName.trim()) {
      setPoolTeamError("種目名を入力してください");
      return;
    }

    if (isAddingPoolTeam) return; // 二重送信防止

    setIsAddingPoolTeam(true);
    setPoolTeamError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(
            buildEventAddedAnnouncement(poolTeamName.trim(), requiresParticipantNotice),
            {
              name: poolTeamName.trim(),
              type: "TEAM",
              category: "POOL",
              sexOption: "BOTH",
              ageCategoryId: eventScopeTabId === "__NONE__" ? null : eventScopeTabId,
            }
          )
        ),
      });

      if (!response.ok) {
        const error = await response.json();
        setPoolTeamError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      syncEvents(newEvents);
      const addedName = poolTeamName.trim();
      setPoolTeamName("");
      toast.success(`プールチーム種目「${addedName}」を追加しました（${sexOptionLabel("BOTH")}）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setPoolTeamError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingPoolTeam(false);
    }
  };

  const handleAddOceanIndividual = async () => {
    if (!oceanIndividualName.trim()) {
      setOceanIndividualError("種目名を入力してください");
      return;
    }

    if (isAddingOceanIndividual) return; // 二重送信防止

    setIsAddingOceanIndividual(true);
    setOceanIndividualError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(
            buildEventAddedAnnouncement(oceanIndividualName.trim(), requiresParticipantNotice),
            {
              name: oceanIndividualName.trim(),
              type: "INDIVIDUAL",
              category: "OCEAN",
              sexOption: "BOTH",
              ageCategoryId: eventScopeTabId === "__NONE__" ? null : eventScopeTabId,
            }
          )
        ),
      });

      if (!response.ok) {
        const error = await response.json();
        setOceanIndividualError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      syncEvents(newEvents);
      const addedName = oceanIndividualName.trim();
      setOceanIndividualName("");
      toast.success(`オーシャン個人種目「${addedName}」を追加しました（${sexOptionLabel("BOTH")}）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setOceanIndividualError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingOceanIndividual(false);
    }
  };

  const handleAddOceanTeam = async () => {
    if (!oceanTeamName.trim()) {
      setOceanTeamError("種目名を入力してください");
      return;
    }

    if (isAddingOceanTeam) return; // 二重送信防止

    setIsAddingOceanTeam(true);
    setOceanTeamError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(
            buildEventAddedAnnouncement(oceanTeamName.trim(), requiresParticipantNotice),
            {
              name: oceanTeamName.trim(),
              type: "TEAM",
              category: "OCEAN",
              sexOption: "BOTH",
              ageCategoryId: eventScopeTabId === "__NONE__" ? null : eventScopeTabId,
            }
          )
        ),
      });

      if (!response.ok) {
        const error = await response.json();
        setOceanTeamError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      syncEvents(newEvents);
      const addedName = oceanTeamName.trim();
      setOceanTeamName("");
      toast.success(`オーシャンチーム種目「${addedName}」を追加しました（${sexOptionLabel("BOTH")}）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setOceanTeamError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingOceanTeam(false);
    }
  };

  const getEventTableSectionTargets = (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ) => {
    const ageTargets = Array.from(
      new Map(
        eventsInTabScope
          .filter((event) => event.category === category && event.type === type)
          .map((event) => [eventCardGroupKey(event), event])
      ).values()
    );
    const rowTargets = eventsInTabScope.filter((e) => e.category === category && e.type === type);
    return { ageTargets, rowTargets, sectionKey: `${category}-${type}` as const };
  };

  type EventTableValidate =
    | { ok: true }
    | { ok: false; reason: "empty" }
    | { ok: false; message: string };

  const validateEventTableSection = (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ): EventTableValidate => {
    const { ageTargets, rowTargets } = getEventTableSectionTargets(category, type);
    if (rowTargets.length === 0) {
      return { ok: false, reason: "empty" };
    }

    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    for (const event of ageTargets) {
      const range = eventBirthDateRanges[birthRangeFormKey(event)] || { from: "", to: "" };
      const from = range.from.trim();
      const to = range.to.trim();
      if (from && !isoDateRe.test(from)) {
        return {
          ok: false,
          message: `「${event.name}」の参加可能な生年月日（開始）は YYYY-MM-DD で入力してください`,
        };
      }
      if (to && !isoDateRe.test(to)) {
        return {
          ok: false,
          message: `「${event.name}」の参加可能な生年月日（終了）は YYYY-MM-DD で入力してください`,
        };
      }
      if (from && to && from > to) {
        return {
          ok: false,
          message: `「${event.name}」の生年月日の開始は終了以前の日付にしてください`,
        };
      }
    }

    if (type === "TEAM") {
      for (const event of ageTargets) {
        const k = teamRelayStateKey(category, event.name, event.ageCategoryId);
        const st = eventTeamRelayPositions[k] ?? {
          count: "",
          namesText: "",
          maxTeamEntriesPerClub: "",
        };
        const maxRaw = (st.maxTeamEntriesPerClub ?? "").trim();
        if (maxRaw !== "") {
          const nMax = Number(maxRaw);
          if (!Number.isInteger(nMax) || nMax < 1 || nMax > 999) {
            return {
              ok: false,
              message: `「${event.name}」の同一クラブあたりチーム上限は1〜999の整数、または空欄（制限なし）にしてください`,
            };
          }
        }
        const countRaw = st.count.trim();
        const lines = st.namesText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (countRaw === "" && lines.length === 0) {
          continue;
        }
        if (countRaw === "" && lines.length > 0) {
          return {
            ok: false,
            message: `「${event.name}」のチームポジション数を入力してください（ポジション名のみは保存できません）`,
          };
        }
        const n = Number(countRaw);
        if (!Number.isInteger(n) || n < 1 || n > 32) {
          return { ok: false, message: `「${event.name}」のチームポジション数は1〜32の整数にしてください` };
        }
        if (lines.length !== n) {
          return {
            ok: false,
            message: `「${event.name}」のポジション名は${n}行（1行に1ポジション・上から順）にしてください`,
          };
        }
      }
    }

    return { ok: true };
  };

  const persistEventTableSection = async (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ): Promise<number> => {
    const { ageTargets } = getEventTableSectionTargets(category, type);
    let errorCount = 0;

    const patchEvent = async (eventId: string, body: Record<string, unknown>) => {
      const response = await fetch(
        `/api/competitions/${competitionId}/events/${eventId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      return response.ok;
    };

    const ageOk = await Promise.all(
      ageTargets.map((event) => {
        const range = eventBirthDateRanges[birthRangeFormKey(event)] || { from: "", to: "" };
        const fromTrim = range.from.trim();
        const toTrim = range.to.trim();
        if (event.ageCategoryId) {
          const cat = ageCategories.find((c) => c.id === event.ageCategoryId);
          if (cat) {
            const catFrom = toEligibleBirthDateInput(cat.eligibleBirthDateFrom);
            const catTo = toEligibleBirthDateInput(cat.eligibleBirthDateTo);
            if (fromTrim === catFrom && toTrim === catTo) {
              return Promise.resolve(true);
            }
          }
        }
        return patchEvent(event.id, {
          eligibleBirthDateFrom: fromTrim === "" ? null : fromTrim,
          eligibleBirthDateTo: toTrim === "" ? null : toTrim,
        });
      })
    );
    errorCount += ageOk.filter((ok) => !ok).length;

    if (type === "TEAM") {
      const teamOk = await Promise.all(
        ageTargets.map((event) => {
          const k = teamRelayStateKey(category, event.name, event.ageCategoryId);
          const st = eventTeamRelayPositions[k] ?? {
            count: "",
            namesText: "",
            maxTeamEntriesPerClub: "",
          };
          const countRaw = st.count.trim();
          const lines = st.namesText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          const maxTrim = (st.maxTeamEntriesPerClub ?? "").trim();
          const relayBody =
            countRaw === "" && lines.length === 0
              ? { teamRelayPositionCount: null, teamRelayPositionNames: [] as string[] }
              : {
                  teamRelayPositionCount: Number(countRaw),
                  teamRelayPositionNames: lines,
                };
          return patchEvent(event.id, {
            ...relayBody,
            maxTeamEntriesPerClub: maxTrim === "" ? null : Number(maxTrim),
          });
        })
      );
      errorCount += teamOk.filter((ok) => !ok).length;
    }

    return errorCount;
  };

  const refreshEventsFromServer = async () => {
    const response = await fetch(`/api/competitions/${competitionId}/events`);
    if (response.ok) {
      const { events: updatedEvents } = await response.json();
      syncEvents(updatedEvents, { resetEventTableForm: true });
    }
  };

  const EVENT_TABLE_ALL_SECTIONS: ReadonlyArray<
    ["POOL" | "OCEAN", "INDIVIDUAL" | "TEAM"]
  > = [
    ["POOL", "INDIVIDUAL"],
    ["POOL", "TEAM"],
    ["OCEAN", "INDIVIDUAL"],
    ["OCEAN", "TEAM"],
  ];

  /** 種目表＋種目ごとのチェック系ドラフトを、このタブでまとめて保存 */
  const handleBulkUpdateAllEventTables = async () => {
    const active = EVENT_TABLE_ALL_SECTIONS.filter(([c, t]) =>
      eventsInTabScope.some((e) => e.category === c && e.type === t)
    );
    const willSaveSex = Boolean(canEdit) && hasPendingEventSexOptionChanges;
    const willSaveEventNames = Boolean(canEdit) && hasPendingEventNameChanges;
    const willSaveEventDeletes = Boolean(canEdit) && hasPendingEventDeleteChanges;
    const willSaveTables = active.length > 0;

    if (!willSaveTables && !willSaveSex && !willSaveEventNames && !willSaveEventDeletes) {
      toast.info("保存する変更がありません");
      return;
    }

    if (willSaveTables) {
      for (const [c, t] of active) {
        const vr = validateEventTableSection(c, t);
        if (!vr.ok) {
          if ("reason" in vr) continue;
          toast.error(vr.message);
          return;
        }
      }
    }
    if (willSaveEventNames) {
    for (const event of eventCardRepresentativesInScope) {
      if (groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) continue;
      const rawDraft = getNameDraftTextForGroup(event, eventNameDrafts, eventsInTabScope);
      if (rawDraft === undefined) continue;
      if ((rawDraft ?? "").trim().length === 0) {
        toast.error("種目名は空欄にできません");
        return;
      }
    }
    const seen = new Set<string>();
    for (const event of eventCardRepresentativesInScope) {
      if (groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) continue;
      const rawDraft = getNameDraftTextForGroup(event, eventNameDrafts, eventsInTabScope);
      if (rawDraft === undefined) continue;
      const drafted = rawDraft.trim();
        const key = `${event.category}:${event.type}:${drafted}`;
        if (seen.has(key)) {
          toast.error(`同じ区分に同名種目「${drafted}」が重複しています`);
          return;
        }
        seen.add(key);
      }
    }

    setBulkSavingAllEventTables(true);
    toast.loading("保存中…");

    try {
      let totalErrors = 0;
      if (willSaveTables) {
        for (const [c, t] of active) {
          const vr = validateEventTableSection(c, t);
          if (!vr.ok) continue;
          totalErrors += await persistEventTableSection(c, t);
        }
      }
      if (willSaveEventNames) {
        await applyEventNameDraftsToServer();
      }
      if (willSaveSex) {
        const reducedEvents = eventCardRepresentativesInScope
          .filter((event) => {
            if (groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts)) return false;
            const key = makeEventSexOptionKey(event);
            if (!Object.prototype.hasOwnProperty.call(eventSexOptionDrafts, key)) return false;
            const nextOption = eventSexOptionDrafts[key];
            const currentOption = getEventSexOption(event.name, event.category, event.type);
            if (nextOption === currentOption) return false;
            const currentSet = sexSetForOption(currentOption);
            const nextSet = sexSetForOption(nextOption);
            return [...currentSet].some((sex) => !nextSet.has(sex));
          })
          .map((event) => event.name);
        if (
          reducedEvents.length > 0 &&
          !confirm(
            `次の種目で性別区分を狭める変更があります: ${Array.from(new Set(reducedEvents)).join("、")}。対象性別の既存設定が削除される場合があります。続行しますか？`
          )
        ) {
          toast.dismiss();
          return;
        }
        await applyEventSexOptionDraftsToServer();
      }
      if (willSaveEventDeletes) {
        await applyEventDeleteDraftsToServer();
      }

      await refreshEventsFromServer();
      toast.dismiss();

      if (willSaveSex) {
        setEventSexOptionDrafts({});
      }
      if (willSaveEventNames) {
        setEventNameDrafts({});
      }
      if (willSaveEventDeletes) {
        setEventDeleteDrafts({});
      }

      const savedTargets: string[] = [];
      if (willSaveTables) savedTargets.push("種目表");
      if (willSaveEventNames) savedTargets.push("種目名");
      if (willSaveSex) savedTargets.push("性別区分");
      if (willSaveEventDeletes) savedTargets.push("削除予定");
      if (totalErrors === 0) {
        toast.success(`${savedTargets.join("・")}を保存しました`);
        router.refresh();
        notifySectionSaved();
      } else {
        toast.warning(
          "一部の種目で種目表の保存に失敗しました。入力を確認のうえ、もう一度「このタブを保存」してください。"
        );
        router.refresh();
        notifySectionSaved();
      }
    } catch (error) {
      console.error("種目タブの保存エラー:", error);
      toast.dismiss();
      toast.error(
        error instanceof Error ? error.message : "保存に失敗しました"
      );
    } finally {
      setBulkSavingAllEventTables(false);
    }
  };

  const formatAgeCategoryRangeSubtitle = (c: CompetitionAgeCategoryDraft) => {
    const a = toEligibleBirthDateInput(c.eligibleBirthDateFrom);
    const b = toEligibleBirthDateInput(c.eligibleBirthDateTo);
    if (!a && !b) return "生年月日の制限なし";
    if (a && b) return `${a} 〜 ${b}`;
    return a ? `${a} 〜` : `〜 ${b}`;
  };

  const countDistinctEventNames = (list: Event[]) => new Map(list.map((e) => [e.name, e])).size;

  const markEventDeleteDraft = (event: Event) => {
    if (
      !confirm(
        `「${event.name}」を削除予定にしますか？\n男子・女子はまとめて対象になります（保存時に確定）。`
      )
    ) {
      return;
    }
    setEventDeleteDrafts((prev) => {
      const next = { ...prev };
      const gk = eventCardGroupKey(event);
      for (const e of eventsInTabScope) {
        if (eventCardGroupKey(e) === gk) next[e.id] = true;
      }
      return next;
    });
  };

  const unmarkEventDeleteDraft = (event: Event) => {
    setEventDeleteDrafts((prev) => {
      const gk = eventCardGroupKey(event);
      let changed = false;
      const next = { ...prev };
      for (const e of eventsInTabScope) {
        if (eventCardGroupKey(e) === gk && next[e.id]) {
          delete next[e.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const sortedUniqueEventsBySection = (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ): Event[] =>
    Array.from(
      new Map(
        eventsInTabScope
          .filter((e) => e.category === category && e.type === type)
          .map((e) => [eventCardGroupKey(e), e])
      ).values()
    ).sort((a, b) => a.displayOrder - b.displayOrder);

  const renderEventSettingsQuickNav = (list: Event[], tone: "pool" | "ocean") => {
    if (list.length === 0) return null;
    const chipClass =
      tone === "pool"
        ? "border-orange-200/80 bg-orange-50/90 text-orange-900 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100 dark:hover:bg-orange-900/40"
        : "border-cyan-200/80 bg-cyan-50/90 text-cyan-950 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100 dark:hover:bg-cyan-900/40";
    return (
      <nav
        aria-label="このブロックに登録されている種目一覧"
        className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2"
      >
        <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">登録済み {list.length} 件</span>
          <span className="mx-1">·</span>
          種目名を押すと下の詳細へスクロールします（ここで全体を一覧できます）
        </p>
        <div className="flex flex-wrap gap-1">
          {list.map((ev) => (
            <a
              key={ev.id}
              href={`#${eventSettingsCardDomId(ev.id)}`}
              className={cn(
                "max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                chipClass
              )}
              title={ev.name}
            >
              {ev.name}
            </a>
          ))}
        </div>
      </nav>
    );
  };

  const renderCompactEventCard = (
    event: Event,
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM",
    tone: "pool" | "ocean"
  ) => {
    const genderLabel = canEdit ? "" : getEventGenderLabel(event.name, category, type);
    const sexOptionKey = makeEventSexOptionKey(event);
    const serverSexOption = getEventSexOption(event.name, category, type);
    const sexOption = eventSexOptionDrafts[sexOptionKey] ?? serverSexOption;
    const deleteDrafted = groupHasDeleteDraft(event, eventsInTabScope, eventDeleteDrafts);
    const nameDraft =
      getNameDraftTextForGroup(event, eventNameDrafts, eventsInTabScope) ?? event.name;
    const relayKey = teamRelayStateKey(category, event.name, event.ageCategoryId);
    const linked = Boolean(event.ageCategoryId);

    const surface =
      tone === "pool"
        ? "border-orange-200/70 bg-orange-50/90 dark:border-orange-800/70 dark:bg-orange-950/40"
        : "border-cyan-200/70 bg-cyan-50/90 dark:border-cyan-800/70 dark:bg-cyan-950/40";

    return (
      <div
        key={event.id}
        id={eventSettingsCardDomId(event.id)}
        className={cn(
          "scroll-mt-24 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between",
          deleteDrafted && "opacity-70",
          surface
        )}
      >
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {canEdit ? (
                <EventNameField
                  key={`event-name-${event.id}`}
                  eventId={event.id}
                  value={nameDraft}
                  disabled={bulkSavingAllEventTables || deleteDrafted}
                  onChange={(next) =>
                    setEventNameDrafts((prev) => ({
                      ...prev,
                      [event.id]: next,
                    }))
                  }
                />
              ) : (
                <div className="text-sm font-semibold leading-tight text-foreground">
                  {event.name}
                  {genderLabel}
                </div>
              )}
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive sm:order-last"
                disabled={bulkSavingAllEventTables}
                onClick={() =>
                  deleteDrafted ? unmarkEventDeleteDraft(event) : markEventDeleteDraft(event)
                }
                aria-label={deleteDrafted ? `${event.name} の削除予定を取り消す` : `${event.name} を削除予定`}
              >
                {deleteDrafted ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
          {deleteDrafted ? (
            <div className="rounded-md border border-amber-300/80 bg-amber-100/60 px-2 py-1.5 text-[10px] text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-100">
              この種目は削除予定です。「このタブを保存」で確定されます。
            </div>
          ) : null}

          {canEdit ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground">
                性別区分（変更は保存まで保留）
              </p>
              {renderSexOptionButtons(
                sexOption,
                (next) => {
                  setEventSexOptionDrafts((prev) => ({
                    ...prev,
                    [sexOptionKey]: next,
                  }));
                },
                bulkSavingAllEventTables || deleteDrafted || !canEdit,
                true
              )}
            </div>
          ) : null}

          {linked ? (
            <p className="text-[10px] text-muted-foreground">
              年齢カテゴリ連動中です。下の日付はカテゴリの範囲を表示しています。種目ごとに変えて保存すると連動は解除され、その範囲が使われます。日付を変えずに保存すれば連動のままです。カテゴリ全体の変更は大会出場条件の「AGEカテゴリ」から行ってください。
            </p>
          ) : null}

          <div
            className="space-y-2.5 rounded-md border border-border/50 bg-background/40 px-2.5 py-2.5"
            role="group"
            aria-label="種目ごとの参加条件（ページ下部の「このタブを保存」でまとめて保存）"
          >
            <p className="text-[10px] font-medium text-muted-foreground">
              参加条件（ページ下部の「このタブを保存」でまとめて反映）
            </p>
            <div className="space-y-2">
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">
                  参加可能な生年月日（この日〜この日に生まれた人。両端の日を含みます。空欄の片方／両方は制限なし。未入力のときは大会の年齢設定のみが適用されます
                  {linked ? "・連動中はカテゴリの範囲を表示しています（種目ごとに編集可）" : ""}）
                </p>
                <label className="inline-flex flex-wrap items-center gap-1 text-[11px]">
                  <Input
                    type="date"
                    aria-label={`${event.name} 参加可能な生年月日の開始`}
                    value={eventBirthDateRanges[birthRangeFormKey(event)]?.from ?? ""}
                    onChange={(e) => {
                      const k = birthRangeFormKey(event);
                      setEventBirthDateRanges((prev) => ({
                        ...prev,
                        [k]: {
                          from: e.target.value,
                          to: prev[k]?.to ?? "",
                        },
                      }));
                    }}
                    disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                    className="h-8 w-[9.5rem] px-1.5 text-xs"
                  />
                  <span className="text-muted-foreground">〜</span>
                  <Input
                    type="date"
                    aria-label={`${event.name} 参加可能な生年月日の終了`}
                    value={eventBirthDateRanges[birthRangeFormKey(event)]?.to ?? ""}
                    onChange={(e) => {
                      const k = birthRangeFormKey(event);
                      setEventBirthDateRanges((prev) => ({
                        ...prev,
                        [k]: {
                          from: prev[k]?.from ?? "",
                          to: e.target.value,
                        },
                      }));
                    }}
                    disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                    className="h-8 w-[9.5rem] px-1.5 text-xs"
                  />
                </label>
              </div>
              {type === "TEAM" ? (
                <div className="border-t border-border/50 pt-2.5">
                  <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                    チームポジション（リレー等・男女共通・ページ下部の「このタブを保存」で反映）
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[5.5rem,1fr] sm:items-start sm:gap-3">
                    <div>
                      <p className="mb-1 text-[10px] text-muted-foreground">ポジション数</p>
                      <Input
                        numericInput="integer"
                        min={1}
                        max={32}
                        placeholder="例: 4"
                        className="h-8 w-full px-1.5 text-xs tabular-nums sm:w-16"
                        value={eventTeamRelayPositions[relayKey]?.count ?? ""}
                        onChange={(e) => {
                          setEventTeamRelayPositions((prev) => ({
                            ...prev,
                            [relayKey]: {
                              count: e.target.value,
                              namesText: prev[relayKey]?.namesText ?? "",
                              maxTeamEntriesPerClub:
                                prev[relayKey]?.maxTeamEntriesPerClub ?? "",
                            },
                          }));
                        }}
                        disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] text-muted-foreground">
                        ポジション名（1行に1つ・上から第1ポジション）
                      </p>
                      <Textarea
                        rows={4}
                        className="min-h-[4.5rem] resize-y text-xs"
                        placeholder={"例:\n1st\n2nd\n3rd\nAnchor"}
                        value={eventTeamRelayPositions[relayKey]?.namesText ?? ""}
                        onChange={(e) => {
                          setEventTeamRelayPositions((prev) => ({
                            ...prev,
                            [relayKey]: {
                              count: prev[relayKey]?.count ?? "",
                              namesText: e.target.value,
                              maxTeamEntriesPerClub:
                                prev[relayKey]?.maxTeamEntriesPerClub ?? "",
                            },
                          }));
                        }}
                        disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                      />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <p className="mb-1 text-[10px] text-muted-foreground">
                      同一クラブあたりのチーム上限（この種目・男女共通・空欄は制限なし）
                    </p>
                    <Input
                      numericInput="integer"
                      min={1}
                      max={999}
                      placeholder="例: 2"
                      title="1〜999、空欄で制限なし"
                      className="h-8 w-full max-w-[12rem] px-1.5 text-xs tabular-nums"
                      value={eventTeamRelayPositions[relayKey]?.maxTeamEntriesPerClub ?? ""}
                      onChange={(e) => {
                        setEventTeamRelayPositions((prev) => ({
                          ...prev,
                          [relayKey]: {
                            count: prev[relayKey]?.count ?? "",
                            namesText: prev[relayKey]?.namesText ?? "",
                            maxTeamEntriesPerClub: e.target.value,
                          },
                        }));
                      }}
                      disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isPublished && canEdit && requiresParticipantNotice ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          公開済みでエントリー成立後の変更では、必要に応じて参加者への告知文が自動で付与されます（受付延長・資格緩和・種目追加など）。
        </p>
      ) : null}

      {isSection("period") && (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">エントリー期間</CardTitle>
          <CardDescription className="text-xs">日時は日本時間です。</CardDescription>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <AutofillSyncForm
            onSubmit={(e) => {
              e.preventDefault();
              void handleSavePeriod();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="entryStartDate">エントリー開始日時 *</Label>
                <Input
                  id="entryStartDate"
                  type="datetime-local"
                  value={entryStartDate}
                  onChange={(e) => setEntryStartDate(e.target.value)}
                  required
                  disabled={!canEdit}
                />
              </div>

              <div>
                <Label htmlFor="entryEndDate">エントリー終了日時 *</Label>
                <Input
                  id="entryEndDate"
                  type="datetime-local"
                  value={entryEndDate}
                  onChange={(e) => setEntryEndDate(e.target.value)}
                  required
                  disabled={!canEdit}
                />
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end pt-0.5">
                <Button type="submit" size="sm" disabled={isUpdating} className="h-8 w-full text-xs md:w-auto">
                  {isUpdating ? "更新中…" : "期間を更新"}
                </Button>
              </div>
            )}
          </AutofillSyncForm>
        </CardContent>
      </Card>
      )}

      {isSection("ageClub") && (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">年齢・所属クラブ</CardTitle>
          <CardDescription className="text-xs">
            満年齢は開催年度末（翌年4/1・日本時間）基準。所属クラブの要否は「大会基本情報」でも設定できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3">
          <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">現在の条件</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-950">
                {requireClubMembership ? "所属クラブ必須" : "所属クラブ任意"}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-950">
                年齢:{" "}
                {competitionMinAge.trim()
                  ? `${competitionMinAge.trim()}歳以上（含む）`
                  : "下限なし"}
                〜
                {competitionMaxAge.trim()
                  ? `${competitionMaxAge.trim()}歳以下（含む）`
                  : "上限なし"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="competitionMinAge" className="text-xs">
                最小年齢（任意・以上）
              </Label>
              <Input
                id="competitionMinAge"
                numericInput="integer"
                min="0"
                value={competitionMinAge}
                onChange={(e) => setCompetitionMinAge(e.target.value)}
                placeholder="例: 18"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="competitionMaxAge" className="text-xs">
                最大年齢（任意・以下）
              </Label>
              <Input
                id="competitionMaxAge"
                numericInput="integer"
                min="0"
                value={competitionMaxAge}
                onChange={(e) => setCompetitionMaxAge(e.target.value)}
                placeholder="例: 35"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">所属クラブ</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                  <input
                    type="radio"
                    name="requireClubMembership"
                    checked={requireClubMembership}
                    onChange={() => setRequireClubMembership(true)}
                    disabled={!canEdit}
                  />
                  <span>所属クラブ必須</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                  <input
                    type="radio"
                    name="requireClubMembership"
                    checked={!requireClubMembership}
                    onChange={() => setRequireClubMembership(false)}
                    disabled={!canEdit}
                  />
                  <span>所属クラブ不要</span>
                </label>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs md:w-auto"
                onClick={() => void handleSaveAgeClub()}
                disabled={isUpdating}
              >
                {isUpdating ? "更新中…" : "年齢・所属クラブを更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {isSection("eligibility") && (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">参加対象者（自由記述）</CardTitle>
          <CardDescription className="text-xs">未入力時は公開ページで「制限なし」と表示されます。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3">
          <div className="space-y-2">
            <Label htmlFor="participantEligibility">内容</Label>
            <Textarea
              id="participantEligibility"
              value={participantEligibilityText}
              onChange={(e) => setParticipantEligibilityText(e.target.value)}
              placeholder="例: ○○クラブ所属者のみ、18歳以上の男女、会員限定 など"
              rows={4}
              disabled={!canEdit}
            />
            <p className="text-xs text-gray-500">{participantEligibilityText.length} 文字</p>
          </div>
          {canEdit && (
            <div className="flex justify-end pt-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs md:w-auto"
                onClick={() => void handleSaveEligibility()}
                disabled={isUpdating}
              >
                {isUpdating ? "更新中…" : "参加対象者を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {isSection("qualifications") && (
        <CompetitionEntryQualificationsEditor
          competitionId={competitionId}
          canEdit={canEdit}
          requiresParticipantNotice={requiresParticipantNotice}
          qualificationTemplates={qualificationTemplates}
          initialRequiredQualifications={initialData.requiredQualifications}
          ageCategories={ageCategories.map((c) => ({
            id: c.id,
            name: c.name,
            displayOrder: c.displayOrder,
          }))}
          onSuccessfulSave={notifySectionSaved}
        />
      )}

      {isSection("multiEvent") && (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">種目あたりのエントリー</CardTitle>
          <CardDescription className="text-xs">1人が選べる種目数の上限です。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={allowMultipleEventEntries}
              onChange={(e) => setAllowMultipleEventEntries(e.target.checked)}
              disabled={!canEdit}
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              1人あたり複数種目のエントリーを許可する
              <span className="block text-xs text-gray-500">
                オフの場合は1種目のみ選択可能になります。
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="maxEventEntriesPerPerson">エントリー可能種目数の上限（任意）</Label>
            <Input
              id="maxEventEntriesPerPerson"
              numericInput="integer"
              min="1"
              step="1"
              value={maxEventEntriesPerPerson}
              onChange={(e) => setMaxEventEntriesPerPerson(e.target.value)}
              placeholder="例: 3（空欄で上限なし）"
              disabled={!canEdit || !allowMultipleEventEntries}
            />
            <p className="text-xs text-gray-500">
              {!allowMultipleEventEntries
                ? "現在は複数種目を許可していないため、1種目のみ選択可能です。"
                : maxEventEntriesPerPerson.trim()
                  ? `現在の上限: ${maxEventEntriesPerPerson}種目`
                  : "空欄の場合は上限なしで複数種目を選択できます。"}
            </p>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSaveMultiEvent()}
                disabled={isUpdating}
                className="w-full md:w-auto"
              >
                {isUpdating ? "更新中..." : "種目エントリー数を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {isSection("events") && (
      <>
      <Card className="mb-4 overflow-hidden border-border/80">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-3 py-3 sm:px-4">
          <CardTitle className="text-base font-semibold">AGEカテゴリ・テンプレート（アンダー制）</CardTitle>
          <CardDescription className="text-xs">
            U/OPEN を「AGEカテゴリへ反映」すると、大会出場条件の AGEカテゴリに同期されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-3 py-3 sm:px-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={underSystemEnabled}
              onChange={(e) => setUnderSystemEnabled(e.target.checked)}
              disabled={!canEdit || isUpdatingUnderAgeSettings}
            />
            <span>このテンプレート（U/OPEN）を保存しておく</span>
          </label>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs">U のしきい値（歳）</Label>
              {canEdit && underSystemEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setUnderUThresholdRows((prev) => [...prev, ""])}
                  disabled={isUpdatingUnderAgeSettings}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  しきい値を追加
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              {underUThresholdRows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  行がない場合は OPEN のみ（他に U がないときは年齢無差別）として保存されます。
                </p>
              ) : null}
              {underUThresholdRows.map((row, idx) => (
                <div key={idx} className="flex max-w-xs items-center gap-2">
                  <span className="w-6 text-center text-[10px] text-muted-foreground">{idx + 1}</span>
                  <Input
                    className="h-9 text-sm"
                    inputMode="numeric"
                    value={row}
                    placeholder="例: 15"
                    disabled={!canEdit || !underSystemEnabled || isUpdatingUnderAgeSettings}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUnderUThresholdRows((prev) => {
                        const next = [...prev];
                        next[idx] = v;
                        return next;
                      });
                    }}
                  />
                  {canEdit && underSystemEnabled ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground"
                      aria-label="この行を削除"
                      onClick={() =>
                        setUnderUThresholdRows((prev) => prev.filter((_, i) => i !== idx))
                      }
                      disabled={isUpdatingUnderAgeSettings}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              数値は保存時に重複除去・昇順に整列されます。複数あるときは帯が重ならないよう分割されます。
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={underOpenEnabled}
              onChange={(e) => setUnderOpenEnabled(e.target.checked)}
              disabled={!canEdit || !underSystemEnabled || isUpdatingUnderAgeSettings}
            />
            <span>最大 U より上を OPEN とする（オフのときその年齢帯はエントリー不可）</span>
          </label>
          {canEdit ? (
            <div className="flex flex-col gap-2 pt-0.5 md:flex-row md:justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full text-xs md:w-auto"
                onClick={() => void handleSaveUnderAgeSettings(false)}
                disabled={isUpdatingUnderAgeSettings}
              >
                {isUpdatingUnderAgeSettings ? "保存中…" : "テンプレートのみ保存"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs md:w-auto"
                onClick={() => void handleSaveUnderAgeSettings(true)}
                disabled={isUpdatingUnderAgeSettings || !underSystemEnabled}
              >
                {isUpdatingUnderAgeSettings ? "保存中…" : "保存して AGEカテゴリへ反映"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 sm:px-4">
        <p className="text-[11px] leading-snug text-muted-foreground">
          年齢カテゴリごとに種目を設定します。タブが異なれば同名の種目も別種目として扱われます。
        </p>
      </div>
      <div className="sticky top-2 z-20 mb-3 rounded-lg border border-border/70 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="年齢カテゴリ">
          {ageCategories.map((c) => {
            const tabTitle = c.name;
            const tabRangeSubtitle = formatAgeCategoryRangeSubtitle(c);
            const tabEventNameCount = countDistinctEventNames(
              events.filter((e) => e.ageCategoryId === c.id)
            );
            return (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={eventScopeTabId === c.id ? "default" : "secondary"}
                className="h-auto min-h-10 max-w-[14rem] flex-col items-stretch gap-0.5 px-2.5 py-1.5 text-left"
                onClick={() => setEventScopeTabId(c.id)}
              >
                <span className="text-xs font-semibold leading-tight">{tabTitle}</span>
                <span className="text-[10px] font-normal opacity-90">{tabRangeSubtitle}</span>
                {tabEventNameCount > 0 ? (
                  <span className="text-[10px] font-normal tabular-nums opacity-80">
                    種目 {tabEventNameCount}
                  </span>
                ) : null}
              </Button>
            );
          })}
          {(() => {
            const uncategorizedEvents = events.filter(
              (e) => e.ageCategoryId == null || e.ageCategoryId === ""
            );
            if (ageCategories.length > 0 && uncategorizedEvents.length === 0) return null;
            const uncategorizedNameCount = countDistinctEventNames(uncategorizedEvents);
            return (
              <Button
                type="button"
                size="sm"
                variant={eventScopeTabId === "__NONE__" ? "default" : "secondary"}
                className="h-auto min-h-10 px-2.5 py-1.5 text-left"
                onClick={() => setEventScopeTabId("__NONE__")}
              >
                <span className="text-xs font-semibold leading-tight">未分類</span>
                <span className="block text-[10px] font-normal opacity-80">カテゴリ未設定</span>
                {uncategorizedNameCount > 0 ? (
                  <span className="block text-[10px] font-normal tabular-nums opacity-80">
                    種目 {uncategorizedNameCount}
                  </span>
                ) : null}
              </Button>
            );
          })()}
        </div>
      </div>

      <Card className={cn(categoryMeta.toneClass, "overflow-hidden")}>
        <CardHeader className="space-y-1.5 border-b border-border/60 bg-background/40 px-3 py-3 sm:px-4">
          <CardTitle className="text-base font-semibold">{categoryMeta.title}</CardTitle>
          <CardDescription className="text-xs leading-snug">{categoryMeta.shortHint}</CardDescription>
          <details className="rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground outline-none">ヘルプ</summary>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-0.5 pt-1 leading-relaxed">
              <li>
                プール／オーシャンは大会基本情報で
                {competitionEventCategoryScopeLabel(categoryScope)}に固定されています。
              </li>
              <li>種目の追加・変更は「このタブを保存」で確定します（下書きのままでは反映されません）。</li>
              <li>AGEカテゴリは大会出場条件で設定し、タブ切替で種目を分けます。</li>
              <li>参加費は下の「エントリー費用」で設定します。</li>
              <li>レーン数・ヒート数はスタートリストのラウンド設定で変更します（この画面では編集しません）。</li>
            </ul>
          </details>
        </CardHeader>
        <CardContent className="space-y-4 px-3 py-3 sm:px-4">
          {selectedCategory === "POOL" && (
            <div className="space-y-8">
              <section className="space-y-3 rounded-lg border border-border/90 bg-muted/20 p-3 sm:p-4 dark:border-border dark:bg-muted/10">
                <div className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="border-orange-200/80 bg-orange-100/90 text-[11px] text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100"
                    >
                      プール · 個人
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      種目ごとの一覧 · 下の団体種目とは別ブロック
                    </span>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px]"
                        onClick={() => handleAddDefaultEvents("POOL", "INDIVIDUAL", "BOTH")}
                        disabled={isAddingDefaultEvents === "POOL-INDIVIDUAL"}
                      >
                        {isAddingDefaultEvents === "POOL-INDIVIDUAL" ? "追加中…" : "＋デフォルト"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAllEvents("POOL", "INDIVIDUAL")}
                      >
                        全削除
                      </Button>
                    </div>
                  ) : null}
                </div>
                {renderEventSettingsQuickNav(sortedUniqueEventsBySection("POOL", "INDIVIDUAL"), "pool")}
                {poolIndividualError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {poolIndividualError}
                  </div>
                ) : null}
                {canEdit ? (
                  <div className="flex gap-1.5">
                    <Input
                      className="h-9 text-sm"
                      placeholder="種目を追加（例: 100m障害物）"
                      value={poolIndividualName}
                      onChange={(e) => {
                        setPoolIndividualName(e.target.value);
                        if (poolIndividualError) setPoolIndividualError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddPoolIndividual();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-9 shrink-0 px-3"
                      onClick={handleAddPoolIndividual}
                      disabled={
                        isAddingPoolIndividual ||
                        isAddingDefaultEvents === "POOL-INDIVIDUAL" ||
                        !poolIndividualName.trim()
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {eventsInTabScope.filter((e) => e.category === "POOL" && e.type === "INDIVIDUAL").length ===
                0 ? (
                  <p className="text-xs text-muted-foreground">個人種目はまだありません。</p>
                ) : (
                  <div className="space-y-1.5">
                    {Array.from(
                      new Map(
                        eventsInTabScope
                          .filter((e) => e.category === "POOL" && e.type === "INDIVIDUAL")
                          .map((e) => [eventCardGroupKey(e), e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) =>
                        renderCompactEventCard(event, "POOL", "INDIVIDUAL", "pool")
                      )}
                  </div>
                )}
              </section>

            {/* プールチーム種目 */}
              <section className="space-y-3 rounded-lg border border-border/90 bg-muted/20 p-3 sm:p-4 dark:border-border dark:bg-muted/10">
                <div className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="border-orange-200/80 bg-orange-100/90 text-[11px] text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100"
                    >
                      プール · 団体（チーム）
                    </Badge>
                    <span className="text-xs text-muted-foreground">リレー等 · 上の個人種目とは別ブロック</span>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px]"
                        onClick={() => handleAddDefaultEvents("POOL", "TEAM", "BOTH")}
                        disabled={isAddingDefaultEvents === "POOL-TEAM"}
                      >
                        {isAddingDefaultEvents === "POOL-TEAM" ? "追加中…" : "＋デフォルト"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAllEvents("POOL", "TEAM")}
                      >
                        全削除
                      </Button>
                    </div>
                  ) : null}
                </div>
                {renderEventSettingsQuickNav(sortedUniqueEventsBySection("POOL", "TEAM"), "pool")}
                {poolTeamError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {poolTeamError}
                  </div>
                ) : null}
                {canEdit ? (
                  <div className="flex gap-1.5">
                    <Input
                      className="h-9 text-sm"
                      placeholder="チーム種目を追加（例: 4×50mメドレーリレー）"
                      value={poolTeamName}
                      onChange={(e) => {
                        setPoolTeamName(e.target.value);
                        if (poolTeamError) setPoolTeamError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddPoolTeam();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-9 shrink-0 px-3"
                      onClick={handleAddPoolTeam}
                      disabled={
                        isAddingPoolTeam ||
                        isAddingDefaultEvents === "POOL-TEAM" ||
                        !poolTeamName.trim()
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {eventsInTabScope.filter((e) => e.category === "POOL" && e.type === "TEAM").length === 0 ? (
                  <p className="text-xs text-muted-foreground">チーム種目はまだありません。</p>
                ) : (
                  <div className="space-y-1.5">
                    {Array.from(
                      new Map(
                        eventsInTabScope
                          .filter((e) => e.category === "POOL" && e.type === "TEAM")
                          .map((e) => [eventCardGroupKey(e), e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) =>
                        renderCompactEventCard(event, "POOL", "TEAM", "pool")
                      )}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* オーシャン競技 */}
          {selectedCategory === "OCEAN" && (
            <div className="space-y-8">
              <section className="space-y-3 rounded-lg border border-border/90 bg-muted/20 p-3 sm:p-4 dark:border-border dark:bg-muted/10">
                <div className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="border-cyan-200/80 bg-cyan-100/90 text-[11px] text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100"
                    >
                      オーシャン · 個人
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      種目ごとの一覧 · 下の団体種目とは別ブロック
                    </span>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px]"
                        onClick={() => handleAddDefaultEvents("OCEAN", "INDIVIDUAL", "BOTH")}
                        disabled={isAddingDefaultEvents === "OCEAN-INDIVIDUAL"}
                      >
                        {isAddingDefaultEvents === "OCEAN-INDIVIDUAL" ? "追加中…" : "＋デフォルト"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAllEvents("OCEAN", "INDIVIDUAL")}
                      >
                        全削除
                      </Button>
                    </div>
                  ) : null}
                </div>
                {renderEventSettingsQuickNav(sortedUniqueEventsBySection("OCEAN", "INDIVIDUAL"), "ocean")}
                {oceanIndividualError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {oceanIndividualError}
                  </div>
                ) : null}
                {canEdit ? (
                  <div className="flex gap-1.5">
                    <Input
                      className="h-9 text-sm"
                      placeholder="種目を追加（例: ビーチフラッグス）"
                      value={oceanIndividualName}
                      onChange={(e) => {
                        setOceanIndividualName(e.target.value);
                        if (oceanIndividualError) setOceanIndividualError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddOceanIndividual();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-9 shrink-0 px-3"
                      onClick={handleAddOceanIndividual}
                      disabled={
                        isAddingOceanIndividual ||
                        isAddingDefaultEvents === "OCEAN-INDIVIDUAL" ||
                        !oceanIndividualName.trim()
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {eventsInTabScope.filter((e) => e.category === "OCEAN" && e.type === "INDIVIDUAL").length ===
                0 ? (
                  <p className="text-xs text-muted-foreground">個人種目はまだありません。</p>
                ) : (
                  <div className="space-y-1.5">
                    {Array.from(
                      new Map(
                        eventsInTabScope
                          .filter((e) => e.category === "OCEAN" && e.type === "INDIVIDUAL")
                          .map((e) => [eventCardGroupKey(e), e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) =>
                        renderCompactEventCard(event, "OCEAN", "INDIVIDUAL", "ocean")
                      )}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-lg border border-border/90 bg-muted/20 p-3 sm:p-4 dark:border-border dark:bg-muted/10">
                <div className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="border-cyan-200/80 bg-cyan-100/90 text-[11px] text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100"
                    >
                      オーシャン · 団体（チーム）
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      団体種目 · 上の個人種目とは別ブロック
                    </span>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px]"
                        onClick={() => handleAddDefaultEvents("OCEAN", "TEAM", "BOTH")}
                        disabled={isAddingDefaultEvents === "OCEAN-TEAM"}
                      >
                        {isAddingDefaultEvents === "OCEAN-TEAM" ? "追加中…" : "＋デフォルト"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAllEvents("OCEAN", "TEAM")}
                      >
                        全削除
                      </Button>
                    </div>
                  ) : null}
                </div>
                {renderEventSettingsQuickNav(sortedUniqueEventsBySection("OCEAN", "TEAM"), "ocean")}
                {oceanTeamError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {oceanTeamError}
                  </div>
                ) : null}
                {canEdit ? (
                  <div className="flex gap-1.5">
                    <Input
                      className="h-9 text-sm"
                      placeholder="チーム種目を追加（例: ビーチリレー）"
                      value={oceanTeamName}
                      onChange={(e) => {
                        setOceanTeamName(e.target.value);
                        if (oceanTeamError) setOceanTeamError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddOceanTeam();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-9 shrink-0 px-3"
                      onClick={handleAddOceanTeam}
                      disabled={
                        isAddingOceanTeam ||
                        isAddingDefaultEvents === "OCEAN-TEAM" ||
                        !oceanTeamName.trim()
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {eventsInTabScope.filter((e) => e.category === "OCEAN" && e.type === "TEAM").length === 0 ? (
                  <p className="text-xs text-muted-foreground">チーム種目はまだありません。</p>
                ) : (
                  <div className="space-y-1.5">
                    {Array.from(
                      new Map(
                        eventsInTabScope
                          .filter((e) => e.category === "OCEAN" && e.type === "TEAM")
                          .map((e) => [eventCardGroupKey(e), e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) =>
                        renderCompactEventCard(event, "OCEAN", "TEAM", "ocean")
                      )}
                  </div>
                )}
              </section>
            </div>
          )}
          {canEdit ? (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:bg-primary/[0.08]">
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">このタブを保存</span>
                … プール／オーシャン・個人／チームの種目表（参加可能な生年月日・チームポジション）をまとめて書き込みます。
                {hasPendingEventNameChanges ? (
                  <span className="mt-1 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                    未保存: 種目名変更
                  </span>
                ) : null}
                {hasPendingEventDeleteChanges ? (
                  <span className="mt-1 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                    未保存: 種目削除
                  </span>
                ) : null}
                {hasPendingEventSexOptionChanges ? (
                  <span className="mt-1 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                    未保存: 種目ごとの性別区分
                  </span>
                ) : null}
              </p>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {hasPendingEventNameChanges ||
                hasPendingEventDeleteChanges ||
                hasPendingEventSexOptionChanges ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs text-muted-foreground"
                    disabled={bulkSavingAllEventTables}
                    onClick={() => {
                      setEventNameDrafts({});
                      setEventDeleteDrafts({});
                      setEventSexOptionDrafts({});
                    }}
                  >
                    種目ドラフトを破棄
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-9 min-w-[7.5rem] shrink-0 text-xs"
                  onClick={() => void handleBulkUpdateAllEventTables()}
                  disabled={bulkSavingAllEventTables}
                >
                  {bulkSavingAllEventTables ? "保存中…" : "このタブを保存"}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card className="overflow-hidden border-border/90 shadow-sm">
        <CardHeader className="space-y-2 border-b border-border bg-gradient-to-r from-muted/40 to-background px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"
              aria-hidden
            >
              <Coins className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base font-semibold">エントリー費用</CardTitle>
              <CardDescription className="text-xs">種目を保存したあと、区分ごとに料金を設定します。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-5">
          {!hasIndividualEvents && !hasTeamEvents ? (
            <div
              role="status"
              className="flex gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-50"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
              <span>
                まず上の種目表で個人またはチーム種目を追加し、「このタブを保存」で反映してください。種目がある区分だけ参加費を設定できます。
              </span>
            </div>
          ) : null}

          {hasLegacyFeeBands && legacyFeeTiers ? (
            <div
              role="status"
              className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-50"
            >
              <p className="font-medium">年齢帯別で保存済みです（読取専用）</p>
              <p className="text-amber-900/85 dark:text-amber-100/85">
                「全員同一」または「AGEカテゴリ別」で保存すると移行できます。移行スクリプトの利用も可能です。
              </p>
              <ul className="space-y-1">
                {legacyFeeTiers.map((t, i) => (
                  <li key={i}>
                    <span className="font-medium">
                      {t.minAge}〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
                    </span>
                    {hasIndividualEvents ? <> · 個人 ¥{t.individualEntryFee}</> : null}
                    {hasTeamEvents ? <> · チーム ¥{t.teamEntryFeePerTeam}</> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="h-3.5 w-3.5"
                checked={feeTierMode === "flat"}
                onChange={() => setFeeTierMode("flat")}
                disabled={!canEdit}
              />
              全員同一
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="h-3.5 w-3.5"
                checked={feeTierMode === "byAgeCategory"}
                onChange={() => {
                  setFeeTierMode("byAgeCategory");
                  setCategoryFeeDraft(
                    buildCategoryFeeDraft(
                      ageCategories,
                      parseAgeCategoryFeeTiers(initialData.entryFee as unknown)
                    )
                  );
                }}
                disabled={!canEdit || ageCategories.length === 0}
              />
              AGEカテゴリ別
            </label>
          </div>
          {feeTierMode === "byAgeCategory" ? (
            <p className="text-xs text-muted-foreground">
              AGEカテゴリごとに料金を設定します。エントリー時は生年月日が属する区分の単価が使われます。
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              すべての参加者に同じ単価を適用します。
            </p>
          )}
          {ageCategories.length === 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              AGEカテゴリ別を使うには、先に大会出場条件の「AGEカテゴリ」でカテゴリを作成してください。
            </p>
          ) : null}

          {feeTierMode === "byAgeCategory" ? (
            <div className="space-y-3">
              {ageCategories.map((cat) => {
                const row = categoryFeeDraft[cat.id] ?? { individual: "0", team: "0" };
                return (
                  <div
                    key={cat.id}
                    className="grid gap-2 rounded-lg border border-border/80 bg-muted/15 p-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                      <Label className="text-[10px] text-muted-foreground">区分</Label>
                      <p className="text-sm font-medium leading-tight">{cat.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatAgeCategoryRangeSubtitle(cat)}
                      </p>
                    </div>
                    {hasIndividualEvents ? (
                      <div className="space-y-1">
                        <Label className="text-[10px]">個人（円）</Label>
                        <Input
                          numericInput="integer"
                          min={0}
                          className="h-8 text-xs"
                          value={row.individual}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCategoryFeeDraft((prev) => ({
                              ...prev,
                              [cat.id]: { ...(prev[cat.id] ?? row), individual: v },
                            }));
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                    ) : null}
                    {hasTeamEvents ? (
                      <div className="space-y-1">
                        <Label className="text-[10px]">チーム1組（円）</Label>
                        <Input
                          numericInput="integer"
                          min={0}
                          className="h-8 text-xs"
                          value={row.team}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCategoryFeeDraft((prev) => ({
                              ...prev,
                              [cat.id]: { ...(prev[cat.id] ?? row), team: v },
                            }));
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="individualEntryFee">個人エントリー料金（円）</Label>
                <div className="flex gap-2">
                  <Input
                    id="individualEntryFee"
                    numericInput="integer"
                    min="0"
                    step="100"
                    value={individualEntryFee}
                    onChange={(e) => setIndividualEntryFee(e.target.value)}
                    placeholder="5000"
                    disabled={!canEdit || !hasIndividualEvents}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasIndividualEvents
                    ? "選手本人が支払う大会参加料です。個人種目数に関係なく一律です。"
                    : "個人種目が未登録のため設定できません。個人種目を追加すると入力できます。"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teamEntryFeePerTeam">チーム種目料金（1チームあたり / 円）</Label>
                <div className="flex gap-2">
                  <Input
                    id="teamEntryFeePerTeam"
                    numericInput="integer"
                    min="0"
                    step="100"
                    value={teamEntryFeePerTeam}
                    onChange={(e) => setTeamEntryFeePerTeam(e.target.value)}
                    placeholder="3000"
                    disabled={!canEdit || !hasTeamEvents}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasTeamEvents
                    ? "クラブが支払う単価です。1種目1チームごとにこの金額が加算されます。"
                    : "チーム種目が未登録のため設定できません。団体種目を追加すると入力できます。"}
                </p>
              </div>
            </>
          )}

          <div className="rounded-md border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <p>個人種目: 種目数に関係なく選手ごとに一律課金</p>
            <p>
              チーム種目: 1種目1チームごとにクラブへ課金（AGEカテゴリ別は登録者の生年月日が属する区分の単価）
            </p>
            <p>複数種目割増とチーム種目のみ特別料金は使用しません。</p>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                onClick={handleUpdateEntryFee}
                disabled={isUpdatingFee || (!hasIndividualEvents && !hasTeamEvents)}
                className="w-full md:w-auto"
              >
                {isUpdatingFee ? "更新中..." : "エントリー費用設定を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {isSection("pledge") && (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-1 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">エントリー時の誓約</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            オンにすると公開フォームに誓約文を表示し、参加者の同意を必須にします。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-4 py-4">
          {initialData.entryPledgeLockNoOffer && !initialData.entryPledgeEnabled ? (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/55 dark:bg-amber-950/45 dark:text-amber-50"
            >
              <span className="font-medium">初回公開時にオフのため、誓約を有効化できません。</span>{" "}
              <span className="text-amber-900/80 dark:text-amber-100/85">
                案内は大会ページ・お知らせで行ってください。
              </span>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-muted/15 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                checked={entryPledgeEnabled}
                onChange={(e) => {
                  if (
                    initialData.entryPledgeLockNoOffer &&
                    !initialData.entryPledgeEnabled &&
                    e.target.checked
                  ) {
                    toast.error("公開時に誓約を有効にしていないため、後から有効化できません");
                    return;
                  }
                  setEntryPledgeEnabled(e.target.checked);
                }}
                disabled={
                  !canEdit ||
                  Boolean(initialData.entryPledgeLockNoOffer && !initialData.entryPledgeEnabled)
                }
              />
              <span className="text-sm text-foreground">
                <span className="font-medium">エントリーフォームに誓約を表示する</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  オフのときは参加者に表示しません。
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="entryPledgeText" className="text-foreground">
                  誓約文
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      entryPledgeText.length > ENTRY_PLEDGE_TEXT_MAX_CHARS * 0.9
                        ? "font-medium text-amber-700 dark:text-amber-300"
                        : "text-muted-foreground"
                    )}
                  >
                    {entryPledgeText.length}/{ENTRY_PLEDGE_TEXT_MAX_CHARS}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
                    disabled={!canEdit}
                    onClick={applyPledgeBold}
                    title="太字（⌘B / Ctrl+B）"
                  >
                    <Bold className="h-3.5 w-3.5" aria-hidden />
                    太字
                  </Button>
                </div>
              </div>
              <Textarea
                ref={pledgeTextareaRef}
                id="entryPledgeText"
                rows={10}
                value={entryPledgeText}
                onChange={(e) => setEntryPledgeText(e.target.value)}
                onKeyDown={(e) => {
                  if (!canEdit) return;
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                    e.preventDefault();
                    applyPledgeBold();
                  }
                }}
                placeholder="例: 本大会の規定に同意のうえエントリーします。"
                disabled={!canEdit}
                className="min-h-[12rem] resize-y font-mono text-sm leading-relaxed"
              />
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="text-sm font-medium text-foreground">プレビュー</span>
                </div>
                <span className="text-[10px] text-muted-foreground">参加者の画面</span>
              </div>
              <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-4">
                {entryPledgeEnabled && entryPledgeText.trim() ? (
                  <SimpleMarkdown
                    text={entryPledgeText.trim()}
                    className="text-[15px] leading-relaxed text-foreground"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    オンにして文言を入力すると表示されます。
                  </p>
                )}
              </div>
            </div>
          </div>

          <details className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground outline-none">
              補足（書式・公開時の注意）
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1.5 pl-0.5">
              <li>改行はそのまま表示されます。</li>
              <li>
                太字は「太字」ボタン、または{" "}
                <kbd className="rounded border border-border bg-background px-1 py-px font-mono text-[10px]">
                  ⌘B
                </kbd>
                /
                <kbd className="rounded border border-border bg-background px-1 py-px font-mono text-[10px]">
                  Ctrl+B
                </kbd>
                （未選択で挿入すると <code className="rounded bg-muted px-1">**|**</code> が入ります）。
              </li>
              {!initialData.entryPledgeLockNoOffer ? (
                <li>
                  初回公開の時点でオフのままにすると、後から有効化できません（公開前にオンにしてください）。
                </li>
              ) : null}
            </ul>
          </details>

          {canEdit && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                onClick={() => void handleSavePledge()}
                disabled={isUpdatingPledge}
                className="w-full sm:w-auto"
              >
                {isUpdatingPledge ? "保存中…" : "誓約設定を保存"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </>
  );
}
