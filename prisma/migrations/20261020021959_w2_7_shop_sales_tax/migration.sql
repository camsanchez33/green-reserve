-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "shopTaxOn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "taxCategory" TEXT NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "ShopSale" ADD COLUMN     "taxCalculationId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxTransactionId" TEXT NOT NULL DEFAULT '';
