import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/ai/tts";
import type { LangCode } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { text?: string; lang?: LangCode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = body.text?.trim();
  const lang = body.lang;
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });
  if (!lang) return NextResponse.json({ error: "Missing lang" }, { status: 400 });
  if (text.length > 600) {
    return NextResponse.json({ error: "Text too long (max 600 chars)" }, { status: 400 });
  }

  try {
    const mp3 = await synthesizeSpeech(text, lang);
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch (err) {
    console.error("[/api/tts] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS failed" },
      { status: 500 },
    );
  }
}
