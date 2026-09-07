// SWC-parity parse check (see CLAUDE.md "build validation"): type errors do not
// fail the Vercel build, parse errors do. Usage:
//   node scripts/parse-check.js <dir-or-file> [...more]
// Recurses directories, checks every .ts/.tsx, exits 1 on the first set of failures.
const { parse } = require('@babel/parser');
const fs = require('fs');
const path = require('path');

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f), out); }
  else if (/\.(tsx?|jsx?)$/.test(p) && !p.endsWith('.d.ts')) out.push(p);
  return out;
}

const targets = process.argv.slice(2);
if (targets.length === 0) { console.error('usage: node scripts/parse-check.js <path> [...]'); process.exit(2); }
const files = targets.flatMap(t => walk(t, []));
let bad = 0;
for (const f of files) {
  try {
    parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch (e) {
    bad++;
    console.log('PARSE FAIL', f, 'line:' + (e.loc && e.loc.line), e.message);
  }
}
console.log(bad ? `${bad} FAILED of ${files.length}` : `ALL ${files.length} PARSE OK`);
process.exit(bad ? 1 : 0);
