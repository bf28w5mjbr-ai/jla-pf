import { describe, expect, it } from "vitest";
import type { StartListRoundData } from "@/lib/startListRounds";
import {
  countUniqueParticipantsInFrozenRounds,
  entryCountByEventIdFromSnapshotData,
} from "./startListSnapshotReadHelpers";

describe("startListSnapshotReadHelpers", () => {
  it("countUniqueParticipantsInFrozenRounds counts individual entries in HEAT", () => {
    const frozen: StartListRoundData[] = [
      {
        round: "HEAT",
        generatedBy: "ENTRY_CLOSE",
        heats: [
          {
            heatIndex: 1,
            participants: [
              {
                kind: "INDIVIDUAL",
                entryId: "e1",
                userId: "u1",
                name: "A",
                clubId: null,
                clubName: null,
              },
              {
                kind: "INDIVIDUAL",
                entryId: "e2",
                userId: "u2",
                name: "B",
                clubId: null,
                clubName: null,
              },
            ],
          },
          {
            heatIndex: 2,
            participants: [
              {
                kind: "INDIVIDUAL",
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
    expect(countUniqueParticipantsInFrozenRounds(frozen, false)).toBe(2);
  });

  it("entryCountByEventIdFromSnapshotData maps event ids", () => {
    const data = {
      events: [
        {
          eventId: "ev1",
          rounds: [
            {
              round: "HEAT",
              generatedBy: "ENTRY_CLOSE",
              heats: [
                {
                  heatIndex: 1,
                  participants: [
                    {
                      kind: "TEAM",
                      teamEntryId: "t1",
                      teamName: "Team",
                      clubName: null,
                      members: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = entryCountByEventIdFromSnapshotData(data, [{ id: "ev1", type: "TEAM" }]);
    expect(out.ev1).toBe(1);
    expect(entryCountByEventIdFromSnapshotData(data, [{ id: "ev-missing", type: "INDIVIDUAL" }])[
      "ev-missing"
    ]).toBe(0);
  });
});
