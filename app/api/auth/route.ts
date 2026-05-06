import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { password?: unknown };
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!sitePassword || !secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  if (typeof body.password !== "string" || body.password !== sitePassword) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  // `secure: true` makes browsers drop the cookie on plain HTTP — which kills
  // localhost direct access. Detect the actual scheme: cloudflared sets
  // x-forwarded-proto=https; falls back to the request URL.
  const isHttps =
    req.headers.get("x-forwarded-proto") === "https" ||
    new URL(req.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dd_auth", secret, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dd_auth", "", { path: "/", maxAge: 0 });
  return res;
}
