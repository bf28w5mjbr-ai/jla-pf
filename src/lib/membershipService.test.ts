import { describe, expect, it } from "vitest";
import { membershipServiceErrorStatus } from "./membershipService";

describe("membershipServiceErrorStatus", () => {
  it("maps not found codes to 404", () => {
    expect(membershipServiceErrorStatus("CLUB_NOT_FOUND")).toBe(404);
    expect(membershipServiceErrorStatus("MEMBERSHIP_NOT_FOUND")).toBe(404);
  });

  it("maps pending application to 400", () => {
    expect(membershipServiceErrorStatus("PENDING_APPLICATION")).toBe(400);
  });

  it("maps rate limit to 429", () => {
    expect(membershipServiceErrorStatus("RATE_LIMIT_EXCEEDED")).toBe(429);
    expect(membershipServiceErrorStatus("REJECTED_COOLDOWN")).toBe(429);
  });

  it("maps unauthorized to 403", () => {
    expect(membershipServiceErrorStatus("UNAUTHORIZED")).toBe(403);
  });
});
