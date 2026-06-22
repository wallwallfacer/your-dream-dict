import { NextResponse } from "next/server";
import { renderPrompt } from "@/lib/ai/config";
import { callText } from "@/lib/ai/text";
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
    const text = await callText({ route: "story", user: prompt });
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
