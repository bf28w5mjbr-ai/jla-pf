import { describe, expect, it } from "vitest";
import {
  mergeOfficialResultVisibilityFilter,
  officialResultPublicVisibilityWhere,
} from "@/lib/officialResultPublicVisibility";

describe("officialResultPublicVisibility", () => {
  it("公開条件は lockedAt または heatConfirmations", () => {
    expect(officialResultPublicVisibilityWhere()).toEqual({
      OR: [{ lockedAt: { not: null } }, { heatConfirmations: { some: {} } }],
    });
  });

  it("canViewAll のときは base のみ", () => {
    const base = { competitionId: "c1" };
    expect(mergeOfficialResultVisibilityFilter(base, true)).toEqual(base);
  });

  it("canViewAll でないときは AND で公開条件を付与", () => {
    const base = { competitionId: "c1", eventId: "e1" };
    expect(mergeOfficialResultVisibilityFilter(base, false)).toEqual({
      AND: [base, officialResultPublicVisibilityWhere()],
    });
  });
});
