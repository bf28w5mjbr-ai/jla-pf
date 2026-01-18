/*
  Warnings:

  - Added the required column `sex` to the `RegistrationSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sex` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable: 2段階で追加（既存データ対応）
ALTER TABLE "RegistrationSession" ADD COLUMN "sex" "Sex";

-- AlterTable: Userも2段階
ALTER TABLE "User" ADD COLUMN "sex" "Sex";

-- 既存データにデフォルト値を設定
UPDATE "User" SET "sex" = 'OTHER' WHERE "sex" IS NULL;

-- NOT NULL制約を追加
ALTER TABLE "User" ALTER COLUMN "sex" SET NOT NULL;
ALTER TABLE "RegistrationSession" ALTER COLUMN "sex" SET NOT NULL;
