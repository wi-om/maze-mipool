/**
 * Persist parsed blockchain payout data to blockchain_payout table.
 */
import { AppDataSource, BlockchainPayout, BlockchainRawTx as BlockchainRawTxEntity } from "@common";
import { fetchBlockchainRawTx } from "./fetch";
import { parseBlockchainRawTx } from "./parse";
import { BLOCKCHAIN_PAYOUT_SOURCE } from "./constants";
import type {
  AddrMeta,
  BlockchainRawTx,
  ImportBlockchainTxBatchResult,
  ImportBlockchainTxResult,
} from "./types";

function padAcNo(acNo: string): string {
  return acNo.trim().padEnd(12, " ");
}

function padContract(c: string): string {
  return c.trim().padEnd(12, " ");
}

async function loadAddrMeta(): Promise<Map<string, AddrMeta>> {
  const map = new Map<string, AddrMeta>();

  const walletRows = await AppDataSource.query(`
    SELECT DISTINCT ON (TRIM(w."Addr"))
      TRIM(w."Addr") AS addr,
      TRIM(w."AcNo") AS acno,
      (
        SELECT TRIM(c."MipContractNo")
        FROM "Contracts" c
        WHERE TRIM(c."AcNo") = TRIM(w."AcNo")
        ORDER BY c."Id" DESC
        LIMIT 1
      ) AS contract
    FROM "Wallets" w
    WHERE w."IsActive" = true
      AND TRIM(w."Addr") LIKE 'bc1%'
      AND btrim(w."Addr") <> ''
    ORDER BY TRIM(w."Addr"), w."ModifiedOn" DESC NULLS LAST, w."ID" DESC
  `);

  for (const r of walletRows) {
    if (!r.contract) continue;
    map.set(String(r.addr), { acNo: String(r.acno), contract: String(r.contract) });
  }

  const payoutRows = await AppDataSource.query(`
    SELECT DISTINCT ON (TRIM(p."ToAddr"))
      TRIM(p."ToAddr") AS addr,
      TRIM(p."AcNo") AS acno,
      TRIM(p."mipContractNo") AS contract
    FROM "Payouts" p
    WHERE TRIM(p."ToAddr") LIKE 'bc1%'
      AND p."mipContractNo" IS NOT NULL AND btrim(p."mipContractNo") <> ''
    ORDER BY TRIM(p."ToAddr"), p."Id" DESC
  `);

  for (const r of payoutRows) {
    const addr = String(r.addr);
    if (!map.has(addr)) {
      map.set(addr, { acNo: String(r.acno), contract: String(r.contract) });
    }
  }

  return map;
}

async function loadStoredRawTx(txid: string): Promise<BlockchainRawTx | null> {
  const rows = await AppDataSource.query(
    `SELECT raw_json FROM blockchain_raw_tx WHERE btrim(txid) = btrim($1) LIMIT 1`,
    [txid],
  );
  const raw = rows[0]?.raw_json;
  if (!raw || typeof raw !== "object") return null;
  return raw as BlockchainRawTx;
}

export async function importBlockchainRawToDb(raw: BlockchainRawTx): Promise<ImportBlockchainTxResult> {
  const parsed = parseBlockchainRawTx(raw);
  const addrMeta = await loadAddrMeta();
  const unmappedAddresses: string[] = [];

  await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(BlockchainPayout);
    const rawRepo = manager.getRepository(BlockchainRawTxEntity);
    await repo.delete({ txid: parsed.txid });

    const rows = parsed.recipients.map((r) => {
      const meta = addrMeta.get(r.address);
      if (!meta) unmappedAddresses.push(r.address);

      return repo.create({
        txid: parsed.txid,
        acNo: meta ? padAcNo(meta.acNo) : null,
        mipContractNo: meta ? padContract(meta.contract) : null,
        address: r.address,
        amount: r.amountBtc,
        txidFee: parsed.txidFeeBtc,
        txnDate: parsed.txnDate,
        status: "Complete",
        source: BLOCKCHAIN_PAYOUT_SOURCE,
      });
    });

    await repo.save(rows);

    await rawRepo.delete({ txid: parsed.txid });
    await rawRepo.save(
      rawRepo.create({
        txid: parsed.txid,
        rawJson: raw as unknown as Record<string, unknown>,
        source: BLOCKCHAIN_PAYOUT_SOURCE,
      }),
    );
  });

  return {
    txid: parsed.txid,
    txnDate: parsed.txnDate.toISOString(),
    txidFeeBtc: parsed.txidFeeBtc,
    grossAmountBtc: parsed.grossAmountBtc,
    recipientCount: parsed.recipients.length,
    rowsInserted: parsed.recipients.length,
    unmappedAddresses: [...new Set(unmappedAddresses)],
    rawJsonStored: true,
  };
}

export async function importBlockchainTxToDb(txid: string): Promise<ImportBlockchainTxResult> {
  const stored = await loadStoredRawTx(txid);
  const raw = stored ?? (await fetchBlockchainRawTx(txid));
  return importBlockchainRawToDb(raw);
}

export async function importBlockchainTxBatchToDb(
  txids: string[],
): Promise<ImportBlockchainTxBatchResult> {
  const results: ImportBlockchainTxResult[] = [];
  const errors: Array<{ txid: string; error: string }> = [];

  for (const txid of txids) {
    try {
      results.push(await importBlockchainTxToDb(txid));
    } catch (err: any) {
      errors.push({ txid, error: err?.message ?? "Import failed" });
    }
  }

  return { results, errors };
}

/** Preview parsed data without writing to DB. */
export async function previewBlockchainTx(txid: string) {
  const parsed = parseBlockchainRawTx(await fetchBlockchainRawTx(txid));
  return {
    txid: parsed.txid,
    txnDate: parsed.txnDate.toISOString(),
    txidFeeBtc: parsed.txidFeeBtc,
    grossAmountBtc: parsed.grossAmountBtc,
    recipientCount: parsed.recipients.length,
    recipients: parsed.recipients,
  };
}
