import { describe, expect, it } from "vitest";
import { resolvePasskeyLoginOffered } from "./passkeyLoginAvailability";

describe("resolvePasskeyLoginOffered", () => {
  it("returns false when user is missing", () => {
    expect(resolvePasskeyLoginOffered(null)).toBe(false);
  });

  it("returns false when passkey count is zero", () => {
    expect(
      resolvePasskeyLoginOffered({ _count: { passkeyCredentials: 0 } })
    ).toBe(false);
  });

  it("returns true when passkey count is positive", () => {
    expect(
      resolvePasskeyLoginOffered({ _count: { passkeyCredentials: 2 } })
    ).toBe(true);
  });
});
