-- POS-3 (Cam 2026-10-24): register discounts, cash tendered, receipts and refunds (additive).
-- AlterTable
ALTER TABLE "ShopSale" ADD COLUMN     "cashTenderedCents" INTEGER,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receiptSentAt" TIMESTAMP(3),
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShopSaleRefund" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeRefundId" TEXT NOT NULL DEFAULT '',
    "taxReversalId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSaleRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopSaleRefund_saleId_idx" ON "ShopSaleRefund"("saleId");

-- CreateIndex
CREATE INDEX "ShopSaleRefund_courseId_createdAt_idx" ON "ShopSaleRefund"("courseId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShopSaleRefund" ADD CONSTRAINT "ShopSaleRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ShopSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

