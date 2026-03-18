-- CreateTable
CREATE TABLE "Outreach" (
    "id" SERIAL NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailUrl" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Sent',
    "snippet" TEXT NOT NULL DEFAULT '',
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "hasReply" BOOLEAN NOT NULL DEFAULT false,
    "repliedAt" TIMESTAMP(3),
    "latestActivity" TIMESTAMP(3) NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "isOpened" BOOLEAN NOT NULL DEFAULT false,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3),
    "nextActionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingPixel" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPixel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenEvent" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "OpenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Outreach_threadId_key" ON "Outreach"("threadId");

-- CreateIndex
CREATE INDEX "Outreach_status_idx" ON "Outreach"("status");

-- CreateIndex
CREATE INDEX "Outreach_sentDate_idx" ON "Outreach"("sentDate");

-- CreateIndex
CREATE INDEX "Outreach_archived_idx" ON "Outreach"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingPixel_trackingId_key" ON "TrackingPixel"("trackingId");

-- AddForeignKey
ALTER TABLE "OpenEvent" ADD CONSTRAINT "OpenEvent_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "TrackingPixel"("trackingId") ON DELETE CASCADE ON UPDATE CASCADE;
