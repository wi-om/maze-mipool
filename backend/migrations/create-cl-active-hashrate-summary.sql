-- Active CL hashrate summary by account (used by CL Contracts dashboard)
CREATE OR REPLACE VIEW "CLActiveHashrateSummary" AS
SELECT
  TRIM(c."AcNo") AS "AcNo",
  c."ClientID",
  COUNT(*)::int AS "ActiveContracts",
  COALESCE(SUM(CAST(c."Hashrate" AS NUMERIC)), 0) AS "TotalHashrate"
FROM "CLContracts" c
WHERE c."Status" = 1
  AND c."ContractStartDate" IS NOT NULL
  AND c."ContractStartDate" <= NOW()
  AND (c."ContractEndDate" IS NULL OR c."ContractEndDate" >= NOW())
GROUP BY TRIM(c."AcNo"), c."ClientID";
