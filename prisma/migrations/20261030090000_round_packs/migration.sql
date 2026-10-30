-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "packLineId" TEXT,
ADD COLUMN     "packRounds" INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE "ShopSaleLine" ADD COLUMN     "packCoversCart" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "packGuests" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "packRounds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packRoundsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packValidDays" INTEGER,
ADD COLUMN     "roundPackId" TEXT;
-- CreateTable
CREATE TABLE "RoundPack" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "coversCart" BOOLEAN NOT NULL DEFAULT false,
    "guests" BOOLEAN NOT NULL DEFAULT false,
    "validDays" INTEGER,
    "sellOnline" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoundPack_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RoundPack_courseId_idx" ON "RoundPack"("courseId");
-- AddForeignKey
ALTER TABLE "RoundPack" ADD CONSTRAINT "RoundPack_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
