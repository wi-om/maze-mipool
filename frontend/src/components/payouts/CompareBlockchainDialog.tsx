import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
    compareBlockchainPayouts,
    type BlockchainCompareMonth,
    type BlockchainCompareResult,
    type BlockchainCompareRow,
    type BlockchainCompareStatus,
} from "../../api/services/payoutService";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";

type CompareBlockchainDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

type ViewMode = "txid" | "month";
type StatusFilter = "all" | "issues";

const STATUS_LABEL: Record<BlockchainCompareStatus, string> = {
    match: "Match",
    amount_mismatch: "Amount differs",
    fee_mismatch: "Fee differs",
    count_mismatch: "Count differs",
    missing_in_payouts: "Missing in Payouts",
    missing_in_blockchain: "Missing in Blockchain",
    same_day_txid_mismatch: "Different txid same day",
};

const STATUS_BADGE: Record<BlockchainCompareStatus, string> = {
    match: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amount_mismatch: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    fee_mismatch: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    count_mismatch: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    missing_in_payouts: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    missing_in_blockchain: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    same_day_txid_mismatch: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const ROW_HIGHLIGHT: Record<BlockchainCompareStatus, string> = {
    match: "",
    amount_mismatch: "bg-red-50/70 dark:bg-red-950/30",
    fee_mismatch: "bg-amber-50/70 dark:bg-amber-950/30",
    count_mismatch: "bg-orange-50/70 dark:bg-orange-950/30",
    missing_in_payouts: "bg-purple-50/70 dark:bg-purple-950/30",
    missing_in_blockchain: "bg-blue-50/70 dark:bg-blue-950/30",
    same_day_txid_mismatch: "bg-rose-50/80 dark:bg-rose-950/40 ring-1 ring-inset ring-rose-200 dark:ring-rose-800",
};

function fmtBtc(value: number | null): string {
    if (value == null) return "—";
    return value.toFixed(8);
}

function fmtDiff(value: number): string {
    if (value === 0) return "0.00000000";
    return `${value > 0 ? "+" : ""}${value.toFixed(8)}`;
}

function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
    });
}

function fmtMonth(month: string): string {
    const [y, m] = month.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function truncateTxid(txid: string): string {
    if (txid.length <= 16) return txid;
    return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function buildIssuesExport(rows: BlockchainCompareRow[]): string {
    const issues = rows.filter((r) => r.status !== "match");
    const lines = [
        "txid,status,payout_gross,blockchain_gross,gross_diff,payout_date,blockchain_date,conflicting_txids",
        ...issues.map((r) =>
            [
                r.txid,
                r.status,
                r.payoutGross ?? "",
                r.blockchainGross ?? "",
                r.grossDiff,
                r.payoutDate?.slice(0, 10) ?? "",
                r.blockchainDate?.slice(0, 10) ?? "",
                r.sameDayConflictTxids.join(";"),
            ].join(","),
        ),
        "",
        "# comma-separated issue txids:",
        issues.map((r) => r.txid).join(","),
    ];
    return lines.join("\n");
}

export default function CompareBlockchainDialog({ open, onOpenChange }: CompareBlockchainDialogProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BlockchainCompareResult | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("issues");
    const [viewMode, setViewMode] = useState<ViewMode>("txid");
    const [monthFilter, setMonthFilter] = useState<string>("all");

    const runCompare = async () => {
        setLoading(true);
        try {
            const data = await compareBlockchainPayouts();
            setResult(data);
        } catch (error: unknown) {
            const message =
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                "Failed to compare payouts";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && !result) {
            runCompare();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const availableMonths = useMemo(() => result?.months.map((m) => m.month) ?? [], [result]);

    const filteredRows = useMemo(() => {
        let all = result?.rows ?? [];
        if (monthFilter !== "all") {
            all = all.filter(
                (r) =>
                    r.date?.startsWith(monthFilter) ||
                    r.payoutDate?.startsWith(monthFilter) ||
                    r.blockchainDate?.startsWith(monthFilter),
            );
        }
        if (statusFilter === "issues") return all.filter((r) => r.status !== "match");
        return all;
    }, [result, statusFilter, monthFilter]);

    const filteredMonths = useMemo(() => {
        const all = result?.months ?? [];
        if (monthFilter === "all") return all;
        return all.filter((m) => m.month === monthFilter);
    }, [result, monthFilter]);

    const summary = result?.summary;

    const handleDownloadIssues = () => {
        if (!result?.rows.length) return;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const content = buildIssuesExport(
            monthFilter === "all"
                ? result.rows
                : result.rows.filter(
                      (r) =>
                          r.date?.startsWith(monthFilter) ||
                          r.payoutDate?.startsWith(monthFilter) ||
                          r.blockchainDate?.startsWith(monthFilter),
                  ),
        );
        downloadTextFile(`payout-blockchain-compare-issues-${stamp}.txt`, content);
        toast.success("Issues exported");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-[min(97vw,1150px)] rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700">
                <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                    <DialogHeader className="mb-0">
                        <DialogTitle>Compare Payouts vs Blockchain</DialogTitle>
                        <DialogDescription>
                            Compare <span className="font-mono">Payouts</span> against{" "}
                            <span className="font-mono">blockchain_payout</span> by transaction or by month.
                            Highlights missing entries, amount differences, and days where both sides used
                            different txids.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {summary ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                            <SummaryCard label="Total txids" value={summary.total} tone="neutral" />
                            <SummaryCard label="Matched" value={summary.matched} tone="green" />
                            <SummaryCard label="Amount/fee/count" value={summary.mismatched} tone="red" />
                            <SummaryCard label="Missing in Payouts" value={summary.missingInPayouts} tone="purple" />
                            <SummaryCard
                                label="Missing in Blockchain"
                                value={summary.missingInBlockchain}
                                tone="blue"
                            />
                            <SummaryCard
                                label="Same-day txid diff"
                                value={summary.sameDayTxidMismatches}
                                tone="rose"
                            />
                        </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={viewMode === "txid" ? "default" : "outline"}
                                onClick={() => setViewMode("txid")}
                            >
                                By txid
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={viewMode === "month" ? "default" : "outline"}
                                onClick={() => setViewMode("month")}
                            >
                                By month
                            </Button>
                            <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
                            <Button
                                type="button"
                                size="sm"
                                variant={statusFilter === "all" ? "default" : "outline"}
                                onClick={() => setStatusFilter("all")}
                            >
                                All
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={statusFilter === "issues" ? "default" : "outline"}
                                onClick={() => setStatusFilter("issues")}
                            >
                                Issues only
                            </Button>
                            {availableMonths.length > 0 ? (
                                <select
                                    className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                                    value={monthFilter}
                                    onChange={(e) => setMonthFilter(e.target.value)}
                                >
                                    <option value="all">All months</option>
                                    {availableMonths.map((m) => (
                                        <option key={m} value={m}>
                                            {fmtMonth(m)}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleDownloadIssues}
                                disabled={!result?.rows.length}
                                className="shadow-none"
                            >
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                Export issues .txt
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={runCompare}
                                disabled={loading}
                                className="shadow-none"
                            >
                                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                {loading ? "Comparing…" : "Re-run"}
                            </Button>
                        </div>
                    </div>

                    <div className="max-h-[52vh] overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
                        {viewMode === "month" ? (
                            <MonthTable months={filteredMonths} loading={loading && !result} />
                        ) : (
                            <TxidTable rows={filteredRows} loading={loading && !result} />
                        )}
                    </div>
                </div>

                <DialogFooter className="border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TxidTable({ rows, loading }: { rows: BlockchainCompareRow[]; loading: boolean }) {
    return (
        <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">TXID</th>
                    <th className="px-3 py-2 text-right font-medium">Payout gross</th>
                    <th className="px-3 py-2 text-right font-medium">Blockchain gross</th>
                    <th className="px-3 py-2 text-right font-medium">Diff</th>
                    <th className="px-3 py-2 text-center font-medium">Recipients (P / B)</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr>
                        <td colSpan={7} className="h-40 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-brand-600" />
                                Comparing…
                            </div>
                        </td>
                    </tr>
                ) : rows.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="h-32 text-center text-gray-500">
                            No transactions to show
                        </td>
                    </tr>
                ) : (
                    rows.map((row) => <CompareRow key={row.txid} row={row} />)
                )}
            </tbody>
        </table>
    );
}

function MonthTable({ months, loading }: { months: BlockchainCompareMonth[]; loading: boolean }) {
    return (
        <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Payout gross</th>
                    <th className="px-3 py-2 text-right font-medium">Blockchain gross</th>
                    <th className="px-3 py-2 text-right font-medium">Diff</th>
                    <th className="px-3 py-2 text-right font-medium">Payout fees</th>
                    <th className="px-3 py-2 text-right font-medium">Blockchain fees</th>
                    <th className="px-3 py-2 text-center font-medium">Txids (ok / issues)</th>
                    <th className="px-3 py-2 text-center font-medium">Same-day txid</th>
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr>
                        <td colSpan={8} className="h-40 text-center text-gray-500">
                            Comparing…
                        </td>
                    </tr>
                ) : months.length === 0 ? (
                    <tr>
                        <td colSpan={8} className="h-32 text-center text-gray-500">
                            No months to show
                        </td>
                    </tr>
                ) : (
                    months.map((m) => {
                        const hasIssue = m.issueCount > 0 || Math.abs(m.grossDiff) > 1e-8;
                        const diffTone =
                            m.grossDiff === 0
                                ? "text-gray-400"
                                : m.grossDiff > 0
                                  ? "text-emerald-600"
                                  : "text-red-600";
                        return (
                            <tr
                                key={m.month}
                                className={`border-t border-gray-100 dark:border-gray-800 ${
                                    hasIssue ? "bg-amber-50/50 dark:bg-amber-950/20" : ""
                                }`}
                            >
                                <td className="px-3 py-2 font-medium">{fmtMonth(m.month)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs">{fmtBtc(m.payoutGross)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs">
                                    {fmtBtc(m.blockchainGross)}
                                </td>
                                <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${diffTone}`}>
                                    {fmtDiff(m.grossDiff)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-xs">{fmtBtc(m.payoutFee)}</td>
                                <td className="px-3 py-2 text-right font-mono text-xs">{fmtBtc(m.blockchainFee)}</td>
                                <td className="px-3 py-2 text-center text-xs">
                                    <span className="text-emerald-600">{m.matchedCount}</span>
                                    {" / "}
                                    <span className={m.issueCount > 0 ? "font-semibold text-red-600" : "text-gray-400"}>
                                        {m.issueCount}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                    {m.sameDayTxidMismatches > 0 ? (
                                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                                            {m.sameDayTxidMismatches}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
        </table>
    );
}

function CompareRow({ row }: { row: BlockchainCompareRow }) {
    const diffTone =
        row.grossDiff === 0 ? "text-gray-400" : row.grossDiff > 0 ? "text-emerald-600" : "text-red-600";

    const payoutDay = row.payoutDate?.slice(0, 10);
    const blockchainDay = row.blockchainDate?.slice(0, 10);
    const dateMismatch =
        payoutDay && blockchainDay && payoutDay !== blockchainDay && row.status !== "missing_in_payouts";

    return (
        <tr className={`border-t border-gray-100 dark:border-gray-800 ${ROW_HIGHLIGHT[row.status]}`}>
            <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                <div>{fmtDate(row.date)}</div>
                {dateMismatch ? (
                    <div className="mt-0.5 text-[10px] text-rose-600">
                        P: {payoutDay} / B: {blockchainDay}
                    </div>
                ) : null}
            </td>
            <td className="px-3 py-2">
                <a
                    href={`https://mempool.space/tx/${row.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-600 hover:underline"
                >
                    {truncateTxid(row.txid)}
                </a>
                {row.sameDayConflictTxids.length > 0 ? (
                    <p className="mt-1 text-[10px] text-rose-700 dark:text-rose-400">
                        Same day: {row.sameDayConflictTxids.map((t) => truncateTxid(t)).join(", ")}
                    </p>
                ) : null}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs">{fmtBtc(row.payoutGross)}</td>
            <td className="px-3 py-2 text-right font-mono text-xs">{fmtBtc(row.blockchainGross)}</td>
            <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${diffTone}`}>
                {fmtDiff(row.grossDiff)}
            </td>
            <td className="px-3 py-2 text-center font-mono text-xs">
                {row.payoutCount ?? "—"} / {row.blockchainCount ?? "—"}
            </td>
            <td className="px-3 py-2">
                <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                >
                    {STATUS_LABEL[row.status]}
                </span>
            </td>
        </tr>
    );
}

function SummaryCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: "neutral" | "green" | "red" | "purple" | "blue" | "rose";
}) {
    const toneClass = {
        neutral: "text-gray-700 dark:text-gray-200",
        green: "text-emerald-600",
        red: "text-red-600",
        purple: "text-purple-600",
        blue: "text-blue-600",
        rose: "text-rose-600",
    }[tone];

    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-0.5 text-lg font-semibold ${toneClass}`}>{value}</p>
        </div>
    );
}
