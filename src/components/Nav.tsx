'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a1f0f]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-white font-black text-xl">
          Green<span className="text-green-400">Reserve</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link href="/dashboard/login" className="text-white/60 hover:text-white text-sm font-medium transition-colors">
            Operator Login
          </Link>
          <Link href="/for-courses" className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
            List Your Course
          </Link>
        </div>

        <button className="md:hidden text-white/70 hover:text-white p-2" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-[#0a1f0f] border-t border-white/10 px-6 py-4 space-y-2">
          <Link href="/dashboard/login" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-white/70 hover:text-white">
            Operator Login
          </Link>
          <Link href="/for-courses" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-sm font-bold bg-green-600 text-white text-center">
            List Your Course
          </Link>
        </div>
      )}
    </nav>
  );
}
