import { afterEach, describe, expect, it } from "vitest";
import {
  PREVIEW_EMAIL_ALLOWLIST_UNSET,
  PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED,
  assertPreviewEmailRecipientsAllowed,
  evaluatePreviewEmailAllowlist,
  isPreviewEmailBlockedError,
  isVercelPreviewEnvironment,
  normalizeEmailAddress,
  parsePreviewEmailAllowedRecipients,
} from "./previewEmailAllowlist";

describe("previewEmailAllowlist", () => {
  afterEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS;
  });

  it("normalizeEmailAddress handles angle-bracket form", () => {
    expect(normalizeEmailAddress("Tanaka <Tanaka@Example.COM>")).toBe(
      "tanaka@example.com"
    );
  });

  it("parsePreviewEmailAllowedRecipients splits commas and whitespace", () => {
    expect(
      parsePreviewEmailAllowedRecipients("a@ex.com, b@ex.com;c@ex.com\nd@ex.com")
    ).toEqual(["a@ex.com", "b@ex.com", "c@ex.com", "d@ex.com"]);
  });

  it("isVercelPreviewEnvironment is true only for preview", () => {
    expect(isVercelPreviewEnvironment({})).toBe(false);
    expect(isVercelPreviewEnvironment({ VERCEL_ENV: "production" })).toBe(false);
    expect(isVercelPreviewEnvironment({ VERCEL_ENV: "development" })).toBe(false);
    expect(isVercelPreviewEnvironment({ VERCEL_ENV: "preview" })).toBe(true);
  });

  it("production does not enforce allowlist", () => {
    const decision = evaluatePreviewEmailAllowlist(["anyone@example.com"], {
      VERCEL_ENV: "production",
      PREVIEW_EMAIL_ALLOWED_RECIPIENTS: "",
    });
    expect(decision).toEqual({ ok: true, enforced: false });
  });

  it("local (unset VERCEL_ENV) does not enforce allowlist", () => {
    const decision = evaluatePreviewEmailAllowlist(["anyone@example.com"], {
      PREVIEW_EMAIL_ALLOWED_RECIPIENTS: "",
    });
    expect(decision).toEqual({ ok: true, enforced: false });
  });

  it("preview rejects when allowlist is unset", () => {
    const decision = evaluatePreviewEmailAllowlist(["a@ex.com"], {
      VERCEL_ENV: "preview",
    });
    expect(decision).toEqual({ ok: false, reason: PREVIEW_EMAIL_ALLOWLIST_UNSET });
  });

  it("preview rejects when allowlist is empty/whitespace", () => {
    const decision = evaluatePreviewEmailAllowlist(["a@ex.com"], {
      VERCEL_ENV: "preview",
      PREVIEW_EMAIL_ALLOWED_RECIPIENTS: "  ,  ; ",
    });
    expect(decision).toEqual({ ok: false, reason: PREVIEW_EMAIL_ALLOWLIST_UNSET });
  });

  it("preview allows only listed recipients", () => {
    const env = {
      VERCEL_ENV: "preview",
      PREVIEW_EMAIL_ALLOWED_RECIPIENTS: "ok@ex.com, other@ex.com",
    };
    expect(evaluatePreviewEmailAllowlist(["ok@ex.com"], env)).toEqual({
      ok: true,
      enforced: true,
    });
    expect(evaluatePreviewEmailAllowlist(["OK@ex.com"], env)).toEqual({
      ok: true,
      enforced: true,
    });
    expect(evaluatePreviewEmailAllowlist(["nope@ex.com"], env)).toEqual({
      ok: false,
      reason: PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED,
      recipient: "nope@ex.com",
    });
  });

  it("preview rejects if any of multiple recipients is outside the list", () => {
    const decision = evaluatePreviewEmailAllowlist(
      ["ok@ex.com", "bad@ex.com"],
      {
        VERCEL_ENV: "preview",
        PREVIEW_EMAIL_ALLOWED_RECIPIENTS: "ok@ex.com",
      }
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toBe(PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED);
    }
  });

  it("assertPreviewEmailRecipientsAllowed throws coded errors in preview", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS;
    expect(() => assertPreviewEmailRecipientsAllowed(["a@ex.com"])).toThrow(
      PREVIEW_EMAIL_ALLOWLIST_UNSET
    );

    process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS = "a@ex.com";
    expect(() => assertPreviewEmailRecipientsAllowed(["a@ex.com"])).not.toThrow();
    expect(() => assertPreviewEmailRecipientsAllowed(["b@ex.com"])).toThrow(
      PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED
    );
  });

  it("assertPreviewEmailRecipientsAllowed is a no-op outside preview", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS;
    expect(() =>
      assertPreviewEmailRecipientsAllowed(["anyone@example.com"])
    ).not.toThrow();
  });

  it("isPreviewEmailBlockedError recognizes both preview codes", () => {
    expect(
      isPreviewEmailBlockedError(new Error(`${PREVIEW_EMAIL_ALLOWLIST_UNSET}: x`))
    ).toBe(true);
    expect(
      isPreviewEmailBlockedError(
        new Error(`${PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED}: x`)
      )
    ).toBe(true);
    expect(
      isPreviewEmailBlockedError(new Error("Resend が失敗しました (500): x"))
    ).toBe(false);
  });
});
