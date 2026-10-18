import type { NextConfig } from "next";

// Baseline hardening headers for every response. A strict Content-Security-Policy
// needs per-request nonces to work with Next's inline scripts, so it is listed
// under "What's next" in the README rather than shipped half-configured.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // This app is almost entirely per-user, request-time data, so the Cache
  // Components / partial prefetching defaults from the scaffold are turned off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The Admin SDK uses native/gRPC modules that must not be bundled.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
