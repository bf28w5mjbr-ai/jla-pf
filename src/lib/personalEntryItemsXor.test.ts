import { describe, expect, it } from "vitest";
import {
  existingEntryItemsWereLegacyMixed,
  personalEntryItemsHasMixedEventTypes,
  shouldBlockPersonalEntryItemsXorForGeneralUser,
  teamOnlyItemSelectionRequiresClubId,
} from "@/lib/personalEntryItemsXor";

describe("personalEntryItemsHasMixedEventTypes", () => {
  it("false for empty or single type", () => {
    expect(personalEntryItemsHasMixedEventTypes([])).toBe(false);
    expect(personalEntryItemsHasMixedEventTypes(["INDIVIDUAL"])).toBe(false);
    expect(personalEntryItemsHasMixedEventTypes(["TEAM", "TEAM"])).toBe(false);
  });

  it("true when both INDIVIDUAL and TEAM", () => {
    expect(personalEntryItemsHasMixedEventTypes(["INDIVIDUAL", "TEAM"])).toBe(true);
  });
});

describe("existingEntryItemsWereLegacyMixed", () => {
  it("matches mixed persisted items", () => {
    expect(existingEntryItemsWereLegacyMixed(["INDIVIDUAL", "TEAM"])).toBe(true);
  });

  it("false for homogeneous", () => {
    expect(existingEntryItemsWereLegacyMixed(["INDIVIDUAL"])).toBe(false);
    expect(existingEntryItemsWereLegacyMixed(["TEAM", "TEAM"])).toBe(false);
  });
});

describe("shouldBlockPersonalEntryItemsXorForGeneralUser", () => {
  it("allows admin even when mixed", () => {
    expect(
      shouldBlockPersonalEntryItemsXorForGeneralUser({
        isAdmin: true,
        incomingItemTypes: ["INDIVIDUAL", "TEAM"],
        persistedSubmittedItemTypes: [],
      })
    ).toBe(false);
  });

  it("allows homogeneous for general user", () => {
    expect(
      shouldBlockPersonalEntryItemsXorForGeneralUser({
        isAdmin: false,
        incomingItemTypes: ["TEAM", "TEAM"],
        persistedSubmittedItemTypes: [],
      })
    ).toBe(false);
  });

  it("allows team-only intent with empty items", () => {
    expect(
      shouldBlockPersonalEntryItemsXorForGeneralUser({
        isAdmin: false,
        incomingItemTypes: [],
        persistedSubmittedItemTypes: ["TEAM"],
      })
    ).toBe(false);
  });

  it("blocks mixed for general user without legacy row", () => {
    expect(
      shouldBlockPersonalEntryItemsXorForGeneralUser({
        isAdmin: false,
        incomingItemTypes: ["INDIVIDUAL", "TEAM"],
        persistedSubmittedItemTypes: [],
      })
    ).toBe(true);
  });

  it("allows mixed only when persisted was already mixed", () => {
    expect(
      shouldBlockPersonalEntryItemsXorForGeneralUser({
        isAdmin: false,
        incomingItemTypes: ["INDIVIDUAL", "TEAM"],
        persistedSubmittedItemTypes: ["INDIVIDUAL", "TEAM"],
      })
    ).toBe(false);
  });
});

describe("teamOnlyItemSelectionRequiresClubId", () => {
  it("true when club required, all TEAM items, and clubId missing", () => {
    expect(teamOnlyItemSelectionRequiresClubId(true, ["TEAM"], null)).toBe(true);
    expect(teamOnlyItemSelectionRequiresClubId(true, ["TEAM"], "")).toBe(true);
  });

  it("false when clubId present", () => {
    expect(teamOnlyItemSelectionRequiresClubId(true, ["TEAM"], "c1")).toBe(false);
  });

  it("false when not team-only or club not required", () => {
    expect(teamOnlyItemSelectionRequiresClubId(true, ["INDIVIDUAL"], null)).toBe(false);
    expect(teamOnlyItemSelectionRequiresClubId(true, ["INDIVIDUAL", "TEAM"], null)).toBe(false);
    expect(teamOnlyItemSelectionRequiresClubId(false, ["TEAM"], null)).toBe(false);
  });
});
