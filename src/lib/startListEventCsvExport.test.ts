import { describe, expect, it } from "vitest";
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

  it("flattenStartListEventRoundDisplayToCsvRows emits one row per slot across ops rounds", () => {
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

    const rows = flattenStartListEventRoundDisplayToCsvRows(roundDisplay, false);
    const expectedCount = roundDisplay.rows.reduce(
      (sum, row) =>
        sum +
        row.individualHeats.reduce(
          (heatSum, heat) => heatSum + heat.filter((p) => p.name.trim() || p.entryId.trim()).length,
          0
        ),
      0
    );
    expect(rows).toHaveLength(expectedCount);
    expect(rows.filter((r) => r[0] === "予選")).toHaveLength(8);
    expect(rows.filter((r) => r[0] === "決勝").length).toBeGreaterThan(0);
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
