import { useCallback, useMemo, useState } from "react";
import {
    getDailyCompare,
    type DailyCompareRow,
} from "../../api/services/payoutService";
import type { PaginatedListMeta } from "../../api/services/rewardService";
import { usePaginatedFetch } from "../../hooks/usePaginatedFetch";
import MetricCard from "../../components/common/MetricCard";
import PageHeader from "../../components/layout/PageHeader";
import { pageBreadcrumbs } from "../../config/breadcrumbs";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SimpleDateRangePicker } from "../../components/ui/simple-date-range-picker";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../components/ui/table";
import { dashboardPanelClass } from "../../components/common/panelStyles";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Eye, EyeOff, GitCompare, Gift, CircleDollarSign, Link2 } from "lucide-react";
import { periodToDateRange, type RewardFilterPeriod } from "../../utils/rewardPeriodFilters";

const EMPTY_PAGINATION: PaginatedListMeta = {
    page: 1,
    limit: 10,
    totalDays: 0,
    totalRecords: 0,
    totalAmount: 0,
    totalRewardsAmount: 0,
    totalPayoutAmount: 0,
    totalBlockchainAmount: 0,
};

function formatBtc(value: number, hidden: boolean): string {
    if (hidden) return "••••••";
    return `${value.toFixed(8)} BTC`;
}

function formatDateLabel(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function diffClass(value: number): string {
    if (Math.abs(value) < 1e-8) return "text-emerald-600 dark:text-emerald-400";
    return "text-amber-600 dark:text-amber-400";
}

export default function RewardsComparePage() {
    const [filterPeriod, setFilterPeriod] = useState<RewardFilterPeriod>("30days");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [pickerDateRange, setPickerDateRange] = useState<DateRange | undefined>();
    const [showSensitiveData, setShowSensitiveData] = useState(true);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

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
        }),
        [itemsPerPage, dateRange],
    );

    const queryScope = useMemo(
        () =>
            [
                filterPeriod,
                customDateRange?.from?.toISOString() ?? "",
                customDateRange?.to?.toISOString() ?? "",
                itemsPerPage,
            ].join("|"),
        [filterPeriod, customDateRange, itemsPerPage],
    );

    const {
        data: rows,
        pagination,
        loading,
        totalPages,
    } = usePaginatedFetch<DailyCompareRow, ReturnType<typeof buildFetchParams>>({
        enabled: canFetch,
        currentPage,
        buildParams: buildFetchParams,
        fetchFn: async (params) => {
            const result = await getDailyCompare(params);
            const p = result.pagination;
            return {
                data: result.data,
                pagination: {
                    page: p.page,
                    limit: p.limit,
                    totalDays: p.totalDays,
                    totalRecords: p.totalRecords,
                    totalAmount: p.totalRewardsAmount,
                    totalRewardsAmount: p.totalRewardsAmount,
                    totalPayoutAmount: p.totalPayoutAmount,
                    totalBlockchainAmount: p.totalBlockchainAmount,
                },
            };
        },
        emptyPagination: EMPTY_PAGINATION,
        queryScope,
        onError: () => toast.error("Failed to load daily compare"),
    });

    const totalRewards = pagination.totalRewardsAmount ?? pagination.totalAmount ?? 0;
    const totalPayout = pagination.totalPayoutAmount ?? 0;
    const totalBlockchain = pagination.totalBlockchainAmount ?? 0;

    const showingFrom = pagination.totalDays > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const showingTo = Math.min(currentPage * itemsPerPage, pagination.totalDays);

    return (
        <div className="space-y-4">
            <PageHeader title="Rewards Compare" breadcrumbs={pageBreadcrumbs.rewardsCompare} />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="Total Rewards"
                    value={showSensitiveData ? `${totalRewards.toFixed(8)} BTC` : "••••••"}
                    icon={<Gift />}
                    iconColor="text-brand-600"
                    loading={loading}
                />
                <MetricCard
                    title="Total Payouts"
                    value={showSensitiveData ? `${totalPayout.toFixed(8)} BTC` : "••••••"}
                    icon={<CircleDollarSign />}
                    iconColor="text-emerald-600"
                    loading={loading}
                />
                <MetricCard
                    title="Total Blockchain"
                    value={showSensitiveData ? `${totalBlockchain.toFixed(8)} BTC` : "••••••"}
                    icon={<Link2 />}
                    iconColor="text-violet-600"
                    loading={loading}
                />
                <MetricCard
                    title="Payout − Blockchain"
                    value={showSensitiveData ? `${(totalPayout - totalBlockchain).toFixed(8)} BTC` : "••••••"}
                    icon={<GitCompare />}
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
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
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
                                    onValueChange={(value: RewardFilterPeriod) => {
                                        setFilterPeriod(value);
                                        setCurrentPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-9 w-[140px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="7days">Last 7 days</SelectItem>
                                        <SelectItem value="30days">Last 30 days</SelectItem>
                                        <SelectItem value="quarterly">Last 3 months</SelectItem>
                                        <SelectItem value="yearly">Last year</SelectItem>
                                        <SelectItem value="all">All time</SelectItem>
                                        <SelectItem value="custom">Custom Range</SelectItem>
                                    </SelectContent>
                                </Select>

                                {filterPeriod === "custom" && (
                                    <div className="flex items-center gap-2">
                                        <SimpleDateRangePicker date={pickerDateRange} onSelect={setPickerDateRange} />
                                        <Button
                                            onClick={() => {
                                                if (pickerDateRange?.from && pickerDateRange?.to) {
                                                    setCustomDateRange(pickerDateRange);
                                                    setCurrentPage(1);
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
                    </div>
                </div>

                <div className="overflow-x-auto admin-scroll">
                    <Table>
                        <TableHeader className="bg-brand-50/60 dark:bg-brand-500/5">
                            <TableRow className="border-b border-gray-200 dark:border-gray-700">
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Date
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Rewards
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Payout
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Blockchain
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Difference
                                </TableCell>
                                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                                    Status
                                </TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                                        No data for this period
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={row.date} className="border-b border-gray-100 dark:border-gray-800">
                                        <TableCell className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                            {formatDateLabel(row.date)}
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                            {formatBtc(row.rewardsAmount, !showSensitiveData)}
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                            {formatBtc(row.payoutAmount, !showSensitiveData)}
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                            {formatBtc(row.blockchainAmount, !showSensitiveData)}
                                        </TableCell>
                                        <TableCell className={`px-4 py-3 text-sm font-medium ${diffClass(row.difference)}`}>
                                            {showSensitiveData
                                                ? `${row.difference >= 0 ? "+" : ""}${row.difference.toFixed(8)}`
                                                : "••••••"}
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <Badge variant={row.status === "match" ? "default" : "secondary"}>
                                                {row.status === "match" ? "Match" : "Mismatch"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Showing {showingFrom} to {showingTo} of {pagination.totalDays} days
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1 || loading}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            Previous
                        </Button>
                        <span>
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= totalPages || loading}
                            onClick={() => setCurrentPage((p) => p + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
