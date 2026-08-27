import { useCallback, useEffect, useMemo, useState } from "react";
import {
    fetchAllCMWalletEntries,
    getCMWalletEntries,
    getUnitRewardsHistory,
    type CMWalletEntry,
    type PaginatedListMeta,
} from "../../api/services/rewardService";
import { usePaginatedFetch } from "../../hooks/usePaginatedFetch";
import { DataTable, type Column } from "../../components/common/DataTable";
import DateTimeCell from "../../components/common/DateTimeCell";
import MetricCard from "../../components/common/MetricCard";
import PageHeader from "../../components/layout/PageHeader";
import { pageBreadcrumbs } from "../../config/breadcrumbs";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Wallet, Filter, CreditCard, TrendingUp, ArrowDownRight, FileSpreadsheet } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SimpleDateRangePicker } from "../../components/ui/simple-date-range-picker";
import type { DateRange } from "react-day-picker";
import { format, isValid } from "date-fns";
import { periodToDateRange, type RewardFilterPeriod } from "../../utils/rewardPeriodFilters";

function getEntryDate(item: CMWalletEntry): Date | null {
    const raw = item.Date ?? item.rewardDate ?? item.RewardOn;
    if (raw == null || raw === "") return null;
    const date = typeof raw === "string" ? new Date(raw) : new Date(String(raw));
    return isValid(date) ? date : null;
}

const EMPTY_PAGINATION: PaginatedListMeta = {
    page: 1,
    limit: 10,
    totalDays: 0,
    totalRecords: 0,
    totalAmount: 0,
};

export default function CMWalletPage() {
    const [exportLoading, setExportLoading] = useState(false);
    const [filterPeriod, setFilterPeriod] = useState<RewardFilterPeriod>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [pickerDateRange, setPickerDateRange] = useState<DateRange | undefined>();
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

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
        }),
        [itemsPerPage, dateRange, debouncedSearch],
    );

    const queryScope = useMemo(
        () =>
            [
                filterPeriod,
                customDateRange?.from?.toISOString() ?? "",
                customDateRange?.to?.toISOString() ?? "",
                debouncedSearch,
                itemsPerPage,
            ].join("|"),
        [filterPeriod, customDateRange, debouncedSearch, itemsPerPage],
    );

    const {
        data: entries,
        pagination,
        loading,
        refresh,
    } = usePaginatedFetch<CMWalletEntry, ReturnType<typeof buildFetchParams>>({
        enabled: canFetch,
        currentPage,
        buildParams: buildFetchParams,
        fetchFn: getCMWalletEntries,
        emptyPagination: EMPTY_PAGINATION,
        queryScope,
        onError: () => toast.error("Failed to load wallet ledger"),
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [filterPeriod, customDateRange, debouncedSearch, itemsPerPage]);

    const handleDownloadExcel = async () => {
        if (!canFetch) {
            toast.error("Select a valid date filter before exporting");
            return;
        }

        setExportLoading(true);
        toast.loading("Generating consolidated report...", { id: "export" });
        try {
            const XLSX = await import("xlsx");
            const [unitHistory, exportEntries] = await Promise.all([
                getUnitRewardsHistory(),
                fetchAllCMWalletEntries({
                    ...dateRange,
                    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                    limit: 100,
                }),
            ]);

            const unitMap: Record<string, number> = {};
            (unitHistory || []).forEach((u: { CreatedOn?: string; RewardPerTH?: number }) => {
                const created = u.CreatedOn ? new Date(u.CreatedOn) : null;
                if (!created || !isValid(created)) return;
                const d = format(created, "yyyy-MM-dd");
                unitMap[d] = Number(u.RewardPerTH);
            });

            const sorted = [...exportEntries].sort((a, b) => {
                const aTime = getEntryDate(a)?.getTime() ?? 0;
                const bTime = getEntryDate(b)?.getTime() ?? 0;
                return aTime - bTime;
            });

            if (sorted.length === 0) {
                toast.error("No records found for the selected filter", { id: "export" });
                return;
            }

            const rows = sorted.map((item) => {
                const dateObj = getEntryDate(item);
                if (!dateObj) {
                    throw new Error("Invalid date in wallet entry");
                }
                const dStrFormatted = dateObj.toLocaleDateString("en-AE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                });
                const dStrISO = format(dateObj, "yyyy-MM-dd");
                return {
                    Date: dStrFormatted,
                    "Unit Reward": unitMap[dStrISO] || 0,
                    "EU Rewards": Number(item.Sales_amount || 0),
                    "CL Rewards": Number(item.Amount || 0),
                    "Daily Net Rewards": Number(item.Net_amount || 0),
                };
            });

            const totalEU = rows.reduce((acc, r) => acc + Number(r["EU Rewards"]), 0);
            const totalCL = rows.reduce((acc, r) => acc + Number(r["CL Rewards"]), 0);
            const totalNet = rows.reduce((acc, r) => acc + Number(r["Daily Net Rewards"]), 0);

            rows.push({
                Date: "TOTAL",
                "Unit Reward": 0,
                "EU Rewards": totalEU,
                "CL Rewards": totalCL,
                "Daily Net Rewards": totalNet,
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            worksheet["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Rewards Ledger");
            XLSX.writeFile(workbook, `Reward_Distribution_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
            toast.success("Excel report downloaded successfully", { id: "export" });
        } catch (e) {
            console.error(e);
            toast.error("Failed to generate report", { id: "export" });
        } finally {
            setExportLoading(false);
        }
    };

    const columns: Column<CMWalletEntry>[] = [
        {
            header: "Date",
            accessor: (item) => (
                <DateTimeCell value={item.rewardDate ?? item.RewardOn ?? item.Date} />
            ),
            sortable: true,
            sortKey: "rewardDate",
        },
        {
            header: "CL Account",
            accessor: (item) => <span className="font-semibold text-gray-900 dark:text-white">{item.AcNo}</span>,
            sortable: true,
            sortKey: "AcNo",
        },
        {
            header: "CL Gross",
            accessor: (item) => `${Number(item.Amount).toFixed(8)} BTC`,
            sortable: true,
            sortKey: "Amount",
        },
        {
            header: "EU Deduct",
            accessor: (item) => (
                <span className="text-red-500/80">-{Number(item.Sales_amount).toFixed(8)} BTC</span>
            ),
            sortable: true,
            sortKey: "Sales_amount",
        },
        {
            header: "Daily Net",
            accessor: (item) => {
                const isPositive = Number(item.Net_amount) >= 0;
                return (
                    <span className={`font-semibold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {Number(item.Net_amount).toFixed(8)} BTC
                    </span>
                );
            },
            sortable: true,
            sortKey: "Net_amount",
        },
        {
            header: "Wallet Balance",
            accessor: (item) => (
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                    {Number(item.Net_Balance).toFixed(8)} BTC
                </span>
            ),
            sortable: true,
            sortKey: "Net_Balance",
        },
    ];

    return (
        <div className="space-y-4">
            <PageHeader title="CM Wallet" breadcrumbs={pageBreadcrumbs.cmWallet} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard
                    title="Available Balance"
                    value={`${Number(pagination.latestBalance ?? 0).toFixed(8)} BTC`}
                    icon={<Wallet />}
                    iconColor="text-brand-600"
                    loading={loading}
                />
                <MetricCard
                    title="Period Profit"
                    value={`${Number(pagination.totalNetAmount ?? 0).toFixed(8)} BTC`}
                    icon={<TrendingUp />}
                    iconColor="text-emerald-500"
                    loading={loading}
                />
                <MetricCard
                    title="EU Deductions"
                    value={`-${Number(pagination.totalSalesAmount ?? 0).toFixed(8)} BTC`}
                    icon={<CreditCard />}
                    iconColor="text-red-500"
                    loading={loading}
                />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadExcel}
                    disabled={exportLoading || loading || !canFetch}
                >
                    <FileSpreadsheet className={`h-4 w-4 mr-2 ${exportLoading ? "animate-pulse" : ""}`} />
                    {exportLoading ? "Generating..." : "Download Report"}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refresh()}
                    disabled={loading || !canFetch}
                >
                    <ArrowDownRight className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                    Refresh Ledger
                </Button>
            </div>

            <DataTable
                data={canFetch ? entries : []}
                columns={columns}
                loading={loading}
                emptyMessage={canFetch ? "History is clear." : "Select a date range and click Apply."}
                searchPlaceholder="Search account, amounts, balance…"
                searchKeys={["AcNo", "Amount", "Sales_amount", "Net_amount", "Net_Balance"]}
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                defaultPageSize={itemsPerPage}
                serverPagination={{
                    currentPage,
                    totalItems: pagination.totalDays,
                    itemsPerPage,
                    itemLabel: "days",
                    onPageChange: setCurrentPage,
                    onItemsPerPageChange: setItemsPerPage,
                }}
                rightActions={
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                            <Filter className="w-3 h-3" />
                            Filter:
                        </span>
                        <Select
                            value={filterPeriod}
                            onValueChange={(value: RewardFilterPeriod) => {
                                setFilterPeriod(value);
                                if (value !== "custom") setCustomDateRange(undefined);
                            }}
                        >
                            <SelectTrigger className="w-[160px] h-9">
                                <SelectValue placeholder="Period" />
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
                            </SelectContent>
                        </Select>
                        {filterPeriod === "custom" && (
                            <div className="flex items-center gap-2">
                                <SimpleDateRangePicker date={pickerDateRange} onSelect={setPickerDateRange} />
                                <Button
                                    onClick={() => {
                                        if (pickerDateRange?.from && pickerDateRange?.to) {
                                            setCustomDateRange(pickerDateRange);
                                        } else {
                                            toast.error("Set both dates");
                                        }
                                    }}
                                    disabled={!pickerDateRange?.from || !pickerDateRange?.to}
                                    size="sm"
                                    className="bg-brand-500 h-9 px-3"
                                >
                                    Apply
                                </Button>
                            </div>
                        )}
                    </div>
                }
            />
        </div>
    );
}
