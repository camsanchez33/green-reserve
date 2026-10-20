import Image from 'next/image';

// Cam 2026-10-20: the operator sign-in pages (sign in, two-step code, forgot and
// reset password) share one look — the homepage photo full screen, the cream
// logo on it, and the page's white card under the logo. Children go under the
// logo: the card, then any help links (use AUTH_PHOTO_LINKS for their text).
export const AUTH_PHOTO_LINKS = 'text-[12.5px] text-[#F6F4EC]/90 [text-shadow:0_1px_2px_rgba(0,0,0,.45)]';
export const AUTH_PHOTO_LINK = 'text-[#F6F4EC] font-semibold underline underline-offset-2';

export function AuthPhotoShell({ children, width = 'sm' }: { children: React.ReactNode; width?: 'sm' | 'md' }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#2B3A2E]">
      <Image src="/home/hero-coast.jpg" alt="" fill priority sizes="100vw" quality={55} className="object-cover" />
      {/* A scrim, darker toward the bottom where the card sits, so the logo and the help links read. */}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,14,11,.25)_0%,rgba(10,14,11,.35)_45%,rgba(10,14,11,.6)_100%)]" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <Image src="/brand/logo-cream.svg" unoptimized alt="GreenReserve" width={1530} height={286} priority className="w-[min(300px,72vw)] h-auto [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.35))]" />
        <div className={(width === 'md' ? 'max-w-md' : 'max-w-sm') + ' w-full mt-9'}>{children}</div>
      </div>
    </div>
  );
}
