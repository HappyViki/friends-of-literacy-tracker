// Add or update a staff member: npm run staff:add -- someone@example.org [--admin]
// The person signs in with that email in the app and verifies it with the emailed code.
import { Pool } from "pg";
import { normalizeEmail } from "../src/domain/contact.ts";

const [arg, ...flags] = process.argv.slice(2);
const email = normalizeEmail(arg);
if (!email) {
  console.error("usage: npm run staff:add -- someone@example.org [--admin]");
  process.exit(1);
}
const role = flags.includes("--admin") ? "admin" : "staff";
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
await pool.query(
  `insert into staff_members (email, role, added_by) values ($1, $2, 'cli')
   on conflict (email) do update set role = excluded.role, active = true`,
  [email, role],
);
console.log(`${email} is now ${role} on branch ${process.env.NEON_BRANCH ?? "?"}`);
await pool.end();
