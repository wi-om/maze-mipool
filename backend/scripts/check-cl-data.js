require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  const s = process.env.DB_SCHEMA || "mipool";

  for (const t of ["CLContracts", "CLRewards", "CLPayouts", "Rewards", "Payouts", "Accounts"]) {
    try {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${s}"."${t}"`);
      console.log(`${t}: ${r.rows[0].n}`);
    } catch (e) {
      console.log(`${t}: MISSING (${e.message})`);
    }
  }

  const cl = await client.query(
    `SELECT "Id", "Hashrate", "Status", TRIM("AcNo") AS ac, "ContractRef", "ClientID"
     FROM "${s}"."CLContracts" ORDER BY "Id"`
  );
  console.log("\nCLContracts:", JSON.stringify(cl.rows, null, 2));

  const eu = await client.query(
    `SELECT COUNT(*)::int AS cnt, COALESCE(SUM("Amount"),0) AS total, MIN("CreatedOn") AS first, MAX("CreatedOn") AS last
     FROM "${s}"."Rewards" WHERE TRIM("AcNo") = 'MI10000001'`
  );
  console.log("\nEU Rewards:", eu.rows[0]);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
