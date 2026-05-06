import OpenAI from "openai";

const baseURL = process.env.OPENAI_BASE_URL;
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn(
    "[ai/client] OPENAI_API_KEY is not set — calls will fail until you add it to .env.local",
  );
}

export const ai = new OpenAI({
  apiKey: apiKey ?? "missing",
  baseURL: baseURL || undefined,
});

// Models, sampling params, prompts, voices live in config/ai.yaml.
// Re-exported here so existing call sites keep `import { MODELS } from "./client"`.
export { MODELS } from "./config";
