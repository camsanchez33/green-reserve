#!/usr/bin/env node
// GreenReserve status generator.
// Reads the queue/plan docs + git history and emits STATUS.md and STATUS.json.
// GENERATED OUTPUT — never hand-edit STATUS.md; edit the source docs or this script.
// Run: node scripts/status.mjs

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
const read = (f) => existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : ''

// ---------- git facts ----------
const HEAD = sh('git rev-parse --short HEAD')
const BRANCH = sh('git rev-parse --abbrev-ref HEAD')
const DIRTY = sh('git status --porcelain').split('\n').filter(Boolean)
const knownHashes = new Set(sh('git log --format=%h --all -n 4000').split('\n').filter(Boolean))
const hashDate = {}
for (const line of sh("git log --format='%h|%cI|%s' --all -n 4000").split('\n').filter(Boolean)) {
  const [h, d, ...s] = line.split('|')
  hashDate[h] = { date: d, subject: s.join('|') }
}
const isRealHash = (h) => {
  if (knownHashes.has(h)) return h
  const full = sh(`git rev-parse --verify --quiet ${h}^{commit}`)
  if (!full) return null
  const short = full.slice(0, 7)
  if (!hashDate[short]) {
    const line = sh(`git log -1 --format='%h|%cI|%s' ${full}`)
    const [hh, d, ...s] = line.split('|')
    hashDate[hh] = { date: d, subject: s.join('|') }
    return hh
  }
  return short
}

const NOW = new Date()
const daysSince = (iso) => iso ? Math.floor((NOW - new Date(iso)) / 86400000) : null

// ---------- doc block parser ----------
// Returns items: {file, line, indent, checked, title, body, section}
function parseItems(file) {
  const txt = read(file)
  if (!txt) return []
  const lines = txt.split(/\r?\n/)
  const items = []
  let section = '(top)'
  let cur = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const h2 = l.match(/^##+\s+(.*)$/)
    if (h2) { section = h2[1].trim(); cur = null; continue }
    const box = l.match(/^(\s*)- \[([ xX])\]\s+(.*)$/)
    if (box) {
      cur = {
        file, line: i + 1, indent: box[1].length,
        checked: box[2].toLowerCase() === 'x',
        title: box[3].trim(), body: [], section,
      }
      items.push(cur)
      continue
    }
    if (cur) {
      // continuation: indented non-bullet-at-same-or-less-indent text
      const nextBox = l.match(/^(\s*)- \[[ xX]\]/)
      if (nextBox) { cur = null; continue }
      if (l.trim() === '') { cur.body.push(''); continue }
      const ind = l.match(/^(\s*)/)[1].length
      if (ind > cur.indent) cur.body.push(l.trim())
      else cur = null
    }
  }
  return items
}

const STATES = { DONE: 'done', SHIPPED: 'shipped-unverified', PARTIAL: 'in-progress', TODO: 'not-started' }

function classify(item) {
  const titleLine = item.title
  const bodyText = item.body.join('\n')
  const blob = titleLine + '\n' + bodyText

  // Ship evidence is DELIBERATELY narrow. A bare hash somewhere in the body is
  // not proof — RUN_QUEUE.md body text cites other items' commits as context,
  // and at least one open item cites a commit precisely to say "this is NOT built".
  // Evidence counts only when it is: a hash in the title line, or a hash that
  // directly follows the word SHIPPED.
  const pick = (re, text) => { const out = []; let m; const r = new RegExp(re, 'gi'); while ((m = r.exec(text))) out.push(m[1]); return out }
  const shippedHashes = pick('\\bSHIPPED\\s+([0-9a-f]{7,40})\\b', blob)
  const titleHashes = (titleLine.match(/\b[0-9a-f]{7,40}\b/g) || [])
  const ordered = [...shippedHashes, ...titleHashes]

  const hashes = []
  for (const c of ordered) { const h = isRealHash(c); if (h && !hashes.includes(h)) hashes.push(h) }
  const newest = hashes[0] || null

  const saysShipped = /\bSHIPPED\b/.test(blob)
  let state
  if (item.checked) state = STATES.DONE
  else if (/\bPARTIALLY BUILT\b/i.test(blob)) state = STATES.PARTIAL
  else if (saysShipped || hashes.length) state = STATES.SHIPPED
  else state = STATES.TODO

  // Collapse hard-wrapped body lines into readable paragraphs.
  const paras = []
  let buf = []
  for (const b of item.body) {
    if (b === '') { if (buf.length) { paras.push(buf.join(' ')); buf = [] } }
    else if (/^[-*]\s/.test(b)) { if (buf.length) { paras.push(buf.join(' ')); buf = [] } paras.push(b) }
    else buf.push(b)
  }
  if (buf.length) paras.push(buf.join(' '))

  const shortTitle = titleLine.replace(/\s+/g, ' ').replace(/\s*[—-]\s*SHIPPED\s+[0-9a-f]{7,40}.*$/i, '').slice(0, 200)
  return { ...item, state, hashes, newest, shipDate: newest ? hashDate[newest]?.date : null, shortTitle, paras }
}

const runItems = parseItems('RUN_QUEUE.md').map(classify)
const revItems = parseItems('REVISE_QUEUE.md').map(classify)

// ---------- drift: commits the queue has not recorded ----------
const queueLastCommit = sh('git log -1 --format=%cI -- RUN_QUEUE.md')
const sinceQueue = sh(`git log --format='%h|%cI|%s' --since="${queueLastCommit}" --no-merges`)
  .split('\n').filter(Boolean).map((l) => { const [h, d, ...s] = l.split('|'); return { h, date: d, subject: s.join('|') } })
  .filter((c) => !/^queue\/spec update/i.test(c.subject))
  .filter((c) => c.date > queueLastCommit)

// a commit is "unrecorded" if its hash appears nowhere in RUN_QUEUE.md
const runTxt = read('RUN_QUEUE.md')
const unrecorded = sinceQueue.filter((c) => !runTxt.includes(c.h))

// ---------- link unrecorded commits back to the queue item they belong to ----------
// Only unambiguous campaign IDs. Bare phase letters like "B1" collide with
// unrelated items ("BIRDIE Phase B1" vs "MP-3 run B1"), so they are excluded.
const ID_RE = /\b(MP-\d+[a-z]?|SD-\d+|A-\d{2})\b/g
for (const c of unrecorded) {
  const ids = [...new Set((c.subject.match(ID_RE) || []))]
  c.ids = ids
  c.matches = runItems
    .filter((i) => i.state !== STATES.DONE && ids.some((id) => new RegExp('(^|\\s)' + id + '\\b').test(i.title)))
    .map((i) => ({ title: i.title.slice(0, 90), line: i.line, state: i.state }))
}

// ---------- awaiting review (open box, shipped) ----------
const awaiting = runItems.filter((i) => i.state === STATES.SHIPPED)
  .map((i) => ({ ...i, ageDays: daysSince(i.shipDate) }))
  .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))

const inFlight = runItems.filter((i) => i.state === STATES.PARTIAL)
const notStarted = runItems.filter((i) => i.state === STATES.TODO)
const done = runItems.filter((i) => i.state === STATES.DONE)

// ---------- ideas / parked ----------
function ideasSection() {
  const txt = read('RUN_QUEUE.md')
  const start = txt.indexOf('## Ideas / not yet specced')
  if (start < 0) return { bullets: [], parked: [] }
  const chunk = txt.slice(start)
  const bullets = chunk.split(/\r?\n/).filter((l) => /^- /.test(l)).map((l) => l.replace(/^- /, '').trim())
  const parked = [...chunk.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim())
  return { bullets, parked }
}
const ideas = ideasSection()

// ---------- ideas bank: AUDIT_MASTER.md ----------
// This file is explicitly NOT work status — it records what was noticed on each
// page and what we might do about it. It is indexed here, never queued.
function auditBank() {
  const txt = read('AUDIT_MASTER.md')
  if (!txt) return null
  const lines = txt.split(/\r?\n/)
  const pages = []
  let group = ''
  let cur = null
  const flush = () => { if (cur) { pages.push(cur); cur = null } }
  for (const l of lines) {
    const h1 = l.match(/^#\s+(.+)$/)
    if (h1 && !/^#\s+GreenReserve/.test(l)) { flush(); group = h1[1].replace(/\s*—.*$/, '').trim(); continue }
    const h2 = l.match(/^##\s+(.+)$/)
    if (h2) { flush(); cur = { group, name: h2[1].replace(/`/g, '').trim(), verdict: '', sec: 0, money: 0, polish: 0, ideas: 0 }; continue }
    if (!cur) continue
    const v = l.match(/^\*\*Verdict:\*\*\s*(.+)$/)
    if (v) { cur.verdict = v[1].replace(/\*/g, '').trim(); continue }
    if (/^\*\*Ideas:\*\*/.test(l)) { cur.inIdeas = true; cur.hasIdeas = true; continue }
    if (/^\*\*Noticed:\*\*/.test(l)) { cur.inIdeas = false; continue }
    if (/^[-*]\s/.test(l)) {
      if (cur.inIdeas) cur.ideas++
      if (l.includes('\u{1F534}')) cur.sec++
      else if (l.includes('\u{1F7E0}')) cur.money++
      else if (l.includes('\u{1F7E1}')) cur.polish++
    }
  }
  flush()
  const totals = pages.reduce((a, p) => ({ sec: a.sec + p.sec, money: a.money + p.money, polish: a.polish + p.polish, ideas: a.ideas + (p.hasIdeas ? 1 : 0) }), { sec: 0, money: 0, polish: 0, ideas: 0 })
  const lastTouched = sh('git log -1 --format=%cI -- AUDIT_MASTER.md')
  return { pages, totals, tracked: !!lastTouched, lastTouched }
}
const bank = auditBank()

// ---------- things waiting on Cam ----------
const waitingOnCam = []
for (const i of runItems) {
  if (i.state === STATES.DONE) continue
  const blob = [i.title, ...i.body].join(' ')
  if (/\bCAM:|manual step|Cam's approval|Cam captures|confirm the state|pending Cam/i.test(blob)) {
    const m = blob.match(/(CAM:[^.;]*|manual step[^.;]*|Cam's approval[^.;]*|pending Cam[^.;]*)/i)
    waitingOnCam.push({ item: i.shortTitle, note: (m ? m[1] : '').trim().slice(0, 180), line: i.line })
  }
}

// ---------- spec inventory ----------
const specFiles = sh("git ls-files '*_SPEC.md' 'ADMIN_MASTER_PLAN.md' 'ARCHITECTURE.md' 'CLAUDE.md'").split('\n').filter(Boolean)
const specs = specFiles.map((f) => {
  const base = f.replace(/\.md$/, '')
  const openRefs = notStarted.concat(awaiting, inFlight).filter((i) => [i.title, ...i.body].join(' ').includes(base)).length
  const last = sh(`git log -1 --format=%cI -- "${f}"`)
  return { file: f, openRefs, lastTouched: last ? last.slice(0, 10) : '', ageDays: daysSince(last) }
}).sort((a, b) => (b.openRefs - a.openRefs) || (a.ageDays - b.ageDays))

// ---------- revise campaign ----------
const revDone = revItems.filter((i) => i.state === STATES.DONE).length
const revOpen = revItems.filter((i) => i.state !== STATES.DONE)

const payload = {
  generatedAt: NOW.toISOString(),
  repo: { head: HEAD, branch: BRANCH, dirtyCount: DIRTY.length, dirty: DIRTY.slice(0, 20), looksLikeRunInProgress: DIRTY.some((x) => /prisma\/migrations|src\//.test(x)) },
  drift: { queueLastCommit, unrecorded },
  counts: {
    runDone: done.length, runAwaiting: awaiting.length, runInFlight: inFlight.length, runNotStarted: notStarted.length,
    reviseDone: revDone, reviseOpen: revOpen.length,
    ideas: ideas.bullets.length, parked: ideas.parked.length,
  },
  inFlight: inFlight.map((i) => ({ title: i.shortTitle, line: i.line, body: i.paras.filter(Boolean).slice(0, 8) })),
  awaiting: awaiting.map((i) => ({ title: i.shortTitle, line: i.line, hash: i.newest, shipDate: i.shipDate ? i.shipDate.slice(0, 10) : null, ageDays: i.ageDays })),
  next: notStarted.map((i) => ({ title: i.shortTitle, line: i.line, section: i.section })),
  waitingOnCam,
  ideas,
  revise: { done: revDone, open: revOpen.map((i) => ({ title: i.shortTitle, line: i.line, state: i.state })) },
  specs,
  bank,
  recentCommits: sh("git log -12 --format='%h|%cI|%s' --no-merges").split('\n').filter(Boolean)
    .map((l) => { const [h, d, ...s] = l.split('|'); return { h, date: d.slice(0, 10), subject: s.join('|') } }),
}

// ---------- render STATUS.md ----------
const d = payload
const esc = (s) => String(s).replace(/\|/g, '\\|')
const ref = (file, line) => `\`${file}:${line}\``
const L = []
const stamp = NOW.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

L.push('# GreenReserve — running status')
L.push('')
L.push('> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.')
L.push('> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`')
L.push('> and `git log`. If something here is wrong, the source doc is wrong — fix it there.')
L.push('')
L.push(`Generated ${stamp} · branch \`${d.repo.branch}\` · HEAD \`${d.repo.head}\` · working tree ${d.repo.dirtyCount === 0 ? 'clean' : `**${d.repo.dirtyCount} dirty file(s)**`}`)
L.push('')

// --- drift ---
L.push('## ⚠ Drift — git and the queue disagree')
L.push('')
if (d.drift.unrecorded.length === 0) {
  L.push('None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.')
} else {
  L.push(`\`RUN_QUEUE.md\` was last committed **${d.drift.queueLastCommit.slice(0, 10)}**. ${d.drift.unrecorded.length} commit(s) since then are not mentioned anywhere in it:`)
  L.push('')
  L.push('| commit | date | subject |')
  L.push('|---|---|---|')
  for (const c of d.drift.unrecorded) L.push(`| \`${c.h}\` | ${c.date.slice(0, 10)} | ${esc(c.subject)} |`)
  L.push('')
  L.push('**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.')
  const linked = d.drift.unrecorded.filter((c) => c.matches && c.matches.length)
  if (linked.length) {
    L.push('')
    L.push('Matched back to the queue items they belong to:')
    L.push('')
    for (const c of linked) {
      for (const m of c.matches) {
        L.push(`- \`${c.h}\` **${esc(c.subject.slice(0, 80))}** → item still reads *${m.state}*: ${esc(m.title)} — ${ref('RUN_QUEUE.md', m.line)}`)
      }
    }
  }
}
if (d.repo.dirtyCount) {
  L.push('')
  L.push(`### Uncommitted working tree (${d.repo.dirtyCount} file(s))`)
  L.push('')
  for (const x of d.repo.dirty) L.push(`- \`${x.trim()}\``)
  L.push('')
  if (d.repo.looksLikeRunInProgress) {
    L.push('**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply')
    L.push('the queue header\'s `git checkout -- .` cleanup until that run has committed, or the work is gone.')
  } else {
    L.push('Queue header rule: dirty docs get **committed**, dirty source gets discarded — but check what')
    L.push('these actually are first.')
  }
}
L.push('')

// --- in flight ---
L.push('## In flight')
L.push('')
if (!d.inFlight.length) L.push('Nothing marked as partially built.')
for (const i of d.inFlight) {
  L.push(`- **${esc(i.title)}** — ${ref('RUN_QUEUE.md', i.line)}`)
  for (const b of i.body) L.push(`  - ${esc(b.replace(/^[-*]\s+/, '').slice(0, 400))}`)
}
L.push('')

// --- awaiting review ---
L.push('## Built but not signed off')
L.push('')
L.push('Open checkbox **because the review has not run**, not because the code is missing.')
L.push('This is the distinction a raw checkbox count gets wrong.')
L.push('')
if (!d.awaiting.length) L.push('Nothing awaiting review.')
else {
  L.push('| item | shipped | age | commit | source |')
  L.push('|---|---|---|---|---|')
  for (const i of d.awaiting) {
    L.push(`| ${esc(i.title.slice(0, 110))} | ${i.shipDate || '—'} | ${i.ageDays != null ? i.ageDays + 'd' : '—'} | ${i.hash ? '`' + i.hash + '`' : '—'} | ${ref('RUN_QUEUE.md', i.line)} |`)
  }
}
L.push('')

// --- next up ---
L.push('## Not started — the actual queue')
L.push('')
if (!d.next.length) L.push('Queue empty.')
else {
  let n = 0
  for (const i of d.next) { n++; L.push(`${n}. ${esc(i.title.slice(0, 180))} — ${ref('RUN_QUEUE.md', i.line)}`) }
}
L.push('')

// --- waiting on Cam ---
L.push('## Waiting on you (not on a build)')
L.push('')
if (!d.waitingOnCam.length) L.push('Nothing blocked on a human decision.')
for (const w of d.waitingOnCam) L.push(`- ${esc(w.note || w.item)} — ${ref('RUN_QUEUE.md', w.line)}`)
L.push('')

// --- revise campaign ---
L.push('## Revise campaign (page-by-page pass)')
L.push('')
L.push(`${d.revise.done} pages closed · ${d.revise.open.length} open. One page in flight at a time.`)
L.push('')
for (const i of d.revise.open) L.push(`- ${esc(i.title.slice(0, 160))} — ${ref('REVISE_QUEUE.md', i.line)}`)
L.push('')

// --- parked / ideas ---
L.push('## Parked, with triggers')
L.push('')
for (const p of d.ideas.parked) L.push(`- ${esc(p)}`)
L.push('')
L.push('## Ideas — not specced, not queued')
L.push('')
for (const b of d.ideas.bullets) L.push(`- ${esc(b.slice(0, 220))}`)
L.push('')

// --- ideas bank ---
if (d.bank) {
  L.push('## Ideas bank — AUDIT_MASTER.md')
  L.push('')
  L.push('Page-by-page findings and maybes. **Noticed, not scheduled** — nothing here is on the queue')
  L.push('until it becomes a RUN_QUEUE item. Counts are unfixed findings as written in that file.')
  L.push('')
  L.push(`Totals: **${d.bank.totals.sec} security/data-loss · ${d.bank.totals.money} money-truth · ${d.bank.totals.polish} polish** findings across ${d.bank.pages.length} page blocks; ${d.bank.totals.ideas} of them carry ideas.`)
  L.push('')
  L.push('| page | verdict | sec | money | polish | ideas |')
  L.push('|---|---|---|---|---|---|')
  const hot = d.bank.pages.filter((p) => p.sec + p.money + p.polish > 0 || p.hasIdeas)
    .sort((a, b) => (b.sec * 100 + b.money * 10 + b.polish) - (a.sec * 100 + a.money * 10 + a.polish))
  for (const p of hot) L.push(`| ${esc(p.name)} | ${esc(p.verdict)} | ${p.sec || ''} | ${p.money || ''} | ${p.polish || ''} | ${p.hasIdeas ? 'yes' : ''} |`)
  L.push('')
}

// --- specs ---
L.push('## Spec inventory')
L.push('')
L.push('`open refs` = how many open queue items still point at this spec. Zero + old = fully consumed.')
L.push('')
L.push('| spec | open refs | last touched | age |')
L.push('|---|---|---|---|')
for (const s of d.specs) L.push(`| \`${s.file}\` | ${s.openRefs} | ${s.lastTouched} | ${s.ageDays}d |`)
L.push('')

// --- recent activity ---
L.push('## Recent commits')
L.push('')
for (const c of d.recentCommits) L.push(`- \`${c.h}\` ${c.date} — ${esc(c.subject)}`)
L.push('')

L.push('---')
L.push('')
L.push(`**Totals:** ${d.counts.runDone} done · ${d.counts.runAwaiting} awaiting review · ${d.counts.runInFlight} in flight · ${d.counts.runNotStarted} not started · ${d.counts.reviseOpen} revise pages open · ${d.counts.ideas} ideas · ${d.counts.parked} parked.`)
L.push('')

writeFileSync(join(ROOT, 'STATUS.md'), L.join('\n'), 'utf8')
writeFileSync(join(ROOT, 'STATUS.json'), JSON.stringify(payload, null, 2), 'utf8')
console.log(`STATUS.md written — ${d.counts.runDone} done, ${d.counts.runAwaiting} awaiting review, ${d.counts.runNotStarted} not started, ${d.drift.unrecorded.length} unrecorded commit(s).`)
