import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

// Centralize env + state under ~/.dream-dict/ so the repo stays clean and
// sibling services on the same domain can have their own state dirs.
// Loaded BEFORE Next reads config / builds, so all env (incl. NEXT_PUBLIC_*) is inlined correctly.
const envFile = path.join(os.homedir(), ".dream-dict", ".env");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Normalize: must start with "/" and have no trailing slash. Empty string = root.
function normalizeBasePath(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

// Staging build: `scripts/run-server.sh deploy` sets NEXT_BUILD_STAGING=1 so
// `next build` writes to `.next-staging/` while the running prod server keeps
// reading from `.next/`. After the build succeeds the script moves staging
// into place and restarts. Without the env var distDir defaults to `.next`.
const distDir = process.env.NEXT_BUILD_STAGING === "1" ? ".next-staging" : ".next";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  distDir,
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["app.xingchendahai.org"],
};

export default nextConfig;
