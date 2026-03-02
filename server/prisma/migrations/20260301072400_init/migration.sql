-- CreateTable
CREATE TABLE "Outreach" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Outreach_threadId_key" ON "Outreach"("threadId");
