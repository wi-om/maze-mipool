import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getWalletTxns } from "../../api/services/walletService";
import { usePaginatedFetch } from "../../hooks/usePaginatedFetch";
import type { PaginatedListMeta } from "../../api/services/rewardService";
import DateTimeCell from "../../components/common/DateTimeCell";
import MetricCard from "../../components/common/MetricCard";
import PageHeader from "../../components/layout/PageHeader";
import { pageBreadcrumbs } from "../../config/breadcrumbs";
import { dashboardPanelClass } from "../../components/common/panelStyles";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SimpleDateRangePicker } from "../../components/ui/simple-date-range-picker";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../components/ui/table";
import { periodToDateRange, type RewardFilterPeriod } from "../../utils/rewardPeriodFilters";
import {
    groupWalletTxnsByDay,
    summaryTxnDate,
    type DayWalletTxnGroup,
} from "../../utils/walletTxnGroups";
import type { DateRange } from "react-day-picker";
import { ArrowDownRight, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, Eye, EyeOff, Search, Wallet } from "lucide-react";
import { toast } from "sonner";

const EMPTY_PAGINATION: PaginatedListMeta = {
    page: 1,
    limit: 10,
    totalDays: 0,
    totalRecords: 0,
    totalAmount: 0,
};

function fmtBtc(value: number, show: boolean, sign = false) {
    if (!show) return "••••••";
    const prefix = sign && value > 0 ? "+" : sign && value < 0 ? "" : "";
    return `${prefix}${value.toFixed(8)}`;
}

export default function WalletTxnPage() {
    const [showSensitiveData, setShowSensitiveData] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState<RewardFilterPeriod>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [pickerDateRange, setPickerDateRange] = useState<DateRange | undefined>();
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [txnType, setTxnType] = useState<"ALL" | "CREDIT" | "DEBIT">("ALL");
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    const dateRange = useMemo(
        () => periodToDateRange(filterPeriod, customDateRange),
        [filterPeriod, customDateRange],
    );

    const canFetch = filterPeriod !== "custom" || Boolean(customDateRange?.from);

    const buildFetchParams = useCallback(
        (page: number) => ({
            page,
            limit: itemsPerPage,
            ...dateRange,
            ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
            ...(txnType !== "ALL" ? { txnType } : {}),
        }),
        [itemsPerPage, dateRange, debouncedSearch, txnType],
    );

    const queryScope = useMemo(
        () =>
            [filterPeriod, customDateRange?.from?.toISOString() ?? "", debouncedSearch, txnType, itemsPerPage].join(
                "|",
            ),
        [filterPeriod, customDateRange, debouncedSearch, txnType, itemsPerPage],
    );

    const { data, pagination, loading, refresh, totalPages } = usePaginatedFetch({
        enabled: canFetch,
        fetchFn: getWalletTxns,
        buildParams: buildFetchParams,
        queryScope,
        currentPage,
        emptyPagination: EMPTY_PAGINATION,
    });

    useEffect(() => {
        setCurrentPage(1);
        setExpandedDays(new Set());
    }, [filterPeriod, customDateRange, debouncedSearch, txnType, itemsPerPage]);

    const dayGroups = useMemo(() => groupWalletTxnsByDay(data), [data]);

    const creditTotal = useMemo(
        () => data.filter((r) => r.txnType === "CREDIT").reduce((s, r) => s + r.amount, 0),
        [data],
    );
    const debitTotal = useMemo(
        () => data.filter((r) => r.txnType === "DEBIT").reduce((s, r) => s + r.amount, 0),
        [data],
    );

    const toggleDay = (dayKey: string) => {
        setExpandedDays((prev) => {
            const next = new Set(prev);
            if (next.has(dayKey)) next.delete(dayKey);
            else next.add(dayKey);
            return next;
        });
    };

    const copyTxid = (txid: string) => {
        navigator.clipboard.writeText(txid).then(() => toast.success("Txid copied"));
    };

    const renderTypeSummary = (group: DayWalletTxnGroup) => {
        if (group.creditCount > 0 && group.debitCount > 0) {
            return (
                <div className="flex flex-wrap gap-1">
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">{group.creditCount} CREDIT</Badge>
                    <Badge className="bg-rose-600 hover:bg-rose-600">{group.debitCount} DEBIT</Badge>
                </div>
            );
        }
        if (group.debitCount > 0) {
            return <Badge className="bg-rose-600 hover:bg-rose-600">DEBIT</Badge>;
        }
        return <Badge className="bg-emerald-600 hover:bg-emerald-600">CREDIT</Badge>;
    };

    const renderBreakdown = (group: DayWalletTxnGroup) => (
        <TableRow className="bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
            <TableCell colSpan={6} className="p-0">
                <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Transaction breakdown ({group.txnCount})
                    </p>
                    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/80">
                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-3 py-2 font-medium">AcNo</th>
                                    <th className="px-3 py-2 font-medium">Type</th>
                                    <th className="px-3 py-2 font-medium">Source</th>
                                    <th className="px-3 py-2 font-medium">Destination</th>
                                    <th className="px-3 py-2 font-medium">Reference</th>
                                    <th className="px-3 py-2 font-medium">Amount</th>
                                    <th className="px-3 py-2 font-medium">Balance</th>
                                    <th className="px-3 py-2 font-medium">Txid</th>
                                    <th className="px-3 py-2 font-medium">Remark</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.txns.map((row) => (
                                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                                        <td className="px-3 py-2 font-mono text-xs">{row.acNo}</td>
                                        <td className="px-3 py-2">
                                            <Badge
                                                className={
                                                    row.txnType === "CREDIT"
                                                        ? "bg-emerald-600 hover:bg-emerald-600"
                                                        : "bg-rose-600 hover:bg-rose-600"
                                                }
                                            >
                                                {row.txnType}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">{row.source}</td>
                                        <td className="px-3 py-2 font-mono text-xs max-w-[140px] truncate" title={row.destination}>
                                            {row.destination}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">{row.reference ?? "—"}</td>
                                        <td
                                            className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${
                                                row.txnType === "CREDIT" ? "text-emerald-600" : "text-rose-600"
                                            }`}
                                        >
                                            {fmtBtc(
                                                row.txnType === "CREDIT" ? row.amount : -row.amount,
                                                showSensitiveData,
                                                true,
                                            )}{" "}
                                            BTC
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                                            {showSensitiveData ? `${row.runningBalance.toFixed(8)} BTC` : "••••••"}
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.txid ? (
                                                <button
                                                    type="button"
                                                    className="font-mono text-xs text-brand-600 hover:underline"
                                                    title={row.txid}
                                                    onClick={() => copyTxid(row.txid!)}
                                                >
                                                    {row.txid.slice(0, 10)}…
                                                </button>
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-xs">{row.remark ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </TableCell>
        </TableRow>
    );

    const showingFrom = pagination.totalDays > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const showingTo = Math.min(currentPage * itemsPerPage, pagination.totalDays);

    return (
        <div className="space-y-6">
            <PageHeader title="Wallet Transactions" breadcrumbs={pageBreadcrumbs.walletTransactions}>
                <Button variant="outline" size="sm" onClick={() => setShowSensitiveData((v) => !v)}>
                    {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showSensitiveData ? "Hide" : "Show"} amounts
                </Button>
            </PageHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard title="Total records" value={pagination.totalRecords} icon={<BookOpen className="h-5 w-5" />} />
                <MetricCard title="Page credits" value={fmtBtc(creditTotal, showSensitiveData)} icon={<ArrowUpRight className="h-5 w-5" />} />
                <MetricCard title="Page debits" value={fmtBtc(debitTotal, showSensitiveData)} icon={<ArrowDownRight className="h-5 w-5" />} />
                <MetricCard title="Asset" value="Bitcoin (BTC)" icon={<Wallet className="h-5 w-5" />} />
            </div>

            <div className={`${dashboardPanelClass} overflow-hidden p-0`}>
                <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-9 items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <span>Show</span>
                            <select
                                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm leading-none outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                value={itemsPerPage}
                                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            >
                                {[10, 25, 50, 100].map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                            <span>days</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-start gap-3 sm:ml-auto sm:justify-end">
                        <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as RewardFilterPeriod)}>
                            <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder="Period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All time</SelectItem>
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="7days">Last 7 days</SelectItem>
                                <SelectItem value="30days">Last 30 days</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={txnType} onValueChange={(v) => setTxnType(v as typeof txnType)}>
                            <SelectTrigger className="w-[120px] h-9">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All types</SelectItem>
                                <SelectItem value="CREDIT">CREDIT</SelectItem>
                                <SelectItem value="DEBIT">DEBIT</SelectItem>
                            </SelectContent>
                        </Select>
                        {filterPeriod === "custom" && (
                            <>
                                <SimpleDateRangePicker date={pickerDateRange} onSelect={setPickerDateRange} />
                                <Button
                                    size="sm"
                                    className="h-9"
                                    onClick={() => {
                                        setCustomDateRange(pickerDateRange);
                                        setCurrentPage(1);
                                        refresh();
                                    }}
                                >
                                    Apply
                                </Button>
                            </>
                        )}
                        <div className="relative w-full min-w-[220px] sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="Search AcNo, source, destination, reference, txid…"
                                className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm leading-none text-gray-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto admin-scroll">
                    <Table>
                        <TableHeader className="bg-brand-50/60 dark:bg-brand-500/5">
                            <TableRow className="border-b border-gray-200 dark:border-gray-700">
                                <TableCell isHeader className="w-10 px-3 py-3" />
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Date
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Transactions
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Credits / Debits
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Type
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Actions
                                </TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-brand-600" />
                                            <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : !canFetch ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-gray-500 dark:text-gray-400">
                                        Select a date range and click Apply.
                                    </TableCell>
                                </TableRow>
                            ) : dayGroups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-gray-500 dark:text-gray-400">
                                        No wallet transactions yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                dayGroups.map((group) => {
                                    const expanded = expandedDays.has(group.dayKey);
                                    return (
                                        <Fragment key={group.dayKey}>
                                            <TableRow
                                                className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-brand-50/40 dark:border-gray-800 dark:hover:bg-brand-500/5"
                                                onClick={() => toggleDay(group.dayKey)}
                                            >
                                                <TableCell className="px-3 py-3 text-gray-500">
                                                    {expanded ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <DateTimeCell value={summaryTxnDate(group)} />
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {group.txnCount} transaction{group.txnCount === 1 ? "" : "s"}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex flex-col gap-0.5 text-sm font-mono">
                                                        {group.creditCount > 0 && (
                                                            <span className="text-emerald-600">
                                                                {showSensitiveData
                                                                    ? `+${group.totalCredit.toFixed(8)} BTC`
                                                                    : "••••••"}
                                                            </span>
                                                        )}
                                                        {group.debitCount > 0 && (
                                                            <span className="text-rose-600">
                                                                {showSensitiveData
                                                                    ? `−${group.totalDebit.toFixed(8)} BTC`
                                                                    : "••••••"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">{renderTypeSummary(group)}</TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleDay(group.dayKey);
                                                        }}
                                                    >
                                                        {expanded ? "Hide" : "View"}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {expanded && renderBreakdown(group)}
                                        </Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Showing {showingFrom} to {showingTo} of {pagination.totalDays} day
                            {pagination.totalDays === 1 ? "" : "s"}
                            {pagination.totalRecords > 0 && (
                                <span className="text-gray-400">
                                    {" "}
                                    ({pagination.totalRecords} transaction
                                    {pagination.totalRecords === 1 ? "" : "s"})
                                </span>
                            )}
                        </p>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1 || loading}
                                >
                                    Previous
                                </Button>
                                <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || loading}
                                >
                                    Next
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
