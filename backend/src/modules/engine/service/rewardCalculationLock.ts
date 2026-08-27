/**
 * Process-wide mutex for reward calculation (manual, bulk, catch-up, cron).
 * Catch-up holds the lock for the whole multi-day run; manual uses per-call acquire.
 */
let locked = false;

export class RewardCalculationBusyError extends Error {
  constructor() {
    super("Reward calculation already in progress");
    this.name = "RewardCalculationBusyError";
  }
}

export function isRewardCalculationInProgress(): boolean {
  return locked;
}

/** @deprecated alias */
export const isCatchupInProgress = isRewardCalculationInProgress;

/** Per-call lock for manual / bulk / single executeMasterRewardDistribution. */
export function acquireRewardCalculationLock(): void {
  if (locked) throw new RewardCalculationBusyError();
  locked = true;
}

export function releaseRewardCalculationLock(): void {
  locked = false;
}

/** Whole-run lock for catch-up / cron multi-day loop. Returns false if already busy. */
export function tryAcquireRewardCalculationLock(): boolean {
  if (locked) return false;
  locked = true;
  return true;
}
