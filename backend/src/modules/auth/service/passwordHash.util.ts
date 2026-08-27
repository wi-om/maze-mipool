import { timingSafeEqual } from "crypto";

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

/** Client sends SHA256(plainPassword) as 64-char lowercase hex. */
export function normalizePasswordHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(trimmed)) return null;
  return trimmed;
}

export function passwordsMatch(stored: string, provided: string): boolean {
  const a = Buffer.from(stored.toLowerCase(), "utf8");
  const b = Buffer.from(provided.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sanitizeMipsUserForApi<T extends { Password?: string | null }>(
  user: T,
): Omit<T, "Password"> {
  const { Password: _removed, ...safe } = user;
  return safe;
}
