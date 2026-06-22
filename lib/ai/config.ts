import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { LangCode } from "../languages";

type Sampling = { temperature: number; max_completion_tokens?: number };

export type TextProviderName = "claude" | "codex" | "openai";
export type TextRoute =
  | "lookup"
  | "chat"
  | "story"
  | "recommendations"
  | "scenario_generate";

export type TextProviderConfig = {
  default: TextProviderName;
  routes: Partial<Record<TextRoute, TextProviderName>>;
  claude: { model: string; cli: string };
  codex: { model: string; cli: string };
};

type AiConfig = {
  models: {
    chat: string;
    image: string;
    tts: string;
    audio_grade: string;
    scenario_generate: string;
  };
  text_provider: TextProviderConfig;
  sampling: {
    lookup: Sampling;
    chat: Sampling;
    recommendations: Sampling;
    story: Sampling;
    bulk_import: Sampling;
    shadowing_grade: Sampling;
    scenario_generate: Sampling;
    scenario_grade: Sampling;
  };
  image: {
    size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    quality: "low" | "medium" | "high" | "auto";
    style_prefix: string;
  };
  tts: {
    voices: Record<LangCode, string>;
    default_voice: string;
    speed: number;
    format: "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";
    style_instructions: string;
  };
  prompts: Record<string, string>;
};

const cfg = parse(
  fs.readFileSync(path.resolve(process.cwd(), "config/ai.yaml"), "utf8"),
) as AiConfig;

export const MODELS = cfg.models;
export const SAMPLING = cfg.sampling;
export const IMAGE = cfg.image;
export const TTS = cfg.tts;
export const TEXT_PROVIDER = cfg.text_provider;

export function providerForRoute(route: TextRoute): TextProviderName {
  const envOverride = process.env.DREAM_DICT_TEXT_PROVIDER as TextProviderName | undefined;
  if (envOverride === "claude" || envOverride === "codex" || envOverride === "openai") {
    return envOverride;
  }
  return cfg.text_provider.routes[route] ?? cfg.text_provider.default;
}

export function ttsVoiceFor(lang: LangCode): string {
  return cfg.tts.voices[lang] ?? cfg.tts.default_voice;
}

export function renderPrompt(name: string, vars: Record<string, string | number>): string {
  const tmpl = cfg.prompts[name];
  if (typeof tmpl !== "string") throw new Error(`Unknown prompt: ${name}`);
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`Prompt "${name}" missing var: ${k}`);
    return String(vars[k]);
  });
}
