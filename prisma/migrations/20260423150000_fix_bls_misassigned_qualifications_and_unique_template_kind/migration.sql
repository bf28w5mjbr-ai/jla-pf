-- BLS を選んだがテンプレート解決の誤りで BLSAssistantInstructor が保存された行を矯正する。
-- 前提: 正当な BLS アシスタントインストラクターは BLS を別行で保有している想定。
-- BLS 行が一切なく BLSAssistantInstructor のみのユーザーは、ベース資格の取り違えとみなし kind を BLS に更新する。

UPDATE "Qualification" AS q
SET
  kind = 'BLS',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE q.kind = 'BLSAssistantInstructor'
  AND q.status IN ('APPROVED', 'PENDING', 'EXPIRED')
  AND NOT EXISTS (
    SELECT 1
    FROM "Qualification" AS q2
    WHERE q2."userId" = q."userId"
      AND q2.kind = 'BLS'
      AND q2.status IN ('APPROVED', 'PENDING', 'EXPIRED')
      AND q2.id <> q.id
  );

-- テンプレート kind はアプリ上の正規キーとして一意にする（重複がある場合はマイグレーション前に解消が必要）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "QualificationTemplate"
    GROUP BY kind
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'QualificationTemplate has duplicate kind values; dedupe before applying this migration';
  END IF;
END $$;

DROP INDEX IF EXISTS "QualificationTemplate_kind_idx";

CREATE UNIQUE INDEX "QualificationTemplate_kind_key" ON "QualificationTemplate"("kind");
