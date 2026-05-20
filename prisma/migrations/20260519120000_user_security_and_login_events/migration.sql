-- Split authentication fields from User into UserSecurity; add UserLoginEvent for login history.

CREATE TYPE "AuthLoginChannel" AS ENUM ('PASSWORD', 'SMS_OTP', 'PASSKEY', 'REGISTRATION');

CREATE TABLE "UserSecurity" (
    "userId" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "passwordHash" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnforced" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginUa" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSecurity_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserLoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "AuthLoginChannel" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLoginEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserSecurity" (
    "userId",
    "emailVerified",
    "emailVerifyToken",
    "passwordHash",
    "mfaEnabled",
    "mfaEnforced",
    "lastLoginAt",
    "lastLoginIp",
    "lastLoginUa",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "emailVerified",
    "emailVerifyToken",
    "passwordHash",
    "mfaEnabled",
    "mfaEnforced",
    "lastLoginAt",
    "lastLoginIp",
    "lastLoginUa",
    "createdAt",
    "updatedAt"
FROM "User";

ALTER TABLE "UserSecurity" ADD CONSTRAINT "UserSecurity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLoginEvent" ADD CONSTRAINT "UserLoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserLoginEvent_userId_createdAt_idx" ON "UserLoginEvent"("userId", "createdAt" DESC);

ALTER TABLE "User"
  DROP COLUMN "emailVerified",
  DROP COLUMN "emailVerifyToken",
  DROP COLUMN "passwordHash",
  DROP COLUMN "mfaEnabled",
  DROP COLUMN "mfaEnforced",
  DROP COLUMN "lastLoginAt",
  DROP COLUMN "lastLoginIp",
  DROP COLUMN "lastLoginUa";
