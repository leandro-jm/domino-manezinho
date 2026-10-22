-- CreateIndex
CREATE INDEX "Match_rated_endedAt_idx" ON "Match"("rated", "endedAt");

-- CreateIndex
CREATE INDEX "TransferCode_playerId_idx" ON "TransferCode"("playerId");

-- CreateIndex
CREATE INDEX "TransferCode_expiresAt_idx" ON "TransferCode"("expiresAt");
