import type { BlockchainPayoutRow } from "../api/services/blockchainDataService";

export type BlockchainGroupBy = "day" | "month" | "year";

export type DayBlockchainGroup = {
    dayKey: string;
    date: Date;
    totalAmount: number;
    rows: BlockchainPayoutRow[];
    txids: string[];
    rowCount: number;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function periodKeyFromDate(date: Date, groupBy: BlockchainGroupBy): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    if (groupBy === "year") return String(y);
    if (groupBy === "month") return `${y}-${m}`;
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function dateFromPeriodKey(periodKey: string, groupBy: BlockchainGroupBy): Date {
    if (groupBy === "year") return new Date(Number(periodKey), 0, 1);
    if (groupBy === "month") {
        const [y, m] = periodKey.split("-").map(Number);
        return new Date(y, m - 1, 1);
    }
    const [y, m, d] = periodKey.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function formatBlockchainPeriodLabel(periodKey: string, groupBy: BlockchainGroupBy): string {
    if (!periodKey) return "—";
    if (groupBy === "year") return periodKey;
    if (groupBy === "month") {
        const [year, month] = periodKey.split("-");
        const idx = Number(month) - 1;
        return `${MONTH_NAMES[idx] ?? month} ${year}`;
    }
    return periodKey;
}

function groupBlockchain(rows: BlockchainPayoutRow[], groupBy: BlockchainGroupBy): DayBlockchainGroup[] {
    const map = new Map<string, BlockchainPayoutRow[]>();

    for (const row of rows) {
        if (!row.txnDate) continue;
        const created = new Date(row.txnDate);
        if (Number.isNaN(created.getTime())) continue;
        const key = periodKeyFromDate(created, groupBy);
        const list = map.get(key) ?? [];
        list.push(row);
        map.set(key, list);
    }

    return [...map.entries()]
        .map(([dayKey, items]) => {
            const sorted = [...items].sort(
                (a, b) => new Date(b.txnDate ?? 0).getTime() - new Date(a.txnDate ?? 0).getTime(),
            );
            const txids = [...new Set(sorted.map((r) => r.txid?.trim()).filter(Boolean) as string[])];
            return {
                dayKey,
                date: dateFromPeriodKey(dayKey, groupBy),
                totalAmount: sorted.reduce((sum, r) => sum + Number(r.amount || 0), 0),
                rows: sorted,
                txids,
                rowCount: sorted.length,
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function groupBlockchainByDay(rows: BlockchainPayoutRow[]): DayBlockchainGroup[] {
    return groupBlockchain(rows, "day");
}

export function groupBlockchainByMonth(rows: BlockchainPayoutRow[]): DayBlockchainGroup[] {
    return groupBlockchain(rows, "month");
}

export function groupBlockchainByYear(rows: BlockchainPayoutRow[]): DayBlockchainGroup[] {
    return groupBlockchain(rows, "year");
}

export function blockchainRowMatchesSearch(row: BlockchainPayoutRow, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const parts = [
        row.id,
        row.txid,
        row.acNo,
        row.mipContractNo,
        row.address,
        row.amount,
        row.status,
        row.source,
    ];

    return parts.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export function filterDayGroupsBySearch(groups: DayBlockchainGroup[], query: string): DayBlockchainGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.rows.some((r) => blockchainRowMatchesSearch(r, q)));
}
