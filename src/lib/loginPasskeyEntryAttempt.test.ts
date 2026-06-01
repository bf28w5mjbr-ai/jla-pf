import { describe, expect, it } from "vitest";
import {
  LOGIN_DISCOVERABLE_ATTEMPTED_KEY,
  hasPassivePasskeyLoginBeenAttempted,
  markPassivePasskeyLoginAttempted,
  shouldAttemptPassivePasskeyLogin,
} from "./loginPasskeyEntryAttempt";

function mockStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("loginPasskeyEntryAttempt", () => {
  it("detects prior attempt from session storage", () => {
    const storage = mockStorage({ [LOGIN_DISCOVERABLE_ATTEMPTED_KEY]: "1" });
    expect(hasPassivePasskeyLoginBeenAttempted(storage)).toBe(true);
    expect(
      shouldAttemptPassivePasskeyLogin({
        supportsPasskey: true,
        passkeyRateLimited: false,
        storage,
      })
    ).toBe(false);
  });

  it("allows attempt when supported and not yet tried", () => {
    const storage = mockStorage();
    expect(
      shouldAttemptPassivePasskeyLogin({
        supportsPasskey: true,
        passkeyRateLimited: false,
        storage,
      })
    ).toBe(true);
  });

  it("blocks when WebAuthn unsupported or rate limited", () => {
    const storage = mockStorage();
    expect(
      shouldAttemptPassivePasskeyLogin({
        supportsPasskey: false,
        passkeyRateLimited: false,
        storage,
      })
    ).toBe(false);
    expect(
      shouldAttemptPassivePasskeyLogin({
        supportsPasskey: true,
        passkeyRateLimited: true,
        storage,
      })
    ).toBe(false);
  });

  it("marks attempt in session storage", () => {
    const storage = mockStorage();
    markPassivePasskeyLoginAttempted(storage);
    expect(storage.getItem(LOGIN_DISCOVERABLE_ATTEMPTED_KEY)).toBe("1");
  });
});
