-- Speed up list endpoints ordered by date
CREATE INDEX IF NOT EXISTS "IDX_Rewards_CreatedOn" ON "Rewards" ("CreatedOn" DESC);
CREATE INDEX IF NOT EXISTS "IDX_Payouts_CreatedOn" ON "Payouts" ("CreatedOn" DESC);
CREATE INDEX IF NOT EXISTS "IDX_CM_wallet_Date" ON "CM_wallet" ("Date" DESC);
