import { describe, expect, it, vi } from "vitest";
import { verifyRegistrationOtp } from "@/lib/registration/verifyRegistrationOtp";

vi.mock("@/lib/otp/verifyChannelOtp", () => ({
  verifyChannelOtp: vi.fn(),
}));

import { verifyChannelOtp } from "@/lib/otp/verifyChannelOtp";

describe("verifyRegistrationOtp", () => {
  const baseSession = {
    registrationOtpDelivery: "EMAIL",
    phoneNumber: "+819012345678",
    otpHash: "hash",
  };

  it("uses stored otp hash for email delivery", async () => {
    vi.mocked(verifyChannelOtp).mockResolvedValue(true);

    const result = await verifyRegistrationOtp(baseSession, "123456");

    expect(result).toBe(true);
    expect(verifyChannelOtp).toHaveBeenCalledWith({
      otp: "123456",
      otpHash: "hash",
      phoneNumber: "+819012345678",
      useStoredOtp: true,
      logContext: "registration/verify",
    });
  });
});
