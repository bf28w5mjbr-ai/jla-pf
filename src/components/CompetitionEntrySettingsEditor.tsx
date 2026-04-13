"use client";

import type { ComponentProps, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EntrySettingsEditor, { type EntrySettingsFocusSection } from "@/components/EntrySettingsEditor";
import CopyEntrySettingsFromCompetition, {
  type SiblingCompetitionOption,
} from "@/components/CopyEntrySettingsFromCompetition";
import { buildEntrySettingsReadinessItems } from "@/lib/entrySettingsReadiness";
import { formatCompetitionEntryPeriodRangeJa } from "@/lib/datetimeLocal";
import { cn } from "@/lib/utils";
import { User, UsersRound } from "lucide-react";
import {
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
  parseAgeQualificationTiers,
  parseUnderFeeTiers,
  parseUnderQualificationTiers,
  unionRequiredQualifications,
} from "@/lib/competitionEntryAgeTiered";

type EntrySettingsEditorProps = ComponentProps<typeof EntrySettingsEditor>;
type EntryEventRow = NonNullable<EntrySettingsEditorProps["initialEvents"]>[number];

type Props = {
  competitionId: string;
  canEdit: boolean;
  isPublished: boolean;
  /** 公開済みかつエントリー成立後は告知文を自動付与する */
  requiresParticipantNotice: boolean;
  /** router.refresh 後にフォームをリセットするためのキー */
  settingsVersion: string;
  initialData: EntrySettingsEditorProps["initialData"];
  initialEvents: NonNullable<EntrySettingsEditorProps["initialEvents"]>;
  initialAgeCategories?: EntrySettingsEditorProps["initialAgeCategories"];
  /** 種目・参加費コピー用（同一団体内の他大会） */
  siblingCompetitionsForCopy?: SiblingCompetitionOption[];
  /** エントリー0件のときのみコピー可 */
  copyEntrySettingsAllowed: boolean;
  copyEntrySettingsBlockedReason?: string | null;
};

const SECTION_LABEL: Record<EntrySettingsFocusSection, string> = {
  period: "エントリー期間",
  qualifications: "参加資格",
  eligibility: "参加対象者",
  ageClub: "年齢・所属クラブ",
  multiEvent: "種目あたりのエントリー",
  events: "種目・参加費",
  pledge: "エントリー時の誓約",
};

export default function CompetitionEntrySettingsEditor(props: Props) {
  return <CompetitionEntrySettingsEditorInner key={props.settingsVersion} {...props} />;
}

function CompetitionEntrySettingsEditorInner({
  competitionId,
  canEdit,
  isPublished,
  requiresParticipantNotice,
  settingsVersion,
  initialData,
  initialEvents,
  initialAgeCategories,
  siblingCompetitionsForCopy = [],
  copyEntrySettingsAllowed,
  copyEntrySettingsBlockedReason = null,
}: Props) {
  const router = useRouter();
  const [editingSection, setEditingSection] = useState<EntrySettingsFocusSection | null>(null);
  const [overviewEvents, setOverviewEvents] = useState<EntryEventRow[]>(initialEvents);

  const individualEventCount = useMemo(
    () => overviewEvents.filter((e) => e.type === "INDIVIDUAL").length,
    [overviewEvents]
  );
  const teamEventCount = useMemo(
    () => overviewEvents.filter((e) => e.type === "TEAM").length,
    [overviewEvents]
  );

  const readinessItems = useMemo(
    () =>
      buildEntrySettingsReadinessItems({
        entryStartDate: initialData.entryStartDate,
        entryEndDate: initialData.entryEndDate,
        eventsCount: overviewEvents.length,
        individualEventCount,
        teamEventCount,
        entryFee: initialData.entryFee,
        competitionForUnderFee: {
          underAgeSystemEnabled: initialData.underAgeSystemEnabled ?? false,
          underAgeUThresholds: initialData.underAgeUThresholds ?? [],
          underAgeOpenEnabled: initialData.underAgeOpenEnabled ?? true,
        },
      }),
    [
      initialData.entryEndDate,
      initialData.entryFee,
      initialData.entryStartDate,
      initialData.underAgeOpenEnabled,
      initialData.underAgeSystemEnabled,
      initialData.underAgeUThresholds,
      individualEventCount,
      overviewEvents.length,
      teamEventCount,
    ]
  );

  const formatEntryPeriodSummary = (start: Date | null, end: Date | null) =>
    formatCompetitionEntryPeriodRangeJa(start, end) ?? "未設定";

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ja-JP").format(value);
  };

  const hasTeamEvents = teamEventCount > 0;
  const hasIndividualEvents = individualEventCount > 0;

  const renderEntryFee = (
    entryFee: EntrySettingsEditorProps["initialData"]["entryFee"]
  ) => {
    if (!entryFee) {
      return <p className="font-medium">未設定</p>;
    }

    const underFee = parseUnderFeeTiers(entryFee as unknown);
    if (underFee?.length) {
      return (
        <div className="space-y-1 text-sm">
          <p className="text-[10px] font-medium text-muted-foreground">アンダー区分別</p>
          {underFee.map((t, i) => (
            <p key={i} className="font-medium leading-snug">
              {t.tierKey}
              {hasIndividualEvents ? <> · 個人 ¥{formatCurrency(t.individualEntryFee)}</> : null}
              {hasTeamEvents ? <> · チーム ¥{formatCurrency(t.teamEntryFeePerTeam)}</> : null}
            </p>
          ))}
        </div>
      );
    }

    const catTiers = parseAgeCategoryFeeTiers(entryFee as unknown);
    if (catTiers?.length && initialAgeCategories?.length) {
      const nameById = new Map(initialAgeCategories.map((c) => [c.id, c.name]));
      return (
        <div className="space-y-1 text-sm">
          <p className="text-[10px] font-medium text-muted-foreground">年齢カテゴリ別</p>
          {catTiers.map((t, i) => (
            <p key={i} className="font-medium leading-snug">
              {nameById.get(t.ageCategoryId) ?? "区分"}
              {hasIndividualEvents ? <> · 個人 ¥{formatCurrency(t.individualEntryFee)}</> : null}
              {hasTeamEvents ? <> · チーム ¥{formatCurrency(t.teamEntryFeePerTeam)}</> : null}
            </p>
          ))}
        </div>
      );
    }

    const tiers = parseAgeFeeTiers(entryFee as unknown);
    if (tiers?.length) {
      return (
        <div className="space-y-1 text-sm">
          <p className="text-[10px] font-medium text-muted-foreground">年齢帯別</p>
          {tiers.map((t, i) => (
            <p key={i} className="font-medium leading-snug">
              {t.minAge}〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
              {hasIndividualEvents ? <> · 個人 ¥{formatCurrency(t.individualEntryFee)}</> : null}
              {hasTeamEvents ? <> · チーム ¥{formatCurrency(t.teamEntryFeePerTeam)}</> : null}
            </p>
          ))}
        </div>
      );
    }

    const individualFee = entryFee.individualEntryFee ?? entryFee.baseFee;
    const teamFee = entryFee.teamEntryFeePerTeam;

    const showIndividual = hasIndividualEvents && typeof individualFee === "number";
    const showTeam = hasTeamEvents && typeof teamFee === "number";

    if (!showIndividual && !showTeam) {
      return <p className="font-medium text-muted-foreground">種目登録後に設定します</p>;
    }

    return (
      <div className="space-y-0.5 text-sm">
        {showIndividual ? (
          <p className="font-medium">個人: ¥{formatCurrency(individualFee)}</p>
        ) : null}
        {showTeam ? (
          <p className="text-xs text-muted-foreground">
            チーム（1チーム）: ¥{formatCurrency(teamFee)}
          </p>
        ) : null}
      </div>
    );
  };

  const renderRequiredQualifications = (requiredQualifications: unknown) => {
    const underQ = parseUnderQualificationTiers(requiredQualifications);
    if (underQ?.length) {
      return (
        <div className="space-y-1.5 text-sm">
          <p className="text-[10px] font-medium text-muted-foreground">アンダー区分別</p>
          {underQ.map((t, i) => (
            <p key={i} className="text-xs leading-snug">
              <span className="font-medium">{t.tierKey}</span>
              {t.requiredQualifications.length > 0
                ? ` · ${t.requiredQualifications.join("、")}`
                : " · 資格不要"}
            </p>
          ))}
        </div>
      );
    }
    const tiered = parseAgeQualificationTiers(requiredQualifications);
    if (tiered?.length) {
      return (
        <div className="space-y-1.5 text-sm">
          <p className="text-[10px] font-medium text-muted-foreground">年齢帯別</p>
          {tiered.map((t, i) => (
            <p key={i} className="text-xs leading-snug">
              <span className="font-medium">
                {t.minAge}〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
              </span>
              {t.requiredQualifications.length > 0
                ? ` · ${t.requiredQualifications.join("、")}`
                : " · 資格不要"}
            </p>
          ))}
        </div>
      );
    }
    const flat = unionRequiredQualifications(requiredQualifications);
    if (flat.length === 0) {
      return <p className="font-medium">資格不要</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {flat.map((item) => (
          <span
            key={item}
            className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    );
  };

  const renderParticipantEligibility = (value: string | null | undefined) => {
    if (!value || value.trim().length === 0) {
      return <p className="text-sm font-medium">制限なし</p>;
    }
    return <p className="whitespace-pre-wrap text-sm font-medium">{value}</p>;
  };

  const renderAgeClubSummary = () => {
    const min = initialData.minAge;
    const max = initialData.maxAge;
    const ageLabel =
      min != null && max != null
        ? `${min}歳以上（含）〜${max}歳以下（含）`
        : min != null
          ? `${min}歳以上（その歳を含む）`
          : max != null
            ? `${max}歳以下（その歳を含む）`
            : "年齢制限なし";
    return (
      <p className="text-sm font-medium leading-snug">
        {initialData.requireClubMembership ? "所属クラブ必須" : "所属クラブ任意"}
        <span className="mx-1.5 text-muted-foreground">·</span>
        {ageLabel}
      </p>
    );
  };

  const renderEventChips = () => {
    if (!overviewEvents || overviewEvents.length === 0) {
      return <p className="text-sm text-muted-foreground">未登録</p>;
    }

    const getSexLabel = (sex: string) => {
      if (sex === "MALE") return "男子";
      if (sex === "FEMALE") return "女子";
      return "男女";
    };

    return (
      <div className="flex flex-wrap gap-2">
        {overviewEvents
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((event, index) => (
            <span
              key={`${event.name}-${event.sex}-${index}`}
              className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
            >
              {event.name}
              <span className="ml-1 text-[10px] text-muted-foreground">
                （{getSexLabel(event.sex)}）
              </span>
            </span>
          ))}
      </div>
    );
  };

  const row = (section: EntrySettingsFocusSection, body: ReactNode) => (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{SECTION_LABEL[section]}</p>
        <div className="min-w-0">{body}</div>
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 text-xs sm:min-w-[5rem]"
          onClick={() => setEditingSection(section)}
        >
          編集
        </Button>
      ) : null}
    </div>
  );

  if (editingSection) {
    const backToList = () => {
      setEditingSection(null);
      router.refresh();
    };
    return (
      <div className="space-y-4">
        <div className="sticky top-[max(0.25rem,var(--safe-area-top,0px))] z-20 flex flex-col gap-2 rounded-lg border border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold">{SECTION_LABEL[editingSection]}</p>
            <p className="text-xs text-muted-foreground">保存で一覧に戻ります。</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 text-xs sm:min-w-[8rem]"
            onClick={backToList}
          >
            一覧に戻る
          </Button>
        </div>
        <EntrySettingsEditor
          key={`${settingsVersion}-${editingSection}`}
          competitionId={competitionId}
          focusSection={editingSection}
          requiresParticipantNotice={requiresParticipantNotice}
          isPublished={isPublished}
          initialData={initialData}
          initialEvents={overviewEvents}
          initialAgeCategories={initialAgeCategories}
          canEdit={canEdit}
          onSuccessfulSectionSave={() => setEditingSection(null)}
          onEventsChange={setOverviewEvents}
        />
        <div className="flex justify-center border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={backToList}
          >
            保存せず一覧に戻る
          </Button>
        </div>
      </div>
    );
  }

  const incompleteCount = readinessItems.filter((i) => !i.ok).length;

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <CardTitle className="text-base font-semibold">エントリー設定</CardTitle>
        <CardDescription className="text-sm">
          まず期間と種目・参加費を整え、そのあと資格や誓約を設定するのがおすすめです。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-4 py-4 sm:px-5">
        <section aria-labelledby="entry-settings-readiness-heading" className="rounded-lg border border-border bg-muted/20 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="entry-settings-readiness-heading" className="text-sm font-medium text-foreground">
              公開前の確認
            </h3>
            {incompleteCount > 0 ? (
              <span className="text-xs text-amber-800 dark:text-amber-200">あと {incompleteCount} 件</span>
            ) : (
              <span className="text-xs text-muted-foreground">不足なし</span>
            )}
          </div>
          <ul className="mt-2 space-y-2 text-sm" role="list">
            {readinessItems.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex gap-2 border-l-2 pl-3",
                  item.ok ? "border-transparent text-muted-foreground" : "border-amber-500 text-foreground"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.label}</span>
                  {!item.ok && item.hint ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <CopyEntrySettingsFromCompetition
          competitionId={competitionId}
          siblings={siblingCompetitionsForCopy}
          canCopy={copyEntrySettingsAllowed}
          blockedReason={copyEntrySettingsBlockedReason}
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">各項目</p>
          {row(
            "period",
            <p className="text-sm font-medium leading-snug">
              {formatEntryPeriodSummary(initialData.entryStartDate, initialData.entryEndDate)}
            </p>
          )}
          {row(
            "events",
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <User className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                  個人 {individualEventCount}件
                </span>
                <span className="text-border" aria-hidden>
                  |
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <UsersRound className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                  チーム {teamEventCount}件
                </span>
              </div>
              <div className="flex flex-wrap gap-2">{renderEventChips()}</div>
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-foreground">参加費</p>
                <div className="mt-1.5">{renderEntryFee(initialData.entryFee)}</div>
              </div>
            </div>
          )}
          {row("qualifications", renderRequiredQualifications(initialData.requiredQualifications))}
          {row("eligibility", renderParticipantEligibility(initialData.participantEligibilityText))}
          {row("ageClub", renderAgeClubSummary())}
          {row(
            "multiEvent",
            <p className="text-sm font-medium">
              {initialData.allowMultipleEventEntries
                ? initialData.maxEventEntriesPerPerson
                  ? `${initialData.maxEventEntriesPerPerson}種目まで`
                  : "複数種目OK（上限なし）"
                : "1種目のみ"}
            </p>
          )}
          {row(
            "pledge",
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={initialData.entryPledgeEnabled ? "default" : "secondary"}
                className="font-normal"
              >
                {initialData.entryPledgeEnabled ? "表示オン" : "表示オフ"}
              </Badge>
              {initialData.entryPledgeLockNoOffer && !initialData.entryPledgeEnabled ? (
                <span className="text-[11px] text-amber-800 dark:text-amber-200">
                  追加不可（初回公開時オフ）
                </span>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
