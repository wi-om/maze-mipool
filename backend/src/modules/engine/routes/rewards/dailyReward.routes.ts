import { Router } from "express";
import {
  calculateDailyRewardsHandler,
  getDailyRewardsHandler,
  calculateBulkDailyRewardsHandler,
  checkDailyRewardsExistHandler,
  checkMipsDataAvailabilityHandler,
  getLatestUnitRewardHandler,
  getUnitRewardsHistoryHandler,
  getCLContractRangeEligibilityHandler,
} from "../../controllers/rewards/dailyReward.controller";
import { rewardsCronJobHandler } from "../../controllers/rewards/rewardsCron.controller";
import { verifyCronSecret } from "@common/middlewares/verifyCronSecret";

const router = Router();

/**
 * Azure cron chain (order matters):
 *   POST /api/rewards/daily/cron
 *     → verifyCronSecret (401/503 if bad/missing x-cron-secret)
 *     → rewardsCronJobHandler (await catch-up, failure budget, always 200 on business errors)
 */
router.post("/cron", verifyCronSecret, rewardsCronJobHandler);

// Master Calc: Calculate & Distribute rewards for single day
router.post("/calculate", calculateDailyRewardsHandler);

// Bulk Master Calc: Date range processing
router.post("/bulk", calculateBulkDailyRewardsHandler);

// Check if bulk dates already have reward entries
router.get("/check-existence", checkDailyRewardsExistHandler);

// Get Unit Reward history
router.get("/unit-history", getUnitRewardsHistoryHandler);

// Check if MIPS data is available for dates
router.get("/check-mips", checkMipsDataAvailabilityHandler);

// Preview CL contract participation for a bulk range (ContractStartDate / ContractEndDate)
router.get("/cl-eligibility", getCLContractRangeEligibilityHandler);

// Get the most recent Unit Reward record
router.get("/latest-unit-reward", getLatestUnitRewardHandler);

// Get all EU rewards history (Combined view)
router.get("/", getDailyRewardsHandler);

export default router;
