import { NextResponse } from "next/server";
import { ai } from "@/lib/ai/client";
import { MODELS, SAMPLING, renderPrompt } from "@/lib/ai/config";
import { lang, type LangCode } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  from: LangCode;
  to: LangCode;
  exclude?: string[];
  excludeTemplates?: string[];
  count?: number;
};

const EXCLUDE_CAP = 100;
const EXCLUDE_TEMPLATES_CAP = 100;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { from, to, exclude = [], excludeTemplates = [], count = 5 } = body;
  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }
  const n = Math.min(Math.max(count, 1), 12);

  const native = lang(from);
  const target = lang(to);

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

  try {
    const completion = await ai.chat.completions.create({
      model: MODELS.chat,
      messages: [{ role: "user", content: prompt }],
      temperature: SAMPLING.recommendations.temperature,
      max_completion_tokens: SAMPLING.recommendations.max_completion_tokens,
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(text) as { terms?: unknown };
    const terms = Array.isArray(parsed.terms)
      ? parsed.terms
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim())
          .slice(0, n)
      : [];
    if (terms.length === 0) {
      return NextResponse.json({ error: "No recommendations returned" }, { status: 502 });
    }
    return NextResponse.json({ terms });
  } catch (err) {
    console.error("[/api/recommendations] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recommendation failed" },
      { status: 500 },
    );
  }
}
