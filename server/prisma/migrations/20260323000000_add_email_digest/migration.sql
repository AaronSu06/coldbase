-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailDigest" TEXT NOT NULL DEFAULT 'weekly';
