/**
 * One-time backfill: set Wallets.Balance = SUM(Rewards since last Complete payout) per EU AcNo.
 * Run: node scripts/backfill-wallet-balance.js
 */
require("dotenv").config();
const { Client } = require("pg");

const COMPLETE_STATUSES = ["Complete", "sent"];

async function getLastCompletePayout(client, acNo) {
  const res = await client.query(
    `SELECT "CreatedOn", "Status", txid FROM "Payouts"
     WHERE "AcNo" = $1
     ORDER BY "CreatedOn" DESC`,
    [acNo],
  );
  return res.rows.find(
    (p) => COMPLETE_STATUSES.includes(p.Status) && p.txid && String(p.txid).trim(),
  );
}

async function sumRewardsSince(client, acNo, since) {
  const res = since
    ? await client.query(
        `SELECT COALESCE(SUM("Amount"), 0) AS total FROM "Rewards"
         WHERE "AcNo" = $1 AND "CreatedOn" > $2`,
        [acNo, since],
      )
    : await client.query(
        `SELECT COALESCE(SUM("Amount"), 0) AS total FROM "Rewards" WHERE "AcNo" = $1`,
        [acNo],
      );
  return Number(res.rows[0].total || 0);
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

  const accounts = await client.query(
    `SELECT "AcNo" FROM "Accounts" WHERE "Type" = 'EU'`,
  );

  let updated = 0;
  for (const { AcNo } of accounts.rows) {
    const acNo = String(AcNo).trim();
    const lastPayout = await getLastCompletePayout(client, acNo);
    const expected = await sumRewardsSince(client, acNo, lastPayout?.CreatedOn ?? null);

    const walletRes = await client.query(
      `SELECT "ID", "Balance", "IsActive" FROM "Wallets"
       WHERE "AcNo" = $1
       ORDER BY CASE WHEN "IsActive" = true THEN 0 ELSE 1 END, "CreatedOn" DESC NULLS LAST
       LIMIT 1`,
      [acNo],
    );
    if (!walletRes.rows.length) {
      console.log(`skip ${acNo}: no wallet`);
      continue;
    }

    const wallet = walletRes.rows[0];
    const current = Number(wallet.Balance || 0);
    if (Math.abs(current - expected) < 1e-10) continue;

    await client.query(
      `UPDATE "Wallets" SET "Balance" = $1, "ModifiedOn" = NOW() WHERE "ID" = $2`,
      [expected, wallet.ID],
    );
    updated++;
    console.log(`updated ${acNo}: ${current} -> ${expected}`);
  }

  console.log(`Backfill complete. Updated ${updated} wallet(s).`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
