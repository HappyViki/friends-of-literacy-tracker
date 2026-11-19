import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Categorization fallback after the OpenAI Decisions API. Needs AI Gateway credits on the
  // Neon account; without them every call returns 403 and keyword rules are used instead.
  aiGateway: true,
  functions: {
    books: {
      name: "isbn lookup",
      source: "src/index.ts",
      env: {
        // Callers send this as `x-api-key` or `Authorization: Bearer`.
        BOOKS_API_KEY: { value: process.env.BOOKS_API_KEY, required: true },
        // Optional: OpenAI Decisions API, tried first when set (about $0.00005 per book).
        OPENAI_API_KEY: { value: process.env.OPENAI_API_KEY, required: false },
        DECISIONS_MODEL: { value: process.env.DECISIONS_MODEL, required: false },
        // Optional, unused by default: OpenCode Zen's "-free" models reject backend calls
        // (FreeUsageLimitError). Set this for paid Zen models or an OpenCode Go plan.
        OPENCODE_API_KEY: { value: process.env.OPENCODE_API_KEY, required: false },
        // Optional: https://opencode.ai/zen/v1 (default) or https://opencode.ai/inference/go/v1 for OpenCode Go.
        OPENCODE_BASE_URL: { value: process.env.OPENCODE_BASE_URL, required: false },
        // Optional: comma-separated OpenCode model IDs, tried in order.
        OPENCODE_MODELS: { value: process.env.OPENCODE_MODELS, required: false },
        // Optional: comma-separated AI Gateway model IDs (default "claude-haiku-5-5,gpt-5-nano").
        GATEWAY_MODELS: { value: process.env.GATEWAY_MODELS, required: false },
        // Optional: Google Books key for production volume.
        GOOGLE_BOOKS_API_KEY: { value: process.env.GOOGLE_BOOKS_API_KEY, required: false },
      },
    },
  },
});
