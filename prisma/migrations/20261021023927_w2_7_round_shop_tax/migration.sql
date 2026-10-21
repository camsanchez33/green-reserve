-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "shopTaxCalculationId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "shopTaxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopTaxExpiresAt" TIMESTAMP(3),
ADD COLUMN     "shopTaxKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "shopTaxTransactionId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "BookingShopItem" ADD COLUMN     "taxCategory" TEXT NOT NULL DEFAULT 'general';
