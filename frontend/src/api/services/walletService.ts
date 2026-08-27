import apiClient from "../client";
import type { PaginatedListMeta } from "./rewardService";

export interface EuWallet {
    acNo: string;
    parentClientid: string | null;
    walletId: number | null;
    btcAddr: string | null;
    balance: number;
    isActive: boolean;
    hasWallet: boolean;
}

export interface WalletLedgerEntry {
    date: string;
    type: "reward" | "payout";
    amount: number;
    runningBalance: number;
    description: string;
    source?: string;
    destination?: string;
    assetName?: string;
    assetCode?: string;
    reference?: string | null;
    remark?: string | null;
    contractCount?: number;
    mipContractNos?: string[];
    txid?: string | null;
    payoutStatus?: string;
}

export interface WalletLedger {
    acNo: string;
    clientId: string | null;
    currentBalance: number;
    expectedBalance: number;
    totalCredited: number;
    totalPaidOut: number;
    entries: WalletLedgerEntry[];
}

export interface WalletTxnEntry {
    id: number;
    acNo: string;
    walletId: number | null;
    txnType: "CREDIT" | "DEBIT";
    amount: number;
    runningBalance: number;
    txid: string | null;
    source: string;
    destination: string;
    assetName: string;
    assetCode: string;
    remark: string | null;
    reference: string | null;
    sourceType: "REWARD" | "PAYOUT";
    sourceId: number;
    workDate: string | null;
    createdOn: string;
}

export type WalletTxnListParams = {
    page?: number;
    limit?: number;
    acNo?: string;
    txnType?: "CREDIT" | "DEBIT";
    dateFrom?: string;
    dateTo?: string;
    search?: string;
};

export const getEuWallets = async (): Promise<EuWallet[]> => {
    const response = await apiClient.get("/api/wallets/eu");
    return response.data.data;
};

export const getWalletLedger = async (clientId: string): Promise<WalletLedger> => {
    const response = await apiClient.get(`/api/wallets/ledger/${encodeURIComponent(clientId)}`);
    return response.data.data;
};

export const getWalletTxns = async (
    params: WalletTxnListParams,
): Promise<{ data: WalletTxnEntry[]; pagination: PaginatedListMeta }> => {
    const response = await apiClient.get("/api/wallets/txn", { params });
    const p = response.data.pagination ?? {};
    return {
        data: response.data.data,
        pagination: {
            page: p.page ?? 1,
            limit: p.limit ?? 10,
            totalRecords: p.totalRecords ?? 0,
            totalDays: p.totalDays ?? 0,
            totalAmount: 0,
        },
    };
};

export const getWalletTxnsByAcNo = async (acNo: string): Promise<WalletTxnEntry[]> => {
    const response = await apiClient.get(`/api/wallets/txn/${encodeURIComponent(acNo.trim())}`);
    return response.data.data;
};
