import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { functionBaseUrl } from "@neon/env";

// Browser code has no access to Neon env, so resolve the public URLs at build time
// from the variables `neon deploy` / `neon env pull` wrote to .env.local.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const apiUrl =
    env.VITE_API_URL ||
    functionBaseUrl("api", {
      NEON_BRANCH_ID: env.NEON_BRANCH_ID,
      NEON_FUNCTION_HOST_SUFFIX: env.NEON_FUNCTION_HOST_SUFFIX,
    });
  const authUrl = env.VITE_NEON_AUTH_URL || env.NEON_AUTH_BASE_URL;
  if (!authUrl) throw new Error("NEON_AUTH_BASE_URL is not set; run `neon env pull`");
  return {
    root: "web",
    plugins: [react()],
    build: { outDir: "../dist/web", emptyOutDir: true },
    define: {
      __API_URL__: JSON.stringify(apiUrl),
      __NEON_AUTH_URL__: JSON.stringify(authUrl),
    },
  };
});
