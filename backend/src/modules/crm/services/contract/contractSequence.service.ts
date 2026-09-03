import { AppDataSource } from "@common";

function dbSchema(): string {
  return String((AppDataSource.options as { schema?: string }).schema || "public");
}

/** Quoted table ref for SQL: "mipool"."Contracts" */
function contractsTableRef(): string {
  const schema = dbSchema();
  return `"${schema}"."Contracts"`;
}

/** Table ref for pg_get_serial_sequence: mipool."Contracts" (schema unquoted, table quoted) */
function contractsSequenceTableRef(): string {
  const schema = dbSchema();
  return `${schema}."Contracts"`;
}

/**
 * Resync Contracts.Id sequence after manual imports / seed data.
 * Without this, inserts fail with duplicate PK on Id.
 */
export async function syncContractsIdSequence(): Promise<void> {
  const table = contractsTableRef();
  const seqTable = contractsSequenceTableRef();
  await AppDataSource.query(`
    SELECT setval(
      pg_get_serial_sequence('${seqTable}', 'Id'),
      COALESCE((SELECT MAX("Id") FROM ${table}), 0)
    )
  `);
}
