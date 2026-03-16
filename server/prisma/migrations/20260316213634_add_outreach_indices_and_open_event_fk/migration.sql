-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpenEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    CONSTRAINT "OpenEvent_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "TrackingPixel" ("trackingId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OpenEvent" ("id", "ipAddress", "openedAt", "trackingId", "userAgent") SELECT "id", "ipAddress", "openedAt", "trackingId", "userAgent" FROM "OpenEvent";
DROP TABLE "OpenEvent";
ALTER TABLE "new_OpenEvent" RENAME TO "OpenEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Outreach_status_idx" ON "Outreach"("status");

-- CreateIndex
CREATE INDEX "Outreach_sentDate_idx" ON "Outreach"("sentDate");

-- CreateIndex
CREATE INDEX "Outreach_archived_idx" ON "Outreach"("archived");
