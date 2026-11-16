'use client';
// AW-11 (Cam 2026-10-22, "per-person access"): Team — everyone with an admin login, what they can do (role) and where
// (areas). Settings → Team (Cam approved the mockup 2026-11-16, lanes/admin/team-mockup.html; lanes/admin.md "Approved,
// to build: Settings → Team"): one Team card, built like My profile's cards; a click opens the person beside the list.
// Only the skin changed: the same GET, POST and PATCH to /api/admin/employees through stepUpFetch (step-up and the
// reason box as before), the same checks and messages. The owner adds people, changes role and areas, resets passwords
// and turns access off; a manager reads the list and a person read-only. The owner can't change themselves.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { stepUpFetch } from '@/lib/step-up-client';
import { ALL_AREAS, type AdminArea } from '@/lib/admin-areas';
import g from '../admin-glass.module.css';
import s from './team.module.css';
import { type Admin, type Tone, roleLabel, initials, areasText, statusOf } from './logic';
import { useConfirm, CopyLink, TempPassword, RoleTiles, AreaTiles, AddDialog } from './TeamDialogs';

const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, 'aria-hidden': true };
const dotClass = (t: Tone) => `${s.dot} ${t === 'ok' ? s.ok : t === 'warn' ? s.warn : ''}`;

export default function TeamPage() {
  const session = useAdminSession();
  const isOwner = session.role === 'owner';
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);

  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [resetPwds, setResetPwds] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; areas: AdminArea[] } | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialog, ask] = useConfirm();

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<Admin[]>('/api/admin/employees', { subject: 'your team' });
      if (!res.ok) { setAdmins([]); setLoadError({ msg: res.message, kind: res.kind }); return; }
      setAdmins(res.data);
      setLoadError(null);
    } catch { setAdmins([]); setLoadError({ msg: 'Network error loading your team. Check your connection and try again.', kind: 'network' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Every change answers on the person; nothing fails quietly (MP-2b).
  async function patch(admin: Admin, key: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(admin.id + key); setRowError(r => ({ ...r, [admin.id]: '' }));
    try {
      const res = await stepUpFetch('/api/admin/employees', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: admin.id, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setRowError(r => ({ ...r, [admin.id]: data.error || 'That didn’t work. Try again.' })); return null; }
      return data;
    } catch {
      setRowError(r => ({ ...r, [admin.id]: 'Network error — nothing was changed. Try again.' }));
      return null;
    } finally { setBusy(null); }
  }

  async function changeRole(admin: Admin, role: string) {
    if (await patch(admin, '_role', { role })) { say(`${admin.name} is now ${roleLabel(role)}.`); load(); }
  }
  async function saveAreas(admin: Admin) {
    if (!editing) return;
    if (editing.areas.length === 0 && !(await ask(`Leave ${admin.name} with no areas?`, 'They’ll only see Home and My profile.', 'Leave with no areas'))) return;
    if (await patch(admin, '_areas', { action: 'areas', areas: editing.areas })) { setEditing(null); say('Saved.'); load(); }
  }
  async function toggleActive(admin: Admin) {
    const ok = admin.active
      ? await ask(`Turn off ${admin.name}?`, 'They’re signed out everywhere and can’t sign in until you turn them back on. Nothing they did is deleted.', 'Turn off')
      : await ask(`Turn ${admin.name} back on?`, 'They can sign in again with their own password.', 'Turn back on', false);
    if (!ok) return;
    if (await patch(admin, '_active', { active: !admin.active })) { say(admin.active ? 'Turned off.' : 'Turned back on.'); load(); }
  }
  async function resetPassword(admin: Admin) {
    if (!(await ask(`Reset ${admin.name}’s password?`, 'They’ll use a new one-time password and set their own when they next sign in.', 'Reset password'))) return;
    const data = await patch(admin, '_reset', { action: 'reset_password' });
    if (data?.tempPassword) { setResetPwds(p => ({ ...p, [admin.id]: String(data.tempPassword) })); load(); }
  }

  const open = admins.find(a => a.id === sel) ?? null;
  // On a phone the person opens under the list: bring it into view.
  const detRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sel && window.matchMedia('(max-width: 900px)').matches) detRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sel]);
  const pick = (id: string) => { setSel(cur => (cur === id ? null : id)); setEditing(null); };

  let detail = null;
  if (open) {
    const a = open;
    const me = a.id === session.adminId;
    // As before: the owner can change anyone but themselves; areas don't apply to an owner.
    const canEdit = isOwner && !me;
    const canAreas = canEdit && a.role !== 'owner';
    const st = statusOf(a);
    const locked = !!busy;
    detail = (
      <section ref={detRef} className={`${g.glass} ${s.det}`} aria-labelledby="tm-person">
        <button type="button" className={s.x} onClick={() => { setSel(null); setEditing(null); }} aria-label="Close">
          <svg {...ICON}><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <div className={s.dh}>
          <span className={`${s.av} ${s.avBig} ${a.active ? '' : s.avOff}`} aria-hidden="true">{initials(a.name)}</span>
          <div><h3 id="tm-person">{a.name}</h3><p>{a.email}</p></div>
        </div>
        <div className={s.kv}><span>Status</span><b><span className={dotClass(st.tone)} aria-hidden="true" />{st.detail}</b></div>
        {a.mustChangePassword && <div className={s.kv}><span>Password</span><b>Hasn’t set their own yet</b></div>}

        <div className={s.sec}>
          <div className={s.lab}>Role</div>
          {canEdit && a.role !== 'owner'
            ? <RoleTiles value={a.role} onPick={r => changeRole(a, r)} disabled={locked} label={`${a.name}’s role`} />
            : <p className={s.val}>{roleLabel(a.role)}{a.role === 'owner' ? ' · everything, everywhere' : ''}</p>}
        </div>

        {a.role !== 'owner' && (
          <div className={s.sec}>
            <div className={s.sech}>
              <div className={s.lab}>Can open</div>
              {canAreas && editing?.id !== a.id && <button type="button" className={s.lnk} onClick={() => setEditing({ id: a.id, areas: a.areas ?? ALL_AREAS })}>Change</button>}
            </div>
            {editing?.id === a.id ? (
              <>
                <AreaTiles idPrefix={`areas-${a.id}`} value={editing.areas} onChange={v => setEditing({ id: a.id, areas: v })} disabled={locked} />
                <div className={s.line}>
                  <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => saveAreas(a)} disabled={locked}>{busy === a.id + '_areas' ? 'Saving…' : 'Save'}</button>
                  <button type="button" className={s.lnk} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : <p className={s.val}>{areasText(a)}</p>}
          </div>
        )}

        {rowError[a.id] && <p role="alert" className={`${s.msg} ${s.msgBad}`}><span className={`${s.dot} ${s.bad}`} aria-hidden="true" />{rowError[a.id]}</p>}
        {resetPwds[a.id] && (
          <TempPassword label={`New password for ${a.name.split(' ')[0]}`} pwd={resetPwds[a.id]} note="Shown once. Give it to them; they set their own when they sign in.">
            <div className={s.line}>
              <CopyLink text={resetPwds[a.id]} />
              <button type="button" className={s.lnk} onClick={() => setResetPwds(p => { const n = { ...p }; delete n[a.id]; return n; })}>Dismiss</button>
            </div>
          </TempPassword>
        )}

        {isOwner && (
          <div className={s.acts}>
            <Link href={`/admin/audit?admin=${a.id}`} className={s.lnk}>What they did</Link>
            {canEdit && <button type="button" className={s.lnk} onClick={() => resetPassword(a)} disabled={locked}>{busy === a.id + '_reset' ? 'Resetting…' : 'Reset password'}</button>}
            {canEdit && <span className={s.spring} />}
            {canEdit && <button type="button" className={`${s.lnk} ${a.active ? s.lnkBad : ''}`} onClick={() => toggleActive(a)} disabled={locked}>{busy === a.id + '_active' ? 'Saving…' : a.active ? 'Turn off' : 'Turn back on'}</button>}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <AdminSidebar active="employees" />
      <main className={g.main}>
        <div className={g.head}><h1>Team</h1></div>
        {loadError && (
          <div className={`${g.glass} ${s.problem}`} role="alert">
            <span>{loadError.msg}</span>
            {loadError.kind === 'unauthorized' ? <Link href="/admin/login" className={s.btn}>Sign in</Link>
              : loadError.kind === 'forbidden' ? null : <button type="button" className={s.btn} onClick={() => load()} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}
        {!loadError && (
          <div className={`${s.grid} ${open ? s.has : ''}`}>
            <section className={`${g.glass} ${s.card}`} aria-labelledby="tm-team">
              <div className={s.ch}>
                <div><h2 id="tm-team">Team</h2><p>Everyone with an admin login. The role says how much they can do; areas say where.</p></div>
                {isOwner && <button type="button" className={s.plus} onClick={() => setAdding(true)} aria-label="Add someone" title="Add someone"><svg {...ICON}><path d="M12 5v14M5 12h14" /></svg></button>}
              </div>
              {loading && admins.length === 0 && <p className={s.empty}>Loading…</p>}
              {admins.map(a => {
                const st = statusOf(a);
                return (
                  <button key={a.id} type="button" className={`${s.row} ${sel === a.id ? s.sel : ''}`} onClick={() => pick(a.id)} aria-expanded={sel === a.id}>
                    <span className={`${s.av} ${a.active ? '' : s.avOff}`} aria-hidden="true">{initials(a.name)}</span>
                    <span className={s.nm}><b>{a.name}{a.id === session.adminId && <small>· you</small>}</b><small>{a.email}</small></span>
                    <span className={s.role}>{roleLabel(a.role)}</span>
                    <span className={s.rst}><span className={dotClass(st.tone)} aria-hidden="true" />{st.row}</span>
                  </button>
                );
              })}
            </section>
            {detail}
          </div>
        )}
      </main>
      {adding && <AddDialog onClose={() => setAdding(false)} onAdded={() => load()} />}
      {dialog}
      {toast && <div className={s.toast} role="status">{toast}</div>}
    </>
  );
}
