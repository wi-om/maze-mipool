import { Request, Response } from "express";
import { AppDataSource, buildCacheKey, invalidateCachePrefix, readThroughCache } from "@common";
import { SystemSetting } from "@common";
import { AuthRequest } from "@common";

const SETTINGS_CACHE_TTL = 300;

export const getSetting = async (req: Request, res: Response) => {
    const { key } = req.params;
    try {
        const repo = AppDataSource.getRepository(SystemSetting);
        const setting = await repo.findOne({ where: { Key: key } });
        if (!setting) {
            return res.status(404).json({ message: "Setting not found" });
        }
        return res.status(200).json(setting);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateSetting = async (req: AuthRequest, res: Response) => {
    const { key, value } = req.body;
    const updatedBy = req.user?.email || "system";

    if (!key || value === undefined) {
        return res.status(400).json({ message: "Key and Value are required" });
    }

    try {
        const repo = AppDataSource.getRepository(SystemSetting);
        let setting = await repo.findOne({ where: { Key: key } });

        if (setting) {
            setting.Value = value.toString();
            setting.UpdatedBy = updatedBy;
            await repo.save(setting);
        } else {
            setting = repo.create({ Key: key, Value: value.toString(), UpdatedBy: updatedBy });
            await repo.save(setting);
        }

        await invalidateCachePrefix("settings");

        return res.status(200).json({ message: "Setting updated successfully", setting });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAllSettings = async (_req: Request, res: Response) => {
    try {
        const cacheKey = buildCacheKey("settings", { view: "all" });
        const settings = await readThroughCache(cacheKey, SETTINGS_CACHE_TTL, async () => {
            const repo = AppDataSource.getRepository(SystemSetting);
            return repo.find();
        });
        return res.status(200).json(settings);
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};
