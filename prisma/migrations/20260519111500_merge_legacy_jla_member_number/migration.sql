-- Keep the current JLA member number as authoritative.
-- If only the legacy number exists, promote it unless another user already owns that number.
UPDATE "UserJlaProfile" AS target
SET "jlaMemberNumber" = target."legacyJlaMemberNumber"
WHERE target."jlaMemberNumber" IS NULL
  AND target."legacyJlaMemberNumber" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "UserJlaProfile" AS other
    WHERE other."userId" <> target."userId"
      AND other."jlaMemberNumber" = target."legacyJlaMemberNumber"
  );

DROP INDEX IF EXISTS "UserJlaProfile_legacyJlaMemberNumber_key";

ALTER TABLE "UserJlaProfile"
  DROP COLUMN "legacyJlaMemberNumber";
