-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "lastMinutePct" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "lastMinuteCounter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastMinuteHours" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "lastMinuteOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastMinutePct" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "lastMinuteStack" BOOLEAN NOT NULL DEFAULT false;

