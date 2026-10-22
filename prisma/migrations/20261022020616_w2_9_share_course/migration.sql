-- AlterTable
ALTER TABLE "CourseEvent" ADD COLUMN     "holdNineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "keepOpen" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shareCourse" BOOLEAN NOT NULL DEFAULT false;
