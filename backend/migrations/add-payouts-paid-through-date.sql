-- Pay-through work date for EU manual payouts (work today, pay tomorrow)
ALTER TABLE "Payouts"
  ADD COLUMN IF NOT EXISTS "paidThroughDate" date;

COMMENT ON COLUMN "Payouts"."paidThroughDate" IS 'Last Dubai work-date (reward day) included in this payout batch';

-- Backfill: payout entered on D pays work through D-1 (Dubai)
UPDATE "Payouts"
SET "paidThroughDate" = (
  ("CreatedOn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dubai')::date - INTERVAL '1 day'
)::date
WHERE "paidThroughDate" IS NULL
  AND "Status" = 'Complete'
  AND NULLIF(TRIM("txid"), '') IS NOT NULL;
