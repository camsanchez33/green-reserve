// SEC-1 — every response carries the security headers, and the enforced
// content policy keeps the parts that can never break a page. Reads the real
// next.config.ts. Run: npx tsx scripts/security-headers-test.ts
import config from '../next.config';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function main() {
  const c = await config;
  check('the X-Powered-By header is off', c.poweredByHeader === false);
  const rules = (await c.headers?.()) ?? [];
  const all = rules.find(r => r.source === '/:path*');
  check('one rule covers every path', !!all, rules.map(r => r.source));
  const h = Object.fromEntries((all?.headers ?? []).map(x => [x.key.toLowerCase(), x.value]));
  check('HSTS for two years, subdomains included', /max-age=63072000/.test(h['strict-transport-security'] ?? '') && /includeSubDomains/.test(h['strict-transport-security'] ?? ''), h['strict-transport-security']);
  check('no MIME sniffing', h['x-content-type-options'] === 'nosniff');
  check('no framing (old browsers)', h['x-frame-options'] === 'DENY');
  check('referrer trimmed cross-origin (check-in links carry tokens)', h['referrer-policy'] === 'strict-origin-when-cross-origin');
  const pp = h['permissions-policy'] ?? '';
  check('camera, microphone and location off; payments only for us and Stripe', /camera=\(\)/.test(pp) && /microphone=\(\)/.test(pp) && /geolocation=\(\)/.test(pp) && /payment=\(self "https:\/\/js\.stripe\.com"\)/.test(pp), pp);
  const csp = h['content-security-policy'] ?? '';
  check('enforced policy: no framing, no <base> hijack, no plugins, HTTPS only', ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", 'upgrade-insecure-requests'].every(d => csp.includes(d)), csp);
  const ro = h['content-security-policy-report-only'] ?? '';
  check('the full policy runs report-only and allows Stripe', /default-src 'self'/.test(ro) && /js\.stripe\.com/.test(ro) && /worker-src 'self' blob:/.test(ro), ro);
}

main().catch(e => { console.error(e); failed++; }).finally(() => { console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
