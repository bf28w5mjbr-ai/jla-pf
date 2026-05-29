import { describe, expect, it } from "vitest";
import {
  getRoundDataFromSnapshot,
  getHeatFromRoundData,
  heatIndexMatchesSnapshot,
  parseStartListSnapshotLooseForRoundRead,
} from "./heatMarshalFromSnapshot";

describe("heatIndexMatchesSnapshot", () => {
  it("string heatIndex でも number と一致する", () => {
    expect(heatIndexMatchesSnapshot(1, "1")).toBe(true);
    expect(heatIndexMatchesSnapshot(2, 2)).toBe(true);
    expect(heatIndexMatchesSnapshot(1, 2)).toBe(false);
  });
});

describe("getHeatFromRoundData", () => {
  it("heatIndex が string のスナップショット行も取得できる", () => {
    const round = {
      round: "HEAT" as const,
      generatedAt: "x",
      generatedBy: "BASELINE" as const,
      heats: [{ heatIndex: "2" as unknown as number, participants: [] }],
    };
    expect(getHeatFromRoundData(round, 2)).toBeDefined();
  });
});

describe("parseStartListSnapshotLooseForRoundRead", () => {
  it("version 2 でも events があれば読める", () => {
    const data = {
      version: 2,
      events: [
        {
          eventId: "e1",
          rounds: [
            {
              round: "HEAT",
              generatedAt: "x",
              generatedBy: "BASELINE" as const,
              heats: [{ heatIndex: 1, participants: [] }],
            },
          ],
        },
      ],
    };
    const p = parseStartListSnapshotLooseForRoundRead(data);
    expect(p).not.toBeNull();
    expect(getRoundDataFromSnapshot(p!, "e1", "HEAT")?.heats).toHaveLength(1);
  });
});
