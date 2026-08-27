/**
 * Align Rewards daily totals to mapped blockchain_payout amounts (txn_date).
 * Rewards table ONLY.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/align-rewards-to-blockchain.ts
 *   ... --execute
 */
import "reflect-metadata";
import { AppDataSource, Reward } from "../src/common";
import { workDateStrToDbTimestamp } from "../src/modules/engine/service/rewardWorkDate";

const WINDOW_START = "2025-12-02";
const WINDOW_END = "2026-01-01";

function round8(n: number): number {
  return Number(n.toFixed(8));
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  while (d <= endD) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

type RewardRow = {
  Id: number;
  AcNo: string;
  mipContractNo: string;
  Amount: string | number;
  Hashrate: string | number | null;
  Type: string | null;
  CreatedOn: Date;
};

function scaleToTarget(rows: RewardRow[], target: number): Array<{ id: number; amount: number }> {
  const current = rows.reduce((s, r) => s + Number(r.Amount || 0), 0);
  if (rows.length === 0) return [];
  if (current <= 0) {
    const each = round8(target / rows.length);
    return rows.map((r, i) => ({
      id: r.Id,
      amount: i === rows.length - 1 ? round8(target - each * (rows.length - 1)) : each,
    }));
  }
  const factor = target / current;
  const updates = rows.map((r) => ({
    id: r.Id,
    amount: round8(Number(r.Amount) * factor),
  }));
  const sum = updates.reduce((s, u) => s + u.amount, 0);
  const drift = round8(target - sum);
  if (drift !== 0) {
    updates[updates.length - 1].amount = round8(updates[updates.length - 1].amount + drift);
  }
  return updates;
}

async function loadBlockchainTargets(): Promise<Map<string, number>> {
  const rows = await AppDataSource.query(
    `
    SELECT to_char(txn_date, 'YYYY-MM-DD') AS d,
           SUM(amount::numeric)::numeric(24,8) AS total
    FROM blockchain_payout
    WHERE ac_no IS NOT NULL AND btrim(ac_no) <> ''
      AND txn_date >= $1::timestamp AND txn_date < '2026-01-02'::timestamp
    GROUP BY 1
    `,
    [WINDOW_START],
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r.d), Number(r.total));
  return map;
}

async function loadRewardsForDate(dateStr: string): Promise<RewardRow[]> {
  return AppDataSource.query(
    `
    SELECT "Id", "AcNo", "mipContractNo", "Amount", "Hashrate", "Type", "CreatedOn"
    FROM "Rewards"
    WHERE "CreatedOn" >= $1::timestamp AND "CreatedOn" < ($1::date + interval '1 day')::timestamp
    ORDER BY "Id"
    `,
    [dateStr],
  );
}

async function findTemplateRewards(beforeDate: string, dates: string[]): Promise<RewardRow[]> {
  const idx = dates.indexOf(beforeDate);
  for (let i = idx - 1; i >= 0; i--) {
    const rows = await loadRewardsForDate(dates[i]);
    if (rows.length > 0) return rows;
  }
  return AppDataSource.query(
    `
    SELECT "Id", "AcNo", "mipContractNo", "Amount", "Hashrate", "Type", "CreatedOn"
    FROM "Rewards"
    WHERE "CreatedOn" >= '2025-12-01'::timestamp AND "CreatedOn" < '2026-01-02'::timestamp
    ORDER BY "CreatedOn" DESC, "Id"
    LIMIT 24
    `,
  );
}

async function main() {
  const execute = process.argv.includes("--execute");
  await AppDataSource.initialize();
  const bcTargets = await loadBlockchainTargets();
  const dates = datesBetween(WINDOW_START, WINDOW_END);

  console.log("DB_NAME:", process.env.DB_NAME);
  console.log(`Scope: Rewards → blockchain totals, ${WINDOW_START} – ${WINDOW_END}`);
  console.log(execute ? "MODE: EXECUTE\n" : "MODE: DRY RUN (pass --execute to apply)\n");

  let sumBefore = 0;
  let sumAfter = 0;
  let sumBc = 0;

  console.log("date       | rows | before BTC  | blockchain  | after BTC   | action");
  console.log("-".repeat(90));

  for (const dateStr of dates) {
    const target = round8(bcTargets.get(dateStr) ?? 0);
    sumBc += target;
    const rows = await loadRewardsForDate(dateStr);
    const before = round8(rows.reduce((s, r) => s + Number(r.Amount || 0), 0));
    sumBefore += before;

    let action: string;
    if (target === 0) {
      action = rows.length ? `DELETE ${rows.length} rows` : "already zero";
    } else if (rows.length === 0) {
      action = "INSERT from template";
    } else if (Math.abs(before - target) < 1e-8) {
      action = "no change";
    } else {
      action = `SCALE ${rows.length} rows (${(target / before).toFixed(4)}x)`;
    }

    sumAfter += target;
    console.log(
      `${dateStr} | ${String(rows.length).padStart(4)} | ${before.toFixed(8)} | ${target.toFixed(8)} | ${target.toFixed(8)} | ${action}`,
    );

    if (!execute) continue;

    if (target === 0) {
      if (rows.length) {
        await AppDataSource.query(
          `DELETE FROM "Rewards" WHERE "CreatedOn" >= $1::timestamp AND "CreatedOn" < ($1::date + interval '1 day')::timestamp`,
          [dateStr],
        );
      }
      continue;
    }

    const createdOn = workDateStrToDbTimestamp(dateStr);

    if (rows.length === 0) {
      const template = await findTemplateRewards(dateStr, dates);
      if (!template.length) {
        console.error(`  SKIP ${dateStr}: no template rewards to clone`);
        continue;
      }
      const scaled = scaleToTarget(template, target);
      const repo = AppDataSource.getRepository(Reward);
      for (let i = 0; i < template.length; i++) {
        const t = template[i];
        await repo.insert({
          AcNo: t.AcNo,
          mipContractNo: t.mipContractNo,
          Amount: scaled[i]?.amount ?? round8(target / template.length),
          Hashrate: String(t.Hashrate ?? "250"),
          Type: t.Type || process.env.REWARD_TYPE || "FPPS",
          CreatedOn: createdOn,
        });
      }
      continue;
    }

    if (Math.abs(before - target) < 1e-8) continue;

    const updates = scaleToTarget(rows, target);
    for (const u of updates) {
      await AppDataSource.query(`UPDATE "Rewards" SET "Amount" = $1 WHERE "Id" = $2`, [u.amount, u.id]);
    }
  }

  console.log("\n=== Totals ===");
  console.log("Rewards before: ", sumBefore.toFixed(8), "BTC");
  console.log("Rewards after:  ", sumAfter.toFixed(8), "BTC");
  console.log("Blockchain:       ", sumBc.toFixed(8), "BTC");

  if (execute) {
    const verify = await AppDataSource.query(
      `
      SELECT COALESCE(SUM("Amount"::numeric), 0)::numeric(24,8) AS total
      FROM "Rewards"
      WHERE "CreatedOn" >= $1::timestamp AND "CreatedOn" < '2026-01-02'::timestamp
      `,
      [WINDOW_START],
    );
    console.log("Verified rewards sum:", Number(verify[0]?.total).toFixed(8));
  }

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
