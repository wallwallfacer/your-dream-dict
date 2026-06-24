import { NextResponse } from "next/server";
import { setCursor, countAhead } from "@/lib/feed/store";
import { publish } from "@/lib/feed/bus";
import { refillFeed } from "@/lib/feed/generate";
import { parseLangKey } from "@/lib/entryId";

export const runtime = "nodejs";

// Keep at least this many unserved cards ahead of the shared cursor. Each cursor
// advance is a chokepoint every focused tab hits, so triggering generation here
// (well before a tab manually requests it) hides the LLM latency behind scrolling.
const MIN_AHEAD = 10;

type Body = { langKey?: string; seq?: number };

// The focused/driver tab POSTs its current card position here; the server
// persists it and broadcasts a `cursor` event so follower tabs jump to match.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { langKey, seq } = body;
  if (!langKey || typeof seq !== "number" || !Number.isFinite(seq)) {
    return NextResponse.json({ error: "Missing langKey/seq" }, { status: 400 });
  }
  try {
    setCursor(langKey, seq, Date.now());
    publish(langKey, { type: "cursor", payload: { seq } });

    // Proactively top up the feed when the buffer ahead of the cursor runs low.
    // Fire-and-forget: refillFeed is single-flight per langKey, so repeated cursor
    // posts while low collapse to one generation; appended cards broadcast via SSE.
    const parsed = parseLangKey(langKey);
    if (parsed && countAhead(langKey, seq) < MIN_AHEAD) {
      void refillFeed(langKey, parsed.from, parsed.to).catch((e) =>
        console.warn("[/api/feed/cursor] auto-refill failed", e),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/feed/cursor] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cursor update failed" },
      { status: 500 },
    );
  }
}
