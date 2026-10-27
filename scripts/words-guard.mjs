#!/usr/bin/env node
// DENSE (DENSE_UI_SPEC.md P9, Cam 2026-10-27: "there is almost too much words on
// the pages"). Counts the prose each dashboard/admin file renders — JSX text and
// string literals that read as sentences, not classNames, keys or URLs — and holds
// every file to its baseline. A ratchet like design-guard.mjs: a file may go DOWN,
// never up. A file not in the baseline may carry up to NEW_FILE_CAP words, so a
// new component doesn't need a baseline edit; past that it must be cut or
// deliberately baselined.
//
//   node scripts/words-guard.mjs          check (CI: typecheck.yml)
//   node scripts/words-guard.mjs --update rewrite the baseline after a deliberate cut
//   node scripts/words-guard.mjs <file>   print one file's count and its prose
//
// Static on purpose: no server, no seed data, the same answer on every machine.
// The count is a proxy, not an exact rendered word count — it only has to move
// the right way when someone adds or removes a sentence.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src/app/dashboard', 'src/app/admin', 'src/components/dashboard', 'src/components/admin'];
const BASELINE = 'scripts/words-guard.baseline.json';
const NEW_FILE_CAP = 150;

import ts from 'typescript';

// A token that reads as a Tailwind/CSS class, a key or code rather than a word.
const CODEY = /[-:[\]/_.#=%(){}<>@]|^\d|^[a-z]+[A-Z]/;
const CLASS_WORDS = new Set('flex grid block hidden inline relative absolute fixed sticky static truncate uppercase lowercase capitalize italic underline transition group peer contents shrink grow border rounded shadow outline ring container table antialiased'.split(' '));
// Attributes and call arguments whose strings are never shown as prose.
const NOT_PROSE_ATTR = /^(q|ask|className|class|href|src|key|id|type|role|name|htmlFor|method|target|rel|style|value|defaultValue|inputMode|autoComplete|pattern|accept|status|tone|variant|size|as|data-[\w-]+)$/;

function words(s) {
  return s.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w));
}

function looksLikeProse(t) {
  t = t.trim();
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (/^(https?:|\/|#|mailto:|tel:|use )/.test(t)) return false;
  const toks = t.split(/\s+/);
  if (toks.length === 1) return /^[A-Z][a-z’']+[.!?]?$/.test(toks[0]); // a capitalised word: a label
  const codey = toks.filter(w => CODEY.test(w) || CLASS_WORDS.has(w)).length;
  return codey / toks.length < 0.4;
}

/** Prose in one file: JSX text, and string literals that read as words. */
export function prose(src, file = 'x.tsx') {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const skip = node => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
      if (ts.isJsxAttribute(p)) return NOT_PROSE_ATTR.test(p.name.getText(sf));
      if (ts.isCallExpression(p) && /^(fetch|dfetch|require|get|set|has|includes|startsWith|endsWith|split|replace|join|getItem|setItem|querySelector|addEventListener|useSearchParams|URLSearchParams|toLocaleDateString|toLocaleString|localeCompare)$/.test(p.expression.getText(sf).split('.').pop())) return true;
      if (ts.isElementAccessExpression(p) || ts.isPropertyAssignment(p) && p.name === node) return true;
      // An assistant question (Ask q=… / ask: …) is sent to the assistant, never shown.
      if (ts.isPropertyAssignment(p) && NOT_PROSE_ATTR.test(p.name.getText(sf))) return true;
      if (ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText(sf))) return true;
      if (ts.isCaseClause(p) || ts.isTypeNode(p)) return true;
      if (ts.isJsxExpression(p) || ts.isReturnStatement(p) || ts.isVariableDeclaration(p) || ts.isArrayLiteralExpression(p) || ts.isConditionalExpression(p) || ts.isPropertyAssignment(p)) return false;
    }
    return false;
  };
  const visit = node => {
    if (ts.isJsxText(node)) {
      const t = node.getText(sf).replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]{2,}/.test(t)) out.push(t);
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !skip(node)) {
      if (looksLikeProse(node.text)) out.push(node.text.trim());
    } else if (ts.isTemplateExpression(node) && !skip(node)) {
      const t = [node.head.text, ...node.templateSpans.map(s => s.literal.text)].join(' ').replace(/\s+/g, ' ');
      if (looksLikeProse(t)) out.push(t.trim());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const count = (src, file) => prose(src, file).reduce((n, t) => n + words(t).length, 0);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx$/.test(name)) yield p;
  }
}

const one = process.argv.slice(2).find(a => !a.startsWith('--'));
if (one) {
  const src = readFileSync(one, 'utf8');
  for (const t of prose(src, one)) console.log(`${String(words(t).length).padStart(3)}  ${t}`);
  console.log(`words-guard: ${one}: ${count(src, one)} words`);
  process.exit(0);
}

const counts = {};
for (const root of ROOTS) for (const file of walk(root)) counts[relative('.', file)] = count(readFileSync(file, 'utf8'), file);

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.keys(counts).sort().map(k => [k, counts[k]]));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
  const total = Object.values(sorted).reduce((a, b) => a + b, 0);
  console.log(`words-guard: baseline written (${Object.keys(sorted).length} files, ${total} words)`);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const errors = [];
for (const [file, n] of Object.entries(counts)) {
  if (file in base) {
    if (n > base[file]) errors.push(`${file}: ${n} words, baseline ${base[file]} (+${n - base[file]})`);
  } else if (n > NEW_FILE_CAP) {
    errors.push(`${file}: new file with ${n} words (cap ${NEW_FILE_CAP} without a baseline entry)`);
  }
}
if (errors.length) {
  console.error('words-guard: pages grew more prose (DENSE_UI_SPEC P1/P2 — a number is label · value · change; definitions go behind the label in lib/analytics-terms.ts or similar)\n  ' + errors.join('\n  ') +
    '\n  See what a file renders: node scripts/words-guard.mjs <file>');
  process.exit(1);
}
const below = Object.entries(base).filter(([f, b]) => (counts[f] ?? 0) < b);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`words-guard: ok — ${total} words across ${Object.keys(counts).length} files${below.length ? ` (${below.length} file(s) below baseline — run with --update to lock that in)` : ''}`);
