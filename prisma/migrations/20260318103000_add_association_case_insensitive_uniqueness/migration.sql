DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Association"
    GROUP BY lower("name")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique index: duplicate association names exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Association"
    WHERE "abbreviation" IS NOT NULL
    GROUP BY lower("abbreviation")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique index: duplicate association abbreviations exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Association_name_lower_key"
ON "Association"(lower("name"));

CREATE UNIQUE INDEX "Association_abbreviation_lower_key"
ON "Association"(lower("abbreviation"))
WHERE "abbreviation" IS NOT NULL;
