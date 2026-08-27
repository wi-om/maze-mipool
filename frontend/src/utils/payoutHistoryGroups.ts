import type { Payout } from "../api/services/payoutService";

export type PayoutGroupBy = "day" | "month" | "year";

export function isVoidPayout(status: string | null | undefined): boolean {
    return String(status ?? "").trim().toLowerCase() === "void";
}

export function isCompletePayoutStatus(status: string): boolean {
    return status === "Complete" || status === "Completed" || status === "Success";
}

export type DayPayoutGroup = {
    dayKey: string;
    date: Date;
    totalAmount: number;
    payouts: Payout[];
    voidPayouts: Payout[];
    txids: string[];
    payoutCount: number;
    voidCount: number;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function periodKeyFromDate(date: Date, groupBy: PayoutGroupBy): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    if (groupBy === "year") return String(y);
    if (groupBy === "month") return `${y}-${m}`;
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function dateFromPeriodKey(periodKey: string, groupBy: PayoutGroupBy): Date {
    if (groupBy === "year") return new Date(Number(periodKey), 0, 1);
    if (groupBy === "month") {
        const [y, m] = periodKey.split("-").map(Number);
        return new Date(y, m - 1, 1);
    }
    const [y, m, d] = periodKey.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function formatPayoutPeriodLabel(periodKey: string, groupBy: PayoutGroupBy): string {
    if (!periodKey) return "—";
    if (groupBy === "year") return periodKey;
    if (groupBy === "month") {
        const [year, month] = periodKey.split("-");
        const idx = Number(month) - 1;
        return `${MONTH_NAMES[idx] ?? month} ${year}`;
    }
    return periodKey;
}

function groupPayouts(payouts: Payout[], groupBy: PayoutGroupBy): DayPayoutGroup[] {
    const map = new Map<string, Payout[]>();

    for (const payout of payouts) {
        if (!payout.CreatedOn) continue;
        const created = new Date(payout.CreatedOn);
        if (Number.isNaN(created.getTime())) continue;
        const key = periodKeyFromDate(created, groupBy);
        const list = map.get(key) ?? [];
        list.push(payout);
        map.set(key, list);
    }

    return [...map.entries()]
        .map(([dayKey, items]) => {
            const sorted = [...items].sort(
                (a, b) => new Date(b.CreatedOn ?? 0).getTime() - new Date(a.CreatedOn ?? 0).getTime(),
            );
            const voidPayouts = sorted.filter((p) => isVoidPayout(p.Status));
            const nonVoidPayouts = sorted.filter((p) => !isVoidPayout(p.Status));
            const txids = [...new Set(sorted.map((p) => p.txid?.trim()).filter(Boolean) as string[])];
            return {
                dayKey,
                date: dateFromPeriodKey(dayKey, groupBy),
                // Include Void amounts so totals match CMA / full Payouts table.
                totalAmount: sorted.reduce((sum, p) => sum + Number(p.Amount || 0), 0),
                payouts: sorted,
                voidPayouts,
                txids,
                payoutCount: nonVoidPayouts.length,
                voidCount: voidPayouts.length,
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function groupPayoutsByDay(payouts: Payout[]): DayPayoutGroup[] {
    return groupPayouts(payouts, "day");
}

export function groupPayoutsByMonth(payouts: Payout[]): DayPayoutGroup[] {
    return groupPayouts(payouts, "month");
}

export function groupPayoutsByYear(payouts: Payout[]): DayPayoutGroup[] {
    return groupPayouts(payouts, "year");
}

export function payoutMatchesSearch(payout: Payout, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const parts = [
        payout.Id,
        payout.AcNo,
        payout.mipContractNo,
        payout.Amount,
        payout.Status,
        payout.txid,
        payout.ToAddr,
        payout.account?.Parent,
        payout.account?.ClientID,
    ];

    return parts.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export function filterDayGroupsBySearch(groups: DayPayoutGroup[], query: string): DayPayoutGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) =>
        group.payouts.some((p) => payoutMatchesSearch(p, q)) ||
        group.voidPayouts.some((p) => payoutMatchesSearch(p, q)),
    );
}
