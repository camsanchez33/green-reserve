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
const SECRET_SHAPED = /(sk_live|sk_test|pk_live|whsec_|rk_live|AKIA[0-9A-Z]{16}|xox[baprs]-)|postgres(ql)?:\/\/[^\s]*:[^\s]*@|[0-9a-f]{32,}/

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
  // A purpose is copied verbatim into two COMMITTED files. If a header comment
  // ever contains something secret-shaped, refuse loudly rather than mirror it —
  // and note that the CI drift check would otherwise fail any build that scrubbed
  // one copy without the other.
  if (SECRET_SHAPED.test(s)) return '[purpose withheld — header comment looks like it contains a secret]'
  return s.length > 200 ? s.slice(0, 197).trimEnd() + '...' : s
}

// Blank out every comment before any text test runs. Without this, "TODO: add
// resolveAdminSession here" reads as a guard and a comment mentioning a token
// reads as a token check — both were live defects.
function stripComments(src, ast) {
  if (!ast || !ast.comments || !ast.comments.length) return src
  const chars = src.split('')
  for (const c of ast.comments) {
    for (let i = c.start; i < c.end && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' '
  }
  return chars.join('')
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
// Matched as CALLS — `name(` — not as bare words. `AdminSession` used to be in
// this list and it is an interface: `import type { AdminSession }` was enough to
// stamp a file `admin | file`, the map's strongest label.
const SESSION_HELPERS = [
  [/\b(resolveAdminSession|requireRole|requireOwner)\s*\(/, 'admin'],
  [/\bcronAuthFailure\s*\(/, 'cron'],
  [/\b(resolveDashboardSession|getOperatorSession)\s*\(/, 'operator'],
  [/\bgetMemberSession\s*\(/, 'member'],
  [/\bgetGolferSession\s*\(/, 'golfer'],
]
const HELPER_NAMES = /\b(resolveAdminSession|requireRole|requireOwner|cronAuthFailure|resolveDashboardSession|getOperatorSession|getMemberSession|getGolferSession)\b/

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
  // The course-world portals are auth-expecting surfaces that used to fall through
  // to `public`, which made them structurally un-flaggable forever.
  ['/courses/[slug]/account', 'golfer'],
  ['/courses/[slug]/member', 'member'],
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

// The matcher says where middleware RUNS; the body says where it lets through.
// src/middleware.ts keeps its exemptions in *_PUBLIC arrays.
function middlewareExempt() {
  const p = join(SRC, 'middleware.ts')
  if (!existsSync(p)) return []
  const src = readFileSync(p, 'utf8')
  const out = []
  for (const m of src.matchAll(/_PUBLIC\s*(?::[^=]*)?=\s*\[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.push(s[1])
  }
  return out
}
const MW_EXEMPT = middlewareExempt()

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

// A session helper being PRESENT is not a guard. The first version of this
// returned `guard: 'file'` — the strongest label the map has — the moment a
// helper name appeared anywhere in the file, and stamped two fully public
// endpoints as session-gated:
//
//   /api/bookings              — POST creates every booking, claims tee-time
//                                capacity and attaches a saved card. It calls
//                                getGolferSession() and getMemberSession() for
//                                MEMBER PRICING only; nothing is ever refused.
//   /api/bookings/setup-intent — calls getGolferSession(), never negates it,
//                                and mints a live Stripe SetupIntent for anyone.
//
// Both are public by design. The defect was the map saying otherwise, on the one
// column an auditor would filter by to decide what not to read. So the test is
// now enforcement: the helper's result has to reach an `if` that returns.
function isEnforced(fnNode, code) {
  if (!fnNode) return false
  // Names bound from a session-helper call: `const s = await resolveAdminSession()`.
  const bound = new Set()
  const scan = (node, fn, seen = new Set()) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) { for (const n of node) scan(n, fn, seen); return }
    fn(node)
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue
      const v = node[k]
      if (v && typeof v === 'object') scan(v, fn, seen)
    }
  }
  scan(fnNode, (n) => {
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier' && n.init) {
      const src = code.slice(n.init.start, n.init.end)
      if (HELPER_NAMES.test(src)) bound.add(n.id.name)
    }
  })

  // An `if` whose test involves a helper call or one of those names, and whose
  // consequent returns (or redirects). Covers all three shapes this codebase
  // uses: `if (!session) return 401`, `if (!requireRole(s, X)) return 403`, and
  // `const fail = cronAuthFailure(req); if (fail) return fail`.
  let enforced = false
  scan(fnNode, (n) => {
    if (enforced || n.type !== 'IfStatement') return
    const testSrc = code.slice(n.test.start, n.test.end)
    const mentions = HELPER_NAMES.test(testSrc) || [...bound].some(b => new RegExp('\\b' + b + '\\b').test(testSrc))
    if (!mentions) return
    let returns = false
    scan(n.consequent, (c) => {
      if (c.type === 'ReturnStatement') returns = true
      if (c.type === 'CallExpression' && c.callee && c.callee.name === 'redirect') returns = true
    }, new Set())
    if (returns) enforced = true
  })
  return enforced
}

// A layout only guards what is under it if it actually stops rendering. The
// admin layout resolves a session and renders its children either way — the
// redirect is a client `useEffect` — so 17 /admin/* pages were labelled `layout`
// ("enforced above it") when the honest label is `client-side`.
function layoutGuards(code) {
  return /\bredirect\s*\(|\bnotFound\s*\(/.test(code)
}

function guardFor(relPath, url, code, methodNodes, wholeFn) {
  const level0 = helperLevel(code)

  // Per method, because `guard` was computed once per FILE while `methods` listed
  // every verb — so a GET behind resolveAdminSession would launder a bare POST
  // on the same row.
  if (methodNodes && methodNodes.size) {
    const perMethod = {}
    let anyEnforced = false
    for (const [m, node] of methodNodes) {
      const sub = code.slice(node.start, node.end)
      const lvl = helperLevel(sub)
      const ok = lvl && isEnforced(node, code)
      perMethod[m] = ok ? 'file' : null
      if (ok) anyEnforced = true
    }
    const unenforced = Object.entries(perMethod).filter(([, v]) => v === null).map(([m]) => m)
    // auth comes from a method that actually enforces something. Taking it from
    // the whole file made /api/bookings read `member`, because its UNenforced
    // POST calls getMemberSession for pricing.
    const enforcedLevel = [...methodNodes.entries()]
      .map(([m, n]) => (perMethod[m] === 'file' ? helperLevel(code.slice(n.start, n.end)) : null))
      .find(Boolean)
    if (anyEnforced && unenforced.length === 0) return { auth: enforcedLevel || level0, guard: 'file', perMethod }
    if (anyEnforced) {
      // Worst wins, and the row names the verbs that are not covered.
      const rest = fallbackGuard(relPath, url, code)
      return { auth: enforcedLevel || rest.auth, guard: `${rest.guard} for ${unenforced.join('/')}`, perMethod }
    }
  }

  if (level0 && isEnforced(wholeFn, code)) return { auth: level0, guard: 'file' }
  return fallbackGuard(relPath, url, code)
}

function fallbackGuard(relPath, url, code) {
  for (const lay of ancestorLayouts(relPath)) {
    const laySrc = stripComments(readFileSync(join(ROOT, lay), 'utf8'))
    const l = helperLevel(laySrc)
    if (l) return { auth: l, guard: layoutGuards(laySrc) ? `layout (${lay})` : 'client-side' }
  }
  const level = prefixLevel(url)
  // Middleware only guards what its matcher covers AND what its body does not
  // exempt. Reading the matcher alone claimed a guard on /dashboard/onboarding
  // and /dashboard/verify, which middleware deliberately lets through.
  const mwCovered = MW_PREFIXES.some(p => url === p || url.startsWith(p + '/'))
  if (mwCovered && !MW_EXEMPT.some(p => url === p || url.startsWith(p + '/'))) {
    return { auth: level, guard: 'middleware' }
  }
  // A secret header is only a guard if the header and the env var meet in one
  // comparison. Two halves that never touch matched any route that happened to
  // read RESEND_API_KEY and, separately, any request header.
  if (/headers\.get\(/.test(code) && SECRET_ENV_COMPARE.test(code)) return { auth: level, guard: 'secret header' }
  if (/constructEvent\s*\(/.test(code)) return { auth: level, guard: 'secret header' }
  if (AUTH_ENTRY.test(url)) return { auth: level, guard: 'entry' }
  // `token` — the golfer flow is deliberately session-free: the link in the
  // confirmation email carries its own capability token, and that IS the guard.
  // The test is that the route READS one off the request and checks it. Merely
  // containing the word is not enough — /api/inquiries mints a call invite and
  // says "token" five times while checking nothing, and was labelled token-gated.
  if (READS_A_TOKEN.some(re => re.test(code))) return { auth: level, guard: 'token' }
  if (/\/api\/(admin|operator|golfer)\/session\b/.test(code)) return { auth: level, guard: 'client-side' }
  return { auth: level, guard: level === 'public' ? 'public' : 'NONE FOUND' }
}

const SECRET_COMPARED = [
  // The header almost always lands in a local first, so require both halves in
  // the file plus an actual comparison against an env var — the two-halves-never-
  // touch version matched any route that read RESEND_API_KEY and any header.
  /headers\.get\(/,
  /headers\.get\([^)]*\)\s*!==?\s*[^;\n]*process\.env\./,
  /process\.env\.[A-Z0-9_]+\s*!==?\s*[^;\n]*headers\.get\(/,
  /headers\.get\([^)]*\)\s*!==?\s*`[^`]*\$\{\s*process\.env\./,
  /constructEvent\s*\([^)]*process\.env\./s,
  /constructEvent\s*\(/,
].map(re => re)
const SECRET_ENV_COMPARE = /[!=]==?\s*(`[^`]*\$\{\s*)?process\.env\.[A-Z0-9_]+/

const READS_A_TOKEN = [
  /\.get\(\s*['"][a-zA-Z]*token['"]\s*\)/i,               // reads ?token= off the URL
  /params\s*\)?\s*[.;,\s]*[^\n]{0,60}\btoken\b\s*[,}]/,   // /api/call/[token]
  /\bverify[A-Za-z]*Token\s*\(/,                          // verifyPreviewToken(...)
  /\bauthorize\s*\(/,                                     // the check-in routes' own helper
  /\b(checkInToken|detailsToken|callInviteToken|payToken)\s*[=!]==?/, // compared, not just named
]

// Anchored to the FINAL segment. Unanchored, the `auth` alternative excused
// everything under /api/auth/** and /api/golfer/auth/** forever — an ungated
// data endpoint dropped in either directory would have read as "unauthenticated
// on purpose". The bare `auth` keyword is gone for the same reason.
const AUTH_ENTRY_FINAL = /(^|\/)[a-z0-9-]*(login|logout|forgot-password|reset-password|set-password|send-code|accept-invite|2fa)$/
const AUTH_ENTRY_ANY = /(^|\/)(otp)(\/|$)/
const AUTH_ENTRY = { test: (url) => AUTH_ENTRY_FINAL.test(url) || AUTH_ENTRY_ANY.test(url) }

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
  const methodNodes = new Map()

  // Dynamic import() is a CallExpression anywhere in the tree, not a top-level
  // declaration, so it needs its own walk. Cheap: one pass, string literals only
  // (a computed specifier is not resolvable to a file anyway).
  const collectDynamicImports = (node, seen = new Set()) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) { for (const n of node) collectDynamicImports(n, seen); return }
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Import') {
      const arg = node.arguments && node.arguments[0]
      if (arg && arg.type === 'StringLiteral') imports.push(arg.value)
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
      const v = node[key]
      if (v && typeof v === 'object') collectDynamicImports(v, seen)
    }
  }

  if (ast) {
    collectDynamicImports(ast.program.body)
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
              if (isFn && HTTP_METHODS.includes(name)) methodNodes.set(name, init)
            }
          } else if (d.id && d.id.name) {
            exports.push({ name: d.id.name, kind: exportKind(d, d.id.name) || 'const' })
            if (d.type === 'FunctionDeclaration' && HTTP_METHODS.includes(d.id.name)) methodNodes.set(d.id.name, d)
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
    ...(url === null
      ? { auth: null, guard: null }
      : guardFor(relPath, url, stripComments(src, ast), methodNodes, ast && ast.program)),
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
L.push('- `file` — the route calls a session helper AND refuses on a falsy result.')
L.push('  Presence is not enough: `/api/bookings` calls two session helpers purely for')
L.push('  member pricing and refuses nobody, and it used to carry this label.')
L.push('- `X for POST` — split route. The named verbs are NOT covered; the rest are.')
L.push('- `layout` — an ancestor layout resolves a session AND `redirect()`s on failure.')
L.push('- `middleware` — inside the matcher and not in its exempt list.')
L.push('- `client-side` — the guard is a client redirect, so the server renders it')
L.push('  either way. Fine for a page shell, never sufficient for an API route.')
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
  // The spec asks for "which files query it", not just how many. Readers are
  // capped because a hot model has dozens and the full list belongs in the JSON,
  // but a count alone does not answer the question the section exists for.
  const readers = [...u.readers].sort()
  const shownReaders = readers.slice(0, 12).map(p => `\`${p}\``).join(', ')
  L.push('- readers: ' + (readers.length
    ? shownReaders + (readers.length > 12 ? ` +${readers.length - 12} more (see \`docs/codemap.json\`)` : '')
    : '**none**'))
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
