-- Normalize held qualifications around qualification templates and separate history.

CREATE TYPE "QualificationHistoryChangeType" AS ENUM (
  'SNAPSHOT',
  'RENEWAL',
  'STATUS_CHANGE',
  'IMPORT',
  'DUPLICATE_ARCHIVE'
);

ALTER TABLE "Qualification" ADD COLUMN "templateId" TEXT;

UPDATE "Qualification" q
SET "templateId" = t."id"
FROM "QualificationTemplate" t
WHERE regexp_replace(lower(q."kind"), '[\s_\-./()（）・]+', '', 'g') =
      regexp_replace(lower(t."kind"), '[\s_\-./()（）・]+', '', 'g');

UPDATE "Qualification" q
SET "templateId" = t."id"
FROM "QualificationTemplate" t
WHERE q."templateId" IS NULL
  AND regexp_replace(lower(q."kind"), '[\s_\-./()（）・]+', '', 'g') =
      regexp_replace(lower(t."name"), '[\s_\-./()（）・]+', '', 'g');

DO $$
DECLARE
  unresolved text;
BEGIN
  SELECT string_agg(DISTINCT "kind", ', ' ORDER BY "kind")
  INTO unresolved
  FROM "Qualification"
  WHERE "templateId" IS NULL;

  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot resolve Qualification.kind to QualificationTemplate: %', unresolved;
  END IF;
END $$;

CREATE TABLE "QualificationHistory" (
  "id" TEXT NOT NULL,
  "qualificationId" TEXT,
  "sourceQualificationId" TEXT,
  "userId" TEXT NOT NULL,
  "templateId" TEXT,
  "kind" TEXT NOT NULL,
  "certNumber" TEXT,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "status" "QualificationStatus" NOT NULL,
  "attachmentUrl" TEXT,
  "recordOrigin" "QualificationRecordOrigin" NOT NULL,
  "changeType" "QualificationHistoryChangeType" NOT NULL DEFAULT 'SNAPSHOT',
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QualificationHistory_pkey" PRIMARY KEY ("id")
);

WITH ranked AS (
  SELECT
    q.*,
    row_number() OVER (
      PARTITION BY q."userId", q."templateId"
      ORDER BY
        CASE q."status"
          WHEN 'APPROVED' THEN 1
          WHEN 'PENDING' THEN 2
          WHEN 'EXPIRED' THEN 3
          WHEN 'REJECTED' THEN 4
          ELSE 5
        END,
        q."updatedAt" DESC,
        q."createdAt" DESC,
        q."id" ASC
    ) AS rn
  FROM "Qualification" q
)
INSERT INTO "QualificationHistory" (
  "id",
  "qualificationId",
  "sourceQualificationId",
  "userId",
  "templateId",
  "kind",
  "certNumber",
  "issueDate",
  "expiryDate",
  "status",
  "attachmentUrl",
  "recordOrigin",
  "changeType",
  "changedAt",
  "createdAt"
)
SELECT
  'qhist_' || substr(md5(r."id" || ':duplicate_archive'), 1, 24),
  NULL,
  r."id",
  r."userId",
  r."templateId",
  r."kind",
  r."certNumber",
  r."issueDate",
  r."expiryDate",
  r."status",
  r."attachmentUrl",
  r."recordOrigin",
  'DUPLICATE_ARCHIVE',
  r."updatedAt",
  CURRENT_TIMESTAMP
FROM ranked r
WHERE r.rn > 1;

DELETE FROM "Qualification" q
USING (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "userId", "templateId"
        ORDER BY
          CASE "status"
            WHEN 'APPROVED' THEN 1
            WHEN 'PENDING' THEN 2
            WHEN 'EXPIRED' THEN 3
            WHEN 'REJECTED' THEN 4
            ELSE 5
          END,
          "updatedAt" DESC,
          "createdAt" DESC,
          "id" ASC
      ) AS rn
    FROM "Qualification"
  ) ranked_delete
  WHERE ranked_delete.rn > 1
) d
WHERE q."id" = d."id";

-- Existing certNumber values were used as JLA member IDs. Going forward this column is
-- reserved for qualification-specific certificate numbers, so clear migrated values.
UPDATE "Qualification" SET "certNumber" = NULL;

ALTER TABLE "Qualification" ALTER COLUMN "templateId" SET NOT NULL;

CREATE UNIQUE INDEX "Qualification_userId_templateId_key" ON "Qualification"("userId", "templateId");
CREATE INDEX "Qualification_templateId_idx" ON "Qualification"("templateId");
CREATE INDEX "QualificationHistory_qualificationId_idx" ON "QualificationHistory"("qualificationId");
CREATE INDEX "QualificationHistory_sourceQualificationId_idx" ON "QualificationHistory"("sourceQualificationId");
CREATE INDEX "QualificationHistory_userId_changedAt_idx" ON "QualificationHistory"("userId", "changedAt" DESC);
CREATE INDEX "QualificationHistory_templateId_idx" ON "QualificationHistory"("templateId");
CREATE INDEX "QualificationHistory_recordOrigin_changedAt_idx" ON "QualificationHistory"("recordOrigin", "changedAt");

ALTER TABLE "Qualification"
  ADD CONSTRAINT "Qualification_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "QualificationTemplate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QualificationHistory"
  ADD CONSTRAINT "QualificationHistory_qualificationId_fkey"
  FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QualificationHistory"
  ADD CONSTRAINT "QualificationHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QualificationHistory"
  ADD CONSTRAINT "QualificationHistory_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "QualificationTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
