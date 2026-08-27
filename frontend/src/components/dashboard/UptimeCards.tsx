import { Activity } from "lucide-react";
import MetricCard from "../common/MetricCard";
import type { CLUptimeStats } from "../../api/services/rewardService";

type UptimeCard = {
    title: string;
    key: keyof CLUptimeStats;
};

const cards: UptimeCard[] = [
    { title: "Today(Uptime)", key: "today" },
    { title: "Yesterday (Uptime)", key: "yesterday" },
    { title: "This Month(Uptime)", key: "thisMonth" },
    { title: "Last month(Uptime)", key: "lastMonth" },
    { title: "This Year(Uptime)", key: "thisYear" },
];

function formatUptime(sla: number | null): string {
    if (sla == null || !Number.isFinite(sla)) return "—";
    return `${(sla * 100).toFixed(2)}%`;
}

function uptimeIconColor(sla: number | null): string {
    if (sla == null || !Number.isFinite(sla)) return "text-gray-400";
    const pct = sla * 100;
    if (pct >= 99.5) return "text-emerald-600";
    if (pct >= 99) return "text-brand-600";
    if (pct >= 98) return "text-amber-500";
    return "text-red-500";
}

type UptimeCardsProps = {
    stats: CLUptimeStats | null;
    loading?: boolean;
};

export default function UptimeCards({ stats, loading = false }: UptimeCardsProps) {
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            {cards.map((card) => {
                const sla = stats?.[card.key] ?? null;
                return (
                    <MetricCard
                        key={card.key}
                        title={card.title}
                        value={formatUptime(sla)}
                        icon={<Activity />}
                        iconColor={uptimeIconColor(sla)}
                        loading={loading}
                        valueClassName="min-w-[6ch]"
                    />
                );
            })}
        </div>
    );
}
