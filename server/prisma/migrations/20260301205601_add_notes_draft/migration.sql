-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Outreach" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "threadId" TEXT NOT NULL,
    "gmailUrl" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Sent',
    "snippet" TEXT NOT NULL DEFAULT '',
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "hasReply" BOOLEAN NOT NULL DEFAULT false,
    "repliedAt" DATETIME,
    "latestActivity" DATETIME NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "draft" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Outreach" ("archived", "company", "contactEmail", "contactName", "createdAt", "domain", "favorite", "gmailUrl", "hasReply", "id", "latestActivity", "messageCount", "repliedAt", "sentDate", "snippet", "status", "subject", "threadId", "updatedAt") SELECT "archived", "company", "contactEmail", "contactName", "createdAt", "domain", "favorite", "gmailUrl", "hasReply", "id", "latestActivity", "messageCount", "repliedAt", "sentDate", "snippet", "status", "subject", "threadId", "updatedAt" FROM "Outreach";
DROP TABLE "Outreach";
ALTER TABLE "new_Outreach" RENAME TO "Outreach";
CREATE UNIQUE INDEX "Outreach_threadId_key" ON "Outreach"("threadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
