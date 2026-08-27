/**
 * Remove duplicate Payouts rows for a txid where address appears more than once.
 * Keeps the row whose Amount matches blockchain_payout; deletes the rest + WalletTxn, credits wallets.
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/remove-duplicate-payouts-for-txid.ts --txid <txid> --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/remove-duplicate-payouts-for-txid.ts --txid <txid> --execute
 */
import "reflect-metadata";
import { AppDataSource } from "../src/common";
import { creditWalletBalance } from "../src/modules/crm/services/wallet/walletBalance.service";
import { recalcRunningBalances } from "../src/modules/crm/services/wallet/walletTxn.service";

type Row = {
  Id: number;
  addr: string;
  amt: string;
  acno: string;
  bc_amt: string;
  amt_match: string;
};

async function findDuplicates(txid: string): Promise<{ keep: Row[]; del: Row[] }> {
  const rows: Row[] = await AppDataSource.query(
    `
    SELECT p."Id", TRIM(p."ToAddr") AS addr, p."Amount"::text AS amt, TRIM(p."AcNo") AS acno,
           b.amount::text AS bc_amt,
           CASE WHEN p."Amount" = b.amount THEN 'match' ELSE 'diff' END AS amt_match
    FROM "Payouts" p
    JOIN blockchain_payout b
      ON btrim(p.txid) = btrim(b.txid) AND TRIM(p."ToAddr") = TRIM(b.address)
    WHERE btrim(p.txid) = $1
    ORDER BY addr, p."Id"
    `,
    [txid],
  );

  const byAddr = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byAddr.get(r.addr) ?? [];
    list.push(r);
    byAddr.set(r.addr, list);
  }

  const keep: Row[] = [];
  const del: Row[] = [];

  for (const list of byAddr.values()) {
    if (list.length <= 1) {
      keep.push(list[0]);
      continue;
    }
    const matched = list.filter((r) => r.amt_match === "match");
    const keeper =
      matched[0] ??
      list.reduce((a, b) =>
        Math.abs(Number(a.amt) - Number(a.bc_amt)) <= Math.abs(Number(b.amt) - Number(b.bc_amt)) ? a : b,
      );
    keep.push(keeper);
    for (const r of list) {
      if (r.Id !== keeper.Id) del.push(r);
    }
  }

  return { keep, del };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const txidIdx = process.argv.indexOf("--txid");
  const txid = txidIdx >= 0 ? process.argv[txidIdx + 1] : "";
  if (!txid) {
    console.error("Pass --txid <txid>");
    process.exit(1);
  }

  await AppDataSource.initialize();
  const { keep, del } = await findDuplicates(txid);

  const keepGross = keep.reduce((s, r) => s + Number(r.amt), 0);
  const bcGross = keep.length ? Number(keep[0].bc_amt) : 0;

  console.log("DB_NAME:", process.env.DB_NAME);
  console.log("TXID:", txid);
  console.log(`Keep ${keep.length}, delete ${del.length}`);
  console.log("Keep gross:", keepGross.toFixed(8));

  if (!del.length) {
    console.log("No duplicates to remove.");
    await AppDataSource.destroy();
    return;
  }

  if (!execute) {
    console.log("DRY RUN — pass --execute to delete duplicates.");
    await AppDataSource.destroy();
    return;
  }

  const affectedAcNos = new Set<string>();

  await AppDataSource.transaction(async (manager) => {
    for (const row of del) {
      affectedAcNos.add(row.acno.trim());
      await manager.query(`DELETE FROM "WalletTxn" WHERE "SourceType" = 'PAYOUT' AND "SourceId" = $1`, [row.Id]);
      await manager.query(`DELETE FROM "Payouts" WHERE "Id" = $1`, [row.Id]);
    }
  });

  for (const row of del) {
    await creditWalletBalance(row.acno.trim(), Number(row.amt));
  }

  for (const acNo of affectedAcNos) {
    await recalcRunningBalances(acNo);
  }

  const after = await AppDataSource.query(
    `SELECT COUNT(*)::int rows, SUM("Amount")::numeric(24,8) gross FROM "Payouts" WHERE btrim(txid)=$1`,
    [txid],
  );
  const bc = await AppDataSource.query(
    `SELECT COUNT(*)::int rows, SUM(amount)::numeric(24,8) gross FROM blockchain_payout WHERE btrim(txid)=$1`,
    [txid],
  );

  console.log("\nAfter payouts:", after[0], "blockchain:", bc[0]);
  console.log("Deleted:", del.length, "Credited accounts:", affectedAcNos.size);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
