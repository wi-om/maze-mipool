import { BoxIconLine } from "../../icons";
import { Gift, TrendingUp } from "lucide-react";
import MetricCard from "../common/MetricCard";
import type { DashboardStats } from "../../hooks/useDashboardData";

type StateCardsProps = {
    stats: DashboardStats;
    payoutsTotal: number;
    loading?: boolean;
};

export default function StateCards({ stats, payoutsTotal, loading = false }: StateCardsProps) {
    const cards = [
        {
            title: "Total Active Hashrate",
            value: `${stats.activeHashrate} TH`,
            badge: stats.activeCount,
            icon: <TrendingUp />,
            iconColor: "text-brand-600",
            valueClassName: "min-w-[6ch]",
        },
        {
            title: "Total Amount",
            value: `${stats.rewards.total.toFixed(8)} BTC`,
            icon: <Gift />,
            iconColor: "text-amber-500",
            valueClassName: "min-w-[12ch]",
        },
        {
            title: "CL Rewards",
            value: `${stats.rewards.cl.toFixed(8)} BTC`,
            icon: <Gift />,
            iconColor: "text-brand-600",
            valueClassName: "min-w-[12ch]",
        },
        {
            title: "EU Rewards",
            value: `${stats.rewards.eu.toFixed(8)} BTC`,
            icon: <Gift />,
            iconColor: "text-brand-500",
            valueClassName: "min-w-[12ch]",
        },
        {
            title: "Total Payouts Amount",
            value: payoutsTotal.toFixed(8),
            icon: <BoxIconLine />,
            iconColor: "text-accent-600",
            valueClassName: "min-w-[12ch]",
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map((card) => (
                <MetricCard key={card.title} {...card} loading={loading} />
            ))}
        </div>
    );
}
