// Batch planner for /gr-batch — deterministic, zero tokens.
//
// Given a plan file mapping item ids to git pathspecs, expands each item to the
// tracked files it is allowed to touch, then refuses the plan if any two items
// overlap or if any item claims a RESERVED path (files only the main thread may
// edit, because every worker would otherwise collide on them).
//
// Usage:
//   node scripts/batch-plan.mjs .claude/batches/<name>.json          # print + validate
//   node scripts/batch-plan.mjs .claude/batches/<name>.json --write  # also write <name>.expanded.json
//
// Plan file shape:
//   { "U-A": ["src/app/admin", "src/components/admin"], "U-M": ["src/app/contact", ...] }
//
// Exit 0 = plan is safe to dispatch. Exit 1 = overlap or reserved hit (details printed).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Paths no worker may touch. Behavior, not facts: these are the files that every
// run edits, so two parallel runs editing them is a guaranteed merge conflict.
const RESERVED = [
  /^CLAUDE\.md$/,
  /^RUN_QUEUE\.md$/,
  /^REVISE_QUEUE\.md$/,
  /_SPEC\.md$/,
  /^STATUS\./,
  /^package(-lock)?\.json$/,
  /^prisma\//,
  /^src\/app\/api\//,
  /^src\/lib\//,
  /^src\/app\/globals\.css$/,
  /^src\/app\/layout\.tsx$/,
  /^src\/components\/ui\//,
  /^src\/components\/EmptyState\.tsx$/,
  /^\.claude\//,
  /^scripts\//,
];

const [planPath, flag] = process.argv.slice(2);
if (!planPath) {
  console.error('usage: node scripts/batch-plan.mjs <plan.json> [--write]');
  process.exit(2);
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

function lsFiles(specs) {
  const out = execFileSync('git', ['ls-files', '--', ...specs], { encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
}

const expanded = {};
const owner = new Map(); // file -> item
const overlaps = [];
const reservedHits = [];

for (const [item, specs] of Object.entries(plan)) {
  const files = lsFiles(specs);
  if (files.length === 0) console.warn(`WARN ${item}: pathspecs matched no tracked files: ${specs.join(' ')}`);
  expanded[item] = files;
  for (const f of files) {
    if (RESERVED.some((re) => re.test(f))) reservedHits.push(`${item} -> ${f}`);
    if (owner.has(f) && owner.get(f) !== item) overlaps.push(`${owner.get(f)} & ${item} -> ${f}`);
    owner.set(f, item);
  }
}

for (const [item, files] of Object.entries(expanded)) console.log(`${item}: ${files.length} files`);
if (overlaps.length) {
  console.log('\nOVERLAP (these items cannot run in the same batch):');
  overlaps.forEach((l) => console.log('  ' + l));
}
if (reservedHits.length) {
  console.log('\nRESERVED (main-thread-only paths claimed by a worker):');
  reservedHits.forEach((l) => console.log('  ' + l));
}

if (flag === '--write') {
  const out = planPath.replace(/\.json$/, '.expanded.json');
  fs.writeFileSync(out, JSON.stringify(expanded, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(process.cwd(), out)}`);
}

const ok = overlaps.length === 0 && reservedHits.length === 0;
console.log(ok ? '\nPLAN OK' : '\nPLAN REJECTED');
process.exit(ok ? 0 : 1);
