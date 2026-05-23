import { afterEach, describe, expect, it } from "vitest";
import {
  getRegistrationEmailOtpConfigWarnings,
  registrationUsesEmailOtp,
} from "@/lib/smsHoldPolicy";

describe("getRegistrationEmailOtpConfigWarnings", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns empty when email OTP is disabled", () => {
    process.env.SKIP_SMS = "false";
    process.env.REGISTRATION_EMAIL_OTP = "false";
    expect(registrationUsesEmailOtp()).toBe(false);
    expect(getRegistrationEmailOtpConfigWarnings()).toEqual([]);
  });

  it("warns when email OTP enabled without RESEND_API_KEY", () => {
    process.env.SKIP_SMS = "true";
    process.env.REGISTRATION_EMAIL_OTP = "true";
    delete process.env.RESEND_API_KEY;
    process.env.AUTH_SECRET = "x".repeat(32);

    expect(getRegistrationEmailOtpConfigWarnings()).toContain(
      "registration_email_otp_enabled_but_resend_api_key_missing"
    );
  });
});
