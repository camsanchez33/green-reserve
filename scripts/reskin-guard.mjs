// Reskin guard — the deterministic "zero behavior" gate from UI_REVISE_SPEC §6.
//
// Checks a commit range and fails if the diff:
//   1. touches any file outside the allowed list (the smuggling check), or
//   2. ADDS a line matching a behavior signature: fetch(, prisma, useState(,
//      useEffect(, router.push(, redirect(, new route/API file, schema file.
//
// Both the worker (self-check before it reports) and /gr-batch (gate before merge)
// run this. If it fails, the branch is not merged — the item is split per §4.
//
// Usage:
//   node scripts/reskin-guard.mjs <base>..<head> <allowed-files.json> [item]
//   e.g. node scripts/reskin-guard.mjs main...batch/U-A .claude/batches/x.expanded.json U-A
//
// allowed-files.json is either a flat array of paths, or the object written by
// batch-plan.mjs --write (then pass the item id to pick its list).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [range, allowedPath, item] = process.argv.slice(2);
if (!range || !allowedPath) {
  console.error('usage: node scripts/reskin-guard.mjs <base>...<head> <allowed.json> [item]');
  process.exit(2);
}
let allowed = JSON.parse(fs.readFileSync(allowedPath, 'utf8'));
if (!Array.isArray(allowed)) {
  if (!item || !allowed[item]) {
    console.error(`allowed.json is keyed by item; pass one of: ${Object.keys(allowed).join(', ')}`);
    process.exit(2);
  }
  allowed = allowed[item];
}
const allowedSet = new Set(allowed);

const BEHAVIOR = [
  [/\bfetch\s*\(/, 'fetch('],
  [/\bprisma\b/, 'prisma'],
  [/\buseState\s*\(/, 'useState('],
  [/\buseEffect\s*\(/, 'useEffect('],
  [/\brouter\.(push|replace)\s*\(/, 'router.push/replace('],
  [/\bredirect\s*\(/, 'redirect('],
  [/\bonSubmit\s*=/, 'onSubmit= (new form handler)'],
];

const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

const changed = git(['diff', '--name-only', range]).split(/\r?\n/).filter(Boolean);
const outside = changed.filter((f) => !allowedSet.has(f));
const structural = changed.filter((f) => /^src\/app\/api\/|^prisma\/|^src\/lib\//.test(f));

// Added lines only (-U0 so context lines never count), per file.
const diff = git(['diff', '-U0', range]);
const hits = [];
let file = null;
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const added = line.slice(1);
  for (const [re, label] of BEHAVIOR) if (re.test(added)) hits.push(`${file}: +${label}: ${added.trim().slice(0, 100)}`);
}

console.log(`range ${range}: ${changed.length} files changed`);
if (outside.length) { console.log('\nOUTSIDE ALLOWED LIST:'); outside.forEach((f) => console.log('  ' + f)); }
if (structural.length) { console.log('\nSTRUCTURAL (api/prisma/lib) FILES TOUCHED:'); structural.forEach((f) => console.log('  ' + f)); }
if (hits.length) { console.log('\nBEHAVIOR SIGNATURES ADDED:'); hits.forEach((h) => console.log('  ' + h)); }

const ok = outside.length === 0 && structural.length === 0 && hits.length === 0;
console.log(ok ? '\nRESKIN GUARD OK' : '\nRESKIN GUARD FAILED — do not merge; split the behavior into a §4 item');
process.exit(ok ? 0 : 1);
