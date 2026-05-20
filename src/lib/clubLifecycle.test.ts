import { describe, expect, it } from "vitest";
import { CLUB_OPERATIONAL_STATUS } from "./clubLifecycle";

describe("clubLifecycle", () => {
  it("operational status is APPROVED", () => {
    expect(CLUB_OPERATIONAL_STATUS).toBe("APPROVED");
  });
});
