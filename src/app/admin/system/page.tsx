'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HardDrive, Clock3, Zap, GitBranch, Bug, ExternalLink } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface SystemData {
  lastStripeTouch: { courseName: string; updatedAt: string } | null;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SystemCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-ink-muted">{icon}</span>
        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{title}</div>
      </div>
      {children}
    </div>
  );
}

export default function AdminSystemPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [data, setData] = useState<SystemData | null>(null);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      return r.json();
    }).then(d => { if (d) setAdminReady(true); }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (!adminReady) return;
    fetch('/api/admin/system', { headers: { 'Content-Type': 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, [adminReady]);

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="system" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-3xl">
          <div className="mb-7">
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">System</h1>
            <p className="text-sm text-ink-soft mt-0.5">30-second health check — backups, crons, webhooks, CI, errors.</p>
          </div>

          <div className="space-y-4">
            <SystemCard icon={<HardDrive className="w-3.5 h-3.5"/>} title="Backups">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">Not tracked in-app — verify the nightly workflow ran in GitHub Actions.</span>
              </div>
              <a href="https://github.com/camsanchez33/green-reserve/actions/workflows/db-backup.yml" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover">
                View backup runs <ExternalLink className="w-3 h-3"/>
              </a>
            </SystemCard>

            <SystemCard icon={<Clock3 className="w-3.5 h-3.5"/>} title="Crons">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">No per-run heartbeat markers yet — that needs a CronRunLog table, which is a schema change (candidate for the expense-tracker migration batch). Until then, check the Vercel dashboard.</span>
              </div>
              <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover">
                Open Vercel dashboard <ExternalLink className="w-3 h-3"/>
              </a>
            </SystemCard>

            <SystemCard icon={<Zap className="w-3.5 h-3.5"/>} title="Stripe Webhook">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">
                  {data?.lastStripeTouch
                    ? <>Most recent Stripe-linked course update: <strong className="text-ink">{data.lastStripeTouch.courseName}</strong>, {fmtDate(data.lastStripeTouch.updatedAt)}</>
                    : 'No Stripe-connected courses yet.'}
                </span>
              </div>
              <p className="text-xs text-ink-faint mb-2">Approximate — we don’t log raw webhook receipts, this is the course record’s own updatedAt.</p>
              <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover">
                Open Stripe webhooks <ExternalLink className="w-3 h-3"/>
              </a>
            </SystemCard>

            <SystemCard icon={<GitBranch className="w-3.5 h-3.5"/>} title="CI">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">Not polled in-app — check the latest GitHub Actions run.</span>
              </div>
              <a href="https://github.com/camsanchez33/green-reserve/actions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover">
                View CI runs <ExternalLink className="w-3 h-3"/>
              </a>
            </SystemCard>

            <SystemCard icon={<Bug className="w-3.5 h-3.5"/>} title="Sentry">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">Error tracking is wired in (client + server) — check Sentry for recent issues.</span>
              </div>
              <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover">
                Open Sentry <ExternalLink className="w-3 h-3"/>
              </a>
            </SystemCard>
          </div>
        </div>
      </div>
    </div>
  );
}
