-- Step 2 txid fee deduction: prevent applying Amount − txidFee twice on the same payout row.
ALTER TABLE public."Payouts"
  ADD COLUMN IF NOT EXISTS "txidFeeDeducted" boolean NOT NULL DEFAULT false;
