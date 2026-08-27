import { lazy, Suspense } from "react";
import StateCards from "../components/dashboard/StateCards";
import UptimeCards from "../components/dashboard/UptimeCards";
import ChartPanelSkeleton from "../components/dashboard/ChartPanelSkeleton";
import PageHeader from "../components/layout/PageHeader";
import { pageBreadcrumbs } from "../config/breadcrumbs";
import { useDashboardData } from "../hooks/useDashboardData";

const StatisticsChart = lazy(() => import("../components/dashboard/StatisticsChart"));
const PayoutsChart = lazy(() => import("../components/dashboard/PayoutsChart"));

export default function DashboardPage() {
    const { loading, stats, payouts, payoutsTotal, uptime, uptimeLoading } = useDashboardData();

    return (
        <div>
            <PageHeader title="Dashboard" breadcrumbs={pageBreadcrumbs.dashboard} />

            <div className="space-y-4">
                <StateCards stats={stats} payoutsTotal={payoutsTotal} loading={loading} />
                <UptimeCards stats={uptime} loading={uptimeLoading} />

                <div className="space-y-4">
                    <Suspense
                        fallback={
                            <ChartPanelSkeleton
                                titleWidth="w-52"
                                subtitleWidth="w-72"
                                chartHeight="h-[310px]"
                            />
                        }
                    >
                        <StatisticsChart />
                    </Suspense>

                    <Suspense
                        fallback={
                            <ChartPanelSkeleton
                                titleWidth="w-40"
                                subtitleWidth="w-80"
                                chartHeight="h-[400px]"
                            />
                        }
                    >
                        <PayoutsChart mipsPayouts={payouts} loading={loading} />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
