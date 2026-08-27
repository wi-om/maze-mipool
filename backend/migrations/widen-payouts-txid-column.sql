-- Allow comma-separated multiple txids on one payout row (max 2 × 64 chars + comma).
ALTER TABLE public."Payouts"
  ALTER COLUMN txid TYPE varchar(256);
