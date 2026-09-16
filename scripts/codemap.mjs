#!/usr/bin/env node
// GreenReserve code map generator (CODEMAP_SPEC Phase CM-1).
// Reads every .ts/.tsx under src/ plus prisma/schema.prisma and emits
// docs/CODEMAP.md (readable) and docs/codemap.json (machine).
// Run: node scripts/codemap.mjs
//
// GENERATED OUTPUT — never hand-edit docs/CODEMAP.md. Edit the source, or this
// script. Same rule as STATUS.md, for the same reason: a map that can lie is
// worse than no map, because it gets trusted.
//
// No network, no database. Nothing here reads anything but the working tree.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, dirname, basename, sep } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// The same parser scripts/parse-check.js uses. The spec is explicit that regex
// will drift on this codebase's syntax, and it is right — satisfies-expressions,
// decorators in JSX and `export * from` all defeat the obvious patterns.
const { parse } = require('@babel/parser')

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const OUT_MD = join(ROOT, 'docs', 'CODEMAP.md')
const OUT_JSON = join(ROOT, 'docs', 'codemap.json')

// ---------------------------------------------------------------- file walk

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p) && !p.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const rel = (p) => relative(ROOT, p).split(sep).join('/')

// ---------------------------------------------------------------- header comment

// The top-of-file comment block: everything from the first line until the first
// line that is not blank, not a comment, and not a directive ('use client').
// Deliberately textual rather than AST-based — babel attaches leading comments to
// whichever node follows, which on a file starting with imports is the import,
// and on a file starting with a directive is nothing at all.
function headerComment(src) {
  const lines = src.split('\n')
  const out = []
  let inBlock = false
  for (const line of lines) {
    const t = line.trim()
    if (inBlock) {
      out.push(t.replace(/^\*+\s?/, '').replace(/\*\/\s*$/, ''))
      if (t.includes('*/')) inBlock = false
      continue
    }
    if (t === '') { if (out.length) break; continue }
    if (/^['"]use (client|server)['"];?$/.test(t)) continue
    if (t.startsWith('//')) { out.push(t.replace(/^\/\/\s?/, '')); continue }
    if (t.startsWith('/*')) {
      inBlock = !t.includes('*/')
      out.push(t.replace(/^\/\*+\s?/, '').replace(/\*\/\s*$/, ''))
      continue
    }
    break
  }
  return out.join('\n').trim()
}

// First sentence of the header comment, for the `purpose` column. Never a
// paraphrase — the spec is explicit that a generated summary is a thing that can
// be wrong while a copied comment is not.
function purposeOf(header) {
  if (!header) return ''
  const body = header
    .split('\n')
    .filter(l => !l.trim().startsWith('@brain'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!body) return ''
  const m = body.match(/^(.{0,200}?[.:])(\s|$)/)
  const s = (m ? m[1] : body).trim()
  return s.length > 200 ? s.slice(0, 197).trimEnd() + '...' : s
}

const brainTags = (header) =>
  [...header.matchAll(/@brain\s+([A-Za-z0-9][A-Za-z0-9-]*)/g)].map(m => m[1])

// ---------------------------------------------------------------- routes

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// src/app/api/admin/course-detail/route.ts -> /api/admin/course-detail
// src/app/(marketing)/courses/[slug]/page.tsx -> /courses/[slug]
// Route groups "(name)" are Next.js organisation only and never appear in a URL.
function routeUrlFor(relPath) {
  const m = relPath.match(/^src\/app\/(.*)\/(page|route)\.tsx?$/)
  if (!m) {
    if (/^src\/app\/(page|route)\.tsx?$/.test(relPath)) return '/'
    return null
  }
  const segs = m[1].split('/').filter(s => s && !/^\(.*\)$/.test(s))
  return '/' + segs.join('/')
}

// Two separate questions, because conflating them is how this map would lie.
//
//   auth  — who the route is FOR. From the session helper the file imports when
//           there is one, otherwise from the URL prefix.
//   guard — WHERE that is enforced: in the file, in an ancestor layout, in
//           middleware, client-side, or nowhere this script can see.
//
// The first draft of this script answered only the first question, from imports
// alone, and reported `/dashboard/money` as `public` — because that page is a
// client component and its guard lives in middleware. A map that calls the money
// page public is worse than no map. `guard: none` on an `/api/admin/*` row is a
// real finding: four ungated admin endpoints once survived three admin-auth
// passes in this codebase.
const SESSION_HELPERS = [
  [/\bresolveAdminSession\b|\brequireRole\b|\brequireOwner\b|\bAdminSession\b/, 'admin'],
  [/\bcronAuthFailure\b/, 'cron'],
  [/\bresolveDashboardSession\b|\bgetOperatorSession\b/, 'operator'],
  [/\bgetMemberSession\b/, 'member'],
  [/\bgetGolferSession\b/, 'golfer'],
]

// Longest prefix wins, so /api/admin beats /api.
const PREFIX_LEVEL = [
  ['/api/admin', 'admin'],
  ['/api/operator', 'operator'],
  ['/api/birdie', 'operator'],
  ['/api/cron', 'cron'],
  ['/api/golfer', 'golfer'],
  ['/api/member', 'member'],
  ['/admin', 'admin'],
  ['/dashboard', 'operator'],
  ['/account', 'golfer'],
  // /book is deliberately absent: booking needs no account. A golfer arrives
  // cold, picks a time and saves a card, and the booking's own token is what
  // guards everything afterwards.
  ['/checkin', 'golfer'],
  ['/manage', 'golfer'],
  ['/receipt', 'golfer'],
].sort((a, b) => b[0].length - a[0].length)

const helperLevel = (src) => {
  for (const [re, level] of SESSION_HELPERS) if (re.test(src)) return level
  return null
}
const prefixLevel = (url) => (PREFIX_LEVEL.find(([p]) => url === p || url.startsWith(p + '/')) || [])[1] || 'public'

// src/middleware.ts's `matcher` is the authoritative list of what middleware
// actually runs on — Next.js ignores any check written outside it.
function middlewarePrefixes() {
  const p = join(SRC, 'middleware.ts')
  if (!existsSync(p)) return []
  const src = readFileSync(p, 'utf8')
  const m = src.match(/matcher\s*:\s*\[([^\]]*)\]/)
  if (!m) return []
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map(x => x[1].replace(/\/:.*$/, '').replace(/\/\*+$/, ''))
    .filter(Boolean)
}
const MW_PREFIXES = middlewarePrefixes()

// Ancestor layout.tsx files, nearest first — a guard in src/app/admin/layout.tsx
// covers every page beneath it.
function ancestorLayouts(relPath) {
  const parts = relPath.split('/')
  const out = []
  for (let i = parts.length - 1; i > 1; i--) {
    const cand = parts.slice(0, i).join('/') + '/layout.tsx'
    if (cand !== relPath && existsSync(join(ROOT, cand))) out.push(cand)
  }
  return out
}

function guardFor(relPath, url, src) {
  const inFile = helperLevel(src)
  if (inFile) return { auth: inFile, guard: 'file' }
  for (const lay of ancestorLayouts(relPath)) {
    const l = helperLevel(readFileSync(join(ROOT, lay), 'utf8'))
    if (l) return { auth: l, guard: `layout (${lay})` }
  }
  const level = prefixLevel(url)
  if (MW_PREFIXES.some(p => url === p || url.startsWith(p + '/'))) return { auth: level, guard: 'middleware' }
  if (/\/api\/(admin|operator|golfer)\/session\b/.test(src)) return { auth: level, guard: 'client-side' }
  // Two whole classes are unauthenticated ON PURPOSE, and lumping them in with
  // NONE FOUND is how a warning stops being read. The first draft flagged 19
  // routes; 15 of them were login endpoints and token-gated golfer pages, which
  // is a warning nobody would look at twice.
  //
  // `entry` — you cannot require a session to create one. Logout too: it must
  //   work when the session is already dead, or a broken cookie is unclearable.
  if (/process\.env\.[A-Z0-9_]*(SECRET|KEY|TOKEN)\b/.test(src) && /headers\.get\(|headers\[/.test(src)) {
    return { auth: level, guard: 'secret header' }
  }
  if (AUTH_ENTRY.test(url)) return { auth: level, guard: 'entry' }
  // `token` — the golfer flow is deliberately session-free. The booking link in
  //   a confirmation email carries its own capability token; that IS the guard.
  if (/\btoken\b/.test(src) && /searchParams|params|checkInToken|detailsToken|callInviteToken|req\.url/.test(src)) {
    return { auth: level, guard: 'token' }
  }
  return { auth: level, guard: level === 'public' ? 'public' : 'NONE FOUND' }
}

// Deliberately a URL test, not a file test: a route named `login` that DOES
// check a session is still an entry point by intent, and one that quietly stops
// checking should not be excused by its name — hence `file` wins above.
const AUTH_ENTRY = /(^|\/)[a-z0-9-]*(login|logout|forgot-password|set-password|send-code|accept-invite|otp|auth)(\/|$)/

// ---------------------------------------------------------------- parse one file

function exportKind(node, name) {
  if (node.type === 'FunctionDeclaration') return /^[A-Z]/.test(name) ? 'component' : 'fn'
  if (node.type === 'ClassDeclaration') return 'class'
  if (node.type === 'TSTypeAliasDeclaration' || node.type === 'TSInterfaceDeclaration' || node.type === 'TSEnumDeclaration') return 'type'
  return null
}

function analyse(absPath) {
  const relPath = rel(absPath)
  const src = readFileSync(absPath, 'utf8')
  const header = headerComment(src)

  let ast = null
  let parseError = null
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  } catch (e) {
    parseError = `${e.message} (line ${e.loc && e.loc.line})`
  }

  const exports = []
  const imports = []
  const methods = []

  if (ast) {
    for (const node of ast.program.body) {
      if (node.type === 'ImportDeclaration') {
        if (!node.importKind || node.importKind === 'value') imports.push(node.source.value)
        else imports.push(node.source.value) // type-only imports still couple two files
        continue
      }
      if (node.type === 'ExportAllDeclaration') { imports.push(node.source.value); continue }
      if (node.type === 'ExportNamedDeclaration') {
        if (node.source) imports.push(node.source.value)
        if (node.declaration) {
          const d = node.declaration
          if (d.type === 'VariableDeclaration') {
            for (const decl of d.declarations) {
              if (decl.id.type !== 'Identifier') continue
              const name = decl.id.name
              const init = decl.init
              const isFn = init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
              const kind = isFn && /^[A-Z]/.test(name) ? 'component' : (isFn ? 'fn' : 'const')
              exports.push({ name, kind })
            }
          } else if (d.id && d.id.name) {
            exports.push({ name: d.id.name, kind: exportKind(d, d.id.name) || 'const' })
          }
        }
        for (const s of node.specifiers || []) {
          const name = s.exported.name || s.exported.value
          if (name) exports.push({ name, kind: 'reexport' })
        }
        continue
      }
      if (node.type === 'ExportDefaultDeclaration') {
        const d = node.declaration
        const named = d && d.id && d.id.name
        exports.push({ name: named ? `default (${named})` : 'default', kind: 'component' })
      }
    }
  }

  const url = routeUrlFor(relPath)
  const isApi = url !== null && /\/route\.tsx?$/.test(relPath)
  if (isApi) for (const e of exports) if (HTTP_METHODS.includes(e.name)) { e.kind = 'route'; methods.push(e.name) }

  return {
    path: relPath,
    lines: src.split('\n').length,
    purpose: purposeOf(header),
    brain: brainTags(header),
    exports: exports.sort((a, b) => a.name.localeCompare(b.name)),
    imports: [...new Set(imports)].sort(),
    route: url,
    kind: url === null ? null : (isApi ? 'api' : 'page'),
    methods: methods.sort(),
    ...(url === null ? { auth: null, guard: null } : guardFor(relPath, url, src)),
    parseError,
  }
}

// ---------------------------------------------------------------- import resolution

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx', '']

function resolveImport(spec, fromRel, byPath) {
  let base = null
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
  else if (spec.startsWith('.')) {
    const joined = join(dirname(fromRel), spec).split(sep).join('/')
    base = joined
  } else return null // node_modules — not our graph
  for (const ext of CANDIDATES) {
    const c = base + ext
    if (byPath.has(c)) return c
  }
  return null
}

// ---------------------------------------------------------------- prisma schema

function readSchema() {
  const p = join(ROOT, 'prisma', 'schema.prisma')
  if (!existsSync(p)) return []
  const text = readFileSync(p, 'utf8')
  const models = []
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  let m
  while ((m = re.exec(text))) {
    const [, name, body] = m
    const fields = []
    for (const line of body.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue
      const f = t.match(/^(\w+)\s+([A-Za-z0-9_\[\]?]+)/)
      if (f) fields.push({ name: f[1], type: f[2] })
    }
    models.push({ name, fields })
  }
  return models.sort((a, b) => a.name.localeCompare(b.name))
}

const WRITE_OPS = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

function modelUsage(models, files) {
  const usage = new Map(models.map(m => [m.name, { writers: new Set(), readers: new Set() }]))
  for (const f of files) {
    const src = readFileSync(join(ROOT, f.path), 'utf8')
    for (const model of models) {
      const accessor = `prisma.${lcFirst(model.name)}.`
      let i = src.indexOf(accessor)
      while (i !== -1) {
        const op = (src.slice(i + accessor.length).match(/^(\w+)/) || [])[1] || ''
        const u = usage.get(model.name)
        if (WRITE_OPS.includes(op)) u.writers.add(f.path)
        else u.readers.add(f.path)
        i = src.indexOf(accessor, i + accessor.length)
      }
    }
  }
  return usage
}

// ---------------------------------------------------------------- build

const files = walk(SRC).map(analyse)
const byPath = new Map(files.map(f => [f.path, f]))

// Reverse import index.
for (const f of files) f.usedBy = []
for (const f of files) {
  for (const spec of f.imports) {
    const target = resolveImport(spec, f.path, byPath)
    if (target && target !== f.path) byPath.get(target).usedBy.push(f.path)
  }
}
for (const f of files) f.usedBy = [...new Set(f.usedBy)].sort()

// ---- @brain: two files claiming one concept is a HARD ERROR --------------
// This is the check the codebase has needed all along and has only ever enforced
// by writing "this is the one source of truth for X" into a comment and hoping.
const brainIndex = new Map()
for (const f of files) {
  for (const tag of f.brain) {
    if (!brainIndex.has(tag)) brainIndex.set(tag, [])
    brainIndex.get(tag).push(f.path)
  }
}
const duplicates = [...brainIndex.entries()].filter(([, paths]) => paths.length > 1)
if (duplicates.length) {
  console.error('DUPLICATE CONCEPT — two files claim to be the single source of truth.\n')
  for (const [tag, paths] of duplicates.sort()) {
    console.error(`  @brain ${tag}`)
    for (const p of paths) console.error(`      ${p}`)
  }
  console.error('\nOne concept, one owner. Either merge them, or give the second a different name.')
  process.exit(1)
}

// Next.js owns these filenames; they are entered by the framework, not imported,
// so "nothing imports it" says nothing about whether they are alive.
const FRAMEWORK_FILES = new Set([
  'page.tsx', 'layout.tsx', 'route.ts', 'middleware.ts', 'not-found.tsx', 'error.tsx',
  'global-error.tsx', 'loading.tsx', 'template.tsx', 'default.tsx', 'sitemap.ts',
  'robots.ts', 'manifest.ts', 'opengraph-image.tsx', 'twitter-image.tsx', 'icon.tsx',
  'apple-icon.tsx', 'instrumentation.ts',
])

const orphans = files
  .filter(f => f.usedBy.length === 0 && f.route === null && !FRAMEWORK_FILES.has(basename(f.path)))
  .map(f => f.path)

const models = readSchema()
const usage = modelUsage(models, files)

const routes = files.filter(f => f.route !== null)
  .sort((a, b) => a.route.localeCompare(b.route) || a.path.localeCompare(b.path))
const libs = files.filter(f => f.path.startsWith('src/lib/'))
  .sort((a, b) => b.usedBy.length - a.usedBy.length || a.path.localeCompare(b.path))
const components = files.filter(f => f.path.startsWith('src/components/'))
  .sort((a, b) => b.usedBy.length - a.usedBy.length || a.path.localeCompare(b.path))

// ---------------------------------------------------------------- emit

const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const exportList = (f, limit = 8) => {
  const names = f.exports.filter(e => !HTTP_METHODS.includes(e.name)).map(e => e.name)
  if (!names.length) return ''
  const shown = names.slice(0, limit).map(n => '`' + n + '`').join(', ')
  return names.length > limit ? `${shown} +${names.length - limit} more` : shown
}

const L = []
L.push('# GreenReserve — code map')
L.push('')
L.push('> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/codemap.mjs`.')
L.push('> Everything below is derived from the working tree. If a line here is wrong,')
L.push('> the code is wrong or the generator is — fix one of those, not this file.')
L.push('')
L.push(`${files.length} source files · ${routes.length} routes · ${libs.length} libraries · ${models.length} models`)
L.push('')

const parseFailures = files.filter(f => f.parseError)
if (parseFailures.length) {
  L.push('## ⚠ Files this map could not parse')
  L.push('')
  L.push('Their exports and imports are missing from everything below, so treat any')
  L.push('"orphan" or "usedBy: 0" involving them as unproven.')
  L.push('')
  for (const f of parseFailures) L.push(`- \`${f.path}\` — ${esc(f.parseError)}`)
  L.push('')
}

L.push('## Single sources of truth')
L.push('')
if (brainIndex.size === 0) {
  L.push('No `@brain` tags yet. Add one to a file header — `@brain whose-move-is-it` —')
  L.push('and it appears here. Two files claiming one concept fails this script.')
} else {
  L.push('One concept, one owner. A second file claiming the same `@brain` tag fails')
  L.push('this script with a non-zero exit — that is the point of the tag.')
  L.push('')
  L.push('| concept | file | exports |')
  L.push('|---|---|---|')
  for (const [tag, paths] of [...brainIndex.entries()].sort()) {
    const f = byPath.get(paths[0])
    L.push(`| \`${tag}\` | \`${f.path}\` | ${exportList(f, 6) || '—'} |`)
  }
}
L.push('')

L.push('## Routes')
L.push('')
L.push('**auth** is who the route is for. **guard** is where that is enforced:')
L.push('')
L.push('- `file` — the route imports a session helper itself. Strongest.')
L.push('- `layout` / `middleware` — enforced above it. The file alone will not show it.')
L.push('- `client-side` — the page fetches a session endpoint and redirects itself.')
L.push('  Fine for a page, never sufficient for an API route.')
L.push('- `entry` — an auth entry point (login, logout, otp, set-password). You cannot')
L.push('  require a session to create one, and logout must work when it is already dead.')
L.push('- `token` — session-free by design; a capability token in the URL is the guard.')
L.push('  The golfer flow works this way: the link in the confirmation email IS the key.')
L.push('- `secret header` — a shared secret compared against an env var, not a session.')
L.push('- `public` — the URL prefix carries no auth expectation.')
L.push('- **`NONE FOUND`** — none of the above on a route whose URL says it should have')
L.push('  one. A finding, not a label. Read the file before believing the map or the route.')
L.push('')
const ungated = routes.filter(f => f.guard === 'NONE FOUND')
if (ungated.length) {
  L.push(`> ⚠ ${ungated.length} route(s) below are marked \`NONE FOUND\`.`)
  L.push('')
}
L.push('| url | auth | guard | methods | file | lines |')
L.push('|---|---|---|---|---|---|')
for (const f of routes) {
  const g = f.guard === 'NONE FOUND' ? '**NONE FOUND**' : f.guard
  L.push(`| \`${f.route}\` | ${f.auth} | ${g} | ${f.methods.join(' ') || 'page'} | \`${f.path}\` | ${f.lines} |`)
}
L.push('')

const section = (title, list, note) => {
  L.push(`## ${title}`)
  L.push('')
  if (note) { L.push(note); L.push('') }
  L.push('| file | used by | lines | purpose | exports |')
  L.push('|---|---|---|---|---|')
  for (const f of list) {
    L.push(`| \`${f.path}\` | ${f.usedBy.length} | ${f.lines} | ${esc(f.purpose)} | ${exportList(f)} |`)
  }
  L.push('')
}

section('Libraries', libs, 'Sorted by how many files import them, so the load-bearing ones are first.')
section('Components', components, 'Sorted the same way.')

L.push('## Schema')
L.push('')
L.push('Writers are files calling `create`/`update`/`upsert`/`delete` on the model;')
L.push('readers are every other `prisma.<model>.` call. Answers "what writes to Call?"')
L.push('without opening anything.')
L.push('')
for (const m of models) {
  const u = usage.get(m.name)
  const writers = [...u.writers].sort()
  L.push(`### ${m.name}`)
  L.push('')
  L.push(`${m.fields.length} fields · ${writers.length} writer(s) · ${u.readers.size} reader(s)`)
  L.push('')
  L.push('- fields: ' + (m.fields.map(f => `\`${f.name}\``).join(', ') || '—'))
  L.push('- writers: ' + (writers.length ? writers.map(p => `\`${p}\``).join(', ') : '**none** — nothing in `src/` writes this model'))
  L.push('')
}

L.push('## Orphans')
L.push('')
L.push('Nothing imports these and no route serves them. Framework-owned filenames')
L.push('(`page.tsx`, `layout.tsx`, `route.ts`, …) are excluded — they are entered by')
L.push('Next.js, not imported, so "nothing imports it" proves nothing about them.')
L.push('')
if (orphans.length === 0) L.push('None.')
else for (const p of orphans) L.push(`- \`${p}\` (${byPath.get(p).lines} lines)`)
L.push('')

const md = L.join('\n')
const json = {
  generator: 'scripts/codemap.mjs',
  counts: {
    files: files.length, routes: routes.length, libs: libs.length,
    models: models.length, orphans: orphans.length,
    ungatedRoutes: routes.filter(f => f.guard === 'NONE FOUND').length,
  },
  brain: Object.fromEntries([...brainIndex.entries()].sort().map(([k, v]) => [k, v[0]])),
  files: files.map(f => ({
    path: f.path, lines: f.lines, purpose: f.purpose, brain: f.brain,
    exports: f.exports, route: f.route, kind: f.kind, methods: f.methods,
    auth: f.auth, guard: f.guard, imports: f.imports, usedBy: f.usedBy,
    ...(f.parseError ? { parseError: f.parseError } : {}),
  })),
  models: models.map(m => ({
    name: m.name, fields: m.fields,
    writers: [...usage.get(m.name).writers].sort(),
    readers: [...usage.get(m.name).readers].sort(),
  })),
  orphans,
}

mkdirSync(dirname(OUT_MD), { recursive: true })
// Trailing newline on both, and no timestamp anywhere: the CI drift check
// compares the regenerated file against the committed one, so any value that
// changes on its own would fail every build that did not touch the code.
writeFileSync(OUT_MD, md + '\n')
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2) + '\n')

console.log(`docs/CODEMAP.md + docs/codemap.json written — ${files.length} files, ${routes.length} routes, ${models.length} models, ${brainIndex.size} @brain concept(s), ${orphans.length} orphan(s).`)
