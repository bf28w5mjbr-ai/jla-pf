-- CreateTable
CREATE TABLE "LoginSession" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginSession_phoneNumber_key" ON "LoginSession"("phoneNumber");

-- CreateIndex
CREATE INDEX "LoginSession_phoneNumber_idx" ON "LoginSession"("phoneNumber");

-- CreateIndex
CREATE INDEX "LoginSession_otpExpiresAt_idx" ON "LoginSession"("otpExpiresAt");
