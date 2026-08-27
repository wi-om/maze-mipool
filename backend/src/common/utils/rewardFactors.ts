import { SystemSetting } from "../entities/SystemSetting";

export function parseSettingNumber(setting: SystemSetting | null | undefined, fallback: number): number {
    if (!setting?.Value) return fallback;
    const n = parseFloat(setting.Value);
    return Number.isFinite(n) ? n : fallback;
}

function resolveRangeFactor(
    floorSet: SystemSetting | null | undefined,
    ceilSet: SystemSetting | null | undefined,
    randomize: boolean,
    defaultWhenMissing: number
): number {
    const floor = parseSettingNumber(floorSet, defaultWhenMissing);
    const ceiling = parseSettingNumber(ceilSet, floor);
    if (!randomize) return ceiling;
    return floor === ceiling ? floor : floor + Math.random() * (ceiling - floor);
}

/** OC factor from OC_floor / OC_ceiling (randomized or deterministic ceiling). */
export function resolveOcFactor(
    floorSet: SystemSetting | null | undefined,
    ceilSet: SystemSetting | null | undefined,
    randomize: boolean
): number {
    return resolveRangeFactor(floorSet, ceilSet, randomize, 1.0);
}

/** SLA factor from SLA_floor / SLA_ceiling (same logic as OC). */
export function resolveSlaFactor(
    floorSet: SystemSetting | null | undefined,
    ceilSet: SystemSetting | null | undefined,
    randomize: boolean
): number {
    return resolveRangeFactor(floorSet, ceilSet, randomize, 0.9911);
}
