-- ASSIST-1 (Cam 2026-11-24): course assistant settings, notes and the brief snapshot. Additive only.
ALTER TABLE "Course" ADD COLUMN "assistantStaffOn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Course" ADD COLUMN "assistantGolferOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "assistantTone" TEXT NOT NULL DEFAULT 'friendly';
ALTER TABLE "Course" ADD COLUMN "assistantGolferTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Course" ADD COLUMN "assistantUnknownLine" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Course" ADD COLUMN "assistantGolferDailyLimit" INTEGER NOT NULL DEFAULT 300;

CREATE TABLE "CourseAssistantNote" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'golfers',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseAssistantNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourseAssistantNote_courseId_position_idx" ON "CourseAssistantNote"("courseId", "position");

CREATE TABLE "CourseBrief" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseBrief_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseBrief_courseId_audience_key" ON "CourseBrief"("courseId", "audience");
