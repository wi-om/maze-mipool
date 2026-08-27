import { useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import AddPayoutPage from "./payouts/AddPayoutPage";
import { type PayoutSummary } from "../api/services/payoutService";
import MetricCard from "../components/common/MetricCard";
import { Clock, FileStack } from "lucide-react";

export default function AddPayoutRoutePage() {
    const [summary, setSummary] = useState<PayoutSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);

    return (
        <div className="space-y-4">
            <PageHeader title="Add Payout" breadcrumbs={pageBreadcrumbs.addPayout} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard
                    title="Outstanding Amount"
                    value={`${Number(summary?.totalPayable ?? summary?.totalOutstanding ?? 0).toFixed(8)} BTC`}
                    icon={<span>฿</span>}
                    iconColor="text-accent-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Days Pending"
                    value={summary?.daysPending ?? 0}
                    icon={<Clock className="h-5 w-5" />}
                    iconColor="text-brand-600"
                    loading={summaryLoading}
                />
                <MetricCard
                    title="Active Contracts"
                    value={summary?.contractQty ?? 0}
                    icon={<FileStack className="h-5 w-5" />}
                    iconColor="text-emerald-600"
                    loading={summaryLoading}
                />
            </div>

            <AddPayoutPage
                onSummaryChange={setSummary}
                onSummaryLoadingChange={setSummaryLoading}
            />
        </div>
    );
}
