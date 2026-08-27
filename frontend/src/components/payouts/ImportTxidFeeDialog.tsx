import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
    addDays,
    differenceInCalendarDays,
    format,
    lastDayOfMonth,
    parseISO,
    startOfDay,
    startOfMonth,
    subDays,
} from "date-fns";
import {
    syncPayoutFeesFromPeriod,
    type SyncPayoutFeesFromPeriodResult,
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

type ImportTxidFeeDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImported?: () => void;
};

type Mode = "month" | "range" | "today" | "yesterday" | "last7" | "last14" | "last30";

type DayProgressStatus = "pending" | "running" | "done" | "skipped" | "error";

type DayProgress = {
    date: string;
    status: DayProgressStatus;
    message?: string;
    txids?: number;
    mapped?: number;
};

const MONTHS = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
];

const PRESETS: Array<{ mode: Mode; label: string }> = [
    { mode: "today", label: "Today" },
    { mode: "yesterday", label: "Yesterday" },
    { mode: "last7", label: "Last 7 days" },
    { mode: "last14", label: "Last 14 days" },
    { mode: "last30", label: "Last 30 days" },
];

function toYmd(d: Date): string {
    return format(d, "yyyy-MM-dd");
}

function rangeForPreset(mode: Mode, today = startOfDay(new Date())): { dateFrom: string; dateTo: string } {
    if (mode === "today") {
        return { dateFrom: toYmd(today), dateTo: toYmd(today) };
    }
    if (mode === "yesterday") {
        const y = subDays(today, 1);
        return { dateFrom: toYmd(y), dateTo: toYmd(y) };
    }
    if (mode === "last7") return { dateFrom: toYmd(subDays(today, 6)), dateTo: toYmd(today) };
    if (mode === "last14") return { dateFrom: toYmd(subDays(today, 13)), dateTo: toYmd(today) };
    if (mode === "last30") return { dateFrom: toYmd(subDays(today, 29)), dateTo: toYmd(today) };
    return { dateFrom: toYmd(today), dateTo: toYmd(today) };
}

function enumerateDays(dateFrom: string, dateTo: string): string[] {
    const start = parseISO(dateFrom);
    const end = parseISO(dateTo);
    const total = Math.max(0, differenceInCalendarDays(end, start));
    const days: string[] = [];
    for (let i = 0; i <= total; i++) {
        days.push(toYmd(addDays(start, i)));
    }
    return days;
}

export default function ImportTxidFeeDialog({ open, onOpenChange, onImported }: ImportTxidFeeDialogProps) {
    const now = new Date();
    const [mode, setMode] = useState<Mode>("month");
    const [dateFrom, setDateFrom] = useState(toYmd(startOfMonth(now)));
    const [dateTo, setDateTo] = useState(toYmd(lastDayOfMonth(now)));
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [month, setMonth] = useState(() => new Date().getMonth() + 1);
    const [loading, setLoading] = useState(false);
    const [alreadySyncedWarning, setAlreadySyncedWarning] = useState(false);
    const [preview, setPreview] = useState<SyncPayoutFeesFromPeriodResult | null>(null);
    const [dayProgress, setDayProgress] = useState<DayProgress[]>([]);
    const [activeDay, setActiveDay] = useState<string | null>(null);
    const [summary, setSummary] = useState<{
        txids: number;
        mappedRows: number;
        imported: number;
        errors: number;
    } | null>(null);

    const yearOptions = useMemo(() => {
        const y = new Date().getFullYear();
        return [y, y - 1, y - 2, y - 3];
    }, []);

    const resolvedRange = useMemo(() => {
        if (mode === "month") {
            const start = new Date(year, month - 1, 1);
            return { dateFrom: toYmd(startOfMonth(start)), dateTo: toYmd(lastDayOfMonth(start)) };
        }
        if (mode === "range") return { dateFrom, dateTo };
        return rangeForPreset(mode);
    }, [mode, year, month, dateFrom, dateTo]);

    const canSubmit =
        Boolean(resolvedRange.dateFrom) &&
        Boolean(resolvedRange.dateTo) &&
        resolvedRange.dateFrom <= resolvedRange.dateTo;

    const completedDays = dayProgress.filter((d) => d.status === "done" || d.status === "skipped" || d.status === "error").length;
    const progressPct = dayProgress.length ? Math.round((completedDays / dayProgress.length) * 100) : 0;
    // Only show dates that have payout txids (plus the day currently running).
    const visibleDayProgress = dayProgress.filter(
        (d) => d.status === "running" || (typeof d.txids === "number" && d.txids > 0),
    );

    const clearRunState = () => {
        setAlreadySyncedWarning(false);
        setPreview(null);
        setDayProgress([]);
        setActiveDay(null);
        setSummary(null);
    };

    const reset = () => {
        clearRunState();
    };

    const runDayByDaySync = async (force: boolean) => {
        const days = enumerateDays(resolvedRange.dateFrom, resolvedRange.dateTo);
        setDayProgress(days.map((date) => ({ date, status: "pending" })));
        setActiveDay(null);
        setSummary(null);
        setLoading(true);

        let txids = 0;
        let mappedRows = 0;
        let imported = 0;
        let errors = 0;
        let anyUpdate = false;

        try {
            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                setActiveDay(day);
                setDayProgress((prev) =>
                    prev.map((d) => (d.date === day ? { ...d, status: "running", message: "Syncing…" } : d)),
                );

                try {
                    const result = await syncPayoutFeesFromPeriod({
                        dateFrom: day,
                        dateTo: day,
                        force,
                    });

                    txids += result.txidsInPeriod;
                    mappedRows += result.updatedRows;
                    imported += result.blockchainImported;
                    errors += result.fetchErrors.length + result.notFoundFees.length;
                    if (result.updatedRows > 0) anyUpdate = true;

                    const skipped = result.txidsInPeriod === 0;
                    const alreadyOk = !force && result.alreadySynced;
                    setDayProgress((prev) =>
                        prev.map((d) =>
                            d.date === day
                                ? {
                                      date: day,
                                      status: skipped || alreadyOk ? "skipped" : result.fetchErrors.length ? "error" : "done",
                                      txids: result.txidsInPeriod,
                                      mapped: result.updatedRows,
                                      message: skipped
                                          ? "No payouts"
                                          : alreadyOk
                                            ? "Already synced"
                                            : result.updatedRows > 0
                                              ? `Mapped ${result.updatedRows} row(s)`
                                              : result.fetchErrors.length
                                                ? `${result.fetchErrors.length} fetch error(s)`
                                                : "Done",
                                  }
                                : d,
                        ),
                    );
                } catch (err: unknown) {
                    errors += 1;
                    const message =
                        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                        "Failed";
                    setDayProgress((prev) =>
                        prev.map((d) => (d.date === day ? { ...d, status: "error", message } : d)),
                    );
                }

                // Small pause so the date progress feels smooth in the UI
                await new Promise((r) => setTimeout(r, 80));
            }

            setSummary({ txids, mappedRows, imported, errors });
            if (anyUpdate) {
                toast.success(`Synced ${mappedRows} payout row(s) across the period`);
                onImported?.();
            } else if (txids === 0) {
                toast.warning("No complete payouts with txid found in that period");
            } else if (!force) {
                toast.message("Nothing new to map — fees already present");
            } else {
                toast.warning("Re-sync finished with no row updates");
            }
            setAlreadySyncedWarning(false);
        } finally {
            setLoading(false);
            setActiveDay(null);
        }
    };

    const handleSyncClick = async () => {
        if (!canSubmit) {
            toast.error("Select a valid period");
            return;
        }

        clearRunState();
        setLoading(true);
        try {
            const previewResult = await syncPayoutFeesFromPeriod({
                ...resolvedRange,
                previewOnly: true,
            });
            setPreview(previewResult);

            if (previewResult.txidsInPeriod === 0) {
                toast.warning("No complete payouts with txid found in that period");
                setLoading(false);
                return;
            }

            if (previewResult.alreadySynced) {
                setAlreadySyncedWarning(true);
                setLoading(false);
                return;
            }

            setLoading(false);
            await runDayByDaySync(false);
        } catch (error: unknown) {
            setLoading(false);
            const message =
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                "Failed to check sync status";
            toast.error(message);
        }
    };

    const handleResync = async () => {
        setAlreadySyncedWarning(false);
        await runDayByDaySync(true);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    if (loading) return;
                    reset();
                }
                onOpenChange(next);
            }}
        >
            <DialogContent className="w-full max-w-[min(96vw,640px)] rounded-md border border-gray-200 p-0 shadow-none dark:border-gray-700">
                <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                    <DialogHeader className="mb-0">
                        <DialogTitle>Sync blockchain and txid fees</DialogTitle>
                        <DialogDescription>
                            Select a period. Loads txids from payouts, fetches each via{" "}
                            <span className="font-mono">blockchain.info/rawtx</span>, saves into the blockchain
                            tables, then maps fees onto payout rows. Amount is not changed.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="max-h-[min(70vh,560px)] space-y-4 overflow-y-auto px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant={mode === "month" ? "default" : "outline"}
                            className="shadow-none"
                            onClick={() => {
                                setMode("month");
                                clearRunState();
                            }}
                            disabled={loading}
                        >
                            By month
                        </Button>
                        <Button
                            type="button"
                            variant={mode === "range" ? "default" : "outline"}
                            className="shadow-none"
                            onClick={() => {
                                setMode("range");
                                clearRunState();
                            }}
                            disabled={loading}
                        >
                            Date range
                        </Button>
                        {PRESETS.map((p) => (
                            <Button
                                key={p.mode}
                                type="button"
                                variant={mode === p.mode ? "default" : "outline"}
                                className="shadow-none"
                                onClick={() => {
                                    setMode(p.mode);
                                    clearRunState();
                                }}
                                disabled={loading}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>

                    {mode === "month" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1.5 text-sm">
                                <span className="text-gray-600 dark:text-gray-300">Year</span>
                                <select
                                    value={year}
                                    onChange={(e) => {
                                        setYear(Number(e.target.value));
                                        clearRunState();
                                    }}
                                    disabled={loading}
                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                >
                                    {yearOptions.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-1.5 text-sm">
                                <span className="text-gray-600 dark:text-gray-300">Month</span>
                                <select
                                    value={month}
                                    onChange={(e) => {
                                        setMonth(Number(e.target.value));
                                        clearRunState();
                                    }}
                                    disabled={loading}
                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                >
                                    {MONTHS.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    ) : null}

                    {mode === "range" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1.5 text-sm">
                                <span className="text-gray-600 dark:text-gray-300">From</span>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => {
                                        setDateFrom(e.target.value);
                                        clearRunState();
                                    }}
                                    disabled={loading}
                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                />
                            </label>
                            <label className="space-y-1.5 text-sm">
                                <span className="text-gray-600 dark:text-gray-300">To</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => {
                                        setDateTo(e.target.value);
                                        clearRunState();
                                    }}
                                    disabled={loading}
                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                />
                            </label>
                        </div>
                    ) : null}

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Period: <span className="font-mono">{resolvedRange.dateFrom}</span>
                        {" → "}
                        <span className="font-mono">{resolvedRange.dateTo}</span>
                    </p>

                    {alreadySyncedWarning && preview ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <div className="space-y-2">
                                    <p className="font-medium text-amber-800 dark:text-amber-200">
                                        Data already synced for this period
                                    </p>
                                    <p className="text-amber-700/90 dark:text-amber-200/80">
                                        All {preview.txidsInPeriod} txid(s) already have fees. You can close, or
                                        re-sync to fetch from chain again and overwrite fees.
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 shadow-none"
                                            disabled={loading}
                                            onClick={() => setAlreadySyncedWarning(false)}
                                        >
                                            Keep as is
                                        </Button>
                                        <Button
                                            type="button"
                                            className="h-8 shadow-none"
                                            disabled={loading}
                                            onClick={handleResync}
                                        >
                                            Re-sync again
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {dayProgress.length > 0 ? (
                        <div className="space-y-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="font-medium text-gray-800 dark:text-gray-100">
                                    {loading
                                        ? activeDay
                                            ? `Syncing ${activeDay}…`
                                            : "Preparing…"
                                        : "Sync finished"}
                                </span>
                                <span className="tabular-nums text-gray-500">
                                    {completedDays}/{dayProgress.length} days · {progressPct}%
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                    className="h-full rounded-full bg-brand-500 transition-all duration-300 ease-out"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                            <div className="max-h-44 space-y-1 overflow-y-auto pr-1 text-xs">
                                {visibleDayProgress.length === 0 && !loading ? (
                                    <p className="px-1.5 py-1 text-gray-500">No dates with payout txids in this period.</p>
                                ) : null}
                                {visibleDayProgress.map((d) => (
                                    <div
                                        key={d.date}
                                        className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-gray-600 dark:text-gray-300"
                                    >
                                        <span className="flex items-center gap-1.5 font-mono">
                                            {d.status === "running" ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                                            ) : d.status === "done" ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                            ) : d.status === "error" ? (
                                                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                            ) : (
                                                <span className="inline-block h-3.5 w-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                                            )}
                                            {d.date}
                                        </span>
                                        <span className="truncate text-right text-gray-500">{d.message || d.status}</span>
                                    </div>
                                ))}
                            </div>
                            {summary ? (
                                <div className="border-t border-gray-200 pt-2 text-sm dark:border-gray-700">
                                    <p>
                                        <span className="font-medium">Txids:</span> {summary.txids}
                                    </p>
                                    <p>
                                        <span className="font-medium">Blockchain imported:</span> {summary.imported}
                                    </p>
                                    <p>
                                        <span className="font-medium">Fees mapped:</span> {summary.mappedRows} row(s)
                                    </p>
                                    {summary.errors > 0 ? (
                                        <p className="text-amber-600">Issues: {summary.errors}</p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <DialogFooter className="border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Close
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSyncClick}
                        disabled={loading || !canSubmit || alreadySyncedWarning}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Syncing…
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Sync blockchain and txid fees
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
