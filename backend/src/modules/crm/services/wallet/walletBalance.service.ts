/**
 * Wallet balance layer for EU manual payouts.
 *
 * Wallets.Balance = total accrued (all rewards credited − all complete payouts debited).
 * Payable amount uses reward work-dates via payoutRewardRange.service.
 */
import { AppDataSource } from "@common";
import { Reward } from "@common";
import { Payout } from "@common";
import { Wallet } from "@common/entities/Wallet";
import { Repository } from "typeorm";

export { getLastCompletePayout, getLastPaidThroughDate, sumPayableRewardsThroughDate, sumAccruedRewardsAfterDate } from "./payoutRewardRange.service";

const COMPLETE_STATUSES = ["Complete"];

export async function getExpectedWalletBalance(acNo: string): Promise<number> {
  const rewardRepo = AppDataSource.getRepository(Reward);
  const payoutRepo = AppDataSource.getRepository(Payout);

  const rewards = await rewardRepo.find({ where: { AcNo: acNo } });
  const payouts = await payoutRepo.find({ where: { AcNo: acNo } });

  const totalRewards = rewards.reduce((sum, r) => sum + Number(r.Amount || 0), 0);
  const totalPaid = payouts
    .filter((p) => COMPLETE_STATUSES.includes(p.Status) && Boolean(p.txid?.trim()))
    .reduce((sum, p) => sum + Number(p.Amount || 0), 0);

  return Number((totalRewards - totalPaid).toFixed(8));
}

async function findWalletForBalance(walletRepo: Repository<Wallet>, acNo: string): Promise<Wallet | null> {
  const active = await walletRepo.findOne({
    where: { AcNo: acNo, IsActive: true },
    order: { CreatedOn: "DESC" },
  });
  if (active) return active;

  const recent = await walletRepo.findOne({
    where: { AcNo: acNo },
    order: { CreatedOn: "DESC" },
  });
  if (recent) {
    console.warn(`[walletBalance] No active wallet for ${acNo}, using most recent wallet ID ${recent.ID}`);
  }
  return recent;
}

export async function creditWalletBalance(acNo: string, amount: number): Promise<void> {
  if (amount <= 0) return;

  await AppDataSource.transaction(async (dbTransaction) => {
    const walletRepo = dbTransaction.getRepository(Wallet);
    const wallet = await findWalletForBalance(walletRepo, acNo);
    if (!wallet) {
      console.warn(`[walletBalance] No wallet for ${acNo}, skipping credit of ${amount}`);
      return;
    }
    const newBalance = Number(wallet.Balance || 0) + amount;
    await walletRepo.update(wallet.ID, { Balance: newBalance, ModifiedOn: new Date() });
  });
}

export async function debitWalletBalance(acNo: string, amount: number): Promise<void> {
  await AppDataSource.transaction(async (dbTransaction) => {
    await debitWalletBalanceInTransaction(dbTransaction.getRepository(Wallet), acNo, amount);
  });
}

export async function debitWalletBalanceInTransaction(
  walletRepo: Repository<Wallet>,
  acNo: string,
  amount: number,
): Promise<void> {
  const wallet = await findWalletForBalance(walletRepo, acNo);
  if (!wallet) return;

  const prevBalance = Number(wallet.Balance || 0);
  const debitAmount = amount > 0 ? Math.min(amount, prevBalance) : prevBalance;
  const newBalance = Math.max(0, prevBalance - debitAmount);
  await walletRepo.update(wallet.ID, { Balance: newBalance, ModifiedOn: new Date() });
}

export async function reconcileBalance(
  acNo: string,
): Promise<{ fixed: boolean; previousBalance: number; expectedBalance: number }> {
  return AppDataSource.transaction(async (dbTransaction) => {
    const walletRepo = dbTransaction.getRepository(Wallet);
    const wallet = await findWalletForBalance(walletRepo, acNo);
    const previousBalance = Number(wallet?.Balance || 0);
    const expectedBalance = await getExpectedWalletBalance(acNo);

    if (!wallet || Math.abs(previousBalance - expectedBalance) < 1e-10) {
      return { fixed: false, previousBalance, expectedBalance };
    }

    await walletRepo.update(wallet.ID, {
      Balance: expectedBalance,
      ModifiedOn: new Date(),
    });
    return { fixed: true, previousBalance, expectedBalance };
  });
}
