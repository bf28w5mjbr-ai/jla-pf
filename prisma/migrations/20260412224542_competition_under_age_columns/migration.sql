-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "underAgeOpenEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "underAgeUThresholds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "underAgeEligibilityEnabled" BOOLEAN NOT NULL DEFAULT true;
