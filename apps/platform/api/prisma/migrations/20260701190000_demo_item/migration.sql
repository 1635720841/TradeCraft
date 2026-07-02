-- CreateTable
CREATE TABLE "DemoItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoItem_organizationId_projectId_idx" ON "DemoItem"("organizationId", "projectId");

-- AddForeignKey
ALTER TABLE "DemoItem" ADD CONSTRAINT "DemoItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
