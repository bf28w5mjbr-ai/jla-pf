import { describe, expect, it } from "vitest";
import {
  assertHostInviteEventCountLimits,
  buildHostInviteSnapshot,
  computeTeamNamesAfterAdd,
  computeTeamNamesAfterTargetCount,
  formatHostInviteTeamAdjustResultMessage,
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

  it("parses team mode with adjustments", () => {
    const payload = parseHostInviteBody(
      {
        clubId: "club-1",
        adjustments: [{ eventId: "ev-team", targetCount: 1 }],
      },
      eventMap
    );
    expect(payload.mode).toBe("team");
    if (payload.mode === "team") {
      expect(payload.clubId).toBe("club-1");
      expect(payload.adjustments).toEqual([{ eventId: "ev-team", targetCount: 1 }]);
    }
  });

  it("uses last duplicate event adjustment", () => {
    const payload = parseHostInviteBody(
      {
        clubId: "club-1",
        adjustments: [
          { eventId: "ev-team", targetCount: 1 },
          { eventId: "ev-team", targetCount: 2 },
        ],
      },
      eventMap
    );
    if (payload.mode === "team") {
      expect(payload.adjustments).toEqual([{ eventId: "ev-team", targetCount: 2 }]);
    }
  });

  it("accepts targetCount 0", () => {
    const payload = parseHostInviteBody(
      {
        clubId: "club-1",
        adjustments: [{ eventId: "ev-team", targetCount: 0 }],
      },
      eventMap
    );
    if (payload.mode === "team") {
      expect(payload.adjustments[0]?.targetCount).toBe(0);
    }
  });

  it("rejects mixed individual and team", () => {
    expect(() =>
      parseHostInviteBody(
        {
          userId: "user-1",
          clubId: "club-1",
          items: [{ eventId: "ev-ind", entryTime: "1:00" }],
          adjustments: [{ eventId: "ev-team", targetCount: 1 }],
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
          adjustments: [{ eventId: "ev-team", targetCount: 1 }],
        },
        eventMap
      )
    ).toThrow(/ユーザーを指定できません/);
  });

  it("rejects team without clubId", () => {
    expect(() =>
      parseHostInviteBody(
        {
          adjustments: [{ eventId: "ev-team", targetCount: 1 }],
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

  it("rejects legacy additions", () => {
    expect(() =>
      parseHostInviteBody(
        {
          clubId: "club-1",
          additions: [{ eventId: "ev-team", addCount: 1 }],
        },
        eventMap
      )
    ).toThrow(/adjustments/);
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
    ).toThrow(/adjustments/);
  });

  it("rejects wrong event type for team adjustment", () => {
    expect(() =>
      parseHostInviteBody(
        {
          clubId: "club-1",
          adjustments: [{ eventId: "ev-ind", targetCount: 1 }],
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

  it("rejects negative targetCount", () => {
    expect(() =>
      parseHostInviteBody(
        {
          clubId: "club-1",
          adjustments: [{ eventId: "ev-team", targetCount: -1 }],
        },
        eventMap
      )
    ).toThrow(/0以上/);
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

describe("computeTeamNamesAfterTargetCount", () => {
  it("reduces 3 teams to 2 and renormalizes", () => {
    const existing = [
      { id: "t1", teamName: "東京SC A" },
      { id: "t2", teamName: "東京SC B" },
      { id: "t3", teamName: "東京SC C" },
    ];
    const result = computeTeamNamesAfterTargetCount(existing, 2, "東京SC");
    expect(result.deleteIds).toEqual(["t3"]);
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("reduces to 0 deletes all", () => {
    const existing = [
      { id: "t1", teamName: "東京SC A" },
      { id: "t2", teamName: "東京SC B" },
    ];
    const result = computeTeamNamesAfterTargetCount(existing, 0, "東京SC");
    expect(result.deleteIds).toEqual(["t1", "t2"]);
    expect(result.updates).toEqual([]);
    expect(result.creates).toEqual([]);
  });

  it("increases from 1 to 2", () => {
    const result = computeTeamNamesAfterTargetCount(
      [{ id: "t1", teamName: "東京SC" }],
      2,
      "東京SC"
    );
    expect(result.deleteIds).toEqual([]);
    expect(result.updates).toEqual([{ id: "t1", teamName: "東京SC A" }]);
    expect(result.creates).toEqual([{ teamName: "東京SC B" }]);
  });
});

describe("formatHostInviteTeamAdjustResultMessage", () => {
  it("formats add and delete", () => {
    expect(
      formatHostInviteTeamAdjustResultMessage({
        createdTeamEntryIds: ["a"],
        deletedTeamEntryIds: ["b"],
        createdCount: 1,
        deletedCount: 1,
      })
    ).toBe("チームエントリーを1 組追加・1 組削除しました");
  });

  it("formats rename-only", () => {
    expect(
      formatHostInviteTeamAdjustResultMessage({
        createdTeamEntryIds: [],
        deletedTeamEntryIds: [],
        createdCount: 0,
        deletedCount: 0,
      })
    ).toBe("チーム登録組数を更新しました");
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
