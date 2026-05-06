// One-shot bulk import: take a list of saved sentences/templates, run them through
// the same gpt-4o lookup pipeline used by the app, and insert the results directly
// into ~/.dream-dict/dream-dict.sqlite. The running browser will pull them on its
// next sync poll.
//
// Usage:
//   LIMIT=3 node scripts/bulk-import.mjs       # smoke-test first 3
//   node scripts/bulk-import.mjs               # all of INPUTS
//
// Idempotent: skips ids that already exist in the entries table.

import pkg from "@next/env";
import OpenAI from "openai";
import Database from "better-sqlite3";
import { parse as parseYaml } from "yaml";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

// Load shared AI config (models, sampling, prompts) — same file the Next.js
// server reads via lib/ai/config.ts. Keeps bulk-import in lockstep with the app.
const AI_CONFIG = parseYaml(
  fs.readFileSync(path.resolve(process.cwd(), "config/ai.yaml"), "utf8"),
);

function renderPrompt(name, vars) {
  const tmpl = AI_CONFIG.prompts[name];
  if (typeof tmpl !== "string") throw new Error(`Unknown prompt: ${name}`);
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Prompt "${name}" missing var: ${k}`);
    return String(vars[k]);
  });
}

const FROM = "zh";
const TO = "en";
const CONCURRENCY = 3;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;

const INPUTS = [
  "A little something about myself",
  "This problem can be broken down into two parts: candidate generation and ranking.",
  "I'm very confident we both have what it takes To make BrewHaven a success",
  "For every complex problem there is an answer that is clear, simple, and wrong.",
  "At a high level, the logic works like this: we score each candidate and then rank them based on predicted utility.",
  "So what I'm hearing is we'll try the simpler approach first, then revisit if it doesn't scale.",
  "Whatever you do, do it a hundred percent. When you work, work. When you laugh, laugh. When you eat, eat like it's your last meal.",
  "Maybe a good next step is to run a quick benchmark before we decide.",
  "That's a solid idea — the only catch is we don't have enough labeled data yet.",
  "I'll let you get back to work",
  "It goes without saying that exercise is very important for our health",
  "Let's put a pin in it for now and see how things develop over the next few weeks",
  "If we run into unexpected technical issues, we'll deal with it when the time comes.",
  "Not necessarily — it depends on how frequent the re-training is and how volatile the data is.",
  "To sum it up, we have two options — keep fixing this workaround or move to a more stable framework.",
  "I've been in the weeds all morning, trying to optimize the hyperparameters. What's the overall progress on the project?",
  "The pleasure of finding things out is greater than the pleasure of knowing things",
  "That might be part of the issue, but not the full picture — we also need to look at the cache layer.",
  "There are a couple of things going on here — one is the inconsistent input, and the other is the retry logic.",
  "All happy families are alike; each unhappy family is unhappy in its own way.",
  "The magic you're looking for is in the work you are avoiding",
  "So you are saying it's not a data latency issue, it's a logic bug — let me know if I'm misunderstanding your point",
  "We haven't looked into that yet, but it's worth exploring.",
  "Over time, general methods that leverage computation scale better and outperform human-designed, domain-specific methods.",
  "Watch your thoughts, for they become words. Watch your words, for they become actions. Watch your actions, for they become habits. Watch your habits, for they become character. Watch your character, for it becomes your destiny.",
  "It's likely the issue will go away once we upgrade, but I wouldn't say it's guaranteed.",
  "At a high level, here's what's happening — the pipeline runs fine on staging, but fails intermittently in prod.",
  "Just to set some context — this idea came out of the last retro when we discussed pipeline flakiness.",
  "Foundation models that are trained to directly input, and often also directly generate, audio have contributed to this growth, but they are only part of the story.",
  "So it sounds like we're leaning toward simplifying the logic and shipping a minimal version first?",
  "It depends on how strict we want to be about data freshness — if 5 minutes is okay, this approach works.",
  "It could work, but I think we'd need to test it first under load",
  "We'll probably want to break this into smaller pieces.",
  "There's a bit of complexity around how user status is calculated across regions.",
  "I'm not entirely sure yet why the precision dropped — still digging into it",
  "Here's where we're at right now — data cleaning is done, and we're running initial model tests.",
  "It's not a blocker, just something to keep in mind when we scale this later.",
  "That's a good catch — I hadn't thought of how that affects the legacy pipeline.",
  "Is there a rough timeline we can align on for the SDK integration?",
  "This solution assumes that the new data pipeline is already in place.",
  "We're considering two main approaches here — one is rule-based, the other is model-driven.",
  "To Cure Sometimes, To Relieve Often, To Comfort Always",
  "We don't need to make a call on that now — this is something we can revisit later if needed.",
  "From a feasibility standpoint, this might be tricky — we don't currently support multi-tenant configs.",
  "One clear benefit of this approach is that it drastically reduces manual effort in data labeling. The downside, however, is that it adds complexity to the deployment process.",
  "We don't have a strong preference either way — happy to go with what works best for the team.",
  "Not yet. Can we have a few more minutes?",
  "That's our current plan for rollout. Do you have any thoughts or concerns on this?",
  "Is there a wait?",
  "It's too early to draw any firm conclusions, but the early results look promising.",
  "Based on the data we've seen so far, user engagement tends to drop after the third notification.",
  "From what we've observed...",
  "I hear good things about it",
  "He has a long-haul perspective and doesn't get discouraged by short-term setbacks",
  "I'm not 100% sure about that — we might want to double-check how the API handles edge cases.",
  "That's a fair point. One thing to add is that we may also need to monitor memory usage over time",
  "What are the trade-offs we're looking at here — is the latency gain worth the added storage cost?",
  "A good next step might be to...",
  "If we go down this path, we need to be mindful of the increased infrastructure cost for real-time processing.",
  "The main bottleneck we're seeing is in the batch job runtime — it's currently taking over two hours to complete.",
  "One alternative we considered was precomputing the embeddings, but it added too much latency during updates",
  "This is still a work in progress, but here's what we have so far: the data pipeline is ready, and we've run initial tests on model accuracy.",
  "It's been a positive experience so far.",
  "'Whenever you feel like criticizing any one,' he told me, 'just remember that all the people in this world haven't had the advantages that you've had.' — The Great Gatsby",
  "We're currently exploring whether a transformer-based model performs better on sequential data.",
  "The model accuracy dropped significantly after the last deployment. Do we have any insight into why that might be happening?",
  "One trade-off we had to make was reducing model complexity at the cost of some precision.",
  "Is there a specific reason why you chose to oversample rather than use class weights?",
  "This approach builds on the idea that users with similar behavior can be clustered to improve recommendation accuracy.",
  "One thing to note here is that the model assumes input features are normalized.",
  "We're in the process of finalizing the error handling logic for the retry mechanism.",
  "There's still some uncertainty around the third-party API's rate limits",
  "I'm leaning towards keeping the logic on the client side for performance reasons.",
  "At this point, the deployment is done, and we're monitoring for any anomalies.",
  "The current thinking is to split the service into two smaller modules.",
  "This sounds doable. What's the timeline we're aiming for?",
  "What time are we supposed to meet?",
  "We're looking at...",
  "Perhaps I wasn't clear enough in my previous message. Let me clarify",
  "I can see the benefits of that, especially when...",
  "I might just do that",
  "That connects well with our earlier discussion about API security, particularly when we consider the mobile endpoints.",
  "I see where you're going with this...",
  "Here's the high-level idea behind this: we use historical user activity to predict engagement probability for each content type.",
  "Build on your idea of...",
  "I'd like to build on that point...",
  "This is a non-trivial problem because...",
  "Let's keep it short, considering the time.",
  "There's some room for improvement in...",
  "Let's take a look under the hood of...",
  "In terms of technical feasibility...",
  "To put it another way...",
  "Let me elaborate on that...",
  "What do you think of that? Does that make sense?",
  "I think we'd better leave — time's getting very tight",
  "Have you thought of...",
];

// ---- Prompt: shared `lookup` + `lookup_bulk_extra` from config/ai.yaml ----

function buildPrompt(query, fromLabel, toLabel, fromCode) {
  const vars = {
    nativeLabel: fromLabel,
    targetLabel: toLabel,
    query,
    partOfSpeechHint: fromCode === "zh" ? "句式" : "sentence pattern",
  };
  return renderPrompt("lookup", vars) + renderPrompt("lookup_bulk_extra", vars);
}

// ---- Sanitization (mirrors lib/ai/lookup.ts:parseEntry / sanitizeSegments) ----

function sanitizeSegments(raw, fullText) {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned = [];
  for (const seg of raw) {
    if (!seg || typeof seg.text !== "string") return undefined;
    if (seg.kind !== "template" && seg.kind !== "slot") return undefined;
    if (seg.text.length === 0) continue;
    const label =
      seg.kind === "slot" && typeof seg.label === "string" && seg.label.trim()
        ? seg.label.trim()
        : undefined;
    cleaned.push({ text: seg.text, kind: seg.kind, ...(label ? { label } : {}) });
  }
  if (cleaned.length === 0) return undefined;
  const joined = cleaned.map((s) => s.text).join("");
  if (joined !== fullText) return undefined;
  return cleaned;
}

function parseEntry(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  const obj = JSON.parse(cleaned);
  if (!obj.term || !Array.isArray(obj.examples) || obj.examples.length === 0) {
    throw new Error("Lookup response is missing required fields");
  }
  obj.termSegments = sanitizeSegments(obj.termSegments, obj.term);
  obj.examples = obj.examples.slice(0, 4).map((ex) => ({
    target: ex.target,
    native: ex.native,
    source: ex.source && ex.source.trim() ? ex.source.trim() : undefined,
    targetSegments: sanitizeSegments(ex.targetSegments, ex.target),
  }));
  obj.related = Array.isArray(obj.related) ? obj.related.slice(0, 4) : [];
  obj.nativeEquivalents = Array.isArray(obj.nativeEquivalents)
    ? obj.nativeEquivalents.filter((s) => typeof s === "string" && s.trim()).slice(0, 4)
    : [];
  return obj;
}

// ---- Post-processing: inject user's original as examples[0] for concrete inputs ----

function looksAbstract(query) {
  // Inputs that the user already wrote with "..." or "…" placeholders are templates;
  // letting the LLM's 4 concrete fills speak for themselves is more useful than
  // injecting a literal "..."-bearing sentence as example #1.
  return /\.{3}|…/.test(query);
}

function injectOriginalExample(entry, termNative) {
  if (!entry.termSegments) return entry;
  const original = {
    target: entry.term,
    native: termNative ?? "",
    targetSegments: entry.termSegments.map((s) => ({ text: s.text, kind: s.kind })),
  };
  // Avoid duplicating if the LLM already produced an example identical to the term.
  const dup = entry.examples.findIndex((ex) => ex.target.trim() === entry.term.trim());
  const rest = dup >= 0 ? entry.examples.filter((_, i) => i !== dup) : entry.examples.slice(0, 4);
  return { ...entry, examples: [original, ...rest].slice(0, 5) };
}

// ---- OpenAI call ----

const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

const LANG_LABEL = { zh: "Chinese", en: "English" };

async function lookup(query) {
  const prompt = buildPrompt(query, LANG_LABEL[FROM], LANG_LABEL[TO], FROM);
  const completion = await ai.chat.completions.create({
    model: AI_CONFIG.models.chat,
    messages: [{ role: "user", content: prompt }],
    temperature: AI_CONFIG.sampling.bulk_import.temperature,
    max_completion_tokens: AI_CONFIG.sampling.bulk_import.max_completion_tokens,
    response_format: { type: "json_object" },
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const obj = parseEntry(text);
  // Capture termNative separately, then strip it from the stored entry (the schema
  // doesn't carry termNative — it's only used to seed examples[0].native).
  const termNative = typeof obj.termNative === "string" ? obj.termNative : undefined;
  delete obj.termNative;
  return { entry: obj, termNative };
}

// ---- SQLite ----

const DB_PATH =
  process.env.DREAM_DICT_DB_PATH ??
  path.join(os.homedir(), ".dream-dict", "dream-dict.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    from_lang TEXT NOT NULL,
    to_lang TEXT NOT NULL,
    data_json TEXT NOT NULL,
    image_data_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER,
    review_count INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at);
`);

const upsert = db.prepare(`
  INSERT INTO entries (id, query, from_lang, to_lang, data_json, image_data_url, created_at, updated_at, deleted, last_reviewed_at, review_count)
  VALUES (@id, @query, @fromLang, @toLang, @dataJson, NULL, @createdAt, @updatedAt, 0, @lastReviewedAt, @reviewCount)
  ON CONFLICT(id) DO UPDATE SET
    data_json = excluded.data_json,
    updated_at = excluded.updated_at,
    deleted = 0
  WHERE excluded.updated_at > entries.updated_at
`);

const checkExisting = db.prepare("SELECT id, deleted FROM entries WHERE id = ?");

function entryId(query) {
  return `${FROM}->${TO}::${query.trim().toLowerCase()}`;
}

// ---- Main ----

async function processOne(query) {
  const id = entryId(query);
  const existing = checkExisting.get(id);
  if (existing && !existing.deleted) {
    return { skip: true, query };
  }
  const { entry, termNative } = await lookup(query);
  const finalEntry = looksAbstract(query) ? entry : injectOriginalExample(entry, termNative);
  const now = Date.now();
  upsert.run({
    id,
    query,
    fromLang: FROM,
    toLang: TO,
    dataJson: JSON.stringify(finalEntry),
    createdAt: now,
    updatedAt: now,
    lastReviewedAt: now,
    reviewCount: 0,
  });
  return { skip: false, query, entry: finalEntry };
}

async function run() {
  const targets = INPUTS.slice(0, LIMIT);
  console.log(`Importing ${targets.length} entr${targets.length === 1 ? "y" : "ies"} (FROM=${FROM}, TO=${TO}, concurrency=${CONCURRENCY})`);
  console.log(`SQLite: ${DB_PATH}`);

  const queue = [...targets];
  let done = 0;
  let failed = 0;
  let skipped = 0;
  const samples = [];

  async function worker(id) {
    while (queue.length > 0) {
      const q = queue.shift();
      try {
        const r = await processOne(q);
        if (r.skip) {
          skipped++;
          console.log(`  [w${id}] skip (exists): ${q.slice(0, 70)}`);
        } else {
          done++;
          console.log(`  [w${id}] ok    (${done}/${targets.length}): "${r.entry.term.slice(0, 70)}" — ${r.entry.examples.length} ex`);
          if (samples.length < 3) samples.push({ query: q, entry: r.entry });
        }
      } catch (e) {
        failed++;
        console.warn(`  [w${id}] FAIL: ${q.slice(0, 70)}: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  console.log(`\nDone. ok=${done} skipped=${skipped} failed=${failed}`);

  if (samples.length > 0) {
    console.log("\n=== sample of imported entries ===");
    for (const s of samples) {
      console.log(`\n--- input: ${s.query}`);
      console.log(JSON.stringify(s.entry, null, 2));
    }
  }
}

run().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
