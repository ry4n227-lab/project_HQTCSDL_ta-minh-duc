-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MERCHANT');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(30),
    "address" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suiMintCapId" VARCHAR(66),
    "suiSignerAddress" VARCHAR(66),

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MERCHANT',
    "merchantId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "externalRef" VARCHAR(100),
    "fullName" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suiAddress" VARCHAR(66),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "reference" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txDigest" VARCHAR(64),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditObject" (
    "objectId" VARCHAR(66) NOT NULL,
    "merchantId" UUID NOT NULL,
    "ownerCustomerId" UUID NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "CreditObject_pkey" PRIMARY KEY ("objectId")
);

-- CreateTable
CREATE TABLE "CreditRequest" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "signedTx" JSONB,
    "txDigest" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_suiMintCapId_key" ON "Merchant"("suiMintCapId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_suiSignerAddress_key" ON "Merchant"("suiSignerAddress");

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_merchantId_idx" ON "User"("merchantId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_suiAddress_key" ON "Customer"("suiAddress");

-- CreateIndex
CREATE INDEX "Customer_merchantId_createdAt_idx" ON "Customer"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_merchantId_email_idx" ON "Customer"("merchantId", "email");

-- CreateIndex
CREATE INDEX "Customer_merchantId_phone_idx" ON "Customer"("merchantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_merchantId_key" ON "Customer"("id", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_externalRef_key" ON "Customer"("merchantId", "externalRef");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_createdAt_idx" ON "Transaction"("merchantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_customerId_createdAt_idx" ON "Transaction"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_merchantId_type_createdAt_idx" ON "Transaction"("merchantId", "type", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txDigest_customerId_type_key" ON "Transaction"("txDigest", "customerId", "type");

-- CreateIndex
CREATE INDEX "CreditObject_merchantId_ownerCustomerId_idx" ON "CreditObject"("merchantId", "ownerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditRequest_txDigest_key" ON "CreditRequest"("txDigest");

-- CreateIndex
CREATE UNIQUE INDEX "CreditRequest_merchantId_key_key" ON "CreditRequest"("merchantId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_merchantId_fkey" FOREIGN KEY ("customerId", "merchantId") REFERENCES "Customer"("id", "merchantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditObject" ADD CONSTRAINT "CreditObject_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditObject" ADD CONSTRAINT "CreditObject_ownerCustomerId_merchantId_fkey" FOREIGN KEY ("ownerCustomerId", "merchantId") REFERENCES "Customer"("id", "merchantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Append to the END of a reviewed, generated credit_core migration.
-- Review existing data first; this file is not a standalone migration.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_points_nonnegative" CHECK ("points" >= 0);
ALTER TABLE "CreditObject" ADD CONSTRAINT "CreditObject_points_positive" CHECK ("points" > 0);
-- EARN uses reference as the invoice ID. Transfers may share a reference.
CREATE UNIQUE INDEX "Transaction_earn_invoice_unique"
  ON "Transaction" ("merchantId", "reference")
  WHERE "type" = 'EARN' AND "reference" IS NOT NULL;
