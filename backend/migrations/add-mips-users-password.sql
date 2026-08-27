-- SHA256 hex password hash (never store plain text)
ALTER TABLE "MipsUsers"
  ADD COLUMN IF NOT EXISTS "Password" char(64);

COMMENT ON COLUMN "MipsUsers"."Password" IS 'SHA256 hex of user password (hashed client-side before transmit)';
