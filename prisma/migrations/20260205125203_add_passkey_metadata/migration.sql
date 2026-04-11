-- AlterTable
ALTER TABLE "PasskeyCredential" ADD COLUMN     "label" TEXT NOT NULL DEFAULT 'パスキー',
ADD COLUMN     "lastUsedAt" TIMESTAMP(3);
