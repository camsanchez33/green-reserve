-- AUDIT-1 (database audit 2026-11-05): the Stripe webhook, refunds and hold shares look a booking
-- (or a payment event) up by its Stripe id, and the rate-limit sweep goes by window age — all
-- full-table scans until now. Index-only, additive.

-- CreateIndex
CREATE INDEX "Booking_roundPaymentIntentId_idx" ON "Booking"("roundPaymentIntentId");

-- CreateIndex
CREATE INDEX "Booking_cancellationFeeChargeId_idx" ON "Booking"("cancellationFeeChargeId");

-- CreateIndex
CREATE INDEX "Booking_stripePaymentIntentId_idx" ON "Booking"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Booking_feePaymentIntentId_idx" ON "Booking"("feePaymentIntentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_stripeId_idx" ON "PaymentEvent"("stripeId");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

