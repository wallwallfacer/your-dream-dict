import { NextResponse } from "next/server";
import { refillFeed } from "@/lib/feed/generate";
import { LANGUAGES, type LangCode } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { langKey?: string; from?: LangCode; to?: LangCode };

function isLang(c: unknown): c is LangCode {
  return typeof c === "string" && LANGUAGES.some((l) => l.code === c);
}

// A focused tab nearing the end of the feed POSTs here to extend the shared
// stream. refillFeed is single-flight per langKey and broadcasts the new items
// to all connected tabs via SSE, so the response body is just a count.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { langKey, from, to } = body;
  if (!langKey || !isLang(from) || !isLang(to)) {
    return NextResponse.json({ error: "Missing langKey/from/to" }, { status: 400 });
  }
  try {
    const appended = await refillFeed(langKey, from, to);
    return NextResponse.json({ ok: true, appended: appended.length });
  } catch (err) {
    console.error("[/api/feed/refill] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refill failed" },
      { status: 500 },
    );
  }
}
