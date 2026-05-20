import { describe, expect, it } from "vitest";
import {
  OrgAdminInvitationError,
  orgAdminInvitationErrorStatus,
} from "./orgAdminInvitationService";

describe("orgAdminInvitationService", () => {
  it("maps invitation error codes", () => {
    expect(orgAdminInvitationErrorStatus("LAST_ADMIN")).toBe(400);
    expect(orgAdminInvitationErrorStatus("INVITATION_NOT_FOUND")).toBe(404);
    expect(orgAdminInvitationErrorStatus("WRONG_INVITEE")).toBe(403);
  });

  it("OrgAdminInvitationError carries code", () => {
    const err = new OrgAdminInvitationError("LAST_ADMIN", "最後の管理者");
    expect(err.code).toBe("LAST_ADMIN");
  });
});
