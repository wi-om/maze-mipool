import { Fragment, useEffect, useMemo, useState } from "react";
import {
    getAllPayouts,
    getPayoutTxnSummary,
    type Payout,
    type PayoutTxnSummary,
} from "../../api/services/payoutService";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SimpleDateRangePicker } from "../../components/ui/simple-date-range-picker";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../components/ui/table";
import { dashboardPanelClass } from "../../components/common/panelStyles";
import DateTimeCell from "../../components/common/DateTimeCell";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    Eye,
    EyeOff,
    Search,
} from "lucide-react";
import {
    filterDayGroupsBySearch,
    formatPayoutPeriodLabel,
    groupPayoutsByDay,
    groupPayoutsByMonth,
    groupPayoutsByYear,
    isCompletePayoutStatus,
    isVoidPayout,
    type DayPayoutGroup,
    type PayoutGroupBy,
} from "../../utils/payoutHistoryGroups";

type FilterPeriod =
    | "today"
    | "yesterday"
    | "7days"
    | "30days"
    | "quarterly"
    | "yearly"
    | "all"
    | "custom"
    | "by-month"
    | "by-year";

type PayoutHistoryPageProps = {
    showSensitiveData?: boolean;
    onShowSensitiveDataChange?: (value: boolean) => void;
    onFilteredTotalAmountChange?: (total: number) => void;
    onLoadingChange?: (loading: boolean) => void;
    reloadToken?: number;
};

function summaryTimestamp(group: DayPayoutGroup): string | null {
    return group.payouts[0]?.CreatedOn ?? group.voidPayouts[0]?.CreatedOn ?? null;
}

function truncateTxid(txid: string, head = 6, tail = 4): string {
    if (txid.length <= head + tail + 3) return txid;
    return `${txid.slice(0, head)}...${txid.slice(-tail)}`;
}

function copyText(label: string, value: string) {
    navigator.clipboard.writeText(value).then(
        () => toast.success(`${label} copied`),
        () => toast.error(`Failed to copy ${label}`),
    );
}

export default function PayoutHistoryPage({
    showSensitiveData: showSensitiveDataProp,
    onShowSensitiveDataChange,
    onFilteredTotalAmountChange,
    onLoadingChange,
    reloadToken = 0,
}: PayoutHistoryPageProps = {}) {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [txnSummary, setTxnSummary] = useState<PayoutTxnSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [pickerDateRange, setPickerDateRange] = useState<DateRange | undefined>();
    const [showSensitiveDataInternal, setShowSensitiveDataInternal] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

    const showSensitiveData = showSensitiveDataProp ?? showSensitiveDataInternal;
    const setShowSensitiveData = onShowSensitiveDataChange ?? setShowSensitiveDataInternal;

    const groupBy: PayoutGroupBy =
        filterPeriod === "by-month" ? "month" : filterPeriod === "by-year" ? "year" : "day";
    const isGrouped = groupBy !== "day";
    const unitLabel = groupBy === "month" ? "months" : groupBy === "year" ? "years" : "days";

    useEffect(() => {
        const fetchPayouts = async () => {
            try {
                setLoading(true);
                onLoadingChange?.(true);
                const [data, summary] = await Promise.all([
                    getAllPayouts(),
                    getPayoutTxnSummary().catch(() => [] as PayoutTxnSummary[]),
                ]);
                setPayouts(Array.isArray(data) ? data : (data as any).data || []);
                setTxnSummary(Array.isArray(summary) ? summary : []);
            } catch (error) {
                console.error("Failed to fetch payouts", error);
            } finally {
                setLoading(false);
                onLoadingChange?.(false);
            }
        };
        fetchPayouts();
    }, [reloadToken, onLoadingChange]);

    const getFilteredData = (data: Payout[], period: FilterPeriod) => {
        if (period === "all" || period === "by-month" || period === "by-year") return data;
        const today = new Date();
        const cutoffDate = new Date(today);

        switch (period) {
            case "today":
                cutoffDate.setHours(0, 0, 0, 0);
                break;
            case "yesterday":
                cutoffDate.setDate(today.getDate() - 1);
                cutoffDate.setHours(0, 0, 0, 0);
                const yesterdayEnd = new Date(cutoffDate);
                yesterdayEnd.setDate(cutoffDate.getDate() + 1);
                yesterdayEnd.setMilliseconds(-1);
                return data.filter((item) => {
                    const date = item.CreatedOn ? new Date(item.CreatedOn) : null;
                    return date && date >= cutoffDate && date < yesterdayEnd;
                });
            case "7days":
                cutoffDate.setDate(today.getDate() - 7);
                break;
            case "30days":
                cutoffDate.setDate(today.getDate() - 30);
                break;
            case "quarterly":
                cutoffDate.setMonth(today.getMonth() - 3);
                break;
            case "yearly":
                cutoffDate.setFullYear(today.getFullYear() - 1);
                break;
            case "custom":
                if (customDateRange?.from) {
                    const fromDate = new Date(customDateRange.from);
                    fromDate.setHours(0, 0, 0, 0);
                    const toDate = customDateRange.to ? new Date(customDateRange.to) : new Date(fromDate);
                    toDate.setHours(23, 59, 59, 999);
                    return data.filter((item) => {
                        const date = item.CreatedOn ? new Date(item.CreatedOn) : null;
                        return date && date >= fromDate && date <= toDate;
                    });
                }
                return data;
        }

        return data.filter((item) => {
            const date = item.CreatedOn ? new Date(item.CreatedOn) : null;
            return date && date >= cutoffDate;
        });
    };

    useEffect(() => {
        onLoadingChange?.(loading);
    }, [loading, onLoadingChange]);

    const filteredPayouts = useMemo(
        () => getFilteredData(payouts, filterPeriod),
        [payouts, filterPeriod, customDateRange],
    );

    const dayGroups = useMemo(() => {
        const grouped =
            groupBy === "month"
                ? groupPayoutsByMonth(filteredPayouts)
                : groupBy === "year"
                  ? groupPayoutsByYear(filteredPayouts)
                  : groupPayoutsByDay(filteredPayouts);
        return filterDayGroupsBySearch(grouped, searchQuery);
    }, [filteredPayouts, searchQuery, groupBy]);

    const feeByTxid = useMemo(() => {
        const map = new Map<string, number>();
        for (const t of txnSummary) {
            if (t.txid) map.set(t.txid.trim(), Number(t.txidFee || 0));
        }
        return map;
    }, [txnSummary]);

    // On-chain fee for a day = sum of the single fee of each distinct txid that day (never per-recipient).
    const dayFee = (group: DayPayoutGroup): number =>
        group.txids.reduce((sum, txid) => sum + (feeByTxid.get(txid.trim()) ?? 0), 0);

    const totalAmount = filteredPayouts.reduce((sum, p) => sum + Number(p.Amount || 0), 0);
    const totalFee = dayGroups.reduce((sum, g) => sum + dayFee(g), 0);
    // Gross = net paid to recipients + network fee
    const totalNet = totalAmount;
    const totalGross = totalNet + totalFee;

    useEffect(() => {
        onFilteredTotalAmountChange?.(totalGross);
    }, [totalGross, onFilteredTotalAmountChange]);

    useEffect(() => {
        setCurrentPage(1);
        setExpandedDays(new Set());
    }, [searchQuery, filterPeriod, customDateRange, itemsPerPage, filteredPayouts.length]);

    const totalPages = Math.max(1, Math.ceil(dayGroups.length / itemsPerPage));
    const paginatedGroups = dayGroups.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const toggleDay = (dayKey: string) => {
        setExpandedDays((prev) => {
            const next = new Set(prev);
            if (next.has(dayKey)) next.delete(dayKey);
            else next.add(dayKey);
            return next;
        });
    };

    const renderTxidCell = (group: DayPayoutGroup) => {
        if (!group.txids.length) return <span className="text-gray-400">—</span>;

        if (group.txids.length === 1) {
            const txid = group.txids[0];
            return (
                <div className="flex items-center gap-1.5">
                    <a
                        href={`https://mempool.space/tx/${txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {truncateTxid(txid)}
                    </a>
                    <button
                        type="button"
                        className="text-gray-400 hover:text-gray-700"
                        onClick={(e) => {
                            e.stopPropagation();
                            copyText("Transaction ID", txid);
                        }}
                        aria-label="Copy transaction ID"
                    >
                        <Copy className="h-3.5 w-3.5" />
                    </button>
                </div>
            );
        }

        return (
            <span className="text-xs text-gray-600 dark:text-gray-300">
                {group.txids.length} transactions
            </span>
        );
    };

    const renderStatusBadge = (group: DayPayoutGroup) => {
        if (group.payoutCount === 0 && group.voidCount > 0) {
            return <Badge variant="secondary">Void</Badge>;
        }
        if (group.voidCount > 0) {
            return <Badge variant="secondary">Mixed</Badge>;
        }
        const allComplete = group.payouts.every((p) => isCompletePayoutStatus(p.Status));
        return (
            <Badge variant={allComplete ? "default" : "secondary"}>
                {allComplete ? "Success" : "Mixed"}
            </Badge>
        );
    };

    const renderPayoutRow = (payout: Payout) => {
        const voided = isVoidPayout(payout.Status);
        return (
        <tr
            key={payout.Id}
            className={`border-t border-gray-100 dark:border-gray-800 ${
                voided ? "bg-amber-50/50 dark:bg-amber-500/5" : ""
            }`}
        >
            <td className="px-3 py-2 font-mono text-xs">#{payout.mipContractNo}</td>
            <td className="px-3 py-2 text-xs">
                {payout.account?.Parent || payout.account?.ClientID || "—"}
            </td>
            <td className="px-3 py-2">
                {payout.ToAddr ? (
                    <div className="flex items-start gap-1.5">
                        <span className="font-mono text-xs break-all">{payout.ToAddr}</span>
                        <button
                            type="button"
                            className="text-gray-400 hover:text-gray-700"
                            onClick={() => copyText("BTC address", payout.ToAddr!)}
                            aria-label="Copy BTC address"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : (
                    "—"
                )}
            </td>
            <td
                className={`px-3 py-2 font-semibold whitespace-nowrap ${
                    voided
                        ? "text-amber-700 line-through dark:text-amber-400"
                        : "text-brand-600"
                }`}
            >
                {showSensitiveData ? `BTC ${Number(payout.Amount || 0).toFixed(8)}` : "••••••"}
            </td>
            <td className="px-3 py-2">
                {voided ? (
                    <Badge variant="secondary">Void</Badge>
                ) : (
                    <Badge variant={isCompletePayoutStatus(payout.Status) ? "default" : "secondary"}>
                        {isCompletePayoutStatus(payout.Status) ? "Success" : payout.Status || "—"}
                    </Badge>
                )}
            </td>
        </tr>
        );
    };

    const renderBreakdown = (group: DayPayoutGroup) => {
        const subGroups = isGrouped ? groupPayoutsByDay(group.payouts) : null;
        const totalRows = group.payouts.length;

        const breakdownTitle = isGrouped
            ? `Daily breakdown (${totalRows} payouts across ${subGroups?.length ?? 0} days)`
            : `Individual payout breakdown (${totalRows}${group.voidCount ? `, ${group.voidCount} void` : ""})`;

        return (
            <TableRow className="bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                <TableCell colSpan={8} className="p-0">
                    <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                        {totalRows > 0 && (
                            <>
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {breakdownTitle}
                                </p>
                                <div className="overflow-x-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-800/80">
                                            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                                                {isGrouped ? (
                                                    <>
                                                        <th className="px-3 py-2 font-medium">Date</th>
                                                        <th className="px-3 py-2 font-medium">TXID</th>
                                                        <th className="px-3 py-2 font-medium">Amount</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="px-3 py-2 font-medium">Contract ID</th>
                                                        <th className="px-3 py-2 font-medium">Client ID</th>
                                                        <th className="px-3 py-2 font-medium">BTC Address</th>
                                                        <th className="px-3 py-2 font-medium">Amount</th>
                                                        <th className="px-3 py-2 font-medium">Status</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isGrouped && subGroups
                                                ? subGroups.map((sub) => (
                                                      <tr
                                                          key={sub.dayKey}
                                                          className="border-t border-gray-100 dark:border-gray-800"
                                                      >
                                                          <td className="px-3 py-2">
                                                              <DateTimeCell value={summaryTimestamp(sub)} />
                                                          </td>
                                                          <td className="px-3 py-2">{renderTxidCell(sub)}</td>
                                                          <td className="px-3 py-2 font-semibold text-brand-600 whitespace-nowrap">
                                                              {showSensitiveData
                                                                  ? `BTC ${sub.totalAmount.toFixed(8)}`
                                                                  : "••••••"}
                                                          </td>
                                                      </tr>
                                                  ))
                                                : group.payouts.map((payout) => renderPayoutRow(payout))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    return (
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
                        <span>{unitLabel}</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-3 sm:ml-auto sm:justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSensitiveData(!showSensitiveData)}
                        className="flex h-9 items-center gap-2 shadow-none"
                    >
                        {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {showSensitiveData ? "Hide Amounts" : "Show Amounts"}
                    </Button>

                    <div className="flex flex-col items-center gap-3 sm:flex-row">
                        <span className="whitespace-nowrap text-sm font-medium text-gray-500">Filter by:</span>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={filterPeriod}
                                onValueChange={(value: FilterPeriod) => {
                                    setFilterPeriod(value);
                                    if (value !== "custom") setCustomDateRange(undefined);
                                }}
                            >
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Select period" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">Today</SelectItem>
                                    <SelectItem value="yesterday">Yesterday</SelectItem>
                                    <SelectItem value="7days">Last 7 days</SelectItem>
                                    <SelectItem value="30days">Last 30 days</SelectItem>
                                    <SelectItem value="quarterly">Last quarter</SelectItem>
                                    <SelectItem value="yearly">Last year</SelectItem>
                                    <SelectItem value="all">All time</SelectItem>
                                    <SelectItem value="custom">Custom Range</SelectItem>
                                    <SelectItem value="by-month">By Month</SelectItem>
                                    <SelectItem value="by-year">By Year</SelectItem>
                                </SelectContent>
                            </Select>
                            {filterPeriod === "custom" && (
                                <div className="flex animate-in fade-in slide-in-from-left-2 items-center gap-2 transition-all">
                                    <SimpleDateRangePicker date={pickerDateRange} onSelect={setPickerDateRange} />
                                    <Button
                                        onClick={() => {
                                            if (pickerDateRange?.from && pickerDateRange?.to) {
                                                setCustomDateRange(pickerDateRange);
                                            } else {
                                                toast.error("Please select both start and end dates");
                                            }
                                        }}
                                        disabled={!pickerDateRange?.from || !pickerDateRange?.to}
                                        size="sm"
                                        className="h-9 bg-brand-500 text-white hover:bg-brand-600"
                                    >
                                        Apply
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="relative w-full min-w-[220px] sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search contract, client, txid…"
                            className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm leading-none text-gray-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Net Paid</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600">
                        {showSensitiveData ? `BTC ${totalNet.toFixed(8)}` : "••••••"}
                    </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Network Fee</p>
                    <p className="mt-1 text-lg font-semibold text-amber-600">
                        {showSensitiveData ? `BTC ${totalFee.toFixed(8)}` : "••••••"}
                    </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Paid (Gross)</p>
                    <p className="mt-1 text-lg font-semibold text-brand-600">
                        {showSensitiveData ? `BTC ${totalGross.toFixed(8)}` : "••••••"}
                    </p>
                </div>
            </div>

            <div className="overflow-x-auto admin-scroll">
                <Table>
                    <TableHeader className="bg-brand-50/60 dark:bg-brand-500/5">
                        <TableRow className="border-b border-gray-200 dark:border-gray-700">
                            <TableCell isHeader className="w-10 px-3 py-3" />
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                {isGrouped ? "Period" : "Date"}
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                Amount (Gross)
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                Network Fee
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                Net Paid
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                TXID
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                Status
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-64 text-center">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-brand-600" />
                                        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : paginatedGroups.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-gray-500 dark:text-gray-400">
                                    No payouts found
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedGroups.map((group) => {
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
                                                {isGrouped ? (
                                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                                        {formatPayoutPeriodLabel(group.dayKey, groupBy)}
                                                    </span>
                                                ) : (
                                                    <DateTimeCell value={summaryTimestamp(group)} />
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <span className="font-semibold text-brand-600">
                                                    {showSensitiveData
                                                        ? `BTC ${(group.totalAmount + dayFee(group)).toFixed(8)}`
                                                        : "••••••"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <span className="text-amber-600">
                                                    {showSensitiveData
                                                        ? `BTC ${dayFee(group).toFixed(8)}`
                                                        : "••••••"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <span className="font-semibold text-emerald-600">
                                                    {showSensitiveData
                                                        ? `BTC ${group.totalAmount.toFixed(8)}`
                                                        : "••••••"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-4 py-3">{renderTxidCell(group)}</TableCell>
                                            <TableCell className="px-4 py-3">{renderStatusBadge(group)}</TableCell>
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
                        Showing {dayGroups.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{" "}
                        {Math.min(currentPage * itemsPerPage, dayGroups.length)} of {dayGroups.length}{" "}
                        {unitLabel.slice(0, -1)}
                        {dayGroups.length === 1 ? "" : "s"}
                        {searchQuery && (
                            <span className="text-gray-400">
                                {" "}
                                ({filteredPayouts.length} payout
                                {filteredPayouts.length === 1 ? "" : "s"}
                                {filteredPayouts.some((p) => isVoidPayout(p.Status))
                                    ? `, ${filteredPayouts.filter((p) => isVoidPayout(p.Status)).length} void`
                                    : ""}
                                )
                            </span>
                        )}
                    </p>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
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
                                disabled={currentPage === totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
