-- AlterTable
ALTER TABLE "CourseEvent" ADD COLUMN     "signupMaxGroup" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "signupOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signupPay" TEXT NOT NULL DEFAULT 'later',
ADD COLUMN     "signupQuestions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "CourseEventPayment" ADD COLUMN     "groupKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CourseEventPlayer" ADD COLUMN     "answers" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "groupKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "holdUntil" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'staff',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'in';
