-- Append to the END of a reviewed, generated credit_core migration.
-- Review existing data first; this file is not a standalone migration.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_points_nonnegative" CHECK ("points" >= 0);
ALTER TABLE "CreditObject" ADD CONSTRAINT "CreditObject_points_positive" CHECK ("points" > 0);
-- EARN uses reference as the invoice ID. Transfers may share a reference.
CREATE UNIQUE INDEX "Transaction_earn_invoice_unique"
  ON "Transaction" ("merchantId", "reference")
  WHERE "type" = 'EARN' AND "reference" IS NOT NULL;
