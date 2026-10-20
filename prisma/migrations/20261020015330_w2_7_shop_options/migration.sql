-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "optionLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "sku" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "ShopItem_parentId_idx" ON "ShopItem"("parentId");

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ShopItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
