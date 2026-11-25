-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "dimNorm" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dimensions" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Part_dimNorm_idx" ON "Part"("dimNorm");
