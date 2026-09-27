import type { NextConfig } from "next";

/** Where the product app lives (site deploys on the root, product on app.<tld>). */
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  // Fully static marketing site — every page prerenders. No server data: no
  // API dependency for rendering. The ONE proxy below exists so the parent
  // phone-CTA can request an OTP without a cross-origin request (the product
  // API intentionally allows no browser origins).
  async rewrites() {
    return [
      { source: "/otp", destination: `${APP_ORIGIN}/api/auth/otp` },
    ];
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
