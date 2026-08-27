/**
 * Apply one SQL migration file.
 * Usage: node scripts/run-single-migration.js <filename.sql>
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-single-migration.js <filename.sql>");
  process.exit(1);
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Connected to ${process.env.DB_HOST} / ${process.env.DB_NAME}`);

  const sqlPath = path.join(__dirname, "..", "migrations", file);
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`Applying ${file}...`);
  await client.query(sql);
  console.log(`OK ${file}`);

  if (file === "add-payouts-paid-through-date.sql") {
    const col = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'Payouts' AND column_name = 'paidThroughDate'`,
    );
    console.log("Column:", col.rows[0] || "MISSING");
    const stats = await client.query(
      `SELECT COUNT(*)::int AS total, COUNT("paidThroughDate")::int AS with_date FROM "Payouts"`,
    );
    console.log("Payouts:", stats.rows[0]);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
