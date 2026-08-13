-- CreateTable
CREATE TABLE "rate_limit_entry" (
    "scope" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_entry_pkey" PRIMARY KEY ("scope","subjectHash")
);

-- CreateIndex
CREATE INDEX "rate_limit_entry_windowStartedAt_idx" ON "rate_limit_entry"("windowStartedAt");
