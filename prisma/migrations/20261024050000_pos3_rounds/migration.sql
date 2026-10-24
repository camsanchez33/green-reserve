-- POS-3 R2 (Cam 2026-10-24): green fees paid at the register (additive).
-- AlterTable
ALTER TABLE "ShopSale" ADD COLUMN     "roundsCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ShopSaleLine" ADD COLUMN     "bookingId" TEXT;

