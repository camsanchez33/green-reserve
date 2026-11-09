-- RECEIPT-3: the customer receipt page secret for a shop sale (additive).
ALTER TABLE "ShopSale" ADD COLUMN "receiptToken" TEXT NOT NULL DEFAULT '';
