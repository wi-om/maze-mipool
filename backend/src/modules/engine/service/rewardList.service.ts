import { AppDataSource } from "@common";
import { Account } from "@common";
import { CLReward } from "@common";
import { CMWallet } from "@common";
import { Contract } from "@common";
import { Reward } from "@common";
import { In, SelectQueryBuilder, ObjectLiteral } from "typeorm";
import { DateTime } from "luxon";

export type RewardListApiRow = {
  Id: number;
  AcNo: string;
  mipContractNo: string;
  Amount?: number | string | null;
  Type?: string | null;
  Hashrate?: string | number | null;
  CreatedOn?: Date | string | null;
  RewardDate?: string | null;
  account: { Parent: string | null; ClientID: string | null; Type: string | null } | null;
  contract: { Hashrate?: number | string | null; HashrateUnit?: string | null } | null;
};

function trimAcNo(acNo: string): string {
  return String(acNo).trim();
}

export function serializeRewardForApi(r: Reward): RewardListApiRow {
  const acc = r.account;
  const con = r.contract;
  const created =
    r.CreatedOn instanceof Date
      ? r.CreatedOn.toISOString()
      : typeof r.CreatedOn === "string"
        ? r.CreatedOn
        : null;
  const rewardDate = created
    ? DateTime.fromISO(created, { zone: "utc" }).setZone("Asia/Dubai").toISODate()
    : null;
  return {
    Id: r.Id,
    AcNo: r.AcNo,
    mipContractNo: r.mipContractNo,
    Amount: r.Amount,
    Type: r.Type,
    Hashrate: r.Hashrate,
    CreatedOn: r.CreatedOn,
    RewardDate: rewardDate,
    account: acc
      ? {
          Parent: acc.Parent ?? null,
          ClientID: acc.ClientID ?? null,
          Type: acc.Type ?? null,
        }
      : null,
    contract: con
      ? {
          Hashrate: con.Hashrate ?? null,
          HashrateUnit: con.HashrateUnit ?? null,
        }
      : null,
  };
}

export async function enrichRewardsForApi(rewards: Reward[]): Promise<RewardListApiRow[]> {
  if (!rewards.length) return [];

  const acNos = [...new Set(rewards.map((r) => trimAcNo(r.AcNo)).filter(Boolean))];
  const contractNos = [...new Set(rewards.map((r) => String(r.mipContractNo).trim()).filter(Boolean))];

  const [accounts, contracts] = await Promise.all([
    acNos.length
      ? AppDataSource.getRepository(Account).find({
          where: { AcNo: In(acNos) },
          select: ["AcNo", "Parent", "ClientID", "Type"],
        })
      : Promise.resolve([] as Account[]),
    contractNos.length
      ? AppDataSource.getRepository(Contract).find({
          where: { MipContractNo: In(contractNos) },
          select: ["MipContractNo", "Hashrate", "HashrateUnit"],
        })
      : Promise.resolve([] as Contract[]),
  ]);

  const accountByAcNo = new Map<string, Account>();
  for (const a of accounts) {
    accountByAcNo.set(trimAcNo(a.AcNo), a);
    accountByAcNo.set(a.AcNo, a);
  }

  const contractByNo = new Map<string, Contract>();
  for (const c of contracts) {
    contractByNo.set(String(c.MipContractNo).trim(), c);
  }

  return rewards.map((r) =>
    serializeRewardForApi(
      Object.assign(r, {
        account: accountByAcNo.get(trimAcNo(r.AcNo)) ?? null,
        contract: contractByNo.get(String(r.mipContractNo).trim()) ?? null,
      }),
    ),
  );
}

export function mapClRewardsWithDate<T extends { RewardOn?: Date | string | null }>(rewards: T[]) {
  return rewards.map((r) => {
    const src =
      r?.RewardOn instanceof Date
        ? r.RewardOn.toISOString()
        : typeof r?.RewardOn === "string"
          ? r.RewardOn
          : null;
    const RewardDate = src
      ? DateTime.fromISO(src, { zone: "utc" }).setZone("Asia/Dubai").toISODate()
      : null;
    return { ...r, RewardDate };
  });
}

export const DEFAULT_REWARDS_LIST_LIMIT = 10000;
export const DEFAULT_CL_REWARDS_LIMIT = 10000;
/** Hard cap for legacy (mca/mcc) full-list responses — must cover filtered row count for client-side sums. */
export const MAX_LEGACY_REWARDS_FETCH = 50000;
export const DEFAULT_DAYS_PER_PAGE = 10;
export const MAX_DAYS_PER_PAGE = 100;
export const DEFAULT_CM_WALLET_LIMIT = 5000;

export type DaysPaginatedListParams = {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
  summaryOnly?: boolean;
  /** True when client did not request pagination (backward compat for mca-delta / mcc-delta). */
  legacy: boolean;
};

export type DaysPaginatedListResult<T> = {
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    totalDays: number;
    totalRecords: number;
    totalAmount: number;
    totalNetAmount?: number;
    totalHostingFee?: number;
    totalSalesAmount?: number;
    latestBalance?: number;
    avgOc?: number | null;
    avgSla?: number | null;
  };
};

export type CLGroupBy = "day" | "month" | "year";

/** Aggregated period row returned when CL rewards are grouped by month or year. */
export type CLRewardPeriodRow = {
  /** 'YYYY-MM' for month grouping, 'YYYY' for year grouping. */
  period: string;
  periodType: "month" | "year";
  totalAmount: number;
  totalNetAmount: number;
  totalHostingFee: number;
  totalHashrate: number;
  rewardCount: number;
  avgOc: number | null;
  avgSla: number | null;
  /** Month breakdown, present only on year rows. */
  months?: CLRewardPeriodRow[];
};

export type CLRewardsListParams = DaysPaginatedListParams & { groupBy?: CLGroupBy };
export type CLRewardsListResult = DaysPaginatedListResult<
  ReturnType<typeof mapClRewardsWithDate>[number] | CLRewardPeriodRow
>;

export type EURewardsListParams = DaysPaginatedListParams & {
  acNos?: string[];
  groupBy?: CLGroupBy;
};

/** Aggregated period row returned when EU rewards are grouped by month or year. */
export type EURewardPeriodRow = {
  period: string;
  periodType: "month" | "year";
  totalAmount: number;
  totalHashrate: number;
  rewardCount: number;
  months?: EURewardPeriodRow[];
};

export type EURewardsListResult = DaysPaginatedListResult<RewardListApiRow | EURewardPeriodRow>;

function queryHasParam(query: Record<string, unknown>, key: string): boolean {
  const value = query[key];
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function parseDaysPaginatedParams(query: Record<string, unknown>): DaysPaginatedListParams {
  const summaryOnly = query.summaryOnly === "true" || query.summaryOnly === true;
  const legacy = !queryHasParam(query, "page") && !queryHasParam(query, "limit") && !summaryOnly;

  const dateFrom = typeof query.dateFrom === "string" && query.dateFrom ? query.dateFrom : undefined;
  const dateTo = typeof query.dateTo === "string" && query.dateTo ? query.dateTo : undefined;
  const search = typeof query.search === "string" ? query.search : undefined;

  if (legacy) {
    return { page: 1, limit: DEFAULT_DAYS_PER_PAGE, dateFrom, dateTo, search, summaryOnly: false, legacy: true };
  }

  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    MAX_DAYS_PER_PAGE,
    Math.max(1, parseInt(String(query.limit ?? DEFAULT_DAYS_PER_PAGE), 10) || DEFAULT_DAYS_PER_PAGE),
  );

  return { page, limit, dateFrom, dateTo, search, summaryOnly, legacy: false };
}

export function parseEURewardsListParams(
  query: Record<string, unknown>,
): Omit<EURewardsListParams, "acNos"> {
  const base = parseDaysPaginatedParams(query);
  const g = query.groupBy;
  const groupBy: CLGroupBy = g === "month" ? "month" : g === "year" ? "year" : "day";
  const legacy = groupBy === "day" ? base.legacy : false;
  return { ...base, legacy, groupBy };
}

export function parseClRewardsListParams(query: Record<string, unknown>): CLRewardsListParams {
  const base = parseDaysPaginatedParams(query);
  const g = query.groupBy;
  const groupBy: CLGroupBy = g === "month" ? "month" : g === "year" ? "year" : "day";
  // Grouped views aggregate every matching row, so they must never fall into legacy mode.
  const legacy = groupBy === "day" ? base.legacy : false;
  return { ...base, legacy, groupBy };
}

function normalizeDateKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function applyDateRangeFilter(
  qb: SelectQueryBuilder<ObjectLiteral>,
  alias: string,
  dateColumn: string,
  filters: Pick<DaysPaginatedListParams, "dateFrom" | "dateTo">,
) {
  const { dateFrom, dateTo } = filters;
  if (dateFrom) qb.andWhere(`DATE(${alias}.${dateColumn}) >= DATE(:dateFrom)`, { dateFrom });
  if (dateTo) qb.andWhere(`DATE(${alias}.${dateColumn}) <= DATE(:dateTo)`, { dateTo });
}

function applyTextSearchFilter(
  qb: SelectQueryBuilder<ObjectLiteral>,
  alias: string,
  search: string | undefined,
  fields: string[],
) {
  if (!search?.trim()) return;
  const clauses = fields.map((field) => `${alias}.${field} ILIKE :search`);
  qb.andWhere(`(${clauses.join(" OR ")})`, { search: `%${search.trim()}%` });
}

async function fetchDistinctDatesPage(
  createQb: () => SelectQueryBuilder<ObjectLiteral>,
  alias: string,
  dateColumn: string,
  page: number,
  limit: number,
): Promise<string[]> {
  const offset = (page - 1) * limit;
  const datesQb = createQb();
  datesQb
    .select(`DATE(${alias}.${dateColumn})`, "rewardDate")
    .groupBy(`DATE(${alias}.${dateColumn})`)
    .orderBy(`DATE(${alias}.${dateColumn})`, "DESC")
    .offset(offset)
    .limit(limit);
  const dateRows = await datesQb.getRawMany<{ rewardDate: string | Date }>();
  return dateRows.map((row) => normalizeDateKey(row.rewardDate));
}

type BasePaginationStats = {
  totalDays: number;
  totalRecords: number;
  totalAmount: number;
};

async function fetchBasePaginationStats(
  createQb: () => SelectQueryBuilder<ObjectLiteral>,
  alias: string,
  dateColumn: string,
  idColumn: string,
  amountColumn: string,
): Promise<BasePaginationStats> {
  const statsQb = createQb();
  statsQb
    .select(`COUNT(DISTINCT DATE(${alias}.${dateColumn}))`, "totalDays")
    .addSelect(`COUNT(${alias}.${idColumn})`, "totalRecords")
    .addSelect(`COALESCE(SUM(${alias}.${amountColumn}), 0)`, "totalAmount");
  const row = await statsQb.getRawOne<{ totalDays: string; totalRecords: string; totalAmount: string }>();
  return {
    totalDays: parseInt(row?.totalDays ?? "0", 10),
    totalRecords: parseInt(row?.totalRecords ?? "0", 10),
    totalAmount: parseFloat(row?.totalAmount ?? "0"),
  };
}

/** parseFloat that treats Postgres 'NaN' (and JS NaN) as null. */
function parseNumOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

async function fetchCLRewardPaginationStats(
  createQb: () => SelectQueryBuilder<CLReward>,
): Promise<
  BasePaginationStats & {
    avgOc: number | null;
    avgSla: number | null;
    totalNetAmount: number;
    totalHostingFee: number;
  }
> {
  const base = await fetchBasePaginationStats(createQb, "reward", "RewardOn", "Id", "Amount");
  const aggQb = createQb();
  aggQb
    .select("AVG(NULLIF(reward.oc, 'NaN'))", "avgOc")
    .addSelect("AVG(NULLIF(reward.sla, 'NaN'))", "avgSla")
    .addSelect("COALESCE(SUM(reward.net_amount), 0)", "totalNetAmount")
    .addSelect("COALESCE(SUM(reward.hostingfee_amount), 0)", "totalHostingFee");
  const row = await aggQb.getRawOne<{
    avgOc: string | null;
    avgSla: string | null;
    totalNetAmount: string | null;
    totalHostingFee: string | null;
  }>();
  return {
    ...base,
    avgOc: parseNumOrNull(row?.avgOc),
    avgSla: parseNumOrNull(row?.avgSla),
    totalNetAmount: parseFloat(row?.totalNetAmount ?? "0") || 0,
    totalHostingFee: parseFloat(row?.totalHostingFee ?? "0") || 0,
  };
}

/** Legacy clients sum `data[]` in the browser — fetch every filtered row up to a safety cap. */
export function resolveLegacyRowLimit(totalRecords: number): number {
  const count = Math.max(0, totalRecords);
  return Math.min(count, MAX_LEGACY_REWARDS_FETCH);
}

function applyClRewardFilters(
  qb: SelectQueryBuilder<CLReward>,
  alias: string,
  filters: Pick<CLRewardsListParams, "dateFrom" | "dateTo" | "search">,
) {
  applyDateRangeFilter(qb, alias, "RewardOn", filters);
  if (filters.search?.trim()) {
    qb.andWhere(
      `(${alias}.AcNo ILIKE :search OR CAST(${alias}.MipContractNo AS TEXT) ILIKE :search OR ${alias}.Type ILIKE :search)`,
      { search: `%${filters.search.trim()}%` },
    );
  }
}

export async function fetchLegacyCLRewards(
  params: Pick<CLRewardsListParams, "dateFrom" | "dateTo" | "search">,
): Promise<CLRewardsListResult> {
  const repo = AppDataSource.getRepository(CLReward);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("reward");
    applyClRewardFilters(qb, "reward", filters);
    return qb;
  };

  const stats = await fetchCLRewardPaginationStats(createFilteredQb);
  const rowLimit = resolveLegacyRowLimit(stats.totalRecords);
  const pagination = { page: 1, limit: rowLimit, ...stats };

  if (rowLimit === 0) {
    return { data: [], pagination };
  }

  const qb = createFilteredQb();
  qb.orderBy("reward.RewardOn", "DESC").take(rowLimit);
  const rewards = await qb.getMany();
  return { data: mapClRewardsWithDate(rewards), pagination };
}

export async function fetchCLRewards(params: CLRewardsListParams): Promise<CLRewardsListResult> {
  if (params.groupBy === "month") return fetchGroupedCLRewards(params, "month");
  if (params.groupBy === "year") return fetchGroupedCLRewards(params, "year");
  if (params.legacy) return fetchLegacyCLRewards(params);
  return fetchPaginatedCLRewards(params);
}

function clPeriodExpr(periodType: "month" | "year"): string {
  return periodType === "month" ? "to_char(reward.RewardOn, 'YYYY-MM')" : "to_char(reward.RewardOn, 'YYYY')";
}

function mapPeriodRaw(raw: Record<string, unknown>, periodType: "month" | "year"): CLRewardPeriodRow {
  const num = (v: unknown) => (v != null ? parseFloat(String(v)) : 0);
  return {
    period: String(raw.period ?? ""),
    periodType,
    totalAmount: num(raw.totalAmount),
    totalNetAmount: num(raw.totalNetAmount),
    totalHostingFee: num(raw.totalHostingFee),
    totalHashrate: num(raw.totalHashrate),
    rewardCount: parseInt(String(raw.rewardCount ?? "0"), 10) || 0,
    avgOc: parseNumOrNull(raw.avgOc as string | null),
    avgSla: parseNumOrNull(raw.avgSla as string | null),
  };
}

/** Aggregate CL rewards into month or year buckets, paginating over the distinct periods. */
async function fetchGroupedCLRewards(
  params: CLRewardsListParams,
  periodType: "month" | "year",
): Promise<CLRewardsListResult> {
  const repo = AppDataSource.getRepository(CLReward);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("reward");
    applyClRewardFilters(qb, "reward", filters);
    return qb;
  };
  const periodExpr = clPeriodExpr(periodType);

  const statsQb = createFilteredQb();
  statsQb
    .select(`COUNT(DISTINCT ${periodExpr})`, "totalGroups")
    .addSelect("COUNT(reward.Id)", "totalRecords")
    .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount")
    .addSelect("COALESCE(SUM(reward.net_amount), 0)", "totalNetAmount")
    .addSelect("COALESCE(SUM(reward.hostingfee_amount), 0)", "totalHostingFee")
    .addSelect("AVG(NULLIF(reward.oc, 'NaN'))", "avgOc")
    .addSelect("AVG(NULLIF(reward.sla, 'NaN'))", "avgSla");
  const stat = await statsQb.getRawOne<Record<string, unknown>>();

  const pagination = {
    page: params.page,
    limit: params.limit,
    totalDays: parseInt(String(stat?.totalGroups ?? "0"), 10) || 0,
    totalRecords: parseInt(String(stat?.totalRecords ?? "0"), 10) || 0,
    totalAmount: stat?.totalAmount != null ? parseFloat(String(stat.totalAmount)) : 0,
    totalNetAmount: stat?.totalNetAmount != null ? parseFloat(String(stat.totalNetAmount)) : 0,
    totalHostingFee: stat?.totalHostingFee != null ? parseFloat(String(stat.totalHostingFee)) : 0,
    avgOc: parseNumOrNull(stat?.avgOc as string | null),
    avgSla: parseNumOrNull(stat?.avgSla as string | null),
  };

  if (pagination.totalDays === 0) {
    return { data: [], pagination };
  }

  const pageQb = createFilteredQb();
  pageQb
    .select(periodExpr, "period")
    .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount")
    .addSelect("COALESCE(SUM(reward.net_amount), 0)", "totalNetAmount")
    .addSelect("COALESCE(SUM(reward.hostingfee_amount), 0)", "totalHostingFee")
    .addSelect("COALESCE(SUM(reward.Hashrate), 0)", "totalHashrate")
    .addSelect("COUNT(reward.Id)", "rewardCount")
    .addSelect("AVG(NULLIF(reward.oc, 'NaN'))", "avgOc")
    .addSelect("AVG(NULLIF(reward.sla, 'NaN'))", "avgSla")
    .groupBy(periodExpr)
    .orderBy(periodExpr, "DESC")
    .offset((params.page - 1) * params.limit)
    .limit(params.limit);
  const periodRaws = await pageQb.getRawMany<Record<string, unknown>>();
  const periods = periodRaws.map((r) => mapPeriodRaw(r, periodType));

  if (periodType === "year" && periods.length) {
    const years = periods.map((p) => p.period);
    const monthExpr = "to_char(reward.RewardOn, 'YYYY-MM')";
    const monthsQb = createFilteredQb();
    monthsQb
      .select(monthExpr, "period")
      .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount")
      .addSelect("COALESCE(SUM(reward.net_amount), 0)", "totalNetAmount")
      .addSelect("COALESCE(SUM(reward.hostingfee_amount), 0)", "totalHostingFee")
      .addSelect("COALESCE(SUM(reward.Hashrate), 0)", "totalHashrate")
      .addSelect("COUNT(reward.Id)", "rewardCount")
      .addSelect("AVG(NULLIF(reward.oc, 'NaN'))", "avgOc")
      .addSelect("AVG(NULLIF(reward.sla, 'NaN'))", "avgSla")
      .andWhere("to_char(reward.RewardOn, 'YYYY') IN (:...years)", { years })
      .groupBy(monthExpr)
      .orderBy(monthExpr, "DESC");
    const monthRaws = await monthsQb.getRawMany<Record<string, unknown>>();
    const byYear = new Map<string, CLRewardPeriodRow[]>();
    for (const raw of monthRaws) {
      const month = mapPeriodRaw(raw, "month");
      const year = month.period.slice(0, 4);
      const list = byYear.get(year) ?? [];
      list.push(month);
      byYear.set(year, list);
    }
    for (const p of periods) {
      p.months = byYear.get(p.period) ?? [];
    }
  }

  return { data: periods, pagination };
}

async function fetchPaginatedCLRewards(params: CLRewardsListParams): Promise<CLRewardsListResult> {
  const repo = AppDataSource.getRepository(CLReward);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("reward");
    applyClRewardFilters(qb, "reward", filters);
    return qb;
  };

  if (params.summaryOnly) {
    const stats = await fetchCLRewardPaginationStats(createFilteredQb);
    return {
      data: [],
      pagination: { page: params.page, limit: params.limit, ...stats },
    };
  }

  const [stats, dates] = await Promise.all([
    fetchCLRewardPaginationStats(createFilteredQb),
    fetchDistinctDatesPage(createFilteredQb, "reward", "RewardOn", params.page, params.limit),
  ]);

  const pagination = { page: params.page, limit: params.limit, ...stats };

  if (!dates.length) {
    return { data: [], pagination };
  }

  const rewardsQb = repo.createQueryBuilder("reward");
  applyClRewardFilters(rewardsQb, "reward", filters);
  rewardsQb.andWhere("DATE(reward.RewardOn) IN (:...dates)", { dates }).orderBy("reward.RewardOn", "DESC");
  const rewards = await rewardsQb.getMany();

  return { data: mapClRewardsWithDate(rewards), pagination };
}

function applyEURewardFilters(
  qb: SelectQueryBuilder<Reward>,
  alias: string,
  filters: Pick<EURewardsListParams, "dateFrom" | "dateTo" | "search">,
  acNos?: string[],
) {
  applyDateRangeFilter(qb, alias, "CreatedOn", filters);
  if (acNos?.length) {
    qb.andWhere(`${alias}.AcNo IN (:...acNos)`, { acNos });
  } else {
    applyTextSearchFilter(qb, alias, filters.search, ["AcNo", "mipContractNo", "Type"]);
  }
}

export async function fetchLegacyEURewards(params: EURewardsListParams): Promise<EURewardsListResult> {
  const repo = AppDataSource.getRepository(Reward);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("reward");
    applyEURewardFilters(qb, "reward", filters, params.acNos);
    return qb;
  };

  const stats = await fetchBasePaginationStats(createFilteredQb, "reward", "CreatedOn", "Id", "Amount");
  const rowLimit = resolveLegacyRowLimit(stats.totalRecords);
  const pagination = { page: 1, limit: rowLimit, ...stats };

  if (rowLimit === 0) {
    return { data: [], pagination };
  }

  const qb = createFilteredQb();
  qb.orderBy("reward.CreatedOn", "DESC").take(rowLimit);
  const rewards = await qb.getMany();
  return { data: await enrichRewardsForApi(rewards), pagination };
}

export async function fetchEURewards(params: EURewardsListParams): Promise<EURewardsListResult> {
  if (params.groupBy === "month") return fetchGroupedEURewards(params, "month");
  if (params.groupBy === "year") return fetchGroupedEURewards(params, "year");
  if (params.legacy) return fetchLegacyEURewards(params);
  return fetchPaginatedEURewards(params);
}

function euPeriodExpr(periodType: "month" | "year"): string {
  return periodType === "month" ? "to_char(reward.CreatedOn, 'YYYY-MM')" : "to_char(reward.CreatedOn, 'YYYY')";
}

function mapEUPeriodRaw(raw: Record<string, unknown>, periodType: "month" | "year"): EURewardPeriodRow {
  const num = (v: unknown) => (v != null ? parseFloat(String(v)) : 0);
  return {
    period: String(raw.period ?? ""),
    periodType,
    totalAmount: num(raw.totalAmount),
    totalHashrate: num(raw.totalHashrate),
    rewardCount: parseInt(String(raw.rewardCount ?? "0"), 10) || 0,
  };
}

/** Aggregate EU rewards into month or year buckets, paginating over the distinct periods. */
async function fetchGroupedEURewards(
  params: EURewardsListParams,
  periodType: "month" | "year",
): Promise<EURewardsListResult> {
  const repo = AppDataSource.getRepository(Reward);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("reward");
    applyEURewardFilters(qb, "reward", filters, params.acNos);
    return qb;
  };
  const periodExpr = euPeriodExpr(periodType);

  const statsQb = createFilteredQb();
  statsQb
    .select(`COUNT(DISTINCT ${periodExpr})`, "totalGroups")
    .addSelect("COUNT(reward.Id)", "totalRecords")
    .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount");
  const stat = await statsQb.getRawOne<Record<string, unknown>>();

  const pagination = {
    page: params.page,
    limit: params.limit,
    totalDays: parseInt(String(stat?.totalGroups ?? "0"), 10) || 0,
    totalRecords: parseInt(String(stat?.totalRecords ?? "0"), 10) || 0,
    totalAmount: stat?.totalAmount != null ? parseFloat(String(stat.totalAmount)) : 0,
  };

  if (pagination.totalDays === 0) {
    return { data: [], pagination };
  }

  const pageQb = createFilteredQb();
  pageQb
    .select(periodExpr, "period")
    .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount")
    .addSelect("COALESCE(SUM(CAST(reward.Hashrate AS DECIMAL)), 0)", "totalHashrate")
    .addSelect("COUNT(reward.Id)", "rewardCount")
    .groupBy(periodExpr)
    .orderBy(periodExpr, "DESC")
    .offset((params.page - 1) * params.limit)
    .limit(params.limit);
  const periodRaws = await pageQb.getRawMany<Record<string, unknown>>();
  const periods = periodRaws.map((r) => mapEUPeriodRaw(r, periodType));

  if (periodType === "year" && periods.length) {
    const years = periods.map((p) => p.period);
    const monthExpr = "to_char(reward.CreatedOn, 'YYYY-MM')";
    const monthsQb = createFilteredQb();
    monthsQb
      .select(monthExpr, "period")
      .addSelect("COALESCE(SUM(reward.Amount), 0)", "totalAmount")
      .addSelect("COALESCE(SUM(CAST(reward.Hashrate AS DECIMAL)), 0)", "totalHashrate")
      .addSelect("COUNT(reward.Id)", "rewardCount")
      .andWhere("to_char(reward.CreatedOn, 'YYYY') IN (:...years)", { years })
      .groupBy(monthExpr)
      .orderBy(monthExpr, "DESC");
    const monthRaws = await monthsQb.getRawMany<Record<string, unknown>>();
    const byYear = new Map<string, EURewardPeriodRow[]>();
    for (const raw of monthRaws) {
      const month = mapEUPeriodRaw(raw, "month");
      const year = month.period.slice(0, 4);
      const list = byYear.get(year) ?? [];
      list.push(month);
      byYear.set(year, list);
    }
    for (const p of periods) {
      p.months = byYear.get(p.period) ?? [];
    }
  }

  return { data: periods, pagination };
}

async function fetchPaginatedEURewards(params: EURewardsListParams): Promise<EURewardsListResult> {
  const repo = AppDataSource.getRepository(Reward);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("reward");
    applyEURewardFilters(qb, "reward", filters, params.acNos);
    return qb;
  };

  if (params.summaryOnly) {
    const stats = await fetchBasePaginationStats(createFilteredQb, "reward", "CreatedOn", "Id", "Amount");
    return {
      data: [],
      pagination: { page: params.page, limit: params.limit, ...stats },
    };
  }

  const [stats, dates] = await Promise.all([
    fetchBasePaginationStats(createFilteredQb, "reward", "CreatedOn", "Id", "Amount"),
    fetchDistinctDatesPage(createFilteredQb, "reward", "CreatedOn", params.page, params.limit),
  ]);

  const pagination = { page: params.page, limit: params.limit, ...stats };

  if (!dates.length) {
    return { data: [], pagination };
  }

  const rewardsQb = repo.createQueryBuilder("reward");
  applyEURewardFilters(rewardsQb, "reward", filters, params.acNos);
  rewardsQb.andWhere("DATE(reward.CreatedOn) IN (:...dates)", { dates }).orderBy("reward.CreatedOn", "DESC");
  const rewards = await rewardsQb.getMany();
  const data = await enrichRewardsForApi(rewards);

  return { data, pagination };
}

function applyCMWalletFilters(
  qb: SelectQueryBuilder<CMWallet>,
  alias: string,
  filters: Pick<DaysPaginatedListParams, "dateFrom" | "dateTo" | "search">,
) {
  applyDateRangeFilter(qb, alias, "rewardDate", filters);
  if (filters.search?.trim()) {
    qb.andWhere(
      `(${alias}.AcNo ILIKE :search OR CAST(${alias}.Amount AS TEXT) ILIKE :search OR CAST(${alias}.Sales_amount AS TEXT) ILIKE :search OR CAST(${alias}.Net_amount AS TEXT) ILIKE :search OR CAST(${alias}.Net_Balance AS TEXT) ILIKE :search)`,
      { search: `%${filters.search.trim()}%` },
    );
  }
}

export function mapCMWalletEntriesForApi(entries: CMWallet[]) {
  return entries.map((entry) => ({
    ...entry,
    RewardOn: entry.rewardDate,
  }));
}

export async function fetchLegacyCMWallet(
  params: Pick<DaysPaginatedListParams, "dateFrom" | "dateTo" | "search">,
): Promise<DaysPaginatedListResult<ReturnType<typeof mapCMWalletEntriesForApi>[number]>> {
  const repo = AppDataSource.getRepository(CMWallet);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("wallet");
    applyCMWalletFilters(qb, "wallet", filters);
    return qb;
  };

  const stats = await fetchCMWalletPaginationStats(createFilteredQb);
  const rowLimit = resolveLegacyRowLimit(stats.totalRecords);
  const pagination = { page: 1, limit: rowLimit, ...stats };

  if (rowLimit === 0) {
    return { data: [], pagination };
  }

  const qb = createFilteredQb();
  qb.orderBy("wallet.rewardDate", "DESC").take(rowLimit);
  const entries = await qb.getMany();
  return { data: mapCMWalletEntriesForApi(entries), pagination };
}

export async function fetchCMWallet(
  params: DaysPaginatedListParams,
): Promise<DaysPaginatedListResult<ReturnType<typeof mapCMWalletEntriesForApi>[number]>> {
  if (params.legacy) return fetchLegacyCMWallet(params);
  return fetchPaginatedCMWallet(params);
}

async function fetchCMWalletPaginationStats(
  createQb: () => SelectQueryBuilder<CMWallet>,
): Promise<BasePaginationStats & { totalNetAmount: number; totalSalesAmount: number }> {
  const statsQb = createQb();
  statsQb
    .select("COUNT(DISTINCT DATE(wallet.rewardDate))", "totalDays")
    .addSelect("COUNT(wallet.ID)", "totalRecords")
    .addSelect("COALESCE(SUM(wallet.Amount), 0)", "totalAmount")
    .addSelect("COALESCE(SUM(wallet.Net_amount), 0)", "totalNetAmount")
    .addSelect("COALESCE(SUM(wallet.Sales_amount), 0)", "totalSalesAmount");
  const row = await statsQb.getRawOne<{
    totalDays: string;
    totalRecords: string;
    totalAmount: string;
    totalNetAmount: string;
    totalSalesAmount: string;
  }>();
  return {
    totalDays: parseInt(row?.totalDays ?? "0", 10),
    totalRecords: parseInt(row?.totalRecords ?? "0", 10),
    totalAmount: parseFloat(row?.totalAmount ?? "0"),
    totalNetAmount: parseFloat(row?.totalNetAmount ?? "0"),
    totalSalesAmount: parseFloat(row?.totalSalesAmount ?? "0"),
  };
}

async function fetchPaginatedCMWallet(
  params: DaysPaginatedListParams,
): Promise<DaysPaginatedListResult<ReturnType<typeof mapCMWalletEntriesForApi>[number]>> {
  const repo = AppDataSource.getRepository(CMWallet);
  const filters = { dateFrom: params.dateFrom, dateTo: params.dateTo, search: params.search };
  const createFilteredQb = () => {
    const qb = repo.createQueryBuilder("wallet");
    applyCMWalletFilters(qb, "wallet", filters);
    return qb;
  };

  const latestBalancePromise = repo.find({
    order: { rewardDate: "DESC" },
    take: 1,
    select: ["Net_Balance"],
  });

  if (params.summaryOnly) {
    const [stats, latestEntry] = await Promise.all([
      fetchCMWalletPaginationStats(createFilteredQb),
      latestBalancePromise,
    ]);
    return {
      data: [],
      pagination: {
        page: params.page,
        limit: params.limit,
        ...stats,
        latestBalance: Number(latestEntry[0]?.Net_Balance ?? 0),
      },
    };
  }

  const [stats, dates, latestEntry] = await Promise.all([
    fetchCMWalletPaginationStats(createFilteredQb),
    fetchDistinctDatesPage(createFilteredQb, "wallet", "rewardDate", params.page, params.limit),
    latestBalancePromise,
  ]);

  const pagination = {
    page: params.page,
    limit: params.limit,
    ...stats,
    latestBalance: Number(latestEntry[0]?.Net_Balance ?? 0),
  };

  if (!dates.length) {
    return { data: [], pagination };
  }

  const entriesQb = repo.createQueryBuilder("wallet");
  applyCMWalletFilters(entriesQb, "wallet", filters);
  entriesQb.andWhere("DATE(wallet.rewardDate) IN (:...dates)", { dates }).orderBy("wallet.rewardDate", "DESC");
  const entries = await entriesQb.getMany();

  return { data: mapCMWalletEntriesForApi(entries), pagination };
}
