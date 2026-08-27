/**
 * Apply MIPS DB SQL migrations in order.
 * Run: node scripts/run-mips-migrations.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS = [
  "add-wallets-is-active.sql",
  "create-wallet-audit.sql",
  "add-payouts-txid-fee.sql",
  "add-payouts-paid-through-date.sql",
  "add-mips-otps-indexes.sql",
  "add-list-api-indexes.sql",
  "add-mips-users-password.sql",
  "add-contracts-mcc-transaction-id.sql",
  "fix-contracts-id-sequence.sql",
];

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

  for (const file of MIGRATIONS) {
    const sqlPath = path.join(__dirname, "..", "migrations", file);
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`\nApplying ${file}...`);
    await client.query(sql);
    console.log(`OK ${file}`);
  }

  await client.end();
  console.log("\nAll migrations applied.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
