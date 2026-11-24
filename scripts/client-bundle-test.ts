// Security audit 2026-11-24: nothing secret or server-only reaches the browser bundle.
// A build of main put lib/stripe.ts and lib/prisma.ts into the /dashboard/money and
// /dashboard/events browser chunks, because two client components imported a pure helper
// from a file that also imported the database and Stripe. No key value leaked (Next.js only
// inlines NEXT_PUBLIC_ variables), but one NEXT_PUBLIC_ slip or one helper that reads a key
// at import time would have. This walks the import graph from every 'use client' file and
// fails when it reaches server-only code.
// Run: npx tsx scripts/client-bundle-test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, normalize } from 'path';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail, null, 1)}`}`);
  if (!ok) failed++;
};

/** Packages that only run on the server, or hold a secret when they do. */
const SERVER_PACKAGES = ['@prisma/client', 'stripe', 'resend', 'twilio', 'bcryptjs', 'bcrypt', '@vercel/blob', '@anthropic-ai/sdk', 'next/headers', 'jose', 'crypto', 'node:crypto', 'fs', 'node:fs'];
/** Our own files that are server-only by definition. */
const SERVER_FILES = ['src/lib/prisma.ts', 'src/lib/stripe.ts', 'src/lib/session.ts', 'src/lib/admin-session.ts', 'src/lib/auth.ts'];
/** Environment variables the browser may see. Anything else read by a client-reached file is a finding. */
const PUBLIC_ENV = /^(NEXT_PUBLIC_[A-Z0-9_]+|NODE_ENV|NEXT_RUNTIME)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = new Map(walk('src').map(f => [normalize(f), readFileSync(f, 'utf8')]));
const isClient = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src);

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(from), spec);
  else return null;
  for (const c of [base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx'), base]) {
    const n = normalize(c);
    if (files.has(n)) return n;
  }
  return null;
}

/** The value (not type-only) module specifiers a file imports or re-exports. */
export function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  for (let m; (m = re.exec(src));) {
    if (m[4]) { out.push(m[4]); continue; }
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue; // import type … / export type …
    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named && named[1].split(',').map(s => s.trim()).filter(Boolean).every(s => /^type\s/.test(s))) continue;
    if (m[1] === 'export' && !/^\{|^\*/.test(clause)) continue;
    out.push(m[3]);
  }
  return out;
}

function problems(file: string): string[] {
  const src = files.get(file)!;
  const out: string[] = [];
  if (SERVER_FILES.includes(file)) out.push('server-only file');
  for (const spec of valueImports(src)) if (SERVER_PACKAGES.includes(spec)) out.push(`imports ${spec}`);
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!PUBLIC_ENV.test(m[1])) out.push(`reads process.env.${m[1]}`);
  return [...new Set(out)];
}

// The parser itself, so a regex change can't quietly make the walk see nothing.
check('a type-only import is not followed', valueImports(`import type { A } from './a';\nimport { type B } from './b';`).length === 0);
check('a value import and a re-export are followed', JSON.stringify(valueImports(`import { a, type B } from './a';\nexport { c } from './c';\nimport './d';`)) === JSON.stringify(['./a', './c', './d']));

const findings: { client: string; reaches: string; via: string[]; why: string[] }[] = [];
let clients = 0;
for (const [file, src] of files) {
  if (!isClient(src)) continue;
  clients++;
  const seen = new Set<string>();
  const stack: { f: string; path: string[] }[] = [{ f: file, path: [file] }];
  while (stack.length) {
    const { f, path } = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const body = files.get(f)!;
    // A 'use client' file further down is its own root: checked on its own turn.
    if (f !== file && isClient(body)) continue;
    if (f !== file) {
      const why = problems(f);
      if (why.length) { findings.push({ client: file, reaches: f, via: path, why }); continue; }
    }
    for (const spec of valueImports(body)) {
      const r = resolve(spec, f);
      if (r) stack.push({ f: r, path: [...path, r] });
    }
  }
}

check(`found the client components (${clients})`, clients > 50, clients);
check('no client component reaches prisma, Stripe, a server-only package or a secret env var',
  findings.length === 0, findings.slice(0, 10).map(x => ({ ...x, via: x.via.join(' -> ') })));

// The pure files split out by this fix stay pure.
for (const f of ['src/lib/ledger-labels.ts', 'src/lib/event-shared.ts', 'src/lib/blob-url.ts', 'src/lib/demand-pricing-shared.ts']) {
  check(`${f} exists and imports nothing server-side`, existsSync(f) && problems(normalize(f)).length === 0 && valueImports(readFileSync(f, 'utf8')).length === 0, f);
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll client-bundle checks passed');
