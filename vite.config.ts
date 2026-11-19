import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { functionBaseUrl } from "@neon/env";

// Neon Auth is reached through this site's own origin at /neon-auth: a Vite dev proxy locally, and on
// Vercel the api/neon-auth.js Function that vercel.json routes to. Its cookies are then first-party,
// so sign-in works in browsers that block third-party cookies, such as Safari.
const AUTH_PATH = "/neon-auth";

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
  const upstream = new URL(authUrl);
  const proxy = {
    [AUTH_PATH]: {
      target: upstream.origin,
      changeOrigin: true,
      rewrite: (path: string) => upstream.pathname.replace(/\/+$/, "") + path.slice(AUTH_PATH.length),
    },
  };
  return {
    root: "web",
    plugins: [react()],
    build: { outDir: "../dist/web", emptyOutDir: true },
    server: { proxy },
    preview: { proxy },
    define: {
      __API_URL__: JSON.stringify(apiUrl),
      __NEON_AUTH_PATH__: JSON.stringify(AUTH_PATH),
    },
  };
});
