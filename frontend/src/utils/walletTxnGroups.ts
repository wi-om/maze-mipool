import type { WalletTxnEntry } from "../api/services/walletService";

export type DayWalletTxnGroup = {
    dayKey: string;
    date: Date;
    txns: WalletTxnEntry[];
    txnCount: number;
    creditCount: number;
    debitCount: number;
    totalCredit: number;
    totalDebit: number;
    netAmount: number;
};

function dayKeyFromDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function txnDayKey(txn: WalletTxnEntry): string | null {
    const raw = txn.workDate ?? txn.createdOn;
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return dayKeyFromDate(date);
}

export function groupWalletTxnsByDay(txns: WalletTxnEntry[]): DayWalletTxnGroup[] {
    const map = new Map<string, WalletTxnEntry[]>();

    for (const txn of txns) {
        const key = txnDayKey(txn);
        if (!key) continue;
        const list = map.get(key) ?? [];
        list.push(txn);
        map.set(key, list);
    }

    return [...map.entries()]
        .map(([dayKey, items]) => {
            const sorted = [...items].sort(
                (a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime(),
            );
            const [y, m, d] = dayKey.split("-").map(Number);
            const totalCredit = sorted
                .filter((t) => t.txnType === "CREDIT")
                .reduce((sum, t) => sum + t.amount, 0);
            const totalDebit = sorted
                .filter((t) => t.txnType === "DEBIT")
                .reduce((sum, t) => sum + t.amount, 0);

            return {
                dayKey,
                date: new Date(y, m - 1, d),
                txns: sorted,
                txnCount: sorted.length,
                creditCount: sorted.filter((t) => t.txnType === "CREDIT").length,
                debitCount: sorted.filter((t) => t.txnType === "DEBIT").length,
                totalCredit,
                totalDebit,
                netAmount: totalCredit - totalDebit,
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function summaryTxnDate(group: DayWalletTxnGroup): string {
    return group.dayKey;
}
