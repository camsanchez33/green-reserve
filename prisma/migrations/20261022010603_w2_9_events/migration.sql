-- AlterTable
ALTER TABLE "TeeTime" ADD COLUMN     "eventId" TEXT;

-- CreateTable
CREATE TABLE "CourseEvent" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'outing',
    "date" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'shotgun',
    "startTime" TEXT NOT NULL,
    "holdFrom" TEXT NOT NULL,
    "holdTo" TEXT NOT NULL,
    "holdToCustom" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "holes" INTEGER NOT NULL DEFAULT 18,
    "groups" INTEGER NOT NULL DEFAULT 0,
    "players" INTEGER NOT NULL DEFAULT 0,
    "organizerName" TEXT NOT NULL DEFAULT '',
    "organizerEmail" TEXT NOT NULL DEFAULT '',
    "organizerPhone" TEXT NOT NULL DEFAULT '',
    "pricePerPlayerCents" INTEGER NOT NULL DEFAULT 0,
    "includes" TEXT[],
    "terms" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEventTask" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseEventTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEventPlayer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "groupNo" INTEGER,
    "startHole" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEventPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseEvent_courseId_date_idx" ON "CourseEvent"("courseId", "date");

-- CreateIndex
CREATE INDEX "CourseEventTask_eventId_idx" ON "CourseEventTask"("eventId");

-- CreateIndex
CREATE INDEX "CourseEventPlayer_eventId_idx" ON "CourseEventPlayer"("eventId");

-- CreateIndex
CREATE INDEX "TeeTime_eventId_idx" ON "TeeTime"("eventId");

-- AddForeignKey
ALTER TABLE "TeeTime" ADD CONSTRAINT "TeeTime_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CourseEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEvent" ADD CONSTRAINT "CourseEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEventTask" ADD CONSTRAINT "CourseEventTask_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CourseEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEventPlayer" ADD CONSTRAINT "CourseEventPlayer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CourseEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
