/**
 * One-off: set SHA256 password hashes for admin users.
 * Usage: node scripts/set-admin-passwords.js
 */
require("dotenv").config();
const { Client } = require("pg");

const USERS = [
  {
    email: "om@workinfinity.com",
    hash: "5326bc72f0bdd9afb997a609872eb81045533c1b35a2bc675da51c09fab0ad0a",
  },
  {
    email: "arun@defitech.net",
    hash: "a532d4bc68432ccdf2299a234554ec8f3129ecdc282f09c6101beea96fef6c6f",
  },
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
  console.log(`Connected to ${process.env.DB_HOST} / ${process.env.DB_NAME}`);

  for (const { email, hash } of USERS) {
    const r = await client.query(
      `UPDATE "MipsUsers" SET "Password" = $1 WHERE email = $2 RETURNING id, email`,
      [hash, email],
    );
    if (r.rowCount === 0) {
      console.warn(`No user found: ${email}`);
    } else {
      console.log(`Password set for ${email} (id ${r.rows[0].id})`);
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
