import { describe, expect, it } from "vitest";
import {
  DAY_OPS_STATUS_MARSHAL_ABSENT,
  effectiveDayOpsStatusForMarshalDisplay,
  resolveHeatLaneDayOpsDisplayStatus,
} from "./dayOpsParticipantStatusDisplay";

describe("effectiveDayOpsStatusForMarshalDisplay", () => {
  it("締切前の PENDING はそのまま", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("PENDING", false)).toBe("PENDING");
  });

  it("締切後の PENDING は未出場扱い（競技中 DSQ とは別）", () => {
    expect(effectiveDayOpsStatusForMarshalDisplay("PENDING", true)).toBe(DAY_OPS_STATUS_MARSHAL_ABSENT);
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
