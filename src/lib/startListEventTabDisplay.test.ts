import { describe, expect, it } from "vitest";
import type { StartListRoundData } from "@/lib/startListRounds";
import {
  buildStartListEventRoundDisplay,
  dedupeFrozenTabIndicesBySnapshotRound,
  getLiveHeatsByTab,
  getSnapshotTabPanels,
  overlayLiveTeamMembersOnSnapshotRoundBlock,
} from "./startListEventTabDisplay";

describe("getLiveHeatsByTab", () => {
  it("2本目以降は roundTabs のヒート数を全員数での enforce に潰さない", () => {
    const liveTabs = [
      { id: "a", label: "h", mode: "count" as const, heatCount: "5", heatSize: "" },
      { id: "b", label: "s", mode: "count" as const, heatCount: "2", heatSize: "" },
    ];
    const individuals = Array.from({ length: 40 }, (_, i) => ({
      entryId: `e${i}`,
      userId: `u${i}`,
      name: `P${i}`,
      clubId: null as string | null,
      clubName: null as string | null,
    }));
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 8,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: null,
      heatPlanStep1Confirmed: false,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "5", heatSize: "" },
    });
    expect(rows[0]!.individualHeats.length).toBe(5);
    expect(rows[1]!.individualHeats.length).toBe(2);
  });

  it("2本目タブは未凍結時は枠のみ（選手名なし）でヒート数は維持する", () => {
    const liveTabs = [
      { id: "a", label: "h", mode: "count" as const, heatCount: "5", heatSize: "" },
      { id: "b", label: "f", mode: "count" as const, heatCount: "2", heatSize: "" },
    ];
    const individuals = Array.from({ length: 40 }, (_, i) => ({
      entryId: `e${i}`,
      userId: `u${i}`,
      name: `P${i}`,
      clubId: null as string | null,
      clubName: null as string | null,
    }));
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 8,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: null,
      heatPlanStep1Confirmed: false,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "5", heatSize: "" },
    });
    const second = rows[1]!;
    expect(second.individualHeats.length).toBe(2);
    expect(second.individualHeats.every((h) => h.length === 0)).toBe(true);
    expect(second.previewEstimatedParticipants).toBe(16);
    expect(second.previewMaxLanesPerHeat).toBe(8);
  });

  it("2本目タブだけ最大レーンを狭めると previewEstimatedParticipants が L×ヒート数になる", () => {
    const liveTabs = [
      { id: "a", label: "h", mode: "count" as const, heatCount: "5", heatSize: "" },
      {
        id: "b",
        label: "f",
        mode: "count" as const,
        heatCount: "2",
        heatSize: "",
        maxLanesPerHeat: 8,
      },
    ];
    const individuals = Array.from({ length: 40 }, (_, i) => ({
      entryId: `e${i}`,
      userId: `u${i}`,
      name: `P${i}`,
      clubId: null as string | null,
      clubName: null as string | null,
    }));
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 16,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: null,
      heatPlanStep1Confirmed: false,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "5", heatSize: "" },
    });
    const second = rows[1]!;
    expect(second.individualHeats.length).toBe(2);
    expect(second.individualHeats.every((h) => h.length === 0)).toBe(true);
    expect(second.previewEstimatedParticipants).toBe(16);
    expect(second.previewMaxLanesPerHeat).toBe(8);
  });

  it("凍結スナップショットでヒート配列が heatIndex 順でなくても、表示行と marshalDisplayHeatIndices が一致する", () => {
    const liveTabs = [
      { id: "a", label: "予選", mode: "count" as const, heatCount: "2", heatSize: "" },
    ];
    const frozen: StartListRoundData[] = [
      {
        round: "HEAT",
        generatedAt: new Date().toISOString(),
        generatedBy: "ENTRY_CLOSE",
        heats: [
          {
            heatIndex: 2,
            participants: [
              {
                kind: "INDIVIDUAL" as const,
                entryId: "e2",
                userId: "u2",
                name: "Second",
                clubId: null,
                clubName: null,
              },
            ],
          },
          {
            heatIndex: 1,
            participants: [
              {
                kind: "INDIVIDUAL" as const,
                entryId: "e1",
                userId: "u1",
                name: "First",
                clubId: null,
                clubName: null,
              },
            ],
          },
        ],
      },
    ];
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals: [
        {
          entryId: "e1",
          userId: "u1",
          name: "First",
          clubId: null,
          clubName: null,
        },
        {
          entryId: "e2",
          userId: "u2",
          name: "Second",
          clubId: null,
          clubName: null,
        },
      ],
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 8,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: frozen,
      heatPlanStep1Confirmed: false,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "2", heatSize: "" },
    });
    expect(rows[0]!.individualHeats.map((h) => h.map((p) => p.name))).toEqual([["First"], ["Second"]]);
    expect(rows[0]!.marshalDisplayHeatIndices).toEqual([1, 2]);
  });

  it("凍結 HEAT に保存済み advanceQuotas があっても、ステップ1確定時は再計算値を表示する", () => {
    const liveTabs = [
      { id: "a", label: "予選", mode: "count" as const, heatCount: "2", heatSize: "" },
      { id: "b", label: "決勝", mode: "count" as const, heatCount: "2", heatSize: "" },
    ];
    const frozen: StartListRoundData[] = [
      {
        round: "HEAT",
        generatedAt: new Date().toISOString(),
        generatedBy: "ENTRY_CLOSE",
        advanceQuotasByOfficialHeat: [
          { heat: 1, quota: 1 },
          { heat: 2, quota: 1 },
        ],
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "INDIVIDUAL" as const,
                entryId: "e1",
                userId: "u1",
                name: "A",
                clubId: null,
                clubName: null,
              },
            ],
          },
          {
            heatIndex: 2,
            participants: [
              {
                kind: "INDIVIDUAL" as const,
                entryId: "e2",
                userId: "u2",
                name: "B",
                clubId: null,
                clubName: null,
              },
            ],
          },
        ],
      },
    ];
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals: [
        { entryId: "e1", userId: "u1", name: "A", clubId: null, clubName: null },
        { entryId: "e2", userId: "u2", name: "B", clubId: null, clubName: null },
      ],
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 8,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: frozen,
      heatPlanStep1Confirmed: true,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "2", heatSize: "" },
    });
    expect(rows[0]!.heatAdvanceQuotas).not.toEqual([1, 1]);
    expect(rows[0]!.heatAdvanceQuotas).toEqual([8, 8]);
  });

  it("凍結 SEMI に保存済み advanceQuotas があっても、ステップ1確定時は再計算値を表示する", () => {
    const liveTabs = [
      { id: "a", label: "予選", mode: "count" as const, heatCount: "2", heatSize: "" },
      { id: "b", label: "準決", mode: "count" as const, heatCount: "2", heatSize: "" },
      { id: "c", label: "決勝", mode: "count" as const, heatCount: "1", heatSize: "" },
    ];
    const semiParticipants = (offset: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        kind: "INDIVIDUAL" as const,
        entryId: `e${offset + i}`,
        userId: `u${offset + i}`,
        name: `P${offset + i}`,
        clubId: null as string | null,
        clubName: null as string | null,
      }));
    const frozen: StartListRoundData[] = [
      {
        round: "HEAT",
        generatedAt: new Date().toISOString(),
        generatedBy: "ENTRY_CLOSE",
        heats: [
          { heatIndex: 1, participants: semiParticipants(0, 10) },
          { heatIndex: 2, participants: semiParticipants(10, 10) },
        ],
      },
      {
        round: "SEMI",
        generatedAt: new Date().toISOString(),
        generatedBy: "ENTRY_CLOSE",
        advanceQuotasByOfficialHeat: [
          { heat: 1, quota: 1 },
          { heat: 2, quota: 1 },
        ],
        heats: [
          { heatIndex: 1, participants: semiParticipants(0, 10) },
          { heatIndex: 2, participants: semiParticipants(10, 10) },
        ],
      },
    ];
    const individuals = Array.from({ length: 20 }, (_, i) => ({
      entryId: `e${i}`,
      userId: `u${i}`,
      name: `P${i}`,
      clubId: null as string | null,
      clubName: null as string | null,
    }));
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 8,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: frozen,
      heatPlanStep1Confirmed: true,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "2", heatSize: "" },
    });
    expect(rows[1]!.heatAdvanceQuotas).not.toEqual([1, 1]);
    expect(rows[1]!.heatAdvanceQuotas).toEqual([4, 4]);
  });

  it("凍結チームヒートでも liveTeams のメンバー名で上書きする（割当後にスナップショット未更新でも表示される）", () => {
    const liveTabs = [{ id: "a", label: "予選", mode: "count" as const, heatCount: "2", heatSize: "" }];
    const frozen: StartListRoundData[] = [
      {
        round: "HEAT",
        generatedAt: new Date().toISOString(),
        generatedBy: "ENTRY_CLOSE",
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "TEAM" as const,
                teamEntryId: "t1",
                teamName: "チームA",
                clubId: null,
                clubName: null,
                members: [],
              },
            ],
          },
        ],
      },
    ];
    const rows = getLiveHeatsByTab({
      liveTabs,
      individuals: [],
      teams: [
        {
          teamEntryId: "t1",
          teamName: "チームA",
          clubId: null,
          clubName: null,
          members: ["山田 太郎", "佐藤 花子"],
        },
      ],
      isTeam: true,
      preliminaryHeatLaneCount: 8,
      officialRanksByRound: null,
      placementSeed: 1,
      frozenSnapshotRounds: frozen,
      heatPlanStep1Confirmed: false,
      eventHeatSetting: { roundTabs: liveTabs, mode: "count", heatCount: "2", heatSize: "" },
    });
    expect(rows[0]!.teamHeats[0]![0]!.members).toEqual(["山田 太郎", "佐藤 花子"]);
  });

  it("overlayLiveTeamMembersOnSnapshotRoundBlock は公開用スナップショット block の members を DB で上書きする", () => {
    const block = overlayLiveTeamMembersOnSnapshotRoundBlock(
      {
        round: "HEAT",
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "TEAM" as const,
                teamEntryId: "t1",
                teamName: "チームA",
                clubId: null,
                clubName: null,
                members: ["旧 太郎"],
              },
            ],
          },
        ],
      },
      [
        {
          teamEntryId: "t1",
          teamName: "チームA",
          clubId: null,
          clubName: null,
          members: ["新 太郎", "佐藤 花子"],
        },
      ]
    );
    const team = block.heats[0]!.participants[0] as { members?: string[] };
    expect(team.members).toEqual(["新 太郎", "佐藤 花子"]);
  });

  it("getSnapshotTabPanels はタブ位置とスナップショット round キーで対応付けし、欠損ラウンドで次の配列要素を誤表示しない", () => {
    const panels = getSnapshotTabPanels(
      [
        { round: "HEAT", heats: [{ heatIndex: 1, participants: [] }] },
        { round: "FINAL", heats: [{ heatIndex: 1, participants: [] }] },
      ],
      { mode: "count", heatCount: "1", heatSize: "" },
      3
    );
    expect(panels).not.toBeNull();
    expect(panels!.length).toBe(3);
    expect(panels![0]!.block?.round).toBe("HEAT");
    expect(panels![1]!.block).toBeNull();
    expect(panels![2]!.block?.round).toBe("FINAL");
  });
});

describe("dedupeFrozenTabIndicesBySnapshotRound", () => {
  const frozenHeatFinal: StartListRoundData[] = [
    {
      round: "HEAT",
      generatedAt: "2020-01-01T00:00:00.000Z",
      generatedBy: "BASELINE",
      heats: [{ heatIndex: 1, participants: [] }],
    },
    {
      round: "FINAL",
      generatedAt: "2020-01-01T00:00:00.000Z",
      generatedBy: "BASELINE",
      heats: [{ heatIndex: 1, participants: [] }],
    },
  ];

  it("タブ数が多くても同一スナップショット round に写るタブは 1 本だけ残す", () => {
    const tabCount = 12;
    const idx = dedupeFrozenTabIndicesBySnapshotRound(tabCount, frozenHeatFinal);
    expect(idx).toEqual([0, 2]);
  });

  it("ヒート未凍結・決勝のみのときも重複 FINAL タブを潰す", () => {
    const tabCount = 5;
    const idx = dedupeFrozenTabIndicesBySnapshotRound(tabCount, [
      {
        round: "FINAL",
        generatedAt: "2020-01-01T00:00:00.000Z",
        generatedBy: "BASELINE",
        heats: [{ heatIndex: 1, participants: [] }],
      },
    ]);
    expect(idx).toEqual([2]);
  });
});

describe("buildStartListEventRoundDisplay", () => {
  const individuals = Array.from({ length: 8 }, (_, i) => ({
    entryId: `e${i}`,
    userId: `u${i}`,
    name: `P${i}`,
    clubId: null as string | null,
    clubName: null as string | null,
  }));

  it("ops mode returns all configured round tabs", () => {
    const d = buildStartListEventRoundDisplay({
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
    expect(d.allTabs).toHaveLength(2);
    expect(d.visibleTabIndices).toEqual([0, 1]);
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0]!.displaySource).toBe("liveEntry");
    expect(d.rows[1]!.displaySource).toBe("previewStructure");
    expect(d.rows[1]!.individualHeats.every((h) => h.length === 0)).toBe(true);
    expect(d.rows[1]!.individualHeats.length).toBeGreaterThan(0);
  });

  it("public mode filters to frozen snapshot rounds only", () => {
    const frozen: StartListRoundData[] = [
      {
        round: "HEAT",
        generatedAt: "2020-01-01T00:00:00.000Z",
        generatedBy: "BASELINE",
        heats: [{ heatIndex: 1, participants: [] }],
      },
    ];
    const d = buildStartListEventRoundDisplay({
      eventId: "ev1",
      initialSettings: { events: { ev1: { mode: "count", heatCount: "2", heatSize: "" } } },
      startListRoundCount: 2,
      individuals,
      teams: [],
      isTeam: false,
      preliminaryHeatLaneCount: 4,
      placementSeed: 1,
      frozenSnapshotRounds: frozen,
      heatPlanConfirmedAtIso: "2020-01-01T00:00:00.000Z",
      mode: "public",
    });
    expect(d.visibleTabIndices.length).toBeGreaterThanOrEqual(1);
    expect(d.rows.length).toBe(d.visibleTabIndices.length);
    expect(d.allTabs.length).toBeGreaterThanOrEqual(d.rows.length);
  });
});
