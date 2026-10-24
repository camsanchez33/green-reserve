-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "readerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "readerIntentId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "readerStartedAt" TIMESTAMP(3);
