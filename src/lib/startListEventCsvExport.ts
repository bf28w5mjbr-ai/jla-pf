import type {
  StartListEventRoundDisplay,
  StartListEventRoundDisplayRow,
} from "@/lib/startListEventTabDisplay";
import type {
  StartListIndividualDisplayItem,
  StartListTeamDisplayItem,
} from "@/lib/startListHeatPlacement";

const INDIVIDUAL_CSV_HEADERS = [
  "ラウンド",
  "ヒート",
  "枠",
  "氏名",
  "所属クラブ",
  "entryId",
] as const;

const TEAM_CSV_HEADERS = [
  "ラウンド",
  "ヒート",
  "枠",
  "チーム名",
  "所属クラブ",
  "メンバー",
  "teamEntryId",
] as const;

export function buildStartListEventCsvHeaders(isTeam: boolean): readonly string[] {
  return isTeam ? TEAM_CSV_HEADERS : INDIVIDUAL_CSV_HEADERS;
}

function isNonEmptyIndividual(p: StartListIndividualDisplayItem): boolean {
  return Boolean(p.name.trim() || p.entryId.trim());
}

function isNonEmptyTeam(p: StartListTeamDisplayItem): boolean {
  return Boolean(p.teamName.trim() || p.teamEntryId.trim());
}

function flattenRoundRowToCsvRows(
  row: StartListEventRoundDisplayRow,
  isTeam: boolean
): string[][] {
  const roundLabel = row.tab.label.trim() || "ラウンド";
  const heats = isTeam ? row.teamHeats : row.individualHeats;
  const out: string[][] = [];

  heats.forEach((participants, heatIdx) => {
    const heatNo = String(row.marshalDisplayHeatIndices[heatIdx] ?? heatIdx + 1);
    participants.forEach((p, laneIdx) => {
      const lane = String(laneIdx + 1);
      if (isTeam) {
        const team = p as StartListTeamDisplayItem;
        if (!isNonEmptyTeam(team)) return;
        out.push([
          roundLabel,
          heatNo,
          lane,
          team.teamName,
          team.clubName ?? "",
          team.members.join(" / "),
          team.teamEntryId,
        ]);
      } else {
        const individual = p as StartListIndividualDisplayItem;
        if (!isNonEmptyIndividual(individual)) return;
        out.push([
          roundLabel,
          heatNo,
          lane,
          individual.name,
          individual.clubName ?? "",
          individual.entryId,
        ]);
      }
    });
  });

  return out;
}

export function flattenStartListEventRoundDisplayToCsvRows(
  roundDisplay: StartListEventRoundDisplay,
  isTeam: boolean
): string[][] {
  const rows: string[][] = [];
  for (const row of roundDisplay.rows) {
    if (row.displaySource !== "snapshotHeat" && row.displaySource !== "snapshotResult") {
      continue;
    }
    rows.push(...flattenRoundRowToCsvRows(row, isTeam));
  }
  return rows;
}
