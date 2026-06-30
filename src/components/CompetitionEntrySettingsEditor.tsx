"use client";

import type { ComponentProps, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EntrySettingsEditor, { type EntrySettingsFocusSection } from "@/components/EntrySettingsEditor";
import {
  settingsFlatBlockTitleClassName,
  settingsFlatDivide,
  settingsFlatFieldGroup,
  settingsFlatHint,
  settingsFlatSectionLabel,
} from "@/components/competitions/management/competitionSettingsFlatUi";
import { cn } from "@/lib/utils";
import { User, UsersRound } from "lucide-react";
import {
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
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
  qualificationTemplates?: EntrySettingsEditorProps["qualificationTemplates"];
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
  qualificationTemplates,
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


    const catTiers = parseAgeCategoryFeeTiers(entryFee as unknown);
    if (catTiers?.length && initialAgeCategories?.length) {
      const nameById = new Map(initialAgeCategories.map((c) => [c.id, c.name]));
      return (
        <div className="space-y-1 text-sm">
          <p className="text-[10px] font-medium text-muted-foreground">AGEカテゴリ別</p>
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
          <p className="text-[10px] font-medium text-muted-foreground">年齢帯別（移行待ち）</p>
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
              className="rounded-md bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
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
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <p className={settingsFlatSectionLabel}>{SECTION_LABEL[section]}</p>
        <div className="min-w-0">{body}</div>
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
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
        <div className="sticky top-[max(0.25rem,var(--safe-area-top,0px))] z-20 -mx-4 flex flex-col gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-5 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
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
          qualificationTemplates={qualificationTemplates}
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

  return (
    <section className="py-4">
      <h2 className={settingsFlatBlockTitleClassName()}>エントリー設定</h2>
      <p className={cn(settingsFlatHint, "mt-0.5")}>
        エントリー期間・種目・参加費などを設定します。
      </p>

      <div className={cn("mt-3", settingsFlatFieldGroup, settingsFlatDivide)}>
          {row(
            "events",
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <User className="h-3 w-3 text-foreground/50" aria-hidden />
                  個人 {individualEventCount}件
                </span>
                <span className="text-border/80" aria-hidden>
                  |
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <UsersRound className="h-3 w-3 text-foreground/50" aria-hidden />
                  チーム {teamEventCount}件
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">{renderEventChips()}</div>
              <div className="pt-0.5">
                <p className={settingsFlatSectionLabel}>参加費</p>
                <div className="mt-1">{renderEntryFee(initialData.entryFee)}</div>
              </div>
            </div>
          )}
          {row(
            "multiEvent",
            <p className="text-xs font-medium">
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
    </section>
  );
}
