import { defineConfig } from "drizzle-kit";

// Migrations run over the direct connection, as Neon recommends for DDL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
