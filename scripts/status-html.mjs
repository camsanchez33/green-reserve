#!/usr/bin/env node
// Renders STATUS.json as an Artifact-ready HTML fragment (STATUS.artifact.html).
// No doctype/head/body wrapper: the Artifact tool supplies the skeleton.
// Run after scripts/status.mjs.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const d = JSON.parse(readFileSync(join(ROOT, 'STATUS.json'), 'utf8'))
const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const mono = (s) => `<code>${e(s)}</code>`
const H = []
const P = (...x) => H.push(...x)

const stamp = new Date(d.generatedAt)
const stampStr = stamp.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

P(`<title>GreenReserve Run Board</title>`)
P(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">`)
P(`<style>
:root{
  --ground:#F6F7F4; --surface:#FFFFFF; --surface-2:#EDF0EA; --sunken:#E4E9E1;
  --ink:#16201A; --ink-2:#54625A; --ink-3:#87938B; --line:#DBE1D9;
  --alarm:#B4472C; --alarm-soft:#F4E2DC;
  --good:#2F6B4F; --good-soft:#DEEBE3;
  --warn:#96691A; --warn-soft:#F2E7CF;
  --idle:#6F7D75; --idle-soft:#E6EAE4;
  --display:'Archivo','Helvetica Neue',Arial,sans-serif;
  --body:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;
  --code:'IBM Plex Mono','SFMono-Regular',Consolas,monospace;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#12170F; --surface:#1A211B; --surface-2:#212A22; --sunken:#161D18;
    --ink:#E9EEE6; --ink-2:#A4B0A6; --ink-3:#79867B; --line:#2C372E;
    --alarm:#E4714F; --alarm-soft:#3A211A;
    --good:#79C79B; --good-soft:#1C2E24;
    --warn:#D9A63F; --warn-soft:#31281440;
    --idle:#8B978D; --idle-soft:#232B25;
  }
}
:root[data-theme="dark"]{
  --ground:#12170F; --surface:#1A211B; --surface-2:#212A22; --sunken:#161D18;
  --ink:#E9EEE6; --ink-2:#A4B0A6; --ink-3:#79867B; --line:#2C372E;
  --alarm:#E4714F; --alarm-soft:#3A211A;
  --good:#79C79B; --good-soft:#1C2E24;
  --warn:#D9A63F; --warn-soft:#31281440;
  --idle:#8B978D; --idle-soft:#232B25;
}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:var(--body);line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:40px 24px 72px;display:flex;flex-direction:column;gap:34px}
code{font-family:var(--code);font-size:.85em;color:var(--ink-2);background:var(--sunken);padding:.1em .38em;border-radius:3px}
h1,h2,h3{font-family:var(--display);margin:0;text-wrap:balance}
h1{font-size:31px;font-weight:700;letter-spacing:-.015em}
h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-3)}
p{margin:0}
a{color:inherit}

/* masthead */
.mast{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:12px;
  padding-bottom:16px;border-bottom:2px solid var(--ink)}
.mast .meta{font-family:var(--code);font-size:12px;color:var(--ink-3);display:flex;gap:14px;flex-wrap:wrap}
.sub{font-size:14px;color:var(--ink-2);max-width:62ch;margin-top:6px}

/* alarm */
.alarm{border-left:4px solid var(--alarm);background:var(--alarm-soft);padding:18px 20px;
  display:flex;flex-direction:column;gap:12px;border-radius:0 6px 6px 0}
.alarm .lede{font-family:var(--display);font-weight:600;font-size:17px;color:var(--alarm)}
.alarm ul{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.alarm li{font-size:13.5px;color:var(--ink);display:flex;gap:10px;align-items:flex-start}
.alarm li .h{font-family:var(--code);font-size:12px;color:var(--alarm);flex:0 0 auto;padding-top:1px}
.note{font-size:13px;color:var(--ink-2)}

/* tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:6px;overflow:hidden}
.tile{background:var(--surface);padding:16px 18px;display:flex;flex-direction:column;gap:2px}
.tile .n{font-family:var(--display);font-size:34px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.tile .l{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:600}
.tile.t-good .n{color:var(--good)} .tile.t-warn .n{color:var(--warn)}
.tile.t-alarm .n{color:var(--alarm)} .tile.t-idle .n{color:var(--ink-2)}

/* generic section */
section{display:flex;flex-direction:column;gap:14px}
.cols{display:grid;grid-template-columns:1.35fr 1fr;gap:34px;align-items:start}
@media (max-width:820px){.cols{grid-template-columns:1fr}}

/* ledger rows */
.ledger{display:flex;flex-direction:column;border-top:1px solid var(--line)}
.row{display:flex;gap:14px;align-items:baseline;padding:11px 2px;border-bottom:1px solid var(--line);font-size:14px}
.row .idx{font-family:var(--code);font-size:11.5px;color:var(--ink-3);flex:0 0 26px;text-align:right;padding-top:2px}
.row .t{flex:1;min-width:0}
.row .t strong{font-weight:600}
.row .where{font-family:var(--code);font-size:11px;color:var(--ink-3);white-space:nowrap}
.age{font-family:var(--code);font-size:12px;color:var(--warn);white-space:nowrap;font-variant-numeric:tabular-nums}

.chip{font-family:var(--code);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;
  padding:2px 7px;border-radius:99px;white-space:nowrap;font-weight:500}
.chip.good{background:var(--good-soft);color:var(--good)}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.chip.alarm{background:var(--alarm-soft);color:var(--alarm)}
.chip.idle{background:var(--idle-soft);color:var(--ink-2)}

/* callout card */
.card{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:18px 20px;
  display:flex;flex-direction:column;gap:10px}
.card.flag{border-color:var(--warn);border-left-width:4px}
.card h3{font-size:15px;font-weight:600}
.card p{font-size:13.5px;color:var(--ink-2)}
.stack{display:flex;flex-direction:column;gap:10px}

/* table */
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13px}
th{font-family:var(--display);font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);
  text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap;font-weight:600}
td{padding:9px 14px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
td.num{font-family:var(--code);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink-2)}

/* plain list */
ul.plain{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:var(--ink-2)}
ul.plain li{padding-left:14px;position:relative}
ul.plain li::before{content:"";position:absolute;left:0;top:.62em;width:5px;height:1px;background:var(--ink-3)}

footer{border-top:1px solid var(--line);padding-top:16px;font-size:12.5px;color:var(--ink-3);
  display:flex;flex-direction:column;gap:6px}
</style>`)

P(`<div class="wrap">`)

// masthead
P(`<header class="mast">
  <div>
    <h1>GreenReserve Run Board</h1>
    <p class="sub">Generated from <code>RUN_QUEUE.md</code>, <code>REVISE_QUEUE.md</code>, <code>ADMIN_MASTER_PLAN.md</code> and <code>git log</code>. Nothing here is hand-maintained &mdash; if a line is wrong, the source doc is wrong.</p>
  </div>
  <div class="meta">
    <span>${e(stampStr)}</span><span>${e(d.repo.branch)} @ ${e(d.repo.head)}</span>
    <span>${d.repo.dirtyCount ? d.repo.dirtyCount + ' uncommitted' : 'tree clean'}</span>
  </div>
</header>`)

// drift
if (d.drift.unrecorded.length) {
  P(`<div class="alarm">`)
  P(`<div class="lede">${d.drift.unrecorded.length} run${d.drift.unrecorded.length > 1 ? 's have' : ' has'} shipped that the queue doesn't know about</div>`)
  P(`<p class="note">RUN_QUEUE.md was last committed ${e(d.drift.queueLastCommit.slice(0, 10))}. These commits appear nowhere in it.</p>`)
  P(`<ul>`)
  for (const c of d.drift.unrecorded) {
    const m = (c.matches || [])[0]
    P(`<li><span class="h">${e(c.h)}</span><span>${e(c.subject)}${m ? ` <span class="chip idle">item still reads ${e(m.state)} &middot; line ${m.line}</span>` : ''}</span></li>`)
  }
  P(`</ul></div>`)
}

// tiles
P(`<div class="tiles">
  <div class="tile t-good"><span class="n">${d.counts.runDone}</span><span class="l">Done</span></div>
  <div class="tile t-warn"><span class="n">${d.counts.runAwaiting}</span><span class="l">Awaiting review</span></div>
  <div class="tile t-alarm"><span class="n">${d.counts.runInFlight}</span><span class="l">In flight</span></div>
  <div class="tile t-idle"><span class="n">${d.counts.runNotStarted}</span><span class="l">Not started</span></div>
  <div class="tile t-idle"><span class="n">${d.counts.reviseOpen}</span><span class="l">Revise pages left</span></div>
  <div class="tile t-idle"><span class="n">${d.counts.ideas}</span><span class="l">Ideas parked</span></div>
</div>`)

// uncommitted
if (d.repo.dirtyCount) {
  P(`<section><h2>Working tree right now</h2>`)
  P(`<div class="card${d.repo.looksLikeRunInProgress ? ' flag' : ''}">`)
  if (d.repo.looksLikeRunInProgress) P(`<h3>A build looks mid-run</h3><p>New migration or source files are untracked. Don't run the queue header's <code>git checkout -- .</code> cleanup until this run commits, or the work is gone.</p>`)
  else P(`<h3>Uncommitted changes</h3><p>Docs get committed, source gets discarded &mdash; check what these are first.</p>`)
  P(`<ul class="plain">${d.repo.dirty.map((x) => `<li>${mono(x.trim())}</li>`).join('')}</ul>`)
  P(`</div></section>`)
}

P(`<div class="cols"><div class="stack">`)

// the queue
P(`<section><h2>Not started &mdash; in queue order</h2><div class="ledger">`)
d.next.forEach((i, n) => {
  P(`<div class="row"><span class="idx">${n + 1}</span><span class="t">${e(i.title)}</span><span class="where">:${i.line}</span></div>`)
})
P(`</div></section>`)

// revise
P(`<section><h2>Revise campaign &mdash; page by page</h2>`)
P(`<p class="note">${d.revise.done} pages closed, ${d.revise.open.length} open. One page in flight at a time.</p>`)
P(`<div class="ledger">`)
for (const i of d.revise.open) P(`<div class="row"><span class="t">${e(i.title)}</span><span class="where">:${i.line}</span></div>`)
P(`</div></section>`)

P(`</div><div class="stack">`)

// in flight
if (d.inFlight.length) {
  P(`<section><h2>In flight</h2>`)
  for (const i of d.inFlight) {
    P(`<div class="card flag"><h3>${e(i.title)}</h3>`)
    for (const b of i.body.slice(0, 3)) P(`<p>${e(b.slice(0, 320))}${b.length > 320 ? '&hellip;' : ''}</p>`)
    P(`<p class="note">${mono('RUN_QUEUE.md:' + i.line)}</p></div>`)
  }
  P(`</section>`)
}

// awaiting
P(`<section><h2>Built, not signed off</h2>`)
P(`<p class="note">The box is open because <code>/gr-review</code> hasn't run &mdash; not because the code is missing.</p>`)
P(`<div class="ledger">`)
for (const i of d.awaiting) {
  P(`<div class="row"><span class="t">${e(i.title)}</span><span class="age">${i.ageDays != null ? i.ageDays + 'd' : ''}</span><span class="where">${e(i.hash || '')}</span></div>`)
}
P(`</div></section>`)

// waiting on cam
P(`<section><h2>Waiting on you, not on a build</h2>`)
if (!d.waitingOnCam.length) P(`<p class="note">Nothing blocked on a human decision.</p>`)
else P(`<ul class="plain">${d.waitingOnCam.map((w) => `<li>${e(w.note || w.item)} <span class="where">:${w.line}</span></li>`).join('')}</ul>`)
P(`</section>`)

// parked
P(`<section><h2>Parked, with triggers</h2><ul class="plain">${d.ideas.parked.map((p) => `<li>${e(p)}</li>`).join('')}</ul></section>`)

P(`</div></div>`)

// ideas full width
P(`<section><h2>Ideas &mdash; not specced, not queued</h2><ul class="plain">${d.ideas.bullets.map((b) => `<li>${e(b)}</li>`).join('')}</ul></section>`)

// ideas bank
if (d.bank) {
  P(`<section><h2>Ideas bank &mdash; AUDIT_MASTER.md</h2>`)
  P(`<p class="note">Page-by-page findings and maybes. <strong>Noticed, not scheduled</strong> &mdash; nothing here is queued work until it becomes a RUN_QUEUE item. ${d.bank.totals.sec} security &middot; ${d.bank.totals.money} money-truth &middot; ${d.bank.totals.polish} polish across ${d.bank.pages.length} page blocks.</p>`)
  const hot = d.bank.pages.filter((p) => p.sec + p.money + p.polish > 0 || p.hasIdeas)
    .sort((a, b) => (b.sec * 100 + b.money * 10 + b.polish) - (a.sec * 100 + a.money * 10 + a.polish))
  P(`<div class="tablewrap"><table><thead><tr><th>Page</th><th>Verdict</th><th>Sec</th><th>Money</th><th>Polish</th><th>Ideas</th></tr></thead><tbody>`)
  for (const p of hot) {
    P(`<tr><td>${mono(p.name)}</td><td>${e(p.verdict)}</td>` +
      `<td class="num">${p.sec ? `<span class="chip alarm">${p.sec}</span>` : ''}</td>` +
      `<td class="num">${p.money ? `<span class="chip warn">${p.money}</span>` : ''}</td>` +
      `<td class="num">${p.polish ? `<span class="chip idle">${p.polish}</span>` : ''}</td>` +
      `<td class="num">${p.hasIdeas ? '&bull;' : ''}</td></tr>`)
  }
  P(`</tbody></table></div></section>`)
}

// specs
P(`<section><h2>Spec inventory</h2>`)
P(`<p class="note">Open refs = how many open queue items still point at that spec. Zero and old means consumed.</p>`)
P(`<div class="tablewrap"><table><thead><tr><th>Spec</th><th>Open refs</th><th>Last touched</th></tr></thead><tbody>`)
for (const s of d.specs) {
  P(`<tr><td>${mono(s.file)}</td><td class="num">${s.openRefs || '&mdash;'}</td><td class="num">${e(s.lastTouched)} &middot; ${s.ageDays}d</td></tr>`)
}
P(`</tbody></table></div></section>`)

// commits
P(`<section><h2>Recent commits</h2><div class="tablewrap"><table><tbody>`)
for (const c of d.recentCommits) P(`<tr><td class="num">${e(c.h)}</td><td class="num">${e(c.date)}</td><td>${e(c.subject)}</td></tr>`)
P(`</tbody></table></div></section>`)

P(`<footer><span>Regenerate: <code>node scripts/status.mjs &amp;&amp; node scripts/status-html.mjs</code></span><span>Source of truth stays in the repo docs. This board only reports them.</span></footer>`)
P(`</div>`)

writeFileSync(join(ROOT, 'STATUS.artifact.html'), H.join('\n'), 'utf8')
console.log('STATUS.artifact.html written')
