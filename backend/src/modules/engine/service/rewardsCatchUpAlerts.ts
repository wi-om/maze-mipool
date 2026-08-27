/**
 * Email alerts for catch-up / cron (never throws — logs on failure).
 *
 * Called from:
 *   backgroundRewardsCatchUp — mips_missing | calculation_failed (per failed day)
 *   rewardsCron.controller — cron_priority (5 failures in one Dubai day)
 *
 * Recipient: ADMIN_EMAIL via Azure Communication Services (sendEmail).
 */
import { sendEmail, adminEmail } from "@common/utils/email";
import { logger } from "@common";
import { getMaxCronFailuresPerDay } from "./cronFailureTracker";

export type RewardsAlertType = "mips_missing" | "calculation_failed" | "cron_priority";

export async function sendRewardsCatchUpAlert(
  type: RewardsAlertType,
  workDate: string,
  detail?: string
): Promise<void> {
  // No recipient configured — skip silently with log
  if (!adminEmail) {
    logger.warn("[RewardsCatchUp] ADMIN_EMAIL not set; skipping alert");
    return;
  }

  let subject: string;
  let body: string;
  const maxFailures = getMaxCronFailuresPerDay();

  // Pick template by failure type
  switch (type) {
    case "mips_missing":
      subject = `[Rewards] Missing MIPS data for work date ${workDate}`;
      body = `Rewards catch-up could not find MIPS pool data for work date ${workDate}.\n\n${detail || ""}`;
      break;
    case "calculation_failed":
      subject = `[Rewards] Calculation failed for ${workDate}`;
      body = `executeMasterRewardDistribution failed for work date ${workDate}.\n\n${detail || ""}`;
      break;
    case "cron_priority":
      subject = `[Rewards] CRITICAL: ${maxFailures} failed cron attempts on ${workDate}`;
      body = `Daily rewards cron reached the maximum failure count (${maxFailures}) for Dubai date ${workDate}. No further cron retries will run until the next Dubai day.\n\n${detail || ""}`;
      break;
  }

  try {
    await sendEmail(adminEmail, subject, body.trim());
  } catch (err) {
    logger.error("[RewardsCatchUp] Failed to send alert email:", err);
  }
}
