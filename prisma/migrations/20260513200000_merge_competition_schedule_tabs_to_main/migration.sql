-- 同一大会に CompetitionScheduleTab が複数ある場合、先頭タブ（displayOrder, id 順）1 本に統合する。
-- 本マイグレーションは 20260514010847 でテーブル作成より先に並んでいるため、未作成時は no-op。
-- （shadow DB / 新規 DB では後続マイグレーションでテーブルが作られる）

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'CompetitionScheduleTab'
  ) THEN
    RETURN;
  END IF;

  UPDATE "Event" AS e
  SET
    "scheduleTabId" = sub."keepId",
    "scheduleTabSortOrder" = sub.rn
  FROM (
    SELECT
      e2.id AS "eventId",
      kt."keepId",
      ROW_NUMBER() OVER (
        PARTITION BY e2."competitionId"
        ORDER BY
          COALESCE(tab."displayOrder", 2147483647) ASC,
          e2."scheduleTabSortOrder" ASC,
          e2."displayOrder" ASC,
          e2.id ASC
      ) AS rn
    FROM "Event" e2
    INNER JOIN (
      SELECT
        cst."competitionId",
        (
          SELECT c2.id
          FROM "CompetitionScheduleTab" c2
          WHERE c2."competitionId" = cst."competitionId"
          ORDER BY c2."displayOrder" ASC, c2.id ASC
          LIMIT 1
        ) AS "keepId"
      FROM "CompetitionScheduleTab" cst
      GROUP BY cst."competitionId"
      HAVING COUNT(*) > 1
    ) kt ON kt."competitionId" = e2."competitionId"
    LEFT JOIN "CompetitionScheduleTab" tab ON tab.id = e2."scheduleTabId"
  ) AS sub
  WHERE e.id = sub."eventId";

  UPDATE "CompetitionScheduleTab" AS cst
  SET
    name = 'メイン',
    "displayOrder" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE cst.id IN (
    SELECT DISTINCT ON (c."competitionId") c.id
    FROM "CompetitionScheduleTab" c
    INNER JOIN (
      SELECT "competitionId"
      FROM "CompetitionScheduleTab"
      GROUP BY "competitionId"
      HAVING COUNT(*) > 1
    ) x ON x."competitionId" = c."competitionId"
    ORDER BY c."competitionId", c."displayOrder" ASC, c.id ASC
  );

  DELETE FROM "CompetitionScheduleTab" AS cst
  WHERE cst.id IN (
    SELECT c.id
    FROM "CompetitionScheduleTab" c
    WHERE c."competitionId" IN (
      SELECT "competitionId"
      FROM "CompetitionScheduleTab"
      GROUP BY "competitionId"
      HAVING COUNT(*) > 1
    )
    AND c.id NOT IN (
      SELECT DISTINCT ON (c2."competitionId") c2.id
      FROM "CompetitionScheduleTab" c2
      WHERE c2."competitionId" IN (
        SELECT "competitionId"
        FROM "CompetitionScheduleTab"
        GROUP BY "competitionId"
        HAVING COUNT(*) > 1
      )
      ORDER BY c2."competitionId", c2."displayOrder" ASC, c2.id ASC
    )
  );
END $$;
