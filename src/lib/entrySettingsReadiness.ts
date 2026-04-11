export type EntryFeeShape = {
  individualEntryFee?: number;
  teamEntryFeePerTeam?: number;
  baseFee?: number;
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
};

function feeNumbers(entryFee: EntryFeeShape | null | undefined) {
  const individualNum =
    typeof entryFee?.individualEntryFee === "number"
      ? entryFee.individualEntryFee
      : typeof entryFee?.baseFee === "number"
        ? entryFee.baseFee
        : null;
  const teamNum =
    typeof entryFee?.teamEntryFeePerTeam === "number"
      ? entryFee.teamEntryFeePerTeam
      : null;
  return { individualNum, teamNum };
}

/**
 * エントリー設定の「公開前チェック」用。未完了（ok: false）を先に並べる。
 */
export function buildEntrySettingsReadinessItems(
  a: BuildArgs
): EntrySettingsReadinessItem[] {
  const hasIndividualEvents = a.individualEventCount > 0;
  const hasTeamEvents = a.teamEventCount > 0;
  const { individualNum, teamNum } = feeNumbers(a.entryFee);

  const periodOk = Boolean(a.entryStartDate && a.entryEndDate);
  const eventsOk = a.eventsCount > 0;

  const individualFeeOk =
    !hasIndividualEvents ||
    (individualNum !== null && !Number.isNaN(individualNum) && individualNum >= 0);
  const teamFeeOk =
    !hasTeamEvents ||
    (teamNum !== null && !Number.isNaN(teamNum) && teamNum >= 0);

  const feesOk = individualFeeOk && teamFeeOk;

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
      ? [
          !individualFeeOk && hasIndividualEvents ? "個人エントリー料金" : null,
          !teamFeeOk && hasTeamEvents ? "チーム（1チームあたり）料金" : null,
        ]
          .filter(Boolean)
          .join("・") + "を設定してください"
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
