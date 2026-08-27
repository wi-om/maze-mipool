export type HashrateUnit = "H" | "KH" | "MH" | "GH" | "TH" | "PH" | "EH";

type ParsedHashrate = {
  value: number;
  unit: HashrateUnit;
};

const UNIT_MULTIPLIER_TO_H: Record<HashrateUnit, number> = {
  H: 1,
  KH: 1e3,
  MH: 1e6,
  GH: 1e9,
  TH: 1e12,
  PH: 1e15,
  EH: 1e18,
};

function normalizeUnit(u: string): HashrateUnit | null {
  const s = (u || "").trim().toUpperCase();
  if (!s) return null;
  // Accept: "H", "H/S", "HS"
  if (s === "H" || s === "H/S" || s === "HS") return "H";
  // Accept: "TH", "TH/S", "THS"
  if (s === "KH" || s === "KH/S" || s === "KHS") return "KH";
  if (s === "MH" || s === "MH/S" || s === "MHS") return "MH";
  if (s === "GH" || s === "GH/S" || s === "GHS") return "GH";
  if (s === "TH" || s === "TH/S" || s === "THS") return "TH";
  if (s === "PH" || s === "PH/S" || s === "PHS") return "PH";
  if (s === "EH" || s === "EH/S" || s === "EHS") return "EH";
  return null;
}

/**
 * Parse flexible inputs like:
 * - 1234567890 (assumed H/s by default)
 * - "250 TH/s", "250TH", "0.12 PH", "1000000000000"
 */
export function parseHashrate(input: unknown, defaultUnit: HashrateUnit = "H"): ParsedHashrate | null {
  if (input == null) return null;

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return { value: input, unit: defaultUnit };
  }

  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;
    // Extract: number + optional unit token
    const m = raw.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*([a-zA-Z/]+))?$/);
    if (!m) return null;
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return null;
    const unit = m[2] ? normalizeUnit(m[2]) : null;
    return { value, unit: unit ?? defaultUnit };
  }

  return null;
}

/**
 * Best-effort unit detection for numeric values when upstream sometimes sends TH/PH already.
 * Heuristic:
 * - If value is huge (>= 1e12), treat as H/s (most common in APIs)
 * - Else if value looks like TH/s scale (>= 1e3), treat as TH
 * - Else treat as H
 *
 * Prefer explicit units (strings) over this heuristic.
 */
export function detectNumericHashrateUnit(value: number): HashrateUnit {
  if (!Number.isFinite(value)) return "H";
  if (value >= 1e12) return "H";
  if (value >= 1e3) return "TH";
  return "H";
}

/** Convert a parsed hashrate into H/s. */
export function toHps(input: unknown): number {
  if (typeof input === "number") {
    const unit = detectNumericHashrateUnit(input);
    return input * UNIT_MULTIPLIER_TO_H[unit];
  }
  const parsed = parseHashrate(input, "H");
  if (!parsed) return 0;
  return parsed.value * UNIT_MULTIPLIER_TO_H[parsed.unit];
}

/** Convert a hashrate to a target unit (returns numeric value in that unit). */
export function convertHashrate(input: unknown, toUnit: HashrateUnit): number {
  const hps = toHps(input);
  const div = UNIT_MULTIPLIER_TO_H[toUnit] || 1;
  return div > 0 ? hps / div : 0;
}

