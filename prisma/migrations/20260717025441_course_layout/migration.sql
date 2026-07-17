-- CreateTable
CREATE TABLE "Nine" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "par" INTEGER NOT NULL DEFAULT 36,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseProduct" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "holes" INTEGER NOT NULL DEFAULT 18,
    "nineIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeeSetNine" (
    "id" TEXT NOT NULL,
    "teeSetId" TEXT NOT NULL,
    "nineId" TEXT NOT NULL,
    "yardage" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeeSetNine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseProductTeeSet" (
    "id" TEXT NOT NULL,
    "courseProductId" TEXT NOT NULL,
    "teeSetId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slope" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseProductTeeSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Nine_courseId_idx" ON "Nine"("courseId");

-- CreateIndex
CREATE INDEX "CourseProduct_courseId_idx" ON "CourseProduct"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TeeSetNine_teeSetId_nineId_key" ON "TeeSetNine"("teeSetId", "nineId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseProductTeeSet_courseProductId_teeSetId_key" ON "CourseProductTeeSet"("courseProductId", "teeSetId");

-- AddForeignKey
ALTER TABLE "Nine" ADD CONSTRAINT "Nine_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseProduct" ADD CONSTRAINT "CourseProduct_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeSetNine" ADD CONSTRAINT "TeeSetNine_teeSetId_fkey" FOREIGN KEY ("teeSetId") REFERENCES "TeeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeSetNine" ADD CONSTRAINT "TeeSetNine_nineId_fkey" FOREIGN KEY ("nineId") REFERENCES "Nine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseProductTeeSet" ADD CONSTRAINT "CourseProductTeeSet_courseProductId_fkey" FOREIGN KEY ("courseProductId") REFERENCES "CourseProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseProductTeeSet" ADD CONSTRAINT "CourseProductTeeSet_teeSetId_fkey" FOREIGN KEY ("teeSetId") REFERENCES "TeeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
