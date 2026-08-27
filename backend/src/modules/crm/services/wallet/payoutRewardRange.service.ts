import { AppDataSource } from "@common";
import { Reward } from "@common";
import { Payout } from "@common";
import { In } from "typeorm";
import {
  inferPaidThroughFromPayoutCreatedOn,
  isRewardInPayableRange,
  normalizePaidThroughDate,
  rewardWorkDateFromCreatedOn,
} from "../../../engine/service/payoutWorkDate.util";

const COMPLETE_STATUSES = ["Complete"];

function trimAcNo(acNo: string): string {
  return String(acNo).trim();
}

function isCompletePayout(p: Payout): boolean {
  return COMPLETE_STATUSES.includes(p.Status) && Boolean(p.txid?.trim());
}

function lastPaidThroughFromPayout(payout: Payout): string | null {
  const fromColumn = normalizePaidThroughDate(payout.paidThroughDate);
  if (fromColumn) return fromColumn;
  if (!payout.CreatedOn) return null;
  return inferPaidThroughFromPayoutCreatedOn(
    payout.CreatedOn instanceof Date ? payout.CreatedOn : new Date(payout.CreatedOn),
  );
}

export type RewardRollup = {
  lastPaidThrough: string | null;
  totalRewards: number;
  totalCompletePaid: number;
  payableBalance: number;
  accruedBalance: number;
  daysPending: number;
  pendingByContract: Map<string, number>;
};

/** Single pass over rewards for one account (in-memory). */
export function rollupRewardsForAcNo(
  rewards: Reward[],
  lastPaidThrough: string | null,
  paidThroughDate: string,
  completePaidTotal: number,
): RewardRollup {
  let totalRewards = 0;
  let payableBalance = 0;
  let accruedBalance = 0;
  const pendingDays = new Set<string>();
  const pendingByContract = new Map<string, number>();

  for (const reward of rewards) {
    if (!reward.CreatedOn) continue;
    const amount = Number(reward.Amount || 0);
    totalRewards += amount;

    const workDate = rewardWorkDateFromCreatedOn(
      reward.CreatedOn instanceof Date ? reward.CreatedOn : new Date(reward.CreatedOn),
    );

    if (workDate > paidThroughDate) {
      accruedBalance += amount;
      continue;
    }

    if (!isRewardInPayableRange(workDate, lastPaidThrough, paidThroughDate)) continue;

    payableBalance += amount;
    pendingDays.add(workDate);
    const key = reward.mipContractNo;
    pendingByContract.set(key, Number(pendingByContract.get(key) || 0) + amount);
  }

  return {
    lastPaidThrough,
    totalRewards: Number(totalRewards.toFixed(8)),
    totalCompletePaid: Number(completePaidTotal.toFixed(8)),
    payableBalance: Number(payableBalance.toFixed(8)),
    accruedBalance: Number(accruedBalance.toFixed(8)),
    daysPending: pendingDays.size,
    pendingByContract,
  };
}

export type PayoutBatchIndex = {
  lastCompletePayoutByAcNo: Map<string, Payout>;
  lastPaidThroughByAcNo: Map<string, string | null>;
  completePaidTotalByAcNo: Map<string, number>;
};

export function indexPayoutsForAcNos(payouts: Payout[], acNos: string[]): PayoutBatchIndex {
  const acNoSet = new Set(acNos.map(trimAcNo));
  const lastCompletePayoutByAcNo = new Map<string, Payout>();
  const lastPaidThroughByAcNo = new Map<string, string | null>();
  const completePaidTotalByAcNo = new Map<string, number>();

  for (const acNo of acNos) {
    lastPaidThroughByAcNo.set(trimAcNo(acNo), null);
    completePaidTotalByAcNo.set(trimAcNo(acNo), 0);
  }

  const sorted = [...payouts].sort((a, b) => {
    const ta = a.CreatedOn ? new Date(a.CreatedOn).getTime() : 0;
    const tb = b.CreatedOn ? new Date(b.CreatedOn).getTime() : 0;
    return tb - ta;
  });

  for (const payout of sorted) {
    const key = trimAcNo(payout.AcNo);
    if (!acNoSet.has(key)) continue;

    if (isCompletePayout(payout)) {
      completePaidTotalByAcNo.set(
        key,
        Number(completePaidTotalByAcNo.get(key) || 0) + Number(payout.Amount || 0),
      );
      if (!lastCompletePayoutByAcNo.has(key)) {
        lastCompletePayoutByAcNo.set(key, payout);
        lastPaidThroughByAcNo.set(key, lastPaidThroughFromPayout(payout));
      }
    }
  }

  return { lastCompletePayoutByAcNo, lastPaidThroughByAcNo, completePaidTotalByAcNo };
}

export function groupRewardsByAcNo(rewards: Reward[]): Map<string, Reward[]> {
  const map = new Map<string, Reward[]>();
  for (const reward of rewards) {
    const key = trimAcNo(reward.AcNo);
    const list = map.get(key) ?? [];
    list.push(reward);
    map.set(key, list);
  }
  return map;
}

/** Batch-load rewards + payouts for many accounts (2 queries). */
export async function loadRewardsAndPayoutsForAcNos(acNos: string[]): Promise<{
  rewardsByAcNo: Map<string, Reward[]>;
  payoutIndex: PayoutBatchIndex;
}> {
  if (!acNos.length) {
    return {
      rewardsByAcNo: new Map(),
      payoutIndex: indexPayoutsForAcNos([], []),
    };
  }

  const rewardRepo = AppDataSource.getRepository(Reward);
  const payoutRepo = AppDataSource.getRepository(Payout);

  const [rewards, payouts] = await Promise.all([
    rewardRepo.find({ where: { AcNo: In(acNos) } }),
    payoutRepo.find({ where: { AcNo: In(acNos) } }),
  ]);

  return {
    rewardsByAcNo: groupRewardsByAcNo(rewards),
    payoutIndex: indexPayoutsForAcNos(payouts, acNos),
  };
}

// --- legacy per-account helpers (preview / commit) ---

export async function getLastCompletePayout(acNo: string): Promise<Payout | null> {
  const payoutRepo = AppDataSource.getRepository(Payout);
  return (
    (await payoutRepo
      .createQueryBuilder("p")
      .where('p."AcNo" = :acNo', { acNo: trimAcNo(acNo) })
      .andWhere("p.Status IN (:...statuses)", { statuses: COMPLETE_STATUSES })
      .andWhere("p.txid IS NOT NULL")
      .andWhere("TRIM(p.txid) <> ''")
      .orderBy('p."CreatedOn"', "DESC")
      .take(1)
      .getOne()) ?? null
  );
}

export async function getLastPaidThroughDate(acNo: string): Promise<string | null> {
  const last = await getLastCompletePayout(acNo);
  if (!last) return null;
  return lastPaidThroughFromPayout(last);
}

export async function sumPayableRewardsThroughDate(
  acNo: string,
  paidThroughDate: string,
): Promise<number> {
  const lastPaidThrough = await getLastPaidThroughDate(acNo);
  const rewardRepo = AppDataSource.getRepository(Reward);
  const rewards = await rewardRepo.find({ where: { AcNo: acNo } });
  return rollupRewardsForAcNo(rewards, lastPaidThrough, paidThroughDate, 0).payableBalance;
}

export async function sumAccruedRewardsAfterDate(acNo: string, paidThroughDate: string): Promise<number> {
  const rewardRepo = AppDataSource.getRepository(Reward);
  const rewards = await rewardRepo.find({ where: { AcNo: acNo } });
  return rollupRewardsForAcNo(rewards, null, paidThroughDate, 0).accruedBalance;
}

export async function countPendingRewardDays(acNo: string, paidThroughDate: string): Promise<number> {
  const lastPaidThrough = await getLastPaidThroughDate(acNo);
  const rewardRepo = AppDataSource.getRepository(Reward);
  const rewards = await rewardRepo.find({ where: { AcNo: acNo } });
  return rollupRewardsForAcNo(rewards, lastPaidThrough, paidThroughDate, 0).daysPending;
}

export async function aggregatePendingByContract(
  acNo: string,
  paidThroughDate: string,
): Promise<Map<string, number>> {
  const lastPaidThrough = await getLastPaidThroughDate(acNo);
  const rewardRepo = AppDataSource.getRepository(Reward);
  const rewards = await rewardRepo.find({ where: { AcNo: acNo } });
  return rollupRewardsForAcNo(rewards, lastPaidThrough, paidThroughDate, 0).pendingByContract;
}
