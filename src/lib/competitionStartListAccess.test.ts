import { describe, expect, it } from "vitest";
import { canEditCompetitionPublicContent } from "./competitionStartListAccess";

describe("canEditCompetitionPublicContent", () => {
  const adminRow = [{ role: "ADMIN" as const }];

  it("allows host org ADMIN when organization is APPROVED", () => {
    expect(
      canEditCompetitionPublicContent({
        orgAdminsForCurrentUser: adminRow,
        orgStatus: "APPROVED",
      })
    ).toBe(true);
  });

  it("denies non-admin users", () => {
    expect(
      canEditCompetitionPublicContent({
        orgAdminsForCurrentUser: [{ role: "MEMBER" }],
        orgStatus: "APPROVED",
      })
    ).toBe(false);
    expect(
      canEditCompetitionPublicContent({
        orgAdminsForCurrentUser: [],
        orgStatus: "APPROVED",
      })
    ).toBe(false);
  });

  it("denies admin when organization is not operational", () => {
    expect(
      canEditCompetitionPublicContent({
        orgAdminsForCurrentUser: adminRow,
        orgStatus: "PENDING",
      })
    ).toBe(false);
    expect(
      canEditCompetitionPublicContent({
        orgAdminsForCurrentUser: adminRow,
        orgStatus: "SUSPENDED",
      })
    ).toBe(false);
  });
});
