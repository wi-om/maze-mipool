/**
 * Payout ToAddr vs on-chain output mismatches (for Blockchain Data UI).
 */
import { AppDataSource } from "@common";

export type AddressIssueKind =
  | "dual_txid"
  | "paid_different_output"
  | "wallet_not_on_chain"
  | "no_blockchain_import";

export type PayoutAddressIssue = {
  acNo: string;
  payoutId: number;
  payoutDate: string;
  txid: string;
  payoutAddr: string;
  walletAddr: string | null;
  amount: number;
  onChainAddr: string | null;
  onChainAcNo: string | null;
  kind: AddressIssueKind;
  reason: string;
};

export type AddressIssuesSummary = {
  totalIssues: number;
  txidCount: number;
  accountCount: number;
  byKind: Record<AddressIssueKind, number>;
};

export type AddressIssuesResult = {
  issues: PayoutAddressIssue[];
  summary: AddressIssuesSummary;
};

export type AddressIssuesFilters = {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

const REASON: Record<AddressIssueKind, string> = {
  dual_txid:
    "Payout stores two TXIDs in one field (comma-separated). Blockchain data uses single TXIDs — matching fails until split.",
  paid_different_output:
    "Customer wallet in Payouts is correct, but this TX paid to a different on-chain output for the same amount.",
  wallet_not_on_chain:
    "Customer wallet is not an output of this transaction (payment may have used another address in the batch).",
  no_blockchain_import:
    "Transaction not found in blockchain import — re-import the TXID first.",
};

export function classifyAddressIssue(input: {
  txid: string;
  payoutAddr: string;
  walletAddr: string | null;
  onChainAddr: string | null;
  hasBlockchainRows: boolean;
}): { kind: AddressIssueKind; reason: string } {
  if (input.txid.includes(",")) {
    return { kind: "dual_txid", reason: REASON.dual_txid };
  }
  if (!input.hasBlockchainRows) {
    return { kind: "no_blockchain_import", reason: REASON.no_blockchain_import };
  }
  if (
    input.onChainAddr &&
    input.onChainAddr !== input.payoutAddr &&
    input.walletAddr === input.payoutAddr
  ) {
    return { kind: "paid_different_output", reason: REASON.paid_different_output };
  }
  return { kind: "wallet_not_on_chain", reason: REASON.wallet_not_on_chain };
}

function buildIssueFilters(filters: AddressIssuesFilters, startIdx = 1): { clause: string; params: unknown[] } {
  const params: unknown[] = [];
  let idx = startIdx;
  const parts: string[] = [
    `p.txid IS NOT NULL`,
    `btrim(p.txid) <> ''`,
    `NOT EXISTS (
      SELECT 1 FROM blockchain_payout b
      WHERE btrim(b.txid) = btrim(p.txid) AND TRIM(b.address) = TRIM(p."ToAddr")
    )`,
  ];

  if (filters.dateFrom) {
    parts.push(`(p."CreatedOn" AT TIME ZONE 'UTC')::date >= $${idx++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    parts.push(`(p."CreatedOn" AT TIME ZONE 'UTC')::date <= $${idx++}`);
    params.push(filters.dateTo);
  }

  const q = filters.search?.trim();
  if (q) {
    const sp = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    parts.push(`(
      p.txid ILIKE $${idx} ESCAPE '\\'
      OR p."ToAddr" ILIKE $${idx} ESCAPE '\\'
      OR p."AcNo" ILIKE $${idx} ESCAPE '\\'
    )`);
    params.push(sp);
    idx++;
  }

  return { clause: parts.join(" AND "), params };
}

export async function fetchPayoutAddressIssues(
  filters: AddressIssuesFilters = {},
): Promise<AddressIssuesResult> {
  const { clause, params } = buildIssueFilters(filters);

  const raw = await AppDataSource.query(
    `
    SELECT TRIM(p."AcNo") AS acno,
           p."Id" AS payout_id,
           btrim(p.txid) AS txid,
           p."CreatedOn" AS payout_date,
           TRIM(p."ToAddr") AS payout_addr,
           TRIM(w."Addr") AS wallet_addr,
           p."Amount"::numeric(24,8) AS amount,
           bc_amt.addr AS on_chain_addr,
           bc_amt.ac_no AS on_chain_acno,
           EXISTS (
             SELECT 1 FROM blockchain_payout bx
             WHERE btrim(bx.txid) = btrim(p.txid)
           ) AS has_blockchain_rows
    FROM "Payouts" p
    LEFT JOIN "Wallets" w ON TRIM(w."AcNo") = TRIM(p."AcNo") AND w."IsActive" = true
    LEFT JOIN LATERAL (
      SELECT TRIM(b.address) AS addr, NULLIF(TRIM(b.ac_no), '') AS ac_no
      FROM blockchain_payout b
      WHERE btrim(b.txid) = btrim(p.txid)
        AND ABS(b.amount::numeric - p."Amount"::numeric) < 0.00000001
        AND TRIM(b.address) IS DISTINCT FROM TRIM(p."ToAddr")
      ORDER BY b.amount DESC
      LIMIT 1
    ) bc_amt ON true
    WHERE ${clause}
    ORDER BY p."CreatedOn" DESC, TRIM(p."AcNo")
    `,
    params,
  );

  const issues: PayoutAddressIssue[] = raw.map((r: Record<string, unknown>) => {
    const txid = String(r.txid ?? "").trim();
    const payoutAddr = String(r.payout_addr ?? "").trim();
    const walletAddr = r.wallet_addr != null ? String(r.wallet_addr).trim() : null;
    const onChainAddr = r.on_chain_addr != null ? String(r.on_chain_addr).trim() : null;
    const hasBlockchainRows = Boolean(r.has_blockchain_rows);
    const { kind, reason } = classifyAddressIssue({
      txid,
      payoutAddr,
      walletAddr,
      onChainAddr,
      hasBlockchainRows,
    });
    const payoutDate = r.payout_date ? new Date(r.payout_date as string | Date).toISOString() : "";

    return {
      acNo: String(r.acno ?? "").trim(),
      payoutId: Number(r.payout_id),
      payoutDate,
      txid,
      payoutAddr,
      walletAddr,
      amount: Number(r.amount ?? 0),
      onChainAddr,
      onChainAcNo: r.on_chain_acno != null ? String(r.on_chain_acno).trim() : null,
      kind,
      reason,
    };
  });

  const byKind: Record<AddressIssueKind, number> = {
    dual_txid: 0,
    paid_different_output: 0,
    wallet_not_on_chain: 0,
    no_blockchain_import: 0,
  };
  const txids = new Set<string>();
  const accounts = new Set<string>();
  for (const i of issues) {
    byKind[i.kind]++;
    txids.add(i.txid);
    accounts.add(i.acNo);
  }

  return {
    issues,
    summary: {
      totalIssues: issues.length,
      txidCount: txids.size,
      accountCount: accounts.size,
      byKind,
    },
  };
}
