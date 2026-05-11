import { describe, expect, it } from "vitest";
import { shouldClearPrimaryClubAfterMembershipDelete } from "./membershipPrimaryClub";

describe("shouldClearPrimaryClubAfterMembershipDelete", () => {
  it("returns true when primary matches membership club", () => {
    expect(shouldClearPrimaryClubAfterMembershipDelete("club_a", "club_a")).toBe(true);
  });
  it("returns false when primary is null", () => {
    expect(shouldClearPrimaryClubAfterMembershipDelete(null, "club_a")).toBe(false);
  });
  it("returns false when primary differs", () => {
    expect(shouldClearPrimaryClubAfterMembershipDelete("club_b", "club_a")).toBe(false);
  });
});
