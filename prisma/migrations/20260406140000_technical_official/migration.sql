-- CreateEnum
CREATE TYPE "TechnicalOfficialInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "technicalOfficialQualificationTemplateId" TEXT,
ADD COLUMN     "technicalOfficialTiers" JSONB;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_technicalOfficialQualificationTemplateId_fkey" FOREIGN KEY ("technicalOfficialQualificationTemplateId") REFERENCES "QualificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CompetitionTechnicalOfficialInvitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "invitePhoneE164" TEXT,
    "status" "TechnicalOfficialInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionTechnicalOfficialInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionTechnicalOfficialAssignment" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionTechnicalOfficialAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionTechnicalOfficialInvitation_token_key" ON "CompetitionTechnicalOfficialInvitation"("token");

-- CreateIndex
CREATE INDEX "CompetitionTechnicalOfficialInvitation_competitionId_clubId_status_idx" ON "CompetitionTechnicalOfficialInvitation"("competitionId", "clubId", "status");

-- CreateIndex
CREATE INDEX "CompetitionTechnicalOfficialInvitation_invitedUserId_status_idx" ON "CompetitionTechnicalOfficialInvitation"("invitedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionTechnicalOfficialAssignment_invitationId_key" ON "CompetitionTechnicalOfficialAssignment"("invitationId");

-- CreateIndex
CREATE INDEX "CompetitionTechnicalOfficialAssignment_competitionId_clubId_idx" ON "CompetitionTechnicalOfficialAssignment"("competitionId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionTechnicalOfficialAssignment_competitionId_clubId_userId_key" ON "CompetitionTechnicalOfficialAssignment"("competitionId", "clubId", "userId");

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialInvitation" ADD CONSTRAINT "CompetitionTechnicalOfficialInvitation_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialInvitation" ADD CONSTRAINT "CompetitionTechnicalOfficialInvitation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialInvitation" ADD CONSTRAINT "CompetitionTechnicalOfficialInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialInvitation" ADD CONSTRAINT "CompetitionTechnicalOfficialInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialAssignment" ADD CONSTRAINT "CompetitionTechnicalOfficialAssignment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialAssignment" ADD CONSTRAINT "CompetitionTechnicalOfficialAssignment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialAssignment" ADD CONSTRAINT "CompetitionTechnicalOfficialAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTechnicalOfficialAssignment" ADD CONSTRAINT "CompetitionTechnicalOfficialAssignment_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CompetitionTechnicalOfficialInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
