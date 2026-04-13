-- AlterTable
ALTER TABLE "CompetitionAgeCategory" ADD COLUMN     "underBandKeysEnabled" JSONB;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "underBandKeysOverride" JSONB;
