-- Add active/inactive tracking to existing Wallets table
ALTER TABLE public."Wallets"
  ADD COLUMN IF NOT EXISTS "IsActive" boolean NULL,
  ADD COLUMN IF NOT EXISTS "DeactivatedOn" timestamp NULL;

-- Existing rows become active (single-wallet legacy data)
UPDATE public."Wallets"
SET "IsActive" = true
WHERE "IsActive" IS NULL;

CREATE INDEX IF NOT EXISTS "IDX_Wallets_AcNo_IsActive" ON public."Wallets" ("AcNo", "IsActive");
CREATE INDEX IF NOT EXISTS "IDX_Wallets_AcNo_Addr" ON public."Wallets" ("AcNo", "Addr");
