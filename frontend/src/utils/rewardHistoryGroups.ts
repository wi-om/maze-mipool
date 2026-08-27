import type { Reward } from "../api/services/rewardService";

export type DayRewardGroup = {
    dayKey: string;
    date: Date;
    totalAmount: number;
    totalHashrateTH: number;
    rewards: Reward[];
    rewardCount: number;
    primaryType: string | null;
};

function rewardHashrateTH(reward: Reward): number {
    const val = Number(reward.Hashrate || reward.contract?.Hashrate || 0);
    if (!val) return 0;
    const unit = (reward.contract?.HashrateUnit || "TH").toUpperCase();
    switch (unit) {
        case "PH":
            return val * 1000;
        case "GH":
            return val / 1000;
        case "MH":
            return val / 1_000_000;
        default:
            return val;
    }
}

function dayKeyFromDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function groupRewardsByDay(rewards: Reward[]): DayRewardGroup[] {
    const map = new Map<string, Reward[]>();

    for (const reward of rewards) {
        if (!reward.CreatedOn) continue;
        const created = new Date(reward.CreatedOn);
        if (Number.isNaN(created.getTime())) continue;
        const key = dayKeyFromDate(created);
        const list = map.get(key) ?? [];
        list.push(reward);
        map.set(key, list);
    }

    return [...map.entries()]
        .map(([dayKey, items]) => {
            const sorted = [...items].sort(
                (a, b) => new Date(b.CreatedOn ?? 0).getTime() - new Date(a.CreatedOn ?? 0).getTime(),
            );
            const [y, m, d] = dayKey.split("-").map(Number);
            const types = [...new Set(sorted.map((r) => r.Type).filter(Boolean) as string[])];
            return {
                dayKey,
                date: new Date(y, m - 1, d),
                totalAmount: sorted.reduce((sum, r) => sum + Number(r.Amount || 0), 0),
                totalHashrateTH: sorted.reduce((sum, r) => sum + rewardHashrateTH(r), 0),
                rewards: sorted,
                rewardCount: sorted.length,
                primaryType: types.length === 1 ? types[0] : null,
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function rewardMatchesSearch(reward: Reward, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const hashrate = reward.Hashrate || reward.contract?.Hashrate;
    const hashrateUnit = reward.contract?.HashrateUnit || "TH";

    const parts = [
        reward.Id,
        reward.AcNo,
        reward.mipContractNo,
        reward.Amount,
        reward.Type,
        hashrate,
        hashrateUnit,
        reward.account?.Parent,
        reward.account?.ClientID,
    ];

    return parts.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export function filterDayRewardGroupsBySearch(groups: DayRewardGroup[], query: string): DayRewardGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.rewards.some((r) => rewardMatchesSearch(r, q)));
}

export function summaryRewardTimestamp(group: DayRewardGroup): string | null {
    return group.rewards[0]?.CreatedOn ?? null;
}
