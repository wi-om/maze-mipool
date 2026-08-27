require("dotenv").config();
const { Client } = require("pg");

const txid = process.argv[2];
const targetDate = process.argv[3];

if (!txid || !targetDate) {
  console.error("Usage: node scripts/set-payout-txid-by-date.cjs <txid> <YYYY-MM-DD>");
  process.exit(1);
}

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  console.log("Database:", process.env.DB_NAME, "@", process.env.DB_HOST);

  const before = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM public."Payouts"
     WHERE DATE("CreatedOn") = $1`,
    [targetDate],
  );

  const result = await client.query(
    `UPDATE public."Payouts"
     SET txid = $1
     WHERE DATE("CreatedOn") = $2
       AND (txid IS NULL OR BTRIM(txid) = '')`,
    [txid, targetDate],
  );

  const sample = await client.query(
    `SELECT "Id", "CreatedOn", "txid", "Status"
     FROM public."Payouts"
     WHERE DATE("CreatedOn") = $1
     ORDER BY "Id"
     LIMIT 5`,
    [targetDate],
  );

  console.log("Rows on", targetDate + ":", before.rows[0].count);
  console.log("Updated rows:", result.rowCount);
  console.log("Sample:", JSON.stringify(sample.rows, null, 2));
  await client.end();
})().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
