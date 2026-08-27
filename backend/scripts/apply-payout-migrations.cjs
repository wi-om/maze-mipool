/**
 * Apply payout-related migrations on the DB from .env (idempotent IF NOT EXISTS).
 * Usage: node scripts/apply-payout-migrations.cjs
 */
require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const MIGRATION_FILES = [
  "add-payouts-paid-through-date.sql",
  "add-payouts-txid-fee.sql",
  "add-payout-txid-fee-deducted.sql",
];

const PAYOUT_COLUMNS = ["txidFee", "paidThroughDate", "txidFeeDeducted"];

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function listPayoutColumns() {
  const result = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'Payouts'
     ORDER BY ordinal_position`,
  );
  return result.rows;
}

(async () => {
  await client.connect();
  console.log("Target database:", process.env.DB_NAME, "@", process.env.DB_HOST);

  const before = await listPayoutColumns();
  const beforeNames = new Set(before.map((r) => r.column_name));
  console.log("\nPayouts columns (before):", [...beforeNames].join(", "));

  const missing = PAYOUT_COLUMNS.filter((c) => !beforeNames.has(c));
  if (!missing.length) {
    console.log("\nAll payout migration columns already exist. Nothing to apply.");
  } else {
    console.log("\nMissing columns:", missing.join(", "));
    for (const file of MIGRATION_FILES) {
      const sqlPath = path.join(__dirname, "..", "migrations", file);
      const sql = fs.readFileSync(sqlPath, "utf8");
      console.log("\nApplying:", file);
      await client.query(sql);
      console.log("  OK");
    }
  }

  const after = await listPayoutColumns();
  const payoutCols = after.filter((r) => PAYOUT_COLUMNS.includes(r.column_name));
  console.log("\nPayout migration columns (after):");
  for (const col of payoutCols) {
    console.log(
      `  - ${col.column_name}: ${col.data_type}, nullable=${col.is_nullable}, default=${col.column_default ?? "none"}`,
    );
  }

  const stillMissing = PAYOUT_COLUMNS.filter((c) => !after.some((r) => r.column_name === c));
  if (stillMissing.length) {
    console.error("\nERROR: still missing:", stillMissing.join(", "));
    process.exit(1);
  }

  console.log("\nPayout migrations verified on dev DB.");
  await client.end();
})().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
