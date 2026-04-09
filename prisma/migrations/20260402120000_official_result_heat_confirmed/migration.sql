-- CreateTable
CREATE TABLE "OfficialResultHeatConfirmed" (
    "id" TEXT NOT NULL,
    "officialResultId" TEXT NOT NULL,
    "heat" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedByUserId" TEXT,

    CONSTRAINT "OfficialResultHeatConfirmed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficialResultHeatConfirmed_officialResultId_heat_key" ON "OfficialResultHeatConfirmed"("officialResultId", "heat");

-- CreateIndex
CREATE INDEX "OfficialResultHeatConfirmed_officialResultId_idx" ON "OfficialResultHeatConfirmed"("officialResultId");

-- AddForeignKey
ALTER TABLE "OfficialResultHeatConfirmed" ADD CONSTRAINT "OfficialResultHeatConfirmed_officialResultId_fkey" FOREIGN KEY ("officialResultId") REFERENCES "OfficialResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
