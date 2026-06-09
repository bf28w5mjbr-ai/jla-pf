"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Droplets, Minus, Plus, Search, Users, Waves } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import type { ClubTeamAndPrepaidBillingPair, TeamBillingCheckoutScope } from "@/lib/teamEntryPayments";
import { getTeamPaymentStatusLabel } from "@/lib/teamEntryPayments";
import { resolveCompetitionEventCategoryScope } from "@/lib/competitionEventCategoryScope";
import { cn } from "@/lib/utils";
import { stripeProcessingFeeSurchargeYenFromBps } from "@/lib/stripeProcessingFee";
import { clubTeamNameBaseForClubId } from "@/lib/teamEntryClubBaseName";
import {
  normalizeAllTeamNamesForClub,
  syncDraftListTeamCountForEvent,
  type TeamEntryDraftRow,
} from "@/lib/teamEntryDraftNormalize";

type ClubOption = {
  id: string;
  name: string;
  /** あればチーム名のベースに優先して使う */
  abbreviation?: string | null;
};

type TeamEvent = {
  id: string;
  name: string;
  sex: "MALE" | "FEMALE" | "OTHER";
  category: "POOL" | "OCEAN";
  /** 同一クラブがこの種目に出せるチーム数の上限（未設定は制限なし） */
  maxTeamEntriesPerClub?: number | null;
};

type ExistingTeamEntry = {
  id: string;
  eventId: string;
  teamName: string;
};

type Props = {
  competitionId: string;
  clubs: ClubOption[];
  selectedClubId: string;
  /** チーム種目フォーム＋請求、またはプリペイドのみ */
  surface: "team" | "prepaid";
  teamEvents: TeamEvent[];
  initialEntriesByClub: Record<string, ExistingTeamEntry[]>;
  teamEntryFeePerTeam: number;
  entryWindowOpen: boolean;
  billingByClub?: Record<string, ClubTeamAndPrepaidBillingPair | undefined>;
  clubIndividualEntryBillingTiming: ClubIndividualEntryBillingTiming;
  /** 大会の種別（プール／オーシャン）。表示するチーム種目の区分を決めます */
  competitionCategory?: string | null;
  /** カード決済の上乗せ率（basis points）。STRIPE_PROCESSING_FEE_BPS と一致 */
  cardProcessingFeeBps?: number;
  /** クラブ別: クラブによる個人エントリーで指定可能なメンバー */
  prepaidMemberOptionsByClub?: Record<string, { userId: string; name: string }[]>;
  /** クラブ別: 保存済みのクラブによる個人エントリー対象ユーザー */
  initialPrepaidIndividualUserIdsByClub?: Record<string, string[]>;
};

const sexLabel = (sex: TeamEvent["sex"]) => {
  if (sex === "MALE") return "男子";
  if (sex === "FEMALE") return "女子";
  return "その他";
};

const formatCurrency = (value: number) => new Intl.NumberFormat("ja-JP").format(value);

const paymentStatusBadgeClass = (status?: string | null) => {
  switch (status) {
    case "SUCCEEDED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100";
    case "REFUNDED":
      return "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200";
    case "FAILED":
    case "EXPIRED":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case "DISPUTED":
      return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100";
    case "PENDING":
    default:
      return "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100";
  }
};

const toDraftEntries = (entries: ExistingTeamEntry[]): TeamEntryDraftRow[] =>
  entries.map((entry) => ({
    id: entry.id,
    eventId: entry.eventId,
    teamName: entry.teamName,
    persistedId: entry.id,
  }));

export default function CompetitionTeamEntryManager({
  competitionId,
  clubs,
  selectedClubId,
  surface,
  teamEvents,
  initialEntriesByClub,
  teamEntryFeePerTeam,
  entryWindowOpen,
  billingByClub = {},
  clubIndividualEntryBillingTiming,
  competitionCategory = null,
  cardProcessingFeeBps = 360,
  prepaidMemberOptionsByClub = {},
  initialPrepaidIndividualUserIdsByClub = {},
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entriesByClub, setEntriesByClub] = useState<Record<string, TeamEntryDraftRow[]>>(() =>
    Object.fromEntries(
      clubs.map((club) => [
        club.id,
        normalizeAllTeamNamesForClub(
          toDraftEntries(initialEntriesByClub[club.id] ?? []),
          club.id,
          clubs
        ),
      ])
    )
  );
  const [isSaving, setIsSaving] = useState(false);
  const [checkoutScopePending, setCheckoutScopePending] = useState<TeamBillingCheckoutScope | null>(
    null
  );

  const [prepaidUserIds, setPrepaidUserIds] = useState<string[]>(() => {
    const ids = initialPrepaidIndividualUserIdsByClub[selectedClubId] ?? [];
    const opts = prepaidMemberOptionsByClub[selectedClubId] ?? [];
    const allow = new Set(opts.map((m) => m.userId));
    return [...new Set(ids.filter((id) => allow.has(id)))];
  });
  const [prepaidMemberSearch, setPrepaidMemberSearch] = useState("");

  const prepaidMemberOptions = useMemo(
    () => prepaidMemberOptionsByClub[selectedClubId] ?? [],
    [prepaidMemberOptionsByClub, selectedClubId]
  );

  useEffect(() => {
    const ids = initialPrepaidIndividualUserIdsByClub[selectedClubId] ?? [];
    const allow = new Set(prepaidMemberOptions.map((m) => m.userId));
    setPrepaidUserIds([...new Set(ids.filter((id) => allow.has(id)))]);
    setPrepaidMemberSearch("");
  }, [selectedClubId, initialPrepaidIndividualUserIdsByClub, prepaidMemberOptions]);

  const prepaidMemberSearchNorm = useMemo(
    () => prepaidMemberSearch.trim().normalize("NFKC").toLowerCase(),
    [prepaidMemberSearch]
  );

  const filteredPrepaidMemberOptions = useMemo(() => {
    if (!prepaidMemberSearchNorm) return prepaidMemberOptions;
    return prepaidMemberOptions.filter((m) =>
      m.name.normalize("NFKC").toLowerCase().includes(prepaidMemberSearchNorm)
    );
  }, [prepaidMemberOptions, prepaidMemberSearchNorm]);

  const prepaidSelectedIdSet = useMemo(() => new Set(prepaidUserIds), [prepaidUserIds]);

  const eventCategoryScope = resolveCompetitionEventCategoryScope(competitionCategory);
  const hasPoolTeamEvents = useMemo(
    () => teamEvents.some((e) => e.category === "POOL"),
    [teamEvents]
  );
  const hasOceanTeamEvents = useMemo(
    () => teamEvents.some((e) => e.category === "OCEAN"),
    [teamEvents]
  );
  /** プール・オーシャン両方のチーム種目があるときは区分タブで切替（従来は大会名がプール寄りだと片方だけ表示されていた） */
  const showDualCategoryTabs = hasPoolTeamEvents && hasOceanTeamEvents;

  const scopedTeamEvents = useMemo(() => {
    if (showDualCategoryTabs) {
      return teamEvents;
    }
    if (eventCategoryScope === "OCEAN_ONLY") {
      return teamEvents.filter((e) => e.category === "OCEAN");
    }
    return teamEvents.filter((e) => e.category === "POOL");
  }, [teamEvents, eventCategoryScope, showDualCategoryTabs]);

  const scopedEventIdSet = useMemo(
    () => new Set(scopedTeamEvents.map((e) => e.id)),
    [scopedTeamEvents]
  );

  /** 表示スコープ外の区分に登録済みのチームも API 保存に含める（POOL_ONLY 時にオーシャン行が落ちて全削除になる不具合の防止） */
  const allTeamEventIdSet = useMemo(() => new Set(teamEvents.map((e) => e.id)), [teamEvents]);

  const selectedClubEntries = useMemo(
    () => entriesByClub[selectedClubId] ?? [],
    [entriesByClub, selectedClubId]
  );
  const hasSavedForSelectedClub = useMemo(
    () => selectedClubEntries.some((e) => e.persistedId),
    [selectedClubEntries]
  );
  const entriesForScope = useMemo(
    () => selectedClubEntries.filter((entry) => scopedEventIdSet.has(entry.eventId)),
    [selectedClubEntries, scopedEventIdSet]
  );
  const entriesForSave = useMemo(
    () => selectedClubEntries.filter((entry) => allTeamEventIdSet.has(entry.eventId)),
    [selectedClubEntries, allTeamEventIdSet]
  );
  const hiddenCategoryTeamCount = Math.max(0, entriesForSave.length - entriesForScope.length);

  const selectedClubName = clubs.find((club) => club.id === selectedClubId)?.name ?? "";
  const totalTeamCount = entriesForSave.length;
  const estimatedFee = totalTeamCount * teamEntryFeePerTeam;
  const clubBill = billingByClub[selectedClubId];
  const teamBill = clubBill?.team;
  const prepaidBill = clubBill?.prepaid;
  const paymentQuery = searchParams.get("payment");
  const teamBillingAmount = teamBill?.amount ?? estimatedFee;
  const prepaidBillingAmount = prepaidBill?.amount ?? 0;
  const teamProcessingFeeYen = useMemo(
    () => stripeProcessingFeeSurchargeYenFromBps(teamBillingAmount, cardProcessingFeeBps),
    [teamBillingAmount, cardProcessingFeeBps]
  );
  const prepaidProcessingFeeYen = useMemo(
    () => stripeProcessingFeeSurchargeYenFromBps(prepaidBillingAmount, cardProcessingFeeBps),
    [prepaidBillingAmount, cardProcessingFeeBps]
  );
  const teamCardTotalYen = teamBillingAmount + teamProcessingFeeYen;
  const prepaidCardTotalYen = prepaidBillingAmount + prepaidProcessingFeeYen;
  const teamProcessingFeePercentLabel = (cardProcessingFeeBps / 100).toFixed(1);
  const isFreeTeamEntry = teamEntryFeePerTeam <= 0;
  const showPrepaidBillingUi =
    clubIndividualEntryBillingTiming === "INSTANT_PREPAID" &&
    (prepaidBill != null || prepaidUserIds.length > 0);
  const canStartTeamPayment = Boolean(
    teamBill &&
      teamBill.amount > 0 &&
      (teamBill.finalizedAt || entryWindowOpen) &&
      (teamBill.status === "PENDING" ||
        teamBill.status === "FAILED" ||
        teamBill.status === "EXPIRED")
  );
  const canStartPrepaidPayment = Boolean(
    prepaidBill &&
      prepaidBill.amount > 0 &&
      (prepaidBill.finalizedAt || entryWindowOpen) &&
      (prepaidBill.status === "PENDING" ||
        prepaidBill.status === "FAILED" ||
        prepaidBill.status === "EXPIRED")
  );

  const groupedEvents = useMemo(
    () => ({
      POOL: scopedTeamEvents.filter((event) => event.category === "POOL"),
      OCEAN: scopedTeamEvents.filter((event) => event.category === "OCEAN"),
    }),
    [scopedTeamEvents]
  );

  /** 種目ごとの登録組数を目標値に合わせる（末尾の追加・削除＋自動命名） */
  const setTeamCountForEvent = (eventId: string, rawTarget: number, cap: number | null) => {
    setEntriesByClub((prev) => {
      const list = prev[selectedClubId] ?? [];
      const current = list.filter((e) => e.eventId === eventId).length;
      let target = Math.max(0, Math.floor(Number.isFinite(rawTarget) ? rawTarget : current));
      if (cap != null) target = Math.min(target, cap);
      if (target === current) return prev;

      const base = clubTeamNameBaseForClubId(selectedClubId, clubs);
      const nextList = syncDraftListTeamCountForEvent(list, eventId, target, base);
      return { ...prev, [selectedClubId]: nextList };
    });
  };

  const setPrepaidMemberChecked = (userId: string, checked: boolean) => {
    setPrepaidUserIds((prev) => {
      if (checked) {
        if (prev.includes(userId)) return prev;
        return [...prev, userId];
      }
      return prev.filter((id) => id !== userId);
    });
  };

  const selectAllFilteredPrepaidMembers = () => {
    setPrepaidUserIds((prev) => [
      ...new Set([...prev, ...filteredPrepaidMemberOptions.map((m) => m.userId)]),
    ]);
  };

  const deselectAllFilteredPrepaidMembers = () => {
    const drop = new Set(filteredPrepaidMemberOptions.map((m) => m.userId));
    setPrepaidUserIds((prev) => prev.filter((id) => !drop.has(id)));
  };

  const handleSave = async () => {
    if (!selectedClubId) {
      toast.error("クラブを選択してください");
      return;
    }

    const invalidEntry = entriesForSave.find((entry) => !entry.teamName.trim());
    if (invalidEntry) {
      toast.error("チーム名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/team-entries`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clubId: selectedClubId,
          teams: entriesForSave.map((entry) => ({
            eventId: entry.eventId,
            teamName: entry.teamName.trim(),
          })),
          prepaidIndividualUserIds: [...new Set(prepaidUserIds.map((id) => id.trim()).filter(Boolean))],
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        details?: string;
        teamEntries?: ExistingTeamEntry[];
      };
      if (!response.ok) {
        const base =
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "チームエントリーの更新に失敗しました";
        const devHint =
          process.env.NODE_ENV !== "production" && typeof data.details === "string"
            ? ` (${data.details})`
            : "";
        throw new Error(base + devHint);
      }

      setEntriesByClub((prev) => ({
        ...prev,
        [selectedClubId]: normalizeAllTeamNamesForClub(
          toDraftEntries(data.teamEntries ?? []),
          selectedClubId,
          clubs
        ),
      }));
      toast.success(
        isFreeTeamEntry
          ? "保存しました。チーム種目は無料のため決済は不要で、この時点で登録手続きは完了です。"
          : "チームエントリーを更新しました"
      );
      router.refresh();
    } catch (error) {
      console.error("Team entry save error:", error);
      toast.error(
        error instanceof Error ? error.message : "チームエントリーの更新に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartPayment = async (scope: TeamBillingCheckoutScope) => {
    if (!selectedClubId) {
      toast.error("クラブを選択してください");
      return;
    }
    setCheckoutScopePending(scope);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/team-billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clubId: selectedClubId, billingScope: scope }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "決済の開始に失敗しました");
      }
      if (!data.checkoutUrl || typeof data.checkoutUrl !== "string") {
        throw new Error("決済URLの取得に失敗しました");
      }
      window.location.href = data.checkoutUrl;
    } catch (error) {
      console.error("Team billing checkout error:", error);
      toast.error(error instanceof Error ? error.message : "決済の開始に失敗しました");
    } finally {
      setCheckoutScopePending(null);
    }
  };

  const renderSaveFooter = () => (
    <div className="rounded-lg border-2 border-dashed border-primary/25 bg-muted/20 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground sm:max-w-[20rem]">
          {isFreeTeamEntry
            ? "無料のため決済はありません。内容を保存すると登録手続きが完了します。変更したら必ず保存してください。"
            : "チーム名を変えたあと、必ず保存してください。保存後に請求・決済の状態が更新されることがあります。"}
        </p>
        <Button
          type="button"
          className="h-10 min-w-[12rem] shrink-0 font-semibold"
          onClick={handleSave}
          disabled={isSaving || !entryWindowOpen}
        >
          {isSaving ? "保存中…" : "チームエントリーを保存"}
        </Button>
      </div>
    </div>
  );

  const renderCompactCategoryEvents = (title: string, events: TeamEvent[], accent: "pool" | "ocean") => {
    if (events.length === 0) {
      return (
        <div
          className={cn(
            "rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground",
            accent === "pool"
              ? "border-orange-200/80 bg-orange-50/40 dark:border-orange-900/50 dark:bg-orange-950/20"
              : "border-cyan-200/80 bg-cyan-50/40 dark:border-cyan-900/50 dark:bg-cyan-950/20"
          )}
        >
          {title}のチーム種目はありません。
        </div>
      );
    }

    return (
      <div
        className={cn(
          "divide-y rounded-lg border bg-card/80",
          accent === "pool"
            ? "border-orange-200/70 dark:border-orange-900/50"
            : "border-cyan-200/70 dark:border-cyan-900/50"
        )}
      >
        {events.map((event) => {
          const eventEntries = entriesForScope.filter((entry) => entry.eventId === event.id);
          const cap =
            typeof event.maxTeamEntriesPerClub === "number" && event.maxTeamEntriesPerClub >= 1
              ? event.maxTeamEntriesPerClub
              : null;
          const atCap = cap != null && eventEntries.length >= cap;
          const count = eventEntries.length;
          const previewRaw = eventEntries
            .map((e) => e.teamName.trim())
            .filter(Boolean)
            .join(", ");
          const preview =
            previewRaw.length > 72 ? `${previewRaw.slice(0, 72)}…` : previewRaw || "—（0組）";
          const countInputId = `team-count-${event.id}`;

          return (
            <div
              key={event.id}
              className={cn(
                "px-3 py-2.5 sm:px-4",
                accent === "pool" ? "bg-orange-50/20 dark:bg-orange-950/10" : "bg-cyan-50/15 dark:bg-cyan-950/10"
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{event.name}</span>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {sexLabel(event.sex)}
                    </Badge>
                    {cap != null ? (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        上限 <span className="font-medium text-foreground">{cap}</span> 組
                        {atCap ? (
                          <span className="ml-1 font-medium text-amber-800 dark:text-amber-200">（上限）</span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="mt-0.5 truncate text-[11px] text-muted-foreground"
                    title={previewRaw || undefined}
                  >
                    {preview}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setTeamCountForEvent(event.id, count - 1, cap)}
                    disabled={!entryWindowOpen || count <= 0}
                    aria-label={`${event.name}の登録組数を1減らす`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    id={countInputId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={cap ?? undefined}
                    value={count}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setTeamCountForEvent(event.id, Number.isNaN(v) ? 0 : v, cap);
                    }}
                    disabled={!entryWindowOpen}
                    className="h-8 w-[3.25rem] px-1 text-center text-sm tabular-nums"
                    aria-label={`${event.name}の登録組数`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setTeamCountForEvent(event.id, count + 1, cap)}
                    disabled={!entryWindowOpen || atCap}
                    aria-label={`${event.name}の登録組数を1増やす`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (surface === "team" && scopedTeamEvents.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/15">
          <CardTitle className="text-base font-semibold">チームエントリー</CardTitle>
        <CardDescription className="text-xs">
          この大会の区分（プール／オーシャン）に該当するチーム種目が設定されていません。
        </CardDescription>
        </CardHeader>
        <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
          主催者に種目設定をご確認ください。
        </CardContent>
      </Card>
    );
  }

  const prepaidFormBlock = (
    <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium text-foreground">クラブによる個人エントリー</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          個人種目に出る部員の参加費を
          <strong className="font-medium text-foreground">クラブがまとめて負担</strong>
          する人を、下の一覧で選んでください。部費でまとめたい・選手本人にカード決済をさせたくない場合に使います。誰も選ばないまま保存すると、クラブによる個人枠はありません。
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">個人のカード決済が済んでいるメンバー</strong>
          は、この一覧には表示されません。
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">クラブ</strong>
          が選んだ人数ぶんの個人参加費は、
          <strong className="font-medium text-foreground">チーム請求とは別の請求</strong>
          としてまとまります。どちらから先にカード決済しても構いません。
          そのあと<strong className="font-medium text-foreground">本人</strong>
          が個人エントリーで種目を選ぶと、個人分の
          <strong className="font-medium text-foreground">追加のカード決済は不要</strong>
          です。
        </p>
        <Badge variant="outline" className="font-normal">
          個人分: 先払い（クラブ請求が別枠）
        </Badge>
      </div>

      {prepaidMemberOptions.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          クラブ個人枠に指定できる承認済みメンバーがいません（個人のカード決済済みの方は一覧に出ません）。
        </p>
      ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  対象メンバー（
                  <span className="tabular-nums text-foreground">{prepaidUserIds.length}</span> 名選択中）
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={selectAllFilteredPrepaidMembers}
                  disabled={!entryWindowOpen || filteredPrepaidMemberOptions.length === 0}
                >
                  表示中をすべて選択
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={deselectAllFilteredPrepaidMembers}
                  disabled={!entryWindowOpen || filteredPrepaidMemberOptions.length === 0}
                >
                  表示中の選択を解除
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={prepaidMemberSearch}
                onChange={(e) => setPrepaidMemberSearch(e.target.value)}
                placeholder="名前で絞り込み…"
                disabled={!entryWindowOpen}
                className="h-9 pl-8 text-sm"
                autoComplete="off"
                aria-label="クラブ個人枠のメンバー名で絞り込み"
              />
            </div>
            {filteredPrepaidMemberOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">該当するメンバーがいません。</p>
            ) : (
              <ul
                className="max-h-[min(24rem,55vh)] space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background/80 p-2"
                role="list"
              >
                {filteredPrepaidMemberOptions.map((m) => (
                  <li key={m.userId}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted/60">
                      <Checkbox
                        checked={prepaidSelectedIdSet.has(m.userId)}
                        onCheckedChange={(v) => setPrepaidMemberChecked(m.userId, Boolean(v))}
                        disabled={!entryWindowOpen}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1 leading-snug">{m.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
      )}
    </div>
  );

  if (surface === "prepaid") {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-1 border-b border-border bg-muted/15">
          <CardTitle className="text-base font-semibold">クラブによる個人エントリー</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            チーム種目タブと同じ「チームエントリーを保存」でまとめて送信されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-4 py-5 sm:px-6">
          {!entryWindowOpen && (
            <div
              role="status"
              className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
            >
              現在はエントリー受付期間外のため、設定の変更・保存はできません。
            </div>
          )}
          {paymentQuery === "success" ? (
            <p
              role="status"
              className="rounded-md border border-emerald-200/90 bg-emerald-50/90 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
            >
              決済を受け付けました。反映まで少し時間がかかる場合があります。
            </p>
          ) : null}
          {paymentQuery === "cancel" ? (
            <p
              role="status"
              className="rounded-md border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
            >
              決済はキャンセルされました。必要なら再度お試しください。
            </p>
          ) : null}
          {prepaidFormBlock}
          {showPrepaidBillingUi ? (
            <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
              <p className="text-xs font-semibold text-muted-foreground">請求・決済（個人枠）</p>
              {!prepaidBill && prepaidUserIds.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  金額は「チームエントリーを保存」のあとに確定します。
                </p>
              ) : null}
              {prepaidBill ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">請求額</span>
                    <span className="tabular-nums font-semibold">
                      ¥{formatCurrency(prepaidBillingAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">状態</span>
                    <Badge
                      variant="outline"
                      className={cn("font-normal", paymentStatusBadgeClass(prepaidBill.status))}
                    >
                      {getTeamPaymentStatusLabel(prepaidBill.status)}
                    </Badge>
                  </div>
                  {prepaidBill.status !== "SUCCEEDED" ? (
                    <Button
                      type="button"
                      className="mt-1 h-10 w-full gap-2 font-semibold"
                      onClick={() => void handleStartPayment("prepaid")}
                      disabled={!canStartPrepaidPayment || checkoutScopePending !== null}
                    >
                      <CreditCard className="h-4 w-4" />
                      {checkoutScopePending === "prepaid" ? "決済へ移動中…" : "個人枠の請求を支払う"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {renderSaveFooter()}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b border-border bg-muted/15">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold">登録内容の編集</CardTitle>
          {hasSavedForSelectedClub ? (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50/90 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100"
            >
              登録あり
            </Badge>
          ) : null}
        </div>
        {hiddenCategoryTeamCount > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-50">
            表示していない区分の登録チームが{" "}
            <span className="font-semibold tabular-nums">{hiddenCategoryTeamCount}</span>{" "}
            組あります。保存ではこれらも含めて大会に反映されます（一覧はエントリー履歴で確認できます）。
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6 px-4 py-5 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,340px)] lg:items-start">
          <div className="min-w-0 space-y-6">
            {!entryWindowOpen && (
              <div
                role="status"
                className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
              >
                現在はエントリー受付期間外のため、チーム名の追加・削除・保存はできません。
              </div>
            )}

            {paymentQuery === "success" ? (
              <p
                role="status"
                className="rounded-md border border-emerald-200/90 bg-emerald-50/90 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
              >
                決済を受け付けました。反映まで少し時間がかかる場合があります。
              </p>
            ) : null}
            {paymentQuery === "cancel" ? (
              <p
                role="status"
                className="rounded-md border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
              >
                決済はキャンセルされました。必要なら再度お試しください。
              </p>
            ) : null}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              種目ごとに<strong className="font-medium text-foreground">登録組数</strong>
              を数字で指定すると、略称（なければ正式名）ベースのチーム名が自動で付きます（1組だけなら略称のみ、複数組は A・B…）。
            </p>

            {showDualCategoryTabs ? (
              <Tabs defaultValue="pool" className="w-full">
                <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1.5 rounded-lg border border-border/60 bg-muted/40 p-1">
                  <TabsTrigger
                    value="pool"
                    className="gap-1.5 text-xs data-[state=active]:shadow-sm sm:text-sm"
                  >
                    <Droplets className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
                    プール競技
                  </TabsTrigger>
                  <TabsTrigger
                    value="ocean"
                    className="gap-1.5 text-xs data-[state=active]:shadow-sm sm:text-sm"
                  >
                    <Waves className="h-3.5 w-3.5 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden />
                    オーシャン競技
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="pool" className="mt-4 outline-none focus-visible:ring-0">
                  {renderCompactCategoryEvents("プール競技", groupedEvents.POOL, "pool")}
                </TabsContent>
                <TabsContent value="ocean" className="mt-4 outline-none focus-visible:ring-0">
                  {renderCompactCategoryEvents("オーシャン競技", groupedEvents.OCEAN, "ocean")}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-8">
                {eventCategoryScope !== "OCEAN_ONLY" && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2 border-b border-orange-200/60 pb-2 dark:border-orange-900/50">
                      <Droplets className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
                      <h2 className="text-sm font-semibold tracking-tight text-foreground">プール競技</h2>
                    </div>
                    {renderCompactCategoryEvents("プール競技", groupedEvents.POOL, "pool")}
                  </section>
                )}
                {eventCategoryScope !== "POOL_ONLY" && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2 border-b border-cyan-200/60 pb-2 dark:border-cyan-900/50">
                      <Waves className="h-4 w-4 text-cyan-700 dark:text-cyan-400" aria-hidden />
                      <h2 className="text-sm font-semibold tracking-tight text-foreground">オーシャン競技</h2>
                    </div>
                    {renderCompactCategoryEvents("オーシャン競技", groupedEvents.OCEAN, "ocean")}
                  </section>
                )}
              </div>
            )}

            {renderSaveFooter()}
          </div>

          <aside className="lg:sticky lg:top-20 space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 shadow-sm dark:bg-muted/15">
              <p className="text-xs font-medium text-muted-foreground">
                {isFreeTeamEntry ? "登録状況（無料）" : "請求・決済"}
              </p>
              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                {selectedClubName || "クラブ未選択"}
              </p>

              {isFreeTeamEntry ? (
                <>
                  <div className="mt-4 flex items-baseline justify-between gap-2 border-b border-border/50 pb-2 text-sm">
                    <span className="text-muted-foreground">登録チーム数</span>
                    <span className="tabular-nums font-semibold text-foreground">{totalTeamCount}</span>
                  </div>
                  <p className="mt-3 text-sm leading-snug text-muted-foreground">
                    チーム種目は<strong className="font-medium text-foreground">無料</strong>
                    のため、カード決済や「支払い完了」を待つ必要はありません。
                  </p>
                  {totalTeamCount === 0 ? (
                    <p className="mt-3 rounded-md border border-dashed border-border bg-background/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                      種目ごとに登録組数を決めて「チームエントリーを保存」を押すと登録が完了します。
                    </p>
                  ) : (
                    <div className="mt-3 flex gap-2.5 rounded-lg border border-emerald-200/90 bg-emerald-50/90 px-3 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/35">
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400"
                        aria-hidden
                      />
                      <div className="min-w-0 space-y-1.5 text-xs leading-snug text-emerald-950 dark:text-emerald-100">
                        <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                          手続きの終わり方（無料）
                        </p>
                        <ol className="list-decimal space-y-1 pl-4 marker:font-medium">
                          <li>「チームエントリーを保存」を押して内容を確定する（どちらのタブからでも可）</li>
                          <li>保存に成功したら、この画面での手続きは完了です</li>
                        </ol>
                        <p className="text-[11px] text-emerald-900/90 dark:text-emerald-200/90">
                          あとからチーム数を変える場合は、改めて保存してください。
                        </p>
                      </div>
                    </div>
                  )}
                  {showPrepaidBillingUi ? (
                    <div className="mt-6 space-y-3 border-t border-border/60 pt-4">
                      <p className="text-xs font-semibold text-muted-foreground">クラブ個人枠（先払い）</p>
                      {!prepaidBill && prepaidUserIds.length > 0 ? (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          金額は「チームエントリーを保存」のあとに確定します。
                        </p>
                      ) : null}
                      {prepaidBill ? (
                        <>
                          <dl className="space-y-2 text-sm">
                            <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                              <dt className="text-muted-foreground">請求額</dt>
                              <dd className="tabular-nums font-semibold text-foreground">
                                ¥{formatCurrency(prepaidBillingAmount)}
                              </dd>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <dt className="text-muted-foreground">状態</dt>
                              <dd>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "font-normal",
                                    paymentStatusBadgeClass(prepaidBill.status)
                                  )}
                                >
                                  {getTeamPaymentStatusLabel(prepaidBill.status)}
                                </Badge>
                              </dd>
                            </div>
                          </dl>
                          {prepaidBill.status !== "SUCCEEDED" && (
                            <div className="mt-2">
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-9 w-full gap-2 text-sm font-semibold"
                                onClick={() => void handleStartPayment("prepaid")}
                                disabled={!canStartPrepaidPayment || checkoutScopePending !== null}
                              >
                                <CreditCard className="h-4 w-4" />
                                {checkoutScopePending === "prepaid"
                                  ? "決済へ移動中…"
                                  : "個人枠の請求を支払う"}
                              </Button>
                              {!canStartPrepaidPayment && (
                                <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                                  {entryWindowOpen
                                    ? "保存のうえ、請求額が0円より大きいときに決済できます。"
                                    : "締切後は主催の請求確定後に決済できます。"}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <Button asChild variant="outline" className="mt-4 h-10 w-full">
                    <Link href={appRoutes.competitions.root(competitionId)}>大会ページへ戻る</Link>
                  </Button>
                </>
              ) : (
                <>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                      <dt className="text-muted-foreground">登録チーム数</dt>
                      <dd className="tabular-nums font-semibold text-foreground">{totalTeamCount}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                      <dt className="text-muted-foreground">想定額（チーム）</dt>
                      <dd className="tabular-nums font-medium">¥{formatCurrency(estimatedFee)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                      <dt className="text-muted-foreground">チーム請求額</dt>
                      <dd className="tabular-nums font-semibold text-foreground">
                        ¥{formatCurrency(teamBillingAmount)}
                      </dd>
                    </div>
                    {teamProcessingFeeYen > 0 ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                          <dt className="text-muted-foreground">
                            決済手数料（{teamProcessingFeePercentLabel}%）
                          </dt>
                          <dd className="tabular-nums font-medium text-foreground">
                            ¥{formatCurrency(teamProcessingFeeYen)}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                          <dt className="font-medium text-foreground">チーム分・カード合計</dt>
                          <dd className="tabular-nums text-base font-bold text-foreground">
                            ¥{formatCurrency(teamCardTotalYen)}
                          </dd>
                        </div>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          決済手数料はカード決済手数料です（お支払い者負担）。Stripe
                          の画面では参加費と手数料が内訳表示されます。
                        </p>
                      </>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-muted-foreground">チーム請求の状態</dt>
                      <dd>
                        <Badge
                          variant="outline"
                          className={cn("font-normal", paymentStatusBadgeClass(teamBill?.status))}
                        >
                          {getTeamPaymentStatusLabel(teamBill?.status)}
                        </Badge>
                      </dd>
                    </div>
                  </dl>

                  {teamBill?.finalizedAt && (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      チーム請求の確定: {new Date(teamBill.finalizedAt).toLocaleString("ja-JP")}
                    </p>
                  )}

                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    単価: 1チームあたり ¥{formatCurrency(teamEntryFeePerTeam)}
                  </p>

                  {teamBill?.status === "SUCCEEDED" && (
                    <p className="mt-3 rounded-md border border-emerald-200/80 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                      チーム請求の支払いは完了しています。追加のチームが確定した場合のみ、再請求・再決済の対象になることがあります。
                    </p>
                  )}
                  {teamBill?.status === "PENDING" && teamBill?.finalizedAt && (
                    <p className="mt-3 rounded-md border border-orange-200/80 bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100">
                      主催による請求確定済みです。下のボタンからチーム分のカード決済を完了してください。
                    </p>
                  )}
                  {teamBill?.status === "PENDING" && !teamBill?.finalizedAt && entryWindowOpen && (
                    <p className="mt-3 rounded-md border border-orange-200/80 bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100">
                      エントリー期間中です。登録を保存したうえで、いつでも下のボタンから決済できます。
                    </p>
                  )}
                  {(teamBill?.status === "FAILED" || teamBill?.status === "EXPIRED") && (
                    <p className="mt-3 rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                      前回のチーム請求の決済は完了していません。もう一度お試しください。
                    </p>
                  )}

                  {teamBill?.status !== "SUCCEEDED" && (
                    <div className="mt-4">
                      <Button
                        type="button"
                        className="h-10 w-full gap-2 font-semibold"
                        onClick={() => void handleStartPayment("team")}
                        disabled={!canStartTeamPayment || checkoutScopePending !== null}
                      >
                        <CreditCard className="h-4 w-4" />
                        {checkoutScopePending === "team" ? "決済へ移動中…" : "チーム請求を支払う"}
                      </Button>
                      {!canStartTeamPayment && (
                        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                          {entryWindowOpen
                            ? "チームエントリーを保存し、請求額が0円より大きいときに決済できます。"
                            : "締切後は主催の請求確定後に決済できます。"}
                        </p>
                      )}
                    </div>
                  )}

                  {showPrepaidBillingUi ? (
                    <div className="mt-6 space-y-3 border-t border-border/60 pt-4">
                      <p className="text-xs font-semibold text-muted-foreground">クラブ個人枠（先払い）</p>
                      {!prepaidBill && prepaidUserIds.length > 0 ? (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          金額は保存後に確定します。チーム請求とは別に決済します。
                        </p>
                      ) : null}
                      {prepaidBill ? (
                        <>
                          <dl className="space-y-2 text-sm">
                            <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                              <dt className="text-muted-foreground">請求額</dt>
                              <dd className="tabular-nums font-semibold text-foreground">
                                ¥{formatCurrency(prepaidBillingAmount)}
                              </dd>
                            </div>
                            {prepaidProcessingFeeYen > 0 ? (
                              <>
                                <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                                  <dt className="text-muted-foreground">
                                    決済手数料（{teamProcessingFeePercentLabel}%）
                                  </dt>
                                  <dd className="tabular-nums font-medium text-foreground">
                                    ¥{formatCurrency(prepaidProcessingFeeYen)}
                                  </dd>
                                </div>
                                <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                                  <dt className="font-medium text-foreground">個人枠・カード合計</dt>
                                  <dd className="tabular-nums text-base font-bold text-foreground">
                                    ¥{formatCurrency(prepaidCardTotalYen)}
                                  </dd>
                                </div>
                              </>
                            ) : null}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <dt className="text-muted-foreground">状態</dt>
                              <dd>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "font-normal",
                                    paymentStatusBadgeClass(prepaidBill.status)
                                  )}
                                >
                                  {getTeamPaymentStatusLabel(prepaidBill.status)}
                                </Badge>
                              </dd>
                            </div>
                          </dl>
                          {prepaidBill.finalizedAt ? (
                            <p className="text-[11px] text-muted-foreground">
                              個人枠の請求確定:{" "}
                              {new Date(prepaidBill.finalizedAt).toLocaleString("ja-JP")}
                            </p>
                          ) : null}
                          {prepaidBill.status === "SUCCEEDED" && (
                            <p className="rounded-md border border-emerald-200/80 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                              個人枠の支払いは完了しています。対象者を変えた場合は、保存し直すと請求が更新されることがあります。
                            </p>
                          )}
                          {prepaidBill.status === "PENDING" && prepaidBill.finalizedAt && (
                            <p className="rounded-md border border-orange-200/80 bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100">
                              主催による請求確定済みです。下のボタンから個人枠分の決済を完了してください。
                            </p>
                          )}
                          {prepaidBill.status === "PENDING" && !prepaidBill.finalizedAt && entryWindowOpen && (
                            <p className="rounded-md border border-orange-200/80 bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100">
                              エントリー期間中です。保存後、個人枠だけ先に決済できます。
                            </p>
                          )}
                          {(prepaidBill.status === "FAILED" || prepaidBill.status === "EXPIRED") && (
                            <p className="rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                              前回の個人枠の決済は完了していません。もう一度お試しください。
                            </p>
                          )}
                          {prepaidBill.status !== "SUCCEEDED" && (
                            <div className="mt-2">
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full gap-2 font-semibold"
                                onClick={() => void handleStartPayment("prepaid")}
                                disabled={!canStartPrepaidPayment || checkoutScopePending !== null}
                              >
                                <CreditCard className="h-4 w-4" />
                                {checkoutScopePending === "prepaid"
                                  ? "決済へ移動中…"
                                  : "個人枠の請求を支払う"}
                              </Button>
                              {!canStartPrepaidPayment && (
                                <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                                  {entryWindowOpen
                                    ? "保存のうえ、請求額が0円より大きいときに決済できます。"
                                    : "締切後は主催の請求確定後に決済できます。"}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}
