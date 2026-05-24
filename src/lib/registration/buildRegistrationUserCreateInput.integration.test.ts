import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hashOTP, generateOTP } from "@/lib/otp";
import { Sex } from "@prisma/client";
import { buildRegistrationUserCreateInput } from "@/lib/registration/buildRegistrationUserCreateInput";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";

describe.skipIf(!runIntegration)(
  "buildRegistrationUserCreateInput integration",
  () => {
    const createdUserIds: string[] = [];
    const createdSessionIds: string[] = [];

    afterAll(async () => {
      for (const id of createdUserIds) {
        await prisma.user.delete({ where: { id } }).catch(() => {});
      }
      for (const id of createdSessionIds) {
        await prisma.registrationSession.delete({ where: { id } }).catch(() => {});
      }
      await prisma.$disconnect();
    });

    it("creates user when emergency contact fields are all null (legacy session shape)", async () => {
      const otp = generateOTP();
      const otpHash = await hashOTP(otp);
      const unique = Date.now();
      const email = `debug-null-ec-${unique}@example.com`;

      const session = await prisma.registrationSession.create({
        data: {
          phoneNumber: "+819012345678",
          familyName: "テスト",
          givenName: "ユーザー",
          familyNameKana: "テスト",
          givenNameKana: "ユーザー",
          dateOfBirth: new Date("1990-06-15"),
          sex: Sex.MALE,
          postalCode: "1500001",
          prefecture: "東京都",
          city: "渋谷区",
          addressLine1: "神南1-1-1",
          emergencyContactFamilyName: null,
          emergencyContactGivenName: null,
          emergencyContactFamilyNameKana: null,
          emergencyContactGivenNameKana: null,
          emergencyContactPhone: null,
          email,
          password: "hash",
          otpHash,
          otpExpiresAt: new Date(Date.now() + 300_000),
          hourlyResetAt: new Date(Date.now() + 3_600_000),
          expiresAt: new Date(Date.now() + 1_800_000),
          registrationOtpDelivery: "EMAIL",
        },
      });
      createdSessionIds.push(session.id);

      const input = buildRegistrationUserCreateInput(session, "テスト", "ユーザー");
      expect(input.emergencyContact).toBeUndefined();

      const user = await prisma.user.create({ data: input });
      createdUserIds.push(user.id);

      const profile = await prisma.userProfile.findUnique({
        where: { userId: user.id },
      });
      expect(profile?.familyName).toBe("テスト");

      const emergency = await prisma.userEmergencyContact.findUnique({
        where: { userId: user.id },
      });
      expect(emergency).toBeNull();
    });
  }
);
