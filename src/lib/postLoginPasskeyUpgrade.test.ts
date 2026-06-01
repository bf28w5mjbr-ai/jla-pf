import { describe, expect, it } from "vitest";
import { resolvePostLoginPath } from "./postLoginPasskeyUpgrade";

describe("resolvePostLoginPath", () => {
  it("sends password login with no passkeys to upgrade page", () => {
    expect(
      resolvePostLoginPath({
        redirectAfterLogin: "/dashboard",
        passkeyCredentialCount: 0,
        supportsPasskey: true,
        loginMethod: "password",
      })
    ).toBe("/register/passkey?source=login&redirect=%2Fdashboard");
  });

  it("uses dashboard when redirect is null", () => {
    expect(
      resolvePostLoginPath({
        redirectAfterLogin: null,
        passkeyCredentialCount: 0,
        supportsPasskey: true,
        loginMethod: "password",
      })
    ).toBe("/register/passkey?source=login");
  });

  it("skips upgrade when passkeys exist", () => {
    expect(
      resolvePostLoginPath({
        redirectAfterLogin: "/invite/x",
        passkeyCredentialCount: 1,
        supportsPasskey: true,
        loginMethod: "password",
      })
    ).toBe("/invite/x");
  });

  it("skips upgrade when WebAuthn is unsupported", () => {
    expect(
      resolvePostLoginPath({
        redirectAfterLogin: null,
        passkeyCredentialCount: 0,
        supportsPasskey: false,
        loginMethod: "password",
      })
    ).toBe("/dashboard");
  });

  it("never redirects after passkey login", () => {
    expect(
      resolvePostLoginPath({
        redirectAfterLogin: "/dashboard",
        passkeyCredentialCount: 0,
        supportsPasskey: true,
        loginMethod: "passkey",
      })
    ).toBe("/dashboard");
  });
});
