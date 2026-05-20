-- Organization lifecycle + admin invitations
ALTER TABLE "Organization" ADD COLUMN "suspendedReason" TEXT;

UPDATE "Organization"
SET
  "status" = 'SUSPENDED',
  "suspendedReason" = COALESCE("suspendedReason", 'LEGACY_INACTIVE')
WHERE "status" = 'INACTIVE';

-- CreateEnum
CREATE TYPE "OrganizationAdminInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "OrganizationAdminInvitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "role" "OrgAdminRole" NOT NULL DEFAULT 'MEMBER',
    "status" "OrganizationAdminInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationAdminInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationAdminInvitation_token_key" ON "OrganizationAdminInvitation"("token");

CREATE INDEX "OrganizationAdminInvitation_organizationId_status_idx" ON "OrganizationAdminInvitation"("organizationId", "status");

CREATE INDEX "OrganizationAdminInvitation_invitedUserId_status_idx" ON "OrganizationAdminInvitation"("invitedUserId", "status");

ALTER TABLE "OrganizationAdminInvitation" ADD CONSTRAINT "OrganizationAdminInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationAdminInvitation" ADD CONSTRAINT "OrganizationAdminInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationAdminInvitation" ADD CONSTRAINT "OrganizationAdminInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
