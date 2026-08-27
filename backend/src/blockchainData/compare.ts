/**
 * Pure comparison logic: Payouts vs blockchain_payout (per txid, per month, same-day txid).
 */
export type BlockchainCompareStatus =
  | "match"
  | "amount_mismatch"
  | "fee_mismatch"
  | "count_mismatch"
  | "missing_in_payouts"
  | "missing_in_blockchain"
  | "same_day_txid_mismatch";

export type BlockchainCompareRow = {
  txid: string;
  date: string | null;
  payoutDate: string | null;
  blockchainDate: string | null;
  payoutCount: number | null;
  blockchainCount: number | null;
  payoutGross: number | null;
  blockchainGross: number | null;
  payoutFee: number | null;
  blockchainFee: number | null;
  grossDiff: number;
  feeDiff: number;
  status: BlockchainCompareStatus;
  sameDayConflictTxids: string[];
};

export type BlockchainCompareMonth = {
  month: string;
  payoutGross: number;
  blockchainGross: number;
  grossDiff: number;
  payoutFee: number;
  blockchainFee: number;
  txidCount: number;
  matchedCount: number;
  issueCount: number;
  sameDayTxidMismatches: number;
};

export type BlockchainCompareSummary = {
  total: number;
  matched: number;
  mismatched: number;
  missingInPayouts: number;
  missingInBlockchain: number;
  sameDayTxidMismatches: number;
};

export type BlockchainCompareResult = {
  rows: BlockchainCompareRow[];
  months: BlockchainCompareMonth[];
  summary: BlockchainCompareSummary;
};

const AMOUNT_EPSILON = 1e-8;

function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function monthKey(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 7);
}

function round8(n: number): number {
  return Number(n.toFixed(8));
}

export type RawCompareDbRow = {
  txid: string;
  payout_date: Date | string | null;
  blockchain_date: Date | string | null;
  payout_count: number | null;
  blockchain_count: number | null;
  payout_gross: string | number | null;
  blockchain_gross: string | number | null;
  payout_fee: string | number | null;
  blockchain_fee: string | number | null;
};

function baseStatus(
  payoutGross: number | null,
  blockchainGross: number | null,
  payoutCount: number | null,
  blockchainCount: number | null,
  payoutFee: number | null,
  blockchainFee: number | null,
  grossDiff: number,
  feeDiff: number,
): BlockchainCompareStatus {
  if (payoutGross == null) return "missing_in_payouts";
  if (blockchainGross == null) return "missing_in_blockchain";
  if (Math.abs(grossDiff) > AMOUNT_EPSILON) return "amount_mismatch";
  if (payoutCount !== blockchainCount) return "count_mismatch";
  if (Math.abs(feeDiff) > AMOUNT_EPSILON) return "fee_mismatch";
  return "match";
}

/** Detect days where Payouts and blockchain used different txids. */
export function detectSameDayTxidConflicts(rows: BlockchainCompareRow[]): Map<string, string[]> {
  const payoutByDay = new Map<string, Set<string>>();
  const blockchainByDay = new Map<string, Set<string>>();

  for (const row of rows) {
    const pDay = dayKey(row.payoutDate);
    const bDay = dayKey(row.blockchainDate);
    if (pDay) {
      if (!payoutByDay.has(pDay)) payoutByDay.set(pDay, new Set());
      payoutByDay.get(pDay)!.add(row.txid);
    }
    if (bDay) {
      if (!blockchainByDay.has(bDay)) blockchainByDay.set(bDay, new Set());
      blockchainByDay.get(bDay)!.add(row.txid);
    }
  }

  const conflictMap = new Map<string, string[]>();
  const allDays = new Set([...payoutByDay.keys(), ...blockchainByDay.keys()]);

  for (const day of allDays) {
    const pSet = payoutByDay.get(day) ?? new Set<string>();
    const bSet = blockchainByDay.get(day) ?? new Set<string>();
    if (!pSet.size || !bSet.size) continue;

    const pOnly = [...pSet].filter((t) => !bSet.has(t));
    const bOnly = [...bSet].filter((t) => !pSet.has(t));
    if (!pOnly.length && !bOnly.length) continue;

    const allConflict = [...new Set([...pOnly, ...bOnly])];

    for (const txid of allConflict) {
      conflictMap.set(
        txid,
        allConflict.filter((t) => t !== txid),
      );
    }
  }

  return conflictMap;
}

export function buildMonthGroups(rows: BlockchainCompareRow[]): BlockchainCompareMonth[] {
  const byMonth = new Map<string, BlockchainCompareRow[]>();

  for (const row of rows) {
    const mk = monthKey(row.date) ?? monthKey(row.payoutDate) ?? monthKey(row.blockchainDate);
    if (!mk) continue;
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk)!.push(row);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthRows]) => {
      const payoutGross = round8(
        monthRows.reduce((s, r) => s + (r.payoutGross ?? 0), 0),
      );
      const blockchainGross = round8(
        monthRows.reduce((s, r) => s + (r.blockchainGross ?? 0), 0),
      );
      const payoutFee = round8(
        monthRows.reduce((s, r) => {
          if (r.payoutGross == null) return s;
          return s + (r.payoutFee ?? 0);
        }, 0),
      );
      const blockchainFee = round8(
        monthRows.reduce((s, r) => {
          if (r.blockchainGross == null) return s;
          return s + (r.blockchainFee ?? 0);
        }, 0),
      );

      return {
        month,
        payoutGross,
        blockchainGross,
        grossDiff: round8(payoutGross - blockchainGross),
        payoutFee,
        blockchainFee,
        txidCount: monthRows.length,
        matchedCount: monthRows.filter((r) => r.status === "match").length,
        issueCount: monthRows.filter((r) => r.status !== "match").length,
        sameDayTxidMismatches: monthRows.filter((r) => r.status === "same_day_txid_mismatch").length,
      };
    });
}

export function buildCompareResult(dbRows: RawCompareDbRow[]): BlockchainCompareResult {
  const baseRows: BlockchainCompareRow[] = dbRows.map((r) => {
    const payoutGross = r.payout_gross != null ? Number(r.payout_gross) : null;
    const blockchainGross = r.blockchain_gross != null ? Number(r.blockchain_gross) : null;
    const payoutFee = r.payout_fee != null ? Number(r.payout_fee) : null;
    const blockchainFee = r.blockchain_fee != null ? Number(r.blockchain_fee) : null;
    const payoutCount = r.payout_count != null ? Number(r.payout_count) : null;
    const blockchainCount = r.blockchain_count != null ? Number(r.blockchain_count) : null;

    const grossDiff = round8((payoutGross ?? 0) - (blockchainGross ?? 0));
    const feeDiff = round8((payoutFee ?? 0) - (blockchainFee ?? 0));

    const payoutDate = r.payout_date ? new Date(r.payout_date).toISOString() : null;
    const blockchainDate = r.blockchain_date ? new Date(r.blockchain_date).toISOString() : null;

    return {
      txid: String(r.txid),
      date: blockchainDate ?? payoutDate,
      payoutDate,
      blockchainDate,
      payoutCount,
      blockchainCount,
      payoutGross,
      blockchainGross,
      payoutFee,
      blockchainFee,
      grossDiff,
      feeDiff,
      status: baseStatus(
        payoutGross,
        blockchainGross,
        payoutCount,
        blockchainCount,
        payoutFee,
        blockchainFee,
        grossDiff,
        feeDiff,
      ),
      sameDayConflictTxids: [],
    };
  });

  const conflictMap = detectSameDayTxidConflicts(baseRows);

  const rows = baseRows.map((row) => {
    const conflicts = conflictMap.get(row.txid) ?? [];
    if (!conflicts.length) return row;

    const shouldUpgradeStatus =
      row.status === "match" ||
      row.status === "missing_in_payouts" ||
      row.status === "missing_in_blockchain";

    return {
      ...row,
      status: shouldUpgradeStatus ? ("same_day_txid_mismatch" as const) : row.status,
      sameDayConflictTxids: conflicts,
    };
  });

  const months = buildMonthGroups(rows);

  const summary: BlockchainCompareSummary = {
    total: rows.length,
    matched: rows.filter((r) => r.status === "match").length,
    mismatched: rows.filter(
      (r) =>
        r.status === "amount_mismatch" ||
        r.status === "fee_mismatch" ||
        r.status === "count_mismatch",
    ).length,
    missingInPayouts: rows.filter((r) => r.status === "missing_in_payouts").length,
    missingInBlockchain: rows.filter((r) => r.status === "missing_in_blockchain").length,
    sameDayTxidMismatches: rows.filter((r) => r.status === "same_day_txid_mismatch").length,
  };

  return { rows, months, summary };
}
