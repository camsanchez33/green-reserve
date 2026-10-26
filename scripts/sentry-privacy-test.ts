// SEC-2 — Sentry sends errors and their stack, never what a person typed or a
// token in a link. v11's defaults collect cookies, bodies, query strings, user
// info, DB data, local variables and AI prompts; this pins every one of them
// off, and checks both the server and the browser init use it.
// Run: npx tsx scripts/sentry-privacy-test.ts
import { readFileSync } from 'fs';
import { SENTRY_DATA_COLLECTION as c } from '../sentry.privacy';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

check('no user info, cookies or URL query strings (check-in and pay links carry tokens)', c.userInfo === false && c.cookies === false && c.urlQueryParams === false);
check('no request or response bodies (login passwords, card setup)', Array.isArray(c.httpBodies) && c.httpBodies.length === 0);
const h = c.httpHeaders as { request?: unknown; response?: unknown };
const allow = (h?.request as { allow?: string[] })?.allow ?? [];
check('request headers only from a short allow-list — never Authorization, Cookie or Referer', Array.isArray(allow) && !allow.some(x => /authorization|cookie|referer/i.test(x)) && h?.response === false, h);
check('no database query data, queue payloads or local variables', c.databaseQueryData === false && c.queues === false && c.stackFrameVariables === false);
check('no AI prompts or replies (Birdie), MCP or GraphQL payloads', c.genAI?.inputs === false && c.genAI?.outputs === false && c.mcp?.inputs === false && c.mcp?.outputs === false && c.graphQL?.document === false && c.graphQL?.variables === false);

const server = readFileSync('sentry.server.config.ts', 'utf8');
const client = readFileSync('sentry.client.config.ts', 'utf8');
check('the server init uses it', /dataCollection: SENTRY_DATA_COLLECTION/.test(server) && /from '\.\/sentry\.privacy'/.test(server));
check('the browser init uses it', /dataCollection: SENTRY_DATA_COLLECTION/.test(client) && /from '\.\/sentry\.privacy'/.test(client));
check('no sendDefaultPii anywhere (v11 removed it; true would have meant IPs)', !/sendDefaultPii/.test(server + client));
const nextConfig = readFileSync('next.config.ts', 'utf8');
check('withSentryConfig comes from @sentry/nextjs/config (v11)', /import\('@sentry\/nextjs\/config'\)/.test(nextConfig));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
