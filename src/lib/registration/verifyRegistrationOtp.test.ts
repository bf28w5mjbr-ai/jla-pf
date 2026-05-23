import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/otp", () => ({
  verifyOTP: vi.fn(),
}));

vi.mock("@/lib/smsOtpSupabase", () => ({
  isSupabaseSmsOtpChannelActive: vi.fn(),
}));

vi.mock("@/lib/supabase/otp", () => ({
  verifySmsOtpViaSupabase: vi.fn(),
}));

import { verifyRegistrationOtp } from "@/lib/registration/verifyRegistrationOtp";
import { verifyOTP } from "@/lib/otp";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { verifySmsOtpViaSupabase } from "@/lib/supabase/otp";

const baseSession = {
  phoneNumber: "+819012345678",
  otpHash: "hashed-otp",
};

describe("verifyRegistrationOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses verifyOTP for EMAIL delivery regardless of Supabase setting", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(true);
    vi.mocked(verifyOTP).mockResolvedValue(true);

    const result = await verifyRegistrationOtp(
      { ...baseSession, registrationOtpDelivery: "EMAIL" },
      "123456"
    );

    expect(result).toBe(true);
    expect(verifyOTP).toHaveBeenCalledWith("123456", "hashed-otp");
    expect(verifySmsOtpViaSupabase).not.toHaveBeenCalled();
  });

  it("uses Supabase verification for SMS delivery when Supabase channel is active", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(true);
    vi.mocked(verifySmsOtpViaSupabase).mockResolvedValue(true);

    const result = await verifyRegistrationOtp(
      { ...baseSession, registrationOtpDelivery: "SMS" },
      "654321"
    );

    expect(result).toBe(true);
    expect(verifySmsOtpViaSupabase).toHaveBeenCalledWith("+819012345678", "654321");
    expect(verifyOTP).not.toHaveBeenCalled();
  });

  it("uses verifyOTP for SMS delivery when Supabase channel is inactive", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(false);
    vi.mocked(verifyOTP).mockResolvedValue(false);

    const result = await verifyRegistrationOtp(
      { ...baseSession, registrationOtpDelivery: "SMS" },
      "111111"
    );

    expect(result).toBe(false);
    expect(verifyOTP).toHaveBeenCalledWith("111111", "hashed-otp");
    expect(verifySmsOtpViaSupabase).not.toHaveBeenCalled();
  });

  it("returns false when Supabase verification throws instead of propagating", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(true);
    vi.mocked(verifySmsOtpViaSupabase).mockRejectedValue(new Error("Supabase env missing"));

    const result = await verifyRegistrationOtp(
      { ...baseSession, registrationOtpDelivery: "SMS" },
      "222222"
    );

    expect(result).toBe(false);
    expect(verifyOTP).not.toHaveBeenCalled();
  });

  it("uses verifyOTP for legacy sessions without registrationOtpDelivery", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(false);
    vi.mocked(verifyOTP).mockResolvedValue(true);

    const result = await verifyRegistrationOtp(
      { ...baseSession, registrationOtpDelivery: null },
      "333333"
    );

    expect(result).toBe(true);
    expect(verifyOTP).toHaveBeenCalledWith("333333", "hashed-otp");
  });
});
