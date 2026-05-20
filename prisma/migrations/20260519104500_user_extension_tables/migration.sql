-- Split non-authentication user details into 1:1 extension tables.

CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyNameKana" TEXT NOT NULL,
    "givenNameKana" TEXT NOT NULL,
    "normalizedFamilyName" TEXT NOT NULL,
    "normalizedGivenName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "profilePhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserContact" (
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserAddress" (
    "userId" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserEmergencyContact" (
    "userId" TEXT NOT NULL,
    "familyName" TEXT,
    "givenName" TEXT,
    "familyNameKana" TEXT,
    "givenNameKana" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmergencyContact_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserJlaProfile" (
    "userId" TEXT NOT NULL,
    "jlaMemberNumber" TEXT,
    "legacyJlaMemberNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserJlaProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserNfcTag" (
    "userId" TEXT NOT NULL,
    "nfcTagId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNfcTag_pkey" PRIMARY KEY ("userId")
);

INSERT INTO "UserProfile" (
    "userId",
    "familyName",
    "givenName",
    "familyNameKana",
    "givenNameKana",
    "normalizedFamilyName",
    "normalizedGivenName",
    "dateOfBirth",
    "sex",
    "profilePhotoUrl",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "familyName",
    "givenName",
    "familyNameKana",
    "givenNameKana",
    "normalizedFamilyName",
    "normalizedGivenName",
    "dateOfBirth",
    "sex",
    "profilePhotoUrl",
    "createdAt",
    "updatedAt"
FROM "User";

INSERT INTO "UserContact" (
    "userId",
    "phoneNumber",
    "phoneVerified",
    "phoneVerifiedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "phoneNumber",
    "phoneVerified",
    "phoneVerifiedAt",
    "createdAt",
    "updatedAt"
FROM "User";

INSERT INTO "UserAddress" (
    "userId",
    "postalCode",
    "prefecture",
    "city",
    "addressLine1",
    "addressLine2",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "postalCode",
    "prefecture",
    "city",
    "addressLine1",
    "addressLine2",
    "createdAt",
    "updatedAt"
FROM "User";

INSERT INTO "UserEmergencyContact" (
    "userId",
    "familyName",
    "givenName",
    "familyNameKana",
    "givenNameKana",
    "phoneNumber",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "emergencyContactFamilyName",
    "emergencyContactGivenName",
    "emergencyContactFamilyNameKana",
    "emergencyContactGivenNameKana",
    "emergencyContactPhone",
    "createdAt",
    "updatedAt"
FROM "User";

INSERT INTO "UserJlaProfile" (
    "userId",
    "jlaMemberNumber",
    "legacyJlaMemberNumber",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "jlaMemberNumber",
    "legacyJlaMemberNumber",
    "createdAt",
    "updatedAt"
FROM "User";

INSERT INTO "UserNfcTag" (
    "userId",
    "nfcTagId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "nfcTagId",
    "createdAt",
    "updatedAt"
FROM "User";

CREATE UNIQUE INDEX "UserProfile_normalizedFamilyName_normalizedGivenName_dateOfBirth_key" ON "UserProfile"("normalizedFamilyName", "normalizedGivenName", "dateOfBirth");
CREATE INDEX "UserProfile_dateOfBirth_normalizedFamilyName_normalizedGivenName_idx" ON "UserProfile"("dateOfBirth", "normalizedFamilyName", "normalizedGivenName");
CREATE INDEX "UserContact_phoneNumber_idx" ON "UserContact"("phoneNumber");
CREATE UNIQUE INDEX "UserJlaProfile_jlaMemberNumber_key" ON "UserJlaProfile"("jlaMemberNumber");
CREATE UNIQUE INDEX "UserJlaProfile_legacyJlaMemberNumber_key" ON "UserJlaProfile"("legacyJlaMemberNumber");
CREATE INDEX "UserNfcTag_nfcTagId_idx" ON "UserNfcTag"("nfcTagId");

ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEmergencyContact" ADD CONSTRAINT "UserEmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserJlaProfile" ADD CONSTRAINT "UserJlaProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNfcTag" ADD CONSTRAINT "UserNfcTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "User_normalizedFamilyName_normalizedGivenName_dateOfBirth_key";
DROP INDEX IF EXISTS "User_dateOfBirth_normalizedFamilyName_normalizedGivenName_idx";
DROP INDEX IF EXISTS "User_phoneNumber_idx";
DROP INDEX IF EXISTS "User_jlaMemberNumber_key";
DROP INDEX IF EXISTS "User_legacyJlaMemberNumber_key";
DROP INDEX IF EXISTS "User_nfcTagId_idx";

ALTER TABLE "User"
  DROP COLUMN "familyName",
  DROP COLUMN "givenName",
  DROP COLUMN "familyNameKana",
  DROP COLUMN "givenNameKana",
  DROP COLUMN "normalizedFamilyName",
  DROP COLUMN "normalizedGivenName",
  DROP COLUMN "dateOfBirth",
  DROP COLUMN "sex",
  DROP COLUMN "phoneNumber",
  DROP COLUMN "phoneVerified",
  DROP COLUMN "phoneVerifiedAt",
  DROP COLUMN "profilePhotoUrl",
  DROP COLUMN "postalCode",
  DROP COLUMN "prefecture",
  DROP COLUMN "city",
  DROP COLUMN "addressLine1",
  DROP COLUMN "addressLine2",
  DROP COLUMN "emergencyContactFamilyName",
  DROP COLUMN "emergencyContactGivenName",
  DROP COLUMN "emergencyContactFamilyNameKana",
  DROP COLUMN "emergencyContactGivenNameKana",
  DROP COLUMN "emergencyContactPhone",
  DROP COLUMN "jlaMemberNumber",
  DROP COLUMN "legacyJlaMemberNumber",
  DROP COLUMN "nfcTagId";
