import { AppDataSource } from "@common";

/**
 * Resync Contracts.Id sequence after manual imports / seed data.
 * Without this, inserts fail with duplicate PK on Id.
 */
export async function syncContractsIdSequence(): Promise<void> {
  await AppDataSource.query(`
    SELECT setval(
      pg_get_serial_sequence('"Contracts"', 'Id'),
      COALESCE((SELECT MAX("Id") FROM "Contracts"), 0)
    )
  `);
}
