'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">
          Green<span className="text-emerald-400">Reserve</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <Link href="/#how-it-works" className="text-white/50 hover:text-white text-sm px-3 py-2 rounded transition-colors">
            How It Works
          </Link>
          <Link href="/#pricing" className="text-white/50 hover:text-white text-sm px-3 py-2 rounded transition-colors">
            Pricing
          </Link>
          <Link href="/#faq" className="text-white/50 hover:text-white text-sm px-3 py-2 rounded transition-colors">
            FAQ
          </Link>
          <Link href="/dashboard/login" className="text-white/50 hover:text-white text-sm px-3 py-2 rounded transition-colors">
            Operator Login
          </Link>
          <Link href="/for-courses" className="ml-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded transition-colors">
            List Your Course
          </Link>
        </div>

        <button className="md:hidden text-white/60 hover:text-white p-2" onClick={() => setOpen(!open)}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-black border-t border-white/10">
          <div className="px-6 py-4 flex flex-col gap-1">
            <Link href="/#how-it-works" onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-sm py-2">How It Works</Link>
            <Link href="/#pricing" onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-sm py-2">Pricing</Link>
            <Link href="/#faq" onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-sm py-2">FAQ</Link>
            <Link href="/dashboard/login" onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-sm py-2">Operator Login</Link>
            <Link href="/for-courses" onClick={() => setOpen(false)} className="mt-2 bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded text-center">List Your Course</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
