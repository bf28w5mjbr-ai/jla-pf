import { describe, expect, it } from "vitest";
import { billingCountsForPersonalEntryPost, calculateCompetitionEntryFee } from "./entryFee";

describe("calculateCompetitionEntryFee", () => {
  const tieredFee = {
    ageFeeTiers: [
      { minAge: 6, maxAge: 12, individualEntryFee: 1000, teamEntryFeePerTeam: 5000 },
      { minAge: 13, maxAge: null, individualEntryFee: 3000, teamEntryFeePerTeam: 8000 },
    ],
  };

  it("team-only charges individual unit only (no team unit multiply by team count)", () => {
    expect(
      calculateCompetitionEntryFee(
        tieredFee,
        { individualCount: 0, teamCount: 2 },
        { userAgeYearsAtCompetitionStart: 20 }
      )
    ).toBe(3000);
  });

  it("individual-only uses single individual unit regardless of event count", () => {
    expect(
      calculateCompetitionEntryFee(
        tieredFee,
        { individualCount: 2, teamCount: 0 },
        { userAgeYearsAtCompetitionStart: 20 }
      )
    ).toBe(3000);
  });

  it("individual and team both positive uses individual unit plus team unit times team count", () => {
    expect(
      calculateCompetitionEntryFee(
        tieredFee,
        { individualCount: 1, teamCount: 1 },
        { userAgeYearsAtCompetitionStart: 20 }
      )
    ).toBe(3000 + 8000);
  });

  it("flat fee team-only charges individual portion only", () => {
    expect(
      calculateCompetitionEntryFee(
        { individualEntryFee: 5000, teamEntryFeePerTeam: 12000 },
        { individualCount: 0, teamCount: 3 },
        {}
      )
    ).toBe(5000);
  });

  it("billing slot teamCount=1 yields same as one individual unit (tiered)", () => {
    expect(
      calculateCompetitionEntryFee(
        tieredFee,
        { individualCount: 0, teamCount: 1 },
        { userAgeYearsAtCompetitionStart: 20 }
      )
    ).toBe(3000);
  });
});

describe("billingCountsForPersonalEntryPost", () => {
  it("synthesizes teamCount=1 for team-only intent with no items/team rows (fee trigger only)", () => {
    expect(
      billingCountsForPersonalEntryPost({
        teamOnlyIntentWithoutItemSelection: true,
        entryItemsCount: 0,
        teamEntriesCount: 0,
      })
    ).toEqual({ individualCount: 0, teamCount: 1 });
  });

  it("does not synthesize when intent flag is false", () => {
    expect(
      billingCountsForPersonalEntryPost({
        teamOnlyIntentWithoutItemSelection: false,
        entryItemsCount: 0,
        teamEntriesCount: 0,
      })
    ).toEqual({ individualCount: 0, teamCount: 0 });
  });

  it("does not override when items exist", () => {
    expect(
      billingCountsForPersonalEntryPost({
        teamOnlyIntentWithoutItemSelection: true,
        entryItemsCount: 1,
        teamEntriesCount: 0,
      })
    ).toEqual({ individualCount: 1, teamCount: 0 });
  });
});
