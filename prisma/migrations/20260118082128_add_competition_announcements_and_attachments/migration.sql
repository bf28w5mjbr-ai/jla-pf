/*
  Warnings:

  - You are about to drop the column `officeAddress` on the `Club` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OrgAdminRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Club" DROP COLUMN "officeAddress",
ADD COLUMN     "establishedYear" INTEGER,
ADD COLUMN     "mailingName" TEXT,
ADD COLUMN     "nameKana" TEXT,
ADD COLUMN     "officeAddressLine1" TEXT,
ADD COLUMN     "officeAddressLine2" TEXT,
ADD COLUMN     "officeCity" TEXT,
ADD COLUMN     "officePhone" TEXT,
ADD COLUMN     "officePostalCode" TEXT,
ADD COLUMN     "officePrefecture" TEXT,
ADD COLUMN     "patrolLocation" TEXT,
ADD COLUMN     "representativeAddressLine1" TEXT,
ADD COLUMN     "representativeAddressLine2" TEXT,
ADD COLUMN     "representativeCity" TEXT,
ADD COLUMN     "representativeFamilyName" TEXT,
ADD COLUMN     "representativeFamilyNameKana" TEXT,
ADD COLUMN     "representativeGivenName" TEXT,
ADD COLUMN     "representativeGivenNameKana" TEXT,
ADD COLUMN     "representativePhone" TEXT,
ADD COLUMN     "representativePostalCode" TEXT,
ADD COLUMN     "representativePrefecture" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emergencyContactFamilyName" TEXT,
ADD COLUMN     "emergencyContactFamilyNameKana" TEXT,
ADD COLUMN     "emergencyContactGivenName" TEXT,
ADD COLUMN     "emergencyContactGivenNameKana" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "abbreviation" TEXT,
    "websiteUrl" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "representativeFamilyName" TEXT,
    "representativeGivenName" TEXT,
    "representativeFamilyNameKana" TEXT,
    "representativeGivenNameKana" TEXT,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "description" TEXT,
    "establishedYear" INTEGER,
    "logoUrl" TEXT,
    "annualFee" INTEGER,
    "annualFeeDescription" TEXT,
    "status" "OrgStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgAdminRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAnnouncement" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubActivityRecord" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "participants" INTEGER,
    "achievements" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubActivityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "description" TEXT,
    "category" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "venueAddress" TEXT,
    "entryStartDate" TIMESTAMP(3),
    "entryEndDate" TIMESTAMP(3),
    "maxParticipants" INTEGER,
    "entryFee" INTEGER,
    "sponsors" TEXT,
    "cooperators" TEXT,
    "cooperatorsLogos" JSONB,
    "supporters" TEXT,
    "grants" TEXT,
    "grantsLogos" JSONB,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionAnnouncement" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionAttachment" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAdmin_userId_organizationId_key" ON "OrgAdmin"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "ClubAnnouncement_clubId_createdAt_idx" ON "ClubAnnouncement"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "ClubAnnouncement_clubId_isPinned_idx" ON "ClubAnnouncement"("clubId", "isPinned");

-- CreateIndex
CREATE INDEX "ClubActivityRecord_clubId_activityDate_idx" ON "ClubActivityRecord"("clubId", "activityDate");

-- CreateIndex
CREATE INDEX "ClubActivityRecord_clubId_activityType_idx" ON "ClubActivityRecord"("clubId", "activityType");

-- CreateIndex
CREATE INDEX "Competition_organizationId_startDate_idx" ON "Competition"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "Competition_status_isPublished_idx" ON "Competition"("status", "isPublished");

-- CreateIndex
CREATE INDEX "CompetitionAnnouncement_competitionId_createdAt_idx" ON "CompetitionAnnouncement"("competitionId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionAttachment_competitionId_createdAt_idx" ON "CompetitionAttachment"("competitionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAdmin" ADD CONSTRAINT "OrgAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAdmin" ADD CONSTRAINT "OrgAdmin_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAnnouncement" ADD CONSTRAINT "ClubAnnouncement_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAnnouncement" ADD CONSTRAINT "ClubAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubActivityRecord" ADD CONSTRAINT "ClubActivityRecord_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubActivityRecord" ADD CONSTRAINT "ClubActivityRecord_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionAnnouncement" ADD CONSTRAINT "CompetitionAnnouncement_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionAttachment" ADD CONSTRAINT "CompetitionAttachment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
