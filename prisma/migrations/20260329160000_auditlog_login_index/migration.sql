-- ログイン監査のユーザー別検索を高速化
CREATE INDEX "AuditLog_actorUserId_action_createdAt_idx" ON "AuditLog"("actorUserId", "action", "createdAt");
