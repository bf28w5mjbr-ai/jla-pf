-- Repair: 20260519104500_user_extension_tables was recorded as applied but
-- User legacy column DROP did not run on some databases. Idempotent re-apply.

DROP INDEX IF EXISTS "User_normalizedFamilyName_normalizedGivenName_dateOfBirth_key";
DROP INDEX IF EXISTS "User_dateOfBirth_normalizedFamilyName_normalizedGivenName_idx";
DROP INDEX IF EXISTS "User_phoneNumber_idx";
DROP INDEX IF EXISTS "User_jlaMemberNumber_key";
DROP INDEX IF EXISTS "User_legacyJlaMemberNumber_key";
DROP INDEX IF EXISTS "User_nfcTagId_idx";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "familyName",
  DROP COLUMN IF EXISTS "givenName",
  DROP COLUMN IF EXISTS "familyNameKana",
  DROP COLUMN IF EXISTS "givenNameKana",
  DROP COLUMN IF EXISTS "normalizedFamilyName",
  DROP COLUMN IF EXISTS "normalizedGivenName",
  DROP COLUMN IF EXISTS "dateOfBirth",
  DROP COLUMN IF EXISTS "sex",
  DROP COLUMN IF EXISTS "phoneNumber",
  DROP COLUMN IF EXISTS "phoneVerified",
  DROP COLUMN IF EXISTS "phoneVerifiedAt",
  DROP COLUMN IF EXISTS "profilePhotoUrl",
  DROP COLUMN IF EXISTS "postalCode",
  DROP COLUMN IF EXISTS "prefecture",
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "addressLine1",
  DROP COLUMN IF EXISTS "addressLine2",
  DROP COLUMN IF EXISTS "emergencyContactFamilyName",
  DROP COLUMN IF EXISTS "emergencyContactGivenName",
  DROP COLUMN IF EXISTS "emergencyContactFamilyNameKana",
  DROP COLUMN IF EXISTS "emergencyContactGivenNameKana",
  DROP COLUMN IF EXISTS "emergencyContactPhone",
  DROP COLUMN IF EXISTS "jlaMemberNumber",
  DROP COLUMN IF EXISTS "legacyJlaMemberNumber",
  DROP COLUMN IF EXISTS "nfcTagId";
