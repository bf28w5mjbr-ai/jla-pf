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
import { Bold, Coins, Eye, Info, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
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
  applyEntryQualificationToggleWithCertifiedMacro,
  buildQualificationRelaxAnnouncementFromConfigs,
  CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP,
  deriveEntryQualificationOptionsFromTemplates,
  ENTRY_REQUIRED_CERTIFIED_LIFESAVER,
  getCertifiedLifesaverUpperQualifications,
  normalizeEntryRequiredQualifications,
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
  parseAgeQualificationTiers,
  parseUnderFeeTiers,
  parseUnderQualificationTiers,
  type AgeFeeTier,
  type AgeQualificationTier,
} from "@/lib/competitionEntryAgeTiered";
import { expectedUnderFeeTierKeys, partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";
import { parseStoredUnderBandKeys } from "@/lib/underBandAllowList";
import {
  ENTRY_PLEDGE_TEXT_MAX_CHARS,
  wrapMarkdownBoldAroundSelection,
} from "@/lib/entryPledge";
import SimpleMarkdown from "@/components/SimpleMarkdown";

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

/** DB の日付を date 入力用 YYYY-MM-DD に（@db.Date は UTC 暦日として解釈） */
function toEligibleBirthDateInput(d: Date | string | null | undefined): string {
  if (d == null) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "";
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, "0");
  const day = String(x.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  /** 大会でアンダー制が有効なとき、この種目でアンダーによる年齢判定を使う */
  underAgeEligibilityEnabled?: boolean;
  /** null: タブの帯設定を継承。配列: 種目単位で上書き */
  underBandKeysOverride?: string[] | null;
};

export type CompetitionAgeCategoryDraft = {
  id: string;
  name: string;
  displayOrder: number;
  eligibleBirthDateFrom: Date | string | null;
  eligibleBirthDateTo: Date | string | null;
  /** null: マスタの全帯を許可。配列: 許可する帯キー */
  underBandKeysEnabled?: string[] | null;
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

/** カテゴリ帯ドラフトの effect で、内容が同じなら setState しない（再レンダー抑制） */
function bandCategoryDraftsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const id of bKeys) {
    const ra = a[id];
    const rb = b[id];
    if (!ra || !rb || ra.length !== rb.length) return false;
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return false;
    }
  }
  return true;
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

  // 出場に必要な資格（テンプレート由来 + 認定LSマクロ）
  const allowedQualificationOptions = useMemo(
    () => deriveEntryQualificationOptionsFromTemplates(qualificationTemplates),
    [qualificationTemplates]
  );
  const allowedQualificationSet = useMemo(
    () => new Set(allowedQualificationOptions),
    [allowedQualificationOptions]
  );
  const certifiedLifesaverUpperQualifications = useMemo(
    () => getCertifiedLifesaverUpperQualifications(allowedQualificationOptions),
    [allowedQualificationOptions]
  );
  const [requiredQualifications, setRequiredQualifications] = useState<string[]>(
    normalizeEntryRequiredQualifications(
      Array.isArray(initialData.requiredQualifications)
        ? (initialData.requiredQualifications as unknown[])
        : [],
      {
        allowedQualifications: allowedQualificationSet,
        expandCertifiedLifesaverMacro: true,
      }
    )
  );
  const [isUpdatingQualifications, setIsUpdatingQualifications] = useState(false);
  
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

  const tierIdRef = useRef(1);
  const mkTierRowId = () => `age-tier-${tierIdRef.current++}`;

  const initialParsedFeeTiers = parseAgeFeeTiers(initialData.entryFee as unknown);
  const initialParsedCategoryFeeTiers = parseAgeCategoryFeeTiers(initialData.entryFee as unknown);
  const initialParsedUnderFeeTiers = parseUnderFeeTiers(initialData.entryFee as unknown);
  const [feePricingMode, setFeePricingMode] = useState<
    "flat" | "byAge" | "byAgeCategory" | "byUnderAge"
  >(() => {
    if (initialParsedCategoryFeeTiers?.length) return "byAgeCategory";
    if (initialParsedUnderFeeTiers?.length) return "byUnderAge";
    if (initialParsedFeeTiers) return "byAge";
    return "flat";
  });
  const [ageFeeFormRows, setAgeFeeFormRows] = useState<
    { id: string; minAge: string; maxAge: string; individual: string; team: string }[]
  >(() => {
    if (initialParsedFeeTiers?.length) {
      return initialParsedFeeTiers.map((t) => ({
        id: mkTierRowId(),
        minAge: String(t.minAge),
        maxAge: t.maxAge === null ? "" : String(t.maxAge),
        individual: String(t.individualEntryFee),
        team: String(t.teamEntryFeePerTeam),
      }));
    }
    return [
      {
        id: mkTierRowId(),
        minAge: "0",
        maxAge: "",
        individual: String(
          initialData.entryFee?.individualEntryFee ??
            initialData.entryFee?.baseFee ??
            0
        ),
        team: String(initialData.entryFee?.teamEntryFeePerTeam ?? 0),
      },
    ];
  });

  const [categoryFeeDraft, setCategoryFeeDraft] = useState<
    Record<string, { individual: string; team: string }>
  >(() => buildCategoryFeeDraft(initialAgeCategories, initialParsedCategoryFeeTiers));

  const [underFeeDraft, setUnderFeeDraft] = useState<
    Record<string, { individual: string; team: string }>
  >(() => {
    if (!initialData.underAgeSystemEnabled) return {};
    const part = partitionUnderAgeBands(
      initialData.underAgeUThresholds ?? [],
      initialData.underAgeOpenEnabled ?? true
    );
    const keys = expectedUnderFeeTierKeys(part);
    const parsed = initialParsedUnderFeeTiers;
    const m: Record<string, { individual: string; team: string }> = {};
    for (const k of keys) {
      const row = parsed?.find((t) => t.tierKey === k);
      m[k] = {
        individual: String(row?.individualEntryFee ?? 0),
        team: String(row?.teamEntryFeePerTeam ?? 0),
      };
    }
    return m;
  });

  const initialParsedQualTiers = parseAgeQualificationTiers(
    initialData.requiredQualifications,
    allowedQualificationSet
  );
  const initialParsedUnderQualTiers = parseUnderQualificationTiers(
    initialData.requiredQualifications,
    allowedQualificationSet
  );
  const [qualPricingMode, setQualPricingMode] = useState<"flat" | "byAge" | "byUnder">(() => {
    if (initialParsedUnderQualTiers?.length) return "byUnder";
    if (initialParsedQualTiers?.length) return "byAge";
    return "flat";
  });
  const [ageQualFormRows, setAgeQualFormRows] = useState<
    { id: string; minAge: string; maxAge: string; qualifications: string[] }[]
  >(() => {
    if (initialParsedQualTiers?.length) {
      return initialParsedQualTiers.map((t) => ({
        id: mkTierRowId(),
        minAge: String(t.minAge),
        maxAge: t.maxAge === null ? "" : String(t.maxAge),
        qualifications: [...t.requiredQualifications],
      }));
    }
    return [
      {
        id: mkTierRowId(),
        minAge: "0",
        maxAge: "",
        qualifications: normalizeEntryRequiredQualifications(
          Array.isArray(initialData.requiredQualifications)
            ? (initialData.requiredQualifications as unknown[])
            : [],
          {
            allowedQualifications: allowedQualificationSet,
            expandCertifiedLifesaverMacro: true,
          }
        ),
      },
    ];
  });

  const [underQualDraft, setUnderQualDraft] = useState<Record<string, string[]>>(() => {
    if (!initialData.underAgeSystemEnabled) return {};
    const part = partitionUnderAgeBands(
      initialData.underAgeUThresholds ?? [],
      initialData.underAgeOpenEnabled ?? true
    );
    const keys = expectedUnderFeeTierKeys(part);
    const parsed = initialParsedUnderQualTiers;
    const m: Record<string, string[]> = {};
    for (const k of keys) {
      m[k] = [...(parsed?.find((t) => t.tierKey === k)?.requiredQualifications ?? [])];
    }
    return m;
  });

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
            `${c.id}\t${c.name}\t${toEligibleBirthDateInput(c.eligibleBirthDateFrom)}\t${toEligibleBirthDateInput(c.eligibleBirthDateTo)}\t${JSON.stringify(c.underBandKeysEnabled ?? null)}`
        )
        .join("\n"),
    [initialAgeCategories]
  );

  /** 種目を編集するスコープ: 年齢カテゴリ ID / 未分類 / カテゴリ管理 */
  const [eventScopeTabId, setEventScopeTabId] = useState<string>(() => {
    const cats = initialAgeCategories ?? [];
    if (cats.length > 0) return cats[0]!.id;
    return "__MANAGE__";
  });

  const [ageCategories, setAgeCategories] = useState<CompetitionAgeCategoryDraft[]>(
    () => initialAgeCategories ?? []
  );

  useEffect(() => {
    setAgeCategories(initialAgeCategories ?? []);
  }, [initialAgeCategoriesFingerprint, initialAgeCategories]);

  const eventsInTabScope = useMemo(() => {
    if (eventScopeTabId === "__MANAGE__") return [];
    if (eventScopeTabId === "__NONE__") {
      return events.filter((e) => e.ageCategoryId == null || e.ageCategoryId === "");
    }
    return events.filter((e) => e.ageCategoryId === eventScopeTabId);
  }, [events, eventScopeTabId]);

  useEffect(() => {
    if (eventScopeTabId === "__MANAGE__" || eventScopeTabId === "__NONE__") return;
    if (!ageCategories.some((c) => c.id === eventScopeTabId)) {
      const next =
        ageCategories[0]?.id ??
        (events.some((e) => e.ageCategoryId == null || e.ageCategoryId === "") ? "__NONE__" : "__MANAGE__");
      setEventScopeTabId(next);
    }
  }, [ageCategories, eventScopeTabId, events]);

  type CatDraft = { name: string; from: string; to: string };
  const [catDrafts, setCatDrafts] = useState<Record<string, CatDraft>>({});
  useEffect(() => {
    setCatDrafts(
      Object.fromEntries(
        ageCategories.map((c) => [
          c.id,
          {
            name: c.name,
            from: toEligibleBirthDateInput(c.eligibleBirthDateFrom),
            to: toEligibleBirthDateInput(c.eligibleBirthDateTo),
          },
        ])
      )
    );
  }, [ageCategories]);

  const [newCatName, setNewCatName] = useState("");
  const [newCatFrom, setNewCatFrom] = useState("");
  const [newCatTo, setNewCatTo] = useState("");
  const [ageCatBusy, setAgeCatBusy] = useState<string | null>(null);

  const buildPreliminaryLanesMap = (evts: Event[]) => {
    const map: Record<string, string> = {};
    evts.forEach((e) => {
      map[e.id] =
        typeof e.preliminaryHeatLaneCount === "number"
          ? String(e.preliminaryHeatLaneCount)
          : "";
    });
    return map;
  };

  const buildStartListRoundCountsMap = (evts: Event[]) => {
    const map: Record<string, string> = {};
    evts.forEach((e) => {
      const n =
        typeof e.startListRoundCount === "number" && e.startListRoundCount >= 1
          ? e.startListRoundCount
          : 1;
      map[e.id] = String(Math.min(32, n));
    });
    return map;
  };

  /** 種目の追加・削除などで一覧だけ更新するとき、入力中のレーン／ラウンドを消さない */
  const mergePreliminaryLanesFromSync = (
    prev: Record<string, string>,
    updatedEvents: Event[]
  ) => {
    const surv = new Set(updatedEvents.map((e) => e.id));
    const next = buildPreliminaryLanesMap(updatedEvents);
    for (const id of Object.keys(prev)) {
      if (surv.has(id)) next[id] = prev[id] as string;
    }
    return next;
  };

  const mergeStartListRoundCountsFromSync = (
    prev: Record<string, string>,
    updatedEvents: Event[]
  ) => {
    const surv = new Set(updatedEvents.map((e) => e.id));
    const next = buildStartListRoundCountsMap(updatedEvents);
    for (const id of Object.keys(prev)) {
      if (surv.has(id)) next[id] = prev[id] as string;
    }
    return next;
  };

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

  const eventSiblingsFor = (
    name: string,
    type: "INDIVIDUAL" | "TEAM",
    category: "POOL" | "OCEAN"
  ) =>
    eventsInTabScope
      .filter((e) => e.category === category && e.type === type && e.name === name)
      .slice()
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.sex === "MALE" ? -1 : 1;
      });
  const [eventPreliminaryLanes, setEventPreliminaryLanes] = useState<Record<string, string>>(
    () => buildPreliminaryLanesMap(initialEvents)
  );
  const [eventStartListRoundCounts, setEventStartListRoundCounts] = useState<
    Record<string, string>
  >(() => buildStartListRoundCountsMap(initialEvents));
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
      setEventPreliminaryLanes(buildPreliminaryLanesMap(updatedEvents));
      setEventStartListRoundCounts(buildStartListRoundCountsMap(updatedEvents));
      setEventTeamRelayPositions(buildTeamRelayPositionsMap(updatedEvents));
      onEventsChange?.(updatedEvents);
      return;
    }

    setEventBirthDateRanges((prev) => mergeEventBirthDateRangesFromSync(prev, updatedEvents));
    setEventPreliminaryLanes((prev) => mergePreliminaryLanesFromSync(prev, updatedEvents));
    setEventStartListRoundCounts((prev) => mergeStartListRoundCountsFromSync(prev, updatedEvents));
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

  const underPartitionForEditors = useMemo(() => {
    if (!initialData.underAgeSystemEnabled) return null;
    return partitionUnderAgeBands(
      initialData.underAgeUThresholds ?? [],
      initialData.underAgeOpenEnabled ?? true
    );
  }, [
    initialData.underAgeOpenEnabled,
    initialData.underAgeSystemEnabled,
    initialData.underAgeUThresholds,
  ]);

  const masterBandKeys = useMemo(
    () =>
      initialData.underAgeSystemEnabled && underPartitionForEditors
        ? expectedUnderFeeTierKeys(underPartitionForEditors)
        : [],
    [initialData.underAgeSystemEnabled, underPartitionForEditors]
  );

  const [categoryUnderBandDrafts, setCategoryUnderBandDrafts] = useState<Record<string, string[]>>(
    () => ({})
  );

  const ageCategoryUnderBandsFingerprint = ageCategories
    .map((c) => `${c.id}\t${JSON.stringify(c.underBandKeysEnabled ?? null)}`)
    .join("\n");
  const masterBandKeysFingerprint = masterBandKeys.join("|");

  useEffect(() => {
    const keys = masterBandKeys;
    setCategoryUnderBandDrafts((prev) => {
      const next: Record<string, string[]> = {};
      for (const c of ageCategories) {
        const parsed = parseStoredUnderBandKeys(c.underBandKeysEnabled as unknown);
        next[c.id] = parsed === null ? [...keys] : keys.filter((k) => parsed.includes(k));
      }
      return bandCategoryDraftsEqual(prev, next) ? prev : next;
    });
    // 参照の変わり目だけでは走らせない（親の再レンダーで配列が新しいだけのときの無駄を抑える）
  }, [ageCategoryUnderBandsFingerprint, masterBandKeysFingerprint]);

  /** 種目カードの帯チェック用（レンダーごとの find 繰り返しを避ける） */
  const eventBandSelectionByEventId = useMemo(() => {
    const allK = masterBandKeys;
    const map = new Map<string, string[]>();
    if (!allK.length) return map;
    const bandByCatId = new Map<string, string[] | null>();
    for (const c of ageCategories) {
      bandByCatId.set(c.id, parseStoredUnderBandKeys(c.underBandKeysEnabled as unknown));
    }
    for (const event of events) {
      const o = parseStoredUnderBandKeys(event.underBandKeysOverride as unknown);
      let sel: string[];
      if (o !== null) {
        sel = allK.filter((k) => o.includes(k));
      } else if (!event.ageCategoryId) {
        sel = [...allK];
      } else {
        const tab = bandByCatId.get(event.ageCategoryId) ?? null;
        sel = tab === null ? [...allK] : allK.filter((k) => tab.includes(k));
      }
      map.set(event.id, sel);
    }
    return map;
  }, [events, ageCategories, masterBandKeys]);

  const [eventUnderAgeEligibilityDrafts, setEventUnderAgeEligibilityDrafts] = useState<
    Record<string, boolean>
  >({});
  const [eventUnderBandSelectionDrafts, setEventUnderBandSelectionDrafts] = useState<
    Record<string, string[]>
  >({});
  const [eventSexOptionDrafts, setEventSexOptionDrafts] = useState<Record<string, SexOption>>({});
  const [eventNameDrafts, setEventNameDrafts] = useState<Record<string, string>>({});
  const [eventDeleteDrafts, setEventDeleteDrafts] = useState<Record<string, boolean>>({});
  const eventCardRepresentativesInScope = useMemo(
    () =>
      Array.from(
        new Map(
          eventsInTabScope.map((e) => [`${e.category}:${e.type}:${e.name}`, e] as const)
        ).values()
      ),
    [eventsInTabScope]
  );

  const serverUnderAgeEnabledByEventId = useMemo(
    () =>
      Object.fromEntries(
        events.map((e) => [e.id, e.underAgeEligibilityEnabled !== false] as const)
      ) as Record<string, boolean>,
    [events]
  );

  const resolveTabBandSelection = (event: Event): string[] => {
    const allK = masterBandKeys;
    if (!allK.length) return [];
    const cat = event.ageCategoryId ? ageCategories.find((c) => c.id === event.ageCategoryId) : null;
    const tabParsed = parseStoredUnderBandKeys(cat?.underBandKeysEnabled as unknown);
    return tabParsed === null ? allK : allK.filter((k) => tabParsed.includes(k));
  };

  const arraysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  const hasPendingEventUnderAgeChanges = useMemo(() => {
    for (const event of eventCardRepresentativesInScope) {
      const serverEnabled = serverUnderAgeEnabledByEventId[event.id] ?? true;
      const draftEnabled =
        eventUnderAgeEligibilityDrafts[event.id] ?? serverEnabled;
      if (
        Object.prototype.hasOwnProperty.call(eventUnderAgeEligibilityDrafts, event.id) &&
        draftEnabled !== serverEnabled
      ) {
        return true;
      }

      const serverBands = eventBandSelectionByEventId.get(event.id) ?? [];
      if (Object.prototype.hasOwnProperty.call(eventUnderBandSelectionDrafts, event.id)) {
        const draftBands = eventUnderBandSelectionDrafts[event.id] ?? [];
        if (!arraysEqual(draftBands, serverBands)) return true;
      }
    }
    return false;
  }, [
    eventBandSelectionByEventId,
    eventCardRepresentativesInScope,
    eventUnderAgeEligibilityDrafts,
    eventUnderBandSelectionDrafts,
    serverUnderAgeEnabledByEventId,
  ]);

  const hasPendingEventSexOptionChanges = useMemo(
    () =>
      eventCardRepresentativesInScope.some((event) => {
        const key = makeEventSexOptionKey(event);
        if (!Object.prototype.hasOwnProperty.call(eventSexOptionDrafts, key)) return false;
        return eventSexOptionDrafts[key] !== getEventSexOption(event.name, event.category, event.type);
      }),
    [eventCardRepresentativesInScope, eventSexOptionDrafts]
  );

  const hasPendingEventNameChanges = useMemo(
    () =>
      eventCardRepresentativesInScope.some((event) => {
        if (eventDeleteDrafts[event.id]) return false;
        if (!Object.prototype.hasOwnProperty.call(eventNameDrafts, event.id)) return false;
        const draft = (eventNameDrafts[event.id] ?? "").trim();
        return draft.length > 0 && draft !== event.name.trim();
      }),
    [eventCardRepresentativesInScope, eventDeleteDrafts, eventNameDrafts]
  );

  const hasPendingEventDeleteChanges = useMemo(
    () => eventCardRepresentativesInScope.some((event) => eventDeleteDrafts[event.id]),
    [eventCardRepresentativesInScope, eventDeleteDrafts]
  );

  /** 種目ごとのアンダー設定ドラフトを API に反映（トースト・再取得・ドラフトクリアは呼び出し側） */
  const applyEventUnderAgeDraftsToServer = async () => {
    for (const event of eventCardRepresentativesInScope) {
      const serverEnabled = serverUnderAgeEnabledByEventId[event.id] ?? true;
      const draftEnabled =
        eventUnderAgeEligibilityDrafts[event.id] ?? serverEnabled;
      const hasEnabledDraft = Object.prototype.hasOwnProperty.call(
        eventUnderAgeEligibilityDrafts,
        event.id
      );
      const enabledChanged = hasEnabledDraft && draftEnabled !== serverEnabled;

      const serverBands = eventBandSelectionByEventId.get(event.id) ?? [];
      const hasBandDraft = Object.prototype.hasOwnProperty.call(
        eventUnderBandSelectionDrafts,
        event.id
      );
      const draftBands = hasBandDraft
        ? eventUnderBandSelectionDrafts[event.id] ?? []
        : serverBands;
      const bandsChanged = hasBandDraft && !arraysEqual(draftBands, serverBands);

      if (!enabledChanged && !bandsChanged) continue;
      if (bandsChanged && draftBands.length === 0) {
        throw new Error("許可する帯を1つ以上選んでください");
      }

      const payload: Record<string, unknown> = {};
      if (enabledChanged) {
        payload.underAgeEligibilityEnabled = draftEnabled;
      }
      if (bandsChanged) {
        const tabSel = resolveTabBandSelection(event);
        const isSameAsTab =
          draftBands.length === tabSel.length &&
          draftBands.every((k) => tabSel.includes(k));
        payload.underBandKeysOverride = isSameAsTab ? null : draftBands;
      }
      if (Object.keys(payload).length === 0) continue;

      const response = await fetch(`/api/competitions/${competitionId}/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(typeof err.message === "string" ? err.message : "更新に失敗しました");
      }
    }
  };

  /** 種目ごとの性別区分ドラフトを API に反映（トースト・再取得・ドラフトクリアは呼び出し側） */
  const applyEventSexOptionDraftsToServer = async () => {
    for (const event of eventCardRepresentativesInScope) {
      if (eventDeleteDrafts[event.id]) continue;
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

      const response = await fetch(`/api/competitions/${competitionId}/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withOptionalAnnounce(announce, {
            sexOption: nextSexOption,
          })
        ),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          typeof error.message === "string" ? error.message : "種目性別の更新に失敗しました"
        );
      }
    }
  };

  /** 種目名ドラフトを API に反映（削除予定の種目は除外） */
  const applyEventNameDraftsToServer = async () => {
    for (const event of eventCardRepresentativesInScope) {
      if (eventDeleteDrafts[event.id]) continue;
      if (!Object.prototype.hasOwnProperty.call(eventNameDrafts, event.id)) continue;
      const next = (eventNameDrafts[event.id] ?? "").trim();
      if (!next || next === event.name.trim()) continue;
      const response = await fetch(`/api/competitions/${competitionId}/events/${event.id}`, {
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
      if (!eventDeleteDrafts[event.id]) continue;
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

  const getEventSexOption = (
    eventName: string,
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ): SexOption => {
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

    if (eventScopeTabId === "__MANAGE__") {
      toast.info("年齢カテゴリを選んでから追加してください");
      setIsAddingDefaultEvents(null);
      return;
    }

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
          .map((e) => [e.name, e] as const)
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
      for (const ev of targetEvents) next[ev.id] = true;
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

  const handleSaveUnderAgeSettings = async () => {
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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.message === "string" ? err.message : "更新に失敗しました");
      }
      toast.success("アンダー制の設定を更新しました");
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

    if (feePricingMode === "byAgeCategory") {
      if (ageCategories.length === 0) {
        toast.error("年齢カテゴリを「カテゴリ管理」で作成してから、カテゴリ別の参加費を設定してください");
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
    } else if (feePricingMode === "byUnderAge") {
      if (!initialData.underAgeSystemEnabled) {
        toast.error("先に下の「アンダー制」で有効化し、Uのしきい値を保存してください");
        return;
      }
      const part = underPartitionForEditors;
      if (!part) {
        toast.error("アンダー区分を計算できませんでした");
        return;
      }
      const need = expectedUnderFeeTierKeys(part);
      const tiers: {
        tierKey: string;
        individualEntryFee: number;
        teamEntryFeePerTeam: number;
      }[] = [];
      for (const k of need) {
        const row = underFeeDraft[k] ?? { individual: "0", team: "0" };
        const individualEntryFee = parseFloat(row.individual);
        const teamEntryFeePerTeam = parseFloat(row.team);
        if (
          hasIndividualEvents &&
          (!Number.isFinite(individualEntryFee) || individualEntryFee < 0)
        ) {
          toast.error(`区分「${k}」の個人料金を正しく入力してください`);
          return;
        }
        if (hasTeamEvents && (!Number.isFinite(teamEntryFeePerTeam) || teamEntryFeePerTeam < 0)) {
          toast.error(`区分「${k}」のチーム料金を正しく入力してください`);
          return;
        }
        tiers.push({
          tierKey: k,
          individualEntryFee: hasIndividualEvents ? individualEntryFee : 0,
          teamEntryFeePerTeam: hasTeamEvents ? teamEntryFeePerTeam : 0,
        });
      }
      payload = { pricingMode: "byUnderAge", underFeeTiers: tiers };
    } else if (feePricingMode === "byAge") {
      const tiers: AgeFeeTier[] = [];
      for (const row of ageFeeFormRows) {
        const minAge = parseInt(row.minAge, 10);
        const maxRaw = row.maxAge.trim();
        const maxAge = maxRaw === "" ? null : parseInt(maxRaw, 10);
        const individualEntryFee = parseFloat(row.individual);
        const teamEntryFeePerTeam = parseFloat(row.team);
        if (!Number.isFinite(minAge) || minAge < 0) {
          toast.error("各年齢帯の下限年齢を正しく入力してください");
          return;
        }
        if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) {
          toast.error("上限年齢は下限以上にするか、上限なしの場合は空欄にしてください");
          return;
        }
        if (
          hasIndividualEvents &&
          (!Number.isFinite(individualEntryFee) || individualEntryFee < 0)
        ) {
          toast.error("個人エントリー料金を正しく入力してください");
          return;
        }
        if (hasTeamEvents && (!Number.isFinite(teamEntryFeePerTeam) || teamEntryFeePerTeam < 0)) {
          toast.error("チーム種目の1チームあたり料金を正しく入力してください");
          return;
        }
        tiers.push({
          minAge,
          maxAge,
          individualEntryFee: hasIndividualEvents ? individualEntryFee : 0,
          teamEntryFeePerTeam: hasTeamEvents ? teamEntryFeePerTeam : 0,
        });
      }
      if (tiers.length === 0) {
        toast.error("年齢帯を1件以上追加してください");
        return;
      }
      payload = { pricingMode: "byAge", ageFeeTiers: tiers };
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

      if (feeBody.entryFee != null && feePricingMode === "byAgeCategory") {
        setCategoryFeeDraft(
          buildCategoryFeeDraft(ageCategories, parseAgeCategoryFeeTiers(feeBody.entryFee))
        );
      }
      if (feeBody.entryFee != null && feePricingMode === "byUnderAge" && underPartitionForEditors) {
        const parsed = parseUnderFeeTiers(feeBody.entryFee);
        const keys = expectedUnderFeeTierKeys(underPartitionForEditors);
        const next: Record<string, { individual: string; team: string }> = {};
        for (const k of keys) {
          const row = parsed?.find((t) => t.tierKey === k);
          next[k] = {
            individual: String(row?.individualEntryFee ?? 0),
            team: String(row?.teamEntryFeePerTeam ?? 0),
          };
        }
        setUnderFeeDraft(next);
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

  const toggleQualification = (value: string) => {
    setRequiredQualifications((current) =>
      applyEntryQualificationToggleWithCertifiedMacro(current, value, allowedQualificationOptions)
    );
  };

  const toggleQualInTier = (rowId: string, option: string) => {
    setAgeQualFormRows((rows) =>
      rows.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          qualifications: applyEntryQualificationToggleWithCertifiedMacro(
            r.qualifications,
            option,
            allowedQualificationOptions
          ),
        };
      })
    );
  };

  const toggleQualInUnderTier = (tierKey: string, option: string) => {
    setUnderQualDraft((prev) => {
      const cur = prev[tierKey] ?? [];
      return {
        ...prev,
        [tierKey]: applyEntryQualificationToggleWithCertifiedMacro(
          cur,
          option,
          allowedQualificationOptions
        ),
      };
    });
  };

  const handleUpdateQualifications = async () => {
    if (qualPricingMode === "byAge") {
      for (const row of ageQualFormRows) {
        const minAge = parseInt(row.minAge, 10);
        const maxRaw = row.maxAge.trim();
        const maxAge = maxRaw === "" ? null : parseInt(maxRaw, 10);
        if (!Number.isFinite(minAge) || minAge < 0) {
          toast.error("各年齢帯の下限年齢を正しく入力してください");
          return;
        }
        if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) {
          toast.error("上限年齢は下限以上にするか、上限なしの場合は空欄にしてください");
          return;
        }
      }
    }

    if (qualPricingMode === "byUnder") {
      if (!initialData.underAgeSystemEnabled || !underPartitionForEditors) {
        toast.error("アンダー制を有効にしてから、アンダー区分別の資格を設定してください");
        return;
      }
    }

    const nextStored: unknown =
      qualPricingMode === "byAge"
        ? {
            ageQualificationTiers: ageQualFormRows.map((row) => {
              const minAge = parseInt(row.minAge, 10);
              const maxRaw = row.maxAge.trim();
              const maxAge = maxRaw === "" ? null : parseInt(maxRaw, 10);
              return {
                minAge,
                maxAge,
                requiredQualifications: normalizeEntryRequiredQualifications(row.qualifications, {
                  allowedQualifications: allowedQualificationSet,
                  expandCertifiedLifesaverMacro: true,
                }),
              };
            }),
          }
        : qualPricingMode === "byUnder" && underPartitionForEditors
          ? {
              underQualificationTiers: expectedUnderFeeTierKeys(underPartitionForEditors).map(
                (k) => ({
                  tierKey: k,
                  requiredQualifications: normalizeEntryRequiredQualifications(
                    underQualDraft[k] ?? [],
                    {
                      allowedQualifications: allowedQualificationSet,
                      expandCertifiedLifesaverMacro: true,
                    }
                  ),
                })
              ),
            }
          : normalizeEntryRequiredQualifications(requiredQualifications, {
              allowedQualifications: allowedQualificationSet,
              expandCertifiedLifesaverMacro: true,
            });

    setIsUpdatingQualifications(true);

    try {
      const announce = buildQualificationRelaxAnnouncementFromConfigs(
        initialData.requiredQualifications,
        nextStored,
        requiresParticipantNotice,
        underPartitionForEditors ?? null
      );
      const basePayload =
        qualPricingMode === "byAge"
          ? {
              ageQualificationTiers: (nextStored as { ageQualificationTiers: AgeQualificationTier[] })
                .ageQualificationTiers,
            }
          : qualPricingMode === "byUnder"
            ? {
                underQualificationTiers: (
                  nextStored as { underQualificationTiers: { tierKey: string; requiredQualifications: string[] }[] }
                ).underQualificationTiers,
              }
            : {
                requiredQualifications: normalizeEntryRequiredQualifications(requiredQualifications, {
                  allowedQualifications: allowedQualificationSet,
                  expandCertifiedLifesaverMacro: true,
                }),
              };
      const response = await fetch(
        `/api/competitions/${competitionId}/entry-qualifications`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(withOptionalAnnounce(announce, basePayload)),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "必要資格の更新に失敗しました");
      }

      const data = await response.json();
      if (Array.isArray(data.requiredQualifications)) {
        setRequiredQualifications(
          normalizeEntryRequiredQualifications(data.requiredQualifications, {
            allowedQualifications: allowedQualificationSet,
            expandCertifiedLifesaverMacro: true,
          })
        );
      }

      toast.success("出場に必要な資格を更新しました");
      router.refresh();
      notifySectionSaved();
    } catch (error) {
      console.error("必要資格の更新エラー:", error);
      toast.error(
        error instanceof Error ? error.message : "必要資格の更新に失敗しました"
      );
    } finally {
      setIsUpdatingQualifications(false);
    }
  };

  const handleAddPoolIndividual = async () => {
    if (!poolIndividualName.trim()) {
      setPoolIndividualError("種目名を入力してください");
      return;
    }

    if (eventScopeTabId === "__MANAGE__") {
      setPoolIndividualError("種目を追加するには、上の年齢カテゴリ（または未分類）を選んでください");
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

    if (eventScopeTabId === "__MANAGE__") {
      setPoolTeamError("種目を追加するには、上の年齢カテゴリ（または未分類）を選んでください");
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

    if (eventScopeTabId === "__MANAGE__") {
      setOceanIndividualError("種目を追加するには、上の年齢カテゴリ（または未分類）を選んでください");
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

    if (eventScopeTabId === "__MANAGE__") {
      setOceanTeamError("種目を追加するには、上の年齢カテゴリ（または未分類）を選んでください");
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
          .map((event) => [event.name, event])
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

    const sexLabelForToast = (sex: string) =>
      sex === "MALE" ? "男子" : sex === "FEMALE" ? "女子" : sex === "OTHER" ? "混合" : "";

    for (const event of rowTargets) {
      const raw = (eventPreliminaryLanes[event.id] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (Number.isNaN(n) || !Number.isInteger(n) || n < 1 || n > 32) {
        return {
          ok: false,
          message: `「${event.name}」${sexLabelForToast(event.sex)}の1レースあたりの最大レーン数は1〜32の整数、または空欄（未設定）にしてください`,
        };
      }
    }

    for (const event of rowTargets) {
      const raw = (eventStartListRoundCounts[event.id] ?? "1").trim();
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 32) {
        return {
          ok: false,
          message: `「${event.name}」のスタートリストのラウンド数は1〜32の整数にしてください`,
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
    const { ageTargets, rowTargets } = getEventTableSectionTargets(category, type);
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

    const laneOk = await Promise.all(
      rowTargets.map((event) => {
        const raw = (eventPreliminaryLanes[event.id] ?? "").trim();
        const laneValue = raw === "" ? null : Number(raw);
        return patchEvent(event.id, { preliminaryHeatLaneCount: laneValue });
      })
    );
    errorCount += laneOk.filter((ok) => !ok).length;

    const roundRes = await fetch(
      `/api/competitions/${competitionId}/events/bulk-round-counts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rowTargets.map((event) => ({
            eventId: event.id,
            startListRoundCount: Number(
              (eventStartListRoundCounts[event.id] ?? "1").trim()
            ),
          })),
        }),
      }
    );
    if (!roundRes.ok) {
      errorCount += rowTargets.length;
    }

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
    if (eventScopeTabId === "__MANAGE__") {
      toast.info("カテゴリ管理では種目表を保存できません。年齢カテゴリのタブを選んでください");
      return;
    }
    const active = EVENT_TABLE_ALL_SECTIONS.filter(([c, t]) =>
      eventsInTabScope.some((e) => e.category === c && e.type === t)
    );
    const willSaveSex = Boolean(canEdit) && hasPendingEventSexOptionChanges;
    const willSaveUnder =
      Boolean(initialData.underAgeSystemEnabled && canEdit) && hasPendingEventUnderAgeChanges;
    const willSaveEventNames = Boolean(canEdit) && hasPendingEventNameChanges;
    const willSaveEventDeletes = Boolean(canEdit) && hasPendingEventDeleteChanges;
    const willSaveTables = active.length > 0;

    if (!willSaveTables && !willSaveUnder && !willSaveSex && !willSaveEventNames && !willSaveEventDeletes) {
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
        if (eventDeleteDrafts[event.id]) continue;
        if (!Object.prototype.hasOwnProperty.call(eventNameDrafts, event.id)) continue;
        if ((eventNameDrafts[event.id] ?? "").trim().length === 0) {
          toast.error("種目名は空欄にできません");
          return;
        }
      }
      const seen = new Set<string>();
      for (const event of eventCardRepresentativesInScope) {
        if (eventDeleteDrafts[event.id]) continue;
        const drafted = (eventNameDrafts[event.id] ?? event.name).trim();
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
      if (willSaveSex) {
        const reducedEvents = eventCardRepresentativesInScope
          .filter((event) => {
            if (eventDeleteDrafts[event.id]) return false;
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

      if (willSaveUnder) {
        await applyEventUnderAgeDraftsToServer();
      }

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
      if (willSaveEventDeletes) {
        await applyEventDeleteDraftsToServer();
      }

      await refreshEventsFromServer();
      toast.dismiss();

      if (willSaveSex) {
        setEventSexOptionDrafts({});
      }
      if (willSaveUnder) {
        setEventUnderAgeEligibilityDrafts({});
        setEventUnderBandSelectionDrafts({});
      }
      if (willSaveEventNames) {
        setEventNameDrafts({});
      }
      if (willSaveEventDeletes) {
        setEventDeleteDrafts({});
      }

      const savedTargets: string[] = [];
      if (willSaveEventNames) savedTargets.push("種目名");
      if (willSaveEventDeletes) savedTargets.push("削除予定");
      if (willSaveSex) savedTargets.push("性別区分");
      if (willSaveUnder) savedTargets.push("アンダー設定");
      if (willSaveTables) savedTargets.push("種目表");
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

  const handleSaveAgeCategoryRow = async (categoryRowId: string) => {
    const d = catDrafts[categoryRowId];
    if (!d) return;
    const nameTrim = d.name.trim();
    if (!nameTrim) {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    const fromTrim = d.from.trim();
    const toTrim = d.to.trim();
    if ((fromTrim === "") !== (toTrim === "")) {
      toast.error("生年月日の範囲は、開始・終了を両方入力するか、両方空にしてください");
      return;
    }
    let underBandPayload: string[] | null | undefined;
    if (initialData.underAgeSystemEnabled && masterBandKeys.length > 0) {
      const sel = categoryUnderBandDrafts[categoryRowId] ?? masterBandKeys;
      if (sel.length === 0) {
        toast.error("このタブで許可する帯を1つ以上選んでください");
        return;
      }
      underBandPayload = sel.length >= masterBandKeys.length ? null : sel;
    }
    setAgeCatBusy(categoryRowId);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/age-categories/${categoryRowId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameTrim,
            eligibleBirthDateFrom: fromTrim === "" ? null : fromTrim,
            eligibleBirthDateTo: toTrim === "" ? null : toTrim,
            ...(underBandPayload !== undefined ? { underBandKeysEnabled: underBandPayload } : {}),
          }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "保存に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      await refreshEventsFromServer();
      toast.success("年齢カテゴリを保存しました（連動中の種目へ反映済み）");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const handleAddAgeCategory = async () => {
    const nameTrim = newCatName.trim();
    if (!nameTrim) {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    const fromTrim = newCatFrom.trim();
    const toTrim = newCatTo.trim();
    if ((fromTrim === "") !== (toTrim === "")) {
      toast.error("生年月日の範囲は、開始・終了を両方入力するか、両方空にしてください");
      return;
    }
    setAgeCatBusy("__new__");
    try {
      const payload: Record<string, unknown> = { name: nameTrim };
      if (fromTrim !== "" && toTrim !== "") {
        payload.eligibleBirthDateFrom = fromTrim;
        payload.eligibleBirthDateTo = toTrim;
      }
      const response = await fetch(`/api/competitions/${competitionId}/age-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "追加に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      const created = body.ageCategory as { id?: string } | undefined;
      if (created?.id) setEventScopeTabId(created.id);
      setNewCatName("");
      setNewCatFrom("");
      setNewCatTo("");
      toast.success("年齢カテゴリを追加しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const formatAgeCategoryRangeSubtitle = (c: CompetitionAgeCategoryDraft) => {
    const a = toEligibleBirthDateInput(c.eligibleBirthDateFrom);
    const b = toEligibleBirthDateInput(c.eligibleBirthDateTo);
    if (!a && !b) return "生年月日の制限なし";
    if (a && b) return `${a} 〜 ${b}`;
    return a ? `${a} 〜` : `〜 ${b}`;
  };

  /** カテゴリ管理の下書き（YYYY-MM-DD 文字列）用。タブ表示を保存前の編集と一致させる */
  const formatCatDraftRangeSubtitle = (from: string, to: string) => {
    const a = from.trim();
    const b = to.trim();
    if (!a && !b) return "生年月日の制限なし";
    if (a && b) return `${a} 〜 ${b}`;
    return a ? `${a} 〜` : `〜 ${b}`;
  };

  const countDistinctEventNames = (list: Event[]) => new Map(list.map((e) => [e.name, e])).size;

  const handleDeleteAgeCategory = async (categoryRowId: string, label: string) => {
    if (!confirm(`年齢カテゴリ「${label}」を削除しますか？`)) return;
    setAgeCatBusy(categoryRowId);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/age-categories/${categoryRowId}`,
        { method: "DELETE" }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "削除に失敗しました");
      }
      if (Array.isArray(body.ageCategories)) {
        setAgeCategories(body.ageCategories as CompetitionAgeCategoryDraft[]);
      }
      await refreshEventsFromServer();
      toast.success("年齢カテゴリを削除しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setAgeCatBusy(null);
    }
  };

  const markEventDeleteDraft = (event: Event) => {
    if (
      !confirm(
        `「${event.name}」を削除予定にしますか？\n男子・女子はまとめて対象になります（保存時に確定）。`
      )
    ) {
      return;
    }
    setEventDeleteDrafts((prev) => ({ ...prev, [event.id]: true }));
  };

  const unmarkEventDeleteDraft = (event: Event) => {
    setEventDeleteDrafts((prev) => {
      if (!prev[event.id]) return prev;
      const next = { ...prev };
      delete next[event.id];
      return next;
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
          .map((e) => [e.name, e])
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
    const deleteDrafted = Boolean(eventDeleteDrafts[event.id]);
    const nameDraft = eventNameDrafts[event.id] ?? event.name;
    const siblings = eventSiblingsFor(event.name, type, category);
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

          {initialData.underAgeSystemEnabled ? (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={
                  eventUnderAgeEligibilityDrafts[event.id] ??
                  (event.underAgeEligibilityEnabled !== false)
                }
                onChange={(e) =>
                  setEventUnderAgeEligibilityDrafts((prev) => ({
                    ...prev,
                    [event.id]: e.target.checked,
                  }))
                }
                disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
              />
              <span>アンダー制で年齢判定（オフのときは下の生年月日／年齢）</span>
            </label>
          ) : null}

          {initialData.underAgeSystemEnabled &&
          masterBandKeys.length > 0 &&
          (eventUnderAgeEligibilityDrafts[event.id] ??
            (event.underAgeEligibilityEnabled !== false)) ? (
            <div className="space-y-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-2">
              <p className="text-[10px] font-medium text-muted-foreground">
                この種目でエントリー可能な帯
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {masterBandKeys.map((key) => {
                  const sel =
                    eventUnderBandSelectionDrafts[event.id] ??
                    (eventBandSelectionByEventId.get(event.id) ?? []);
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={sel.includes(key)}
                        disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                        onChange={(e) => {
                          const next = new Set(sel);
                          if (e.target.checked) next.add(key);
                          else if (next.size > 1) next.delete(key);
                          setEventUnderBandSelectionDrafts((prev) => ({
                            ...prev,
                            [event.id]: masterBandKeys.filter((k) => next.has(k)),
                          }));
                        }}
                      />
                      <span>{key}</span>
                    </label>
                  );
                })}
              </div>
              {(Object.prototype.hasOwnProperty.call(eventUnderBandSelectionDrafts, event.id)
                ? eventUnderBandSelectionDrafts[event.id] ??
                  (eventBandSelectionByEventId.get(event.id) ?? [])
                : eventBandSelectionByEventId.get(event.id) ?? []
              ).length > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-[10px] text-muted-foreground"
                  disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                  onClick={() => {
                    setEventUnderBandSelectionDrafts((prev) => ({
                      ...prev,
                      [event.id]: resolveTabBandSelection(event),
                    }));
                  }}
                >
                  タブ既定に合わせる
                </Button>
              ) : null}
            </div>
          ) : null}

          {linked ? (
            <p className="text-[10px] text-muted-foreground">
              年齢カテゴリ連動中です。下の日付はカテゴリの範囲を表示しています。種目ごとに変えて保存すると連動は解除され、その範囲が使われます。日付を変えずに保存すれば連動のままです。カテゴリ全体の変更は「カテゴリ管理」タブから行ってください。
            </p>
          ) : null}

          <div
            className="space-y-2.5 rounded-md border border-border/50 bg-background/40 px-2.5 py-2.5"
            role="group"
            aria-label="進行・スタートリスト用（ページ下部の「このタブを保存」でまとめて保存）"
          >
            <p className="text-[10px] font-medium text-muted-foreground">
              進行・スタートリスト（ページ下部の「このタブを保存」でまとめて反映）
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
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">
                  1レースの最大レーン数・全ラウンド共通（男女別・1〜32、空欄は未設定）
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {siblings.map((row) => (
                    <label key={row.id} className="flex items-center gap-1">
                      <span className="w-4 shrink-0 text-center text-[10px] font-medium text-muted-foreground">
                        {row.sex === "MALE" ? "男" : row.sex === "FEMALE" ? "女" : "他"}
                      </span>
                      <Input
                        numericInput="integer"
                        min={1}
                        max={32}
                        placeholder="—"
                        title="1〜32、空欄で未設定"
                        value={eventPreliminaryLanes[row.id] ?? ""}
                        onChange={(e) => {
                          setEventPreliminaryLanes((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }));
                        }}
                        disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                        className="h-8 w-11 px-1 text-center text-xs tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">
                  スタートリストのラウンド数（男女別・全ラウンド1〜32）
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {siblings.map((row) => (
                    <label key={`rc-${row.id}`} className="flex items-center gap-1">
                      <span className="w-4 shrink-0 text-center text-[10px] font-medium text-muted-foreground">
                        {row.sex === "MALE" ? "男" : row.sex === "FEMALE" ? "女" : "他"}
                      </span>
                      <Input
                        numericInput="integer"
                        min={1}
                        max={32}
                        title="1〜32（全ラウンドのタブ数）"
                        value={eventStartListRoundCounts[row.id] ?? "1"}
                        onChange={(e) => {
                          setEventStartListRoundCounts((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }));
                        }}
                        disabled={!canEdit || deleteDrafted || bulkSavingAllEventTables}
                        className="h-8 w-11 px-1 text-center text-xs tabular-nums"
                      />
                    </label>
                  ))}
                </div>
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
          <CardDescription className="text-xs">
            受付の開始・終了日時です。日時は日本時間（Asia/Tokyo）の壁時計で入力・保存され、設定一覧の表示とも同じ基準です。
          </CardDescription>
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
      <>
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">アンダー制について</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            U・OPEN の有効化、しきい値の追加、OPEN
            の選択、タブ／種目ごとの「許可する帯」の編集は、
            <span className="font-medium text-foreground">「種目・参加費」</span>
            タブの先頭にある
            <span className="font-medium text-foreground">アンダー制度設定</span>
            と種目ブロックで行います。参加費・出場資格のアンダー区分も、そこで定まるマスタの帯に連動します。
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">年齢・所属クラブ</CardTitle>
          <CardDescription className="text-xs">
            大会全体の年齢範囲と、エントリー時のクラブ所属の要否です。年齢条件は4月2日始まりの年度に属する開催開始日について、その年度の末日（翌年4月1日・日本時間）時点の満年齢で判定します。入力する数値は下限・上限とも「以上」「以下」で境界の歳を含み、「○歳未満」のような表記ではありません。
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

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            入力する数値は「その歳以上」「その歳以下」で、<span className="font-medium text-foreground">境界の年齢は含みます</span>
            （「○歳未満」のような上限表現ではありません）。
          </p>

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
                aria-describedby="competitionMinAge-hint"
              />
              <p id="competitionMinAge-hint" className="mt-1 text-xs text-gray-500">
                満年齢が入力値<span className="font-medium text-foreground">以上</span>なら参加可（その歳を含む）。空欄は下限なし。
              </p>
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
                aria-describedby="competitionMaxAge-hint"
              />
              <p id="competitionMaxAge-hint" className="mt-1 text-xs text-gray-500">
                満年齢が入力値<span className="font-medium text-foreground">以下</span>なら参加可（その歳を含む）。空欄は上限なし。
              </p>
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
              <p className="text-xs text-gray-500">
                「所属クラブ必須」を選ぶと、所属クラブのないユーザーはエントリーできません。
              </p>
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
      </>
      )}

      {isSection("eligibility") && (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">参加対象者（自由記述）</CardTitle>
          <CardDescription className="text-xs">公開ページに表示する補足文です。</CardDescription>
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
            <p className="text-sm text-gray-500">
              未入力の場合は「制限なし」として表示されます。
            </p>
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
      <Card className="overflow-hidden">
        <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
          <CardTitle className="text-base font-semibold">出場に必要な資格</CardTitle>
          <CardDescription className="space-y-1 text-xs">
            <span className="block">未選択の場合は資格不要です。</span>
            <span className="block text-muted-foreground">
              資格候補は資格テンプレートから自動反映されます。
            </span>
            <span className="block text-muted-foreground">{CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3">
          {allowedQualificationOptions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              資格テンプレートが未登録のため、参加資格を設定できません。
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  className="h-3.5 w-3.5"
                  checked={qualPricingMode === "flat"}
                  onChange={() => setQualPricingMode("flat")}
                  disabled={!canEdit}
                />
                全員同一
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  className="h-3.5 w-3.5"
                  checked={qualPricingMode === "byAge"}
                  onChange={() => setQualPricingMode("byAge")}
                  disabled={!canEdit}
                />
                年齢帯別
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  className="h-3.5 w-3.5"
                  checked={qualPricingMode === "byUnder"}
                  onChange={() => setQualPricingMode("byUnder")}
                  disabled={!canEdit || !initialData.underAgeSystemEnabled}
                />
                アンダー区分別
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {qualPricingMode === "byUnder"
                ? "大会でアンダー制を有効にし、U/OPEN を保存してから設定してください。区分キーは料金（アンダー区分別）と一致します。"
                : "年齢は大会の「年齢・所属クラブ」で設定した範囲（開催日時点の満年齢）に合わせて帯を分けてください。帯が重なると保存できません。"}
            </p>
            {certifiedLifesaverUpperQualifications.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                「{ENTRY_REQUIRED_CERTIFIED_LIFESAVER}」を選択すると、上位資格（
                {certifiedLifesaverUpperQualifications.join(" / ")}）が一括で選択されます。
              </p>
            ) : null}

            {qualPricingMode === "flat" ? (
              <div className="space-y-2">
                {requiredQualifications.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {requiredQualifications.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {allowedQualificationOptions.map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={requiredQualifications.includes(option)}
                        onChange={() => toggleQualification(option)}
                        disabled={!canEdit}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : qualPricingMode === "byUnder" && underPartitionForEditors ? (
              <div className="space-y-3">
                {expectedUnderFeeTierKeys(underPartitionForEditors).map((k) => (
                  <div
                    key={k}
                    className="space-y-2 rounded-lg border border-border/80 bg-muted/15 p-3"
                  >
                    <p className="text-sm font-medium leading-tight">{k}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allowedQualificationOptions.map((option) => (
                        <label
                          key={`${k}-${option}`}
                          className="flex items-center gap-2 rounded-md border border-gray-200 bg-background px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={(underQualDraft[k] ?? []).includes(option)}
                            onChange={() => toggleQualInUnderTier(k, option)}
                            disabled={!canEdit}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {ageQualFormRows.map((row) => (
                  <div
                    key={row.id}
                    className="space-y-2 rounded-lg border border-border/80 bg-muted/15 p-3"
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">下限（歳）</Label>
                        <Input
                          numericInput="integer"
                          min={0}
                          className="h-8 w-20 text-xs"
                          value={row.minAge}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAgeQualFormRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, minAge: v } : r))
                            );
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">上限（空=なし）</Label>
                        <Input
                          numericInput="integer"
                          min={0}
                          className="h-8 w-20 text-xs"
                          value={row.maxAge}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAgeQualFormRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, maxAge: v } : r))
                            );
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                      {canEdit && ageQualFormRows.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive"
                          onClick={() =>
                            setAgeQualFormRows((prev) => prev.filter((r) => r.id !== row.id))
                          }
                        >
                          削除
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allowedQualificationOptions.map((option) => (
                        <label
                          key={`${row.id}-${option}`}
                          className="flex items-center gap-2 rounded-md border border-gray-200 bg-background px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={row.qualifications.includes(option)}
                            onChange={() => toggleQualInTier(row.id, option)}
                            disabled={!canEdit}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      setAgeQualFormRows((prev) => [
                        ...prev,
                        {
                          id: mkTierRowId(),
                          minAge: "0",
                          maxAge: "",
                          qualifications: [],
                        },
                      ])
                    }
                  >
                    年齢帯を追加
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleUpdateQualifications}
                disabled={isUpdatingQualifications}
                className="w-full md:w-auto"
              >
                {isUpdatingQualifications ? "更新中..." : "必要資格を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
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
          <CardTitle className="text-base font-semibold">アンダー制度設定</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            ここで大会全体の帯（U-○・OPEN）を定義します。下のタブでは、その帯のうちどれをそのタブでエントリー可能にするかを選びます。年度年齢は4月2日始まりの年度・翌年4月1日時点の満年齢です。
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
            <span>この大会でアンダー制を使う</span>
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
            <div className="flex justify-end pt-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs md:w-auto"
                onClick={() => void handleSaveUnderAgeSettings()}
                disabled={isUpdatingUnderAgeSettings}
              >
                {isUpdatingUnderAgeSettings ? "保存中…" : "アンダー制度を保存"}
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
            const d = catDrafts[c.id];
            const tabTitle = d ? (d.name.trim() ? d.name.trim() : c.name) : c.name;
            const tabRangeSubtitle = d
              ? formatCatDraftRangeSubtitle(d.from, d.to)
              : formatAgeCategoryRangeSubtitle(c);
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
            if (uncategorizedEvents.length === 0) return null;
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
          <Button
            type="button"
            size="sm"
            variant={eventScopeTabId === "__MANAGE__" ? "default" : "outline"}
            className="h-auto min-h-10 px-2.5 py-1.5 text-left"
            onClick={() => setEventScopeTabId("__MANAGE__")}
          >
            <span className="text-xs font-semibold leading-tight">カテゴリ管理</span>
            <span className="block text-[10px] font-normal opacity-80">追加・編集</span>
          </Button>
        </div>
      </div>

      {eventScopeTabId !== "__MANAGE__" ? (
      <Card className={cn(categoryMeta.toneClass, "overflow-hidden")}>
        <CardHeader className="space-y-1.5 border-b border-border/60 bg-background/40 px-3 py-3 sm:px-4">
          <CardTitle className="text-base font-semibold">{categoryMeta.title}</CardTitle>
          <CardDescription className="text-xs leading-snug">{categoryMeta.shortHint}</CardDescription>
          <p className="text-[11px] text-muted-foreground">
            種目のカテゴリ（プール／オーシャン）は大会の基本情報で
            {competitionEventCategoryScopeLabel(categoryScope)}に固定されています。
          </p>
          <details className="rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground outline-none">
              もう少し詳しく
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-0.5 pt-1 leading-relaxed">
              <li>最大レーン: 1レースあたりのレーン数で、全ラウンド共通（1〜32、空欄は未設定）</li>
              <li>ラウンド数: スタートリストのタブ数（初回レースを含む全ラウンド・1〜32）</li>
              <li>
                種目ごとの参加可能な生年月日: 大会全体の年齢に加え、種目ごとに「この日〜この日に生まれた人」（両端含む）を指定できます。空欄は大会の年齢設定に従います。
              </li>
              <li>
                上の年齢カテゴリを切り替えると、そのカテゴリに属する種目だけが表示されます。同名種目もカテゴリが違えば別種目です。
              </li>
            </ul>
          </details>
        </CardHeader>
        <CardContent className="space-y-4 px-3 py-3 sm:px-4">
          <div
            className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground"
            role="note"
          >
            <p className="mb-1.5 font-semibold text-foreground">操作の流れ</p>
            <ol className="list-decimal space-y-1 pl-4 marker:text-muted-foreground">
              <li>
                <span className="text-foreground">種目を追加</span>
                … 下の入力＋「＋」、または「＋デフォルト」
              </li>
              <li>
                <span className="text-foreground">種目名変更・削除</span>
                … カード上の入力／ゴミ箱で下書きし、「<span className="text-foreground">このタブを保存</span>」で確定します
              </li>
              <li>
                <span className="text-foreground">性別区分</span>（男女／男のみ／女のみ／混合）
                … 変更は下の「<span className="text-foreground">このタブを保存</span>」まで保留されます
              </li>
              <li>
                <span className="text-foreground">年齢カテゴリ</span>
                … 「カテゴリ管理」で名前と生年月日範囲を追加し、各カテゴリのタブで種目を追加します
              </li>
              <li>
                <span className="text-foreground">年齢・最大レーン・ラウンド数・種目ごとのアンダー設定</span>
                … 一番下の「<span className="text-foreground">このタブを保存</span>」でまとめてサーバーに反映します（未保存のままでは反映されません）
              </li>
              <li>
                <span className="text-foreground">参加費</span>
                … 下の「エントリー費用」で、登録した種目の区分に応じて個人・チームの料金を設定します
              </li>
            </ol>
          </div>
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
                        disabled={eventScopeTabId === "__MANAGE__" || isAddingDefaultEvents === "POOL-INDIVIDUAL"}
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
                        eventScopeTabId === "__MANAGE__" ||
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
                          .map((e) => [e.name, e])
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
                        disabled={eventScopeTabId === "__MANAGE__" || isAddingDefaultEvents === "POOL-TEAM"}
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
                        eventScopeTabId === "__MANAGE__" ||
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
                          .map((e) => [e.name, e])
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
                        disabled={eventScopeTabId === "__MANAGE__" || isAddingDefaultEvents === "OCEAN-INDIVIDUAL"}
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
                        eventScopeTabId === "__MANAGE__" ||
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
                          .map((e) => [e.name, e])
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
                        disabled={eventScopeTabId === "__MANAGE__" || isAddingDefaultEvents === "OCEAN-TEAM"}
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
                        eventScopeTabId === "__MANAGE__" ||
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
                          .map((e) => [e.name, e])
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
                … プール／オーシャン・個人／チームの種目表（年齢・最大レーン・ラウンド・チームポジション）をまとめて書き込みます。
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
                {initialData.underAgeSystemEnabled ? (
                  <>
                    {" "}
                    アンダー制が有効なとき、種目ごとのオンオフ・帯の変更もここに含まれます（カード上では確定まで保留されます）。
                  </>
                ) : null}
                {initialData.underAgeSystemEnabled && hasPendingEventUnderAgeChanges ? (
                  <span className="mt-1 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                    未保存: 種目ごとのアンダー設定
                  </span>
                ) : null}
              </p>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {hasPendingEventNameChanges ||
                hasPendingEventDeleteChanges ||
                hasPendingEventSexOptionChanges ||
                hasPendingEventUnderAgeChanges ? (
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
                      setEventUnderAgeEligibilityDrafts({});
                      setEventUnderBandSelectionDrafts({});
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
                  disabled={eventScopeTabId === "__MANAGE__" || bulkSavingAllEventTables}
                >
                  {bulkSavingAllEventTables ? "保存中…" : "このタブを保存"}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : (
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="space-y-1 border-b border-border bg-muted/15 px-3 py-3 sm:px-4">
              <CardTitle className="text-base font-semibold">年齢カテゴリ</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                タブの表示名・生年月日範囲に加え、アンダー制が有効なときは「このタブでエントリー可能な帯」を選びます。各カテゴリのタブで追加した種目はこのカテゴリに紐づき、種目ごとに帯を上書きすることもできます。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-3 py-3 sm:px-4">
              {ageCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  まだカテゴリがありません。下のフォームから追加できます。
                </p>
              ) : (
                <ul className="space-y-3" role="list">
                  {ageCategories.map((c) => {
                    const d = catDrafts[c.id] ?? {
                      name: c.name,
                      from: toEligibleBirthDateInput(c.eligibleBirthDateFrom),
                      to: toEligibleBirthDateInput(c.eligibleBirthDateTo),
                    };
                    const busy = ageCatBusy === c.id;
                    return (
                      <li
                        key={c.id}
                        className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-3 dark:bg-muted/5"
                      >
                        <div className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-end">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">カテゴリ名</Label>
                            <Input
                              value={d.name}
                              disabled={!canEdit || busy}
                              onChange={(e) =>
                                setCatDrafts((prev) => ({
                                  ...prev,
                                  [c.id]: { ...d, name: e.target.value },
                                }))
                              }
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              disabled={!canEdit || busy}
                              onClick={() => void handleSaveAgeCategoryRow(c.id)}
                            >
                              {busy ? (
                                <>
                                  <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                                  保存中
                                </>
                              ) : (
                                "保存"
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-destructive hover:text-destructive"
                              disabled={!canEdit || busy}
                              onClick={() => void handleDeleteAgeCategory(c.id, c.name)}
                            >
                              削除
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">生年月日（開始）</Label>
                            <Input
                              type="date"
                              value={d.from}
                              disabled={!canEdit || busy}
                              onChange={(e) =>
                                setCatDrafts((prev) => ({
                                  ...prev,
                                  [c.id]: { ...d, from: e.target.value },
                                }))
                              }
                              className="h-8 w-[9.5rem] px-1.5 text-xs"
                            />
                          </div>
                          <span className="pb-2 text-xs text-muted-foreground">〜</span>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">生年月日（終了）</Label>
                            <Input
                              type="date"
                              value={d.to}
                              disabled={!canEdit || busy}
                              onChange={(e) =>
                                setCatDrafts((prev) => ({
                                  ...prev,
                                  [c.id]: { ...d, to: e.target.value },
                                }))
                              }
                              className="h-8 w-[9.5rem] px-1.5 text-xs"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          両方空欄は生年月日による制限なし。範囲は両端を含みます。
                        </p>
                        {initialData.underAgeSystemEnabled && masterBandKeys.length > 0 ? (
                          <div className="space-y-1.5 rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
                            <p className="text-[10px] font-medium text-muted-foreground">
                              このタブでエントリー可能な帯
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                              {masterBandKeys.map((key) => {
                                const sel = categoryUnderBandDrafts[c.id] ?? masterBandKeys;
                                const checked = sel.includes(key);
                                return (
                                  <label
                                    key={key}
                                    className="flex cursor-pointer items-center gap-1.5 text-[11px]"
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5"
                                      checked={checked}
                                      disabled={!canEdit || busy}
                                      onChange={(e) => {
                                        const nextChecked = e.target.checked;
                                        setCategoryUnderBandDrafts((prev) => {
                                          const cur = new Set(prev[c.id] ?? masterBandKeys);
                                          if (nextChecked) cur.add(key);
                                          else cur.delete(key);
                                          return {
                                            ...prev,
                                            [c.id]: masterBandKeys.filter((k) => cur.has(k)),
                                          };
                                        });
                                      }}
                                    />
                                    <span>{key}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              すべてオンで保存すると、マスタの全帯を許可（制限なし）として保存されます。
                            </p>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canEdit ? (
                <div className="space-y-3 rounded-lg border border-dashed border-primary/25 bg-primary/[0.04] p-3 dark:bg-primary/[0.07]">
                  <p className="text-xs font-semibold text-foreground">新規カテゴリ</p>
                  <div className="space-y-1">
                    <Label htmlFor="new-age-cat-name" className="text-[10px] text-muted-foreground">
                      名前
                    </Label>
                    <Input
                      id="new-age-cat-name"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="例: ジュニア"
                      disabled={ageCatBusy === "__new__"}
                      className="h-9 max-w-md text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">開始（任意）</Label>
                      <Input
                        type="date"
                        value={newCatFrom}
                        onChange={(e) => setNewCatFrom(e.target.value)}
                        disabled={ageCatBusy === "__new__"}
                        className="h-8 w-[9.5rem] px-1.5 text-xs"
                      />
                    </div>
                    <span className="pb-2 text-xs text-muted-foreground">〜</span>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">終了（任意）</Label>
                      <Input
                        type="date"
                        value={newCatTo}
                        onChange={(e) => setNewCatTo(e.target.value)}
                        disabled={ageCatBusy === "__new__"}
                        className="h-8 w-[9.5rem] px-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={ageCatBusy === "__new__"}
                    onClick={() => void handleAddAgeCategory()}
                  >
                    {ageCatBusy === "__new__" ? (
                      <>
                        <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                        追加中
                      </>
                    ) : (
                      <>
                        <Plus className="mr-1 inline h-3.5 w-3.5" />
                        カテゴリを追加
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
      )}

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
              <CardDescription className="text-xs leading-relaxed">
                個人種目・チーム種目を登録・保存したあと、該当する区分の料金を入力します。未登録の区分は入力できません。
              </CardDescription>
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

          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="h-3.5 w-3.5"
                checked={feePricingMode === "flat"}
                onChange={() => setFeePricingMode("flat")}
                disabled={!canEdit}
              />
              全員同一料金
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="h-3.5 w-3.5"
                checked={feePricingMode === "byAge"}
                onChange={() => setFeePricingMode("byAge")}
                disabled={!canEdit}
              />
              年齢帯別（満年齢）
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="h-3.5 w-3.5"
                checked={feePricingMode === "byAgeCategory"}
                onChange={() => {
                  setFeePricingMode("byAgeCategory");
                  setCategoryFeeDraft(
                    buildCategoryFeeDraft(
                      ageCategories,
                      parseAgeCategoryFeeTiers(initialData.entryFee as unknown)
                    )
                  );
                }}
                disabled={!canEdit || ageCategories.length === 0}
              />
              年齢カテゴリ別
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                className="h-3.5 w-3.5"
                checked={feePricingMode === "byUnderAge"}
                onChange={() => setFeePricingMode("byUnderAge")}
                disabled={!canEdit || !initialData.underAgeSystemEnabled}
              />
              アンダー区分別
            </label>
          </div>
          {feePricingMode === "byAge" ? (
            <p className="text-xs text-muted-foreground">
              年齢は大会開催日基準の満年齢です。大会に参加年齢の上下限がある場合、その範囲をすべての帯で覆う必要があります。
            </p>
          ) : feePricingMode === "byUnderAge" ? (
            <p className="text-xs text-muted-foreground">
              年度年齢に応じた U/OPEN の区分ごとに料金を設定します。先に「年齢・所属クラブ」でアンダー制と U を保存してください。全員同一料金のときはこの UI は使いません。
            </p>
          ) : feePricingMode === "byAgeCategory" ? (
            <p className="text-xs text-muted-foreground">
              「カテゴリ管理」で定義した区分ごとに料金を設定します。各カテゴリに生年月日の範囲が必要です。エントリー時は登録者の生年月日が属する区分の単価が使われます（複数に該当する場合は表示順が先の区分）。
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              すべての参加者に同じ単価を適用します。
            </p>
          )}
          {ageCategories.length === 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              年齢カテゴリ別の参加費を使うには、先に種目設定の「カテゴリ管理」で年齢カテゴリを作成してください。
            </p>
          ) : null}

          {feePricingMode === "byAge" ? (
            <div className="space-y-3">
              {ageFeeFormRows.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-lg border border-border/80 bg-muted/15 p-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <div className="space-y-1">
                    <Label className="text-[10px]">下限（歳）</Label>
                    <Input
                      numericInput="integer"
                      min={0}
                      className="h-8 text-xs"
                      value={row.minAge}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAgeFeeFormRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, minAge: v } : r))
                        );
                      }}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">上限（空=なし）</Label>
                    <Input
                      numericInput="integer"
                      min={0}
                      className="h-8 text-xs"
                      value={row.maxAge}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAgeFeeFormRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, maxAge: v } : r))
                        );
                      }}
                      disabled={!canEdit}
                    />
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
                          setAgeFeeFormRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, individual: v } : r))
                          );
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
                          setAgeFeeFormRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, team: v } : r))
                          );
                        }}
                        disabled={!canEdit}
                      />
                    </div>
                  ) : null}
                  {canEdit && ageFeeFormRows.length > 1 ? (
                    <div className="flex items-end sm:col-span-2 lg:col-span-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive"
                        onClick={() =>
                          setAgeFeeFormRows((prev) => prev.filter((r) => r.id !== row.id))
                        }
                      >
                        この帯を削除
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() =>
                    setAgeFeeFormRows((prev) => [
                      ...prev,
                      {
                        id: mkTierRowId(),
                        minAge: "0",
                        maxAge: "",
                        individual: hasIndividualEvents ? "0" : "0",
                        team: hasTeamEvents ? "0" : "0",
                      },
                    ])
                  }
                >
                  年齢帯を追加
                </Button>
              ) : null}
            </div>
          ) : feePricingMode === "byUnderAge" && underPartitionForEditors ? (
            <div className="space-y-3">
              {expectedUnderFeeTierKeys(underPartitionForEditors).map((k) => {
                const row = underFeeDraft[k] ?? { individual: "0", team: "0" };
                return (
                  <div
                    key={k}
                    className="grid gap-2 rounded-lg border border-border/80 bg-muted/15 p-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                      <Label className="text-[10px] text-muted-foreground">区分</Label>
                      <p className="text-sm font-medium leading-tight">{k}</p>
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
                            setUnderFeeDraft((prev) => ({
                              ...prev,
                              [k]: { ...(prev[k] ?? row), individual: v },
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
                            setUnderFeeDraft((prev) => ({
                              ...prev,
                              [k]: { ...(prev[k] ?? row), team: v },
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
          ) : feePricingMode === "byAgeCategory" ? (
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
              チーム種目: 1種目1チームごとにクラブへ課金（年齢帯別は登録者の満年齢、年齢カテゴリ別は生年月日が属する区分、アンダー区分別は年度年齢の区分の単価）
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
