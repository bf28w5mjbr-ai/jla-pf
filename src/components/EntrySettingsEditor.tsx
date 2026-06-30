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
import { Bold, Coins, Eye, Info } from "lucide-react";
import {
  competitionEventCategoryScopeLabel,
  resolveCompetitionEventCategoryScope,
} from "@/lib/competitionEventCategoryScope";
import { cn } from "@/lib/utils";
import {
  buildEntryPeriodExtensionAnnouncement,
  buildEventAddedAnnouncement,
  isPeriodShortening,
  PUBLISHED_ENTRY_PERIOD_SHORTEN_FORBIDDEN_MESSAGE,
} from "@/lib/autoEntryChangeAnnouncement";
import {
  type AgeFeeTier,
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
} from "@/lib/competitionEntryAgeTiered";
import { toEligibleBirthDateInput } from "@/lib/eligibleBirthDateInput";
import {
  eventCardGroupKey,
  sexOptionLabel,
  sexesForSexOption,
  type EventSexOption,
} from "@/lib/competitionEventSexOption";
import CompetitionEventsSection from "@/components/CompetitionEventsSection";
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
  /** 年齢カテゴリに連動する場合（表示・タブ所属） */
  ageCategoryId?: string | null;
  /** 参加可能な AGEカテゴリ ID の明示リスト */
  allowedAgeCategoryIds?: unknown;
};

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

  // 種目管理
  const [events, setEvents] = useState<Event[]>(initialEvents);

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

  const useEventCategoryAllowList =
    ageCategories.length > 0 && eventScopeTabId !== "__NONE__";

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

  const syncEvents = (updatedEvents: Event[]) => {
    setEvents(updatedEvents);
    onEventsChange?.(updatedEvents);
  };

  const [isAddingDefaultEvents, setIsAddingDefaultEvents] = useState<string | null>(null);

  const categoryScope = resolveCompetitionEventCategoryScope(
    initialData.competitionCategory
  );
  const hasTeamEvents = events.some((event) => event.type === "TEAM");
  const hasIndividualEvents = events.some((event) => event.type === "INDIVIDUAL");

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

  const handleAddDefaultEvents = async (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM",
    sexOption: EventSexOption = "BOTH"
  ) => {
    const loadingKey = `${category}-${type}`;
    setIsAddingDefaultEvents(loadingKey);
    const defaultEventNames = DEFAULT_EVENTS[category][type];
    const requestedSexes = sexesForSexOption(sexOption);

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

  const handleDeleteAllEvents = async (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ) => {
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
        `${categoryLabel}${typeLabel}種目をすべて削除しますか？（${targetEvents.length}種目）

この操作は取り消せません。`
      )
    ) {
      return;
    }

    try {
      let liveEvents = events;
      for (const ev of targetEvents) {
        const response = await fetch(`/api/competitions/${competitionId}/events/${ev.id}`, {
          method: "DELETE",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof body.message === "string" ? body.message : `「${ev.name}」の削除に失敗しました`
          );
        }
        if (Array.isArray(body.events)) {
          liveEvents = body.events;
        }
      }
      syncEvents(liveEvents);
      toast.success(`${categoryLabel}${typeLabel}種目を削除しました`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "一括削除に失敗しました");
    }
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

  const formatAgeCategoryRangeSubtitle = (c: CompetitionAgeCategoryDraft) => {
    const a = toEligibleBirthDateInput(c.eligibleBirthDateFrom);
    const b = toEligibleBirthDateInput(c.eligibleBirthDateTo);
    if (!a && !b) return "生年月日の制限なし";
    if (a && b) return `${a} 〜 ${b}`;
    return a ? `${a} 〜` : `〜 ${b}`;
  };

  const countDistinctEventNames = (list: Event[]) => new Map(list.map((e) => [e.name, e])).size;

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
              <li>種目の追加・編集・削除は各ブロックで即座に保存されます。</li>
              <li>AGEカテゴリは大会出場条件で設定し、タブ切替で種目を分けます。</li>
              <li>参加費は下の「エントリー費用」で設定します。</li>
              <li>レーン数・ヒート数はスタートリストのラウンド設定で変更します（この画面では編集しません）。</li>
            </ul>
          </details>
        </CardHeader>
        <CardContent className="space-y-4 px-3 py-3 sm:px-4">
          {selectedCategory === "POOL" && (
            <div className="space-y-8">
              <CompetitionEventsSection
                competitionId={competitionId}
                canEdit={canEdit}
                category="POOL"
                type="INDIVIDUAL"
                eventsInScope={eventsInTabScope}
                ageCategories={ageCategories}
                eventScopeTabId={eventScopeTabId}
                useEventCategoryAllowList={useEventCategoryAllowList}
                requiresParticipantNotice={requiresParticipantNotice}
                onEventsChange={(ev) => syncEvents(ev as Event[])}
                isAddingDefaults={isAddingDefaultEvents === "POOL-INDIVIDUAL"}
                onAddDefaults={
                  canEdit
                    ? () => void handleAddDefaultEvents("POOL", "INDIVIDUAL", "BOTH")
                    : undefined
                }
                onDeleteAll={
                  canEdit ? () => void handleDeleteAllEvents("POOL", "INDIVIDUAL") : undefined
                }
                headerBadge={
                  <Badge
                    variant="secondary"
                    className="border-orange-200/80 bg-orange-100/90 text-[11px] text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100"
                  >
                    プール · 個人
                  </Badge>
                }
                headerDescription="種目ごとの一覧 · 下の団体種目とは別ブロック"
              />
              <CompetitionEventsSection
                competitionId={competitionId}
                canEdit={canEdit}
                category="POOL"
                type="TEAM"
                eventsInScope={eventsInTabScope}
                ageCategories={ageCategories}
                eventScopeTabId={eventScopeTabId}
                useEventCategoryAllowList={useEventCategoryAllowList}
                requiresParticipantNotice={requiresParticipantNotice}
                onEventsChange={(ev) => syncEvents(ev as Event[])}
                isAddingDefaults={isAddingDefaultEvents === "POOL-TEAM"}
                onAddDefaults={
                  canEdit ? () => void handleAddDefaultEvents("POOL", "TEAM", "BOTH") : undefined
                }
                onDeleteAll={
                  canEdit ? () => void handleDeleteAllEvents("POOL", "TEAM") : undefined
                }
                headerBadge={
                  <Badge
                    variant="secondary"
                    className="border-orange-200/80 bg-orange-100/90 text-[11px] text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100"
                  >
                    プール · 団体（チーム）
                  </Badge>
                }
                headerDescription="リレー等 · 上の個人種目とは別ブロック"
              />
            </div>
          )}

          {selectedCategory === "OCEAN" && (
            <div className="space-y-8">
              <CompetitionEventsSection
                competitionId={competitionId}
                canEdit={canEdit}
                category="OCEAN"
                type="INDIVIDUAL"
                eventsInScope={eventsInTabScope}
                ageCategories={ageCategories}
                eventScopeTabId={eventScopeTabId}
                useEventCategoryAllowList={useEventCategoryAllowList}
                requiresParticipantNotice={requiresParticipantNotice}
                onEventsChange={(ev) => syncEvents(ev as Event[])}
                isAddingDefaults={isAddingDefaultEvents === "OCEAN-INDIVIDUAL"}
                onAddDefaults={
                  canEdit
                    ? () => void handleAddDefaultEvents("OCEAN", "INDIVIDUAL", "BOTH")
                    : undefined
                }
                onDeleteAll={
                  canEdit ? () => void handleDeleteAllEvents("OCEAN", "INDIVIDUAL") : undefined
                }
                headerBadge={
                  <Badge
                    variant="secondary"
                    className="border-cyan-200/80 bg-cyan-100/90 text-[11px] text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100"
                  >
                    オーシャン · 個人
                  </Badge>
                }
                headerDescription="種目ごとの一覧 · 下の団体種目とは別ブロック"
              />
              <CompetitionEventsSection
                competitionId={competitionId}
                canEdit={canEdit}
                category="OCEAN"
                type="TEAM"
                eventsInScope={eventsInTabScope}
                ageCategories={ageCategories}
                eventScopeTabId={eventScopeTabId}
                useEventCategoryAllowList={useEventCategoryAllowList}
                requiresParticipantNotice={requiresParticipantNotice}
                onEventsChange={(ev) => syncEvents(ev as Event[])}
                isAddingDefaults={isAddingDefaultEvents === "OCEAN-TEAM"}
                onAddDefaults={
                  canEdit ? () => void handleAddDefaultEvents("OCEAN", "TEAM", "BOTH") : undefined
                }
                onDeleteAll={
                  canEdit ? () => void handleDeleteAllEvents("OCEAN", "TEAM") : undefined
                }
                headerBadge={
                  <Badge
                    variant="secondary"
                    className="border-cyan-200/80 bg-cyan-100/90 text-[11px] text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100"
                  >
                    オーシャン · 団体（チーム）
                  </Badge>
                }
                headerDescription="団体種目 · 上の個人種目とは別ブロック"
              />
            </div>
          )}
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
                まず上の種目表で個人またはチーム種目を追加してください。種目がある区分だけ参加費を設定できます。
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
