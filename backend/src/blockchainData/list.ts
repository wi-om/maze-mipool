/**
 * Fast list queries for blockchain_payout (filtered rows + per-txid summary).
 */
import { AppDataSource } from "@common";

export type BlockchainListFilters = {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type BlockchainPayoutRow = {
  id: number;
  txid: string;
  acNo: string | null;
  mipContractNo: string | null;
  address: string | null;
  amount: number;
  txidFee: number;
  txnDate: string | null;
  status: string | null;
  source: string;
};

export type BlockchainTxnSummaryRow = {
  txid: string;
  txnDate: string | null;
  recipientCount: number;
  grossAmount: number;
  txidFee: number;
  netAmount: number;
};

export type BlockchainListSummary = {
  txidCount: number;
  rowCount: number;
  totalGross: number;
  totalFee: number;
  totalNet: number;
  mappedRows: number;
  /** Outputs with no matching account (change / unknown) — excluded from rows and totals. */
  unmappedRows: number;
};

export type BlockchainListResult = {
  rows: BlockchainPayoutRow[];
  txnSummary: BlockchainTxnSummaryRow[];
  summary: BlockchainListSummary;
};

export function searchPattern(search?: string): string | null {
  const q = search?.trim();
  if (!q) return null;
  return `%${q.replace(/[%_\\]/g, "\\$&")}%`;
}

export function buildWhere(filters: BlockchainListFilters, startIdx = 1): { clause: string; params: unknown[] } {
  const params: unknown[] = [];
  let idx = startIdx;
  const parts: string[] = ["b.txid IS NOT NULL", "btrim(b.txid) <> ''"];

  if (filters.dateFrom) {
    parts.push(`(b.txn_date AT TIME ZONE 'UTC')::date >= $${idx++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    parts.push(`(b.txn_date AT TIME ZONE 'UTC')::date <= $${idx++}`);
    params.push(filters.dateTo);
  }

  const sp = searchPattern(filters.search);
  if (sp) {
    parts.push(`(
      b.txid ILIKE $${idx} ESCAPE '\\'
      OR b.address ILIKE $${idx} ESCAPE '\\'
      OR b.ac_no ILIKE $${idx} ESCAPE '\\'
      OR b.mip_contract_no ILIKE $${idx} ESCAPE '\\'
    )`);
    params.push(sp);
    idx++;
  }

  return { clause: parts.join(" AND "), params };
}

/** Rows linked to a MIPCC account — excludes change / unmapped on-chain outputs. */
export const MAPPED_ACNO_CLAUSE = `b.ac_no IS NOT NULL AND btrim(b.ac_no) <> ''`;

export function buildMappedWhere(filters: BlockchainListFilters, startIdx = 1): { clause: string; params: unknown[] } {
  const { clause, params } = buildWhere(filters, startIdx);
  return { clause: `${clause} AND ${MAPPED_ACNO_CLAUSE}`, params };
}

function mapRow(r: Record<string, unknown>): BlockchainPayoutRow {
  return {
    id: Number(r.id),
    txid: String(r.txid ?? "").trim(),
    acNo: r.ac_no != null ? String(r.ac_no).trim() : null,
    mipContractNo: r.mip_contract_no != null ? String(r.mip_contract_no).trim() : null,
    address: r.address != null ? String(r.address).trim() : null,
    amount: Number(r.amount ?? 0),
    txidFee: Number(r.txid_fee ?? 0),
    txnDate: r.txn_date ? new Date(r.txn_date as string | Date).toISOString() : null,
    status: r.status != null ? String(r.status) : null,
    source: String(r.source ?? ""),
  };
}

export async function fetchBlockchainPayoutList(
  filters: BlockchainListFilters = {},
): Promise<BlockchainListResult> {
  const { clause, params } = buildWhere(filters);
  const mapped = buildMappedWhere(filters);

  const [rowsRaw, txnRaw, summaryRaw, unmappedRaw] = await Promise.all([
    AppDataSource.query(
      `
    SELECT b.id, btrim(b.txid) AS txid,
           TRIM(b.ac_no) AS ac_no, TRIM(b.mip_contract_no) AS mip_contract_no,
           TRIM(b.address) AS address,
           b.amount::numeric(24,8) AS amount,
           b.txid_fee::numeric(24,8) AS txid_fee,
           b.txn_date, b.status, b.source
    FROM blockchain_payout b
    WHERE ${mapped.clause}
    ORDER BY b.txn_date DESC NULLS LAST, b.id DESC
    `,
      mapped.params,
    ),
    AppDataSource.query(
      `
    SELECT btrim(b.txid) AS txid,
           MIN(b.txn_date) AS txn_date,
           COUNT(*)::int AS recipient_count,
           SUM(b.amount)::numeric(24,8) AS gross_amount,
           MAX(b.txid_fee)::numeric(24,8) AS txid_fee
    FROM blockchain_payout b
    WHERE ${mapped.clause}
    GROUP BY btrim(b.txid)
    ORDER BY MIN(b.txn_date) DESC NULLS LAST
    `,
      mapped.params,
    ),
    AppDataSource.query(
      `
    WITH tx AS (
      SELECT btrim(b.txid) AS txid,
             MAX(b.txid_fee)::numeric(24,8) AS fee
      FROM blockchain_payout b
      WHERE ${mapped.clause}
      GROUP BY btrim(b.txid)
    )
    SELECT COUNT(*)::int AS row_count,
           COUNT(DISTINCT btrim(b.txid))::int AS txid_count,
           COALESCE(SUM(b.amount), 0)::numeric(24,8) AS total_gross,
           COALESCE((SELECT SUM(fee) FROM tx), 0)::numeric(24,8) AS total_fee,
           COUNT(*)::int AS mapped_rows
    FROM blockchain_payout b
    WHERE ${mapped.clause}
    `,
      mapped.params,
    ),
    AppDataSource.query(
      `
    SELECT COUNT(*)::int AS unmapped_rows
    FROM blockchain_payout b
    WHERE ${clause}
      AND NOT (${MAPPED_ACNO_CLAUSE})
    `,
      params,
    ),
  ]);

  const rows = rowsRaw.map(mapRow);
  // Mapped output amounts = net paid to recipients (same as Payouts.Amount).
  // Gross = net + network fee (fee is not subtracted from outputs).
  const txnSummary: BlockchainTxnSummaryRow[] = txnRaw.map((t: Record<string, unknown>) => {
    const net = Number(t.gross_amount ?? 0);
    const fee = Number(t.txid_fee ?? 0);
    return {
      txid: String(t.txid ?? "").trim(),
      txnDate: t.txn_date ? new Date(t.txn_date as string | Date).toISOString() : null,
      recipientCount: Number(t.recipient_count ?? 0),
      grossAmount: Number((net + fee).toFixed(8)),
      txidFee: fee,
      netAmount: net,
    };
  });

  const s = summaryRaw[0] ?? {};
  const totalNet = Number(s.total_gross ?? 0);
  const totalFee = Number(s.total_fee ?? 0);

  return {
    rows,
    txnSummary,
    summary: {
      txidCount: Number(s.txid_count ?? 0),
      rowCount: Number(s.row_count ?? 0),
      totalGross: Number((totalNet + totalFee).toFixed(8)),
      totalFee,
      totalNet,
      mappedRows: Number(s.mapped_rows ?? 0),
      unmappedRows: Number(unmappedRaw[0]?.unmapped_rows ?? 0),
    },
  };
}
