-- Cam 2026-10-29: the golfer record — staff notes, an owner's online-booking block, and the course's auto-block rule. Additive.
ALTER TABLE "Course" ADD COLUMN "onlineBlockNoShows" INTEGER;
ALTER TABLE "Course" ADD COLUMN "onlineBlockLateCancels" INTEGER;
ALTER TABLE "Course" ADD COLUMN "onlineBlockMonths" INTEGER NOT NULL DEFAULT 12;

CREATE TABLE "GolferNote" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "golferKey" TEXT NOT NULL,
    "bookingId" TEXT,
    "body" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GolferNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GolferNote_courseId_golferKey_idx" ON "GolferNote"("courseId", "golferKey");
CREATE INDEX "GolferNote_bookingId_idx" ON "GolferNote"("bookingId");
ALTER TABLE "GolferNote" ADD CONSTRAINT "GolferNote_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GolferBlock" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "golferKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blockedBy" TEXT NOT NULL DEFAULT '',
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GolferBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GolferBlock_courseId_golferKey_key" ON "GolferBlock"("courseId", "golferKey");
ALTER TABLE "GolferBlock" ADD CONSTRAINT "GolferBlock_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
