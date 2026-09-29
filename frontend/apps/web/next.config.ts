import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const nextConfig: NextConfig = {
  // The API is the only backend; all data flows through server components/actions.
  outputFileTracingRoot: repoRoot,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
