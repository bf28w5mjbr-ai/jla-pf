import { describe, expect, it } from "vitest";
import {
  hostOrgAdminCanManageCompetition,
  hostOrgAdminCanManageOnboarding,
  hasOrgAdminAccess,
} from "./roleScopes";

describe("roleScopes organizer helpers", () => {
  const adminRow = [{ role: "ADMIN" as const }];
  const memberRow = [{ role: "MEMBER" as const }];

  it("hasOrgAdminAccess is ADMIN only", () => {
    expect(hasOrgAdminAccess(adminRow)).toBe(true);
    expect(hasOrgAdminAccess(memberRow)).toBe(false);
  });

  it("hostOrgAdminCanManageCompetition requires APPROVED", () => {
    expect(hostOrgAdminCanManageCompetition(adminRow, "APPROVED")).toBe(true);
    expect(hostOrgAdminCanManageCompetition(adminRow, "PENDING")).toBe(false);
    expect(hostOrgAdminCanManageCompetition(adminRow, "SUSPENDED")).toBe(false);
  });

  it("hostOrgAdminCanManageOnboarding allows PENDING", () => {
    expect(hostOrgAdminCanManageOnboarding(adminRow, "PENDING")).toBe(true);
    expect(hostOrgAdminCanManageOnboarding(adminRow, "APPROVED")).toBe(true);
    expect(hostOrgAdminCanManageOnboarding(adminRow, "SUSPENDED")).toBe(false);
  });
});
