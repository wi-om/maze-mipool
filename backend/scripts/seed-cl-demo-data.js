/**
 * Seed CL contract demo data: view, 10 days CL rewards/payouts + CM wallet
 * aligned with EU seed (om Basic 250 — 10 days @ 0.00031 BTC/day, 250 TH).
 *
 * Run: node scripts/seed-cl-demo-data.js
 */
require("dotenv").config();
const { Client } = require("pg");

const SCHEMA = process.env.DB_SCHEMA || "mipool";

const CL_AC_NO = "CL10000001";
const CL_CONTRACT_ID = 1;
const CL_HASHRATE_TH = 5000;
const EU_DAILY_BTC = 0.00031;
const EU_HASHRATE_TH = 250;
const REWARD_DAYS = 10;
const CL_BTC_ADDR = "bc1qclmazedemo0005000hash";

/** Same ratio as EU: scale daily BTC by hashrate. */
const CL_DAILY_GROSS_BTC = EU_DAILY_BTC * (CL_HASHRATE_TH / EU_HASHRATE_TH);
const OC_FACTOR = 1.0;
const SLA_FACTOR = 0.99;
const CL_OBTAINED_HASHRATE = CL_HASHRATE_TH * OC_FACTOR * SLA_FACTOR;
const CL_DAILY_NET_BTC = CL_DAILY_GROSS_BTC; // hosting fee 0%

function padAcNo(acNo) {
  return acNo.padEnd(12, " ");
}

function dubaiDateDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function ensureSummaryView(client) {
  await client.query(`
    CREATE OR REPLACE VIEW "${SCHEMA}"."CLActiveHashrateSummary" AS
    SELECT
      TRIM(c."AcNo") AS "AcNo",
      c."ClientID",
      COUNT(*)::int AS "ActiveContracts",
      COALESCE(SUM(CAST(c."Hashrate" AS NUMERIC)), 0) AS "TotalHashrate"
    FROM "${SCHEMA}"."CLContracts" c
    WHERE c."Status" = 1
      AND c."ContractStartDate" IS NOT NULL
      AND c."ContractStartDate" <= NOW()
      AND (c."ContractEndDate" IS NULL OR c."ContractEndDate" >= NOW())
    GROUP BY TRIM(c."AcNo"), c."ClientID"
  `);
  console.log("Created/updated CLActiveHashrateSummary view");
}

async function ensureClContract(client) {
  const acNo = padAcNo(CL_AC_NO);
  const existing = await client.query(
    `SELECT "Id" FROM "${SCHEMA}"."CLContracts" WHERE "Id" = $1 OR TRIM("AcNo") = $2 LIMIT 1`,
    [CL_CONTRACT_ID, CL_AC_NO]
  );
  if (existing.rows.length) {
    console.log(`CL contract exists (id=${existing.rows[0].Id})`);
    return existing.rows[0].Id;
  }

  const now = new Date();
  const start = dubaiDateDaysAgo(REWARD_DAYS + 30);
  const end = new Date(now);
  end.setUTCFullYear(end.getUTCFullYear() + 5);

  const res = await client.query(
    `INSERT INTO "${SCHEMA}"."CLContracts"
      ("AcNo", "ClientID", "Hashrate", "Remark", "ContractRef", "ContractStartDate", "ContractEndDate",
       "Status", "CreatedOn", "ModifiedOn", "hostingfee", "SLA")
     VALUES ($1,'MAZE',$2,'Demo CL capacity','DEMO-CL-5000TH',$3,$4,1,$5,$5,0,99)
     RETURNING "Id"`,
    [acNo, CL_HASHRATE_TH, start, end, now]
  );
  console.log(`Created CL contract id=${res.rows[0].Id}`);
  return res.rows[0].Id;
}

async function seedClRewards(client, contractId) {
  const acNo = padAcNo(CL_AC_NO);
  let inserted = 0;

  for (let day = REWARD_DAYS; day >= 1; day--) {
    const rewardOn = dubaiDateDaysAgo(day);
    const dateKey = rewardOn.toISOString().slice(0, 10);

    const exists = await client.query(
      `SELECT 1 FROM "${SCHEMA}"."CLRewards"
       WHERE "MipContractNo" = $1 AND DATE("rewardOn") = $2::date LIMIT 1`,
      [contractId, dateKey]
    );
    if (exists.rows.length) continue;

    const feeAmount = 0;
    const feeHashrate = 0;

    await client.query(
      `INSERT INTO "${SCHEMA}"."CLRewards"
        ("AcNo", "MipContractNo", "Amount", "Type", "Hashrate", "hostingfee_amount", "hostingfee_hashrate",
         sla, oc, net_amount, net_hashrate, "rewardOn")
       VALUES ($1,$2,$3,'FPPS',$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        acNo,
        contractId,
        CL_DAILY_GROSS_BTC,
        CL_OBTAINED_HASHRATE,
        feeAmount,
        feeHashrate,
        SLA_FACTOR,
        OC_FACTOR,
        CL_DAILY_NET_BTC,
        CL_OBTAINED_HASHRATE,
        rewardOn,
      ]
    );
    inserted++;
  }

  console.log(`CL rewards inserted: ${inserted} (${REWARD_DAYS} days target)`);
}

async function seedClPayouts(client, contractId) {
  const acNo = padAcNo(CL_AC_NO);
  let inserted = 0;

  for (let day = REWARD_DAYS; day >= 1; day--) {
    const createdOn = dubaiDateDaysAgo(day);
    createdOn.setUTCHours(14, 0, 0, 0);
    const dateKey = createdOn.toISOString().slice(0, 10).replace(/-/g, "");
    const txid = `demo_cl5000_${dateKey}`;

    const exists = await client.query(
      `SELECT 1 FROM "${SCHEMA}"."CLPayouts" WHERE "TxnID" = $1 LIMIT 1`,
      [txid]
    );
    if (exists.rows.length) continue;

    await client.query(
      `INSERT INTO "${SCHEMA}"."CLPayouts"
        ("AcNo", "ContractNo", "Amount", "CreatedOn", "ToAddr", "TxnID", "Status")
       VALUES ($1,$2,$3,$4,$5,$6,'sent')`,
      [acNo, contractId, CL_DAILY_NET_BTC, createdOn, CL_BTC_ADDR, txid]
    );
    inserted++;
  }

  console.log(`CL payouts inserted: ${inserted}`);
}

async function seedCmWallet(client) {
  const acNo = padAcNo(CL_AC_NO);
  let inserted = 0;
  let runningBalance = 0;

  for (let day = REWARD_DAYS; day >= 1; day--) {
    const rewardDate = dubaiDateDaysAgo(day);
    const dateKey = rewardDate.toISOString().slice(0, 10);

    const exists = await client.query(
      `SELECT 1 FROM "${SCHEMA}"."CM_wallet"
       WHERE TRIM("AcNo") = $1 AND DATE("Date") = $2::date LIMIT 1`,
      [CL_AC_NO, dateKey]
    );
    if (exists.rows.length) continue;

    const clAmount = CL_DAILY_NET_BTC;
    const clHashrate = CL_OBTAINED_HASHRATE;
    const euSalesAmount = EU_DAILY_BTC;
    const euSalesHashrate = EU_HASHRATE_TH;
    const netAmount = clAmount - euSalesAmount;
    const netHashrate = clHashrate - euSalesHashrate;
    runningBalance = Math.max(0, runningBalance + netAmount);

    await client.query(
      `INSERT INTO "${SCHEMA}"."CM_wallet"
        ("AcNo", "Date", "Hashrate", "Amount", "Sales_amount", "Sales_hashrate", "Net_amount", "Net_Hashrate", "Net_Balance")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        acNo,
        rewardDate,
        clHashrate,
        clAmount,
        euSalesAmount,
        euSalesHashrate,
        netAmount,
        netHashrate,
        runningBalance,
      ]
    );
    inserted++;
  }

  console.log(`CM wallet rows inserted: ${inserted}`);
}

async function printSummary(client) {
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM "${SCHEMA}"."CLContracts") AS cl_contracts,
      (SELECT COUNT(*)::int FROM "${SCHEMA}"."CLRewards") AS cl_rewards,
      (SELECT COUNT(*)::int FROM "${SCHEMA}"."CLPayouts") AS cl_payouts,
      (SELECT COUNT(*)::int FROM "${SCHEMA}"."Rewards" WHERE TRIM("AcNo") = 'MI10000001') AS eu_rewards,
      (SELECT COUNT(*)::int FROM "${SCHEMA}"."Payouts" WHERE TRIM("AcNo") = 'MI10000001') AS eu_payouts,
      (SELECT COALESCE(SUM("Amount"),0) FROM "${SCHEMA}"."CLRewards") AS cl_reward_btc,
      (SELECT COALESCE(SUM("Amount"),0) FROM "${SCHEMA}"."Rewards" WHERE TRIM("AcNo") = 'MI10000001') AS eu_reward_btc
  `);
  const s = counts.rows[0];
  console.log("\n=== Summary ===");
  console.log(`CL contract: ${s.cl_contracts} | CL rewards: ${s.cl_rewards} (${s.cl_reward_btc} BTC)`);
  console.log(`CL payouts: ${s.cl_payouts}`);
  console.log(`EU rewards: ${s.eu_rewards} (${s.eu_reward_btc} BTC) | EU payouts: ${s.eu_payouts}`);
  console.log(`Daily CL gross: ${CL_DAILY_GROSS_BTC} BTC (${CL_HASHRATE_TH} TH)`);
  console.log(`Daily EU: ${EU_DAILY_BTC} BTC (${EU_HASHRATE_TH} TH)`);
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
  console.log(`Connected to ${process.env.DB_HOST}/${process.env.DB_NAME} (schema: ${SCHEMA})`);

  try {
    await client.query("BEGIN");
    await ensureSummaryView(client);
    const contractId = await ensureClContract(client);
    await seedClRewards(client, contractId);
    await seedClPayouts(client, contractId);
    await seedCmWallet(client);
    await client.query("COMMIT");
    await printSummary(client);
    console.log("\nDone. Refresh CL Contract, CL Rewards, and Payouts pages.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
