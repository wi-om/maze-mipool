import { Request, Response, NextFunction } from "express";
import cache, { KeyTools } from "../service/cacheService";

type KeyBuilder = (req: Request) => string;

export function cacheRoute(ttlSeconds = 60, keyBuilder?: KeyBuilder) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();

    const userId = (req as any).user?.id;
    const prefix = "route";
    const base = keyBuilder
      ? keyBuilder(req)
      : `${req.originalUrl}|h=${KeyTools.stableHash(
          req.headers["x-api-key"] ? { ua: req.headers["user-agent"] } : {}
        )}`;

    const key = `${prefix}${userId ? `:u:${userId}` : ""}:${base}`;

    const hit = await cache.get(key);
    if (hit) return res.status(200).json(hit);

    const sendJson = res.json.bind(res);
    res.json = (body: any) => {
      cache.set(key, body, ttlSeconds).catch(() => {});
      return sendJson(body);
    };

    next();
  };
}
