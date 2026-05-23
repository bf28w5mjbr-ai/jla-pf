import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/otp", () => ({
  verifyOTP: vi.fn(),
}));

vi.mock("@/lib/smsOtpSupabase", () => ({
  isSupabaseSmsOtpChannelActive: vi.fn(),
}));

vi.mock("@/lib/supabase/otp", () => ({
  verifySmsOtpViaSupabase: vi.fn(),
}));

import { verifyChannelOtp } from "@/lib/otp/verifyChannelOtp";
import { verifyOTP } from "@/lib/otp";
import { isSupabaseSmsOtpChannelActive } from "@/lib/smsOtpSupabase";
import { verifySmsOtpViaSupabase } from "@/lib/supabase/otp";

describe("verifyChannelOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const base = {
    otp: "123456",
    otpHash: "hash",
    phoneNumber: "+819012345678",
  };

  it("uses stored OTP when useStoredOtp is true", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(true);
    vi.mocked(verifyOTP).mockResolvedValue(true);

    const result = await verifyChannelOtp({ ...base, useStoredOtp: true });

    expect(result).toBe(true);
    expect(verifyOTP).toHaveBeenCalledWith("123456", "hash");
    expect(verifySmsOtpViaSupabase).not.toHaveBeenCalled();
  });

  it("uses Supabase when useStoredOtp is false and channel active", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(true);
    vi.mocked(verifySmsOtpViaSupabase).mockResolvedValue(true);

    const result = await verifyChannelOtp({ ...base, useStoredOtp: false });

    expect(result).toBe(true);
    expect(verifySmsOtpViaSupabase).toHaveBeenCalledWith("+819012345678", "123456");
  });

  it("returns false when Supabase throws", async () => {
    vi.mocked(isSupabaseSmsOtpChannelActive).mockReturnValue(true);
    vi.mocked(verifySmsOtpViaSupabase).mockRejectedValue(new Error("env missing"));

    const result = await verifyChannelOtp({ ...base, useStoredOtp: false });

    expect(result).toBe(false);
  });
});
