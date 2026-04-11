import { describe, expect, it } from "vitest";
import {
  getRoundDataFromSnapshot,
  parseStartListSnapshotLooseForRoundRead,
} from "./heatMarshalFromSnapshot";

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
