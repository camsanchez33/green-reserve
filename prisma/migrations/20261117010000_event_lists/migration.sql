-- Events lists (Cam 2026-11-17): the course's own items in each built-in list, notes for staff,
-- the course's own kind of event, and a checklist step's "how to do it". Additive; no backfill.
ALTER TABLE "CourseEvent" ADD COLUMN "kindLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CourseEvent" ADD COLUMN "staffNotes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CourseEventTask" ADD COLUMN "detail" TEXT NOT NULL DEFAULT '';

CREATE TABLE "CourseEventListItem" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEventListItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseEventListItem_courseId_list_idx" ON "CourseEventListItem"("courseId", "list");

ALTER TABLE "CourseEventListItem" ADD CONSTRAINT "CourseEventListItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
