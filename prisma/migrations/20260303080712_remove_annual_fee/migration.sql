/*
  Warnings:

  - You are about to drop the column `annualFee` on the `Organization` table. All the data in the column will be lost.
  - You are about to drop the column `annualFeeDescription` on the `Organization` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "annualFee",
DROP COLUMN "annualFeeDescription";
