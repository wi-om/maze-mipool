/**
 * Import / sync June 2026 blockchain payout batches into Payouts (+ WalletTxn for new rows).
 *
 * - One Payout row per recipient address per txid (24 rows per blockchain tx).
 * - Row 24 of each batch supplies CreatedOn (UTC), txidFee, and total verification.
 * - Updates existing txids (dates, amounts, fees); inserts missing txids.
 * - Does NOT run txidFee deduction (Amount stays gross blockchain payout).
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/import-blockchain-payouts-jun-2026.ts --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/import-blockchain-payouts-jun-2026.ts --execute
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AppDataSource, Payout, Wallet } from "../src/common";
import { WalletTxn } from "../src/common";
import {
  insertDebitFromPayout,
  recalcRunningBalances,
} from "../src/modules/crm/services/wallet/walletTxn.service";
import { debitWalletBalanceInTransaction, reconcileBalance } from "../src/modules/crm/services/wallet/walletBalance.service";

const CSV_PATH = path.join(__dirname, "..", "..", "backups", "june_2026_blockchain_payouts.csv");

type CsvRow = {
  slNo: number;
  txid: string;
  address: string;
  amount: number;
  totalAmount?: number;
  txFee?: number;
  createdOnUtc?: string;
};

type TxBatch = {
  txid: string;
  createdOn: Date;
  txFee: number;
  totalAmount: number;
  recipients: Array<{ address: string; amount: number }>;
};

type AddrMeta = { acNo: string; contract: string };

function round8(v: number): number {
  return Math.round(v * 1e8) / 1e8;
}

function padAcNo(acNo: string): string {
  return acNo.trim().padEnd(12, " ");
}

function padContract(c: string): string {
  return c.trim().padEnd(12, " ");
}

function parseCsv(filePath: string): TxBatch[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 4) continue;
    const slNo = parseInt(parts[0], 10);
    const txid = parts[1].trim();
    const address = parts[2].trim();
    const amount = parseFloat(parts[3]);
    const totalAmount = parts[4]?.trim() ? parseFloat(parts[4]) : undefined;
    const txFee = parts[5]?.trim() ? parseFloat(parts[5]) : undefined;
    const createdOnUtc = parts[8]?.trim() || undefined;
    rows.push({ slNo, txid, address, amount, totalAmount, txFee, createdOnUtc });
  }

  const byTx = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const list = byTx.get(r.txid) ?? [];
    list.push(r);
    byTx.set(r.txid, list);
  }

  const batches: TxBatch[] = [];
  for (const [txid, txRows] of byTx) {
    const row24 = txRows.find((r) => r.slNo === 24);
    if (!row24?.createdOnUtc || row24.txFee == null || row24.totalAmount == null) {
      throw new Error(`Tx ${txid} missing row-24 metadata`);
    }
    const sum = round8(txRows.reduce((s, r) => s + r.amount, 0));
    if (Math.abs(sum - row24.totalAmount) > 0.00000002) {
      console.warn(`Tx ${txid}: recipient sum ${sum} != total ${row24.totalAmount}`);
    }
    batches.push({
      txid,
      createdOn: new Date(row24.createdOnUtc.replace(" ", "T") + "Z"),
      txFee: row24.txFee,
      totalAmount: row24.totalAmount,
      recipients: txRows.map((r) => ({ address: r.address, amount: round8(r.amount) })),
    });
  }

  return batches.sort((a, b) => a.createdOn.getTime() - b.createdOn.getTime());
}

async function loadAddrMeta(): Promise<Map<string, AddrMeta>> {
  const rows = await AppDataSource.query(`
    SELECT DISTINCT ON (TRIM(p."ToAddr"))
      TRIM(p."ToAddr") AS addr,
      TRIM(p."AcNo") AS acno,
      TRIM(p."mipContractNo") AS contract
    FROM "Payouts" p
    WHERE TRIM(p."ToAddr") LIKE 'bc1%'
    ORDER BY TRIM(p."ToAddr"), p."Id" DESC
  `);
  const map = new Map<string, AddrMeta>();
  for (const r of rows) {
    map.set(String(r.addr), { acNo: String(r.acno), contract: String(r.contract) });
  }
  return map;
}

async function loadWallets(): Promise<Map<string, Wallet>> {
  const walletRepo = AppDataSource.getRepository(Wallet);
  const wallets = await walletRepo.find({ where: { IsActive: true } });
  const map = new Map<string, Wallet>();
  for (const w of wallets) {
    map.set(w.AcNo.trim(), w);
  }
  return map;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  if (!fs.existsSync(CSV_PATH)) {
    console.error("CSV not found:", CSV_PATH);
    process.exit(1);
  }

  const batches = parseCsv(CSV_PATH);
  console.log("DB_NAME:", process.env.DB_NAME);
  console.log(`Parsed ${batches.length} blockchain tx batches (${batches.length * 24} recipient rows)`);

  await AppDataSource.initialize();
  const addrMeta = await loadAddrMeta();
  const wallets = await loadWallets();
  const payoutRepo = AppDataSource.getRepository(Payout);

  const missingAddrs: string[] = [];
  for (const batch of batches) {
    for (const r of batch.recipients) {
      if (!addrMeta.has(r.address)) missingAddrs.push(r.address);
    }
  }
  if (missingAddrs.length) {
    console.error("Unknown addresses (no prior Payout mapping):", [...new Set(missingAddrs)]);
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let walletTxnsCreated = 0;
  const affectedAcNos = new Set<string>();

  for (const batch of batches) {
    const existing = await payoutRepo.find({ where: { txid: batch.txid } });
    const existingByAddr = new Map<string, Payout>();
    for (const p of existing) {
      existingByAddr.set(p.ToAddr.trim(), p);
    }

    console.log(
      `\n${batch.txid.slice(0, 12)}… | ${batch.createdOn.toISOString()} | fee ${batch.txFee} | total ${batch.totalAmount} | existing ${existing.length} rows`,
    );

    if (dryRun) {
      const toInsert = batch.recipients.filter((r) => !existingByAddr.has(r.address)).length;
      const toUpdate = batch.recipients.length - toInsert;
      console.log(`  → would insert ${toInsert}, update ${toUpdate}`);
      inserted += toInsert;
      updated += toUpdate;
      continue;
    }

    await AppDataSource.transaction(async (manager) => {
      const pRepo = manager.getRepository(Payout);
      const wRepo = manager.getRepository(Wallet);
      const tRepo = manager.getRepository(WalletTxn);
      const debitsByAcNo = new Map<string, number>();

      for (const r of batch.recipients) {
        const meta = addrMeta.get(r.address)!;
        const acNo = padAcNo(meta.acNo);
        affectedAcNos.add(meta.acNo.trim());

        const existingRow = existingByAddr.get(r.address);
        if (existingRow) {
          const oldAmount = Number(existingRow.Amount || 0);
          existingRow.Amount = r.amount;
          existingRow.txidFee = batch.txFee;
          existingRow.txidFeeDeducted = false;
          existingRow.CreatedOn = batch.createdOn;
          existingRow.Status = "Complete";
          await pRepo.save(existingRow);
          updated++;

          const wt = await tRepo.findOne({
            where: { SourceType: "PAYOUT", SourceId: existingRow.Id },
          });
          if (wt && Number(wt.Amount) !== r.amount) {
            wt.Amount = r.amount;
            wt.txid = batch.txid;
            wt.CreatedOn = batch.createdOn;
            await tRepo.save(wt);
          }
          continue;
        }

        const wallet = wallets.get(meta.acNo.trim());
        if (!wallet) throw new Error(`No active wallet for ${meta.acNo}`);

        const payout = pRepo.create({
          AcNo: acNo,
          mipContractNo: padContract(meta.contract),
          Amount: r.amount,
          ToAddr: r.address,
          Status: "Complete",
          txid: batch.txid,
          txidFee: batch.txFee,
          txidFeeDeducted: false,
          CreatedOn: batch.createdOn,
        });
        const saved = await pRepo.save(payout);
        inserted++;

        await insertDebitFromPayout(saved, wallet, manager);
        walletTxnsCreated++;
        debitsByAcNo.set(meta.acNo.trim(), (debitsByAcNo.get(meta.acNo.trim()) ?? 0) + r.amount);
      }

      for (const [acNo, debitTotal] of debitsByAcNo) {
        await debitWalletBalanceInTransaction(wRepo, acNo, debitTotal);
      }
    });
  }

  if (!dryRun && affectedAcNos.size) {
    for (const acNo of affectedAcNos) {
      await recalcRunningBalances(acNo);
      await reconcileBalance(acNo);
    }
  }

  console.log("\n--- Summary ---");
  console.log("Mode:", dryRun ? "DRY RUN" : "EXECUTED");
  console.log("Inserted:", inserted);
  console.log("Updated:", updated);
  console.log("WalletTxn created:", walletTxnsCreated);
  console.log("Affected accounts:", affectedAcNos.size);

  if (!dryRun) {
    const verify = await AppDataSource.query(`
      SELECT txid, COUNT(*)::int rows, SUM("Amount")::numeric(24,8) amount,
             MIN("CreatedOn") created, MAX("txidFee")::numeric(24,8) fee
      FROM "Payouts"
      WHERE txid = ANY($1)
      GROUP BY txid ORDER BY MIN("CreatedOn")
    `, [batches.map((b) => b.txid)]);
    console.log("\nPost-import verification:");
    console.table(verify);
  }

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
