"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Hash,
  ListChecks,
  Lock,
  MessageSquare,
  Pencil,
  ScrollText,
  Send,
  Wallet,
} from "lucide-react";
import { calculateCompetitionEntryFee } from "@/lib/entryFee";
import { stripeProcessingFeeSurchargeYenFromBps } from "@/lib/stripeProcessingFee";
import { isTieredEntryFee, resolveEntryFeeUnits } from "@/lib/competitionEntryAgeTiered";
import { partitionUnderAgeBands } from "@/lib/competitionUnderAgeSystem";
import type { EntryReceiptForClient } from "@/lib/entryCompletionReceipt";
import EntryDetailsSummary from "@/components/EntryDetailsSummary";
import { EntryPaymentConfirmPoller } from "@/components/competitions/EntryPaymentConfirmPoller";
import EntryWithdrawRequestButton from "@/components/EntryWithdrawRequestButton";
import type { ExplanationDensity } from "@/lib/explanation";
import { fieldHintClass, sectionLeadClass } from "@/lib/explanation";
import { userFacingApiErrorMessage } from "@/lib/userFacingApiError";
import { cn } from "@/lib/utils";
import SimpleMarkdown from "@/components/SimpleMarkdown";

const sexLabel = (sex: "MALE" | "FEMALE" | "OTHER") => {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "混合";
};
const typeLabel = (type: "INDIVIDUAL" | "TEAM") =>
  type === "INDIVIDUAL" ? "個人" : "チーム";

const formatCurrency = (value: number) => new Intl.NumberFormat("ja-JP").format(value);

function FormSection({
  sectionId,
  icon: Icon,
  title,
  titleSuffix,
  description,
  leadDensity = "balanced",
  children,
}: {
  sectionId: string;
  icon: LucideIcon;
  title: string;
  /** 見出し横のバッジ等 */
  titleSuffix?: ReactNode;
  description?: ReactNode;
  /** 種目制限・必須クラブなど判断を要するほど guided */
  leadDensity?: ExplanationDensity;
  children: React.ReactNode;
}) {
  const headingId = `${sectionId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-muted/25 px-4 py-3 sm:px-4 sm:py-3.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2
            id={headingId}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold tracking-tight text-foreground"
          >
            <span>{title}</span>
            {titleSuffix}
          </h2>
          {description ? <div className={sectionLeadClass(leadDensity)}>{description}</div> : null}
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">{children}</div>
    </section>
  );
}

type Event = {
  id: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  type: "INDIVIDUAL" | "TEAM";
  category: "POOL" | "OCEAN";
  requiresEntryTime: boolean;
  displayOrder: number;
};

type EntryFee = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
};

type Membership = {
  id: string;
  club: {
    id: string;
    name: string;
  };
};

type CompetitionEntryFormProps = {
  competitionId: string;
  events: Event[];
  memberships: Membership[];
  entryWindowOpen: boolean;
  entryFee: EntryFee | number | null;
  /** 大会設定の参加費（サイドバー表示用。サーバーで組み立てた表示を渡す） */
  entryFeeSummary?: ReactNode;
  allowMultipleEventEntries: boolean;
  maxEventEntriesPerPerson: number | null;
  requireClubMembership: boolean;
  isEligible: boolean;
  /** 有料かつ決済未完了のとき、種目・クラブ・連絡事項を変更不可（主催管理者は除く） */
  lockEntryContentUntilPaid?: boolean;
  /** Stripe 上は支払済みだが DB 未反映のとき `confirming` */
  entryPaymentPhase?: "awaiting_payment" | "confirming" | null;
  /** エントリー成立〜入金確認までの受付票（旧完了ページの内容） */
  entryReceipt?: EntryReceiptForClient | null;
  entryCancelled?: boolean;
  /** 決済完了などビジネス上のエントリー成立 */
  entryEstablished?: boolean;
  entryIdForActions?: string | null;
  canRequestWithdraw?: boolean;
  /** 棄権申請が付いた種目数（表示用） */
  entryWithdrawAppliedCount?: number;
  initialEntry?: {
    clubId?: string | null;
    notes?: string | null;
    items?: { eventId: string; entryTime?: string | null }[];
    teamEntries?: { eventId: string; teamName?: string | null }[];
    paymentStatus?: "PAID" | "UNPAID";
  } | null;
  /** 設定されているときのみフォーム末尾に誓約を表示 */
  entryPledge?: { markdown: string; initialAccepted: boolean } | null;
  /** 大会開催日基準の満年齢。年齢帯別参加費の概算に使用 */
  userAgeYearsAtCompetitionStart?: number | null;
  /** 年齢カテゴリ別参加費の解決用（ISO 文字列） */
  userDateOfBirthISO?: string | null;
  /** 大会の年齢カテゴリ（参加費解決用） */
  feeAgeCategories?: Array<{
    id: string;
    name: string;
    displayOrder: number;
    eligibleBirthDateFrom: string | null;
    eligibleBirthDateTo: string | null;
  }>;
  /** アンダー別参加費の解決用（大会でアンダー制が有効なとき） */
  underAgeFeeBands?: { uThresholds: number[]; openEnabled: boolean } | null;
  /** カード決済の上乗せ率（basis points）。サーバーの STRIPE_PROCESSING_FEE_BPS と一致 */
  cardProcessingFeeBps?: number;
  /** true のとき個人種目のみ表示し、POST から teamEntries を送らない（チームはクラブのチームハブ） */
  individualEntryOnly?: boolean;
  /** individualEntryOnly 時、既存エントリーのチーム件数（種目数上限の計算に使用） */
  reservedTeamSlotsForEntryLimit?: number;
};

export default function CompetitionEntryForm({
  competitionId,
  events,
  memberships,
  entryWindowOpen,
  entryFee,
  entryFeeSummary,
  allowMultipleEventEntries,
  maxEventEntriesPerPerson,
  requireClubMembership,
  isEligible,
  lockEntryContentUntilPaid = false,
  entryPaymentPhase = null,
  entryReceipt = null,
  entryCancelled = false,
  entryEstablished = false,
  entryIdForActions = null,
  canRequestWithdraw = false,
  entryWithdrawAppliedCount = 0,
  initialEntry,
  entryPledge = null,
  userAgeYearsAtCompetitionStart = null,
  userDateOfBirthISO = null,
  feeAgeCategories,
  underAgeFeeBands = null,
  cardProcessingFeeBps = 360,
  individualEntryOnly = false,
  reservedTeamSlotsForEntryLimit = 0,
}: CompetitionEntryFormProps) {
  const router = useRouter();
  const [showEstablishedEdit, setShowEstablishedEdit] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    () =>
      new Set([
        ...(initialEntry?.items?.map((item) => item.eventId) ?? []),
        ...(individualEntryOnly
          ? []
          : (initialEntry?.teamEntries?.map((item) => item.eventId) ?? [])),
      ])
  );
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (initialEntry?.items ?? []).map((item) => [item.eventId, item.entryTime ?? ""])
      )
  );
  const [teamNames, setTeamNames] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (initialEntry?.teamEntries ?? []).map((item) => [item.eventId, item.teamName ?? ""])
      )
  );
  const [clubId, setClubId] = useState<string | null>(
    initialEntry?.clubId ?? (memberships.length === 1 ? memberships[0].club.id : null)
  );
  const [notes, setNotes] = useState(initialEntry?.notes ?? "");
  const [confirmed, setConfirmed] = useState(Boolean(initialEntry));
  const [pledgeAccepted, setPledgeAccepted] = useState(
    () => entryPledge?.initialAccepted ?? false
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const groupedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.displayOrder - b.displayOrder);
    return {
      POOL: sorted.filter((event) => event.category === "POOL"),
      OCEAN: sorted.filter((event) => event.category === "OCEAN"),
    };
  }, [events]);

  /** 長文のときだけスクロール補助を出す（見出しのノイズを減らす） */
  const pledgeBodyIsLong = useMemo(
    () => (entryPledge?.markdown.length ?? 0) > 360,
    [entryPledge?.markdown]
  );

  const selectedEvents = events.filter((event) => selectedEventIds.has(event.id));
  const selectedTeamEvents = selectedEvents.filter((event) => event.type === "TEAM");
  const selectedIndividualEvents = selectedEvents.filter((event) => event.type === "INDIVIDUAL");
  const selectedCount = selectedEvents.length;
  const reservedTeamSlots = individualEntryOnly ? reservedTeamSlotsForEntryLimit : 0;
  const totalEntrySlots = individualEntryOnly
    ? selectedIndividualEvents.length + reservedTeamSlots
    : selectedCount;

  const feeResolveAgeCategories = useMemo(() => {
    if (!feeAgeCategories?.length) return null;
    return feeAgeCategories.map((c) => ({
      id: c.id,
      displayOrder: c.displayOrder,
      eligibleBirthDateFrom: c.eligibleBirthDateFrom ? new Date(c.eligibleBirthDateFrom) : null,
      eligibleBirthDateTo: c.eligibleBirthDateTo ? new Date(c.eligibleBirthDateTo) : null,
    }));
  }, [feeAgeCategories]);

  const userDobForFee = useMemo(
    () => (userDateOfBirthISO ? new Date(userDateOfBirthISO) : null),
    [userDateOfBirthISO]
  );

  const underFeePartitionResolved = useMemo(() => {
    if (!underAgeFeeBands) return null;
    return partitionUnderAgeBands(underAgeFeeBands.uThresholds, underAgeFeeBands.openEnabled);
  }, [underAgeFeeBands]);

  const estimatedFee = useMemo(() => {
    const individualCount = selectedIndividualEvents.length;
    const teamCount = individualEntryOnly ? reservedTeamSlots : selectedTeamEvents.length;
    if (individualCount + teamCount === 0) return 0;
    const r = resolveEntryFeeUnits(entryFee, userAgeYearsAtCompetitionStart ?? null, {
      userDateOfBirth: userDobForFee,
      competitionAgeCategories: feeResolveAgeCategories,
      underFeePartition: underFeePartitionResolved,
    });
    if (r.ageTierMissing && isTieredEntryFee(entryFee)) {
      return null;
    }
    return calculateCompetitionEntryFee(
      entryFee,
      {
        individualCount,
        teamCount,
      },
      {
        userAgeYearsAtCompetitionStart: userAgeYearsAtCompetitionStart ?? null,
        userDateOfBirth: userDobForFee,
        competitionAgeCategories: feeResolveAgeCategories,
        underFeePartition: underFeePartitionResolved,
      }
    );
  }, [
    entryFee,
    feeResolveAgeCategories,
    selectedIndividualEvents.length,
    individualEntryOnly,
    reservedTeamSlots,
    selectedTeamEvents.length,
    underFeePartitionResolved,
    userAgeYearsAtCompetitionStart,
    userDobForFee,
  ]);

  const estimatedProcessingFeeYen = useMemo(() => {
    if (estimatedFee === null || estimatedFee <= 0) return 0;
    return stripeProcessingFeeSurchargeYenFromBps(estimatedFee, cardProcessingFeeBps);
  }, [estimatedFee, cardProcessingFeeBps]);
  const estimatedTotalChargedYen =
    estimatedFee !== null && estimatedFee > 0 ? estimatedFee + estimatedProcessingFeeYen : 0;
  const processingFeePercentLabel = (cardProcessingFeeBps / 100).toFixed(1);

  const effectiveMaxSelectable = !allowMultipleEventEntries
    ? 1
    : typeof maxEventEntriesPerPerson === "number" && maxEventEntriesPerPerson > 0
      ? maxEventEntriesPerPerson
      : null;
  /** 個人フォーム上で選べる個人種目の上限（既存チーム枠を max から差し引く） */
  const maxIndividualEventsOnForm =
    individualEntryOnly && effectiveMaxSelectable !== null
      ? Math.max(0, effectiveMaxSelectable - reservedTeamSlots)
      : effectiveMaxSelectable;

  /** メイン列のみに表示（サイドバーでは重複させない） */
  const entryLimitShort = !allowMultipleEventEntries
    ? "1種目のみ選択できます。"
    : maxIndividualEventsOnForm !== null
      ? `最大${maxIndividualEventsOnForm}種目まで選択できます${
          individualEntryOnly && reservedTeamSlots > 0
            ? `（チーム種目${reservedTeamSlots}件は別途クラブのチーム管理で登録済みの分としてカウント）`
            : ""
        }。`
      : "複数種目を選べます（上限なし）。";
  const isPaidEntry = initialEntry?.paymentStatus === "PAID";
  const fieldsLocked = lockEntryContentUntilPaid || entryCancelled;
  const needsClub = requireClubMembership;
  const clubMissing = needsClub && !clubId;
  const noMemberships = memberships.length === 0;

  const toggleEvent = (eventId: string) => {
    if (fieldsLocked) return;
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      const isSelected = next.has(eventId);
      if (isSelected) {
        next.delete(eventId);
        return next;
      }

      if (!allowMultipleEventEntries) {
        return new Set([eventId]);
      }

      next.add(eventId);
      const cap = maxIndividualEventsOnForm ?? effectiveMaxSelectable;
      if (cap !== null && next.size > cap) {
        toast.error(`この大会は${cap}種目まで選択可能です`);
        return prev;
      }
      return next;
    });
  };

  const isSubmitDisabled =
    isSubmitting ||
    !entryWindowOpen ||
    !isEligible ||
    (requireClubMembership && memberships.length === 0) ||
    entryPaymentPhase === "confirming" ||
    entryCancelled ||
    (Boolean(entryPledge) && !pledgeAccepted);

  const summaryEventMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sex?: string | null }>();
    for (const e of entryReceipt?.eventOptions ?? []) {
      m.set(e.id, { id: e.id, name: e.name, sex: e.sex });
    }
    return m;
  }, [entryReceipt?.eventOptions]);

  const pendingConfirmingView = Boolean(
    entryReceipt && !entryEstablished && !entryCancelled && entryPaymentPhase === "confirming"
  );

  /** 未決済（Stripe 未払い）: 受付票は出さず通常フォーム＋「決済へ」 */
  const unpaidAthleteShowsFormOnly = Boolean(
    entryReceipt &&
      !entryEstablished &&
      !entryCancelled &&
      entryPaymentPhase === "awaiting_payment"
  );

  /** 成立後の一覧表示（主催管理者も参加者と同じカード・ボタンに揃える） */
  const establishedSummaryOnly = Boolean(
    entryReceipt && entryEstablished && !entryCancelled && !showEstablishedEdit
  );

  const editingEstablishedEntry = Boolean(
    entryEstablished && showEstablishedEdit && !entryCancelled
  );

  const showReceiptPanel = Boolean(
    entryReceipt && !editingEstablishedEntry && !unpaidAthleteShowsFormOnly
  );

  /** 成立後は受付票のみ（変更申請で開く）。未決済の awaiting_payment ではフォーム＋決済へ。 */
  const showFullForm =
    !entryReceipt ||
    unpaidAthleteShowsFormOnly ||
    (entryEstablished && showEstablishedEdit && !entryCancelled);

  let entryCardTitle = "エントリー";
  if (entryCancelled) {
    entryCardTitle = "エントリー（取消済み）";
  } else if (pendingConfirmingView) {
    entryCardTitle = "入金確認中";
  } else if (establishedSummaryOnly) {
    entryCardTitle = "エントリー成立";
  } else if (editingEstablishedEntry) {
    entryCardTitle = "エントリー内容の変更";
  }

  const receiptInnerHeading = entryCancelled
    ? "取消済み"
    : pendingConfirmingView
      ? "受付表"
      : entryEstablished
        ? "受付内容"
        : "手続き完了";

  const receiptOnlyView = Boolean(
    entryReceipt && !unpaidAthleteShowsFormOnly && !editingEstablishedEntry
  );

  const entryCardDescription = entryCancelled
    ? "このエントリーは取消済みです。"
    : receiptOnlyView
      ? pendingConfirmingView
        ? "決済のシステム反映をお待ちください。"
        : establishedSummaryOnly
          ? "受付内容の確認・変更申請はこちらから行えます。"
          : "手続き状況と受付内容を確認できます。"
      : editingEstablishedEntry
        ? "内容を修正したあと「更新」で保存してください。"
        : "種目を選び、必要な情報を入力して手続きを完了してください。";

  const hasAnyEventsToShow =
    groupedEvents.POOL.length > 0 || groupedEvents.OCEAN.length > 0;

  const handleSubmit = async () => {
    if (entryCancelled) {
      toast.error("このエントリーは取消済みのため送信できません");
      return;
    }
    if (totalEntrySlots === 0) {
      toast.error("種目を1つ以上選択してください");
      return;
    }

    if (!allowMultipleEventEntries && totalEntrySlots > 1) {
      toast.error("この大会は1種目のみ選択可能です");
      return;
    }

    if (effectiveMaxSelectable !== null && totalEntrySlots > effectiveMaxSelectable) {
      toast.error(`この大会は${effectiveMaxSelectable}種目まで選択可能です`);
      return;
    }

    if (!requireClubMembership && selectedTeamEvents.length > 0) {
      toast.error("チーム種目は所属クラブ必須のため選択できません");
      return;
    }

    if (!confirmed) {
      toast.error("参加者確認にチェックを入れてください");
      return;
    }

    if (entryPledge && !pledgeAccepted) {
      toast.error("誓約に同意してください");
      return;
    }

    if (requireClubMembership && !clubId) {
      toast.error("所属クラブを選択してください");
      return;
    }

    for (const event of selectedEvents) {
      if (event.requiresEntryTime && event.type === "INDIVIDUAL") {
        if (!entryTimes[event.id] || entryTimes[event.id].trim().length === 0) {
          toast.error(`「${event.name}（${sexLabel(event.sex)}）」のタイムを入力してください`);
          return;
        }
      }

      if (event.type === "TEAM") {
        if (!teamNames[event.id] || teamNames[event.id].trim().length === 0) {
          toast.error(`「${event.name}（${sexLabel(event.sex)}）」のチーム名を入力してください`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clubId,
          notes: notes.trim() || null,
          confirmed,
          ...(entryPledge ? { pledgeAccepted } : {}),
          items: selectedEvents
            .filter((event) => event.type === "INDIVIDUAL")
            .map((event) => ({
              eventId: event.id,
              entryTime: entryTimes[event.id]?.trim() || null,
            })),
          ...(individualEntryOnly
            ? {}
            : {
                teamEntries: selectedEvents
                  .filter((event) => event.type === "TEAM")
                  .map((event) => ({
                    eventId: event.id,
                    teamName: teamNames[event.id]?.trim() || "",
                  })),
              }),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          userFacingApiErrorMessage(result, "エントリーの送信に失敗しました")
        );
      }

      if (result.pendingWebhookSync) {
        toast.message(
          typeof result.message === "string"
            ? result.message
            : "決済は完了しています。反映までお待ちください。"
        );
        router.refresh();
        return;
      }

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl as string;
        return;
      }

      if (result.completeUrl) {
        router.push(result.completeUrl as string);
        return;
      }

      toast.success("エントリーを送信しました");
      router.refresh();
    } catch (error) {
      console.error("Entry submit error:", error);
      toast.error(error instanceof Error ? error.message : "エントリーの送信に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderEventList = (label: string, list: Event[]) => {
    if (list.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          {label}は未登録です。
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {list.map((event) => {
          const isSelected = selectedEventIds.has(event.id);
          const isTeamRestricted = !requireClubMembership && event.type === "TEAM";
          return (
            <div
              key={event.id}
              className={cn(
                "rounded-xl border bg-card p-3 shadow-sm transition-[border-color,box-shadow] sm:p-3.5",
                "focus-within:ring-2 focus-within:ring-primary/15 focus-within:ring-offset-2 focus-within:ring-offset-background",
                isSelected
                  ? "border-primary/45 ring-1 ring-primary/15"
                  : "border-border hover:border-primary/30",
                (isTeamRestricted || fieldsLocked) && "hover:border-border focus-within:ring-0"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <label
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-3",
                    isTeamRestricted || fieldsLocked
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
                    checked={isSelected}
                    onChange={() => toggleEvent(event.id)}
                    disabled={isTeamRestricted || fieldsLocked}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-foreground">
                      {event.name}
                      <span className="font-normal text-muted-foreground">（{sexLabel(event.sex)}）</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="font-normal">
                        {typeLabel(event.type)}
                      </Badge>
                      {isTeamRestricted ? (
                        <Badge variant="destructive" className="font-normal">
                          クラブ必須
                        </Badge>
                      ) : null}
                      {event.requiresEntryTime ? (
                        <Badge variant="outline" className="font-normal">
                          タイム必須
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </label>
              </div>

              {isSelected && event.type === "INDIVIDUAL" && event.requiresEntryTime && (
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Label htmlFor={`entry-time-${event.id}`} className="text-xs font-medium">
                    登録タイム
                  </Label>
                  <Input
                    id={`entry-time-${event.id}`}
                    value={entryTimes[event.id] || ""}
                    onChange={(e) =>
                      setEntryTimes((prev) => ({
                        ...prev,
                        [event.id]: e.target.value,
                      }))
                    }
                    placeholder="例: 2:05.32"
                    className="mt-2 h-9 text-sm"
                    disabled={fieldsLocked}
                  />
                </div>
              )}

              {isSelected && event.type === "TEAM" && (
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Label htmlFor={`team-name-${event.id}`} className="text-xs font-medium">
                    チーム名
                  </Label>
                  <Input
                    id={`team-name-${event.id}`}
                    value={teamNames[event.id] || ""}
                    onChange={(e) =>
                      setTeamNames((prev) => ({
                        ...prev,
                        [event.id]: e.target.value,
                      }))
                    }
                    placeholder="チーム名を入力"
                    className="mt-2 h-9 text-sm"
                    disabled={fieldsLocked}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card padding="none" className="border-border/80 shadow-sm">
      <CardHeader className="space-y-1 border-b border-border/60 bg-gradient-to-b from-muted/25 to-transparent px-4 py-3 sm:px-5 sm:py-4">
        <CardTitle className="text-base font-semibold sm:text-lg">{entryCardTitle}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{entryCardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-4 py-4 sm:space-y-6 sm:px-5 sm:py-5">
        {showFullForm && !entryWindowOpen ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2.5 text-xs text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
            受付期間外のため送信できません。
          </div>
        ) : null}

        {editingEstablishedEntry ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm">
                <Pencil className="h-4 w-4" aria-hidden />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                内容を修正し、問題なければ「更新」から保存してください。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 text-xs sm:self-center"
              onClick={() => setShowEstablishedEdit(false)}
            >
              一覧表示に戻る
            </Button>
          </div>
        ) : null}

        {showReceiptPanel && entryReceipt ? (
          <div className="space-y-5 rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {receiptInnerHeading}
                </p>
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
                  {entryReceipt.blurb}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm shadow-sm">
                {entryReceipt.statusRow.icon === "check" ? (
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 shrink-0",
                      entryReceipt.statusRow.tone === "emerald" && "text-emerald-600",
                      entryReceipt.statusRow.tone === "gray" && "text-gray-500",
                      entryReceipt.statusRow.tone === "muted" && "text-gray-500 dark:text-gray-400"
                    )}
                  />
                ) : (
                  <Clock
                    className={cn(
                      "h-4 w-4 shrink-0",
                      entryReceipt.statusRow.tone === "muted" && "text-gray-500 dark:text-gray-400"
                    )}
                  />
                )}
                <span className="font-semibold text-foreground">{entryReceipt.statusRow.label}</span>
              </div>
            </div>
            {entryPaymentPhase === "confirming" && entryReceipt.showPaymentPendingBlock ? (
              <div className="rounded-lg border border-orange-200/80 bg-orange-50/90 px-3 py-2.5 text-xs leading-relaxed text-orange-950 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-100">
                Stripe ではお支払いが完了しています。システムへの反映（Webhook）まで数秒〜1分かかることがあります。
                <span className="font-semibold"> この間はエントリー内容の変更と、追加の決済はできません。</span>
              </div>
            ) : null}
            {entryPaymentPhase === "awaiting_payment" && entryReceipt.showPaymentPendingBlock ? (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100">
                下の「決済へ進む」からお支払いください。決済がシステムに反映されるまで、種目・クラブ・連絡事項は変更できません。
              </div>
            ) : null}
            {entryReceipt.showPaymentPendingBlock ? (
              <div className="space-y-3">
                {entryPaymentPhase !== "confirming" ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    決済が完了するとエントリーが正式に成立します。Stripe からの通知（Webhook）で数秒〜1分程度で反映されます。
                  </p>
                ) : null}
                <EntryPaymentConfirmPoller active={entryReceipt.pollerActive} />
              </div>
            ) : null}
            <dl className="grid gap-3 rounded-lg border border-border/60 bg-background/60 p-3 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">エントリーID</dt>
                  <dd className="mt-0.5 font-mono text-xs text-foreground">{entryReceipt.entryId}</dd>
                </div>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">参加費（大会設定）</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                      ¥{entryReceipt.totalFee.toLocaleString()}
                    </dd>
                  </div>
                  {entryReceipt.cardPaymentBreakdown &&
                  entryReceipt.cardPaymentBreakdown.processingFeeYen > 0 ? (
                    <>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">
                          決済手数料（カード等・
                          {(
                            (entryReceipt.cardProcessingFeeBps ?? cardProcessingFeeBps) /
                            100
                          ).toFixed(1)}
                          %・お支払い者負担）
                        </dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                          ¥{entryReceipt.cardPaymentBreakdown.processingFeeYen.toLocaleString()}
                        </dd>
                      </div>
                      <div className="border-t border-border/50 pt-2">
                        <dt className="text-xs font-medium text-muted-foreground">カード決済の合計</dt>
                        <dd className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                          ¥{entryReceipt.cardPaymentBreakdown.totalChargedYen.toLocaleString()}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              {entryReceipt.requireClubMembership ? (
                <div className="flex gap-2 sm:col-span-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">所属クラブ</dt>
                    <dd className="mt-0.5 text-foreground">{entryReceipt.clubName ?? "未選択"}</dd>
                  </div>
                </div>
              ) : null}
            </dl>
            <EntryDetailsSummary
              individualItems={entryReceipt.individualItems}
              teamItems={entryReceipt.teamItems}
              eventMap={summaryEventMap}
              notes={entryReceipt.notes}
            />
            {entryWithdrawAppliedCount > 0 && entryEstablished && !showEstablishedEdit ? (
              <p className="text-xs text-muted-foreground">
                棄権申請済みの種目: <span className="font-medium text-foreground">{entryWithdrawAppliedCount}</span>
              </p>
            ) : null}
            <div className="flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:flex-wrap">
              {entryCancelled ? (
                <>
                  <Button variant="default" className="h-10 w-full text-sm sm:h-9 sm:w-auto" asChild>
                    <Link href={appRoutes.me.entries()}>エントリー履歴を見る</Link>
                  </Button>
                  <Button variant="outline" className="h-10 w-full gap-2 text-sm sm:h-9 sm:w-auto" asChild>
                    <Link href={appRoutes.competitions.root(competitionId)}>
                      <ArrowLeft className="h-4 w-4" />
                      大会ページへ戻る
                    </Link>
                  </Button>
                </>
              ) : establishedSummaryOnly ? (
                <>
                  {entryIdForActions && entryReceipt && entryReceipt.totalFee > 0 ? (
                    <Button variant="outline" className="h-10 w-full gap-2 text-sm sm:h-9 sm:w-auto" asChild>
                      <a
                        href={
                          entryReceipt.stripeReceiptUrl ??
                          `/api/entries/${entryIdForActions}/receipt?format=stripe`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                        領収書（Stripe）
                      </a>
                    </Button>
                  ) : null}
                  {entryIdForActions ? (
                    <Button variant="outline" className="h-10 w-full gap-2 text-sm sm:h-9 sm:w-auto" asChild>
                      <a
                        href={`/api/entries/${entryIdForActions}/receipt?format=pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="h-4 w-4 shrink-0" aria-hidden />
                        {entryReceipt && entryReceipt.totalFee > 0
                          ? "領収書（主催者名義・PDF）"
                          : "領収書（PDF）"}
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="default"
                    className="h-10 w-full text-sm sm:h-9 sm:w-auto"
                    disabled={!entryWindowOpen}
                    title={!entryWindowOpen ? "受付期間外のため変更できません" : undefined}
                    onClick={() => setShowEstablishedEdit(true)}
                  >
                    変更申請
                  </Button>
                  {canRequestWithdraw && entryIdForActions ? (
                    <EntryWithdrawRequestButton
                      competitionId={competitionId}
                      entryId={entryIdForActions}
                      className="h-10 w-full text-sm sm:h-9 sm:w-auto"
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <Button variant="default" className="h-10 w-full text-sm sm:h-9 sm:w-auto" asChild>
                    <Link href={appRoutes.me.entries()}>エントリー履歴を見る</Link>
                  </Button>
                  <Button variant="outline" className="h-10 w-full gap-2 text-sm sm:h-9 sm:w-auto" asChild>
                    <Link href={appRoutes.competitions.root(competitionId)}>
                      <ArrowLeft className="h-4 w-4" />
                      大会ページへ戻る
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}

        {showFullForm ? (
          <>
            {unpaidAthleteShowsFormOnly ? (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 dark:border-amber-900/45 dark:bg-amber-950/35">
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">決済が未完了です</p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/85">
                  フォーム下部の「決済へ進む」からお支払いください。決済がシステムに反映されるまで、種目・クラブ・連絡事項は変更できません。
                </p>
              </div>
            ) : null}
            {!isEligible ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                資格不足のため送信できません（ページ上部のエントリー資格を確認してください）。
              </div>
            ) : null}

            {editingEstablishedEntry && individualEntryOnly && reservedTeamSlots > 0 ? (
              <div className="rounded-lg border border-sky-200/80 bg-sky-50/70 px-3 py-2.5 text-xs leading-relaxed text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                <p className="font-medium text-foreground">チーム種目について</p>
                <p className="mt-1.5 text-muted-foreground">
                  チーム種目の追加・変更はこの画面では行えません。受付内容の「チーム種目」を確認し、所属クラブの「チーム管理」から操作してください。
                </p>
              </div>
            ) : null}

            {editingEstablishedEntry && entryWithdrawAppliedCount > 0 ? (
              <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                棄権した種目を再度エントリーするには、種目にチェックを入れたうえで「更新」してください。出場待ち（スタートリスト）へ戻ります。
              </div>
            ) : null}

            {lockEntryContentUntilPaid && !entryCancelled ? (
              <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                <p className="leading-relaxed">
                  決済の反映が完了するまで、種目・クラブ・連絡事項は変更できません。
                </p>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start lg:gap-8">
              <div className="space-y-5">
                <FormSection
                  sectionId="entry-events"
                  icon={ListChecks}
                  title="種目の選択"
                  description={entryLimitShort}
                  leadDensity="guided"
                >
                  {requireClubMembership && noMemberships ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                      所属クラブが必要ですが、承認済みのクラブがありません。
                    </div>
                  ) : null}

                  {!hasAnyEventsToShow ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      現在、エントリー可能な個人種目がありません。条件（性別・年齢・資格など）をご確認ください。
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupedEvents.POOL.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">プール</p>
                          {renderEventList("プール競技", groupedEvents.POOL)}
                        </div>
                      ) : null}
                      {groupedEvents.OCEAN.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-muted-foreground">オーシャン</p>
                          {renderEventList("オーシャン競技", groupedEvents.OCEAN)}
                        </div>
                      ) : null}
                    </div>
                  )}
                </FormSection>

                {needsClub ? (
                  <FormSection
                    sectionId="entry-club"
                    icon={Building2}
                    title="所属クラブ"
                    description="この大会では所属クラブの指定が必須です。"
                    leadDensity="guided"
                  >
                    <div>
                      <Label htmlFor="club-select" className="text-sm font-medium">
                        クラブを選択
                      </Label>
                      <Select
                        value={clubId ?? undefined}
                        onValueChange={(value) => setClubId(value)}
                        disabled={noMemberships || fieldsLocked}
                      >
                        <SelectTrigger id="club-select" className="mt-2 h-10 text-sm">
                          <SelectValue placeholder="クラブを選択してください" />
                        </SelectTrigger>
                        <SelectContent>
                          {memberships.length === 0 ? (
                            <SelectItem value="no-club" disabled>
                              クラブなし
                            </SelectItem>
                          ) : (
                            memberships.map((membership) => (
                              <SelectItem key={membership.club.id} value={membership.club.id}>
                                {membership.club.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {clubMissing ? (
                        <p className="mt-2 text-xs font-medium text-red-600">クラブを選択してください。</p>
                      ) : null}
                    </div>
                  </FormSection>
                ) : null}

                <FormSection
                  sectionId="entry-notes"
                  icon={MessageSquare}
                  title="連絡事項"
                  description="主催者へのメッセージ（任意）"
                  leadDensity="compact"
                >
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="例: 当日の連絡手段、特記事項など"
                    rows={3}
                    className="min-h-[5rem] resize-y text-sm"
                    disabled={fieldsLocked}
                  />
                </FormSection>

                {entryPledge ? (
                  <FormSection
                    sectionId="entry-pledge"
                    icon={ScrollText}
                    title="誓約への同意"
                    titleSuffix={
                      <Badge
                        variant="secondary"
                        className="h-5 border-transparent bg-amber-100 text-[10px] font-semibold text-amber-950 dark:bg-amber-950/60 dark:text-amber-50"
                      >
                        必須
                      </Badge>
                    }
                    description="本文を読み、同意にチェックしてください。"
                    leadDensity="balanced"
                  >
                    <div
                      id="entry-pledge-document"
                      role="region"
                      aria-label="誓約文"
                      className="max-h-[min(20rem,46vh)] overflow-y-auto overscroll-y-contain rounded-xl border border-border bg-background px-4 py-4 text-foreground shadow-sm"
                    >
                      <SimpleMarkdown
                        text={entryPledge.markdown}
                        className="text-[15px] leading-relaxed tracking-tight"
                      />
                    </div>
                    {pledgeBodyIsLong ? (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ScrollText className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                        長い場合は枠内をスクロールして全文をご確認ください。
                      </p>
                    ) : null}
                    <label className="flex cursor-pointer items-start gap-3.5 rounded-xl border border-primary/35 bg-primary/[0.03] px-4 py-3.5 transition-[border-color,background-color] hover:bg-primary/[0.05] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/[0.06] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/25">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        checked={pledgeAccepted}
                        onChange={(e) => setPledgeAccepted(e.target.checked)}
                        disabled={fieldsLocked}
                        aria-describedby="entry-pledge-document"
                      />
                      <span className="min-w-0 text-sm font-medium leading-snug text-foreground">
                        上記に同意します
                      </span>
                    </label>
                  </FormSection>
                ) : null}

                <FormSection
                  sectionId="entry-submit"
                  icon={Send}
                  title="確認と送信"
                  description={
                    entryPledge
                      ? "誓約を含め内容を確認し、送信または決済へ進んでください。"
                      : "内容を確認のうえ、手続きを完了してください。"
                  }
                  leadDensity="balanced"
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-muted/15 px-4 py-3.5 transition-colors hover:bg-muted/25 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      disabled={fieldsLocked}
                    />
                    <span className="text-sm leading-relaxed text-foreground">
                      エントリー内容を確認し、本人の意思で送信することに同意します
                    </span>
                  </label>

                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    {estimatedFee != null && estimatedFee > 0 && !isSubmitDisabled ? (
                      <p className={cn(fieldHintClass("guided"), "sm:max-w-[14rem]")}>
                        「決済へ進む」から外部の決済画面に進みます。
                        {estimatedProcessingFeeYen > 0 ? (
                          <>
                            参加費に加え、決済手数料（{processingFeePercentLabel}%）がかかります。
                          </>
                        ) : null}
                        決済完了後にエントリーが成立します。
                      </p>
                    ) : (
                      <span className="hidden sm:block sm:flex-1" />
                    )}
                    <Button
                      size="lg"
                      className="h-11 w-full gap-2 text-sm font-semibold sm:h-10 sm:w-auto sm:min-w-[8.5rem]"
                      onClick={handleSubmit}
                      disabled={isSubmitDisabled}
                    >
                      <Send className="h-4 w-4 opacity-90" aria-hidden />
                      {isSubmitting
                        ? "送信中…"
                        : entryPaymentPhase === "confirming"
                          ? "反映待ち"
                          : isPaidEntry
                            ? "更新する"
                            : estimatedFee != null && estimatedFee > 0
                              ? "決済へ進む"
                              : initialEntry
                                ? "更新する"
                                : "エントリーを送信"}
                    </Button>
                  </div>
                </FormSection>
              </div>

              <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
                <div className="rounded-xl border border-border/80 bg-muted/35 p-4 text-foreground shadow-sm">
                  {entryFeeSummary ? (
                    <>
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" aria-hidden />
                        料金
                      </p>
                      <div className="mt-2 [&_p]:text-sm">{entryFeeSummary}</div>
                      <div className="my-3 border-t border-border/60" />
                    </>
                  ) : null}
                  <div className="text-sm tabular-nums">
                    <span className="font-medium text-muted-foreground">お支払い概算</span>
                    {estimatedFee === null ? (
                      <span className="mt-1 block text-sm font-normal leading-snug text-muted-foreground">
                        年齢帯別のため、プロフィールの生年月日が必要です
                      </span>
                    ) : estimatedFee <= 0 ? (
                      <span className="mt-1 block text-xl font-bold tracking-tight text-foreground">
                        ¥0
                      </span>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                          <span>参加費（大会）</span>
                          <span className="font-medium tabular-nums text-foreground">
                            ¥{formatCurrency(estimatedFee)}
                          </span>
                        </div>
                        {estimatedProcessingFeeYen > 0 ? (
                          <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                            <span>決済手数料（{processingFeePercentLabel}%）</span>
                            <span className="font-medium tabular-nums text-foreground">
                              ¥{formatCurrency(estimatedProcessingFeeYen)}
                            </span>
                          </div>
                        ) : null}
                        <div className="border-t border-border/60 pt-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            カード決済時の合計
                          </span>
                          <span className="mt-0.5 block text-xl font-bold tracking-tight text-foreground">
                            ¥{formatCurrency(estimatedTotalChargedYen)}
                          </span>
                        </div>
                        {estimatedProcessingFeeYen > 0 ? (
                          <p className="text-[10px] leading-relaxed text-muted-foreground">
                            上記の決済手数料はカード決済に伴う費用の目安としてお支払いいただきます（お支払い者負担）。
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-card p-4 text-foreground shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                    選択中の種目
                    <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                      {selectedCount}
                    </Badge>
                  </div>
                  {selectedEvents.length === 0 ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      種目のリストでチェックを入れると、ここに一覧表示されます。
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2.5">
                      {selectedEvents.map((event) => (
                        <li
                          key={event.id}
                          className="flex items-start justify-between gap-2 border-b border-border/40 pb-2.5 text-sm last:border-0 last:pb-0"
                        >
                          <span className="min-w-0 font-medium leading-snug">
                            {event.name}
                            <span className="font-normal text-muted-foreground">（{sexLabel(event.sex)}）</span>
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                            {typeLabel(event.type)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </aside>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
