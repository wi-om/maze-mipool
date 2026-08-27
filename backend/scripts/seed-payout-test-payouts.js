/**
 * Insert historical Complete payout rows for test accounts (2026-06-06 batch).
 * Skips rows that already exist for same AcNo + mipContractNo + txid.
 * Run: node scripts/seed-payout-test-payouts.js
 */
require("dotenv").config();
const { Client } = require("pg");

const PAYOUT_ROWS = [
  { acNo: "MI45580850", contract: "C85D437DF8BE", amount: 0.00067198, addr: "bc1qsfh7k0npcqwjl23n58432zz7slhl5a29qm2jzn" },
  { acNo: "MI33863358", contract: "108D5BBDEBD1", amount: 0.00067198, addr: "bc1qpcn2m89qg9mu4hjckggt4uktyukgapa8yg9wj5" },
  { acNo: "MI11905969", contract: "C859C49D7DD8", amount: 0.00033599, addr: "bc1q2dg2yv7uevzeahqmlxd45v3dsvmvuwmslgyjtd" },
  { acNo: "MI36007513", contract: "FE52D95A8EE6", amount: 0.00033599, addr: "bc1qzmuu5x4v0t4wkgxxfuajyulejllctu4ncnv30n" },
  { acNo: "MI39190255", contract: "1825B7E503DF", amount: 0.00067198, addr: "bc1qjczaamqxxkelqh6drt9ampq6y7tlxv2tm5xy27" },
  { acNo: "MI50083612", contract: "13D68C8BFB0F", amount: 0.00033599, addr: "bc1qyjve8fwjgtuk9jqjxpgvyz67qg7lvjqezz4vxe" },
  { acNo: "MI81726861", contract: "690DA99D087B", amount: 0.00033599, addr: "bc1q5hhg4luf09th4grw4r63cnfqx9h9aq0d84jaju" },
  { acNo: "MI50529612", contract: "FD20195C2BE3", amount: 0.00100797, addr: "bc1qurdh656vv5qfuxqwr4w4ft975nwkj538d0hpep" },
  { acNo: "MI46681751", contract: "635971D3AAF3", amount: 0.00033599, addr: "bc1qwwgeglhk6rzl96flmrwvgpyc3gfhut93rtrgzc" },
  { acNo: "MI40071812", contract: "1EF7A41552E5", amount: 0.00033599, addr: "bc1q2zqf7puaq8w4aan5n56cewjx9davusz6nhdr9x" },
  { acNo: "MI23143259", contract: "829245E3E85B", amount: 0.00033599, addr: "bc1qhmj5490uejzvun7e3es787d8q9vwnptpzv6rmw" },
  { acNo: "MI32060644", contract: "B647A39B0EB2", amount: 0.00033599, addr: "bc1pu3rpnze9t53tmuntzrzpdz7np3227kf5zct9s3m3rsavk9mw4yyq4dfdm3" },
  { acNo: "MI90546948", contract: "1915D8379543", amount: 0.00067198, addr: "bc1qrvjrzwj6rwxfd736m9exchpdz872aplk4q9uey" },
  { acNo: "MI72568765", contract: "8007C5FD40F2", amount: 0.00033599, addr: "bc1qdrjsmh2haqdyd6mfna6e5y35e9cxa6lftvdzea" },
  { acNo: "MI89707797", contract: "27C4DC6D2221", amount: 0.00033599, addr: "bc1qxzsjf0kugyke35n668rln5jn8fcsq2325067hg" },
  { acNo: "MI76648847", contract: "45CFEA2C4C3B", amount: 0.00067198, addr: "bc1qsx63hs5xavnly8r99hdpmu6sm33sqque5ctzlu" },
  { acNo: "MI29580185", contract: "F20BBF065831", amount: 0.00067198, addr: "bc1qh98eukjxdz2nmtwmuggrffnu959c8dk3ztlxjz" },
  { acNo: "MI36463115", contract: "4DAA9DC328D2", amount: 0.00033599, addr: "bc1q6qxnrn9tsjzks5rdmq255urkqvjkuyjfspxpk6" },
  { acNo: "MI54489412", contract: "01A6C30D987A", amount: 0.00033599, addr: "bc1qq8kap8c2d48drtu929hc7v8d45c7c2ugw64ewl" },
  { acNo: "MI48536821", contract: "BCEB5153F99E", amount: 0.00033599, addr: "bc1qc4uppdnf6pyerh0pkavhyugkzr6eywqkxznqmw" },
  { acNo: "MI78234256", contract: "53A2C779EE3C", amount: 0.00033599, addr: "bc1pxxq4v2u44ermxyta5y5f66asmvx98mkpx95l93hy9t3h3fdv3spsdwx0d6" },
  { acNo: "MI93691918", contract: "B7A279EE3GC1", amount: 0.00201594, addr: "bc1qdksun4h46jzdvnhajx6kp7m2ljvn6vfr6jd4z4" },
  { acNo: "MI54332648", contract: "F3A24279BE3C", amount: 0.00067198, addr: "bc1q0wckuxkpmqd35y62j94z93zysjwe9q3mw9xvfg" },
  { acNo: "MI83761986", contract: "H3A2RT79RE3C", amount: 0.00033599, addr: "bc1q8mr4n5aquss9435n5tu2hkf5z5srvxwawtqesn" },
];

const TXID = "3d9846461d49bb29aed80e778e2eec22fd99fc9e8f0665c509878f03d81a2f88";
const CREATED_ON = "2026-06-06 14:00:00";

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

  let inserted = 0;
  let skipped = 0;

  for (const row of PAYOUT_ROWS) {
    const exists = await client.query(
      `SELECT 1 FROM "Payouts"
       WHERE TRIM("AcNo") = $1 AND TRIM("mipContractNo") = $2 AND txid = $3 LIMIT 1`,
      [row.acNo, row.contract, TXID],
    );
    if (exists.rows.length) {
      skipped++;
      continue;
    }

    await client.query(
      `INSERT INTO "Payouts" ("AcNo", "mipContractNo", "Amount", "txid", "CreatedOn", "Status", "ToAddr")
       VALUES ($1, $2, $3, $4, $5, 'Complete', $6)`,
      [row.acNo, row.contract, row.amount, TXID, CREATED_ON, row.addr],
    );
    inserted++;
    console.log(`INSERTED ${row.acNo} ${row.contract} ${row.amount}`);
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
