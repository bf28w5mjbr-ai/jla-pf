import type { ReactNode } from "react";
import {
  parseAgeQualificationTiers,
  parseUnderQualificationTiers,
  unionRequiredQualifications,
} from "@/lib/competitionEntryAgeTiered";

export function renderRequiredQualificationsSummary(
  requiredQualifications: unknown
): ReactNode {
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
}

export function renderParticipantEligibilitySummary(
  value: string | null | undefined
): ReactNode {
  if (!value || value.trim().length === 0) {
    return <p className="text-sm font-medium">制限なし</p>;
  }
  return <p className="whitespace-pre-wrap text-sm font-medium">{value}</p>;
}

export function renderAgeClubSummaryFromFields(fields: {
  minAge?: number | null;
  maxAge?: number | null;
  requireClubMembership?: boolean | null;
}): ReactNode {
  const min = fields.minAge;
  const max = fields.maxAge;
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
      {fields.requireClubMembership ? "所属クラブ必須" : "所属クラブ任意"}
      <span className="mx-1.5 text-muted-foreground">·</span>
      {ageLabel}
    </p>
  );
}
