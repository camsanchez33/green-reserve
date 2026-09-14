import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // AG-1: the agreement Markdown is read from disk at request time by the
  // acceptance route and the page; make sure the deployment bundles it.
  outputFileTracingIncludes: { '/**': ['./legal/documents/**/*'] },
  // AG-2: the PDF renderer is a Node package with its own font/asset loading;
  // bundling it breaks it, so it stays external.
  serverExternalPackages: ['@react-pdf/renderer'],
  // H-1 (UI_REVISE_SPEC §5 assets): WebP/AVIF and the 800/1200/1600 widths.
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 800, 1080, 1200, 1600, 1920, 2048, 3840],
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
