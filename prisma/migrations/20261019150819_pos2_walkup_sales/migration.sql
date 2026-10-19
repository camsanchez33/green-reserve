-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "stockCount" INTEGER;

-- CreateTable
CREATE TABLE "ShopSale" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "totalCents" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT '',
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL DEFAULT '',
    "payToken" TEXT NOT NULL DEFAULT '',
    "paymentIntentId" TEXT NOT NULL DEFAULT '',
    "chargeStartedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "soldBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "shopItemId" TEXT,
    "name" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ShopSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopSale_courseId_createdAt_idx" ON "ShopSale"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopSaleLine_saleId_idx" ON "ShopSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "ShopSaleLine_shopItemId_idx" ON "ShopSaleLine"("shopItemId");

-- AddForeignKey
ALTER TABLE "ShopSale" ADD CONSTRAINT "ShopSale_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopSaleLine" ADD CONSTRAINT "ShopSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ShopSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopSaleLine" ADD CONSTRAINT "ShopSaleLine_shopItemId_fkey" FOREIGN KEY ("shopItemId") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
