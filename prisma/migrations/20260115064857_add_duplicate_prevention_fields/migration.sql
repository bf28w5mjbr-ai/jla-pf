/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[jlaMemberNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[legacyJlaMemberNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[normalizedFamilyName,normalizedGivenName,dateOfBirth]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dateOfBirth` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `familyNameKana` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `givenNameKana` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `normalizedFamilyName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `normalizedGivenName` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: 2段階で追加（既存データ対応）
-- Step 1: NULL許可で追加
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "familyNameKana" TEXT,
ADD COLUMN "givenNameKana" TEXT,
ADD COLUMN "jlaMemberNumber" TEXT,
ADD COLUMN "legacyJlaMemberNumber" TEXT,
ADD COLUMN "normalizedFamilyName" TEXT,
ADD COLUMN "normalizedGivenName" TEXT;

-- Step 2: 既存データに仮の値を設定
UPDATE "User" 
SET 
  "dateOfBirth" = '2000-01-01'::timestamp,
  "familyNameKana" = "familyName",
  "givenNameKana" = "givenName",
  "normalizedFamilyName" = "familyName",
  "normalizedGivenName" = "givenName"
WHERE "dateOfBirth" IS NULL;

-- Step 3: NOT NULL制約を追加
ALTER TABLE "User" 
  ALTER COLUMN "dateOfBirth" SET NOT NULL,
  ALTER COLUMN "familyNameKana" SET NOT NULL,
  ALTER COLUMN "givenNameKana" SET NOT NULL,
  ALTER COLUMN "normalizedFamilyName" SET NOT NULL,
  ALTER COLUMN "normalizedGivenName" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_jlaMemberNumber_key" ON "User"("jlaMemberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyJlaMemberNumber_key" ON "User"("legacyJlaMemberNumber");

-- CreateIndex
CREATE INDEX "User_dateOfBirth_normalizedFamilyName_normalizedGivenName_idx" ON "User"("dateOfBirth", "normalizedFamilyName", "normalizedGivenName");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedFamilyName_normalizedGivenName_dateOfBirth_key" ON "User"("normalizedFamilyName", "normalizedGivenName", "dateOfBirth");
