import apiClient from "../client";

export interface SystemSetting {
    Key: string;
    Value: string;
    UpdatedBy?: string;
    UpdatedAt: string;
    CreatedAt: string;
}

export async function getAllSettings(): Promise<SystemSetting[]> {
    const { data } = await apiClient.get<SystemSetting[]>("/api/settings/");
    return Array.isArray(data) ? data : [];
}

export async function getSetting(key: string): Promise<SystemSetting | null> {
    try {
        const { data } = await apiClient.get<SystemSetting>(`/api/settings/${key}`);
        return data ?? null;
    } catch {
        return null;
    }
}

export type RewardFactorSettings = {
    ocFloor: string;
    ocCeiling: string;
    slaFloor: string;
    slaCeiling: string;
};

export async function getRewardFactorSettings(): Promise<RewardFactorSettings> {
    const settings = await getAllSettings();
    const byKey = new Map(settings.map((s) => [s.Key, s.Value]));

    return {
        ocFloor: byKey.get("OC_floor") ?? "—",
        ocCeiling: byKey.get("OC_ceiling") ?? "—",
        slaFloor: byKey.get("SLA_floor") ?? "—",
        slaCeiling: byKey.get("SLA_ceiling") ?? "—",
    };
}
