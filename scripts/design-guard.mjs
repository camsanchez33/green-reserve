#!/usr/bin/env node
// MP-9 (ADMIN_V4 V4-6 §2) — stops the staff surfaces re-growing hand-typed
// copies of the shared card, eyebrow and input classes. Without this the
// design system regresses within two phases (it did, twice: A0 and A6 were
// both "audit every page" fixes that drifted straight back).
//
// A ratchet, not a ban: scripts/design-guard.baseline.json records how many
// raw copies each file still has (variants the codemod rightly left alone,
// e.g. a 10px warn-coloured eyebrow). A file may go DOWN, never up, and a new
// file starts at zero. Run with --update after deliberately removing copies.
//
//   node scripts/design-guard.mjs          check (CI: typecheck.yml)
//   node scripts/design-guard.mjs --update rewrite the baseline
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src/app/admin', 'src/components/admin', 'src/app/dashboard', 'src/components/dashboard'];
const RULES = [
  { key: 'card', re: /bg-white rounded-lg shadow-card/g, use: "<Card> from '@/components/ui/Card' (padding/layout in className)" },
  { key: 'eyebrow', re: /text-\[11px\] uppercase tracking-\[0\.1em\] text-ink-muted/g, use: "<Eyebrow> from '@/components/ui/Eyebrow' (as=\"span\" etc. keeps the element)" },
  { key: 'input', re: /bg-paper border border-line rounded-md px-3/g, use: "INPUT / INPUT_COMPACT from '@/components/ui/field'" },
];
const BASELINE = 'scripts/design-guard.baseline.json';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield p;
  }
}

const counts = {};
for (const root of ROOTS) for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8');
  for (const r of RULES) {
    const n = (src.match(r.re) || []).length;
    if (n) (counts[relative('.', file)] ??= {})[r.key] = n;
  }
}

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.keys(counts).sort().map(k => [k, counts[k]]));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`design-guard: baseline written (${Object.keys(sorted).length} files with raw copies)`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const errors = [];
for (const [file, byRule] of Object.entries(counts)) {
  for (const r of RULES) {
    const now = byRule[r.key] ?? 0, was = base[file]?.[r.key] ?? 0;
    if (now > was) errors.push(`${file}: ${now - was} new raw ${r.key} class string${now - was > 1 ? 's' : ''} — use ${r.use}`);
  }
}
if (errors.length) {
  console.error('design-guard: hand-typed design-system classes added\n  ' + errors.join('\n  '));
  process.exit(1);
}
const stale = Object.entries(base).filter(([f, b]) => RULES.some(r => (counts[f]?.[r.key] ?? 0) < (b[r.key] ?? 0)));
console.log(`design-guard: ok${stale.length ? ` (${stale.length} file(s) now below baseline — run with --update to lock that in)` : ''}`);
