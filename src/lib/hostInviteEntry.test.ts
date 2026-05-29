import { describe, expect, it } from "vitest";
import {
  assertHostInviteEventCountLimits,
  buildHostInviteSnapshot,
  computeTeamNamesAfterAdd,
  HostInviteValidationError,
  parseHostInviteBody,
} from "./hostInviteEntry";

const eventMap = new Map([
  [
    "ev-ind",
    {
      id: "ev-ind",
      name: "100m",
      type: "INDIVIDUAL",
      requiresEntryTime: true,
      maxTeamEntriesPerClub: null,
    },
  ],
  [
    "ev-ind2",
    {
      id: "ev-ind2",
      name: "200m",
      type: "INDIVIDUAL",
      requiresEntryTime: false,
      maxTeamEntriesPerClub: null,
    },
  ],
  [
    "ev-team",
    {
      id: "ev-team",
      name: "4x100",
      type: "TEAM",
      requiresEntryTime: false,
      maxTeamEntriesPerClub: 2,
    },
  ],
]);

describe("parseHostInviteBody", () => {
  it("parses individual mode", () => {
    const payload = parseHostInviteBody(
      {
        userId: "user-1",
        items: [{ eventId: "ev-ind", entryTime: "1:00" }],
        notes: "招待",
      },
      eventMap
    );
    expect(payload.mode).toBe("individual");
    if (payload.mode === "individual") {
      expect(payload.targetUserId).toBe("user-1");
      expect(payload.items).toHaveLength(1);
      expect(payload.items[0]?.entryTime).toBe("1:00");
      expect(payload.notes).toBe("招待");
    }
  });

  it("parses team mode with additions", () => {
    const payload = parseHostInviteBody(
      {
        clubId: "club-1",
        additions: [{ eventId: "ev-team", addCount: 1 }],
      },
      eventMap
    );
    expect(payload.mode).toBe("team");
    if (payload.mode === "team") {
      expect(payload.clubId).toBe("club-1");
      expect(payload.additions).toEqual([{ eventId: "ev-team", addCount: 1 }]);
    }
  });

  it("merges duplicate event additions", () => {
    const payload = parseHostInviteBody(
      {
        clubId: "club-1",
        additions: [
          { eventId: "ev-team", addCount: 1 },
          { eventId: "ev-team", addCount: 2 },
        ],
      },
      eventMap
    );
    if (payload.mode === "team") {
      expect(payload.additions).toEqual([{ eventId: "ev-team", addCount: 3 }]);
    }
  });

  it("rejects mixed individual and team", () => {
    expect(() =>
      parseHostInviteBody(
        {
          userId: "user-1",
          clubId: "club-1",
          items: [{ eventId: "ev-ind", entryTime: "1:00" }],
          additions: [{ eventId: "ev-team", addCount: 1 }],
        },
        eventMap
      )
    ).toThrow(HostInviteValidationError);
  });

  it("rejects team with userId", () => {
    expect(() =>
      parseHostInviteBody(
        {
          userId: "user-1",
          clubId: "club-1",
          additions: [{ eventId: "ev-team", addCount: 1 }],
        },
        eventMap
      )
    ).toThrow(/ユーザーを指定できません/);
  });

  it("rejects team without clubId", () => {
    expect(() =>
      parseHostInviteBody(
        {
          additions: [{ eventId: "ev-team", addCount: 1 }],
        },
        eventMap
      )
    ).toThrow(/クラブを指定/);
  });

  it("rejects individual with clubId", () => {
    expect(() =>
      parseHostInviteBody(
        {
          userId: "user-1",
          clubId: "club-1",
          items: [{ eventId: "ev-ind2" }],
        },
        eventMap
      )
    ).toThrow(/クラブを指定できません/);
  });

  it("rejects legacy teamEntries", () => {
    expect(() =>
      parseHostInviteBody(
        {
          clubId: "club-1",
          teamEntries: [{ eventId: "ev-team", teamName: "A" }],
        },
        eventMap
      )
    ).toThrow(/additions/);
  });

  it("rejects wrong event type for team addition", () => {
    expect(() =>
      parseHostInviteBody(
        {
          clubId: "club-1",
          additions: [{ eventId: "ev-ind", addCount: 1 }],
        },
        eventMap
      )
    ).toThrow(/チーム種目のみ/);
  });

  it("requires entry time for individual when configured", () => {
    expect(() =>
      parseHostInviteBody(
        {
          userId: "user-1",
          items: [{ eventId: "ev-ind" }],
        },
        eventMap
      )
    ).toThrow(/エントリータイム/);
  });

  it("requires addCount >= 1", () => {
    expect(() =>
      parseHostInviteBody(
        {
          clubId: "club-1",
          additions: [{ eventId: "ev-team", addCount: 0 }],
        },
        eventMap
      )
    ).toThrow(/追加組数/);
  });
});

describe("computeTeamNamesAfterAdd", () => {
  it("creates single team name from base when no existing", () => {
    const result = computeTeamNamesAfterAdd([], 1, "東京SC");
    expect(result.updates).toEqual([]);
    expect(result.creates).toEqual([{ teamName: "東京SC" }]);
  });

  it("renames existing and creates second when adding to one team", () => {
    const result = computeTeamNamesAfterAdd([{ id: "t1", teamName: "東京SC" }], 1, "東京SC");
    expect(result.updates).toEqual([{ id: "t1", teamName: "東京SC A" }]);
    expect(result.creates).toEqual([{ teamName: "東京SC B" }]);
  });

  it("adds C when two teams already exist", () => {
    const result = computeTeamNamesAfterAdd(
      [
        { id: "t1", teamName: "東京SC A" },
        { id: "t2", teamName: "東京SC B" },
      ],
      1,
      "東京SC"
    );
    expect(result.updates).toEqual([]);
    expect(result.creates).toEqual([{ teamName: "東京SC C" }]);
  });
});

describe("assertHostInviteEventCountLimits", () => {
  it("allows single event when multiple disabled", () => {
    expect(() =>
      assertHostInviteEventCountLimits({
        uniqueEventCount: 1,
        allowMultiple: false,
        maxPerPerson: null,
      })
    ).not.toThrow();
  });

  it("rejects multiple events when multiple disabled", () => {
    expect(() =>
      assertHostInviteEventCountLimits({
        uniqueEventCount: 2,
        allowMultiple: false,
        maxPerPerson: null,
      })
    ).toThrow(/1種目のみ/);
  });

  it("rejects over max per person", () => {
    expect(() =>
      assertHostInviteEventCountLimits({
        uniqueEventCount: 3,
        allowMultiple: true,
        maxPerPerson: 2,
      })
    ).toThrow(/2種目まで/);
  });
});

describe("buildHostInviteSnapshot", () => {
  it("builds individual snapshot", () => {
    const snap = buildHostInviteSnapshot({
      mode: "individual",
      targetUserId: "u1",
      notes: null,
      items: [{ eventId: "ev-ind2", entryTime: null }],
    });
    expect(snap.clubId).toBeNull();
    expect(snap.teamEntries).toEqual([]);
    expect(snap.registrationSource).toBe("HOST_INVITE");
  });
});
