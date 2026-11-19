import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// `neon env pull` writes .env if it exists, otherwise .env.local.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
