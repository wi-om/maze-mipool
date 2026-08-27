/**
 * Shared helpers for payout on-chain fee (txidFee) workflows.
 * @see import.service.ts  — Step 1: map txid → txidFee from CSV
 * @see deduction.service.ts — Step 2: Amount = Amount − txidFee
 */

import { validatePayoutTxid } from "../payoutTxid.util";

export type TxidFeeUpdate = {
  txid: string;
  txidFee: number;
};

export type InvalidCsvRow = {
  line: number;
  raw: string;
  error: string;
};

export function parseTxidFeeValue(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "txidFee is required" };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "txidFee must be a non-negative number" };
  }
  return { ok: true, value };
}

function isHeaderRow(first: string, second: string): boolean {
  const a = first.trim().toLowerCase();
  const b = second.trim().toLowerCase();
  return a === "txid" && (b === "txidfee" || b === "txid_fee" || b === "fee");
}

/** Round BTC amounts to 8 decimal places. */
export function roundBtcAmount(value: number): number {
  return Number(Math.max(0, value).toFixed(8));
}

export function normalizeTxidFeeUpdates(
  updates: Array<{ txid?: unknown; txidFee?: unknown }>,
): { updates: TxidFeeUpdate[]; invalidRows: InvalidCsvRow[] } {
  const invalidRows: InvalidCsvRow[] = [];
  const byTxid = new Map<string, number>();

  updates.forEach((row, index) => {
    const lineNo = index + 1;
    const txidResult = validatePayoutTxid(String(row.txid ?? ""));
    if (!txidResult.ok) {
      invalidRows.push({ line: lineNo, raw: JSON.stringify(row), error: txidResult.error });
      return;
    }
    const feeResult = parseTxidFeeValue(String(row.txidFee ?? ""));
    if (!feeResult.ok) {
      invalidRows.push({ line: lineNo, raw: JSON.stringify(row), error: feeResult.error });
      return;
    }
    byTxid.set(txidResult.value, feeResult.value);
  });

  return {
    updates: [...byTxid.entries()].map(([txid, txidFee]) => ({ txid, txidFee })),
    invalidRows,
  };
}

/** Parse CSV text: `txid,txidFee` per line (optional header row). */
export function parseTxidFeeCsv(csv: string): {
  updates: TxidFeeUpdate[];
  invalidRows: InvalidCsvRow[];
} {
  const lines = csv.split(/\r?\n/);
  const invalidRows: InvalidCsvRow[] = [];
  const byTxid = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) {
      invalidRows.push({ line: lineNo, raw: rawLine, error: "Expected txid,txidFee" });
      continue;
    }

    const [txidRaw, feeRaw] = parts;
    if (i === 0 && isHeaderRow(txidRaw, feeRaw)) continue;

    const txidResult = validatePayoutTxid(txidRaw);
    if (!txidResult.ok) {
      invalidRows.push({ line: lineNo, raw: rawLine, error: txidResult.error });
      continue;
    }

    const feeResult = parseTxidFeeValue(feeRaw);
    if (!feeResult.ok) {
      invalidRows.push({ line: lineNo, raw: rawLine, error: feeResult.error });
      continue;
    }

    byTxid.set(txidResult.value, feeResult.value);
  }

  return {
    updates: [...byTxid.entries()].map(([txid, txidFee]) => ({ txid, txidFee })),
    invalidRows,
  };
}
