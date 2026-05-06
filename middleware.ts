import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/api/auth", "/_next/", "/favicon", "/icons/", "/manifest"];

export async function middleware(req: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  // Auth not configured → leave the site open. Set both env vars + restart to enable.
  if (!sitePassword || !secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get("dd_auth")?.value;
  if (cookie && safeEqual(cookie, secret)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals (HMR, RSC, static assets) and PWA / public files; everything else (incl. /api/*) is gated.
  matcher: ["/((?!_next|favicon|icon-|manifest|.*\\.svg$).*)"],
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
