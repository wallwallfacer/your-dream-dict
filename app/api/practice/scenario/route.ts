import { NextResponse } from "next/server";
import { ai } from "@/lib/ai/client";
import { MODELS, SAMPLING, renderPrompt } from "@/lib/ai/config";
import { lang, type LangCode } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  from: LangCode;
  to: LangCode;
  targetText: string;
  templateText: string;
  explanation?: string;
  slotLabels?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { from, to, targetText, templateText, explanation, slotLabels } = body;
  if (!from || !to || !targetText) {
    return NextResponse.json({ error: "Missing from/to/targetText" }, { status: 400 });
  }

  const prompt = renderPrompt("scenario_generate", {
    nativeLabel: lang(from).label,
    targetLabel: lang(to).label,
    targetText,
    templateText: templateText || targetText,
    explanation: (explanation ?? "").trim() || "(无)",
    slotLabels: (slotLabels ?? "").trim() || "(无显式 slot)",
  });

  try {
    const completion = await ai.chat.completions.create({
      model: MODELS.scenario_generate,
      messages: [{ role: "user", content: prompt }],
      temperature: SAMPLING.scenario_generate.temperature,
      max_completion_tokens: SAMPLING.scenario_generate.max_completion_tokens,
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(text) as { scenario?: unknown };
    const scenario = typeof parsed.scenario === "string" ? parsed.scenario.trim() : "";
    if (!scenario) {
      return NextResponse.json({ error: "Empty scenario" }, { status: 502 });
    }
    return NextResponse.json({ scenario });
  } catch (err) {
    console.error("[/api/practice/scenario] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scenario generation failed" },
      { status: 500 },
    );
  }
}
