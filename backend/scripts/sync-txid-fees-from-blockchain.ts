/**
 * Sync Payouts.txidFee from the blockchain_payout table.
 *
 * For every txid present in both tables, sets Payouts."txidFee" on ALL rows of
 * that txid to the on-chain fee (MAX(txid_fee) per txid — the fee is stored
 * duplicated per recipient, so never SUM it). Only touches rows whose current
 * fee differs. Does NOT change Amount and does NOT flip txidFeeDeducted.
 *
 * Usage (PowerShell):
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/sync-txid-fees-from-blockchain.ts --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/sync-txid-fees-from-blockchain.ts --execute
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";

type DiffRow = {
  txid: string;
  payout_fee: string | null;
  blockchain_fee: string | null;
  payout_rows: number;
};

async function loadFeeDiffs(): Promise<DiffRow[]> {
  return AppDataSource.query(`
    WITH payout_agg AS (
      SELECT btrim(p.txid) AS txid,
             MAX(p."txidFee") AS fee,
             COUNT(*)::int    AS rows
      FROM "Payouts" p
      WHERE p.txid IS NOT NULL AND btrim(p.txid) <> ''
      GROUP BY btrim(p.txid)
    ),
    bc_agg AS (
      SELECT btrim(b.txid) AS txid,
             MAX(b.txid_fee) AS fee
      FROM blockchain_payout b
      WHERE b.txid IS NOT NULL AND btrim(b.txid) <> ''
      GROUP BY btrim(b.txid)
    )
    SELECT p.txid,
           p.fee::text  AS payout_fee,
           b.fee::text  AS blockchain_fee,
           p.rows       AS payout_rows
    FROM payout_agg p
    JOIN bc_agg b ON p.txid = b.txid
    WHERE COALESCE(p.fee, -1) IS DISTINCT FROM COALESCE(b.fee, -1)
      AND b.fee IS NOT NULL
    ORDER BY p.txid
  `);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);

  const diffs = await loadFeeDiffs();
  console.log(`Txids with a fee difference: ${diffs.length}`);

  for (const d of diffs) {
    console.log(
      `  ${d.txid.slice(0, 12)}… | payout fee ${d.payout_fee ?? "NULL"} -> blockchain fee ${d.blockchain_fee} | ${d.payout_rows} row(s)`,
    );
  }

  if (!diffs.length) {
    console.log("Nothing to sync — all fees already match.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  if (dryRun) {
    console.log("\nDRY RUN — pass --execute to apply.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  let updatedTxids = 0;
  let updatedRows = 0;

  for (const d of diffs) {
    const newFee = Number(d.blockchain_fee);
    const result = await AppDataSource.query(
      `UPDATE "Payouts"
       SET "txidFee" = $1
       WHERE btrim(txid) = $2
         AND ("txidFee" IS DISTINCT FROM $1)`,
      [newFee, d.txid],
    );
    // node-postgres returns [rows, rowCount] via TypeORM query for UPDATE without RETURNING
    const rowCount = Array.isArray(result) ? result[1] : (result?.affected ?? 0);
    updatedRows += Number(rowCount) || 0;
    updatedTxids++;
  }

  const verify = await AppDataSource.query(`
    WITH payout_agg AS (
      SELECT btrim(p.txid) AS txid, MAX(p."txidFee") AS fee
      FROM "Payouts" p
      WHERE p.txid IS NOT NULL AND btrim(p.txid) <> ''
      GROUP BY btrim(p.txid)
    ),
    bc_agg AS (
      SELECT btrim(b.txid) AS txid, MAX(b.txid_fee) AS fee
      FROM blockchain_payout b
      WHERE b.txid IS NOT NULL AND btrim(b.txid) <> ''
      GROUP BY btrim(b.txid)
    )
    SELECT COUNT(*)::int AS remaining_fee_mismatches
    FROM payout_agg p
    JOIN bc_agg b ON p.txid = b.txid
    WHERE COALESCE(p.fee, -1) IS DISTINCT FROM COALESCE(b.fee, -1)
  `);

  console.log("\n--- Summary ---");
  console.log("Txids updated:", updatedTxids);
  console.log("Payout rows updated:", updatedRows);
  console.log("Remaining fee mismatches:", verify[0]?.remaining_fee_mismatches);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
