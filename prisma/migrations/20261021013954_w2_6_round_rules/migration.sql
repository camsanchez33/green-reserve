-- AlterTable
ALTER TABLE "CourseProduct" ADD COLUMN     "maxPlayers" INTEGER,
ADD COLUMN     "minPlayers" INTEGER,
ADD COLUMN     "publicAdvanceDays" INTEGER,
ADD COLUMN     "walkingPolicy" TEXT;
