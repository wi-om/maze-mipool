import { useEffect, useState } from "react";
import { getAllContracts } from "../api/services/contractService";
import { getAllPayouts, type Payout } from "../api/services/payoutService";
import {
    getAllRewards,
    getCLRewards,
    getCLUptimeStats,
    type CLUptimeStats,
} from "../api/services/rewardService";

export type RewardTotals = {
    /** Gross total from CLRewards (all time). */
    total: number;
    eu: number;
    /** Company / CL share: total − eu. */
    cl: number;
};

export type DashboardStats = {
    activeCount: number;
    activeHashrate: number;
    rewards: RewardTotals;
};

function normalizeList<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray((value as { data?: T[] }).data)) {
        return (value as { data: T[] }).data;
    }
    return [];
}

function sumCompletePayouts(payoutsList: Payout[]): number {
    return payoutsList.reduce((sum, item) => {
        if ((item.Status || "").toLowerCase() !== "complete") return sum;
        return sum + (Number(item.Amount) || 0);
    }, 0);
}

function buildRewardTotals(clTotal: number, euTotal: number): RewardTotals {
    const total = Number(clTotal) || 0;
    const eu = Number(euTotal) || 0;
    return { total, eu, cl: Math.max(0, total - eu) };
}

function buildStats(contracts: unknown, rewards: RewardTotals): DashboardStats {
    const contractsList = normalizeList<{ Status?: number; Hashrate?: number }>(contracts);

    const activeContracts = contractsList.filter((item) => item.Status === 2);
    const activeHashrate = activeContracts.reduce((sum, item) => sum + (Number(item.Hashrate) || 0), 0);

    return {
        activeCount: activeContracts.length,
        activeHashrate,
        rewards,
    };
}

export function useDashboardData() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats>({
        activeCount: 0,
        activeHashrate: 0,
        rewards: { total: 0, eu: 0, cl: 0 },
    });
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [payoutsTotal, setPayoutsTotal] = useState(0);
    const [uptime, setUptime] = useState<CLUptimeStats | null>(null);
    const [uptimeLoading, setUptimeLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            const [euRewardsResult, clRewardsResult, contractsResult, payoutsResult, uptimeResult] =
                await Promise.allSettled([
                    getAllRewards({ summaryOnly: true, page: 1, limit: 1 }),
                    getCLRewards({ summaryOnly: true, page: 1, limit: 1 }),
                    getAllContracts(),
                    getAllPayouts(),
                    getCLUptimeStats(),
                ]);

            if (cancelled) return;

            const euTotal =
                euRewardsResult.status === "fulfilled"
                    ? euRewardsResult.value.pagination.totalAmount
                    : 0;
            const clTotal =
                clRewardsResult.status === "fulfilled"
                    ? clRewardsResult.value.pagination.totalAmount
                    : 0;
            const rewardTotals = buildRewardTotals(clTotal, euTotal);
            const contracts = contractsResult.status === "fulfilled" ? contractsResult.value : [];
            const payoutsList =
                payoutsResult.status === "fulfilled" ? normalizeList<Payout>(payoutsResult.value) : [];

            if (euRewardsResult.status === "rejected") {
                console.error("Dashboard: failed to load EU reward totals", euRewardsResult.reason);
            }
            if (clRewardsResult.status === "rejected") {
                console.error("Dashboard: failed to load CL reward totals", clRewardsResult.reason);
            }
            if (contractsResult.status === "rejected") {
                console.error("Dashboard: failed to load contracts", contractsResult.reason);
            }
            if (payoutsResult.status === "rejected") {
                console.error("Dashboard: failed to load payouts", payoutsResult.reason);
            }
            if (uptimeResult.status === "rejected") {
                console.error("Dashboard: failed to load CL uptime stats", uptimeResult.reason);
            }

            setStats(buildStats(contracts, rewardTotals));
            setPayouts(payoutsList);
            setPayoutsTotal(sumCompletePayouts(payoutsList));
            setUptime(uptimeResult.status === "fulfilled" ? uptimeResult.value : null);
            setUptimeLoading(false);
            setLoading(false);
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    return { loading, stats, payouts, payoutsTotal, uptime, uptimeLoading };
}
