import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
    getAllRewards,
    type EURewardPeriodRow,
    type CLGroupBy,
    type PaginatedListMeta,
    type Reward,
} from "../api/services/rewardService";
import { usePaginatedFetch } from "../hooks/usePaginatedFetch";
import DateTimeCell from "../components/common/DateTimeCell";
import MetricCard from "../components/common/MetricCard";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SimpleDateRangePicker } from "../components/ui/simple-date-range-picker";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../components/ui/table";
import { dashboardPanelClass } from "../components/common/panelStyles";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Eye, EyeOff, Gift, Search } from "lucide-react";
import {
    groupRewardsByDay,
    summaryRewardTimestamp,
    type DayRewardGroup,
} from "../utils/rewardHistoryGroups";
import { periodToDateRange, type RewardFilterPeriod } from "../utils/rewardPeriodFilters";

function rewardHashrate(reward: Reward): string {
    const val = reward.Hashrate || reward.contract?.Hashrate;
    if (!val) return "—";
    return `${Number(val).toFixed(2)} ${reward.contract?.HashrateUnit || "TH"}`;
}

const EMPTY_PAGINATION: PaginatedListMeta = {
    page: 1,
    limit: 10,
    totalDays: 0,
    totalRecords: 0,
    totalAmount: 0,
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatPeriodLabel(period: string, periodType: "month" | "year"): string {
    if (!period) return "—";
    if (periodType === "year") return period;
    const [year, month] = period.split("-");
    const idx = Number(month) - 1;
    return `${MONTH_NAMES[idx] ?? month} ${year}`;
}

type EuFilterOption = RewardFilterPeriod | "by-month" | "by-year";

export default function RewardsPage() {
    const [filterOption, setFilterOption] = useState<EuFilterOption>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [pickerDateRange, setPickerDateRange] = useState<DateRange | undefined>();
    const [showSensitiveData, setShowSensitiveData] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    const groupBy: CLGroupBy = filterOption === "by-month" ? "month" : filterOption === "by-year" ? "year" : "day";
    const isGrouped = groupBy !== "day";
    const effectivePeriod: RewardFilterPeriod = isGrouped ? "all" : (filterOption as RewardFilterPeriod);
    const unitLabel = groupBy === "month" ? "months" : groupBy === "year" ? "years" : "days";

    const dateRange = useMemo(
        () => periodToDateRange(effectivePeriod, customDateRange),
        [effectivePeriod, customDateRange],
    );

    const canFetch = filterOption !== "custom" || Boolean(customDateRange?.from);

    const buildFetchParams = useCallback(
        (page: number) => ({
            page,
            limit: itemsPerPage,
            ...dateRange,
            ...(groupBy !== "day" ? { groupBy } : {}),
            ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        }),
        [itemsPerPage, dateRange, groupBy, debouncedSearch],
    );

    const queryScope = useMemo(
        () =>
            [
                filterOption,
                groupBy,
                customDateRange?.from?.toISOString() ?? "",
                customDateRange?.to?.toISOString() ?? "",
                debouncedSearch,
                itemsPerPage,
            ].join("|"),
        [filterOption, groupBy, customDateRange, debouncedSearch, itemsPerPage],
    );

    const {
        data: rows,
        pagination,
        loading,
        totalPages,
    } = usePaginatedFetch<Reward | EURewardPeriodRow, ReturnType<typeof buildFetchParams>>({
        enabled: canFetch,
        currentPage,
        buildParams: buildFetchParams,
        fetchFn: getAllRewards,
        emptyPagination: EMPTY_PAGINATION,
        queryScope,
        onError: () => toast.error("Failed to load rewards history"),
    });

    useEffect(() => {
        setCurrentPage(1);
        setExpandedDays(new Set());
    }, [filterOption, customDateRange, debouncedSearch, itemsPerPage]);

    const dayGroups = useMemo(
        () => (isGrouped ? [] : groupRewardsByDay(rows as Reward[])),
        [rows, isGrouped],
    );

    const periodRows = useMemo(
        () =>
            isGrouped
                ? (rows as (Reward | EURewardPeriodRow)[]).filter(
                      (r): r is EURewardPeriodRow => "period" in r && typeof r.period === "string",
                  )
                : [],
        [rows, isGrouped],
    );

    const toggleDay = (dayKey: string) => {
        setExpandedDays((prev) => {
            const next = new Set(prev);
            if (next.has(dayKey)) next.delete(dayKey);
            else next.add(dayKey);
            return next;
        });
    };

    const renderTypeBadge = (group: DayRewardGroup) => {
        if (group.primaryType) {
            return <Badge variant="secondary">{group.primaryType}</Badge>;
        }
        return <Badge variant="outline">Mixed</Badge>;
    };

    const renderBreakdown = (group: DayRewardGroup) => (
        <TableRow className="bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
            <TableCell colSpan={6} className="p-0">
                <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Individual reward breakdown ({group.rewardCount})
                    </p>
                    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/80">
                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-3 py-2 font-medium">ID</th>
                                    <th className="px-3 py-2 font-medium">Account No</th>
                                    <th className="px-3 py-2 font-medium">Contract No</th>
                                    <th className="px-3 py-2 font-medium">Amount</th>
                                    <th className="px-3 py-2 font-medium">Type</th>
                                    <th className="px-3 py-2 font-medium">Hashrate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.rewards.map((reward) => (
                                    <tr key={reward.Id} className="border-t border-gray-100 dark:border-gray-800">
                                        <td className="px-3 py-2 text-xs">{reward.Id}</td>
                                        <td className="px-3 py-2 text-xs font-semibold">{reward.AcNo || "—"}</td>
                                        <td className="px-3 py-2 font-mono text-xs break-all">
                                            {reward.mipContractNo || "—"}
                                        </td>
                                        <td className="px-3 py-2 font-semibold text-brand-600 whitespace-nowrap">
                                            {showSensitiveData
                                                ? `${Number(reward.Amount || 0).toFixed(8)} BTC`
                                                : "••••••"}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Badge variant="secondary">{reward.Type || "—"}</Badge>
                                        </td>
                                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                                            {rewardHashrate(reward)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </TableCell>
        </TableRow>
    );

    const renderMonthsBreakdown = (row: EURewardPeriodRow) => (
        <TableRow className="bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
            <TableCell colSpan={6} className="p-0">
                <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Monthly breakdown for {row.period}
                    </p>
                    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/80">
                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-3 py-2 font-medium">Month</th>
                                    <th className="px-3 py-2 font-medium">Rewards</th>
                                    <th className="px-3 py-2 font-medium">Hashrate</th>
                                    <th className="px-3 py-2 font-medium">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(row.months ?? []).map((month) => (
                                    <tr key={month.period} className="border-t border-gray-100 dark:border-gray-800">
                                        <td className="px-3 py-2 text-xs font-semibold">
                                            {formatPeriodLabel(month.period, "month")}
                                        </td>
                                        <td className="px-3 py-2 text-xs">{month.rewardCount}</td>
                                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                                            {month.totalHashrate.toLocaleString(undefined, {
                                                maximumFractionDigits: 2,
                                            })}{" "}
                                            TH
                                        </td>
                                        <td className="px-3 py-2 font-semibold text-brand-600 whitespace-nowrap">
                                            {showSensitiveData
                                                ? `${month.totalAmount.toFixed(8)} BTC`
                                                : "••••••"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </TableCell>
        </TableRow>
    );

    const renderGroupedRows = () =>
        periodRows.map((row) => {
            const expandable = row.periodType === "year";
            const expanded = expandedDays.has(row.period);
            return (
                <Fragment key={row.period}>
                    <TableRow
                        className={
                            expandable
                                ? "cursor-pointer border-b border-gray-100 transition-colors hover:bg-brand-50/40 dark:border-gray-800 dark:hover:bg-brand-500/5"
                                : "border-b border-gray-100 dark:border-gray-800"
                        }
                        onClick={expandable ? () => toggleDay(row.period) : undefined}
                    >
                        <TableCell className="px-3 py-3 text-gray-500">
                            {expandable ? (
                                expanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )
                            ) : null}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {formatPeriodLabel(row.period, row.periodType)}
                            </span>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                            <span className="font-semibold text-brand-600">
                                {showSensitiveData ? `BTC ${row.totalAmount.toFixed(8)}` : "••••••"}
                            </span>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                            <Badge variant="outline">
                                {row.rewardCount} reward{row.rewardCount === 1 ? "" : "s"}
                            </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                            <span className="text-sm text-gray-900 dark:text-gray-200">
                                {row.totalHashrate.toLocaleString(undefined, { maximumFractionDigits: 2 })} TH
                            </span>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                            {expandable ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDay(row.period);
                                    }}
                                >
                                    {expanded ? "Hide" : "View"}
                                </Button>
                            ) : (
                                <span className="text-gray-400">—</span>
                            )}
                        </TableCell>
                    </TableRow>
                    {expandable && expanded && renderMonthsBreakdown(row)}
                </Fragment>
            );
        });

    const showingFrom = pagination.totalDays > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const showingTo = Math.min(currentPage * itemsPerPage, pagination.totalDays);

    return (
        <div className="space-y-4">
            <PageHeader title="EU Rewards" breadcrumbs={pageBreadcrumbs.euRewards} />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <MetricCard
                    title="Total Rewards"
                    value={pagination.totalRecords}
                    icon={<Gift />}
                    iconColor="text-brand-600"
                    loading={loading}
                />
                <MetricCard
                    title="Total Amount"
                    value={showSensitiveData ? `${pagination.totalAmount.toFixed(8)} BTC` : "••••••"}
                    icon={<Gift />}
                    iconColor="text-amber-500"
                    loading={loading}
                />
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
                                    value={filterOption}
                                    onValueChange={(value: EuFilterOption) => {
                                        setFilterOption(value);
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
                                {filterOption === "custom" && (
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
                                placeholder="Search ID, account, contract…"
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
                                    {isGrouped ? "Period" : "Date"}
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Amount
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    {isGrouped ? "Rewards" : "Type"}
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Hashrate
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
                            ) : isGrouped ? (
                                periodRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-gray-500 dark:text-gray-400">
                                            No rewards found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    renderGroupedRows()
                                )
                            ) : dayGroups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-gray-500 dark:text-gray-400">
                                        No rewards found
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
                                                    <DateTimeCell value={summaryRewardTimestamp(group)} />
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className="font-semibold text-brand-600">
                                                        {showSensitiveData
                                                            ? `BTC ${group.totalAmount.toFixed(8)}`
                                                            : "••••••"}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">{renderTypeBadge(group)}</TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className="text-sm text-gray-900 dark:text-gray-200">
                                                        {group.totalHashrateTH.toLocaleString(undefined, {
                                                            maximumFractionDigits: 2,
                                                        })}{" "}
                                                        TH
                                                    </span>
                                                </TableCell>
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
                            Showing {showingFrom} to {showingTo} of {pagination.totalDays}{" "}
                            {pagination.totalDays === 1 ? unitLabel.slice(0, -1) : unitLabel}
                            {debouncedSearch && (
                                <span className="text-gray-400">
                                    {" "}
                                    ({pagination.totalRecords} reward{pagination.totalRecords === 1 ? "" : "s"})
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
