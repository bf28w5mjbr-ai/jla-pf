-- 大会作成時点の主催団体表示（開催者プロフィール変更と独立）
ALTER TABLE "Competition" ADD COLUMN "hostOrganizationName" TEXT;
ALTER TABLE "Competition" ADD COLUMN "hostOrganizationNameKana" TEXT;
ALTER TABLE "Competition" ADD COLUMN "hostOrganizationAbbreviation" TEXT;

UPDATE "Competition" AS c
SET
  "hostOrganizationName" = o."name",
  "hostOrganizationNameKana" = o."nameKana",
  "hostOrganizationAbbreviation" = o."abbreviation"
FROM "Organization" AS o
WHERE c."organizationId" = o."id"
  AND c."hostOrganizationName" IS NULL;
