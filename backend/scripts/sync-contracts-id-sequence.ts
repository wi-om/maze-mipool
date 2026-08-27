import "reflect-metadata";
import { AppDataSource } from "./src/common";
import { syncContractsIdSequence } from "./src/modules/crm/services/contract/contractSequence.service";

async function main() {
  await AppDataSource.initialize();
  await syncContractsIdSequence();
  const [{ max, nextval }] = await AppDataSource.query(`
    SELECT
      (SELECT MAX("Id") FROM "Contracts") AS max,
      (SELECT last_value FROM pg_get_serial_sequence('"Contracts"', 'Id')::regclass) AS nextval
  `);
  console.log("Contracts Id sequence synced", { max, nextval });
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
