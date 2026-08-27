-- Fix Contracts.Id sequence when it lags behind MAX(Id) (common after manual SQL imports).
SELECT setval(
  pg_get_serial_sequence('"Contracts"', 'Id'),
  COALESCE((SELECT MAX("Id") FROM "Contracts"), 0)
);
