import type { ReactNode } from "react";
import type { CompetitionPublicOverviewDetail } from "@/lib/competitionPublicPageLoader";
import {
  CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP,
  parseAgeCategoryFeeTiers,
  parseAgeFeeTiers,
  requiredQualificationsMentionCertifiedLifesaver,
} from "@/lib/competitionEntryAgeTiered";
import { renderRequiredQualificationsSummary } from "@/lib/competitionParticipationSummaries";

const formatCurrency = (value: number) => new Intl.NumberFormat("ja-JP").format(value);

export function renderEntryFeeForCategories(
  entryFee: unknown,
  ageCategories: CompetitionPublicOverviewDetail["ageCategories"],
  opts: { hasIndividualEvents: boolean; hasTeamEvents: boolean }
): ReactNode {
  const { hasIndividualEvents, hasTeamEvents } = opts;
  if (entryFee === null || entryFee === undefined) {
    return null;
  }

  if (typeof entryFee === "number") {
    if (!hasIndividualEvents && !hasTeamEvents) return null;
    if (hasIndividualEvents && hasTeamEvents) {
      return <p className="text-sm font-medium">¥{formatCurrency(entryFee)}</p>;
    }
    if (hasIndividualEvents) {
      return <p className="text-sm font-medium">個人: ¥{formatCurrency(entryFee)}</p>;
    }
    return (
      <p className="text-sm font-medium">チーム（1チーム）: ¥{formatCurrency(entryFee)}</p>
    );
  }

  if (typeof entryFee !== "object") {
    return <p className="text-sm font-medium">未設定</p>;
  }

  const feeCatTiers = parseAgeCategoryFeeTiers(entryFee);
  if (feeCatTiers?.length && ageCategories?.length) {
    const nameById = new Map(ageCategories.map((c) => [c.id, c.name]));
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          年齢カテゴリ別（生年月日の区分）
        </p>
        {feeCatTiers.map((t, i) => (
          <p key={i} className="text-sm font-medium leading-snug">
            {nameById.get(t.ageCategoryId) ?? "区分"}
            {hasIndividualEvents ? <> · 個人 ¥{formatCurrency(t.individualEntryFee)}</> : null}
            {hasTeamEvents ? <> · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}</> : null}
          </p>
        ))}
      </div>
    );
  }

  const feeTiers = parseAgeFeeTiers(entryFee);
  if (feeTiers?.length) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          年齢帯別（開催日時点の満年齢）
        </p>
        {feeTiers.map((t, i) => (
          <p key={i} className="text-sm font-medium leading-snug">
            {t.minAge}歳〜{t.maxAge == null ? "上限なし" : `${t.maxAge}歳`}
            {hasIndividualEvents ? <> · 個人 ¥{formatCurrency(t.individualEntryFee)}</> : null}
            {hasTeamEvents ? <> · チーム（1）¥{formatCurrency(t.teamEntryFeePerTeam)}</> : null}
          </p>
        ))}
      </div>
    );
  }

  const fee = entryFee as {
    individualEntryFee?: number;
    teamEntryFeePerTeam?: number;
    baseFee?: number;
  };
  const individualFee = fee.individualEntryFee ?? fee.baseFee;
  const teamFee = fee.teamEntryFeePerTeam;

  const showIndividual = hasIndividualEvents && typeof individualFee === "number";
  const showTeam = hasTeamEvents && typeof teamFee === "number";

  if (!showIndividual && !showTeam) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {showIndividual ? (
        <p className="text-sm font-medium">個人: ¥{formatCurrency(individualFee)}</p>
      ) : null}
      {showTeam ? (
        <p className="text-xs text-muted-foreground">チーム（1チーム）: ¥{formatCurrency(teamFee)}</p>
      ) : null}
    </div>
  );
}

export function renderRequiredQualifications(
  requiredQualifications: unknown,
  ageCategories: CompetitionPublicOverviewDetail["ageCategories"]
) {
  return renderRequiredQualificationsSummary(requiredQualifications, ageCategories);
}

export function renderParticipantEligibility(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return <p className="text-sm font-medium">制限なし</p>;
  }

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>;
}

export function showCertifiedLifesaverHelp(requiredQualifications: unknown) {
  return requiredQualificationsMentionCertifiedLifesaver(requiredQualifications) ? (
    <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
      {CERTIFIED_LIFESAVER_ENTRY_REQUIREMENT_HELP}
    </p>
  ) : null;
}
