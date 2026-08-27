/**
 * Seed active BTC wallet addresses for EU payout test accounts.
 * Run: node scripts/seed-payout-test-wallets.js
 */
require("dotenv").config();
const { Client } = require("pg");

const PAYOUT_ROWS = [
  { acNo: "MI45580850", addr: "bc1qsfh7k0npcqwjl23n58432zz7slhl5a29qm2jzn" },
  { acNo: "MI33863358", addr: "bc1qpcn2m89qg9mu4hjckggt4uktyukgapa8yg9wj5" },
  { acNo: "MI11905969", addr: "bc1q2dg2yv7uevzeahqmlxd45v3dsvmvuwmslgyjtd" },
  { acNo: "MI36007513", addr: "bc1qzmuu5x4v0t4wkgxxfuajyulejllctu4ncnv30n" },
  { acNo: "MI39190255", addr: "bc1qjczaamqxxkelqh6drt9ampq6y7tlxv2tm5xy27" },
  { acNo: "MI50083612", addr: "bc1qyjve8fwjgtuk9jqjxpgvyz67qg7lvjqezz4vxe" },
  { acNo: "MI81726861", addr: "bc1q5hhg4luf09th4grw4r63cnfqx9h9aq0d84jaju" },
  { acNo: "MI50529612", addr: "bc1qurdh656vv5qfuxqwr4w4ft975nwkj538d0hpep" },
  { acNo: "MI46681751", addr: "bc1qwwgeglhk6rzl96flmrwvgpyc3gfhut93rtrgzc" },
  { acNo: "MI40071812", addr: "bc1q2zqf7puaq8w4aan5n56cewjx9davusz6nhdr9x" },
  { acNo: "MI23143259", addr: "bc1qhmj5490uejzvun7e3es787d8q9vwnptpzv6rmw" },
  { acNo: "MI32060644", addr: "bc1pu3rpnze9t53tmuntzrzpdz7np3227kf5zct9s3m3rsavk9mw4yyq4dfdm3" },
  { acNo: "MI90546948", addr: "bc1qrvjrzwj6rwxfd736m9exchpdz872aplk4q9uey" },
  { acNo: "MI72568765", addr: "bc1qdrjsmh2haqdyd6mfna6e5y35e9cxa6lftvdzea" },
  { acNo: "MI89707797", addr: "bc1qxzsjf0kugyke35n668rln5jn8fcsq2325067hg" },
  { acNo: "MI76648847", addr: "bc1qsx63hs5xavnly8r99hdpmu6sm33sqque5ctzlu" },
  { acNo: "MI29580185", addr: "bc1qh98eukjxdz2nmtwmuggrffnu959c8dk3ztlxjz" },
  { acNo: "MI36463115", addr: "bc1q6qxnrn9tsjzks5rdmq255urkqvjkuyjfspxpk6" },
  { acNo: "MI54489412", addr: "bc1qq8kap8c2d48drtu929hc7v8d45c7c2ugw64ewl" },
  { acNo: "MI48536821", addr: "bc1qc4uppdnf6pyerh0pkavhyugkzr6eywqkxznqmw" },
  { acNo: "MI78234256", addr: "bc1pxxq4v2u44ermxyta5y5f66asmvx98mkpx95l93hy9t3h3fdv3spsdwx0d6" },
  { acNo: "MI93691918", addr: "bc1qdksun4h46jzdvnhajx6kp7m2ljvn6vfr6jd4z4" },
  { acNo: "MI54332648", addr: "bc1q0wckuxkpmqd35y62j94z93zysjwe9q3mw9xvfg" },
  { acNo: "MI83761986", addr: "bc1q8mr4n5aquss9435n5tu2hkf5z5srvxwawtqesn" },
];

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const { acNo, addr } of PAYOUT_ROWS) {
    const accountRes = await client.query(
      `SELECT "AcNo", "Parent", "Type" FROM "Accounts" WHERE TRIM("AcNo") = $1`,
      [acNo],
    );
    if (!accountRes.rows.length) {
      console.log(`SKIP ${acNo}: account not found`);
      skipped++;
      continue;
    }

    const activeRes = await client.query(
      `SELECT "ID", "Addr", "IsActive" FROM "Wallets"
       WHERE TRIM("AcNo") = $1 AND "IsActive" = true
       ORDER BY "CreatedOn" DESC NULLS LAST
       LIMIT 1`,
      [acNo],
    );

    const now = new Date();

    if (activeRes.rows.length) {
      const wallet = activeRes.rows[0];
      if (String(wallet.Addr).trim() === addr) {
        console.log(`OK ${acNo}: address already set`);
        continue;
      }
      await client.query(
        `UPDATE "Wallets" SET "Addr" = $1, "ModifiedOn" = $2, "IsAddrModified" = false WHERE "ID" = $3`,
        [addr, now, wallet.ID],
      );
      console.log(`UPDATED ${acNo}: ${wallet.Addr} -> ${addr}`);
      updated++;
      continue;
    }

    await client.query(
      `UPDATE "Wallets" SET "IsActive" = false, "DeactivatedOn" = $2, "ModifiedOn" = $2
       WHERE TRIM("AcNo") = $1 AND "IsActive" = true`,
      [acNo, now],
    );

    const insertRes = await client.query(
      `INSERT INTO "Wallets"
        ("AcNo", "Name", "AddrSpec", "Addr", "Balance", "AssetCode", "IsActive", "IsAddrModified", "CreatedOn", "ModifiedOn")
       VALUES ($1, $2, $3, $4, 0, $5, true, false, $6, $6)
       RETURNING "ID"`,
      [acNo, "BTC Payout", "BTC", addr, "BTC", now],
    );

    console.log(`CREATED ${acNo}: ${addr}`);
    created++;
  }

  console.log(`\nDone. created=${created} updated=${updated} skipped=${skipped} total=${PAYOUT_ROWS.length}`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
