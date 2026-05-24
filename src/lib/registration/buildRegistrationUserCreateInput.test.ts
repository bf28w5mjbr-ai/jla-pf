import { describe, expect, it } from "vitest";
import { RegistrationSession, Sex } from "@prisma/client";
import {
  buildRegistrationUserCreateInput,
  hasEmergencyContactData,
  missingRequiredProfileFields,
  registrationSessionFieldPresence,
} from "@/lib/registration/buildRegistrationUserCreateInput";

function baseSession(
  overrides: Partial<RegistrationSession> = {}
): RegistrationSession {
  const now = new Date();
  return {
    id: "sess_test",
    phoneNumber: "+819012345678",
    familyName: "山田",
    givenName: "太郎",
    familyNameKana: "ヤマダ",
    givenNameKana: "タロウ",
    dateOfBirth: new Date("1990-01-01"),
    sex: Sex.MALE,
    postalCode: "1500001",
    prefecture: "東京都",
    city: "渋谷区",
    addressLine1: "神南1-1-1",
    addressLine2: null,
    emergencyContactFamilyName: "山田",
    emergencyContactGivenName: "花子",
    emergencyContactFamilyNameKana: "ヤマダ",
    emergencyContactGivenNameKana: "ハナコ",
    emergencyContactPhone: "+819011111111",
    email: "test@example.com",
    password: "hash",
    otpHash: "hash",
    otpAttempts: 0,
    otpExpiresAt: new Date(now.getTime() + 300_000),
    registrationOtpDelivery: "EMAIL",
    lastSentAt: now,
    sendCount: 1,
    hourlyResetAt: new Date(now.getTime() + 3_600_000),
    expiresAt: new Date(now.getTime() + 1_800_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("buildRegistrationUserCreateInput", () => {
  it("omits emergencyContact nested create when all emergency fields are null", () => {
    const session = baseSession({
      emergencyContactFamilyName: null,
      emergencyContactGivenName: null,
      emergencyContactFamilyNameKana: null,
      emergencyContactGivenNameKana: null,
      emergencyContactPhone: null,
    });

    expect(hasEmergencyContactData(session)).toBe(false);
    const input = buildRegistrationUserCreateInput(session, "ヤマダ", "タロウ");
    expect(input.emergencyContact).toBeUndefined();
  });

  it("includes emergencyContact when any emergency field is present", () => {
    const session = baseSession({
      emergencyContactFamilyName: null,
      emergencyContactGivenName: null,
      emergencyContactFamilyNameKana: null,
      emergencyContactGivenNameKana: null,
      emergencyContactPhone: "+819011111111",
    });

    expect(hasEmergencyContactData(session)).toBe(true);
    const input = buildRegistrationUserCreateInput(session, "ヤマダ", "タロウ");
    expect(input.emergencyContact).toBeDefined();
  });

  it("detects missing profile familyName", () => {
    const session = baseSession({ familyName: "" });
    const presence = registrationSessionFieldPresence(session);
    expect(presence.profileFamilyName).toBe(false);
    expect(missingRequiredProfileFields(session)).toContain("familyName");
  });
});
