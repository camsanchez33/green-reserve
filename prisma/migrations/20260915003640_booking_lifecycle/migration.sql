-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellationHoursAtBooking" INTEGER,
ADD COLUMN     "checkedInPlayers" INTEGER,
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "paidOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'online';

