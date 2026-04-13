-- 既存データに大会単位のアンダー制（年度年齢・U-○・OPEN）を有効化する。
-- 種目はアンダー判定を使うよう underAgeEligibilityEnabled を true に揃える（既定と同じだが明示的に復旧）。
--
-- U のしきい値が空の大会は、プール系で多い 10/12/14/16 を既定とする。OPEN の有無は underAgeOpenEnabled の既存値のまま。
-- 主催はエントリー設定の「アンダー制」でしきい値をいつでも変更できる。

UPDATE "Competition"
SET "underAgeSystemEnabled" = true
WHERE "underAgeSystemEnabled" = false;

UPDATE "Competition"
SET "underAgeUThresholds" = ARRAY[10, 12, 14, 16]::integer[]
WHERE "underAgeSystemEnabled" = true
  AND (
    "underAgeUThresholds" IS NULL
    OR cardinality("underAgeUThresholds") = 0
  );

UPDATE "Event"
SET "underAgeEligibilityEnabled" = true
WHERE "underAgeEligibilityEnabled" = false;
