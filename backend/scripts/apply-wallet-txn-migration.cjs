/**
 * Create WalletTxn table (idempotent).
 * Usage: node scripts/apply-wallet-txn-migration.cjs
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Target:", process.env.DB_NAME, "@", process.env.DB_HOST);

  const sqlPath = path.join(__dirname, "..", "migrations", "create-wallet-txn.sql");
  await client.query(fs.readFileSync(sqlPath, "utf8"));

  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'WalletTxn' ORDER BY ordinal_position`,
  );
  console.log("WalletTxn columns:", cols.rows.map((r) => r.column_name).join(", "));
  await client.end();
  console.log("WalletTxn migration OK.");
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
