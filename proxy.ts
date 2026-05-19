import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/api/auth", "/_next/", "/favicon", "/icons/", "/manifest"];

export async function proxy(req: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  // Auth not configured → leave the site open. Set both env vars + restart to enable.
  if (!sitePassword || !secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("dd_auth")?.value;
  if (cookie && safeEqual(cookie, secret)) return NextResponse.next();

  // For API routes, return JSON 401 instead of redirecting to /login. A 307
  // redirect preserves POST method, so fetch() follows it as POST → /login,
  // which returns the login page HTML with 200 — fetch sees res.ok=true and
  // res.json() blows up on HTML, but the caller can't tell auth failed.
  // A clean 401 makes the error path deterministic.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Root "/" is matched explicitly because the negative-lookahead pattern
  // doesn't catch it consistently under Turbopack in Next.js 16 — without
  // this, /dict (the basePath root) bypasses auth and the SSR'd feed page
  // loads, then every fetch() from JS gets 401'd, leaving the user staring
  // at a spinner that never resolves.
  matcher: [
    "/",
    "/((?!_next|favicon|icon-|manifest|.*\\.svg$).*)",
  ],
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
