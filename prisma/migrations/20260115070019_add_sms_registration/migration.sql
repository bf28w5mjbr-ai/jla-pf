/*
  Warnings:

  - Added the required column `addressLine1` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `postalCode` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prefecture` to the `User` table without a default value. This is not possible if the table is not empty.
  - Made the column `phoneNumber` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable: 2段階で追加（既存データ対応）
-- Step 1: NULL許可で追加
ALTER TABLE "User" ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "addressLine2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "prefecture" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Step 2: 既存データに仮の値を設定
UPDATE "User" 
SET 
  "postalCode" = '1000001',
  "prefecture" = '東京都',
  "city" = '千代田区',
  "addressLine1" = '千代田1-1-1'
WHERE "postalCode" IS NULL;

-- Step 3: NOT NULL制約を追加（phoneNumberは既存ユーザーが持っている可能性があるので条件付き）
ALTER TABLE "User" 
  ALTER COLUMN "postalCode" SET NOT NULL,
  ALTER COLUMN "prefecture" SET NOT NULL,
  ALTER COLUMN "city" SET NOT NULL,
  ALTER COLUMN "addressLine1" SET NOT NULL;

-- phoneNumberがNULLの既存ユーザーに仮の値を設定
UPDATE "User" SET "phoneNumber" = '+8100000000000' WHERE "phoneNumber" IS NULL;

-- phoneNumberを必須に変更
ALTER TABLE "User" ALTER COLUMN "phoneNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "RegistrationSession" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyNameKana" TEXT NOT NULL,
    "givenNameKana" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "postalCode" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "email" TEXT,
    "otpHash" TEXT NOT NULL,
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "hourlyResetAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationSession_phoneNumber_idx" ON "RegistrationSession"("phoneNumber");

-- CreateIndex
CREATE INDEX "RegistrationSession_expiresAt_idx" ON "RegistrationSession"("expiresAt");
