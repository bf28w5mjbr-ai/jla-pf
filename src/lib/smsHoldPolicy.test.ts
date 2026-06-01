import { afterEach, describe, expect, it } from "vitest";
import {
  getAuthPublicFlags,
  getRegistrationEmailOtpConfigWarnings,
  isSmsOutboundHeld,
  registrationUsesEmailOtp,
} from "@/lib/smsHoldPolicy";

describe("smsHoldPolicy", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("registrationUsesEmailOtp is always true", () => {
    expect(registrationUsesEmailOtp()).toBe(true);
  });

  it("isSmsOutboundHeld follows SKIP_SMS", () => {
    process.env.SKIP_SMS = "true";
    expect(isSmsOutboundHeld()).toBe(true);
    process.env.SKIP_SMS = "false";
    expect(isSmsOutboundHeld()).toBe(false);
  });

  it("getAuthPublicFlags exposes email registration and outbound hold", () => {
    process.env.SKIP_SMS = "true";
    delete process.env.RESEND_API_KEY;
    expect(getAuthPublicFlags()).toEqual({
      registrationEmailOtp: true,
      resendApiKeyConfigured: false,
      smsOutboundHeld: true,
    });
  });
});

describe("getRegistrationEmailOtpConfigWarnings", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("warns when RESEND_API_KEY is missing", () => {
    delete process.env.RESEND_API_KEY;
    process.env.AUTH_SECRET = "x".repeat(32);
    expect(getRegistrationEmailOtpConfigWarnings()).toContain(
      "registration_email_otp_enabled_but_resend_api_key_missing"
    );
  });

  it("warns when AUTH_SECRET is too short", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_SECRET = "short";
    expect(getRegistrationEmailOtpConfigWarnings()).toContain(
      "auth_secret_missing_or_too_short_for_session_issue"
    );
  });
});
