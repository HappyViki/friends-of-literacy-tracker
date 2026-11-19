import { readFileSync } from "node:fs";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { functionBaseUrl } from "@neon/env";

// Neon Auth is reached through this site's own origin at /neon-auth (a Vite dev proxy locally, a
// Vercel rewrite when deployed). Its cookies are then first-party, so sign-in (email and Google)
// works in browsers that block third-party cookies, such as Safari.
const AUTH_PATH = "/neon-auth";

/**
 * Adds the Vercel pieces to dist/web: a Node.js Function (web/vercel/neon-auth.js) that proxies
 * /neon-auth to this branch's Neon Auth, and the vercel.json rewrite that routes to it. A plain
 * external rewrite doesn't work: Neon Auth rejects the forwarded host header.
 */
function vercelAuthProxy(authUrl: string): Plugin {
  return {
    name: "vercel-auth-proxy",
    apply: "build",
    generateBundle() {
      const fn = readFileSync(new URL("./web/vercel/neon-auth.js", import.meta.url), "utf8");
      this.emitFile({ type: "asset", fileName: "api/neon-auth.mjs", source: fn.replaceAll("__NEON_AUTH_BASE_URL__", authUrl.replace(/\/+$/, "")) });
      this.emitFile({
        type: "asset",
        fileName: "vercel.json",
        source: JSON.stringify({ rewrites: [{ source: `${AUTH_PATH}/:path*`, destination: "/api/neon-auth?path=:path*" }] }, null, 2),
      });
    },
  };
}

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
    plugins: [react(), vercelAuthProxy(authUrl)],
    build: { outDir: "../dist/web", emptyOutDir: true },
    server: { proxy },
    preview: { proxy },
    define: {
      __API_URL__: JSON.stringify(apiUrl),
      __NEON_AUTH_PATH__: JSON.stringify(AUTH_PATH),
    },
  };
});
