-- EU wallet transaction ledger (credits from rewards, debits from payouts)
CREATE TABLE IF NOT EXISTS public."WalletTxn" (
  "Id" SERIAL NOT NULL,
  "AcNo" char(12) NOT NULL,
  "WalletId" integer NULL,
  "TxnType" varchar(8) NOT NULL,
  "Amount" numeric(24, 8) NOT NULL,
  "RunningBalance" numeric(24, 8) NOT NULL DEFAULT 0,
  "txid" varchar(256) NULL,
  "Source" varchar(128) NOT NULL,
  "Destination" varchar(128) NOT NULL,
  "AssetName" varchar(64) NOT NULL DEFAULT 'Bitcoin',
  "AssetCode" varchar(16) NOT NULL DEFAULT 'BTC',
  "Remark" varchar(256) NULL,
  "Reference" char(12) NULL,
  "SourceType" varchar(16) NOT NULL,
  "SourceId" integer NOT NULL,
  "WorkDate" date NULL,
  "CreatedOn" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "PK_WalletTxn" PRIMARY KEY ("Id"),
  CONSTRAINT "UQ_WalletTxn_SourceType_SourceId" UNIQUE ("SourceType", "SourceId"),
  CONSTRAINT "CHK_WalletTxn_TxnType" CHECK ("TxnType" IN ('CREDIT', 'DEBIT')),
  CONSTRAINT "CHK_WalletTxn_SourceType" CHECK ("SourceType" IN ('REWARD', 'PAYOUT'))
);

CREATE INDEX IF NOT EXISTS "IDX_WalletTxn_AcNo_CreatedOn"
  ON public."WalletTxn" ("AcNo", "CreatedOn" DESC);

CREATE INDEX IF NOT EXISTS "IDX_WalletTxn_AcNo_WorkDate"
  ON public."WalletTxn" ("AcNo", "WorkDate");

CREATE INDEX IF NOT EXISTS "IDX_WalletTxn_txid"
  ON public."WalletTxn" ("txid")
  WHERE "txid" IS NOT NULL AND BTRIM("txid") <> '';

COMMENT ON TABLE public."WalletTxn" IS 'EU wallet ledger: CREDIT from Rewards, DEBIT from Payouts';
COMMENT ON COLUMN public."WalletTxn"."Reference" IS 'mipContractNo';
