-- 大会の自由記述 category が「オーシャン系のみ」のとき、
-- 追加当時は Event.category が POOL デフォルトのままの行が残り得るため OCEAN に揃える。
-- 判定は src/lib/competitionEventCategoryScope.ts の resolveCompetitionEventCategoryScope と同等。

UPDATE "Event" AS e
SET
  category = 'OCEAN'::"EventCategory",
  "updatedAt" = NOW()
FROM "Competition" AS c
WHERE e."competitionId" = c.id
  AND e.category = 'POOL'::"EventCategory"
  AND NULLIF(TRIM(c.category), '') IS NOT NULL
  AND (
    c.category LIKE '%オーシャン%'
    OR LOWER(c.category) LIKE '%ocean%'
    OR c.category LIKE '%オープンウォーター%'
    OR LOWER(c.category) LIKE '%open water%'
    OR LOWER(c.category) LIKE '%openwater%'
  )
  AND c.category NOT LIKE '%プール%'
  AND LOWER(c.category) NOT LIKE '%pool%';
