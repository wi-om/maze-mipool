/**
 * Daily reconciliation: Rewards vs Payouts vs blockchain_payout totals by calendar date.
 */
import { AppDataSource } from "@common";

const AMOUNT_EPSILON = 1e-8;

export type DailyCompareRow = {
  date: string;
  rewardsAmount: number;
  payoutAmount: number;
  blockchainAmount: number;
  /** payout − blockchain */
  difference: number;
  status: "match" | "mismatch";
};

export type DailyCompareParams = {
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
};

export type DailyCompareResult = {
  data: DailyCompareRow[];
  pagination: {
    page: number;
    limit: number;
    totalDays: number;
    totalRecords: number;
    totalAmount: number;
    totalRewardsAmount: number;
    totalPayoutAmount: number;
    totalBlockchainAmount: number;
  };
};

function round8(n: number): number {
  return Number(n.toFixed(8));
}

function rowStatus(payout: number, blockchain: number): "match" | "mismatch" {
  if (Math.abs(payout - blockchain) > AMOUNT_EPSILON) return "mismatch";
  return "match";
}

function displayRewards(rawRewards: number, payout: number): number {
  if (payout <= AMOUNT_EPSILON) return 0;
  return round8(rawRewards);
}

function mapRow(raw: RawDailyRow): DailyCompareRow {
  const rawRewards = round8(Number(raw.rewards || 0));
  const payoutAmount = round8(Number(raw.payouts || 0));
  const blockchainAmount = round8(Number(raw.blockchain || 0));
  const rewardsAmount = displayRewards(rawRewards, payoutAmount);
  return {
    date: String(raw.d),
    rewardsAmount,
    payoutAmount,
    blockchainAmount,
    difference: round8(payoutAmount - blockchainAmount),
    status: rowStatus(payoutAmount, blockchainAmount),
  };
}

type RawDailyRow = {
  d: string;
  rewards: string | number;
  payouts: string | number;
  blockchain: string | number;
  reward_rows: number;
  payout_rows: number;
  blockchain_rows: number;
};

function buildDateFilter(alias: string, dateFrom?: string, dateTo?: string): { clause: string; params: string[] } {
  const params: string[] = [];
  const parts: string[] = [];
  if (dateFrom) {
    params.push(dateFrom);
    parts.push(`${alias}.d >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    parts.push(`${alias}.d <= $${params.length}`);
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export async function fetchDailyReconciliation(params: DailyCompareParams): Promise<DailyCompareResult> {
  const page = Math.max(1, params.page);
  const limit = Math.min(100, Math.max(1, params.limit));
  const offset = (page - 1) * limit;

  const baseCte = `
    WITH reward_daily AS (
      SELECT to_char("CreatedOn", 'YYYY-MM-DD') AS d,
             COALESCE(SUM("Amount"::numeric), 0)::numeric(24,8) AS total,
             COUNT(*)::int AS n
      FROM "Rewards"
      GROUP BY 1
    ),
    payout_daily AS (
      SELECT to_char("CreatedOn", 'YYYY-MM-DD') AS d,
             COALESCE(SUM("Amount"::numeric), 0)::numeric(24,8) AS total,
             COUNT(*)::int AS n
      FROM "Payouts"
      GROUP BY 1
    ),
    bc_daily AS (
      SELECT to_char(txn_date, 'YYYY-MM-DD') AS d,
             COALESCE(SUM(amount::numeric), 0)::numeric(24,8) AS total,
             COUNT(*)::int AS n
      FROM blockchain_payout
      WHERE ac_no IS NOT NULL AND btrim(ac_no) <> ''
      GROUP BY 1
    ),
    all_days AS (
      SELECT d FROM reward_daily
      UNION
      SELECT d FROM payout_daily
      UNION
      SELECT d FROM bc_daily
    ),
    merged AS (
      SELECT ad.d,
             COALESCE(r.total, 0)::numeric(24,8) AS rewards,
             COALESCE(p.total, 0)::numeric(24,8) AS payouts,
             COALESCE(b.total, 0)::numeric(24,8) AS blockchain,
             COALESCE(r.n, 0)::int AS reward_rows,
             COALESCE(p.n, 0)::int AS payout_rows,
             COALESCE(b.n, 0)::int AS blockchain_rows
      FROM all_days ad
      LEFT JOIN reward_daily r ON r.d = ad.d
      LEFT JOIN payout_daily p ON p.d = ad.d
      LEFT JOIN bc_daily b ON b.d = ad.d
    )
  `;

  const filter = buildDateFilter("merged", params.dateFrom, params.dateTo);
  const paramOffset = filter.params.length;

  const countRows = await AppDataSource.query(
    `${baseCte} SELECT COUNT(*)::int AS n FROM merged ${filter.clause}`,
    filter.params,
  );
  const totalDays = Number(countRows[0]?.n || 0);

  const totalsRows = await AppDataSource.query(
    `
    ${baseCte}
    SELECT COALESCE(SUM(CASE WHEN payouts = 0 THEN 0 ELSE rewards END), 0)::numeric(24,8) AS total_rewards,
           COALESCE(SUM(payouts), 0)::numeric(24,8) AS total_payouts,
           COALESCE(SUM(blockchain), 0)::numeric(24,8) AS total_blockchain,
           COALESCE(SUM(reward_rows), 0)::int AS total_reward_rows
    FROM merged ${filter.clause}
    `,
    filter.params,
  );

  const pageParams = [...filter.params, limit, offset];
  const pageRows: RawDailyRow[] = await AppDataSource.query(
    `
    ${baseCte}
    SELECT merged.d,
           merged.rewards,
           merged.payouts,
           merged.blockchain,
           merged.reward_rows,
           merged.payout_rows,
           merged.blockchain_rows
    FROM merged
    ${filter.clause}
    ORDER BY merged.d DESC
    LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}
    `,
    pageParams,
  );

  const totals = totalsRows[0] ?? {};
  const data = pageRows.map(mapRow);

  return {
    data,
    pagination: {
      page,
      limit,
      totalDays,
      totalRecords: Number(totals.total_reward_rows || 0),
      totalAmount: round8(Number(totals.total_rewards || 0)),
      totalRewardsAmount: round8(Number(totals.total_rewards || 0)),
      totalPayoutAmount: round8(Number(totals.total_payouts || 0)),
      totalBlockchainAmount: round8(Number(totals.total_blockchain || 0)),
    },
  };
}

export function mapDailyCompareRowForTest(raw: RawDailyRow): DailyCompareRow {
  return mapRow(raw);
}
