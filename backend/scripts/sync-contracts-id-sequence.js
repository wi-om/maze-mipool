require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const maxRes = await c.query('SELECT COALESCE(MAX("Id"), 0) AS max FROM "Contracts"');
  const max = maxRes.rows[0].max;
  await c.query(
    `SELECT setval(pg_get_serial_sequence('"Contracts"', 'Id'), $1)`,
    [max]
  );
  console.log("Contracts Id sequence synced", { maxId: max, nextId: Number(max) + 1 });
  await c.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
