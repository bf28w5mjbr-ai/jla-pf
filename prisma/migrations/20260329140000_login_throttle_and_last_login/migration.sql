-- CreateTable
CREATE TABLE "LoginThrottleBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottleBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginThrottleBucket_key_key" ON "LoginThrottleBucket"("key");
CREATE INDEX "LoginThrottleBucket_windowStart_idx" ON "LoginThrottleBucket"("windowStart");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "lastLoginIp" TEXT,
ADD COLUMN "lastLoginUa" VARCHAR(512);
