-- WalletAudit table for MIPS DB (Wallets table already exists)
CREATE TABLE IF NOT EXISTS public."WalletAudit" (
  "ID" SERIAL NOT NULL,
  "WalletId" integer NULL,
  "AcNo" char(12) NOT NULL,
  "PreviousValue" character varying(256) NULL,
  "NewValue" character varying(256) NOT NULL,
  "Action" character varying(32) NOT NULL,
  "ChangedAt" timestamp NOT NULL DEFAULT now(),
  "ChangedBy" character varying(64) NULL,
  "Ip" character varying(64) NULL,
  CONSTRAINT "PK_WalletAudit" PRIMARY KEY ("ID")
);

CREATE INDEX IF NOT EXISTS "IDX_WalletAudit_AcNo" ON public."WalletAudit" ("AcNo");
CREATE INDEX IF NOT EXISTS "IDX_WalletAudit_ChangedAt" ON public."WalletAudit" ("ChangedAt" DESC);
