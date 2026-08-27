import apiClient from "../client";

export interface Payout {
    Id: number;
    AcNo: string;
    mipContractNo: string;
    Amount?: number;
    txid?: string;
    txidFee?: number;
    Status: string;
    CreatedOn?: string;
    paidThroughDate?: string | null;
    ToAddr?: string;
    account?: { Parent: string | null; ClientID: string | null } | null;
}

export interface PayoutTxnSummary {
    txid: string;
    txnDate: string | null;
    recipientCount: number;
    grossAmount: number;
    txidFee: number;
    netAmount: number;
    feeDeducted: boolean;
    allComplete: boolean;
}

export interface PayoutSummary {
    totalOutstanding: number;
    totalPayable: number;
    totalAccruedNotPayable: number;
    daysPending: number;
    contractQty: number;
    clientCount: number;
    paidThroughDate: string;
    maxPaidThroughDate: string;
}

export interface PendingContract {
    mipContractNo: string;
    pendingAmount: number;
}

export interface PayoutClient {
    acNo: string;
    parentClientid: string | null;
    balance: number;
    payableBalance: number;
    accruedBalance: number;
    lastPaidThroughDate: string | null;
    paidThroughDate: string;
    btcAddr: string | null;
    daysPending: number;
    contractQty: number;
    totalHashrateTH: number;
    hasActiveWallet: boolean;
    balanceDrift: boolean;
    contracts: PendingContract[];
}

export interface PreviewRow {
    acNo: string;
    parentClientid: string | null;
    mipContractNo: string;
    amount: number;
    toAddr: string;
    paidThroughDate: string;
}

export interface CompletePayoutResult {
    created: Payout[];
    skipped: Array<{ acNo: string; mipContractNo: string; amount: number; reason: string }>;
    errors: Array<{ acNo: string; error: string }>;
}

export interface PayoutPendingBundle {
    summary: PayoutSummary;
    clients: PayoutClient[];
}

function paidThroughQuery(paidThroughDate?: string): string {
    return paidThroughDate ? `?paidThroughDate=${encodeURIComponent(paidThroughDate)}` : "";
}

export const getPayoutPending = async (paidThroughDate?: string): Promise<PayoutPendingBundle> => {
    const response = await apiClient.get(`/api/payouts/pending${paidThroughQuery(paidThroughDate)}`);
    return response.data.data;
};

export const getAllPayouts = async (): Promise<Payout[]> => {
    const response = await apiClient.get("/api/payouts");
    return response.data.data;
};

/** Per-transaction (per-txid) payout summary: gross / on-chain fee / net. */
export const getPayoutTxnSummary = async (): Promise<PayoutTxnSummary[]> => {
    const response = await apiClient.get("/api/payouts/txn-summary");
    return response.data.data;
};

export type DailyCompareRow = {
    date: string;
    rewardsAmount: number;
    payoutAmount: number;
    blockchainAmount: number;
    difference: number;
    status: "match" | "mismatch";
};

export type DailyComparePagination = {
    page: number;
    limit: number;
    totalDays: number;
    totalRecords: number;
    totalAmount: number;
    totalRewardsAmount: number;
    totalPayoutAmount: number;
    totalBlockchainAmount: number;
};

export type DailyCompareParams = {
    page?: number;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
};

export const getDailyCompare = async (
    params?: DailyCompareParams,
): Promise<{ data: DailyCompareRow[]; pagination: DailyComparePagination }> => {
    const response = await apiClient.get("/api/payouts/daily-compare", { params });
    return { data: response.data.data, pagination: response.data.pagination };
};

export const getPayoutSummary = async (paidThroughDate?: string): Promise<PayoutSummary> => {
    const response = await apiClient.get(`/api/payouts/summary${paidThroughQuery(paidThroughDate)}`);
    return response.data.data;
};

export const getPayoutClients = async (paidThroughDate?: string): Promise<PayoutClient[]> => {
    const response = await apiClient.get(`/api/payouts/clients${paidThroughQuery(paidThroughDate)}`);
    return response.data.data;
};

export const previewPayout = async (
    acNos: string[],
    paidThroughDate?: string,
): Promise<PreviewRow[]> => {
    const response = await apiClient.post("/api/payouts/preview", { acNos, paidThroughDate });
    return response.data.data;
};

export const completePayout = async (input: {
    acNos: string[];
    txid: string;
    paidThroughDate?: string;
    createdOn?: string;
    txidFee?: number;
}): Promise<CompletePayoutResult> => {
    const response = await apiClient.post("/api/payouts/complete", input);
    return {
        created: response.data.created ?? [],
        skipped: response.data.skipped ?? [],
        errors: response.data.errors ?? [],
    };
};

export type SyncPayoutFeesFromPeriodResult = {
    dateFrom: string;
    dateTo: string;
    txidsInPeriod: number;
    alreadyHadFee: number;
    needingFee: number;
    alreadySynced: boolean;
    feesMapped: number;
    updatedRows: number;
    updatedTxids: string[];
    blockchainImported: number;
    notFoundFees: string[];
    fetchErrors: Array<{ txid: string; error: string }>;
    previewOnly?: boolean;
    forced?: boolean;
};

/** Fetch fees for payout txids in a date range and map onto payout rows (Amount unchanged). */
export const syncPayoutFeesFromPeriod = async (input: {
    dateFrom: string;
    dateTo: string;
    force?: boolean;
    previewOnly?: boolean;
}): Promise<SyncPayoutFeesFromPeriodResult> => {
    const response = await apiClient.post("/api/payouts/txid-fees/sync-from-period", input);
    return response.data.data;
};

export type BlockchainCompareStatus =
    | "match"
    | "amount_mismatch"
    | "fee_mismatch"
    | "count_mismatch"
    | "missing_in_payouts"
    | "missing_in_blockchain"
    | "same_day_txid_mismatch";

export interface BlockchainCompareRow {
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
}

export interface BlockchainCompareMonth {
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
}

export interface BlockchainCompareSummary {
    total: number;
    matched: number;
    mismatched: number;
    missingInPayouts: number;
    missingInBlockchain: number;
    sameDayTxidMismatches: number;
}

export interface BlockchainCompareResult {
    rows: BlockchainCompareRow[];
    months: BlockchainCompareMonth[];
    summary: BlockchainCompareSummary;
}

/** Per-txid comparison of the Payouts table vs blockchain_payout table. */
export const compareBlockchainPayouts = async (): Promise<BlockchainCompareResult> => {
    const response = await apiClient.get("/api/payouts/blockchain/compare");
    return response.data.data;
};
