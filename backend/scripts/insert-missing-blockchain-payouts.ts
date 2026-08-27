/**
 * Insert payout rows that exist in blockchain_payout but not yet in Payouts.
 * Creates WalletTxn debits and updates wallet balances.
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/insert-missing-blockchain-payouts.ts --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/insert-missing-blockchain-payouts.ts --execute
 */
import "reflect-metadata";
import { AppDataSource, Payout, Wallet } from "../src/common";
import {
  insertDebitFromPayout,
  recalcRunningBalances,
} from "../src/modules/crm/services/wallet/walletTxn.service";
import {
  debitWalletBalanceInTransaction,
  reconcileBalance,
} from "../src/modules/crm/services/wallet/walletBalance.service";

type BlockchainRow = {
  txid: string;
  ac_no: string;
  mip_contract_no: string;
  address: string;
  amount: string;
  txid_fee: string;
  txn_date: Date;
  status: string;
};

function padAcNo(acNo: string): string {
  return acNo.trim().padEnd(12, " ");
}

function padContract(c: string): string {
  return c.trim().padEnd(12, " ");
}

async function loadMissingRows(txidFilter?: string): Promise<BlockchainRow[]> {
  const params: string[] = [];
  const txidClause = txidFilter ? `AND btrim(b.txid) = $1` : "";
  if (txidFilter) params.push(txidFilter);

  return AppDataSource.query(
    `
    SELECT b.txid, TRIM(b.ac_no) AS ac_no, TRIM(b.mip_contract_no) AS mip_contract_no,
           TRIM(b.address) AS address, b.amount::text, b.txid_fee::text, b.txn_date, b.status
    FROM blockchain_payout b
    WHERE NOT EXISTS (SELECT 1 FROM "Payouts" p WHERE p.txid = b.txid AND TRIM(p."ToAddr") = TRIM(b.address))
    ${txidClause}
    ORDER BY b.txn_date, b.address
    `,
    params,
  );
}

async function loadWallets(): Promise<Map<string, Wallet>> {
  const walletRepo = AppDataSource.getRepository(Wallet);
  const wallets = await walletRepo.find({ where: { IsActive: true } });
  const map = new Map<string, Wallet>();
  for (const w of wallets) map.set(w.AcNo.trim(), w);
  return map;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;
  const txidIdx = process.argv.indexOf("--txid");
  const txidFilter = txidIdx >= 0 ? process.argv[txidIdx + 1] : undefined;

  await AppDataSource.initialize();
  const rows = await loadMissingRows(txidFilter);
  const wallets = await loadWallets();

  const byTx = new Map<string, BlockchainRow[]>();
  for (const r of rows) {
    const list = byTx.get(r.txid) ?? [];
    list.push(r);
    byTx.set(r.txid, list);
  }

  console.log("DB_NAME:", process.env.DB_NAME);
  console.log(`Missing rows: ${rows.length} across ${byTx.size} txid(s)`);

  for (const [txid, txRows] of byTx) {
    const gross = txRows.reduce((s, r) => s + Number(r.amount), 0);
    const fee = Number(txRows[0]?.txid_fee || 0);
    console.log(
      `  ${txid.slice(0, 12)}… | ${txRows[0]?.txn_date} | ${txRows.length} rows | gross ${gross.toFixed(8)} | fee ${fee}`,
    );
  }

  if (!rows.length) {
    console.log("Nothing to insert.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  const missingWallets = [...new Set(rows.map((r) => r.ac_no.trim()))].filter((a) => !wallets.has(a));
  if (missingWallets.length) {
    console.error("No active wallet for:", missingWallets);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nDRY RUN — pass --execute to insert.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  let inserted = 0;
  let walletTxnsCreated = 0;
  const affectedAcNos = new Set<string>();

  for (const [txid, txRows] of byTx) {
    await AppDataSource.transaction(async (manager) => {
      const pRepo = manager.getRepository(Payout);
      const wRepo = manager.getRepository(Wallet);
      const debitsByAcNo = new Map<string, number>();

      for (const r of txRows) {
        const acNoTrim = r.ac_no.trim();
        affectedAcNos.add(acNoTrim);
        const wallet = wallets.get(acNoTrim)!;
        const amount = Number(Number(r.amount).toFixed(8));
        const txFee = Number(Number(r.txid_fee).toFixed(8));

        const payout = pRepo.create({
          AcNo: padAcNo(acNoTrim),
          mipContractNo: padContract(r.mip_contract_no),
          Amount: amount,
          ToAddr: r.address,
          Status: r.status || "Complete",
          txid,
          txidFee: txFee,
          txidFeeDeducted: false,
          CreatedOn: r.txn_date instanceof Date ? r.txn_date : new Date(r.txn_date),
        });
        const saved = await pRepo.save(payout);
        inserted++;

        await insertDebitFromPayout(saved, wallet, manager);
        walletTxnsCreated++;
        debitsByAcNo.set(acNoTrim, (debitsByAcNo.get(acNoTrim) ?? 0) + amount);
      }

      for (const [acNo, debitTotal] of debitsByAcNo) {
        await debitWalletBalanceInTransaction(wRepo, acNo, debitTotal);
      }
    });
  }

  for (const acNo of affectedAcNos) {
    await recalcRunningBalances(acNo);
    await reconcileBalance(acNo);
  }

  const verify = await AppDataSource.query(`
    SELECT txid, COUNT(*)::int rows, SUM("Amount")::numeric(24,8) amount,
           MIN("CreatedOn") created, MAX("txidFee")::numeric(24,8) fee
    FROM "Payouts"
    WHERE txid IN (SELECT DISTINCT txid FROM blockchain_payout)
    GROUP BY txid ORDER BY MIN("CreatedOn")
  `);

  console.log("\n--- Summary ---");
  console.log("Inserted:", inserted);
  console.log("WalletTxn created:", walletTxnsCreated);
  console.log("Affected accounts:", affectedAcNos.size);
  console.log("\nAll 9 June blockchain txids in Payouts:");
  console.table(verify);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
