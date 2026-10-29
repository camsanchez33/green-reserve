-- Cam 2026-10-29: shop returns by item and a same-day void of a cash sale. Additive, with defaults.
ALTER TABLE "ShopSaleLine" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShopSaleRefund" ADD COLUMN "returnedLines" JSONB;
ALTER TABLE "ShopSale" ADD COLUMN "voidTaxReversalId" TEXT NOT NULL DEFAULT '';
