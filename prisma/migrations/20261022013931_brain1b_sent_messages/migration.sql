-- CreateTable
CREATE TABLE "SentMessage" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "courseId" TEXT,
    "bookingId" TEXT,
    "inquiryId" TEXT,
    "status" TEXT NOT NULL,
    "providerId" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentMessage_courseId_createdAt_idx" ON "SentMessage"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "SentMessage_to_createdAt_idx" ON "SentMessage"("to", "createdAt");

-- CreateIndex
CREATE INDEX "SentMessage_bookingId_idx" ON "SentMessage"("bookingId");

-- CreateIndex
CREATE INDEX "SentMessage_inquiryId_idx" ON "SentMessage"("inquiryId");

-- CreateIndex
CREATE INDEX "SentMessage_createdAt_idx" ON "SentMessage"("createdAt");
