import type { Metadata } from 'next';
import { loadDocument } from '@/lib/agreements';

export const metadata: Metadata = {
  title: 'Operator Agreement',
  description: 'The agreement between GreenReserve and golf courses listing on the platform — fees, liability, data, and termination.',
};

// AG-1: this page renders legal/documents/operator-agreement/<current>.md —
// the same Markdown a course signs and the PDF is made from. Edit the
// Markdown, never this file, to change the agreement. Chrome (sub-nav, short
// version box, numbered sections) is the U-M public-look treatment.

const navLink = 'border-l-2 pl-3 py-1.5 text-sm transition-colors';
const navActive = `${navLink} border-pine text-pine font-medium`;
const navIdle = `${navLink} border-transparent text-ink-soft hover:text-ink hover:border-line-strong`;

function monthLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function OperatorAgreementPage() {
  const doc = loadDocument('operator_agreement');
  const updated = monthLabel(doc.effectiveAt);
  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-14">

          {/* Legal sub-nav */}
          <aside className="mb-12 lg:mb-0">
            <div className="lg:sticky lg:top-8">
              <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Legal</p>
              <nav className="flex flex-col">
                <a href="/terms" className={navIdle}>Terms of Service</a>
                <a href="/privacy" className={navIdle}>Privacy Policy</a>
                <a href="/operator-agreement" className={navActive}>Operator Agreement</a>
              </nav>
              <p className="mt-6 pl-3 text-xs text-ink-faint leading-relaxed">
                Version v{doc.version}<br />Last updated {updated}
              </p>
            </div>
          </aside>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight text-ink mb-3">{doc.title}</h1>
            <p className="text-ink-muted text-sm mb-10">Version v{doc.version} — last updated {updated}</p>

            {/* Plain-English summary — from the document's own front matter */}
            {doc.summary.length > 0 && (
              <div className="bg-white border border-line rounded-lg p-6 mb-12">
                <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">The short version</p>
                <ul className="space-y-2.5 text-sm text-ink-soft leading-relaxed">
                  {doc.summary.map((line, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="text-ink-faint shrink-0" aria-hidden="true">—</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 pt-4 border-t border-line-soft text-xs text-ink-faint leading-relaxed">
                  A plain-English summary, for orientation only. The numbered sections below are the agreement that actually applies.
                </p>
              </div>
            )}

            <div
              className="legal-doc text-ink-soft leading-relaxed space-y-4 [&_h2]:font-semibold [&_h2]:text-base [&_h2]:text-ink [&_h2]:mt-10 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:text-ink [&_h3]:mt-8 [&_h3]:mb-2 [&_strong]:text-ink [&_a]:text-pine [&_a]:font-medium hover:[&_a]:underline [&_hr]:border-line [&_hr]:my-8 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />

            <p className="mt-12 pt-6 border-t border-line text-[11px] text-ink-faint">
              Document hash (sha256) {doc.hash.slice(0, 16)}… — the exact text a course signs is archived by this hash.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
