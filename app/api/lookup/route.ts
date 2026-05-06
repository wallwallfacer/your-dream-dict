import { NextResponse } from "next/server";
import { callLookup } from "@/lib/ai/lookup";
import type { LangCode } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { query?: string; from?: LangCode; to?: LangCode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, from, to } = body;
  if (!query || !from || !to) {
    return NextResponse.json(
      { error: "Missing required fields: query, from, to" },
      { status: 400 },
    );
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "Query too long (max 500 chars)" }, { status: 400 });
  }

  try {
    const entry = await callLookup(query.trim(), from, to);
    return NextResponse.json(entry);
  } catch (err) {
    console.error("[/api/lookup] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 500 },
    );
  }
}
