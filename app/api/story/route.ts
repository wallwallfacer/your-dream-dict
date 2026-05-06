import { NextResponse } from "next/server";
import { ai } from "@/lib/ai/client";
import { MODELS, SAMPLING, renderPrompt } from "@/lib/ai/config";
import { lang, type LangCode } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoryBody = {
  terms: string[];
  from: LangCode;
  to: LangCode;
};

export async function POST(req: Request) {
  let body: StoryBody;
  try {
    body = (await req.json()) as StoryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { terms, from, to } = body;
  if (!Array.isArray(terms) || terms.length === 0) {
    return NextResponse.json({ error: "Need at least one term" }, { status: 400 });
  }

  const native = lang(from);
  const target = lang(to);

  const prompt = renderPrompt("story", {
    nativeLabel: native.label,
    targetLabel: target.label,
    termsList: terms.map((t) => `"${t}"`).join(", "),
  });

  try {
    const completion = await ai.chat.completions.create({
      model: MODELS.chat,
      messages: [{ role: "user", content: prompt }],
      temperature: SAMPLING.story.temperature,
      max_completion_tokens: SAMPLING.story.max_completion_tokens,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const [storyTarget, storyNative] = text.split(/\n---+\n/);
    return NextResponse.json({
      target: (storyTarget ?? text).trim(),
      native: (storyNative ?? "").trim(),
    });
  } catch (err) {
    console.error("[/api/story] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Story generation failed" },
      { status: 500 },
    );
  }
}
