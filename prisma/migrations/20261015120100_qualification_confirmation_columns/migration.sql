-- AlterTable
ALTER TABLE "Qualification" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "confirmedByAssociationId" TEXT,
ADD COLUMN "confirmationMethod" TEXT,
ADD COLUMN "confirmedTemplateId" TEXT,
ADD COLUMN "confirmedCertNumber" TEXT,
ADD COLUMN "confirmedExpiryDate" TIMESTAMP(3),
ADD COLUMN "confirmationInvalidatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Qualification_confirmedAt_idx" ON "Qualification"("confirmedAt");

-- AlterTable
ALTER TABLE "QualificationHistory" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "confirmedByAssociationId" TEXT,
ADD COLUMN "confirmationMethod" TEXT,
ADD COLUMN "confirmedTemplateId" TEXT,
ADD COLUMN "confirmedCertNumber" TEXT,
ADD COLUMN "confirmedExpiryDate" TIMESTAMP(3),
ADD COLUMN "confirmationInvalidatedAt" TIMESTAMP(3);
