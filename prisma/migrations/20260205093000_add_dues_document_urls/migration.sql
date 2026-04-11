-- AlterTable
ALTER TABLE "ClubDues" ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "invoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceUrl" TEXT,
ADD COLUMN     "receiptNumber" TEXT,
ADD COLUMN     "receiptUrl" TEXT;
