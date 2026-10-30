-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "costCents" INTEGER,
ADD COLUMN     "reorderAt" INTEGER;

-- CreateTable
CREATE TABLE "ShopStockReceipt" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "shopItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "receivedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopStockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopStockReceipt_courseId_createdAt_idx" ON "ShopStockReceipt"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopStockReceipt_shopItemId_idx" ON "ShopStockReceipt"("shopItemId");

-- AddForeignKey
ALTER TABLE "ShopStockReceipt" ADD CONSTRAINT "ShopStockReceipt_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopStockReceipt" ADD CONSTRAINT "ShopStockReceipt_shopItemId_fkey" FOREIGN KEY ("shopItemId") REFERENCES "ShopItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

