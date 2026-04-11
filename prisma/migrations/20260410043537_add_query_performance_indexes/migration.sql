-- CreateIndex
CREATE INDEX "Club_status_createdAt_idx" ON "Club"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Competition_entryEndDate_idx" ON "Competition"("entryEndDate");

-- CreateIndex
CREATE INDEX "EntryItem_entryId_idx" ON "EntryItem"("entryId");

-- CreateIndex
CREATE INDEX "EntryItem_eventId_idx" ON "EntryItem"("eventId");

-- CreateIndex
CREATE INDEX "Membership_clubId_createdAt_idx" ON "Membership"("clubId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Membership_userId_createdAt_idx" ON "Membership"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrgAdmin_organizationId_idx" ON "OrgAdmin"("organizationId");

-- CreateIndex
CREATE INDEX "Qualification_userId_createdAt_idx" ON "Qualification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Qualification_status_createdAt_idx" ON "Qualification"("status", "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Qualification_status_expiryDate_idx" ON "Qualification"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "User_nfcTagId_idx" ON "User"("nfcTagId");
