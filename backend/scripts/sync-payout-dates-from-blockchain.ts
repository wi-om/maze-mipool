/**
 * Sync Payouts.CreatedOn (and WalletTxn) from blockchain_payout.txn_date.
 * Blockchain date is source of truth when calendar day differs.
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/sync-payout-dates-from-blockchain.ts --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/sync-payout-dates-from-blockchain.ts --execute
 *   $env:DB_NAME="test"; npx ts-node ... scripts/sync-payout-dates-from-blockchain.ts --txid <txid> --execute
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";

async function loadDateDiffs(txidFilter?: string) {
  const params: string[] = [];
  let txidClause = "";
  if (txidFilter) {
    params.push(txidFilter);
    txidClause = "AND btrim(p.txid) = $1";
  }

  return AppDataSource.query(
    `
    WITH bc AS (
      SELECT btrim(txid) AS txid, MIN(txn_date) AS txn_date
      FROM blockchain_payout
      WHERE txid IS NOT NULL AND btrim(txid) <> ''
      GROUP BY btrim(txid)
    ),
    p AS (
      SELECT btrim(txid) AS txid, MIN("CreatedOn") AS payout_date, COUNT(*)::int AS rows
      FROM "Payouts"
      WHERE txid IS NOT NULL AND btrim(txid) <> ''
      GROUP BY btrim(txid)
    )
    SELECT p.txid,
           p.payout_date,
           bc.txn_date AS blockchain_date,
           p.rows,
           (p.payout_date AT TIME ZONE 'UTC')::date AS payout_day,
           (bc.txn_date AT TIME ZONE 'UTC')::date AS blockchain_day
    FROM p
    JOIN bc ON p.txid = bc.txid
    WHERE (p.payout_date AT TIME ZONE 'UTC')::date IS DISTINCT FROM (bc.txn_date AT TIME ZONE 'UTC')::date
    ${txidClause}
    ORDER BY bc.txn_date
    `,
    params,
  );
}

async function main() {
  const execute = process.argv.includes("--execute");
  const txidIdx = process.argv.indexOf("--txid");
  const txidFilter = txidIdx >= 0 ? process.argv[txidIdx + 1] : undefined;

  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);

  const diffs = await loadDateDiffs(txidFilter);
  console.log(`Txids with date mismatch: ${diffs.length}`);
  for (const d of diffs) {
    console.log(
      `  ${String(d.txid).slice(0, 12)}… | P: ${d.payout_day} -> B: ${d.blockchain_day} | ${d.rows} row(s)`,
    );
  }

  if (!diffs.length) {
    console.log("All dates already match.");
    await AppDataSource.destroy();
    return;
  }

  if (!execute) {
    console.log("\nDRY RUN — pass --execute to update Payouts.CreatedOn + WalletTxn.CreatedOn.");
    await AppDataSource.destroy();
    return;
  }

  let payoutRows = 0;
  let walletRows = 0;

  for (const d of diffs) {
    const bcDate = d.blockchain_date;

    const pRes = await AppDataSource.query(
      `UPDATE "Payouts" SET "CreatedOn" = $1 WHERE btrim(txid) = $2`,
      [bcDate, d.txid],
    );
    payoutRows += Number(pRes[1] ?? 0);

    const wRes = await AppDataSource.query(
      `
      UPDATE "WalletTxn" w
      SET "CreatedOn" = $1
      FROM "Payouts" p
      WHERE w."SourceType" = 'PAYOUT'
        AND w."SourceId" = p."Id"
        AND btrim(p.txid) = $2
      `,
      [bcDate, d.txid],
    );
    walletRows += Number(wRes[1] ?? 0);
  }

  const remaining = await loadDateDiffs(txidFilter);
  console.log("\n--- Summary ---");
  console.log("Payout rows updated:", payoutRows);
  console.log("WalletTxn rows updated:", walletRows);
  console.log("Remaining date mismatches:", remaining.length);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
