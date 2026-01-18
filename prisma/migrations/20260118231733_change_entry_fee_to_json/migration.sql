-- AlterTable
ALTER TABLE "Competition" ALTER COLUMN "entryFee" DROP DEFAULT,
ALTER COLUMN "entryFee" TYPE JSONB USING 
  CASE 
    WHEN "entryFee" IS NULL THEN NULL
    ELSE jsonb_build_object('baseFee', "entryFee", 'multiEventDiscount', '[]'::jsonb, 'teamOnlyFee', NULL)
  END;
