-- Fix Contracts.Id sequence when it lags behind MAX(Id) (common after manual SQL imports).
-- Uses mipool schema (match DB_SCHEMA in .env).
SELECT setval(
  pg_get_serial_sequence('mipool."Contracts"', 'Id'),
  COALESCE((SELECT MAX("Id") FROM mipool."Contracts"), 0)
);
