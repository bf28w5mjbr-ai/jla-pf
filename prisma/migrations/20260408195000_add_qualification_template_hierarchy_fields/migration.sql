-- QualificationTemplate: add hierarchical certification fields
ALTER TABLE "QualificationTemplate"
ADD COLUMN "domain" TEXT,
ADD COLUMN "level" TEXT,
ADD COLUMN "minAge" INTEGER,
ADD COLUMN "prerequisiteExpression" TEXT,
ADD COLUMN "prerequisiteKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "nextKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "QualificationTemplate_domain_idx" ON "QualificationTemplate"("domain");
CREATE INDEX "QualificationTemplate_level_idx" ON "QualificationTemplate"("level");
