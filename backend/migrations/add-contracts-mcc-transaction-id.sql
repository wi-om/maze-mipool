-- Idempotent contract registration from mcc-delta (no MCC DB column needed)
ALTER TABLE "Contracts"
  ADD COLUMN IF NOT EXISTS "MccTransactionId" character varying(64);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_Contracts_MccTransactionId"
  ON "Contracts" ("MccTransactionId")
  WHERE "MccTransactionId" IS NOT NULL;

COMMENT ON COLUMN "Contracts"."MccTransactionId" IS 'MCC transaction.transactionId for purchase idempotency';
