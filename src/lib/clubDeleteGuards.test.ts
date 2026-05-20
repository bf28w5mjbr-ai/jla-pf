import { describe, expect, it } from "vitest";
import { clubDeleteBlockersMessage } from "./clubDeleteGuards";

describe("clubDeleteBlockersMessage", () => {
  it("returns empty string when no blockers", () => {
    expect(clubDeleteBlockersMessage([])).toBe("");
  });

  it("joins multiple blocker messages", () => {
    expect(
      clubDeleteBlockersMessage([
        "PENDING_TYPE_APPLICATION",
        "UNPAID_DUES",
        "ACTIVE_COMPETITION_ENTRIES",
      ])
    ).toContain("クラブ種別申請");
    expect(
      clubDeleteBlockersMessage([
        "PENDING_TYPE_APPLICATION",
        "UNPAID_DUES",
        "ACTIVE_COMPETITION_ENTRIES",
      ])
    ).toContain("未払い");
    expect(
      clubDeleteBlockersMessage([
        "PENDING_TYPE_APPLICATION",
        "UNPAID_DUES",
        "ACTIVE_COMPETITION_ENTRIES",
      ])
    ).toContain("大会");
  });
});
