-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "CourseGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseGroup_slug_key" ON "CourseGroup"("slug");

-- CreateIndex
CREATE INDEX "Course_groupId_idx" ON "Course"("groupId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CourseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
