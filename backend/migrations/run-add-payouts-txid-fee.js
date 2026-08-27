const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "add-payouts-txid-fee.sql"), "utf8");
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied successfully");

    const verify = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'Payouts'
         AND column_name = 'txidFee'`
    );
    console.log("Column verification:", verify.rows);

    const sample = await client.query(
      `SELECT COUNT(*) AS total, COUNT("txidFee") AS with_fee
       FROM public."Payouts"`
    );
    console.log("Row check (existing data unchanged):", sample.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
