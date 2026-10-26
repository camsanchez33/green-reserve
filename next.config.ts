import type { NextConfig } from "next";

// SEC-1 (Cam 2026-10-26, "security has to be insane"): security headers on
// every response. Enforced now: HTTPS-only (HSTS), no MIME sniffing, no other
// site may frame any page (clickjacking — nothing of ours is embedded; the
// "button on your website" is a plain link), no plugins, no <base> hijack,
// referrers trimmed cross-origin (check-in links carry a token in the URL),
// and the browser features we never use switched off. The full content policy
// runs REPORT-ONLY first, reporting to Sentry when a DSN is set: it shows what
// would break (Stripe, Cal.com, blob images) before it is enforced.
function sentryCspReportUri(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+/, '');
    if (!u.username || !project) return null;
    return `${u.protocol}//${u.host}/api/${project}/security/?sentry_key=${u.username}`;
  } catch { return null; }
}

const ENFORCED_CSP = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", 'upgrade-insecure-requests'].join('; ');

function reportOnlyCsp(): string {
  const report = sentryCspReportUri();
  return [
    "default-src 'self'",
    // Next's inline bootstrap needs 'unsafe-inline' until nonces are added; Stripe.js for cards and Apple/Google Pay.
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.stripe.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(report ? [`report-uri ${report}`] : []),
  ].join('; ');
}

const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // payment stays on for Apple Pay / Google Pay through Stripe's frame.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://js.stripe.com")' },
  { key: 'Content-Security-Policy', value: ENFORCED_CSP },
  { key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp() },
];

const nextConfig: NextConfig = {
  // SEC-1: never say which framework or version answers.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
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
