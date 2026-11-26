// Audit 2026-11-24 L8: scripts/admin-areas-test.ts only checked that `areaGate(` appears in a route's
// source, so a route that called it and ignored the answer (or gated the wrong area) passed. This reads
// every call in src/app/api and src/lib and requires: the area is a real one, the result is checked on
// the next statement, and that check returns the refusal. Pure. Run: npx tsx scripts/admin-area-gate-use-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let failed = 0;
const check = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });

const areasSrc = readFileSync('src/lib/admin-areas.ts', 'utf8');
const AREAS = (areasSrc.match(/export type AdminArea = ([^;]+);/)?.[1] ?? '').match(/'([a-z_]+)'/g)?.map(s => s.slice(1, -1)) ?? [];
check('the area list is read from lib/admin-areas.ts', AREAS.length >= 5, AREAS);

const bad: string[] = [];
let calls = 0;
for (const f of [...walk('src/app/api'), ...walk('src/lib')]) {
  const src = readFileSync(f, 'utf8');
  // Every call (comments and the definition aside).
  const re = /(const (\w+) = )?areaGate\(session, '([a-z_]+)'\);?([^\n]*)\n?([^\n]*)/g;
  for (const m of src.matchAll(re)) {
    const line = src.slice(src.lastIndexOf('\n', m.index!) + 1, m.index!);
    if (line.trim().startsWith('//') || line.includes('export function areaGate')) continue;
    calls++;
    const [, , name, area, rest, next] = m;
    const where = `${f}: areaGate(session, '${area}')`;
    if (!AREAS.includes(area)) { bad.push(`${where} — not a real area`); continue; }
    if (!name) { bad.push(`${where} — result not kept`); continue; }
    const after = `${rest} ${next}`;
    const used = new RegExp(`if \\(${name}\\) return (${name}|\\{ res: ${name} \\}|\\{ error: ${name} \\});`).test(after);
    if (!used) bad.push(`${where} — result not returned on the next statement`);
  }
}
check(`every areaGate call names a real area and returns its refusal (${calls} calls)`, bad.length === 0 && calls > 50, bad);

// Self-check: the reader catches the mistakes it is for.
const sample = (code: string) => /const (\w+) = areaGate\(session, '([a-z_]+)'\);\s*\n?\s*if \(\1\) return \1;/.test(code);
check('self-check: a gate whose answer is ignored is caught', !sample("const noArea = areaGate(session, 'money');\n  doWork();"));
check('self-check: the normal form passes', sample("const noArea = areaGate(session, 'money');\n  if (noArea) return noArea;"));

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
