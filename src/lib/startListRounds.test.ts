import { describe, expect, it } from "vitest";
import {
  buildNextRoundHeatsFromPreviousResults,
  collectAdvancersPerHeatByRank,
  collectAdvancersPerHeatByRunUp,
  collectAdvancersPerHeatMixed,
  collectUniformTopPerHeat,
  computeAdvanceCountsByLargestRemainder,
  computeAdvanceCountsByLaneSlotsPerHeat,
  computeAdvanceCountsEqualAcrossHeats,
  computeHeatCountFromMaxLanes,
  effectiveHeatSettingForFirstStartListRound,
  enforceMinHeatCountForMaxLanes,
  resolveHeatCount,
  totalAdvanceCapacityFromNextRoundLayout,
  type StartListParticipant,
} from "./startListRounds";

describe("computeHeatCountFromMaxLanes", () => {
  it("returns 0 for non-positive total", () => {
    expect(computeHeatCountFromMaxLanes(0, 8)).toBe(0);
    expect(computeHeatCountFromMaxLanes(-1, 8)).toBe(0);
  });

  it("returns null when max lanes unset or invalid", () => {
    expect(computeHeatCountFromMaxLanes(10, null)).toBe(null);
    expect(computeHeatCountFromMaxLanes(10, undefined)).toBe(null);
    expect(computeHeatCountFromMaxLanes(10, Number.NaN)).toBe(null);
  });

  it("最小ヒート数は ceil(n/L)（15人・8レーン → 2）", () => {
    expect(computeHeatCountFromMaxLanes(15, 8)).toBe(2);
  });

  it("16人・8レーン → 2ヒート", () => {
    expect(computeHeatCountFromMaxLanes(16, 8)).toBe(2);
  });

  it("100人・16レーン → 7ヒート", () => {
    expect(computeHeatCountFromMaxLanes(100, 16)).toBe(7);
  });

  it("handles small fields", () => {
    expect(computeHeatCountFromMaxLanes(3, 8)).toBe(1);
    expect(computeHeatCountFromMaxLanes(9, 8)).toBe(2);
  });

  it("32 を超える最大レーン数もそのまま使う", () => {
    expect(computeHeatCountFromMaxLanes(100, 50)).toBe(2);
  });
});

describe("enforceMinHeatCountForMaxLanes", () => {
  it("L 未設定時は heatCount をそのまま（1 未満は 1）", () => {
    expect(enforceMinHeatCountForMaxLanes(20, 1, null)).toBe(1);
    expect(enforceMinHeatCountForMaxLanes(20, 4, undefined)).toBe(4);
  });

  it("手動でヒート数が少なすぎるとき ceil(n/L) に引き上げる", () => {
    expect(enforceMinHeatCountForMaxLanes(20, 1, 8)).toBe(3);
    expect(enforceMinHeatCountForMaxLanes(16, 1, 8)).toBe(2);
  });

  it("既に十分なヒート数ならそのまま", () => {
    expect(enforceMinHeatCountForMaxLanes(20, 5, 8)).toBe(5);
  });

  it("total<=0 のとき", () => {
    expect(enforceMinHeatCountForMaxLanes(0, 0, 8)).toBe(0);
  });
});

describe("effectiveHeatSettingForFirstStartListRound", () => {
  it("最大レーン数が有効なときは size + heatSize（保存された先頭タブのヒート数は無視）", () => {
    const eff = effectiveHeatSettingForFirstStartListRound(
      { mode: "count", heatCount: "99", heatSize: "8" },
      8
    );
    expect(eff).toEqual({ mode: "size", heatSize: "8", heatCount: "1" });
    expect(resolveHeatCount(15, eff)).toBe(2);
  });

  it("最大レーン数が無いときはタブの設定をそのまま使う", () => {
    const eff = effectiveHeatSettingForFirstStartListRound(
      { mode: "count", heatCount: "3", heatSize: "" },
      null
    );
    expect(eff).toEqual({ mode: "count", heatCount: "3", heatSize: "" });
    expect(resolveHeatCount(15, eff)).toBe(3);
  });
});

describe("computeAdvanceCountsByLargestRemainder", () => {
  it("100 entrants in 7 heats max 16 lanes → 64 capacity → 10,9,9,9,9,9,9", () => {
    const sizes = [15, 15, 14, 14, 14, 14, 14];
    const adv = computeAdvanceCountsByLargestRemainder(sizes, 64);
    expect(adv.reduce((a, b) => a + b, 0)).toBe(64);
    expect(adv).toEqual([10, 9, 9, 9, 9, 9, 9]);
    adv.forEach((a, i) => expect(a).toBeLessThanOrEqual(sizes[i]));
  });
});

describe("computeAdvanceCountsByLaneSlotsPerHeat", () => {
  it("7 ヒート・L=8・capacity 48 → レーン上限で均等（7,…,6）", () => {
    const adv = computeAdvanceCountsByLaneSlotsPerHeat(7, 8, 48);
    expect(adv.reduce((a, b) => a + b, 0)).toBe(48);
    expect(adv).toEqual([7, 7, 7, 7, 7, 7, 6]);
  });

  it("次ラ 3×16=48 枠を現ラ 7 ヒートへ均等 → 7,7,7,7,7,7,6", () => {
    const adv = computeAdvanceCountsByLaneSlotsPerHeat(7, 16, 48);
    expect(adv).toEqual([7, 7, 7, 7, 7, 7, 6]);
  });

  it("46 枠を 7 ヒートへ均等 → 7,7,7,7,6,6,6", () => {
    const adv = computeAdvanceCountsByLaneSlotsPerHeat(7, 16, 46);
    expect(adv.reduce((a, b) => a + b, 0)).toBe(46);
    expect(adv).toEqual([7, 7, 7, 7, 6, 6, 6]);
  });
});

describe("computeAdvanceCountsEqualAcrossHeats", () => {
  it("48枠・7ヒート・各ヒートに十分な人数 → 7,7,7,7,7,7,6", () => {
    const sizes = [20, 20, 20, 20, 20, 20, 20];
    const adv = computeAdvanceCountsEqualAcrossHeats(sizes, 48);
    expect(adv.reduce((a, b) => a + b, 0)).toBe(48);
    expect(adv).toEqual([7, 7, 7, 7, 7, 7, 6]);
  });

  it("片ヒートだけ人数が少ないときは上限を守りつつ再配分する", () => {
    const sizes = [20, 20, 20, 20, 20, 20, 5];
    const adv = computeAdvanceCountsEqualAcrossHeats(sizes, 48);
    expect(adv.reduce((a, b) => a + b, 0)).toBe(48);
    expect(adv[6]).toBe(5);
    adv.forEach((a, i) => expect(a).toBeLessThanOrEqual(sizes[i]));
  });
});

describe("totalAdvanceCapacityFromNextRoundLayout", () => {
  it("常に H×L（前ラ人数引数は無視）", () => {
    expect(totalAdvanceCapacityFromNextRoundLayout(4, 8, 100)).toBe(32);
    expect(totalAdvanceCapacityFromNextRoundLayout(4, 8, 20)).toBe(32);
    expect(totalAdvanceCapacityFromNextRoundLayout(3, 16, 10)).toBe(48);
  });

  it("H=0 または負は 0 定員", () => {
    expect(totalAdvanceCapacityFromNextRoundLayout(0, 8, 50)).toBe(0);
  });
});

describe("collectAdvancersPerHeatByRank", () => {
  it("各ヒートで take 分だけ着順上位を集める", () => {
    const h1 = [
      { rank: 3, id: "c" },
      { rank: 1, id: "a" },
      { rank: 2, id: "b" },
    ];
    const h2 = [{ rank: 2, id: "y" }, { rank: 1, id: "x" }];
    const out = collectAdvancersPerHeatByRank(
      [
        [1, h1],
        [2, h2],
      ],
      [2, 1]
    );
    expect(out.map((r) => r.id)).toEqual(["a", "b", "x"]);
  });

  it("rank なしは進出に使わず、アップ枠が余っても繰り上げで埋めない", () => {
    const h1 = [
      { rank: 1, id: "a" },
      { rank: null, id: "no-rank" },
      { rank: 2, id: "b" },
    ];
    const out = collectAdvancersPerHeatByRank([[1, h1]], [5]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("collectAdvancersPerHeatByRunUp", () => {
  it("advanceWithoutRank 行のみレーン順で take 名まで", () => {
    const h1 = [
      { rank: 8 as number | null, advanceWithoutRank: false, lane: 1, id: "out" },
      { rank: null, advanceWithoutRank: true, lane: 3, id: "a" },
      { rank: null, advanceWithoutRank: true, lane: 2, id: "b" },
    ];
    const out = collectAdvancersPerHeatByRunUp([[1, h1]], [2]);
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("collectAdvancersPerHeatMixed", () => {
  it("ヒート1はランアップ・ヒート2は着順", () => {
    const h1 = [{ rank: null, advanceWithoutRank: true, lane: 1, id: "ru" }];
    const h2 = [
      { rank: 2, advanceWithoutRank: false, lane: 2, id: "b" },
      { rank: 1, advanceWithoutRank: false, lane: 1, id: "a" },
    ];
    const out = collectAdvancersPerHeatMixed(
      [
        [1, h1],
        [2, h2],
      ] as [number, { rank: number | null; advanceWithoutRank?: boolean; lane?: number | null; id: string }[]][],
      [1, 1]
    );
    expect(out.map((r) => r.id)).toEqual(["ru", "a"]);
  });
});

describe("collectUniformTopPerHeat", () => {
  it("各ヒートで上位 n 名（着順）", () => {
    const h1 = [
      { rank: 2, id: "b" },
      { rank: 1, id: "a" },
    ];
    const h2 = [{ rank: 1, id: "x" }, { rank: 3, id: "z" }, { rank: 2, id: "y" }];
    const out = collectUniformTopPerHeat(
      [
        [1, h1],
        [2, h2],
      ],
      2
    );
    expect(out.map((r) => r.id)).toEqual(["a", "b", "x", "y"]);
  });

  it("rank なしの行は各ヒートの上位から除外", () => {
    const h1 = [{ rank: 1, id: "a" }, { rank: null, id: "ghost" }];
    const out = collectUniformTopPerHeat([[1, h1]], 3);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("buildNextRoundHeatsFromPreviousResults", () => {
  const ind = (id: string, rank: number, heat: number): StartListParticipant => ({
    kind: "INDIVIDUAL",
    entryId: id,
    userId: id,
    name: id,
    clubId: null,
    clubName: null,
    sourceRank: rank,
    sourceHeat: heat,
  });

  const participantKey = (p: StartListParticipant) =>
    p.kind === "TEAM" ? p.teamEntryId : p.entryId;

  it("同一 shuffleSeed ならヒート割当が再現される", () => {
    const participants = [ind("a", 1, 1), ind("b", 1, 2), ind("c", 2, 1), ind("d", 3, 2)];
    const h1 = buildNextRoundHeatsFromPreviousResults({
      participants,
      heatCount: 2,
      shuffleSeed: 0xdeadbeef,
    });
    const h2 = buildNextRoundHeatsFromPreviousResults({
      participants,
      heatCount: 2,
      shuffleSeed: 0xdeadbeef,
    });
    expect(h1.map((h) => h.participants.map(participantKey))).toEqual(
      h2.map((h) => h.participants.map(participantKey))
    );
  });

  it("同一着順が多いとき、異なる shuffleSeed で割当が変わりうる", () => {
    const participants = Array.from({ length: 8 }, (_, i) => ind(`u${i}`, 1, i + 1));
    let foundDiff = false;
    for (let s = 1; s < 80; s += 1) {
      const a = buildNextRoundHeatsFromPreviousResults({
        participants,
        heatCount: 2,
        shuffleSeed: s,
      });
      const b = buildNextRoundHeatsFromPreviousResults({
        participants,
        heatCount: 2,
        shuffleSeed: s + 10_000,
      });
      const sa = JSON.stringify(a.map((h) => h.participants.map(participantKey)));
      const sb = JSON.stringify(b.map((h) => h.participants.map(participantKey)));
      if (sa !== sb) {
        foundDiff = true;
        break;
      }
    }
    expect(foundDiff).toBe(true);
  });
});
