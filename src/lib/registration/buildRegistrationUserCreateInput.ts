import { Prisma, RegistrationSession } from "@prisma/client";

/** PII を出さずセッション必須項目の欠損を検出する */
export function registrationSessionFieldPresence(session: RegistrationSession) {
  const str = (v: string | null | undefined) =>
    v != null && v.trim().length > 0;

  return {
    profileFamilyName: str(session.familyName),
    profileGivenName: str(session.givenName),
    profileFamilyNameKana: str(session.familyNameKana),
    profileGivenNameKana: str(session.givenNameKana),
    emergencyFamilyName: str(session.emergencyContactFamilyName),
    emergencyGivenName: str(session.emergencyContactGivenName),
    emergencyFamilyNameKana: str(session.emergencyContactFamilyNameKana),
    emergencyGivenNameKana: str(session.emergencyContactGivenNameKana),
    emergencyPhone: str(session.emergencyContactPhone),
  };
}

export function hasEmergencyContactData(session: RegistrationSession): boolean {
  const p = registrationSessionFieldPresence(session);
  return (
    p.emergencyFamilyName ||
    p.emergencyGivenName ||
    p.emergencyFamilyNameKana ||
    p.emergencyGivenNameKana ||
    p.emergencyPhone
  );
}

export function missingRequiredProfileFields(
  session: RegistrationSession
): string[] {
  const p = registrationSessionFieldPresence(session);
  const missing: string[] = [];
  if (!p.profileFamilyName) missing.push("familyName");
  if (!p.profileGivenName) missing.push("givenName");
  if (!p.profileFamilyNameKana) missing.push("familyNameKana");
  if (!p.profileGivenNameKana) missing.push("givenNameKana");
  return missing;
}

export function buildRegistrationUserCreateInput(
  session: RegistrationSession,
  normalizedFamilyName: string,
  normalizedGivenName: string
): Prisma.UserCreateInput {
  const verifiedPhoneBySms = session.registrationOtpDelivery !== "EMAIL";

  const data: Prisma.UserCreateInput = {
    email: session.email || `${session.phoneNumber.replace("+", "")}@temp.jla.local`,
    security: {
      create: {
        emailVerified: !verifiedPhoneBySms,
        passwordHash: session.password || null,
      },
    },
    profile: {
      create: {
        familyName: session.familyName,
        givenName: session.givenName,
        familyNameKana: session.familyNameKana,
        givenNameKana: session.givenNameKana,
        normalizedFamilyName,
        normalizedGivenName,
        dateOfBirth: session.dateOfBirth,
        sex: session.sex,
      },
    },
    contact: {
      create: {
        phoneNumber: session.phoneNumber,
        phoneVerified: verifiedPhoneBySms,
        phoneVerifiedAt: verifiedPhoneBySms ? new Date() : null,
      },
    },
    address: {
      create: {
        postalCode: session.postalCode,
        prefecture: session.prefecture,
        city: session.city,
        addressLine1: session.addressLine1,
        addressLine2: session.addressLine2,
      },
    },
    jlaProfile: { create: {} },
    nfcTag: { create: {} },
  };

  if (hasEmergencyContactData(session)) {
    data.emergencyContact = {
      create: {
        familyName: session.emergencyContactFamilyName || null,
        givenName: session.emergencyContactGivenName || null,
        familyNameKana: session.emergencyContactFamilyNameKana || null,
        givenNameKana: session.emergencyContactGivenNameKana || null,
        phoneNumber: session.emergencyContactPhone || null,
      },
    };
  }

  return data;
}
