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

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["*.trycloudflare.com", "itcn001251-mac.tail158c6d.ts.net"],
};

export default nextConfig;
