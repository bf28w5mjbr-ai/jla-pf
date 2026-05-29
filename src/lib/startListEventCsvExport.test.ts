import { describe, expect, it } from "vitest";
import type { StartListRoundData } from "@/lib/startListRounds";
import { buildStartListEventRoundDisplay } from "@/lib/startListEventTabDisplay";
import {
  buildStartListEventCsvHeaders,
  flattenStartListEventRoundDisplayToCsvRows,
} from "@/lib/startListEventCsvExport";

describe("startListEventCsvExport", () => {
  const individuals = Array.from({ length: 8 }, (_, i) => ({
    entryId: `e${i}`,
    userId: `u${i}`,
    name: `P${i}`,
    clubId: null as string | null,
    clubName: i % 2 === 0 ? `Club${i}` : null,
  }));

  it("buildStartListEventCsvHeaders returns individual columns", () => {
    expect(buildStartListEventCsvHeaders(false)).toEqual([
      "ラウンド",
      "ヒート",
      "枠",
      "氏名",
      "所属クラブ",
      "entryId",
    ]);
  });

  it("buildStartListEventCsvHeaders returns team columns", () => {
    expect(buildStartListEventCsvHeaders(true)[3]).toBe("チーム名");
    expect(buildStartListEventCsvHeaders(true)).toContain("teamEntryId");
  });

  it("liveEntry / previewStructure の ops 行は CSV に含めない", () => {
    const roundDisplay = buildStartListEventRoundDisplay({
      eventId: "ev1",
      initialSettings: {
        events: {
          ev1: {
            roundTabs: [
              { id: "h", label: "予選", mode: "count", heatCount: "2", heatSize: "" },
              { id: "f", label: "決勝", mode: "count", heatCount: "1", heatSize: "" },
            ],
          },
        },
      },
      startListRoundCount: 2,
      configuredStartListRoundCount: 2,
      entryCount: 8,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 4,
      placementSeed: 42,
      mode: "ops",
    });

    expect(roundDisplay.rows.some((r) => r.displaySource === "previewStructure")).toBe(true);
    expect(flattenStartListEventRoundDisplayToCsvRows(roundDisplay, false)).toEqual([]);
  });

  it("snapshotHeat / snapshotResult の凍結行だけ CSV に出力する", () => {
    const frozenHeat: StartListRoundData = {
      round: "HEAT",
      generatedAt: "2020-01-01T00:00:00.000Z",
      generatedBy: "ENTRY_CLOSE",
      heats: [
        {
          heatIndex: 1,
          participants: individuals.slice(0, 4).map((p) => ({
            kind: "INDIVIDUAL" as const,
            entryId: p.entryId,
            userId: p.userId,
            name: p.name,
            clubId: p.clubId,
            clubName: p.clubName,
          })),
        },
        {
          heatIndex: 2,
          participants: individuals.slice(4, 8).map((p) => ({
            kind: "INDIVIDUAL" as const,
            entryId: p.entryId,
            userId: p.userId,
            name: p.name,
            clubId: p.clubId,
            clubName: p.clubName,
          })),
        },
      ],
    };
    const roundDisplay = buildStartListEventRoundDisplay({
      eventId: "ev1",
      initialSettings: {
        events: {
          ev1: {
            roundTabs: [
              { id: "h", label: "予選", mode: "count", heatCount: "2", heatSize: "" },
              { id: "f", label: "決勝", mode: "count", heatCount: "1", heatSize: "" },
            ],
          },
        },
      },
      startListRoundCount: 2,
      configuredStartListRoundCount: 2,
      entryCount: 8,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 4,
      placementSeed: 42,
      frozenSnapshotRounds: [frozenHeat],
      heatPlanConfirmedAtIso: "2020-01-01T00:00:00.000Z",
      mode: "ops",
    });

    const rows = flattenStartListEventRoundDisplayToCsvRows(roundDisplay, false);
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r[0] === "予選")).toHaveLength(8);
    expect(rows.filter((r) => r[0] === "決勝")).toHaveLength(0);
    expect(rows.every((r) => r.length === 6)).toBe(true);
    expect(rows[0]?.[3]).toBeTruthy();
    expect(rows[0]?.[5]).toMatch(/^e\d+$/);
  });

  it("skips empty placeholder participants", () => {
    const roundDisplay = buildStartListEventRoundDisplay({
      eventId: "ev1",
      initialSettings: {
        events: {
          ev1: {
            roundTabs: [{ id: "h", label: "予選", mode: "count", heatCount: "1", heatSize: "" }],
          },
        },
      },
      startListRoundCount: 1,
      configuredStartListRoundCount: 1,
      entryCount: 0,
      individuals: [],
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 4,
      placementSeed: 1,
      mode: "ops",
    });
    expect(flattenStartListEventRoundDisplayToCsvRows(roundDisplay, false)).toEqual([]);
  });

  it("flattenStartListEventRoundDisplayToCsvRows includes team members for team events", () => {
    const teams = [
      {
        teamEntryId: "t1",
        teamName: "Team A",
        clubId: "c1",
        clubName: "Club A",
        members: ["Alice", "Bob"],
      },
    ];
    const frozenHeat: StartListRoundData = {
      round: "HEAT",
      generatedAt: "2020-01-01T00:00:00.000Z",
      generatedBy: "ENTRY_CLOSE",
      heats: [
        {
          heatIndex: 1,
          participants: [
            {
              kind: "TEAM" as const,
              teamEntryId: "t1",
              teamName: "Team A",
              clubId: "c1",
              clubName: "Club A",
              members: ["Alice", "Bob"],
            },
          ],
        },
      ],
    };
    const roundDisplay = buildStartListEventRoundDisplay({
      eventId: "ev1",
      initialSettings: {
        events: {
          ev1: {
            roundTabs: [{ id: "h", label: "予選", mode: "count", heatCount: "1", heatSize: "" }],
          },
        },
      },
      startListRoundCount: 1,
      configuredStartListRoundCount: 1,
      entryCount: 1,
      individuals: [],
      teams,
      isTeam: true,
      preliminaryHeatLaneCount: 4,
      placementSeed: 99,
      frozenSnapshotRounds: [frozenHeat],
      heatPlanConfirmedAtIso: "2020-01-01T00:00:00.000Z",
      mode: "ops",
    });
    const rows = flattenStartListEventRoundDisplayToCsvRows(roundDisplay, true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[0]).toBe(roundDisplay.rows[0]?.tab.label);
    expect(rows[0]?.[3]).toBe("Team A");
    expect(rows[0]?.[5]).toBe("Alice / Bob");
    expect(rows[0]?.[6]).toBe("t1");
  });
});
