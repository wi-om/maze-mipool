import { Request } from "express";
import { KeyTools } from "../service/cacheService";

export function buildKeyFromReq(req: Request, scope: string, extra?: object) {
  // Sort query params -> canonical key
  const entries = Object.entries(req.query || {}).sort(([a],[b]) => a.localeCompare(b));
  const qs = new URLSearchParams(entries as [string, string][]).toString();

  const userId   = (req as any).user?.id ?? "public";
  const tenantId = (req as any).user?.tenantId ?? "public";

  let key = `${scope}:v1:u:${userId}:t:${tenantId}:${req.path}?${qs}`;
  if (extra) key += `:${KeyTools.stableHash(extra)}`;
  return key;
}
