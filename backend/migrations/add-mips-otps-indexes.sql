-- Speed up OTP login: lookup by email and verify by email+otp+expiry
CREATE INDEX IF NOT EXISTS "IDX_MipsOtps_email" ON "MipsOtps" ("email");
CREATE INDEX IF NOT EXISTS "IDX_MipsOtps_email_otp" ON "MipsOtps" ("email", "otp");
