-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "demandPct" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "demandCeilingPct" INTEGER NOT NULL DEFAULT 125,
ADD COLUMN     "demandFloorPct" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "demandMode" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "demandSuggestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DemandPrice" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dow" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "pct" INTEGER NOT NULL DEFAULT 0,
    "suggestedPct" INTEGER NOT NULL DEFAULT 0,
    "fillPct" INTEGER NOT NULL DEFAULT 0,
    "courseFillPct" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemandPrice_courseId_dow_hour_key" ON "DemandPrice"("courseId", "dow", "hour");

-- AddForeignKey
ALTER TABLE "DemandPrice" ADD CONSTRAINT "DemandPrice_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

