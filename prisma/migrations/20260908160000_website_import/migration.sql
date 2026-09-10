-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "discoveredAt" TIMESTAMP(3),
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "importUrlKey" TEXT,
ADD COLUMN     "sourcePage" TEXT,
ADD COLUMN     "sourceSite" TEXT;

-- CreateTable
CREATE TABLE "WebsiteImportJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteImportCandidate" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL DEFAULT 'BLOG',
    "applicableStage" TEXT NOT NULL DEFAULT 'COURSE',
    "courseCodes" JSONB NOT NULL,
    "matchReason" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "duplicateResourceId" TEXT,
    "resourceId" TEXT,
    "error" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteImportCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteImportJob_status_leaseExpiresAt_idx" ON "WebsiteImportJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "WebsiteImportJob_ownerId_createdAt_idx" ON "WebsiteImportJob"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteImportCandidate_resourceId_key" ON "WebsiteImportCandidate"("resourceId");

-- CreateIndex
CREATE INDEX "WebsiteImportCandidate_jobId_status_idx" ON "WebsiteImportCandidate"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteImportCandidate_jobId_canonicalUrl_key" ON "WebsiteImportCandidate"("jobId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_importUrlKey_key" ON "Resource"("importUrlKey");

-- CreateIndex
CREATE INDEX "Resource_importBatchId_idx" ON "Resource"("importBatchId");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "WebsiteImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteImportCandidate" ADD CONSTRAINT "WebsiteImportCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "WebsiteImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
