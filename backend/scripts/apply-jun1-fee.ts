/**
 * Apply txid fee for Jun 1 2026 tx to Payouts + blockchain_payout.
 * Usage: $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/apply-jun1-fee.ts --execute
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";

const TXID = "c220e632dd6b95acab4681e48d264ee9e7eb693e3de7a62f44fa9b5fd7a825d0";
const TX_FEE = 0.00001724;
const TXN_DATE = "2026-06-01T14:00:00.000Z";

async function main() {
  const execute = process.argv.includes("--execute");
  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);

  const payoutBefore = await AppDataSource.query(
    `SELECT COUNT(*)::int rows, SUM("Amount")::numeric(24,8) gross, MAX("txidFee") fee
     FROM "Payouts" WHERE btrim(txid) = $1`,
    [TXID],
  );
  const bcBefore = await AppDataSource.query(
    `SELECT COUNT(*)::int rows, SUM(amount)::numeric(24,8) gross, MAX(txid_fee) fee
     FROM blockchain_payout WHERE btrim(txid) = $1`,
    [TXID],
  );

  console.log("Payouts before:", payoutBefore[0]);
  console.log("blockchain_payout before:", bcBefore[0]);

  if (!execute) {
    console.log(`\nDRY RUN — would set txidFee=${TX_FEE} on all rows for this txid.`);
    if (Number(bcBefore[0]?.rows) === 0) {
      console.log("Would also INSERT blockchain_payout rows from existing Payouts data.");
    }
    await AppDataSource.destroy();
    return;
  }

  const payoutUpd = await AppDataSource.query(
    `UPDATE "Payouts" SET "txidFee" = $1 WHERE btrim(txid) = $2`,
    [TX_FEE, TXID],
  );
  console.log("Payouts updated:", payoutUpd[1] ?? payoutUpd);

  const bcRows = Number(bcBefore[0]?.rows);
  if (bcRows === 0) {
    const inserted = await AppDataSource.query(
      `INSERT INTO blockchain_payout (txid, ac_no, mip_contract_no, address, amount, txid_fee, txn_date, status, source)
       SELECT btrim(p.txid), p."AcNo", p."mipContractNo", TRIM(p."ToAddr"), p."Amount", $1, $2, 'Complete', 'payouts_sync'
       FROM "Payouts" p WHERE btrim(p.txid) = $3`,
      [TX_FEE, TXN_DATE, TXID],
    );
    console.log("blockchain_payout inserted from Payouts:", inserted[1] ?? inserted);
  } else {
    const bcUpd = await AppDataSource.query(
      `UPDATE blockchain_payout SET txid_fee = $1 WHERE btrim(txid) = $2`,
      [TX_FEE, TXID],
    );
    console.log("blockchain_payout updated:", bcUpd[1] ?? bcUpd);
  }

  const payoutAfter = await AppDataSource.query(
    `SELECT COUNT(*)::int rows, SUM("Amount")::numeric(24,8) gross, MAX("txidFee") fee
     FROM "Payouts" WHERE btrim(txid) = $1`,
    [TXID],
  );
  const bcAfter = await AppDataSource.query(
    `SELECT COUNT(*)::int rows, SUM(amount)::numeric(24,8) gross, MAX(txid_fee) fee
     FROM blockchain_payout WHERE btrim(txid) = $1`,
    [TXID],
  );
  console.log("\nPayouts after:", payoutAfter[0]);
  console.log("blockchain_payout after:", bcAfter[0]);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
