import { describe, expect, it } from "vitest";
import {
  computeTeamOnlyIntentPersonalEntryFee,
  countSnapshotRowsForEntryBilling,
  isTeamOnlyIntentWithoutItemSelectionFromSnapshot,
  resolveClubIdForTeamOnlyIntent,
} from "./teamOnlyIntentZeroFeeReconcile";

describe("countSnapshotRowsForEntryBilling", () => {
  it("counts only rows with non-empty eventId for items", () => {
    expect(
      countSnapshotRowsForEntryBilling({
        items: [{ eventId: "e1" }, { eventId: "  " }, {}],
        teamEntries: [],
      })
    ).toEqual({ itemRows: 1, teamEntryRows: 0 });
  });

  it("counts team rows only when eventId and teamName are set", () => {
    expect(
      countSnapshotRowsForEntryBilling({
        items: [],
        teamEntries: [
          { eventId: "t1", teamName: "A" },
          { eventId: "t2", teamName: "  " },
          { eventId: "", teamName: "B" },
        ],
      })
    ).toEqual({ itemRows: 0, teamEntryRows: 1 });
  });
});

describe("resolveClubIdForTeamOnlyIntent", () => {
  it("prefers entry club over snapshot", () => {
    expect(
      resolveClubIdForTeamOnlyIntent("entry-club", { clubId: "snap-club" })
    ).toBe("entry-club");
  });

  it("falls back to snapshot club", () => {
    expect(resolveClubIdForTeamOnlyIntent(null, { clubId: "snap-club" })).toBe("snap-club");
  });
});

describe("isTeamOnlyIntentWithoutItemSelectionFromSnapshot", () => {
  it("is true when no rows and club resolved", () => {
    expect(
      isTeamOnlyIntentWithoutItemSelectionFromSnapshot("club-1", {
        items: [],
        teamEntries: [],
        clubId: null,
      })
    ).toBe(true);
  });

  it("is false without club", () => {
    expect(
      isTeamOnlyIntentWithoutItemSelectionFromSnapshot(null, {
        items: [],
        teamEntries: [],
      })
    ).toBe(false);
  });

  it("is false when snapshot has item rows", () => {
    expect(
      isTeamOnlyIntentWithoutItemSelectionFromSnapshot("club-1", {
        items: [{ eventId: "e1" }],
        teamEntries: [],
      })
    ).toBe(false);
  });
});

describe("computeTeamOnlyIntentPersonalEntryFee", () => {
  it("charges individual unit for team-only intent (flat fee config)", () => {
    expect(
      computeTeamOnlyIntentPersonalEntryFee({
        competitionStartDate: new Date("2026-06-01"),
        entryFee: { individualEntryFee: 4000, teamEntryFeePerTeam: 10000 },
        ageCategories: [],
        userDateOfBirth: new Date("1990-01-01"),
      })
    ).toBe(4000);
  });

  it("returns 0 when entry fee is unset", () => {
    expect(
      computeTeamOnlyIntentPersonalEntryFee({
        competitionStartDate: new Date("2026-06-01"),
        entryFee: null,
        ageCategories: [],
        userDateOfBirth: new Date("1990-01-01"),
      })
    ).toBe(0);
  });
});
