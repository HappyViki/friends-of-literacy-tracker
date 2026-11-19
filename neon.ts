import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  // Book categorization fallback after the OpenAI Decisions API. Needs AI Gateway credits;
  // without them those calls fail and keyword rules are used.
  aiGateway: true,
  functions: {
    api: {
      name: "Friends of Literacy API",
      source: "./src/api/index.ts",
      env: {
        // Comma-separated browser origins allowed to call the API (CORS).
        ALLOWED_ORIGINS: {
          value: process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:4173",
          required: false,
        },
        // Book categorizer (src/books). OpenAI Decisions API is tried first when set.
        OPENAI_API_KEY: { value: process.env.OPENAI_API_KEY, required: false },
        DECISIONS_MODEL: { value: process.env.DECISIONS_MODEL, required: false },
        // Optional: comma-separated AI Gateway model IDs (default "claude-haiku-5-5,gpt-5-nano").
        GATEWAY_MODELS: { value: process.env.GATEWAY_MODELS, required: false },
        // Time zone for dates in the data export (an evening visit stays on its own day).
        ORG_TIMEZONE: { value: process.env.ORG_TIMEZONE ?? "America/Los_Angeles", required: false },
        // Optional: Google Books key; without one Google rate-limits and Open Library answers.
        GOOGLE_BOOKS_API_KEY: { value: process.env.GOOGLE_BOOKS_API_KEY, required: false },
      },
    },
  },
  branch: (branch) => {
    if (branch.isDefault) return {};
    // New non-default branches auto-expire. Create one with `neon checkout <name> --create`.
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
