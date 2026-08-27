import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Clock, FileStack, CreditCard, RefreshCw, GitCompareArrows } from "lucide-react";
import MetricCard from "../components/common/MetricCard";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import PayoutHistoryPage from "./payouts/PayoutHistoryPage";
import ImportTxidFeeDialog from "../components/payouts/ImportTxidFeeDialog";
import CompareBlockchainDialog from "../components/payouts/CompareBlockchainDialog";
import { getPayoutSummary, type PayoutSummary } from "../api/services/payoutService";
import { Button } from "../components/ui/button";

export default function PayoutsIndex() {
    const navigate = useNavigate();
    const [summary, setSummary] = useState<PayoutSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [totalAmountPaid, setTotalAmountPaid] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [showSensitiveData, setShowSensitiveData] = useState(true);
    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [compareOpen, setCompareOpen] = useState(false);
    const [historyReloadToken, setHistoryReloadToken] = useState(0);

    useEffect(() => {
        const loadSummary = async () => {
            try {
                setSummaryLoading(true);
                const data = await getPayoutSummary();
                setSummary(data);
            } catch (err) {
                console.error("Failed to load pending summary", err);
            } finally {
                setSummaryLoading(false);
            }
        };
        loadSummary();
    }, []);

    return (
        <div className="space-y-4">
            <PageHeader title="Payouts" breadcrumbs={pageBreadcrumbs.payouts}>
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
                    <Button
                        type="button"
                        onClick={() => navigate("/payouts/add")}
                        className="bg-brand-500 text-white hover:bg-brand-600 shadow-none"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Payout
                    </Button>
                </div>
            </PageHeader>

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
                <MetricCard
                    title="Payable (through yesterday)"
                    value={summaryLoading ? "…" : `${Number(summary?.totalPayable ?? summary?.totalOutstanding ?? 0).toFixed(8)} BTC`}
                    icon={<span>฿</span>}
                    iconColor="text-accent-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Days Pending"
                    value={summaryLoading ? "…" : summary?.daysPending ?? 0}
                    icon={<Clock className="h-5 w-5" />}
                    iconColor="text-brand-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Active Contracts"
                    value={summaryLoading ? "…" : summary?.contractQty ?? 0}
                    icon={<FileStack className="h-5 w-5" />}
                    iconColor="text-emerald-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Total Amount Paid"
                    value={showSensitiveData ? `${totalAmountPaid.toFixed(8)} BTC` : "••••••"}
                    icon={<CreditCard className="h-5 w-5" />}
                    iconColor="text-amber-500"
                    loading={historyLoading}
                />
            </div>

            <PayoutHistoryPage
                showSensitiveData={showSensitiveData}
                onShowSensitiveDataChange={setShowSensitiveData}
                onFilteredTotalAmountChange={setTotalAmountPaid}
                onLoadingChange={setHistoryLoading}
                reloadToken={historyReloadToken}
            />

            <ImportTxidFeeDialog
                open={syncDialogOpen}
                onOpenChange={setSyncDialogOpen}
                onImported={() => setHistoryReloadToken((value) => value + 1)}
            />

            <CompareBlockchainDialog open={compareOpen} onOpenChange={setCompareOpen} />
        </div>
    );
}
