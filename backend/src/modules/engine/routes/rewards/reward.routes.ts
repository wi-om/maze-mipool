import { Router } from "express";
import { getRewardsByClientId, getRewardsHandler, getRewardStatsHandler } from "../../controllers/rewards/reward.controller";
import { getCLRewardsHandler, getCMWalletHandler, getCLUptimeHandler } from "../../controllers/rewards/clReward.controller";

const router = Router();

router.get("/cl/uptime", getCLUptimeHandler);
router.get("/cl", getCLRewardsHandler);
router.get("/wallet", getCMWalletHandler);
router.get("/stats", getRewardStatsHandler);
router.get("/", getRewardsHandler);
router.get("/client/:clientid", getRewardsByClientId);

export default router;
