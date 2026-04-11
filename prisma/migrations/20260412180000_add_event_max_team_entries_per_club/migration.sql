-- チーム種目: 同一クラブあたりのチームエントリー上限（null は制限なし）
ALTER TABLE "Event" ADD COLUMN "maxTeamEntriesPerClub" INTEGER;
