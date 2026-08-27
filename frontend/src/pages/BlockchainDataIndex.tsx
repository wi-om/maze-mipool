import { useCallback, useState } from "react";
import { Blocks, GitCompareArrows, RefreshCw, TriangleAlert } from "lucide-react";
import MetricCard from "../components/common/MetricCard";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import BlockchainHistoryPage from "./blockchain/BlockchainHistoryPage";
import ImportTxidFeeDialog from "../components/payouts/ImportTxidFeeDialog";
import CompareBlockchainDialog from "../components/payouts/CompareBlockchainDialog";
import { Button } from "../components/ui/button";

export default function BlockchainDataIndex() {
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [showSensitiveData, setShowSensitiveData] = useState(true);
    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [compareOpen, setCompareOpen] = useState(false);
    const [historyReloadToken, setHistoryReloadToken] = useState(0);

    const [txidCount, setTxidCount] = useState(0);
    const [rowCount, setRowCount] = useState(0);
    const [totalGross, setTotalGross] = useState(0);
    const [unmappedRows, setUnmappedRows] = useState(0);
    const [addressIssueCount, setAddressIssueCount] = useState<number | null>(null);

    const handleHistorySummary = useCallback(
        (s: {
            totalGross: number;
            totalFee: number;
            totalNet: number;
            txidCount: number;
            rowCount: number;
            unmappedRows: number;
        }) => {
            setTotalGross(s.totalGross);
            setTxidCount(s.txidCount);
            setRowCount(s.rowCount);
            setUnmappedRows(s.unmappedRows);
        },
        [],
    );

    const handleLoadingChange = useCallback((loading: boolean) => {
        setSummaryLoading(loading);
    }, []);

    const handleAddressIssuesChange = useCallback(
        (summary: { totalIssues: number; txidCount: number } | null) => {
            setAddressIssueCount(summary?.totalIssues ?? 0);
        },
        [],
    );

    const bumpReload = () => setHistoryReloadToken((t) => t + 1);

    return (
        <div className="space-y-4">
            <PageHeader title="Blockchain Data" breadcrumbs={pageBreadcrumbs.blockchainData}>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCompareOpen(true)}
                        className="shadow-none"
                    >
                        <GitCompareArrows className="h-4 w-4 mr-2" />
                        Compare
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSyncDialogOpen(true)}
                        className="shadow-none"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync blockchain and txid fees
                    </Button>
                </div>
            </PageHeader>

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5 [&>*]:min-w-0">
                <MetricCard
                    title="Total TXIDs"
                    value={summaryLoading ? "…" : txidCount.toLocaleString()}
                    icon={<Blocks className="h-5 w-5" />}
                    iconColor="text-brand-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Total Recipients"
                    value={summaryLoading ? "…" : rowCount.toLocaleString()}
                    icon={<span>Σ</span>}
                    iconColor="text-emerald-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Total Gross"
                    value={
                        showSensitiveData && !summaryLoading
                            ? `${totalGross.toFixed(8)} BTC`
                            : summaryLoading
                              ? "…"
                              : "••••••"
                    }
                    icon={<span>฿</span>}
                    iconColor="text-accent-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Unmapped Excluded"
                    value={
                        summaryLoading
                            ? "…"
                            : unmappedRows > 0
                              ? unmappedRows.toLocaleString()
                              : "0"
                    }
                    icon={<span>⊘</span>}
                    iconColor={unmappedRows > 0 ? "text-amber-600" : "text-emerald-600"}
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Address Issues"
                    value={
                        summaryLoading
                            ? "…"
                            : addressIssueCount != null && addressIssueCount > 0
                              ? addressIssueCount.toLocaleString()
                              : "0"
                    }
                    icon={<TriangleAlert className="h-5 w-5" />}
                    iconColor={addressIssueCount ? "text-red-600" : "text-emerald-600"}
                    loading={summaryLoading}
                />
            </div>

            <BlockchainHistoryPage
                showSensitiveData={showSensitiveData}
                onShowSensitiveDataChange={setShowSensitiveData}
                onSummaryChange={handleHistorySummary}
                onAddressIssuesChange={handleAddressIssuesChange}
                onLoadingChange={handleLoadingChange}
                reloadToken={historyReloadToken}
            />

            <ImportTxidFeeDialog
                open={syncDialogOpen}
                onOpenChange={setSyncDialogOpen}
                onImported={bumpReload}
            />
            <CompareBlockchainDialog open={compareOpen} onOpenChange={setCompareOpen} />
        </div>
    );
}
