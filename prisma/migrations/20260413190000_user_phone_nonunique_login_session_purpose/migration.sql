-- 電話番号の User 一意制約を外し、LoginSession をユーザー単位の OTP セッションに再構成する。
-- 既存 LoginSession は短命のため削除（重複電話番号がある環境での userId バックフィルは曖昧になるため）。

CREATE TYPE "LoginSessionPurpose" AS ENUM ('SMS_LOGIN', 'PHONE_CHANGE');

DELETE FROM "LoginSession";

DROP INDEX IF EXISTS "LoginSession_phoneNumber_key";

ALTER TABLE "LoginSession" ADD COLUMN "purpose" "LoginSessionPurpose";
ALTER TABLE "LoginSession" ADD COLUMN "userId" TEXT;

ALTER TABLE "LoginSession" ALTER COLUMN "purpose" SET NOT NULL;
ALTER TABLE "LoginSession" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "LoginSession" ADD CONSTRAINT "LoginSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LoginSession_userId_purpose_key" ON "LoginSession"("userId", "purpose");

DROP INDEX IF EXISTS "User_phoneNumber_key";

CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");
