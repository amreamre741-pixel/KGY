-- CreateEnum
CREATE TYPE "OrderNoteStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "OrderNote" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "userId" TEXT,
    "partName" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "vehicle" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "customerInfo" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "OrderNoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderNote_status_createdAt_idx" ON "OrderNote"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderNote_storeId_createdAt_idx" ON "OrderNote"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
