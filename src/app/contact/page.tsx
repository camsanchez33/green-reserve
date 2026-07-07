import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact — GreenReserve',
  description: 'Get in touch with the GreenReserve team. Questions about listing your course or using our platform — we\'re happy to help.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-24">
        <p className="text-[11px] uppercase tracking-[0.06em] text-gray-400 font-medium mb-3">Contact</p>
        <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-4">Get in touch</h1>
        <p className="text-gray-500 text-base leading-relaxed mb-10">
          We&apos;re a small team and respond to every message. Whether you have a question about
          listing your course, a booking issue, or just want to learn more — email us directly.
        </p>

        <a
          href="mailto:hello@greenreserve.app"
          className="inline-flex items-center gap-3 bg-gray-900 hover:bg-black text-white px-7 py-4 rounded-md font-semibold text-sm transition-colors"
        >
          <Mail size={16} />
          hello@greenreserve.app
        </a>

        <div className="mt-16 border-t border-gray-100 pt-10">
          <p className="text-gray-400 text-sm mb-6">Interested in listing your course?</p>
          <Link
            href="/for-courses"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-600 transition-colors"
          >
            Submit interest form <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
