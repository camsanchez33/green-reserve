import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      { source: '/courses', destination: '/', permanent: true },
      // /account retired (2026-07) — the platform is white-label, per-course
      // portals only (GOLFER_SPEC G5, /courses/[slug]/account). The underlying
      // GolferAccount system stays; it powers those portals. Revisit if
      // marketplace mode ships — this becomes the cross-course home then.
      { source: '/account/:path*', destination: '/', permanent: true },
    ];
  },
};

// Wrap with Sentry only when DSN is configured — build succeeds without it.
async function buildConfig() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
  if (!dsn) return nextConfig;

  const { withSentryConfig } = await import('@sentry/nextjs');
  return withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
  });
}

export default buildConfig();
