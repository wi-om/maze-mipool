/**
 * Create/update MIPS admin login users.
 * Passwords are SHA256 hex (same as client-side hash before login).
 *
 * Run: node scripts/seed-mips-users.js
 */
require("dotenv").config();
const { Client } = require("pg");

const SCHEMA = process.env.DB_SCHEMA || "mipool";

const USERS = [
  {
    name: "Om Sharma",
    email: "om@workinfinity.com",
    role: "superadmin",
    // Om@991313
    passwordHash: "5326bc72f0bdd9afb997a609872eb81045533c1b35a2bc675da51c09fab0ad0a",
  },
];

async function ensureMipsUsersTable(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${SCHEMA}"."MipsUsers" (
      id SERIAL PRIMARY KEY,
      name varchar(256) NOT NULL,
      email varchar(128) NOT NULL UNIQUE,
      "Password" char(64),
      role varchar(32) NOT NULL DEFAULT 'admin',
      "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
      "modifiedOn" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
}

async function upsertUser(client, user) {
  const existing = await client.query(
    `SELECT id FROM "${SCHEMA}"."MipsUsers" WHERE email = $1`,
    [user.email]
  );

  if (existing.rows.length) {
    const res = await client.query(
      `UPDATE "${SCHEMA}"."MipsUsers"
       SET name = $1, role = $2, "Password" = $3, "modifiedOn" = now()
       WHERE email = $4
       RETURNING id, email, role`,
      [user.name, user.role, user.passwordHash, user.email]
    );
    console.log(`Updated user: ${res.rows[0].email} (id=${res.rows[0].id}, role=${res.rows[0].role})`);
    return;
  }

  const res = await client.query(
    `INSERT INTO "${SCHEMA}"."MipsUsers" (name, email, role, "Password", "createdOn", "modifiedOn")
     VALUES ($1, $2, $3, $4, now(), now())
     RETURNING id, email, role`,
    [user.name, user.email, user.role, user.passwordHash]
  );
  console.log(`Created user: ${res.rows[0].email} (id=${res.rows[0].id}, role=${res.rows[0].role})`);
}

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
  console.log(`Connected to ${process.env.DB_HOST}/${process.env.DB_NAME} (schema: ${SCHEMA})`);

  await ensureMipsUsersTable(client);
  for (const user of USERS) {
    await upsertUser(client, user);
  }

  await client.end();
  console.log("\nDone. Login at /signin with seeded credentials.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
