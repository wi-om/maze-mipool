/**
 * Verify wallet + balance state for payout test accounts.
 * Run: node scripts/verify-payout-test-accounts.js
 */
require("dotenv").config();
const { Client } = require("pg");

const AC_NOS = [
  "MI45580850", "MI33863358", "MI11905969", "MI36007513", "MI39190255",
  "MI50083612", "MI81726861", "MI50529612", "MI46681751", "MI40071812",
  "MI23143259", "MI32060644", "MI90546948", "MI72568765", "MI89707797",
  "MI76648847", "MI29580185", "MI36463115", "MI54489412", "MI48536821",
  "MI78234256", "MI93691918", "MI54332648", "MI83761986",
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

  console.log("AcNo          | Parent (clientid)     | Wallet Addr (active)              | Balance    | Rewards pending | Last Complete Payout");
  console.log("-".repeat(120));

  let withBalance = 0;
  let withWallet = 0;

  for (const acNo of AC_NOS) {
    const acc = await client.query(
      `SELECT TRIM("AcNo") AS ac, "Parent" FROM "Accounts" WHERE TRIM("AcNo") = $1`,
      [acNo],
    );
    const parent = acc.rows[0]?.Parent ?? "N/A";

    const wallet = await client.query(
      `SELECT "Addr", "Balance", "IsActive" FROM "Wallets"
       WHERE TRIM("AcNo") = $1 AND "IsActive" = true LIMIT 1`,
      [acNo],
    );
    const w = wallet.rows[0];
    const addr = w ? String(w.Addr).trim().slice(0, 34) : "MISSING";
    const balance = w ? Number(w.Balance || 0) : 0;
    if (w && addr !== "MISSING" && addr !== "HOLD") withWallet++;
    if (balance > 0) withBalance++;

    const lastPayout = await client.query(
      `SELECT "CreatedOn", "Status", txid FROM "Payouts"
       WHERE TRIM("AcNo") = $1 AND "Status" IN ('Complete','sent') AND txid IS NOT NULL AND TRIM(txid) <> ''
       ORDER BY "CreatedOn" DESC LIMIT 1`,
      [acNo],
    );
    const since = lastPayout.rows[0]?.CreatedOn ?? null;

    const rewards = since
      ? await client.query(
          `SELECT COALESCE(SUM("Amount"),0) AS total FROM "Rewards"
           WHERE TRIM("AcNo") = $1 AND "CreatedOn" > $2`,
          [acNo, since],
        )
      : await client.query(
          `SELECT COALESCE(SUM("Amount"),0) AS total FROM "Rewards" WHERE TRIM("AcNo") = $1`,
          [acNo],
        );
    const pendingRewards = Number(rewards.rows[0].total || 0);
    const lastPaid = since ? new Date(since).toISOString().slice(0, 10) : "never";

    console.log(
      `${acNo} | ${String(parent).padEnd(20)} | ${addr.padEnd(34)} | ${balance.toFixed(8)} | ${pendingRewards.toFixed(8)}     | ${lastPaid}`,
    );
  }

  console.log("-".repeat(120));
  console.log(`Accounts: ${AC_NOS.length} | Active wallets: ${withWallet} | With balance > 0: ${withBalance}`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
