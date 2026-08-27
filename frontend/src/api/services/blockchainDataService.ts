import apiClient from "../client";

export interface BlockchainPayoutRow {
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
}

export interface BlockchainTxnSummary {
    txid: string;
    txnDate: string | null;
    recipientCount: number;
    grossAmount: number;
    txidFee: number;
    netAmount: number;
}

export interface BlockchainListSummary {
    txidCount: number;
    rowCount: number;
    totalGross: number;
    totalFee: number;
    totalNet: number;
    mappedRows: number;
    unmappedRows?: number;
}

export interface BlockchainListResult {
    rows: BlockchainPayoutRow[];
    txnSummary: BlockchainTxnSummary[];
    summary: BlockchainListSummary;
}

export type BlockchainListParams = {
    dateFrom?: string;
    dateTo?: string;
    search?: string;
};

export type AddressIssueKind =
    | "dual_txid"
    | "paid_different_output"
    | "wallet_not_on_chain"
    | "no_blockchain_import";

export interface PayoutAddressIssue {
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
}

export interface AddressIssuesSummary {
    totalIssues: number;
    txidCount: number;
    accountCount: number;
    byKind: Record<AddressIssueKind, number>;
}

export interface AddressIssuesResult {
    issues: PayoutAddressIssue[];
    summary: AddressIssuesSummary;
}

export async function getBlockchainPayoutList(
    params: BlockchainListParams = {},
): Promise<BlockchainListResult> {
    const response = await apiClient.get("/api/payouts/blockchain/list", { params });
    return response.data.data;
}

export async function getPayoutAddressIssues(
    params: BlockchainListParams = {},
): Promise<AddressIssuesResult> {
    const response = await apiClient.get("/api/payouts/blockchain/address-issues", { params });
    return response.data.data;
}
