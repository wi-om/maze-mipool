import { Request, Response, NextFunction } from "express";

/**
 * Auth gate for POST /api/rewards/daily/cron only.
 *
 * Flow:
 *   1. Read REWARDS_CRON_SECRET from server env → if missing, 503 (misconfiguration)
 *   2. Read x-cron-secret header from request (Azure Function sends this)
 *   3. Compare header to env → mismatch/missing → 401 (no handler runs)
 *   4. Match → next() → rewardsCronJobHandler
 *
 * Dashboard GET /api/yields never hits this middleware.
 */
export function verifyCronSecret(req: Request, res: Response, next: NextFunction) {
  // Step 1: server must have secret configured (live App Service / .env)
  const expected = process.env.REWARDS_CRON_SECRET;
  if (!expected) {
    return res.status(503).json({
      error: "REWARDS_CRON_SECRET is not configured on the server",
    });
  }

  // Step 2–3: caller must present the same value (Azure Function app setting)
  const provided = req.headers["x-cron-secret"];
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Step 4: authorized — proceed to cron handler
  next();
}
