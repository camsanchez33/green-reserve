-- MONEY-1: a declined card taken off Action needed (additive).
ALTER TABLE "Booking" ADD COLUMN "declineDismissedAt" TIMESTAMP(3);
