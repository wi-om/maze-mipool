/**
 * Align EU Rewards daily totals to client payout schedule (CreatedOn = payout date).
 * Rewards table only — no Payouts / wallet changes.
 *
 * Usage:
 *   $env:DB_NAME="test"; npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/align-eu-rewards-payout-schedule.ts
 *   ... --execute
 */
import "reflect-metadata";
import { AppDataSource, Reward } from "../src/common";
import { workDateStrToDbTimestamp } from "../src/modules/engine/service/rewardWorkDate";

/** Client payout date → total BTC sent that day */
const CLIENT_PAYOUT: Record<string, number> = {
  "2025-12-02": 0,
  "2025-12-03": 0.00301,
  "2025-12-04": 0.00324956,
  "2025-12-05": 0.00303166,
  "2025-12-06": 0.00302209,
  "2025-12-07": 0.00299164,
  "2025-12-08": 0.00302209,
  "2025-12-09": 0.00301049,
  "2025-12-10": 0.00301599,
  "2025-12-11": 0.00301049,
  "2025-12-12": 0.00302822,
  "2025-12-13": 0.00303526,
  "2025-12-14": 0,
  "2025-12-15": 0.00606287,
  "2025-12-16": 0.00303597,
  "2025-12-17": 0.00303375,
  "2025-12-18": 0.00303514,
  "2025-12-19": 0.00303392,
  "2025-12-20": 0,
  "2025-12-21": 0.00605956,
  "2025-12-22": 0,
  "2025-12-23": 0.00679733,
  "2025-12-24": 0.00794259,
  "2025-12-25": 0.00396693,
  "2025-12-26": 0.00396608,
  "2025-12-27": 0,
  "2025-12-28": 0,
  "2025-12-29": 0.0119097,
  "2025-12-30": 0.00398073,
  "2025-12-31": 0.00397818,
  "2026-01-01": 0.00397818,
};

const PAYOUT_DATES = Object.keys(CLIENT_PAYOUT).sort();

function round8(n: number): number {
  return Number(n.toFixed(8));
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
    const updates = rows.map((r, i) => ({
      id: r.Id,
      amount: i === rows.length - 1 ? round8(target - each * (rows.length - 1)) : each,
    }));
    return updates;
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

/** Nearest prior date with reward rows (for cloning structure). */
async function findTemplateDate(beforeDate: string): Promise<RewardRow[]> {
  for (let i = PAYOUT_DATES.indexOf(beforeDate) - 1; i >= 0; i--) {
    const rows = await loadRewardsForDate(PAYOUT_DATES[i]);
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
  console.log("DB_NAME:", process.env.DB_NAME);
  console.log(execute ? "MODE: EXECUTE\n" : "MODE: DRY RUN (pass --execute to apply)\n");

  let sumBefore = 0;
  let sumAfter = 0;
  let sumClient = 0;

  console.log("date       | rows | before BTC  | target BTC  | after BTC   | action");
  console.log("-".repeat(85));

  for (const dateStr of PAYOUT_DATES) {
    const target = CLIENT_PAYOUT[dateStr];
    sumClient += target;
    const rows = await loadRewardsForDate(dateStr);
    const before = round8(rows.reduce((s, r) => s + Number(r.Amount || 0), 0));
    sumBefore += before;

    let action: string;
    let after = target;

    if (target === 0) {
      action = rows.length ? `DELETE ${rows.length} rows` : "already zero";
      after = 0;
    } else if (rows.length === 0) {
      action = `INSERT from template (scale to target)`;
    } else if (Math.abs(before - target) < 1e-10) {
      action = "no change";
    } else {
      action = `SCALE ${rows.length} rows (${(target / before).toFixed(4)}x)`;
    }

    sumAfter += after;
    console.log(
      `${dateStr} | ${String(rows.length).padStart(4)} | ${before.toFixed(8)} | ${target.toFixed(8)} | ${after.toFixed(8)} | ${action}`,
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
      const template = await findTemplateDate(dateStr);
      if (!template.length) {
        console.error(`  SKIP ${dateStr}: no template rows to clone`);
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

    if (Math.abs(before - target) < 1e-10) continue;

    const updates = scaleToTarget(rows, target);
    for (const u of updates) {
      await AppDataSource.query(`UPDATE "Rewards" SET "Amount" = $1 WHERE "Id" = $2`, [u.amount, u.id]);
    }
  }

  console.log("\n=== Totals Dec 2 2025 – Jan 1 2026 ===");
  console.log("Before: ", sumBefore.toFixed(8), "BTC");
  console.log("After:  ", sumAfter.toFixed(8), "BTC");
  console.log("Client: ", sumClient.toFixed(8), "BTC");

  if (execute) {
    const verify = await AppDataSource.query(`
      SELECT to_char("CreatedOn", 'YYYY-MM-DD') AS d,
             COUNT(*)::int AS n,
             SUM("Amount")::numeric(24,8) AS total
      FROM "Rewards"
      WHERE "CreatedOn" >= '2025-12-02'::timestamp AND "CreatedOn" < '2026-01-02'::timestamp
      GROUP BY 1 ORDER BY 1
    `);
    console.log("\n=== Verify ===");
    let vSum = 0;
    for (const r of verify) {
      const client = CLIENT_PAYOUT[r.d] ?? null;
      const total = Number(r.total);
      vSum += total;
      const ok = client != null && Math.abs(total - client) < 0.00000002 ? "OK" : "DIFF";
      console.log(`${r.d}: ${r.n} rows ${total.toFixed(8)} (client ${client?.toFixed(8) ?? "—"}) ${ok}`);
    }
    console.log("Verified sum:", vSum.toFixed(8));
  }

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
