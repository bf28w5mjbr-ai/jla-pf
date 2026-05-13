-- アンダー制を AGEカテゴリに統一する移行の一環として、帯許可関連の列を DROP する。
--   - CompetitionAgeCategory.underBandKeysEnabled
--   - Event.underAgeEligibilityEnabled
--   - Event.underBandKeysOverride
--
-- Competition.underAge{SystemEnabled,UThresholds,OpenEnabled} は AGEカテゴリのテンプレートとして残置する。
--
-- 既存データのうち、これらの帯設定に依存していた参加費・参加資格・種目割り当ては、
-- 別途 `scripts/migrate-under-age-to-age-categories.ts` で AGEカテゴリへ変換しておくこと。

ALTER TABLE "CompetitionAgeCategory" DROP COLUMN IF EXISTS "underBandKeysEnabled";

ALTER TABLE "Event" DROP COLUMN IF EXISTS "underAgeEligibilityEnabled";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "underBandKeysOverride";
