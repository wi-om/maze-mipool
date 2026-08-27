type DateTimeCellProps = {
    value?: string | Date | null;
    fallback?: string;
};

export default function DateTimeCell({ value, fallback = "—" }: DateTimeCellProps) {
    if (!value) return <span className="text-gray-400">{fallback}</span>;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return <span className="text-gray-400">{fallback}</span>;

    return (
        <div className="flex flex-col">
            <span className="font-medium text-gray-900 dark:text-white">
                {date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                })}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
                {date.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                })}
            </span>
        </div>
    );
}
