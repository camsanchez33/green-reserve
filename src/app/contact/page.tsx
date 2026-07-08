import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact — GreenReserve',
  description: 'Get in touch with the GreenReserve team. Questions about listing your course or using our platform — we\'re happy to help.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-24">
        <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-3">Contact</p>
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-4">Get in touch</h1>
        <p className="text-ink-soft text-base leading-relaxed mb-10">
          We&apos;re a small team and respond to every message. Whether you have a question about
          listing your course, a booking issue, or just want to learn more — email us directly.
        </p>

        <a
          href="mailto:hello@greenreserve.app"
          className="inline-flex items-center gap-3 bg-pine hover:bg-pine-hover text-white px-7 py-4 rounded-md font-medium text-sm transition-colors"
        >
          <Mail size={16} />
          hello@greenreserve.app
        </a>

        <div className="mt-16 border-t border-line pt-10">
          <p className="text-ink-muted text-sm mb-6">Interested in listing your course?</p>
          <Link
            href="/for-courses"
            className="inline-flex items-center gap-2 text-sm font-medium text-pine hover:text-pine-hover transition-colors"
          >
            Submit interest form <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
