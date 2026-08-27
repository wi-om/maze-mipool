import { useEffect, useState } from "react";
import { getAllContracts, type Contract } from "../api/services/contractService";
import { DataTable, type Column } from "../components/common/DataTable";
import MetricCard from "../components/common/MetricCard";
import DateTimeCell from "../components/common/DateTimeCell";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import { Badge } from "../components/ui/badge";
import { FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SimpleDateRangePicker } from "../components/ui/simple-date-range-picker";
import type { DateRange } from "react-day-picker";
import { useMemo } from "react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

type FilterPeriod = "today" | "yesterday" | "7days" | "30days" | "quarterly" | "yearly" | "all" | "custom";

export default function ContractsPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [pickerDateRange, setPickerDateRange] = useState<DateRange | undefined>();

    useEffect(() => {
        const fetchContracts = async () => {
            try {
                const data = await getAllContracts();
                setContracts(Array.isArray(data) ? data : (data as any).data || []);
            } catch (error) {
                console.error("Failed to fetch contracts", error);
            } finally {
                setLoading(false);
            }
        };
        fetchContracts();
    }, []);

    const getFilteredData = (data: Contract[], period: FilterPeriod) => {
        if (period === "all") return data;
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
                    const date = item.StartDate ? new Date(item.StartDate) : null;
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
                        const date = item.StartDate ? new Date(item.StartDate) : null;
                        return date && date >= fromDate && date <= toDate;
                    });
                }
                return data;
        }

        return data.filter((item) => {
            const date = item.StartDate ? new Date(item.StartDate) : null;
            return date && date >= cutoffDate;
        });
    };

    const filteredContracts = useMemo(() => {
        return getFilteredData(contracts, filterPeriod);
    }, [contracts, filterPeriod, customDateRange]);

    const columns: Column<Contract>[] = [
        { header: "ID", accessor: "Id", sortable: true },
        { header: "Contract No", accessor: "MipContractNo", sortable: true },
        {
            header: "Hashrate",
            accessor: (item) => item.Hashrate ? `${Number(item.Hashrate).toFixed(2)} ${item.HashrateUnit || ""}` : "-",
            sortable: true,
            sortKey: "Hashrate"
        },
        {
            header: "Status",
            accessor: (item) => (
                <Badge variant={String(item.Status) === "1" ? "default" : "secondary"}>{String(item.Status) === "1" ? "Active" : "Inactive"}</Badge>
            ),
            sortable: true,
            sortKey: "Status",
            searchValue: (item) => (String(item.Status) === "1" ? "Active" : "Inactive"),
        },
        {
            header: "Start Date",
            accessor: (item) => <DateTimeCell value={item.StartDate} />,
            sortable: true,
            sortKey: "StartDate",
        },
    ];

    return (
        <div className="space-y-4">
            <PageHeader title="EU Contract" breadcrumbs={pageBreadcrumbs.euContract} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard
                    title="Total Contracts"
                    value={filteredContracts.length}
                    icon={<FileText />}
                    iconColor="text-brand-600"
                    loading={loading}
                />
            </div>

            <DataTable
                data={filteredContracts}
                columns={columns}
                loading={loading}
                emptyMessage="No contracts found"
                searchPlaceholder="Search ID, contract no, hashrate, status…"
                searchKeys={["Id", "MipContractNo", "Hashrate", "HashrateUnit", "Status"]}
                rightActions={
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <span className="text-sm font-medium text-gray-500 whitespace-nowrap">Filter by:</span>
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
                                </SelectContent>
                            </Select>
                            {filterPeriod === "custom" && (
                                <div className="flex items-center gap-2 transition-all animate-in fade-in slide-in-from-left-2">
                                    <SimpleDateRangePicker
                                        date={pickerDateRange}
                                        onSelect={setPickerDateRange}
                                    />
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
                                        className="bg-brand-500 text-white hover:bg-brand-600 h-9"
                                    >
                                        Apply
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                }
            />
        </div>
    );
}

