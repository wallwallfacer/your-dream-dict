// NEXT_PUBLIC_* is inlined at build time so this works on both server and client.
// Empty string = mounted at root. Otherwise starts with "/" and has no trailing slash.
function normalize(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const BASE_PATH = normalize(process.env.NEXT_PUBLIC_BASE_PATH);

// Prefix an app-absolute path (starting with "/") with the basePath.
// next/link and next/router auto-prefix, but fetch() does not.
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}
