// Audit 2026-11-24 L8: scripts/admin-areas-test.ts only checked that `areaGate(` appears in a route's
// source, so a route that called it and ignored the answer (or gated the wrong area) passed. This reads
// every call in src/app/api and src/lib and requires each one to be in the one shape that refuses:
//   const <name> = areaGate(session, '<real area>'); then on the next statement  if (<name>) return <name>;
// (or return { res: <name> } / { error: <name> } from a gate helper). Every `areaGate(` in a file must
// match that shape, so any other spelling (another variable, a split line, double quotes, an area in a
// variable, a bare call) fails rather than slipping past. Pure. Run: npx tsx scripts/admin-area-gate-use-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let failed = 0;
const check = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });

const areasSrc = readFileSync('src/lib/admin-areas.ts', 'utf8');
const AREAS = (areasSrc.match(/export type AdminArea = ([^;]+);/)?.[1] ?? '').match(/'([a-z_]+)'/g)?.map(s => s.slice(1, -1)) ?? [];
check('the area list is read from lib/admin-areas.ts', AREAS.length >= 5, AREAS);

/** Every areaGate call in `src`, and the ones that are not in the refusing shape. */
function readGates(src: string): { calls: number; bad: string[] } {
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^\s*import\b/.test(l) && !/export function areaGate\(/.test(l)).join('\n');
  const calls = (code.match(/\bareaGate\s*\(/g) ?? []).length;
  const bad: string[] = [];
  let good = 0;
  const re = /const (\w+) = areaGate\(session, '([a-z_]+)'\);[ \t]*(?:\n[ \t]*)?if \(\1\) return (?:\1|\{ res: \1 \}|\{ error: \1 \});/g;
  for (const m of code.matchAll(re)) {
    if (!AREAS.includes(m[2])) bad.push(`areaGate(session, '${m[2]}') — not a real area`);
    else good++;
  }
  if (good + bad.length !== calls) bad.push(`${calls - good - bad.length} call(s) not in the refusing shape`);
  return { calls, bad };
}

const problems: string[] = [];
let total = 0;
for (const f of [...walk('src/app/api'), ...walk('src/lib')]) {
  const r = readGates(readFileSync(f, 'utf8'));
  total += r.calls;
  for (const b of r.bad) problems.push(`${f}: ${b}`);
}
check(`every areaGate call names a real area and returns its refusal (${total} calls)`, problems.length === 0 && total > 50, problems);

// Self-checks on the SAME reader: the mistakes it is for are caught, the normal forms pass.
const good = "  const noArea = areaGate(session, 'money');\n  if (noArea) return noArea;\n";
check('self-check: the normal form passes', readGates(good).bad.length === 0 && readGates(good).calls === 1);
check('self-check: on one line, and a gate helper\'s { res } form, pass', readGates("const noArea = areaGate(session, 'money'); if (noArea) return noArea;\nconst g = areaGate(session, 'company');\n  if (g) return { res: g };").bad.length === 0);
for (const [label, code] of [
  ['the answer ignored', "const noArea = areaGate(session, 'money');\n  doWork();"],
  ['a bare call', "areaGate(session, 'money');"],
  ['another variable', "const admin = session; areaGate(admin, 'courses');"],
  ['a non-null assertion', "areaGate(session!, 'courses');"],
  ['split over two lines', "const noArea = areaGate(\n  session, 'courses');\n  if (noArea) return noArea;"],
  ['double quotes', "const noArea = areaGate(session, \"courses\");\n  if (noArea) return noArea;"],
  ['an area in a variable', "const noArea = areaGate(session, area);\n  if (noArea) return noArea;"],
  ['an unknown area', "const noArea = areaGate(session, 'nowhere');\n  if (noArea) return noArea;"],
  ['checked but not returned', "const noArea = areaGate(session, 'money');\n  if (noArea) console.warn('x');"],
] as const) check(`self-check: ${label} is caught`, readGates(code).bad.length > 0, readGates(code));

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
