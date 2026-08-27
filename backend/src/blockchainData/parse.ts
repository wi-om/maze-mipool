/**
 * Pure parsing for blockchain.info rawtx JSON.
 * Uses `out` for recipients and excludes the change output by matching output
 * addresses against transaction input (sender) addresses — not by position.
 * No DB or HTTP dependencies; safe to import from scripts, workers, or other modules.
 */
import { SATOSHI_PER_BTC } from "./constants";
import type {
  BlockchainRawTx,
  BlockchainRawTxInput,
  BlockchainRawTxOutput,
  BlockchainRecipientRow,
  ParsedBlockchainTx,
} from "./types";

export function satoshiToBtc(satoshis: number): number {
  return Number((satoshis / SATOSHI_PER_BTC).toFixed(8));
}

export function unixSecondsToDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

export function roundBtc(value: number): number {
  return Number(Math.max(0, value).toFixed(8));
}

export function extractInputAddresses(inputs?: BlockchainRawTxInput[]): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(inputs)) return set;
  for (const input of inputs) {
    const addr = input.prev_out?.addr?.trim();
    if (addr) set.add(addr);
  }
  return set;
}

/**
 * Change is sent back to an address the sender controls — one that appears in `inputs`.
 * When several outputs reuse input addresses, the largest is treated as change.
 */
export function identifyChangeOutputIndices(
  outputs: BlockchainRawTxOutput[],
  inputAddresses: Set<string>,
): Set<number> {
  if (!inputAddresses.size) return new Set();

  const matching = outputs.filter((o) => {
    const addr = o.addr?.trim();
    return addr && inputAddresses.has(addr);
  });

  if (matching.length === 1) return new Set([matching[0].n]);
  if (matching.length > 1) {
    const change = matching.reduce((best, o) => (o.value > best.value ? o : best));
    return new Set([change.n]);
  }
  return new Set();
}

/**
 * All outputs with an address, excluding the change output (identified via input addresses).
 * If no change can be identified, all addressed outputs are kept — never drop by position alone.
 */
export function extractRecipientOutputs(
  outputs: BlockchainRawTx["out"],
  inputs?: BlockchainRawTxInput[],
): BlockchainRecipientRow[] {
  if (!Array.isArray(outputs) || outputs.length < 1) {
    throw new Error(
      `Transaction needs at least 1 output, found ${Array.isArray(outputs) ? outputs.length : 0}`,
    );
  }

  const sorted = [...outputs].sort((a, b) => a.n - b.n);
  const inputAddresses = extractInputAddresses(inputs);
  const changeIndices = identifyChangeOutputIndices(sorted, inputAddresses);
  const recipientOutputs = sorted.filter((o) => !changeIndices.has(o.n));
  const recipients: BlockchainRecipientRow[] = [];

  for (const output of recipientOutputs) {
    const address = output.addr?.trim();
    if (!address) continue;
    recipients.push({
      outputIndex: output.n,
      address,
      amountBtc: satoshiToBtc(output.value),
    });
  }

  if (!recipients.length) {
    throw new Error("No recipient outputs with an address found");
  }

  return recipients;
}

export function parseBlockchainRawTx(raw: BlockchainRawTx): ParsedBlockchainTx {
  if (!raw?.hash?.trim()) {
    throw new Error("Invalid raw transaction: missing hash");
  }
  if (!Number.isFinite(raw.time) || raw.time <= 0) {
    throw new Error("Invalid raw transaction: missing or invalid time");
  }
  if (!Number.isFinite(raw.fee) || raw.fee < 0) {
    throw new Error("Invalid raw transaction: missing or invalid fee");
  }

  const recipients = extractRecipientOutputs(raw.out, raw.inputs);
  const grossAmountBtc = roundBtc(recipients.reduce((sum, r) => sum + r.amountBtc, 0));

  return {
    txid: raw.hash.trim(),
    txnDate: unixSecondsToDate(raw.time),
    txidFeeBtc: satoshiToBtc(raw.fee),
    grossAmountBtc,
    recipients,
  };
}
