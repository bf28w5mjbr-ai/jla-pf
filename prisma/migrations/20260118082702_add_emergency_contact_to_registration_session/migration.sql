-- AlterTable
ALTER TABLE "RegistrationSession" ADD COLUMN     "emergencyContactFamilyName" TEXT,
ADD COLUMN     "emergencyContactFamilyNameKana" TEXT,
ADD COLUMN     "emergencyContactGivenName" TEXT,
ADD COLUMN     "emergencyContactGivenNameKana" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT;
