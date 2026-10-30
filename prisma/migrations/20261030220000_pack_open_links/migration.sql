-- AlterTable
ALTER TABLE "RoundPack" ADD COLUMN     "openLinks" TEXT NOT NULL DEFAULT 'keep';

-- AlterTable
ALTER TABLE "ShopSale" ADD COLUMN     "termsAgreed" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "termsAgreedAt" TIMESTAMP(3),
ADD COLUMN     "voidNote" TEXT NOT NULL DEFAULT '';

