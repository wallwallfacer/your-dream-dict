import "server-only";
import { renderPrompt } from "../ai/config";
import { callText, extractJSON } from "../ai/text";
import { lang, type LangCode } from "../languages";

const EXCLUDE_CAP = 100;
const EXCLUDE_TEMPLATES_CAP = 100;

// Match the seen-log keys, which are stored lowercased.
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export type RecommendInput = {
  from: LangCode;
  to: LangCode;
  exclude?: string[];
  excludeTemplates?: string[];
  count?: number;
};

// Ask the LLM for fresh terms to learn, excluding ones already seen. The prompt
// only carries the most-recent EXCLUDE_CAP entries; the FULL exclude list is the
// hard filter applied after the model responds (LLMs ignore exclude lists often
// enough that prompt-only dedup leaks duplicates into the feed).
export async function generateRecommendations({
  from,
  to,
  exclude = [],
  excludeTemplates = [],
  count = 5,
}: RecommendInput): Promise<string[]> {
  const n = Math.min(Math.max(count, 1), 20);
  const native = lang(from);
  const target = lang(to);

  const excludeSet = new Set(exclude.map(normalize));

  const excludeBlock =
    exclude.length > 0
      ? `\nDo NOT pick any of these (already seen): ${exclude.slice(0, EXCLUDE_CAP).map((t) => `"${t}"`).join(", ")}.`
      : "";

  // Templates use "___" for slots. The wording asks the LLM to also reject
  // morphological / paraphrase variants of these skeletons (Could/Can/Would
  // you ___) — sentence-level dedup alone misses those.
  const excludeTemplatesBlock =
    excludeTemplates.length > 0
      ? `\nDo NOT reuse any of these template skeletons — including paraphrases or morphological variants (e.g. "Could you" vs "Can you" vs "Would you mind", or active/passive flips, count as the same skeleton): ${excludeTemplates
          .slice(0, EXCLUDE_TEMPLATES_CAP)
          .map((t) => `"${t}"`)
          .join(", ")}.`
      : "";

  const prompt = renderPrompt("recommendations", {
    nativeLabel: native.label,
    targetLabel: target.label,
    count: n,
    excludeBlock,
    excludeTemplatesBlock,
  });

  const text = await callText({ route: "recommendations", user: prompt, jsonMode: true });
  const parsed = JSON.parse(extractJSON(text || "{}")) as { terms?: unknown };
  const rawTerms = Array.isArray(parsed.terms)
    ? parsed.terms
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
    : [];

  const batchSeen = new Set<string>();
  const terms: string[] = [];
  for (const t of rawTerms) {
    const key = normalize(t);
    if (excludeSet.has(key) || batchSeen.has(key)) continue;
    batchSeen.add(key);
    terms.push(t);
    if (terms.length >= n) break;
  }
  return terms;
}
