import { useState, useEffect, useMemo } from "react";
import { calculateDailyRewards, getTestRewards, calculateBulkDailyRewards } from "../../api/services/rewardService";
import { DataTable, type Column } from "../../components/common/DataTable";
import DateTimeCell from "../../components/common/DateTimeCell";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

export default function DailyRewardsPage() {
    const [testRewards, setTestRewards] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const fetchTestResults = async () => {
        try {
            const res = await getTestRewards();
            setTestRewards(res.data || []);
        } catch (error) {
            console.error("Failed to fetch test rewards", error);
        }
    };

    useEffect(() => {
        fetchTestResults();
    }, []);

    const handleCalculate = async () => {
        setLoading(true);
        try {
            await calculateDailyRewards();
            fetchTestResults();
            toast.success("Rewards calculated based on live data!");
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Calculation failed");
        } finally {
            setLoading(false);
        }
    };

    const handleBulkCalculate = async () => {
        if (!startDate) {
            toast.error("Start Date is required for bulk calculation");
            return;
        }

        setBulkLoading(true);
        try {
            await calculateBulkDailyRewards({ startDate, endDate: endDate || startDate });
            fetchTestResults();
            toast.success("Bulk rewards calculated successfully!");
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Bulk calculation failed");
        } finally {
            setBulkLoading(false);
        }
    };

    const columns: Column<any>[] = useMemo(() => [
        {
            header: "Date",
            accessor: (item) => <DateTimeCell value={item.RewardDate} />,
            sortable: true,
            sortKey: "RewardDate",
        },
        { header: "Account", accessor: "AcNo", sortable: true },
        { header: "Contract", accessor: "MipContractNo", sortable: true },
        {
            header: "Hashrate",
            accessor: (item) => `${item.Hashrate} ${item.HashrateUnit || "TH"}`,
            sortable: true,
            sortKey: "Hashrate",
            searchValue: (item) => `${item.Hashrate} ${item.HashrateUnit || "TH"}`,
        },
        {
            header: "Reward (BTC)",
            accessor: (item) => (
                <span className="font-mono font-medium text-brand-600">{Number(item.Amount).toFixed(8)}</span>
            ),
            sortable: true,
            sortKey: "Amount",
        },
    ], []);

    return (
        <div className="space-y-4">
            <div className="flex w-full justify-end items-center">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-md p-1 bg-white dark:bg-gray-900">
                        <input
                            type="date"
                            className="text-sm bg-transparent border-none outline-none focus:ring-0 px-2 text-gray-700 dark:text-gray-300"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-gray-400">to</span>
                        <input
                            type="date"
                            className="text-sm bg-transparent border-none outline-none focus:ring-0 px-2 text-gray-700 dark:text-gray-300"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                        <Button
                            onClick={handleBulkCalculate}
                            disabled={bulkLoading || !startDate}
                            variant="secondary"
                            size="sm"
                            className="ml-2 flex items-center gap-2"
                        >
                            <Calculator className="w-4 h-4" />
                            {bulkLoading ? "Running..." : "Bulk Calculate"}
                        </Button>
                    </div>

                    <div className="hidden sm:block w-px h-8 bg-gray-200 dark:bg-gray-800" />

                    <Button
                        onClick={handleCalculate}
                        disabled={loading}
                        className="bg-brand-500 hover:bg-brand-600 text-white flex items-center gap-2"
                    >
                        <Calculator className="w-4 h-4" />
                        {loading ? "Calculating Live..." : "Calculate (Live)"}
                    </Button>
                </div>
            </div>

            <DataTable
                data={testRewards}
                columns={columns}
                loading={loading}
                emptyMessage="No calculation results found. Click 'Calculate Reward' to generate preview."
                searchPlaceholder="Search account, contract, hashrate, amount…"
                searchKeys={["AcNo", "MipContractNo", "Hashrate", "Amount"]}
            />
        </div>
    );
}
