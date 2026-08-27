export type CLReward = {
    Id: number;
    AcNo: string;
    MipContractNo?: number | null;
    Amount?: number;
    Type?: string;
    RewardOn?: string;
    RewardDate?: string | null;
    Hashrate?: number;
    sla?: number | null;
    oc?: number | null;
    hostingfee_amount?: number | null;
    hostingfee_hashrate?: number | null;
    net_amount?: number | null;
    net_hashrate?: number | null;
};

export type DayCLRewardGroup = {
    dayKey: string;
    date: Date;
    totalAmount: number;
    totalHostingFee: number;
    totalNetAmount: number;
    totalHashrateTH: number;
    rewards: CLReward[];
    rewardCount: number;
    primaryType: string | null;
};

function dayKeyFromReward(reward: CLReward): string | null {
    if (reward.RewardDate) return reward.RewardDate;
    if (!reward.RewardOn) return null;
    const created = new Date(reward.RewardOn);
    if (Number.isNaN(created.getTime())) return null;
    const y = created.getFullYear();
    const m = String(created.getMonth() + 1).padStart(2, "0");
    const d = String(created.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function groupCLRewardsByDay(rewards: CLReward[]): DayCLRewardGroup[] {
    const map = new Map<string, CLReward[]>();

    for (const reward of rewards) {
        const key = dayKeyFromReward(reward);
        if (!key) continue;
        const list = map.get(key) ?? [];
        list.push(reward);
        map.set(key, list);
    }

    return [...map.entries()]
        .map(([dayKey, items]) => {
            const sorted = [...items].sort(
                (a, b) => new Date(b.RewardOn ?? 0).getTime() - new Date(a.RewardOn ?? 0).getTime(),
            );
            const [y, m, d] = dayKey.split("-").map(Number);
            const types = [...new Set(sorted.map((r) => r.Type).filter(Boolean) as string[])];
            return {
                dayKey,
                date: new Date(y, m - 1, d),
                totalAmount: sorted.reduce((sum, r) => sum + Number(r.Amount || 0), 0),
                totalHostingFee: sorted.reduce((sum, r) => sum + Number(r.hostingfee_amount || 0), 0),
                totalNetAmount: sorted.reduce((sum, r) => sum + Number(r.net_amount || 0), 0),
                totalHashrateTH: sorted.reduce((sum, r) => sum + Number(r.Hashrate || 0), 0),
                rewards: sorted,
                rewardCount: sorted.length,
                primaryType: types.length === 1 ? types[0] : null,
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function clRewardMatchesSearch(reward: CLReward, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const parts = [
        reward.Id,
        reward.AcNo,
        reward.MipContractNo,
        reward.Amount,
        reward.Type,
        reward.Hashrate,
        reward.sla,
        reward.oc,
    ];

    return parts.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export function filterDayCLRewardGroupsBySearch(groups: DayCLRewardGroup[], query: string): DayCLRewardGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.rewards.some((r) => clRewardMatchesSearch(r, q)));
}

export function summaryCLRewardTimestamp(group: DayCLRewardGroup): string | null {
    return group.rewards[0]?.RewardOn ?? null;
}
