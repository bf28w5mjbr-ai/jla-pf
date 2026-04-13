import { entryFeeReadinessOk } from "@/lib/competitionEntryAgeTiered";
import { partitionUnderBandsForCompetition } from "@/lib/competitionUnderAgeSettings";
import type { Competition } from "@prisma/client";

export type EntryFeeShape = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
  ageFeeTiers?: unknown;
};

export type EntrySettingsReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
};

type BuildArgs = {
  entryStartDate: Date | null;
  entryEndDate: Date | null;
  eventsCount: number;
  individualEventCount: number;
  teamEventCount: number;
  entryFee: EntryFeeShape | null | undefined;
  /** アンダー別料金の検証用（大会行の列から算出） */
  competitionForUnderFee?: Pick<
    Competition,
    "underAgeSystemEnabled" | "underAgeUThresholds" | "underAgeOpenEnabled"
  > | null;
};

/**
 * エントリー設定の「公開前チェック」用。未完了（ok: false）を先に並べる。
 */
export function buildEntrySettingsReadinessItems(
  a: BuildArgs
): EntrySettingsReadinessItem[] {
  const hasIndividualEvents = a.individualEventCount > 0;
  const hasTeamEvents = a.teamEventCount > 0;
  const underPart = a.competitionForUnderFee
    ? partitionUnderBandsForCompetition(a.competitionForUnderFee)
    : null;
  const feesOk = entryFeeReadinessOk(a.entryFee, hasIndividualEvents, hasTeamEvents, {
    underFeePartition: underPart ?? null,
  });

  const periodOk = Boolean(a.entryStartDate && a.entryEndDate);
  const eventsOk = a.eventsCount > 0;

  const periodItem: EntrySettingsReadinessItem = {
    id: "period",
    label: "エントリー期間",
    ok: periodOk,
    hint: !periodOk ? "開始・終了の両方を設定してください" : undefined,
  };

  const eventsItem: EntrySettingsReadinessItem = {
    id: "events",
    label: "種目",
    ok: eventsOk,
    hint: !eventsOk ? "少なくとも1種目を登録してください" : undefined,
  };

  const feesItem: EntrySettingsReadinessItem = {
    id: "fees",
    label: "参加費",
    ok: feesOk,
    hint: !feesOk
      ? "一律・年齢帯別・年齢カテゴリ別のいずれかで、個人・チームの参加費を設定してください"
      : undefined,
  };

  const items =
    a.eventsCount > 0
      ? [periodItem, eventsItem, feesItem]
      : [periodItem, eventsItem];
  const incomplete = items.filter((i) => !i.ok);
  const complete = items.filter((i) => i.ok);
  return [...incomplete, ...complete];
}
