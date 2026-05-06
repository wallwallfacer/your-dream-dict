import { NextResponse } from "next/server";
import { pullSince, pushBatch, type SyncPayload } from "@/lib/sync/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since") ?? "0";
  const since = Number.isFinite(Number(sinceRaw)) ? Math.max(0, Number(sinceRaw)) : 0;
  try {
    const result = pullSince(since);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/sync GET] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync pull failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: SyncPayload;
  try {
    body = (await req.json()) as SyncPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const result = pushBatch(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/sync POST] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync push failed" },
      { status: 500 },
    );
  }
}
