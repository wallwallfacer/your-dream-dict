import { NextResponse } from "next/server";
import { ai } from "@/lib/ai/client";
import { MODELS, SAMPLING, renderPrompt } from "@/lib/ai/config";
import { lang, type LangCode } from "@/lib/languages";
import { transcodeToWav } from "@/lib/audio/transcode";

export const runtime = "nodejs";
export const maxDuration = 60;

type GradeJson = {
  transcript?: unknown;
  usedTemplate?: unknown;
  fitsScene?: unknown;
  naturalness?: unknown;
  feedback?: unknown;
};

const PASS_NATURALNESS_THRESHOLD = 0.6;

// Audio-preview models can occasionally wrap JSON in ```json fences despite
// instructions. Strip fences and slice from the first `{` to the last `}` as a
// belt-and-braces fallback before JSON.parse.
function parseJsonLoose(text: string): unknown {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const audio = form.get("audio");
  const targetText = (form.get("targetText") ?? "").toString().trim();
  const templateText = (form.get("templateText") ?? "").toString().trim();
  const scenario = (form.get("scenario") ?? "").toString().trim();
  const explanation = (form.get("explanation") ?? "").toString().trim();
  const from = (form.get("from") ?? "").toString() as LangCode;
  const to = (form.get("to") ?? "").toString() as LangCode;

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }
  if (!targetText || !scenario || !from || !to) {
    return NextResponse.json(
      { error: "Missing targetText/scenario/from/to" },
      { status: 400 },
    );
  }

  let wav: Buffer;
  try {
    const input = Buffer.from(await audio.arrayBuffer());
    wav = await transcodeToWav(input);
  } catch (err) {
    console.error("[/api/practice/scenario/grade] transcode failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Audio transcode failed" },
      { status: 500 },
    );
  }

  const prompt = renderPrompt("scenario_grade", {
    nativeLabel: lang(from).label,
    targetLabel: lang(to).label,
    targetText,
    templateText: templateText || targetText,
    explanation: explanation || "(无)",
    scenario,
  });

  try {
    const completion = await ai.chat.completions.create({
      model: MODELS.audio_grade,
      modalities: ["text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "input_audio",
              input_audio: { data: wav.toString("base64"), format: "wav" },
            },
          ],
        },
      ],
      temperature: SAMPLING.scenario_grade.temperature,
      max_completion_tokens: SAMPLING.scenario_grade.max_completion_tokens,
      // gpt-4o-audio-preview rejects response_format=json_object; rely on the prompt + tolerant parse.
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = parseJsonLoose(text) as GradeJson;
    const transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    const usedTemplate = parsed.usedTemplate === true;
    const fitsScene = parsed.fitsScene === true;
    const naturalness =
      typeof parsed.naturalness === "number" ? Math.max(0, Math.min(1, parsed.naturalness)) : 0;
    const feedback = typeof parsed.feedback === "string" ? parsed.feedback.trim() : "";
    const passed = usedTemplate && fitsScene && naturalness >= PASS_NATURALNESS_THRESHOLD;

    return NextResponse.json({
      passed,
      transcript,
      usedTemplate,
      fitsScene,
      naturalness,
      feedback,
    });
  } catch (err) {
    console.error("[/api/practice/scenario/grade] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Grading failed" },
      { status: 500 },
    );
  }
}
