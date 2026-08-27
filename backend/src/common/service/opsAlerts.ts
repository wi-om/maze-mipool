/**
 * Ops alert emails (Redis / unhandled API failures).
 * Uses ADMIN_EMAIL + Azure Communication Services (same as rewardsCatchUpAlerts).
 * Never throws — logs on failure. Cooldown per alert key to avoid spam.
 */
import { sendEmail, adminEmail } from "../utils/email";
import { logger } from "../utils/logger";

/** Default: one email per key every 6 hours. */
const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const lastSentAt = new Map<string, number>();

export type OpsAlertType = "redis_disabled" | "api_error";

function cooldownMs(): number {
  const raw = Number(process.env.OPS_ALERT_COOLDOWN_MS || "");
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_MS;
}

function canSend(key: string): boolean {
  const last = lastSentAt.get(key) ?? 0;
  return Date.now() - last >= cooldownMs();
}

function markSent(key: string): void {
  lastSentAt.set(key, Date.now());
}

export async function sendOpsAlert(
  type: OpsAlertType,
  detail: string,
  opts?: { key?: string; path?: string },
): Promise<void> {
  if (!adminEmail) {
    logger.warn("[OpsAlert] ADMIN_EMAIL not set; skipping alert");
    return;
  }

  const key = opts?.key ?? `${type}:${opts?.path ?? "default"}`;
  if (!canSend(key)) {
    logger.debug(`[OpsAlert] cooldown active for ${key}`);
    return;
  }

  let subject: string;
  let body: string;
  const env = process.env.NODE_ENV || "unknown";

  switch (type) {
    case "redis_disabled":
      subject = `[ms-api] Redis disabled — falling back to memory (${env})`;
      body = [
        "Redis was disabled due to a fatal connection error.",
        "The API is using in-memory cache until Redis is fixed or REDIS_* app settings are removed.",
        "",
        `Environment: ${env}`,
        `Detail: ${detail}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n");
      break;
    case "api_error":
      subject = `[ms-api] Unhandled API error${opts?.path ? `: ${opts.path}` : ""} (${env})`;
      body = [
        "An unhandled server error occurred.",
        "",
        `Environment: ${env}`,
        `Path: ${opts?.path ?? "n/a"}`,
        `Detail: ${detail}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n");
      break;
  }

  try {
    await sendEmail(adminEmail, subject, body, { waitForDelivery: false });
    markSent(key);
    logger.info(`[OpsAlert] sent ${type} to ${adminEmail}`);
  } catch (err) {
    logger.error({ err }, "[OpsAlert] Failed to send alert email");
  }
}

/** Test helper */
export function resetOpsAlertCooldowns(): void {
  lastSentAt.clear();
}
