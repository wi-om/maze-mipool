import { useCallback, useEffect, useRef, useState } from "react";
import type { PaginatedListMeta } from "../api/services/rewardService";

type PaginatedFetchParams = Record<string, string | number | boolean | undefined>;

type CachedPage<T> = {
    data: T[];
    pagination: PaginatedListMeta;
};

function stableParamsKey(params: PaginatedFetchParams): string {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(params).sort()) {
        sorted[key] = params[key];
    }
    return JSON.stringify(sorted);
}

type UsePaginatedFetchOptions<T, P extends PaginatedFetchParams> = {
    enabled: boolean;
    currentPage: number;
    buildParams: (page: number) => P;
    fetchFn: (params: P) => Promise<{ data: T[]; pagination: PaginatedListMeta }>;
    emptyPagination: PaginatedListMeta;
    /** Changes when filters/search/page-size change — clears the in-memory page cache. */
    queryScope: string;
    onError?: (error: unknown) => void;
};

export function usePaginatedFetch<T, P extends PaginatedFetchParams>({
    enabled,
    currentPage,
    buildParams,
    fetchFn,
    emptyPagination,
    queryScope,
    onError,
}: UsePaginatedFetchOptions<T, P>) {
    const [data, setData] = useState<T[]>([]);
    const [pagination, setPagination] = useState<PaginatedListMeta>(emptyPagination);
    const [loading, setLoading] = useState(false);
    const cacheRef = useRef(new Map<string, CachedPage<T>>());
    const inflightRef = useRef(new Map<string, Promise<CachedPage<T>>>());
    const fetchIdRef = useRef(0);
    const queryScopeRef = useRef(queryScope);

    const buildParamsRef = useRef(buildParams);
    const fetchFnRef = useRef(fetchFn);
    const onErrorRef = useRef(onError);
    buildParamsRef.current = buildParams;
    fetchFnRef.current = fetchFn;
    onErrorRef.current = onError;

    if (queryScopeRef.current !== queryScope) {
        queryScopeRef.current = queryScope;
        cacheRef.current.clear();
        inflightRef.current.clear();
    }

    const applyPageToState = useCallback((page: CachedPage<T>) => {
        setLoading(false);
        setData(page.data);
        setPagination(page.pagination);
    }, []);

    const loadPage = useCallback(
        async (page: number, options?: { force?: boolean; background?: boolean }) => {
            if (!enabled) return;

            const params = buildParamsRef.current(page);
            const cacheKey = stableParamsKey(params);
            const cached = cacheRef.current.get(cacheKey);

            if (cached && !options?.force) {
                if (!options?.background) {
                    applyPageToState(cached);
                }
                return cached;
            }

            const existing = inflightRef.current.get(cacheKey);
            if (existing && !options?.force) {
                const requestId = ++fetchIdRef.current;
                if (!options?.background) {
                    setLoading(true);
                }
                try {
                    const result = await existing;
                    if (!options?.background && requestId === fetchIdRef.current) {
                        applyPageToState(result);
                    }
                    return result;
                } catch (error) {
                    if (!options?.background) {
                        onErrorRef.current?.(error);
                    }
                    throw error;
                }
            }

            const requestId = ++fetchIdRef.current;
            if (!options?.background) {
                setLoading(true);
            }

            const promise = (async (): Promise<CachedPage<T>> => {
                const result = await fetchFnRef.current(params);
                const entry = { data: result.data, pagination: result.pagination };
                cacheRef.current.set(cacheKey, entry);
                return entry;
            })();

            inflightRef.current.set(cacheKey, promise);

            try {
                const result = await promise;
                if (!options?.background && requestId === fetchIdRef.current) {
                    setData(result.data);
                    setPagination(result.pagination);
                }
                return result;
            } catch (error) {
                if (!options?.background) {
                    onErrorRef.current?.(error);
                }
                throw error;
            } finally {
                inflightRef.current.delete(cacheKey);
                if (!options?.background && requestId === fetchIdRef.current) {
                    setLoading(false);
                }
            }
        },
        [enabled, applyPageToState],
    );

    useEffect(() => {
        if (!enabled) {
            setData([]);
            setPagination(emptyPagination);
            return;
        }
        void loadPage(currentPage);
    }, [enabled, currentPage, queryScope, loadPage, emptyPagination]);

    const pageLimit = Number(buildParamsRef.current(currentPage).limit) || emptyPagination.limit || 10;
    const totalPages = Math.max(1, Math.ceil(pagination.totalDays / pageLimit));

    useEffect(() => {
        if (!enabled || loading || currentPage >= totalPages) return;

        const nextKey = stableParamsKey(buildParamsRef.current(currentPage + 1));
        if (cacheRef.current.has(nextKey) || inflightRef.current.has(nextKey)) return;

        void loadPage(currentPage + 1, { background: true }).catch(() => {});
    }, [enabled, loading, currentPage, totalPages, loadPage]);

    const refresh = useCallback(() => {
        const key = stableParamsKey(buildParamsRef.current(currentPage));
        cacheRef.current.delete(key);
        inflightRef.current.delete(key);
        return loadPage(currentPage, { force: true });
    }, [currentPage, loadPage]);

    const invalidateAll = useCallback(() => {
        cacheRef.current.clear();
        inflightRef.current.clear();
    }, []);

    return {
        data,
        pagination,
        loading,
        totalPages,
        loadPage,
        refresh,
        invalidateAll,
    };
}
