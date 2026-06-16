import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-[#071a10] border-t border-white/10 text-white/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-md bg-[#c9a84c] flex items-center justify-center">
              <span className="text-white font-black text-xs">GR</span>
            </div>
            <span className="text-white font-bold">Green<span style={{ color: '#c9a84c' }}>Reserve</span></span>
          </div>
          <p className="text-sm leading-relaxed max-w-[200px]">
            Golf&apos;s transparent discovery layer. Find tee times. Book direct.
          </p>
          <p className="text-xs mt-4 text-white/30">$1 access fee per booking.</p>
        </div>

        <div>
          <div className="text-white text-sm font-semibold mb-4">Golfers</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/courses" className="hover:text-white transition-colors">Find a Course</Link></li>
            <li><Link href="/how-it-works" className="hover:text-white transition-colors">How It Works</Link></li>
            <li><Link href="/courses?type=public" className="hover:text-white transition-colors">Public Courses</Link></li>
            <li><Link href="/courses?type=semi-private" className="hover:text-white transition-colors">Semi-Private</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-white text-sm font-semibold mb-4">Courses</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/for-courses" className="hover:text-white transition-colors">Why List With Us</Link></li>
            <li><Link href="/for-courses#get-listed" className="hover:text-white transition-colors">Get Listed</Link></li>
            <li><Link href="/for-courses#faq" className="hover:text-white transition-colors">Course FAQ</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-white text-sm font-semibold mb-4">Company</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
            <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            <li><a href="mailto:hello@greenreserve.com" className="hover:text-white transition-colors">hello@greenreserve.com</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/30">
          <span>© {new Date().getFullYear()} Green Reserve. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
