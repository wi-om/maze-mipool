import Chart from "react-apexcharts";
import { format, parseISO, addDays, subDays } from "date-fns";
import type { Payout } from "../../api/services/payoutService";
import { dashboardPanelClass } from "../common/panelStyles";
import ChartPanelSkeleton from "./ChartPanelSkeleton";
import { cn } from "@/lib/utils";

interface PayoutsChartProps {
    mipsPayouts: Payout[];
    loading?: boolean;
}

const RECENT_PAYOUT_DAYS = 14;
const BRAND_BAR_COLOR = "#6366f1";

function groupCompletePayoutsByDate(payouts: Payout[]): Record<string, number> {
    return (payouts || []).reduce((acc: Record<string, number>, payout) => {
        if ((payout.Status || "").toLowerCase() !== "complete") return acc;
        if (!payout.CreatedOn) return acc;
        try {
            const date = format(new Date(payout.CreatedOn), "yyyy-MM-dd");
            acc[date] = (acc[date] || 0) + (Number(payout.Amount) || 0);
        } catch (e) {
            console.error("Invalid date in payout:", payout.CreatedOn);
        }
        return acc;
    }, {});
}

export default function PayoutsChart({ mipsPayouts, loading = false }: PayoutsChartProps) {
    if (loading) {
        return (
            <ChartPanelSkeleton
                titleWidth="w-40"
                subtitleWidth="w-80"
                chartHeight="h-[400px]"
            />
        );
    }

    const payoutsByDate = groupCompletePayoutsByDate(mipsPayouts);

    const sortedPayoutDates = Object.keys(payoutsByDate).sort();
    let chartDates: string[];

    if (sortedPayoutDates.length > 0) {
        const anchor = parseISO(sortedPayoutDates[sortedPayoutDates.length - 1]);
        const windowStart = subDays(anchor, RECENT_PAYOUT_DAYS - 1);
        chartDates = [];
        for (let d = windowStart; d <= anchor; d = addDays(d, 1)) {
            chartDates.push(format(d, "yyyy-MM-dd"));
        }
    } else {
        chartDates = Array.from({ length: 7 }, (_, i) =>
            format(subDays(new Date(), 6 - i), "yyyy-MM-dd"),
        );
    }

    const seriesData = chartDates.map((date) => {
        const val = payoutsByDate[date];
        return val !== undefined && val > 0 ? Number(val.toFixed(8)) : 0;
    });

    const options: ApexCharts.ApexOptions = {
        chart: {
            id: "payouts-chart",
            toolbar: { show: false },
            fontFamily: "Poppins, sans-serif",
            background: "transparent",
        },
        dataLabels: { enabled: false },
        stroke: {
            show: true,
            width: 2,
            colors: ["transparent"],
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: "55%",
                borderRadius: 4,
            },
        },
        colors: [BRAND_BAR_COLOR],
        xaxis: {
            categories: chartDates.map((d) => format(parseISO(d), "MMM dd")),
            labels: { style: { colors: "#94a3b8" } },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            labels: {
                formatter: (val: number) => `${val.toFixed(6)} BTC`,
                style: { colors: "#94a3b8" },
            },
            min: 0,
        },
        grid: {
            borderColor: "rgba(148, 163, 184, 0.1)",
            strokeDashArray: 4,
        },
        tooltip: {
            theme: "dark",
            y: {
                formatter: (val: number) => `${val.toFixed(8)} BTC`,
            },
        },
        legend: { show: false },
    };

    const series = [{ name: "Payout", data: seriesData }];

    return (
        <div className={cn(dashboardPanelClass, "min-h-[480px]")}>
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Payouts</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    EU payouts marked Complete, grouped by payout date
                </p>
            </div>
            <div className="h-[400px] w-full">
                <Chart options={options} series={series} type="bar" height="100%" />
            </div>
        </div>
    );
}
