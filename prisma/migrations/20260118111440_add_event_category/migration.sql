-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('POOL', 'OCEAN');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "category" "EventCategory" NOT NULL DEFAULT 'POOL',
ADD COLUMN     "requiresEntryTime" BOOLEAN NOT NULL DEFAULT true;
