-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "shopFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopTotalCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingShopItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "shopItemId" TEXT,
    "name" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "addedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopItem_courseId_idx" ON "ShopItem"("courseId");

-- CreateIndex
CREATE INDEX "BookingShopItem_bookingId_idx" ON "BookingShopItem"("bookingId");

-- CreateIndex
CREATE INDEX "BookingShopItem_shopItemId_idx" ON "BookingShopItem"("shopItemId");

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingShopItem" ADD CONSTRAINT "BookingShopItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingShopItem" ADD CONSTRAINT "BookingShopItem_shopItemId_fkey" FOREIGN KEY ("shopItemId") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
