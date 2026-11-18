#!/usr/bin/env node
/**
 * GreenReserve releases (docs/RELEASES.md, Build OK 2026-11-18).
 *
 *   node scripts/release.mjs changelog [--since GRV-1.0] [--ref origin/main]
 *       Prints a DRAFT changelog section from the commit titles since the last GRV tag.
 *       Writes nothing: Build rewrites the draft in plain words for courses in CHANGELOG.md.
 *
 *   node scripts/release.mjs check --url https://greenreserve.app [--slug <test course> --course-name <its name>] [--expect-sha <sha>]
 *       Read-only post-deploy check: health (retried up to 2 min), home page, a TEST course page,
 *       the two sign-in pages, and that a cron refuses a caller without the secret.
 *       Writes nothing, books nothing. Exit 1 on any failure: roll back first, debug after.
 *
 *   node scripts/release.mjs tag GRV-1.1
 *       Tags the merge commit at origin/main with an annotated tag and pushes the tag.
 *       Refuses unless: the name is GRV-<major>.<minor>[.<patch>], the tag doesn't exist yet,
 *       the commit is exactly origin/main, and CHANGELOG.md on that commit has a "## GRV 1.1" section.
 *
 * No secrets, no database, no Vercel token: it only reads public pages and runs git.
 */
import { execFileSync } from 'node:child_process';

const TAG_RE = /^GRV-(\d+)\.(\d+)(?:\.(\d+))?$/;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function opt(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) die(`--${name} needs a value`);
  return v;
}

function die(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

/** Newest GRV tag reachable from ref, or null before the first release. */
function lastTag(ref) {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'GRV-*', ref);
  } catch {
    return null;
  }
}

/** "GRV-1.1" → "GRV 1.1", the heading form used in CHANGELOG.md. */
function heading(tag) {
  return tag.replace(/^GRV-/, 'GRV ');
}

// ---------------------------------------------------------------- changelog
function changelog(args) {
  const ref = opt(args, 'ref', 'origin/main');
  const since = opt(args, 'since', lastTag(ref));
  const range = since ? `${since}..${ref}` : ref;
  // First-parent only: on main that is one line per squash merge or release merge.
  const subjects = git('log', '--first-parent', '--format=%s', range).split('\n').filter(Boolean);
  const lines = [];
  let behind = 0;
  for (const s of subjects) {
    if (/^queue\/spec update|^Merge (branch|pull request)|^Release GRV-/i.test(s)) continue;
    if (/^(Fix|Test|Tests|CI|Chore)\b|flaky|main's (tsc|tests)/i.test(s)) { behind += 1; continue; }
    lines.push(`- ${s.replace(/\s*\(#\d+\)(\s*\(#\d+\))*\s*$/, '')}`);
  }
  console.log(`DRAFT: ${subjects.length} commits ${since ? `since ${since}` : 'in history'} on ${ref}. Rewrite every line in course words before it goes in CHANGELOG.md.\n`);
  console.log('## GRV x.y (Month D, YYYY)');
  for (const l of lines) console.log(l);
  if (behind) console.log(`- Behind-the-scenes fixes. (${behind} commits: fixes, tests, CI; check none is something a course would notice)`);
}

// ---------------------------------------------------------------- check
async function get(url, { redirect = 'manual' } = {}) {
  const res = await fetch(url, { redirect, headers: { 'user-agent': 'greenreserve-release-check' }, signal: AbortSignal.timeout(20_000) });
  const body = await res.text();
  return { status: res.status, body };
}

async function check(args) {
  const base = opt(args, 'url', null)?.replace(/\/+$/, '');
  if (!base || !/^https?:\/\//.test(base)) die('check needs --url https://…');
  // A TEST course on the target (isTest, never a real course). An unknown slug still answers 200 with the
  // generic title, so the check needs the course's name in <title> to prove the course page really rendered.
  // Optional (Build 2026-11-18): production has no named test course until after the launch wipe.
  const slug = opt(args, 'slug', null);
  const courseName = opt(args, 'course-name', null);
  if (slug && !courseName) die('--slug needs --course-name (the test course\'s name, checked in <title>)');
  const expectSha = opt(args, 'expect-sha', null);
  const results = [];
  const record = (name, ok, note) => {
    results.push({ name, ok, note });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
  };

  // 1. Health, retried: right after a merge the new build may still be going live.
  let health = null;
  const until = Date.now() + 120_000;
  for (;;) {
    try {
      const r = await get(`${base}/api/health`);
      const j = JSON.parse(r.body);
      health = { status: r.status, ...j };
      const shaOk = !expectSha || (typeof j.commit === 'string' && j.commit && expectSha.startsWith(j.commit));
      if (r.status === 200 && j.ok === true && j.db === 'up' && shaOk) break;
    } catch (e) {
      health = { error: String(e?.message ?? e) };
    }
    if (Date.now() > until) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  const healthOk = health?.status === 200 && health.ok === true && health.db === 'up';
  record('/api/health ok and db up', healthOk, health?.error ?? `status ${health?.status}, db ${health?.db}`);
  if (expectSha) {
    const live = typeof health?.commit === 'string' ? health.commit : null;
    record('live build is the expected commit', !!live && expectSha.startsWith(live),
      live ? `live ${live}, expected ${expectSha.slice(0, 7)}${live && !expectSha.startsWith(live) ? ' (a rolled-back or older build is live: Undo Rollback / promote?)' : ''}` : 'health has no commit field');
  }

  // 2. Pages. Only the test course; never a real course's pages.
  if (!slug) console.log('SKIP  course check skipped (no --slug given)');
  const pages = [
    ['home page', '/', null],
    ...(slug ? [[`test course page /courses/${slug}`, `/courses/${slug}`, courseName]] : []),
    ['course staff sign-in page', '/dashboard/login', null],
    ['admin sign-in page', '/admin/login', null],
  ];
  for (const [name, path, mustTitle] of pages) {
    try {
      const r = await get(`${base}${path}`);
      const broken = /Application error|Internal Server Error/i.test(r.body);
      const title = (r.body.match(/<title>([^<]*)/i) ?? [])[1] ?? '';
      const titleOk = !mustTitle || title.includes(mustTitle);
      record(name, r.status === 200 && !broken && titleOk,
        `status ${r.status}${broken ? ', error page' : ''}${titleOk ? '' : `, title "${title}" lacks "${mustTitle}" (wrong --slug/--course-name, or the course didn't render)`}`);
    } catch (e) {
      record(name, false, String(e?.message ?? e));
    }
  }

  // 3. A cron refuses a caller without the secret. 503 means CRON_SECRET is missing on this deployment.
  try {
    const r = await get(`${base}/api/cron/hourly`);
    record('cron refuses without the secret', r.status === 401, r.status === 503 ? 'status 503: CRON_SECRET is not set here' : `status ${r.status}`);
  } catch (e) {
    record('cron refuses without the secret', false, String(e?.message ?? e));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} check(s) failed on ${base}. Roll back first (Vercel: Instant Rollback), debug after.` : `\nAll ${results.length} checks passed on ${base}.`);
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------- tag
function tag(args) {
  const name = args[0];
  if (!name || !TAG_RE.test(name)) die('tag needs a name like GRV-1.1 or GRV-1.0.1');
  git('fetch', '--quiet', '--tags', 'origin', 'main');
  if (git('tag', '--list', name)) die(`${name} already exists`);
  const commit = git('rev-parse', 'origin/main');
  let notes = '';
  try {
    notes = git('show', `${commit}:CHANGELOG.md`);
  } catch {
    die('CHANGELOG.md is not on origin/main');
  }
  const head = `## ${heading(name)}`;
  const start = notes.split('\n').findIndex((l) => l === head || l.startsWith(`${head} `));
  if (start === -1) die(`CHANGELOG.md on origin/main has no "${head}" section; release PR first, tag after`);
  const prev = lastTag(commit);
  git('tag', '-a', name, commit, '-m', `${heading(name)}${prev ? ` (after ${prev})` : ''}`);
  git('push', 'origin', `refs/tags/${name}`);
  console.log(`Tagged ${name} at ${commit.slice(0, 7)} and pushed it.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'changelog') changelog(rest);
else if (cmd === 'check' || cmd === 'smoke') await check(rest);
else if (cmd === 'tag') tag(rest);
else die('usage: release.mjs changelog [--since TAG] | check --url URL [--slug SLUG --course-name NAME] [--expect-sha SHA] | tag GRV-x.y[.z]');
