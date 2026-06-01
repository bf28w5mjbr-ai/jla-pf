import { afterEach, describe, expect, it } from "vitest";
import { isMembershipAutoApproveEnabled } from "./membershipAutoApprove";

describe("isMembershipAutoApproveEnabled", () => {
  const original = process.env.MEMBERSHIP_AUTO_APPROVE;

  afterEach(() => {
    if (original === undefined) delete process.env.MEMBERSHIP_AUTO_APPROVE;
    else process.env.MEMBERSHIP_AUTO_APPROVE = original;
  });

  it("is false when unset", () => {
    delete process.env.MEMBERSHIP_AUTO_APPROVE;
    expect(isMembershipAutoApproveEnabled()).toBe(false);
  });

  it("is true only when explicitly true", () => {
    process.env.MEMBERSHIP_AUTO_APPROVE = "true";
    expect(isMembershipAutoApproveEnabled()).toBe(true);

    process.env.MEMBERSHIP_AUTO_APPROVE = "1";
    expect(isMembershipAutoApproveEnabled()).toBe(false);
  });
});
