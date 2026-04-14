"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Droplets, Info, Plus, Trash2, Users, Waves } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClubIndividualEntryBillingTiming } from "@/lib/clubIndividualEntryBillingTiming";
import { getTeamPaymentStatusLabel } from "@/lib/teamEntryPayments";
import { resolveCompetitionEventCategoryScope } from "@/lib/competitionEventCategoryScope";
import { cn } from "@/lib/utils";
import { stripeProcessingFeeSurchargeYenFromBps } from "@/lib/stripeProcessingFee";

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

type DraftTeamEntry = {
  id: string;
  eventId: string;
  teamName: string;
  persistedId?: string;
};

type Props = {
  competitionId: string;
  /** サーバーに保存済みのチームがある（履歴パネル表示と連動） */
  hasSavedTeamEntries?: boolean;
  clubs: ClubOption[];
  teamEvents: TeamEvent[];
  initialEntriesByClub: Record<string, ExistingTeamEntry[]>;
  teamEntryFeePerTeam: number;
  entryWindowOpen: boolean;
  billingByClub?: Record<
    string,
    {
      status: string;
      amount: number;
      finalizedAt?: string | null;
      stripeCheckoutSessionId?: string | null;
    } | undefined
  >;
  /** 大会の種別（プール／オーシャン）。表示するチーム種目の区分を決めます */
  competitionCategory?: string | null;
  /** カード決済の上乗せ率（basis points）。STRIPE_PROCESSING_FEE_BPS と一致 */
  cardProcessingFeeBps?: number;
  /** 個人分のクラブ請求タイミング（参加費 JSON から算出） */
  clubIndividualEntryBillingTiming?: ClubIndividualEntryBillingTiming;
  /** クラブによる個人エントリーで指定可能なメンバー */
  prepaidMemberOptions?: { userId: string; name: string }[];
  /** 保存済みのクラブによる個人エントリー対象ユーザー */
  initialPrepaidIndividualUserIds?: string[];
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

const toDraftEntries = (entries: ExistingTeamEntry[]): DraftTeamEntry[] =>
  entries.map((entry) => ({
    id: entry.id,
    eventId: entry.eventId,
    teamName: entry.teamName,
    persistedId: entry.id,
  }));

/** 1→A, 26→Z, 27→AA（列記号と同じく増分） */
function indexToLetters(index: number): string {
  if (index < 1) return "A";
  let n = index;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function clubTeamNameBase(clubId: string, clubList: ClubOption[]): string {
  const c = clubList.find((x) => x.id === clubId);
  if (!c) return "チーム";
  const abbr = c.abbreviation?.trim();
  if (abbr) return abbr;
  return c.name.trim() || "チーム";
}

/** 同一種目内で1組だけならベースのみ、2組以上なら「ベース A」「ベース B」…にそろえる */
function normalizeTeamNamesForEvent(
  entries: DraftTeamEntry[],
  eventId: string,
  base: string
): DraftTeamEntry[] {
  const indices: number[] = [];
  entries.forEach((e, i) => {
    if (e.eventId === eventId) indices.push(i);
  });
  const n = indices.length;
  if (n === 0) return entries;
  const out = [...entries];
  if (n === 1) {
    out[indices[0]] = { ...out[indices[0]], teamName: base };
    return out;
  }
  indices.forEach((entryIdx, k) => {
    out[entryIdx] = {
      ...out[entryIdx],
      teamName: `${base} ${indexToLetters(k + 1)}`,
    };
  });
  return out;
}

export default function CompetitionTeamEntryManager({
  competitionId,
  hasSavedTeamEntries = false,
  clubs,
  teamEvents,
  initialEntriesByClub,
  teamEntryFeePerTeam,
  entryWindowOpen,
  billingByClub = {},
  competitionCategory = null,
  cardProcessingFeeBps = 360,
  clubIndividualEntryBillingTiming = "INSTANT_PREPAID",
  prepaidMemberOptions = [],
  initialPrepaidIndividualUserIds = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedClubId, setSelectedClubId] = useState(clubs[0]?.id ?? "");
  const [entriesByClub, setEntriesByClub] = useState<Record<string, DraftTeamEntry[]>>(() =>
    Object.fromEntries(clubs.map((club) => [club.id, toDraftEntries(initialEntriesByClub[club.id] ?? [])]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [prepaidEnabled, setPrepaidEnabled] = useState(initialPrepaidIndividualUserIds.length > 0);
  const [prepaidUserIds, setPrepaidUserIds] = useState<string[]>(() =>
    initialPrepaidIndividualUserIds.length > 0
      ? [...initialPrepaidIndividualUserIds]
      : [""]
  );

  const eventCategoryScope = resolveCompetitionEventCategoryScope(competitionCategory);
  const scopedTeamEvents = useMemo(() => {
    if (eventCategoryScope === "OCEAN_ONLY") {
      return teamEvents.filter((e) => e.category === "OCEAN");
    }
    return teamEvents.filter((e) => e.category === "POOL");
  }, [teamEvents, eventCategoryScope]);

  const scopedEventIdSet = useMemo(
    () => new Set(scopedTeamEvents.map((e) => e.id)),
    [scopedTeamEvents]
  );

  const selectedClubEntries = useMemo(
    () => entriesByClub[selectedClubId] ?? [],
    [entriesByClub, selectedClubId]
  );
  const entriesForScope = useMemo(
    () => selectedClubEntries.filter((entry) => scopedEventIdSet.has(entry.eventId)),
    [selectedClubEntries, scopedEventIdSet]
  );
  const selectedClubName = clubs.find((club) => club.id === selectedClubId)?.name ?? "";
  const totalTeamCount = entriesForScope.length;
  const estimatedFee = totalTeamCount * teamEntryFeePerTeam;
  const billing = billingByClub[selectedClubId];
  const paymentQuery = searchParams.get("payment");
  const billingAmount = billing?.amount ?? estimatedFee;
  const teamProcessingFeeYen = useMemo(
    () => stripeProcessingFeeSurchargeYenFromBps(billingAmount, cardProcessingFeeBps),
    [billingAmount, cardProcessingFeeBps]
  );
  const teamCardTotalYen = billingAmount + teamProcessingFeeYen;
  const teamProcessingFeePercentLabel = (cardProcessingFeeBps / 100).toFixed(1);
  const isFreeTeamEntry = teamEntryFeePerTeam <= 0;
  const canStartPayment = Boolean(
    billing &&
      billing.amount > 0 &&
      (billing.finalizedAt || entryWindowOpen) &&
      (billing.status === "PENDING" || billing.status === "FAILED" || billing.status === "EXPIRED")
  );

  const groupedEvents = useMemo(
    () => ({
      POOL: scopedTeamEvents.filter((event) => event.category === "POOL"),
      OCEAN: scopedTeamEvents.filter((event) => event.category === "OCEAN"),
    }),
    [scopedTeamEvents]
  );

  const teamNamePlaceholder = useMemo(() => {
    const base = clubTeamNameBase(selectedClubId, clubs);
    return `例: ${base}（複数組は ${base} A）`;
  }, [selectedClubId, clubs]);

  const addTeam = (eventId: string) => {
    setEntriesByClub((prev) => {
      const list = [...(prev[selectedClubId] ?? [])];
      list.push({
        id: `draft-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        eventId,
        teamName: "",
      });
      const base = clubTeamNameBase(selectedClubId, clubs);
      return {
        ...prev,
        [selectedClubId]: normalizeTeamNamesForEvent(list, eventId, base),
      };
    });
  };

  const updateTeamName = (entryId: string, teamName: string) => {
    setEntriesByClub((prev) => ({
      ...prev,
      [selectedClubId]: (prev[selectedClubId] ?? []).map((entry) =>
        entry.id === entryId ? { ...entry, teamName } : entry
      ),
    }));
  };

  const removeTeam = (entryId: string) => {
    setEntriesByClub((prev) => {
      const list = prev[selectedClubId] ?? [];
      const victim = list.find((e) => e.id === entryId);
      const eventId = victim?.eventId;
      const filtered = list.filter((e) => e.id !== entryId);
      if (!eventId) {
        return { ...prev, [selectedClubId]: filtered };
      }
      const base = clubTeamNameBase(selectedClubId, clubs);
      return {
        ...prev,
        [selectedClubId]: normalizeTeamNamesForEvent(filtered, eventId, base),
      };
    });
  };

  const setPrepaidUserAt = (index: number, userId: string) => {
    setPrepaidUserIds((prev) => {
      const next = [...prev];
      next[index] = userId === "__none__" ? "" : userId;
      return next;
    });
  };

  const addPrepaidRow = () => setPrepaidUserIds((prev) => [...prev, ""]);

  const removePrepaidRow = (index: number) => {
    setPrepaidUserIds((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const handleSave = async () => {
    if (!selectedClubId) {
      toast.error("クラブを選択してください");
      return;
    }

    const invalidEntry = entriesForScope.find((entry) => !entry.teamName.trim());
    if (invalidEntry) {
      toast.error("チーム名を入力してください");
      return;
    }

    if (prepaidEnabled) {
      const chosen = [...new Set(prepaidUserIds.map((id) => id.trim()).filter(Boolean))];
      if (chosen.length === 0) {
        toast.error("クラブによる個人エントリーを利用する場合は、メンバーを1名以上選択してください");
        return;
      }
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
          teams: entriesForScope.map((entry) => ({
            eventId: entry.eventId,
            teamName: entry.teamName.trim(),
          })),
          prepaidIndividualUserIds: prepaidEnabled
            ? [...new Set(prepaidUserIds.map((id) => id.trim()).filter(Boolean))]
            : [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "チームエントリーの更新に失敗しました");
      }

      setEntriesByClub((prev) => ({
        ...prev,
        [selectedClubId]: toDraftEntries(data.teamEntries ?? []),
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

  const handleStartPayment = async () => {
    if (!selectedClubId) {
      toast.error("クラブを選択してください");
      return;
    }
    setIsStartingPayment(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/team-billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clubId: selectedClubId }),
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
      setIsStartingPayment(false);
    }
  };

  const renderEventSection = (
    title: string,
    events: TeamEvent[],
    accent: "pool" | "ocean"
  ) => {
    if (events.length === 0) {
      return (
        <div
          className={cn(
            "rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground",
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
      <div className="space-y-4">
        {events.map((event) => {
          const eventEntries = entriesForScope.filter((entry) => entry.eventId === event.id);
          const cap =
            typeof event.maxTeamEntriesPerClub === "number" && event.maxTeamEntriesPerClub >= 1
              ? event.maxTeamEntriesPerClub
              : null;
          const atCap = cap != null && eventEntries.length >= cap;
          return (
            <div
              key={event.id}
              className={cn(
                "overflow-hidden rounded-lg border bg-card shadow-sm",
                accent === "pool"
                  ? "border-orange-200/70 dark:border-orange-900/50"
                  : "border-cyan-200/70 dark:border-cyan-900/50"
              )}
            >
              <div
                className={cn(
                  "flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                  accent === "pool"
                    ? "border-orange-100 bg-orange-50/50 dark:border-orange-900/40 dark:bg-orange-950/30"
                    : "border-cyan-100 bg-cyan-50/50 dark:border-cyan-900/40 dark:bg-cyan-950/30"
                )}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{event.name}</p>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {sexLabel(event.sex)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    登録チーム{" "}
                    <span className="tabular-nums font-medium text-foreground">
                      {eventEntries.length}
                    </span>
                    件
                    {cap != null ? (
                      <>
                        {" "}
                        <span className="text-muted-foreground/80">／</span> 同一クラブ上限{" "}
                        <span className="tabular-nums font-medium text-foreground">{cap}</span> 組
                        {atCap ? (
                          <span className="ml-1 font-medium text-amber-800 dark:text-amber-200">
                            （上限）
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => addTeam(event.id)}
                  disabled={!entryWindowOpen || atCap}
                >
                  <Plus className="h-4 w-4" />
                  チームを追加
                </Button>
              </div>

              <div className="px-4 py-4">
                {eventEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    まだチームがありません。「チームを追加」で略称（なければ正式名称）のみが入ります。2組目を追加したときに A・B…
                    が付きます。
                  </p>
                ) : (
                  <ul className="space-y-3" aria-label={`${event.name}のチーム一覧`}>
                    {eventEntries.map((entry, index) => (
                      <li
                        key={entry.id}
                        className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-end sm:gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Label htmlFor={`${entry.id}-team-name`} className="text-xs text-muted-foreground">
                            チーム名 {index + 1}
                          </Label>
                          <Input
                            id={`${entry.id}-team-name`}
                            value={entry.teamName}
                            onChange={(e) => updateTeamName(entry.id, e.target.value)}
                            placeholder={teamNamePlaceholder}
                            disabled={!entryWindowOpen}
                            className="h-10"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeTeam(entry.id)}
                          disabled={!entryWindowOpen}
                          aria-label={`チーム${index + 1}を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (scopedTeamEvents.length === 0) {
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

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b border-border bg-muted/15">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold">登録内容の編集</CardTitle>
          {hasSavedTeamEntries ? (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50/90 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100"
            >
              登録あり
            </Badge>
          ) : null}
        </div>
        {hasSavedTeamEntries ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            登録済みの一覧は上の「エントリー履歴」で確認できます。
          </p>
        ) : null}
        <CardDescription className="text-xs leading-relaxed">
          クラブを選び、種目ごとにチーム名を登録して保存してください。1組だけのときは
          <strong className="font-medium text-foreground">略称（なければ正式名称）のみ</strong>
          、2組以上は
          <strong className="font-medium text-foreground">ベース＋半角スペース＋A・B…</strong>
          になるよう「チームを追加・削除」で自動調整されます。
          {isFreeTeamEntry
            ? "チーム種目が無料の大会では、右の案内に従い保存すれば手続き完了です。"
            : "決済は右のサマリーから行います。"}
          {eventCategoryScope === "OCEAN_ONLY" ? "（オーシャン競技の大会のため、プール種目は表示しません）" : null}
          {eventCategoryScope === "POOL_ONLY" ? "（プール競技の大会のため、オーシャン種目は表示しません）" : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-4 py-5 sm:px-6">
        <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-3 text-sm text-foreground dark:bg-primary/[0.07]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 space-y-2 leading-snug text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">料金の数え方：</span>
              {isFreeTeamEntry ? (
                <>
                  この大会のチーム種目は<strong className="font-medium text-foreground">無料</strong>
                  です。登録チーム数に応じた請求は発生しません。
                </>
              ) : (
                <>
                  チーム種目ごとに、登録した<strong className="font-medium text-foreground">出場チーム1組につき1回分</strong>
                  の料金です。同じ種目に2組出す場合は、その種目は2組分の料金になります。
                </>
              )}
            </p>
            <p>
              <span className="font-medium text-foreground">お支払いの流れ：</span>
              {isFreeTeamEntry ? (
                <>
                  カード決済は不要です。内容を<strong className="font-medium text-foreground">保存</strong>
                  できれば、この画面での手続きは完了です。あとから変更する場合は、編集のうえ再度保存してください。
                </>
              ) : (
                <>
                  エントリー締切後、主催の団体管理者が大会の
                  <strong className="font-medium text-foreground">「エントリー状況」</strong>
                  画面の<strong className="font-medium text-foreground">「チーム請求」</strong>
                  で請求を確定すると、決済ボタンが使えるようになります。確定後は右の「チーム請求を支払う」から Stripe の決済ページへ進みます。
                </>
              )}
            </p>
            <p>
              <span className="font-medium text-foreground">チーム名：</span>
              種目ごとに、1組のときはベース（略称または正式名称）だけ。2組目を追加したタイミングでその種目の全組に
              A・B…（27組目以降は AA, AB…）を付け直します。1組に戻すとベースのみに戻ります。
            </p>
            {paymentQuery === "success" && (
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                決済を受け付けました。反映まで少し時間がかかる場合があります。
              </p>
            )}
            {paymentQuery === "cancel" && (
              <p className="font-medium text-amber-800 dark:text-amber-200">
                決済はキャンセルされました。必要なら再度お試しください。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <Checkbox
              id="club-prepaid-individual"
              checked={prepaidEnabled}
              onCheckedChange={(v) => {
                const on = Boolean(v);
                setPrepaidEnabled(on);
                if (!on) {
                  setPrepaidUserIds([""]);
                } else if (prepaidUserIds.length === 0 || (prepaidUserIds.length === 1 && !prepaidUserIds[0])) {
                  setPrepaidUserIds([""]);
                }
              }}
              disabled={!entryWindowOpen}
              className="mt-1"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="club-prepaid-individual" className="text-sm font-medium text-foreground">
                クラブによる個人エントリー
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {clubIndividualEntryBillingTiming === "POST_CLOSE_INVOICE" ? (
                  <>
                    指定したメンバーは<strong className="font-medium text-foreground">本人のエントリーでカード決済を省略</strong>
                    し、エントリー締切後に主催者が確定した請求でクラブがまとめて支払います（チーム参加費と合算）。
                  </>
                ) : (
                  <>
                    指定したメンバー分の個人参加費を<strong className="font-medium text-foreground">チーム請求に上乗せ</strong>
                    します。先にチーム請求を支払うと、本人は個人エントリー画面で参加費が相殺されます。
                  </>
                )}
              </p>
              {clubIndividualEntryBillingTiming === "POST_CLOSE_INVOICE" ? (
                <Badge variant="outline" className="mt-1 font-normal">
                  個人分: 締切後請求
                </Badge>
              ) : (
                <Badge variant="outline" className="mt-1 font-normal">
                  個人分: 先払い（チーム決済に含む）
                </Badge>
              )}
            </div>
          </div>

          {prepaidEnabled ? (
            prepaidMemberOptions.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                承認済みクラブメンバーがいないため、ここからは指定できません。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  対象メンバー（枠ごとに選択）
                </div>
                <ul className="space-y-2">
                  {prepaidUserIds.map((uid, idx) => (
                    <li
                      key={`prepaid-slot-${idx}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/80 p-2"
                    >
                      <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">
                        {idx + 1}
                      </span>
                      <Select
                        value={uid ? uid : "__none__"}
                        onValueChange={(v) => setPrepaidUserAt(idx, v)}
                        disabled={!entryWindowOpen}
                      >
                        <SelectTrigger className="h-9 w-[min(100%,16rem)]">
                          <SelectValue placeholder="メンバーを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">未選択</SelectItem>
                          {prepaidMemberOptions.map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive"
                        onClick={() => removePrepaidRow(idx)}
                        disabled={!entryWindowOpen}
                      >
                        削除
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={addPrepaidRow}
                  disabled={!entryWindowOpen}
                >
                  <Plus className="h-3.5 w-3.5" />
                  枠を追加
                </Button>
              </div>
            )
          ) : null}
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,340px)] lg:items-start">
          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="club-select" className="text-sm font-medium">
                対象クラブ
              </Label>
              <Select value={selectedClubId} onValueChange={setSelectedClubId}>
                <SelectTrigger id="club-select" className="h-11 w-full max-w-md">
                  <SelectValue placeholder="クラブを選択" />
                </SelectTrigger>
                <SelectContent>
                  {clubs.map((club) => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!entryWindowOpen && (
              <div
                role="status"
                className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
              >
                現在はエントリー受付期間外のため、チーム名の追加・削除・保存はできません。
              </div>
            )}

            <div className="space-y-8">
              {eventCategoryScope !== "OCEAN_ONLY" && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-orange-200/60 pb-2 dark:border-orange-900/50">
                    <Droplets className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">プール競技</h2>
                  </div>
                  {renderEventSection("プール競技", groupedEvents.POOL, "pool")}
                </section>
              )}
              {eventCategoryScope !== "POOL_ONLY" && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-cyan-200/60 pb-2 dark:border-cyan-900/50">
                    <Waves className="h-4 w-4 text-cyan-700 dark:text-cyan-400" aria-hidden />
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">オーシャン競技</h2>
                  </div>
                  {renderEventSection("オーシャン競技", groupedEvents.OCEAN, "ocean")}
                </section>
              )}
            </div>

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
                      種目ごとに「チームを追加」し、左の「チームエントリーを保存」を押すと登録が完了します。
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
                          <li>左の「チームエントリーを保存」を押して内容を確定する</li>
                          <li>保存に成功したら、この画面での手続きは完了です</li>
                        </ol>
                        <p className="text-[11px] text-emerald-900/90 dark:text-emerald-200/90">
                          あとからチーム数を変える場合は、改めて保存してください。
                        </p>
                      </div>
                    </div>
                  )}
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
                      <dt className="text-muted-foreground">想定額</dt>
                      <dd className="tabular-nums font-medium">¥{formatCurrency(estimatedFee)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                      <dt className="text-muted-foreground">参加費（請求額）</dt>
                      <dd className="tabular-nums font-semibold text-foreground">
                        ¥{formatCurrency(billingAmount)}
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
                          <dt className="font-medium text-foreground">カード決済時の合計</dt>
                          <dd className="tabular-nums text-base font-bold text-foreground">
                            ¥{formatCurrency(teamCardTotalYen)}
                          </dd>
                        </div>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          決済手数料はカード決済に伴う費用の目安です（お支払い者負担）。Stripe
                          の画面では参加費と手数料が内訳表示されます。
                        </p>
                      </>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-muted-foreground">状態</dt>
                      <dd>
                        <Badge
                          variant="outline"
                          className={cn("font-normal", paymentStatusBadgeClass(billing?.status))}
                        >
                          {getTeamPaymentStatusLabel(billing?.status)}
                        </Badge>
                      </dd>
                    </div>
                  </dl>

                  {billing?.finalizedAt && (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      請求確定: {new Date(billing.finalizedAt).toLocaleString("ja-JP")}
                    </p>
                  )}

                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    単価: 1チームあたり ¥{formatCurrency(teamEntryFeePerTeam)}
                  </p>

                  {billing?.status === "SUCCEEDED" && (
                    <p className="mt-3 rounded-md border border-emerald-200/80 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                      支払いは完了しています。追加のチームが確定した場合のみ、再請求・再決済の対象になることがあります。
                    </p>
                  )}
                  {billing?.status === "PENDING" && billing?.finalizedAt && (
                    <p className="mt-3 rounded-md border border-orange-200/80 bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100">
                      主催による請求確定済みです。下のボタンからカード決済を完了してください。
                    </p>
                  )}
                  {billing?.status === "PENDING" && !billing?.finalizedAt && entryWindowOpen && (
                    <p className="mt-3 rounded-md border border-orange-200/80 bg-orange-50 px-2.5 py-2 text-xs text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100">
                      エントリー期間中です。登録を保存したうえで、いつでも下のボタンから決済できます。
                    </p>
                  )}
                  {(billing?.status === "FAILED" || billing?.status === "EXPIRED") && (
                    <p className="mt-3 rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                      前回の決済は完了していません。もう一度お試しください。
                    </p>
                  )}

                  {billing?.status !== "SUCCEEDED" && (
                    <div className="mt-4">
                      <Button
                        type="button"
                        className="h-10 w-full gap-2 font-semibold"
                        onClick={handleStartPayment}
                        disabled={!canStartPayment || isStartingPayment}
                      >
                        <CreditCard className="h-4 w-4" />
                        {isStartingPayment ? "決済へ移動中…" : "チーム請求を支払う"}
                      </Button>
                      {!canStartPayment && (
                        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                          {entryWindowOpen
                            ? "チームエントリーを保存し、請求額が0円より大きいときに決済できます。"
                            : "締切後は主催の請求確定後に決済できます。"}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}
