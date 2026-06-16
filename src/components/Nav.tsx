'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    { href: '/courses', label: 'Find a Course' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/for-courses', label: 'For Courses' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f2218]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-[#c9a84c] flex items-center justify-center">
            <span className="text-white font-black text-sm">GR</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            Green<span style={{ color: '#c9a84c' }}>Reserve</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(l.href)
                  ? 'bg-white/15 text-white'
                  : 'text-white/65 hover:text-white hover:bg-white/10'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/for-courses#get-listed"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[#c9a84c] border border-[#c9a84c]/40 hover:border-[#c9a84c] hover:bg-[#c9a84c]/10 transition-all"
          >
            List Your Course
          </Link>
          <Link
            href="/courses"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#c9a84c] text-white hover:bg-[#b8942a] transition-colors"
          >
            Book a Tee Time
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-white/70 hover:text-white p-2"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-[#0f2218] border-t border-white/10 px-4 py-4 space-y-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <Link
              href="/courses"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 rounded-lg text-sm font-semibold bg-[#c9a84c] text-white text-center"
            >
              Book a Tee Time
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
