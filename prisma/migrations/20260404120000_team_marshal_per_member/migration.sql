-- チーム種目のマーシャルを構成員（ユーザー）単位に変更するためのスキーマ更新
-- 旧: チーム単位 1 行 / 新: チーム×構成員ごとに 1 行（teamMemberUserId）

DROP INDEX IF EXISTS "CompetitionParticipantStatus_competitionId_eventId_particip_key";

-- チーム単位の既存行は構成員キーへ移行できないため削除（当日運用で再記録）
DELETE FROM "CompetitionParticipantStatus" WHERE "participantType" = 'TEAM';

ALTER TABLE "CompetitionParticipantStatus" ADD COLUMN "teamMemberUserId" TEXT;

ALTER TABLE "CompetitionParticipantStatus" ADD CONSTRAINT "CompetitionParticipantStatus_teamMemberUserId_fkey" FOREIGN KEY ("teamMemberUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CompetitionParticipantStatus_competitionId_eventId_participantType_competitionEntryId_teamEntryId_teamMemberUserId_marshalRound_key" ON "CompetitionParticipantStatus"("competitionId", "eventId", "participantType", "competitionEntryId", "teamEntryId", "teamMemberUserId", "marshalRound");

CREATE INDEX "CompetitionParticipantStatus_teamMemberUserId_idx" ON "CompetitionParticipantStatus"("teamMemberUserId");
