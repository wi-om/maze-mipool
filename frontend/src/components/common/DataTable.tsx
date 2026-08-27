import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import { Button } from "../ui/button";
import { dashboardPanelClass } from "./panelStyles";

export interface Column<T> {
    header: string | ReactNode;
    accessor: keyof T | ((item: T) => ReactNode);
    sortable?: boolean;
    sortKey?: string;
    searchValue?: (item: T) => string;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    loading?: boolean;
    emptyMessage?: string;
    leftActions?: ReactNode;
    rightActions?: ReactNode;
    searchPlaceholder?: string;
    searchKeys?: string[];
    defaultPageSize?: number;
    searchContainerClassName?: string;
    searchInputClassName?: string;
    lastColumnSkeleton?: "badges" | "action";
    serverPagination?: {
        currentPage: number;
        totalItems: number;
        itemsPerPage: number;
        onPageChange: (page: number) => void;
        onItemsPerPageChange?: (size: number) => void;
        itemLabel?: string;
    };
    onSearchChange?: (query: string) => void;
    searchValue?: string;
}

function getSortKey<T>(column: Column<T>): string | null {
    if (column.sortKey) return column.sortKey;
    if (typeof column.accessor === "string") return column.accessor;
    return null;
}

function getCellValue<T>(item: T, key: string): unknown {
    return key.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object" && part in (acc as object)) {
            return (acc as Record<string, unknown>)[part];
        }
        return undefined;
    }, item as unknown);
}

function compareValues(a: unknown, b: unknown, direction: "asc" | "desc"): number {
    const factor = direction === "asc" ? 1 : -1;

    if (a == null && b == null) return 0;
    if (a == null) return 1 * factor;
    if (b == null) return -1 * factor;

    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && String(a).trim() !== "") {
        return (numA - numB) * factor;
    }

    const dateA = new Date(String(a)).getTime();
    const dateB = new Date(String(b)).getTime();
    if (!Number.isNaN(dateA) && !Number.isNaN(dateB) && /[-T:]/.test(String(a))) {
        return (dateA - dateB) * factor;
    }

    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * factor;
}

function buildRowSearchText<T>(item: T, columns: Column<T>[], searchKeys?: string[]): string {
    const parts = new Set<string>();

    for (const column of columns) {
        if (column.searchValue) {
            parts.add(column.searchValue(item));
            continue;
        }
        const key = getSortKey(column);
        if (key) {
            const value = getCellValue(item, key);
            if (value != null) parts.add(String(value));
        } else if (typeof column.accessor === "string") {
            const value = item[column.accessor];
            if (value != null) parts.add(String(value));
        }
    }

    if (searchKeys) {
        for (const key of searchKeys) {
            const value = getCellValue(item, key);
            if (value != null) parts.add(String(value));
        }
    }

    return Array.from(parts).join(" ").toLowerCase();
}

export function DataTable<T extends Record<string, any>>({
    data,
    columns,
    loading,
    emptyMessage = "No entries found",
    leftActions,
    rightActions,
    searchPlaceholder = "Search…",
    searchKeys,
    defaultPageSize = 10,
    searchContainerClassName = "relative w-full min-w-[220px] sm:w-64",
    searchInputClassName = "",
    lastColumnSkeleton = "badges",
    serverPagination,
    onSearchChange,
    searchValue,
}: DataTableProps<T>) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(serverPagination?.itemsPerPage ?? defaultPageSize);
    const [localSearchQuery, setLocalSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

    const isServerMode = Boolean(serverPagination);
    const searchQuery = searchValue ?? localSearchQuery;
    const activePage = serverPagination?.currentPage ?? currentPage;
    const activePageSize = serverPagination?.itemsPerPage ?? itemsPerPage;

    useEffect(() => {
        if (!isServerMode) {
            setCurrentPage(1);
        }
    }, [searchQuery, data.length, itemsPerPage, isServerMode]);

    useEffect(() => {
        if (serverPagination) {
            setItemsPerPage(serverPagination.itemsPerPage);
        }
    }, [serverPagination?.itemsPerPage]);

    const handleSort = (key: string) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
            }
            return { key, direction: "asc" };
        });
    };

    const filteredData = useMemo(() => {
        if (isServerMode) return data;
        const query = searchQuery.trim().toLowerCase();
        if (!query) return data;
        return data.filter((item) => buildRowSearchText(item, columns, searchKeys).includes(query));
    }, [data, columns, searchKeys, searchQuery, isServerMode]);

    const sortedData = useMemo(() => {
        if (!sortConfig) return filteredData;
        return [...filteredData].sort((a, b) =>
            compareValues(getCellValue(a, sortConfig.key), getCellValue(b, sortConfig.key), sortConfig.direction),
        );
    }, [filteredData, sortConfig]);

    const paginatedData = useMemo(() => {
        if (isServerMode) return sortedData;
        const start = (activePage - 1) * activePageSize;
        return sortedData.slice(start, start + activePageSize);
    }, [sortedData, activePage, activePageSize, isServerMode]);

    const totalItems = serverPagination?.totalItems ?? sortedData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / activePageSize));
    const itemLabel = serverPagination?.itemLabel ?? "entries";

    return (
        <div className={`${dashboardPanelClass} overflow-hidden p-0`}>
            <div className="flex flex-col gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    {leftActions && <div className="flex items-center gap-2">{leftActions}</div>}
                    <div className="flex h-9 items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <span>Show</span>
                            <select
                                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm leading-none dark:border-gray-700 dark:bg-gray-900 dark:text-white outline-none focus:border-brand-400"
                                value={activePageSize}
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (serverPagination?.onItemsPerPageChange) {
                                        serverPagination.onItemsPerPageChange(next);
                                    } else {
                                        setItemsPerPage(next);
                                    }
                                }}
                            >
                            {[10, 25, 50, 100].map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                            <span>{itemLabel}</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end sm:ml-auto">
                    {rightActions && <div className="flex flex-wrap items-center gap-3">{rightActions}</div>}
                    <div className={searchContainerClassName}>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => {
                                const next = e.target.value;
                                if (onSearchChange) onSearchChange(next);
                                else setLocalSearchQuery(next);
                            }}
                            placeholder={searchPlaceholder}
                            className={`h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm leading-none text-gray-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white ${searchInputClassName}`}
                        />
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto admin-scroll">
                <Table>
                    <TableHeader className="bg-brand-50/60 dark:bg-brand-500/5">
                        <TableRow className="border-b border-gray-200 dark:border-gray-700">
                            {columns.map((column, idx) => {
                                const sortKey = getSortKey(column);
                                const isSorted = sortKey && sortConfig?.key === sortKey;

                                return (
                                    <TableCell
                                        key={idx}
                                        isHeader
                                        className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-brand-700 dark:text-brand-300"
                                    >
                                        {column.sortable && sortKey ? (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1.5 cursor-pointer select-none text-left hover:text-brand-600 dark:hover:text-brand-400"
                                                onClick={() => handleSort(sortKey)}
                                            >
                                                {column.header}
                                                {isSorted ? (
                                                    sortConfig?.direction === "asc" ? (
                                                        <ArrowUp className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <ArrowDown className="h-3.5 w-3.5" />
                                                    )
                                                ) : (
                                                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                                                )}
                                            </button>
                                        ) : (
                                            column.header
                                        )}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: activePageSize }, (_, rowIdx) => (
                                <TableRow
                                    key={`loading-${rowIdx}`}
                                    className="border-b border-gray-100 dark:border-gray-800"
                                    aria-hidden
                                >
                                    {columns.map((_, colIdx) => (
                                        <TableCell key={colIdx} className="px-4 py-3 align-top">
                                            {colIdx === columns.length - 1 ? (
                                                lastColumnSkeleton === "action" ? (
                                                    <div className="flex min-h-14 items-center">
                                                        <div className="h-8 w-[4.5rem] animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
                                                    </div>
                                                ) : (
                                                    <div className="flex min-h-14 flex-col justify-center gap-1.5">
                                                        <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                                                        <div className="h-5 w-20 animate-pulse rounded bg-gray-200/70 dark:bg-gray-700/70" />
                                                    </div>
                                                )
                                            ) : (
                                                <div className="flex min-h-14 items-center">
                                                    <div
                                                        className={cn(
                                                            "h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700",
                                                            colIdx === 0 ? "w-4" : "w-full max-w-[120px]",
                                                        )}
                                                    />
                                                </div>
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : paginatedData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-32 text-center text-gray-500 dark:text-gray-400">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedData.map((item, rowIdx) => (
                                <TableRow
                                    key={item.id || item.ID || item.Id || rowIdx}
                                    className="hover:bg-brand-50/40 dark:hover:bg-brand-500/5 transition-colors border-b border-gray-100 dark:border-gray-800"
                                >
                                    {columns.map((column, colIdx) => (
                                        <TableCell
                                            key={colIdx}
                                            className="px-4 py-3 align-middle min-h-14 text-left text-gray-900 dark:text-gray-200"
                                        >
                                            {typeof column.accessor === "function"
                                                ? column.accessor(item)
                                                : (item[column.accessor] as ReactNode)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 py-3 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="min-h-5 text-sm text-gray-500 dark:text-gray-400">
                        {loading ? (
                            "Loading entries…"
                        ) : (
                            <>
                                Showing {totalItems > 0 ? (activePage - 1) * activePageSize + 1 : 0} to{" "}
                                {Math.min(activePage * activePageSize, totalItems)} of {totalItems} {itemLabel}
                                {!isServerMode && searchQuery && sortedData.length !== data.length && (
                                    <span className="text-gray-400"> (filtered from {data.length})</span>
                                )}
                            </>
                        )}
                    </p>
                    <div className="flex min-h-9 min-w-[14rem] items-center justify-end gap-2 sm:ml-auto">
                        {totalPages > 1 && !loading && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const next = Math.max(1, activePage - 1);
                                        if (serverPagination) serverPagination.onPageChange(next);
                                        else setCurrentPage(next);
                                    }}
                                    disabled={activePage === 1 || loading}
                                >
                                    Previous
                                </Button>
                                <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                                    Page {activePage} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const next = Math.min(totalPages, activePage + 1);
                                        if (serverPagination) serverPagination.onPageChange(next);
                                        else setCurrentPage(next);
                                    }}
                                    disabled={activePage === totalPages || loading}
                                >
                                    Next
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
