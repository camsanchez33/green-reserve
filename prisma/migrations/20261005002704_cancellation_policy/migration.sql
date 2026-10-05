-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "autoNoShowMinutesAtBooking" INTEGER,
ADD COLUMN     "lateFeeTimingAtBooking" TEXT,
ADD COLUMN     "noShowFeeTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "autoNoShowMinutes" INTEGER,
ADD COLUMN     "lateFeeBasis" TEXT NOT NULL DEFAULT 'booking',
ADD COLUMN     "lateFeeTiming" TEXT NOT NULL DEFAULT 'hold_at_cutoff',
ADD COLUMN     "noShowFeeBasis" TEXT NOT NULL DEFAULT 'booking',
ADD COLUMN     "noShowFeeCents" INTEGER NOT NULL DEFAULT 0;
