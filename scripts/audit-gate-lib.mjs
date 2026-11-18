// SEC-4 (Cam 2026-11-18: "Allow it until Dec 15"). Pure logic for the Package
// flaws gate (scripts/audit-gate.mjs); scripts/audit-gate-test.ts tests it.

const BLOCKING = new Set(['high', 'critical']);
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function advisoryId(url) {
  const m = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(String(url || ''));
  return m ? m[0].toLowerCase() : null;
}

// A real calendar day in YYYY-MM-DD (rejects 2026-12-99, "Dec 15").
export function isDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isBlocking = (sev) => BLOCKING.has(String(sev || '').toLowerCase());

// audit = parsed `npm audit --json`, allowlist = parsed .github/audit-allowlist.json,
// today = 'YYYY-MM-DD' (UTC). An entry is good through its `expires` day and
// covers one advisory on one package. Returns { ok, problems, allowed }.
export function evaluate(audit, allowlist, today) {
  const problems = [];
  const allowed = [];
  if (!isDay(today)) return { ok: false, problems: [`today must be a YYYY-MM-DD day, got ${JSON.stringify(today)}`], allowed };
  if (!audit || typeof audit !== 'object' || audit.error || audit.auditReportVersion !== 2 || typeof audit.vulnerabilities !== 'object' || audit.vulnerabilities === null || Array.isArray(audit.vulnerabilities)) {
    return { ok: false, problems: ['npm audit did not return a usable result: ' + JSON.stringify(audit && audit.error ? audit.error : audit).slice(0, 300)], allowed };
  }
  const entries = Array.isArray(allowlist && allowlist.entries) ? allowlist.entries : null;
  if (!entries) return { ok: false, problems: ['allowlist has no entries array'], allowed };

  const active = new Map();
  for (const e of entries) {
    const id = advisoryId(e && e.id);
    if (!id || !e.package || !Object.hasOwn(RANK, e.severity) || !isDay(e.expires) || !e.reason || !e.approved) {
      problems.push(`allowlist entry ${JSON.stringify(e)} needs an id (GHSA-…), a package, the approved severity, a real expires date (YYYY-MM-DD), a reason and an approval`);
      continue;
    }
    if (today > e.expires) {
      problems.push(`allowlist entry ${e.id} expired on ${e.expires}; remove it or get it re-approved`);
      continue;
    }
    active.set(`${id}|${e.package}`, e);
  }

  const vulns = audit.vulnerabilities;
  // Every blocking advisory object, keyed by advisory + the package it is on.
  const seen = new Map();
  for (const [pkg, v] of Object.entries(vulns)) {
    for (const via of v && Array.isArray(v.via) ? v.via : []) {
      if (!via || typeof via !== 'object') continue;
      // An advisory with no severity of its own takes its package's.
      if (!isBlocking(via.severity ?? v.severity)) continue;
      const id = advisoryId(via.url) || `no-ghsa:${via.source ?? via.title ?? 'unknown'}`;
      const key = `${id}|${pkg}`;
      const sev = String(via.severity ?? v.severity).toLowerCase();
      const prev = seen.get(key);
      // The same advisory listed twice on one package keeps its higher rating.
      if (!prev || (RANK[sev] ?? 99) > (RANK[prev.sev] ?? 99)) seen.set(key, { id, pkg, sev, title: via.title, url: via.url });
    }
  }

  // npm's own verdict must be explained: every package npm rates high or
  // critical has to lead (through its `via` chain) to a blocking advisory above.
  // The advisory found must be rated at least as high as the package itself.
  const leadsToBlocking = (start, need) => {
    const stack = [start];
    const visited = new Set();
    while (stack.length) {
      const name = stack.pop();
      if (visited.has(name)) continue;
      visited.add(name);
      const v = vulns[name];
      for (const via of v && Array.isArray(v.via) ? v.via : []) {
        if (typeof via === 'string') stack.push(via);
        else if (via && typeof via === 'object' && isBlocking(via.severity ?? v.severity) && (RANK[String(via.severity ?? v.severity).toLowerCase()] ?? -1) >= need) return true;
      }
    }
    return false;
  };
  for (const [pkg, v] of Object.entries(vulns)) {
    if (v && isBlocking(v.severity) && !leadsToBlocking(pkg, RANK[String(v.severity).toLowerCase()])) {
      problems.push(`npm rates ${pkg} ${v.severity} but no high or critical advisory explains it`);
    }
  }
  // npm's counts are packages per severity; they must match the list it gave.
  const counts = audit.metadata && audit.metadata.vulnerabilities;
  if (!counts || typeof counts !== 'object') {
    problems.push('npm audit result has no metadata.vulnerabilities counts');
  } else {
    for (const sev of BLOCKING) {
      const listed = Object.values(vulns).filter((v) => v && String(v.severity || '').toLowerCase() === sev).length;
      if ((Number(counts[sev]) || 0) !== listed) problems.push(`npm counts ${counts[sev] || 0} ${sev} but lists ${listed}`);
    }
  }

  for (const [key, a] of seen) {
    const e = active.get(key);
    if (e && (RANK[a.sev] ?? 99) > RANK[e.severity]) problems.push(`${a.id} on ${a.pkg} is now ${a.sev}; the allowlist approved only ${e.severity}`);
    else if (e) allowed.push(`${a.id} on ${a.pkg} (${a.sev}) allowed until ${e.expires}`);
    else problems.push(`${a.sev}: ${a.pkg} ${a.title || ''} ${a.url || a.id}`.replace(/\s+/g, ' ').trim());
  }
  // An entry that matches nothing means the flaw is fixed (remove the entry)
  // or the audit came back empty (which must not read as clean).
  for (const [key, e] of active) {
    if (!seen.has(key)) problems.push(`allowlist entry ${e.id} on ${e.package} matches nothing in the audit: remove it if fixed, or the audit came back empty`);
  }
  return { ok: problems.length === 0, problems, allowed };
}
