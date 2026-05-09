import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["*.trycloudflare.com", "itcn001251-mac.tail158c6d.ts.net"],
};

export default nextConfig;
