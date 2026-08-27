-- Add nullable txidFee column to Payouts (existing rows remain NULL)
ALTER TABLE public."Payouts" ADD COLUMN IF NOT EXISTS "txidFee" numeric(24, 8) NULL;
