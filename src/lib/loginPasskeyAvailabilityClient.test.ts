import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPasskeyLoginOffered,
  isLoginEmailFormatValid,
  normalizeLoginEmail,
} from "./loginPasskeyAvailabilityClient";

describe("isLoginEmailFormatValid", () => {
  it("accepts normal emails", () => {
    expect(isLoginEmailFormatValid("user@example.com")).toBe(true);
  });

  it("rejects empty and invalid", () => {
    expect(isLoginEmailFormatValid("")).toBe(false);
    expect(isLoginEmailFormatValid("not-an-email")).toBe(false);
  });
});

describe("normalizeLoginEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeLoginEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});

describe("fetchPasskeyLoginOffered", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false without calling API for invalid email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPasskeyLoginOffered("bad")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true when API reports offered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ passkeyLoginOffered: true }),
      })
    );
    await expect(fetchPasskeyLoginOffered("a@b.co")).resolves.toBe(true);
  });

  it("returns false when API reports not offered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ passkeyLoginOffered: false }),
      })
    );
    await expect(fetchPasskeyLoginOffered("a@b.co")).resolves.toBe(false);
  });

  it("returns null on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      })
    );
    await expect(fetchPasskeyLoginOffered("a@b.co")).resolves.toBe(null);
  });
});
