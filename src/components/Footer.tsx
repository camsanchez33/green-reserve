import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-[#071a10] border-t border-white/10 text-white/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-2 md:grid-cols-3 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-md bg-[#c9a84c] flex items-center justify-center">
              <span className="text-white font-black text-xs">GR</span>
            </div>
            <span className="text-white font-bold">Green<span style={{ color: '#c9a84c' }}>Reserve</span></span>
          </div>
          <p className="text-sm leading-relaxed max-w-[200px]">
            Online tee sheets for golf courses. Free to list, no monthly fees.
          </p>
          <p className="text-xs mt-4 text-white/30">$1.50 access fee per player, paid by the golfer.</p>
        </div>

        <div>
          <div className="text-white text-sm font-semibold mb-4">Courses</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/for-courses" className="hover:text-white transition-colors">List Your Course</Link></li>
            <li><Link href="/dashboard/login" className="hover:text-white transition-colors">Operator Login</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-white text-sm font-semibold mb-4">Company</div>
          <ul className="space-y-2.5 text-sm">
            <li><a href="mailto:hello@greenreserve.app" className="hover:text-white transition-colors">hello@greenreserve.app</a></li>
            <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/30">
          <span>© {new Date().getFullYear()} Green Reserve. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
