-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lookupsResetAt" TIMESTAMP(3),
ADD COLUMN     "lookupsUsedThisMonth" INTEGER NOT NULL DEFAULT 0;
