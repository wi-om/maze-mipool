import client from "../client";

export interface DailyReward {
    Id: number;
    rewardDate: string;
    income: number;
    totalHashrate: string;
    thQuantity: number;
    calculatedReward: number;
    status: string;
    confirmedAt?: string;
    confirmedBy?: string;
}

export interface ContractRewardBreakdown {
    AcNo: string;
    MipContractNo: string;
    Hashrate: number;
    HashrateUnit: string;
    reward: number;
}

export interface CalculationResult {
    dailyReward: DailyReward;
    contracts: ContractRewardBreakdown[];
    factor: number;
}

export const calculateDailyRewards = async (payload?: { date?: string; manualData?: { income: number; hashrate: number } }): Promise<CalculationResult> => {
    const response = await client.post("/api/rewards/daily/calculate", payload || {});
    return response.data.data;
};

export const calculateBulkDailyRewards = async (payload: { startDate: string, endDate: string }): Promise<any> => {
    const response = await client.post("/api/rewards/daily/bulk", payload);
    return response.data;
};

export const checkBulkDailyRewardsExist = async (payload: { startDate: string, endDate: string }): Promise<{ exists: boolean }> => {
    const response = await client.get("/api/rewards/daily/check-existence", { params: payload });
    return response.data;
};

export const checkMipsDataAvailability = async (payload: { startDate: string, endDate: string }): Promise<{ missingDates: string[], defaultManualValues?: { income: string, hashrate: string } }> => {
    const response = await client.get("/api/rewards/daily/check-mips", { params: payload });
    return response.data;
};

export const getDailyRewards = async (params?: { dateFrom?: string; dateTo?: string; status?: string }) => {
    const response = await client.get("/api/rewards/daily", { params });
    return response.data.data;
};

export interface Reward {
    Id: number;
    AcNo: string;
    mipContractNo?: string;
    Amount?: number;
    Type?: string;
    CreatedOn?: string;
    Hashrate?: number;
    account?: {
        Parent?: string | null;
        ClientID?: string | null;
        Type?: string | null;
    };
    contract?: {
        Hashrate?: number;
        HashrateUnit?: string;
    };
}

export type CLGroupBy = "day" | "month" | "year";

/** Aggregated period row returned when EU rewards are grouped by month or year. */
export type EURewardPeriodRow = {
    period: string;
    periodType: "month" | "year";
    totalAmount: number;
    totalHashrate: number;
    rewardCount: number;
    months?: EURewardPeriodRow[];
};

export type PaginatedListParams = {
    page?: number;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    summaryOnly?: boolean;
    groupBy?: CLGroupBy;
};

export type PaginatedListMeta = {
    page: number;
    limit: number;
    totalDays: number;
    totalRecords: number;
    totalAmount: number;
    totalNetAmount?: number;
    totalHostingFee?: number;
    totalSalesAmount?: number;
    totalRewardsAmount?: number;
    totalPayoutAmount?: number;
    totalBlockchainAmount?: number;
    latestBalance?: number;
    avgOc?: number | null;
    avgSla?: number | null;
};

export type PaginatedListResult<T> = {
    data: T[];
    pagination: PaginatedListMeta;
};

const EMPTY_PAGINATION: PaginatedListMeta = {
    page: 1,
    limit: 10,
    totalDays: 0,
    totalRecords: 0,
    totalAmount: 0,
};

function normalizePagination(raw: Partial<PaginatedListMeta> | undefined): PaginatedListMeta {
    if (!raw) return { ...EMPTY_PAGINATION };
    return {
        page: raw.page ?? 1,
        limit: raw.limit ?? 10,
        totalDays: raw.totalDays ?? 0,
        totalRecords: raw.totalRecords ?? (raw as { totalRewards?: number }).totalRewards ?? 0,
        totalAmount: raw.totalAmount ?? 0,
        totalNetAmount: raw.totalNetAmount,
        totalHostingFee: raw.totalHostingFee,
        totalSalesAmount: raw.totalSalesAmount,
        latestBalance: raw.latestBalance,
        avgOc: raw.avgOc ?? null,
        avgSla: raw.avgSla ?? null,
    };
}

export const getAllRewards = async (params?: PaginatedListParams): Promise<PaginatedListResult<Reward | EURewardPeriodRow>> => {
    const response = await client.get("/api/yields", { params });
    return {
        data: response.data.data ?? [],
        pagination: normalizePagination(response.data.pagination),
    };
};

export async function fetchAllRewards(params: Omit<PaginatedListParams, "page">): Promise<Reward[]> {
    const all: Reward[] = [];
    let page = 1;
    let totalPages = 1;
    const limit = params.limit ?? 100;

    do {
        const result = await getAllRewards({ ...params, page, limit });
        all.push(...result.data.filter((r): r is Reward => "Id" in r));
        totalPages = Math.max(1, Math.ceil(result.pagination.totalDays / limit));
        page += 1;
    } while (page <= totalPages);

    return all;
}

export const updateDailyRewardStatus = async (id: number, status: string, confirmedBy?: string) => {
    const response = await client.patch(`/api/rewards/daily/${id}/status`, { status, confirmedBy });
    return response.data;
};

export const getTestRewards = async () => {
    const response = await client.get("/api/rewards/daily/test");
    return response.data;
};

export type CLRewardsParams = PaginatedListParams & { groupBy?: CLGroupBy };
export type CLRewardsPagination = PaginatedListMeta;
export type CLRewardsResult = PaginatedListResult<unknown>;

/** Aggregated period row returned when CL rewards are grouped by month or year. */
export type CLRewardPeriodRow = {
    period: string;
    periodType: "month" | "year";
    totalAmount: number;
    totalNetAmount: number;
    totalHostingFee: number;
    totalHashrate: number;
    rewardCount: number;
    avgOc: number | null;
    avgSla: number | null;
    months?: CLRewardPeriodRow[];
};

export const getCLRewards = async (params?: CLRewardsParams): Promise<CLRewardsResult> => {
    const response = await client.get("/api/yields/cl", { params });
    return {
        data: response.data.data ?? [],
        pagination: normalizePagination(response.data.pagination),
    };
};

export type CLUptimeStats = {
    today: number | null;
    yesterday: number | null;
    thisMonth: number | null;
    lastMonth: number | null;
    thisYear: number | null;
};

export const getCLUptimeStats = async (): Promise<CLUptimeStats> => {
    const response = await client.get("/api/yields/cl/uptime");
    return response.data.data;
};

export type CMWalletEntry = {
    ID?: number;
    AcNo?: string;
    rewardDate?: string;
    RewardOn?: string;
    Date?: string;
    Amount?: number;
    Sales_amount?: number;
    Net_amount?: number;
    Net_Balance?: number;
};

export type CMWalletParams = PaginatedListParams;
export type CMWalletResult = PaginatedListResult<CMWalletEntry>;

export const getCMWalletEntries = async (params?: CMWalletParams): Promise<CMWalletResult> => {
    const response = await client.get("/api/yields/wallet", { params });
    return {
        data: response.data.data ?? [],
        pagination: normalizePagination(response.data.pagination),
    };
};

export async function fetchAllCMWalletEntries(params: Omit<PaginatedListParams, "page">): Promise<CMWalletEntry[]> {
    const all: CMWalletEntry[] = [];
    let page = 1;
    let totalPages = 1;
    const limit = params.limit ?? 100;

    do {
        const result = await getCMWalletEntries({ ...params, page, limit });
        all.push(...result.data);
        totalPages = Math.max(1, Math.ceil(result.pagination.totalDays / limit));
        page += 1;
    } while (page <= totalPages);

    return all;
}

export const fetchLatestUnitReward = async () => {
    const response = await client.get("/api/rewards/daily/latest-unit-reward");
    return response.data.data;
};

export const getUnitRewardsHistory = async () => {
    const response = await client.get("/api/rewards/daily/unit-history");
    return response.data.data;
};
