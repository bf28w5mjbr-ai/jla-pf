-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "type" "EventType" NOT NULL DEFAULT 'INDIVIDUAL';
