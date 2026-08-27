import axios, { AxiosError } from "axios";
import { env } from "@common";
import { cache, KeyTools, withSpan, logger } from "@common";
import { alertService } from "@common";
import { AppDataSource } from "@common";
import { Contract } from "@common";
import { Account } from "@common";
import { SystemSetting } from "@common";
import { resolveOcFactor, resolveSlaFactor } from "@common/utils/rewardFactors";
import { CLContract } from "@common";
import { In } from "typeorm";
import { toHps } from "./hashrate.util";

// Axios client
const mips = axios.create({
  baseURL: env.MIPS_BASE_URL,
  timeout: 10_000,
});

// TTLs (seconds). Dashboard polls workers every 6s — align cache TTL to reduce misses.
const TTL_WORKERS = 6;
const TTL_PAYOUTS = 3;
const TTL_REWARDS = 3;

// Build a Redis key (never include secrets)
function mipsKey(path: string, params?: Record<string, any>) {
  const sanitized = { ...(params || {}) };
  delete (sanitized as any).ackey; // don't leak the key
  return `mips:v2:${path}:${KeyTools.stableHash(sanitized)}`;
}

// ------- Error helpers (kept from your version) -------
function upthrow(err: any, attempted: { mode: "query" | "header"; path: string; params?: any }) {
  const ax = err as AxiosError;
  const payload = {
    message: "Upstream call failed",
    attempted,
    status: ax.response?.status,
    data: ax.response?.data,
  };
  throw new AxiosError(JSON.stringify(payload), ax.code, ax.config, ax.request, ax.response);
}

function throwWithContext(err: any, attempts: any[]) {
  const ax = err as AxiosError;
  const payload = {
    message: "Upstream call failed",
    attempts,
    status: ax.response?.status,
    data: ax.response?.data,
  };
  throw new AxiosError(JSON.stringify(payload), ax.code, ax.config, ax.request, ax.response);
}

// ---------------- WORKERS ----------------
const MIPS_BTC_WORKERS_ROUTE = "/api/mips/btc/workers";

const mipsBtcWorkersSpanAttrs = {
  module: "mips",
  operation: "btc_workers",
  route: MIPS_BTC_WORKERS_ROUTE,
  "external.service": "mips_api",
} as const;

const WORKER_SETTING_KEYS = [
  "sampling_hashrate",
  "SLA_floor",
  "SLA_ceiling",
  "OC_floor",
  "OC_ceiling",
] as const;

function mipsWorkerApiKeys(): string[] {
  return [
    ...new Set(
      [env.MIPS_API_KEY, env.MIPS_REWARDS_KEY, env.MIPS_PAYOUTS_KEY].filter(Boolean),
    ),
  ];
}

function mipsResponseHasData(data: any): boolean {
  return data?.total_count?.active > 0 || data?.total_hashrate?.hashrate > 0;
}

async function loadWorkersDbContext() {
  return withSpan("mips.btc.workers.db_check", mipsBtcWorkersSpanAttrs, async () => {
    const settingsRepo = AppDataSource.getRepository(SystemSetting);
    const contractRepo = AppDataSource.getRepository(Contract);
    const clContractRepo = AppDataSource.getRepository(CLContract);
    const now = new Date();

    const [settings, CLContractsTotal, EUContractsTotal] = await Promise.all([
      settingsRepo.find({ where: { Key: In([...WORKER_SETTING_KEYS]) } }),
      clContractRepo
        .createQueryBuilder("c")
        .where("c.Status = :status", { status: 1 })
        .andWhere(`c."ContractStartDate" IS NOT NULL`)
        .andWhere(`c."ContractStartDate" <= :now`, { now })
        .andWhere(`(c."ContractEndDate" IS NULL OR c."ContractEndDate" >= :now)`, { now })
        .select("SUM(CAST(c.Hashrate AS NUMERIC))", "total")
        .getRawOne(),
      contractRepo
        .createQueryBuilder("contract")
        .innerJoin("contract.account", "account")
        .innerJoin(
          Account,
          "parentAccount",
          "parentAccount.AcNo = account.ClientAcNo AND parentAccount.Type = 'CL'",
        )
        .where("account.Status = :accStatus", { accStatus: 1 })
        .andWhere("account.Type = :typeEU", { typeEU: "EU" })
        .andWhere("contract.Status = :contractStatus", { contractStatus: 2 })
        .andWhere("contract.StartDate <= :now", { now })
        .andWhere(`(contract."EndDate" IS NULL OR contract."EndDate" >= :now)`, { now })
        .select(
          `
                SUM(
                  CASE UPPER(COALESCE(contract."HashrateUnit",'TH'))
                    WHEN 'PH' THEN CAST(contract."Hashrate" AS NUMERIC) * 1000
                    WHEN 'PH/S' THEN CAST(contract."Hashrate" AS NUMERIC) * 1000
                    WHEN 'PHS' THEN CAST(contract."Hashrate" AS NUMERIC) * 1000
                    WHEN 'TH' THEN CAST(contract."Hashrate" AS NUMERIC)
                    WHEN 'TH/S' THEN CAST(contract."Hashrate" AS NUMERIC)
                    WHEN 'THS' THEN CAST(contract."Hashrate" AS NUMERIC)
                    WHEN 'GH' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000
                    WHEN 'GH/S' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000
                    WHEN 'GHS' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000
                    WHEN 'MH' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000
                    WHEN 'MH/S' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000
                    WHEN 'MHS' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000
                    WHEN 'KH' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000000
                    WHEN 'KH/S' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000000
                    WHEN 'KHS' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000000
                    WHEN 'H' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000000000
                    WHEN 'H/S' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000000000
                    WHEN 'HS' THEN CAST(contract."Hashrate" AS NUMERIC) / 1000000000000
                    ELSE CAST(contract."Hashrate" AS NUMERIC)
                  END
                )
                `,
          "total",
        )
        .getRawOne(),
    ]);

    const byKey = new Map(settings.map((s) => [s.Key, s]));
    const samplingRaw = parseFloat(byKey.get("sampling_hashrate")?.Value ?? "");
    const samplingHashrateTh = Number.isFinite(samplingRaw) ? samplingRaw : 250;

    return {
      samplingHashrateTh,
      CLContractsTotal,
      EUContractsTotal,
      slaFloorSet: byKey.get("SLA_floor"),
      slaCeilSet: byKey.get("SLA_ceiling"),
      ocFloorSet: byKey.get("OC_floor"),
      ocCeilSet: byKey.get("OC_ceiling"),
    };
  });
}

function transformWorkersPayload(res: { data: any }, dbContext: Awaited<ReturnType<typeof loadWorkersDbContext>>) {
  const {
    samplingHashrateTh,
    CLContractsTotal,
    EUContractsTotal,
    slaFloorSet,
    slaCeilSet,
    ocFloorSet,
    ocCeilSet,
  } = dbContext;

  const sampling_hashrate =
    samplingHashrateTh > 0 && samplingHashrateTh < 1000 ? samplingHashrateTh * 1000 : samplingHashrateTh;

  const rawHashrateHps = toHps(res.data?.total_hashrate?.hashrate);
  const rawHashrate1hHps = toHps(res.data?.total_hashrate?.hashrate1h);
  const rawHashrate24hHps = toHps(res.data?.total_hashrate?.hashrate24h);

  const live_hashrate = rawHashrate24hHps || 0;

  const eu_hashrate = parseFloat(EUContractsTotal?.total || "0");
  const cl_hashrate = parseFloat(CLContractsTotal?.total || "0");

  const cl_calculated =
    sampling_hashrate > 0 ? (cl_hashrate / sampling_hashrate) * live_hashrate : 0;
  const eu_calculated =
    sampling_hashrate > 0 ? (eu_hashrate / sampling_hashrate) * live_hashrate : 0;
  const eu_contracted_hps = eu_hashrate * 1e12;
  const cl_calculated_24h =
    sampling_hashrate > 0
      ? (cl_hashrate / sampling_hashrate) * res.data.total_hashrate.hashrate24h
      : 0;
  const cl_calculated_1h =
    sampling_hashrate > 0
      ? (cl_hashrate / sampling_hashrate) * res.data.total_hashrate.hashrate1h
      : 0;

  res.data.total_hashrate.actual_hashrate = rawHashrateHps;
  res.data.total_hashrate.hashrate = cl_calculated;
  res.data.total_hashrate.cl_hashrate = cl_calculated;
  res.data.total_hashrate.eu_hashrate = eu_calculated;
  res.data.total_hashrate.cl_hashrate_24h = cl_calculated_24h;
  res.data.total_hashrate.cl_hashrate_1h = cl_calculated_1h;
  res.data.total_hashrate.total_contracted_hashrate = cl_hashrate + eu_hashrate;
  res.data.total_hashrate.cl_contracted_hashrate = cl_hashrate;
  res.data.total_hashrate.eu_contracted_hashrate = eu_hashrate;

  const sla = resolveSlaFactor(slaFloorSet, slaCeilSet, false);
  const ocFactor = resolveOcFactor(ocFloorSet, ocCeilSet, false);

  const cl_delivered_th = cl_hashrate * ocFactor * sla;
  const cl_delivered_ph = cl_delivered_th / 1000;

  res.data.total_hashrate.cl_delivered_th = cl_delivered_th;
  res.data.total_hashrate.cl_delivered_ph = cl_delivered_ph;

  const utilisation_ratio = cl_hashrate > 0 ? eu_hashrate / cl_hashrate : 0;
  const cl_display_hps = cl_delivered_th * 1e12;
  const eu_display_hps = cl_display_hps * utilisation_ratio;

  res.data.total_hashrate.hashrate = cl_display_hps;
  res.data.total_hashrate.cl_hashrate = cl_display_hps;
  res.data.total_hashrate.eu_hashrate = eu_display_hps;
  res.data.total_hashrate.cl_hashrate_24h = cl_display_hps;
  res.data.total_hashrate.cl_hashrate_1h = cl_display_hps;

  const total_contracted = cl_hashrate + eu_hashrate;
  const scaling_factor = sampling_hashrate > 0 ? total_contracted / sampling_hashrate : 0;
  res.data.total_hashrate.total_calculated_hashrate =
    scaling_factor * res.data.total_hashrate.actual_hashrate;
  res.data.total_hashrate.hashrate1h = rawHashrate1hHps;
  res.data.total_hashrate.hashrate24h = rawHashrate24hHps;
  res.data.total_hashrate.total_calculated_1h = scaling_factor * rawHashrate1hHps;
  res.data.total_hashrate.total_calculated_24h = scaling_factor * rawHashrate24hHps;

  res.data.total_hashrate.audit = {
    sampling_hashrate,
    live_hashrate_used: live_hashrate,
    contracted: {
      cl_contracted_hashrate: cl_hashrate,
      eu_contracted_hashrate: eu_hashrate,
      total_contracted_hashrate: total_contracted,
    },
    delivery: {
      sla,
      ocFactor,
      cl_delivered_th,
      cl_delivered_ph,
    },
    scale: {
      cl_over_sampling: sampling_hashrate > 0 ? cl_hashrate / sampling_hashrate : 0,
      eu_over_sampling: sampling_hashrate > 0 ? eu_hashrate / sampling_hashrate : 0,
      total_over_sampling: scaling_factor,
    },
    calculated_hashrate: {
      cl_calculated,
      eu_calculated,
      eu_contracted_hps,
      cl_display_hps,
      eu_display_hps,
      total_calculated_hashrate: res.data.total_hashrate.total_calculated_hashrate,
    },
  };

  return res.data;
}

async function loadMipsWorkersPayload(path: string) {
  const keys = mipsWorkerApiKeys();
  const dbContextPromise = loadWorkersDbContext();

  return withSpan("mips.btc.workers.external_fetch", mipsBtcWorkersSpanAttrs, async () => {
    const settled = await Promise.allSettled(
      keys.map((ackey) => mips.get(path, { params: { ackey } })),
    );

    let lastRes: any = null;

    for (let i = 0; i < keys.length; i++) {
      const ackey = keys[i];
      const outcome = settled[i];

      if (outcome.status === "rejected") {
        const err = outcome.reason as Error;
        console.error(`[MIPS] Key ${ackey.slice(0, 4)} failed: ${err.message}`);
        continue;
      }

      const res = outcome.value;
      const hasData = mipsResponseHasData(res.data);
      console.log(`[MIPS] Path: ${path} | Key: ${ackey.slice(0, 4)}... | hasData: ${hasData}`);

      if (hasData) {
        const dbContext = await dbContextPromise;
        return withSpan("mips.btc.workers.transform_response", mipsBtcWorkersSpanAttrs, async () =>
          transformWorkersPayload(res, dbContext),
        );
      }

      if (!lastRes) lastRes = res.data;
    }

    return lastRes || { error: "No valid keys returned data" };
  });
}

export async function fetchMipsWorkers() {
  const path = "/btc/workers";
  const key = mipsKey(path);

  const cached = await withSpan(
    "mips.btc.workers.cache_get",
    mipsBtcWorkersSpanAttrs,
    async (span) => {
      const value = await cache.get(key);
      span.setAttribute("cache.hit", value !== null);
      return value;
    }
  );

  if (cached !== null) {
    return cached;
  }

  const freshData = await loadMipsWorkersPayload(path);

  void cache.set(key, freshData, TTL_WORKERS).catch((err) => {
    logger.error(err, "mips.btc.workers cache set failed");
  });

  return freshData;
}

// ---------------- PAYOUTS ----------------
export async function fetchMipsPayouts(limit = 30, offset = 0) {
  const path = "/btc/payouts";
  const key = mipsKey(path, { limit, offset });

  return cache.cacheable(
    key,
    async () => {
      // Try query auth (?ackey=)
      try {
        const res = await mips.get(path, {
          params: { ackey: env.MIPS_PAYOUTS_KEY || env.MIPS_API_KEY, limit, offset },
        });
        return res.data;
      } catch (err) {
        const status = (err as AxiosError).response?.status;
        if (status !== 404) upthrow(err, { mode: "query", path, params: { limit, offset } });
        // If 404 is expected, rethrow so controller can return 404
        throw err;
      }
    },
    { expiration: TTL_PAYOUTS }
  );
}

// ---------------- REWARDS ----------------
export async function fetchMipsRewards(limit = 500, offset = 0) {
  const path = "/btc/rewards";
  const key = mipsKey(path, { limit, offset });
  const queryAttempt = { mode: "query" as const, path, params: { limit, offset } };
  const headerAttempt = { mode: "header" as const, path, params: { limit, offset } };

  return cache.cacheable(
    key,
    async () => {
      // 1) Query param ?ackey=
      try {
        const res = await mips.get(path, {
          params: { ackey: env.MIPS_REWARDS_KEY || env.MIPS_API_KEY, limit, offset },
        });

        // Check for zero hashrate alerts
        await alertService.checkHashrateAlerts(res.data);

        return res.data;
      } catch (err1) {
        // 2) Fallback to header
        try {
          const res = await mips.get(path, {
            headers: { "Ocp-Apim-Subscription-Key": env.MIPS_REWARDS_KEY || env.MIPS_API_KEY },
            params: { limit, offset },
          });

          // Check for zero hashrate alerts
          await alertService.checkHashrateAlerts(res.data);

          return res.data;
        } catch (err2) {
          throwWithContext(err2, [queryAttempt, headerAttempt]);
        }
      }
    },
    { expiration: TTL_REWARDS }
  );
}
