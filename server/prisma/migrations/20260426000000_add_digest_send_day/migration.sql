-- Migrate existing emailDigest values to new scheme
UPDATE "User" SET "emailDigest" = 'weekly' WHERE "emailDigest" = 'daily';
UPDATE "User" SET "emailDigest" = 'none'   WHERE "emailDigest" = 'never';

-- Add digestSendDay column
ALTER TABLE "User" ADD COLUMN "digestSendDay" INTEGER;

-- Backfill digestSendDay for existing weekly/monthly users
UPDATE "User" SET "digestSendDay" = "id" % 7           WHERE "emailDigest" = 'weekly';
UPDATE "User" SET "digestSendDay" = ("id" % 28) + 1    WHERE "emailDigest" = 'monthly';

-- Update default for new rows
ALTER TABLE "User" ALTER COLUMN "emailDigest" SET DEFAULT 'none';
