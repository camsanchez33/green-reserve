-- POS-7: opening the register — the day's starting cash, locked once confirmed (additive).
CREATE TABLE "RegisterOpen" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "startingCashCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "openedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisterOpen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegisterOpen_courseId_day_seq_key" ON "RegisterOpen"("courseId", "day", "seq");

ALTER TABLE "RegisterOpen" ADD CONSTRAINT "RegisterOpen_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
