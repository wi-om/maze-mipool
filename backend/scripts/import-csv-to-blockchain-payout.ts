/**
 * Import blockchain payout CSV into blockchain_payout table (no Payouts / wallet changes).
 *
 * CSV format (per batch of recipients sharing one TXN_ID):
 *   Sl_No,TXN_ID,Address,Amount,Total_Amount,TXN_Fees,Net_Amount,Txn_Date_Local,Txn_Date_UTC,...
 * Row 24 of each batch carries Total_Amount, TXN_Fees, and Txn_Date_UTC for the whole tx.
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/import-csv-to-blockchain-payout.ts --dry-run
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/import-csv-to-blockchain-payout.ts --execute
 *   $env:DB_NAME="test"; npx ts-node ... scripts/import-csv-to-blockchain-payout.ts --execute --csv path/to/file.csv
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AppDataSource, BlockchainPayout } from "../src/common";
import { BLOCKCHAIN_PAYOUT_SOURCE } from "../src/blockchainData/constants";

const DEFAULT_CSV = path.join(__dirname, "..", "..", "backups", "june_2026_blockchain_payouts.csv");

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
  txnDate: Date;
  txFee: number;
  totalAmount: number;
  recipients: Array<{ address: string; amount: number }>;
};

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
    if (!txid || !address || Number.isNaN(amount)) continue;
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
    const sorted = [...txRows].sort((a, b) => a.slNo - b.slNo);
    const metaRow = [...sorted].reverse().find((r) => r.createdOnUtc && r.txFee != null && r.totalAmount != null);
    if (!metaRow?.createdOnUtc || metaRow.txFee == null || metaRow.totalAmount == null) {
      throw new Error(`Tx ${txid}: missing batch metadata (date/fee/total on last row)`);
    }
    const sum = round8(sorted.reduce((s, r) => s + r.amount, 0));
    if (Math.abs(sum - metaRow.totalAmount) > 0.00000002) {
      console.warn(`Tx ${txid.slice(0, 12)}…: sum ${sum} != total ${metaRow.totalAmount}`);
    }
    batches.push({
      txid,
      txnDate: new Date(metaRow.createdOnUtc.replace(" ", "T") + "Z"),
      txFee: metaRow.txFee,
      totalAmount: metaRow.totalAmount,
      recipients: sorted.map((r) => ({ address: r.address, amount: round8(r.amount) })),
    });
  }

  batches.sort((a, b) => a.txnDate.getTime() - b.txnDate.getTime());
  return batches;
}

async function loadAddrMeta(): Promise<Map<string, { acNo: string; contract: string }>> {
  const rows = await AppDataSource.query(`
    SELECT DISTINCT ON (TRIM(p."ToAddr"))
      TRIM(p."ToAddr") AS addr,
      TRIM(p."AcNo") AS acno,
      TRIM(p."mipContractNo") AS contract
    FROM "Payouts" p
    WHERE TRIM(p."ToAddr") LIKE 'bc1%'
    ORDER BY TRIM(p."ToAddr"), p."Id" DESC
  `);
  const map = new Map<string, { acNo: string; contract: string }>();
  for (const r of rows) {
    map.set(String(r.addr), { acNo: String(r.acno), contract: String(r.contract) });
  }
  return map;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const csvIdx = process.argv.indexOf("--csv");
  const csvPath = csvIdx >= 0 ? process.argv[csvIdx + 1] : DEFAULT_CSV;

  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    process.exit(1);
  }

  const batches = parseCsv(csvPath);
  console.log("CSV:", csvPath);
  console.log(`Batches: ${batches.length} (${batches.reduce((s, b) => s + b.recipients.length, 0)} recipient rows)`);

  let monthGross = 0;
  let monthFee = 0;
  for (const b of batches) {
    monthGross += b.totalAmount;
    monthFee += b.txFee;
    console.log(
      `  ${b.txid.slice(0, 12)}… | ${b.txnDate.toISOString().slice(0, 10)} | ${b.recipients.length} rows | gross ${b.totalAmount.toFixed(8)} | fee ${b.txFee.toFixed(8)}`,
    );
  }
  console.log(`Month gross: ${round8(monthGross).toFixed(8)} | Month fees: ${round8(monthFee).toFixed(8)}`);

  await AppDataSource.initialize();
  console.log("DB_NAME:", process.env.DB_NAME);

  const addrMeta = await loadAddrMeta();
  let unmapped = 0;

  if (!execute) {
    console.log("\nDRY RUN — pass --execute to write blockchain_payout.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  let inserted = 0;
  for (const batch of batches) {
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BlockchainPayout);
      await repo.delete({ txid: batch.txid });

      const entities = batch.recipients.map((r) => {
        const meta = addrMeta.get(r.address);
        if (!meta) unmapped++;

        return repo.create({
          txid: batch.txid,
          acNo: meta ? padAcNo(meta.acNo) : null,
          mipContractNo: meta ? padContract(meta.contract) : null,
          address: r.address,
          amount: r.amount,
          txidFee: batch.txFee,
          txnDate: batch.txnDate,
          status: "Complete",
          source: "csv_import",
        });
      });

      await repo.save(entities);
      inserted += entities.length;
    });
  }

  const verify = await AppDataSource.query(`
    SELECT btrim(txid) AS txid,
           COUNT(*)::int AS rows,
           SUM(amount)::numeric(24,8) AS gross,
           MAX(txid_fee)::numeric(24,8) AS fee,
           MIN(txn_date) AS txn_date
    FROM blockchain_payout
    WHERE btrim(txid) = ANY($1::text[])
    GROUP BY btrim(txid)
    ORDER BY MIN(txn_date)
  `, [batches.map((b) => b.txid)]);

  console.log("\n--- Summary ---");
  console.log("Rows inserted:", inserted);
  console.log("Unmapped addresses:", unmapped);
  console.table(verify);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
