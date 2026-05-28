-- CreateEnum
CREATE TYPE "EntryPaymentIntentChoice" AS ENUM ('PARTICIPATE', 'WITHDRAW');

-- CreateTable
CREATE TABLE "CompetitionUnpaidEntryIntentCampaign" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "responseDeadlineAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionUnpaidEntryIntentCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntryPaymentIntentToken" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "choice" "EntryPaymentIntentChoice",
    "respondedAt" TIMESTAMP(3),
    "lastEmailSentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionEntryPaymentIntentToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionUnpaidEntryIntentCampaign_competitionId_sentAt_idx" ON "CompetitionUnpaidEntryIntentCampaign"("competitionId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntryPaymentIntentToken_tokenHash_key" ON "CompetitionEntryPaymentIntentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CompetitionEntryPaymentIntentToken_entryId_idx" ON "CompetitionEntryPaymentIntentToken"("entryId");

-- CreateIndex
CREATE INDEX "CompetitionEntryPaymentIntentToken_campaignId_respondedAt_idx" ON "CompetitionEntryPaymentIntentToken"("campaignId", "respondedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntryPaymentIntentToken_campaignId_entryId_key" ON "CompetitionEntryPaymentIntentToken"("campaignId", "entryId");

-- AddForeignKey
ALTER TABLE "CompetitionUnpaidEntryIntentCampaign" ADD CONSTRAINT "CompetitionUnpaidEntryIntentCampaign_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionUnpaidEntryIntentCampaign" ADD CONSTRAINT "CompetitionUnpaidEntryIntentCampaign_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntryPaymentIntentToken" ADD CONSTRAINT "CompetitionEntryPaymentIntentToken_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CompetitionUnpaidEntryIntentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntryPaymentIntentToken" ADD CONSTRAINT "CompetitionEntryPaymentIntentToken_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
