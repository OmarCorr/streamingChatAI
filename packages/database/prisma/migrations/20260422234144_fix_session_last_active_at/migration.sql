-- DropIndex
DROP INDEX "Session_lastActiveAt_idx";

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "lastActiveAt" DROP DEFAULT;
