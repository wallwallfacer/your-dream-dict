import { NextResponse } from "next/server";
import { generateImagePng } from "@/lib/ai/image";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  if (prompt.length > 800) {
    return NextResponse.json({ error: "Prompt too long" }, { status: 400 });
  }

  try {
    const png = await generateImagePng(prompt);
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch (err) {
    console.error("[/api/image] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 },
    );
  }
}
