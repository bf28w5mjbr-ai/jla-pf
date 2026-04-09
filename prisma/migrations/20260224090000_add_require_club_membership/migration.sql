-- Add requireClubMembership to Competition
ALTER TABLE "Competition" ADD COLUMN "requireClubMembership" BOOLEAN NOT NULL DEFAULT false;
