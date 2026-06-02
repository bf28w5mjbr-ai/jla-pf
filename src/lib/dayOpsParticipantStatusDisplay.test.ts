import { describe, expect, it } from "vitest";
import {
  buildParticipantDayOpsStatusByKey,
  effectiveDayOpsStatusForMarshalDisplay,
  resolveHeatLaneDayOpsDisplayStatus,
} from "./dayOpsParticipantStatusDisplay";

describe("effectiveDayOpsStatusForMarshalDisplay", () => {
  it("締切前の PENDING はそのまま", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("PENDING", false)).toBe("PENDING");
  });

  it("締切後も PENDING はそのまま（締切時に DNS が書き込まれる設計）", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("PENDING", true)).toBe("PENDING");
  });

  it("締切後も CALLED は維持", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("CALLED", true)).toBe("CALLED");
  });

  it("DB 上の DSQ は締切に関係なく DSQ", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("DSQ", false)).toBe("DSQ");
    expect(effectiveDayOpsStatusForMarshalDisplay("DSQ", true)).toBe("DSQ");
  });

  it("CHECKED_IN は締切後も出場扱いのまま", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("CHECKED_IN", true)).toBe("CHECKED_IN");
  });
});

describe("resolveHeatLaneDayOpsDisplayStatus", () => {
  it("マーシャル行が PENDING のとき、ポールが CALLED でも PENDING のまま（リザルト誤入力防止）", () => {
    expect(
      resolveHeatLaneDayOpsDisplayStatus({ status: "PENDING" }, "CALLED")
    ).toBe("PENDING");
  });

  it("終了系はサーバー優先", () => {
    expect(resolveHeatLaneDayOpsDisplayStatus({ status: "PENDING" }, "DSQ")).toBe("DSQ");
  });
});

describe("buildParticipantDayOpsStatusByKey", () => {
  it("TEAM の teamMemberUserId が null の行はレガシーキーで保持する", () => {
    const out = buildParticipantDayOpsStatusByKey([
      {
        participantType: "TEAM",
        competitionEntryId: null,
        teamEntryId: "team-1",
        teamMemberUserId: null,
        status: "CALLED",
      },
    ]);
    expect(out["T:team-1"]).toBe("CALLED");
  });
});
