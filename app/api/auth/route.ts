import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = detectProto(req);
  return `${proto}://${host}`;
}

function detectProto(req: Request): string {
  if (req.headers.get("x-forwarded-proto") === "https") return "https";
  const host = req.headers.get("host") || "";
  if (host.endsWith(".ts.net") || host.endsWith(".tailscale.net")) return "https";
  if (new URL(req.url).protocol === "https:") return "https";
  return "http";
}

export async function POST(req: Request) {
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!sitePassword || !secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const contentType = req.headers.get("content-type") || "";
  const origin = getOrigin(req);

  let password: string | undefined;
  let next = "/";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    password = form.get("password") as string | undefined;
    next = (form.get("next") as string) || "/";
  } else {
    let body: { password?: unknown; next?: unknown };
    try {
      body = (await req.json()) as { password?: unknown; next?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    password = typeof body.password === "string" ? body.password : undefined;
    next = typeof body.next === "string" ? body.next : "/";
  }

  if (!password || password !== sitePassword) {
    await new Promise((r) => setTimeout(r, 400));
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const url = new URL("/login", origin);
      url.searchParams.set("error", "wrong");
      url.searchParams.set("next", next);
      return NextResponse.redirect(url.toString(), 303);
    }
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const isHttps = origin.startsWith("https");
  const cookieOpts = {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const redirectUrl = new URL(next, origin);
    const res = NextResponse.redirect(redirectUrl.toString(), 303);
    res.cookies.set("dd_auth", secret, cookieOpts);
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("dd_auth", secret, cookieOpts);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dd_auth", "", { path: "/", maxAge: 0 });
  return res;
}
