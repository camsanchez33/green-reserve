// Security audit 2026-11-24 (M12): nothing secret or server-only reaches the browser bundle.
// A build of main put lib/stripe.ts and lib/prisma.ts into the /dashboard/money and
// /dashboard/events browser chunks, because two client components imported a pure helper
// from a file that also imported the database and Stripe. No key value leaked (Next.js only
// inlines NEXT_PUBLIC_ variables), but one NEXT_PUBLIC_ slip or one helper that reads a key
// at import time would have. This walks the import graph of every 'use client' file, parsed
// with the TypeScript compiler (not a regex), and fails when it reaches server-only code.
// Run: npx tsx scripts/client-bundle-test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, normalize } from 'path';
import ts from 'typescript';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail, null, 1)}`}`);
  if (!ok) failed++;
};

/** Packages that only run on the server, or hold a secret when they do. A subpath counts too. */
const SERVER_PACKAGES = ['@prisma/client', 'stripe', 'resend', 'twilio', 'bcryptjs', 'bcrypt', '@vercel/blob', '@anthropic-ai/sdk', 'next/headers', 'next/server', 'next/cache', 'server-only', 'otplib', '@simplewebauthn/server', 'jose', 'crypto', 'fs', 'path', 'child_process', 'os', 'net', 'tls', 'http', 'https', 'zlib'];
/** Subpaths of those that are made for the browser. */
const BROWSER_OK = ['@vercel/blob/client'];
/** Our own files that are server-only by definition. */
const SERVER_FILES = ['src/lib/prisma.ts', 'src/lib/stripe.ts', 'src/lib/session.ts', 'src/lib/admin-session.ts', 'src/lib/auth.ts'].map(normalize);
/** Environment variables the browser may see. Anything else read by a client-reached file is a finding. */
const PUBLIC_ENV = /^(NEXT_PUBLIC_[A-Z0-9_]+|NODE_ENV|NEXT_RUNTIME)$/;

export function isServerPackage(spec: string): boolean {
  const s = spec.replace(/^node:/, '');
  if (BROWSER_OK.some(b => s === b || s.startsWith(b + '/'))) return false;
  return spec.startsWith('node:') || SERVER_PACKAGES.some(p => s === p || s.startsWith(p + '/'));
}

type Parsed = { client: boolean; imports: string[]; env: string[] };

/** What a file imports at runtime (type-only imports and re-exports skipped), and which env vars it reads. */
export function parse(src: string, name = 'x.tsx'): Parsed {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: string[] = [];
  const env: string[] = [];
  let client = false;
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) { if (st.expression.text === 'use client') client = true; continue; }
    break; // directives come first
  }
  const isProcessEnv = (e: ts.Expression) => ts.isPropertyAccessExpression(e) && e.name.text === 'env' && ts.isIdentifier(e.expression) && e.expression.text === 'process';
  const visit = (n: ts.Node) => {
    // process.env used as a whole (env = process.env, passed on, cast): what it reads can't be
    // named, so it counts as reading a secret. Only the named forms below may be public.
    if (isProcessEnv(n as ts.Expression)) {
      const p = n.parent;
      const named = (ts.isPropertyAccessExpression(p) && p.expression === n) || (ts.isElementAccessExpression(p) && p.expression === n)
        || (ts.isVariableDeclaration(p) && p.initializer === n && ts.isObjectBindingPattern(p.name));
      if (!named) env.push('<whole object>');
    }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      const typeOnly = !!c && (c.isTypeOnly || (!c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every(e => e.isTypeOnly)));
      if (!typeOnly) imports.push(n.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const typeOnly = n.isTypeOnly || (!!n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every(e => e.isTypeOnly));
      if (!typeOnly) imports.push(n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteralLike(n.arguments[0])
      && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
      imports.push(n.arguments[0].text); // import('…') and require('…')
    } else if (ts.isPropertyAccessExpression(n) && isProcessEnv(n.expression)) {
      env.push(n.name.text);
    } else if (ts.isElementAccessExpression(n) && isProcessEnv(n.expression)) {
      env.push(ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : '<computed key>');
    } else if (ts.isVariableDeclaration(n) && n.initializer && isProcessEnv(n.initializer) && ts.isObjectBindingPattern(n.name)) {
      for (const el of n.name.elements) env.push(el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : '<destructured>');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { client, imports, env };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const parsed = new Map(walk('src').map(f => [normalize(f), parse(readFileSync(f, 'utf8'), f)]));

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(from), spec);
  else return null;
  for (const c of [base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx'), base]) {
    const n = normalize(c);
    if (parsed.has(n)) return n;
  }
  return null;
}

function problems(file: string, p: Parsed): string[] {
  const out: string[] = [];
  if (SERVER_FILES.includes(file)) out.push('server-only file');
  for (const spec of p.imports) if (isServerPackage(spec)) out.push(`imports ${spec}`);
  for (const v of p.env) if (!PUBLIC_ENV.test(v)) out.push(`reads process.env.${v}`);
  return [...new Set(out)];
}

// The parser itself, on every shape a regex got wrong, so a change can't quietly make the walk see nothing.
const shapes = parse([
  `'use client';`,
  `import type { A } from './type-only';`,
  `import { type B } from './all-type-named';`,
  `export const before = 1;`,
  `import { a, type C } from './mixed';`,
  `import './side-effect';`,
  `import d from './default';`,
  `export { e } from './re-export';`,
  `export * from './star';`,
  `export type { F } from './type-re-export';`,
  `const m = await import('./dynamic');`,
  `const r = require('./required');`,
  `const k = process.env.SECRET_A + process.env['SECRET_B'];`,
  `const { SECRET_C, NEXT_PUBLIC_OK } = process.env;`,
  `// process.env.IN_A_COMMENT`,
].join('\n'));
const whole = parse([`function f(env = process.env) { return env.SECRET_D; }`, `const e = (process.env as any).SECRET_E;`].join('\n'));
check('parser: sees the directive', shapes.client);
check('parser: follows every runtime import shape and skips type-only ones',
  JSON.stringify([...shapes.imports].sort()) === JSON.stringify(['./default', './dynamic', './mixed', './re-export', './required', './side-effect', './star']), shapes.imports);
check('parser: reads env by dot, bracket and destructuring, not in comments',
  JSON.stringify([...shapes.env].sort()) === JSON.stringify(['NEXT_PUBLIC_OK', 'SECRET_A', 'SECRET_B', 'SECRET_C']), shapes.env);
check('parser: process.env used whole (a default parameter, a cast) counts as a secret read', whole.env.filter(v => v === '<whole object>').length === 2, whole.env);
check('parser: package subpaths count, the browser blob client does not',
  isServerPackage('@prisma/client/runtime/library') && isServerPackage('fs/promises') && isServerPackage('node:path') && !isServerPackage('@vercel/blob/client') && !isServerPackage('react'));

const unresolved: string[] = [];
const findings: { client: string; reaches: string; via: string; why: string[] }[] = [];
let clients = 0;
for (const [file, p] of parsed) {
  if (!p.client) continue;
  clients++;
  const seen = new Set<string>();
  const stack: { f: string; path: string[] }[] = [{ f: file, path: [file] }];
  while (stack.length) {
    const { f, path } = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const q = parsed.get(f)!;
    // A 'use client' file further down is its own root: checked on its own turn.
    if (f !== file && q.client) continue;
    const why = problems(f, q); // the root itself too
    if (why.length) { findings.push({ client: file, reaches: f, via: path.join(' -> '), why }); continue; }
    for (const spec of q.imports) {
      const r = resolve(spec, f);
      if (r) stack.push({ f: r, path: [...path, r] });
      // A local import the walk can't follow would hide whatever is behind it (styles and assets excepted).
      else if ((spec.startsWith('.') || spec.startsWith('@/')) && !/\.(css|scss|svg|png|jpe?g|webp|gif|ico|json|md)$/i.test(spec)) unresolved.push(`${f}: ${spec}`);
    }
  }
}

check(`found the client components (${clients})`, clients > 50, clients);
check('every local import in the client graph resolves to a file the walk can read', unresolved.length === 0, [...new Set(unresolved)].slice(0, 10));
check('no client component reaches prisma, Stripe, a server-only package or a secret env var', findings.length === 0, findings.slice(0, 10));

// The pure files split out by this fix stay pure: no imports at all.
for (const f of ['src/lib/ledger-labels.ts', 'src/lib/event-shared.ts', 'src/lib/blob-url.ts', 'src/lib/demand-pricing-shared.ts']) {
  const p = existsSync(f) ? parsed.get(normalize(f)) : undefined;
  check(`${f} exists and imports nothing`, !!p && p.imports.length === 0 && p.env.length === 0, p);
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll client-bundle checks passed');
