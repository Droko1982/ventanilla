-- CreateTable
CREATE TABLE "BankProduct" (
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "imageEmoji" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankProduct_pkey" PRIMARY KEY ("barcode")
);

-- CreateIndex
CREATE INDEX "BankProduct_name_idx" ON "BankProduct"("name");
