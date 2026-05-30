import { describe, expect, it } from "vitest";
import {
  buildStartListLineupFromEntries,
  buildStartListLineupFromFrozenRounds,
  overlayLiveTeamMembersFromDb,
} from "@/lib/buildStartListLineupParticipants";

describe("buildStartListLineupFromEntries", () => {
  const liveEntries = [
    {
      id: "e1",
      userId: "u1",
      club: { id: "c1", name: "Club A" },
      user: { profile: { familyName: "山田", givenName: "太郎" } },
      items: [{ eventId: "ev1" }],
    },
    {
      id: "e2",
      userId: "u2",
      club: null,
      user: { profile: { familyName: "佐藤", givenName: "花子" } },
      items: [{ eventId: "ev1" }],
    },
  ];

  const liveTeamEntries = [
    {
      id: "t1",
      teamName: "Team Alpha",
      club: null,
      members: [{ user: { profile: { familyName: "鈴木", givenName: "一" } } }],
    },
  ];

  it("includes all entries when no hide-worthy status rows", () => {
    const result = buildStartListLineupFromEntries({
      liveEntries,
      liveTeamEntries,
      participantStatusRows: [],
    });
    expect(result.individuals).toHaveLength(2);
    expect(result.individuals[0]?.name).toBe("山田 太郎");
    expect(result.teams).toHaveLength(1);
    expect(result.placementIndividualIds).toEqual(["e1", "e2"]);
    expect(result.placementTeamIds).toEqual(["t1"]);
  });

  it("excludes individual withdrawn from lineup", () => {
    const result = buildStartListLineupFromEntries({
      liveEntries,
      liveTeamEntries: [],
      participantStatusRows: [
        {
          participantType: "INDIVIDUAL",
          competitionEntryId: "e1",
          teamEntryId: null,
          status: "WITHDRAWN",
          reason: null,
        },
      ],
    });
    expect(result.individuals).toHaveLength(1);
    expect(result.individuals[0]?.entryId).toBe("e2");
    expect(result.placementIndividualIds).toEqual(["e2"]);
  });

  it("excludes team with DNS reason containing 棄権", () => {
    const result = buildStartListLineupFromEntries({
      liveEntries: [],
      liveTeamEntries,
      participantStatusRows: [
        {
          participantType: "TEAM",
          competitionEntryId: null,
          teamEntryId: "t1",
          status: "DNS",
          reason: "管理者棄権",
        },
      ],
    });
    expect(result.teams).toHaveLength(0);
    expect(result.placementTeamIds).toEqual([]);
  });

  it("keeps entry when DNS without 棄権 in reason", () => {
    const result = buildStartListLineupFromEntries({
      liveEntries: [liveEntries[0]!],
      liveTeamEntries: [],
      participantStatusRows: [
        {
          participantType: "INDIVIDUAL",
          competitionEntryId: "e1",
          teamEntryId: null,
          status: "DNS",
          reason: "当日欠場",
        },
      ],
    });
    expect(result.individuals).toHaveLength(1);
  });
});

describe("overlayLiveTeamMembersFromDb", () => {
  it("replaces snapshot members with DB members and adds teams missing from lineup", () => {
    const result = overlayLiveTeamMembersFromDb(
      [
        {
          teamEntryId: "t1",
          teamName: "A",
          clubId: "c1",
          clubName: "Club",
          members: ["旧 太郎"],
        },
      ],
      [
        {
          id: "t1",
          teamName: "A",
          club: { id: "c1", name: "Club" },
          members: [
            {
              user: { profile: { familyName: "新", givenName: "太郎" } },
            },
          ],
        },
        {
          id: "t2",
          teamName: "B",
          club: null,
          members: [
            {
              user: { profile: { familyName: "次", givenName: "郎" } },
            },
          ],
        },
      ]
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.members).toEqual(["新 太郎"]);
    expect(result[1]?.teamEntryId).toBe("t2");
    expect(result[1]?.members).toEqual(["次 郎"]);
  });
});

describe("buildStartListLineupFromFrozenRounds", () => {
  it("builds individuals from HEAT snapshot heats", () => {
    const result = buildStartListLineupFromFrozenRounds({
      isTeam: false,
      participantStatusRows: [],
      frozenSnapshotRounds: [
        {
          round: "HEAT",
          generatedAt: "2026-01-01T00:00:00.000Z",
          generatedBy: "RECORD_CAPTURE",
          heats: [
            {
              heatIndex: 1,
              participants: [
                {
                  kind: "INDIVIDUAL",
                  entryId: "e1",
                  userId: "u1",
                  name: "山田 太郎",
                  clubId: null,
                  clubName: null,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result?.individuals).toHaveLength(1);
    expect(result?.individuals[0]?.entryId).toBe("e1");
    expect(result?.placementIndividualIds).toEqual(["e1"]);
  });
});
