// BOOKING-LOOK-1: manage, the tee-time pay page and the receipt wear the course look (visual only).
// Run: npx tsx scripts/golfer-look-pages-test.ts
import { readFileSync } from 'fs';
import { lookSiteVars, lookBandHex, DARK_STATUS } from '../src/components/golfer/look';
import { BOOKING_ACCENT_COLOURS } from '../src/lib/booking-look';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const v = (x: object) => x as Record<string, string>;

// The tokens
const none = v(lookSiteVars({ booking_look: null, brand_color: '#7A1F2B' }));
check('no look picked: no site token changes (today\'s light page), the band is brand_color', !Object.keys(none).some(k => k.startsWith('--color-')) && lookBandHex({ booking_look: null, brand_color: '#7A1F2B' }) === '#7A1F2B');
const lightBlue = v(lookSiteVars({ booking_look: { look: 'light', accent: 'blue' }, brand_color: '#7A1F2B' }));
check('Light + a preset: the accent replaces pine, the neutrals stay light', lightBlue['--color-pine'] === BOOKING_ACCENT_COLOURS.blue.light.acc && !('--color-paper' in lightBlue) && !('--color-ink' in lightBlue));
const darkGreen = v(lookSiteVars({ booking_look: { look: 'dark', accent: 'green' }, brand_color: '#7A1F2B' }));
check('Dark: the neutrals, the accent and the status colours swap to the dark values', darkGreen['--color-paper'] === '#111211' && darkGreen['--color-card'] === '#222422' && darkGreen['--color-ink'] === '#EDEEEB' && darkGreen['--color-line'] === '#343734' && darkGreen['--color-pine'] === BOOKING_ACCENT_COLOURS.green.dark.acc && darkGreen['--color-bad'] === DARK_STATUS['--color-bad']);
check('a bad look never reaches CSS (falls back to today\'s light page)', !Object.keys(v(lookSiteVars({ booking_look: { look: 'sepia' as never, accent: 'red' as never }, brand_color: 'javascript:x' }))).some(k => k.startsWith('--color-')));

const pages = {
  manage: readFileSync('src/app/manage/[bookingId]/page.tsx', 'utf8'),
  checkin: readFileSync('src/app/checkin/[bookingId]/page.tsx', 'utf8'),
  receipt: readFileSync('src/app/receipt/[bookingId]/page.tsx', 'utf8'),
};
for (const [name, src] of Object.entries(pages)) {
  check(`${name}: reads booking_look (accent null = no look) into lookSiteVars`, src.includes("booking_look?: { look?: 'light' | 'dark'; accent?: BookingAccent | null } | null;") && src.includes('lookSiteVars('));
  check(`${name}: no white card or white-on-accent text left (both follow the look)`, !src.includes('${CARD}') && !/\bbg-white\b(?!\/)/.test(src.replace('print:bg-white', '')) && !/text-white[^/]/.test(src.replace(/className="text-white[^"]*"/g, '').replace(/<span className="text-white font-medium">/g, '')));
  check(`${name}: the page roots wear the look`, (src.match(/<div style=\{lookVars\} className="min-h-screen bg-paper/g) ?? []).length >= 1);
  check(`${name}: its footer is in the look (LookFooter), handed the look once loaded`, src.includes('<LookFooter vars={lookVars} />') && src.includes('onLook={setLookVars}'));
}
check('PERS-1: the course bar (photo and logo) stays, in the look\'s band colour', (pages.manage.match(/<CourseHeaderBar courseName=\{info\.courseName\} accent=\{band\} photoUrl=\{info\.heroImageUrl\} logoUrl=\{info\.logoUrl\} \/>/g) ?? []).length === 3 && (pages.checkin.match(/accent=\{band\} photoUrl=\{info\.heroImageUrl\} logoUrl=\{info\.logoUrl\}/g) ?? []).length === 4 && pages.receipt.includes('accent={lookBandHex(lookCourse)}'));
check('no brandColor left as a colour on manage and the pay page', !/info\.brandColor(?! \})/.test(pages.manage.replace('brand_color: info?.brandColor', '').replace('brand_color: info.brandColor', '')) && !pages.checkin.replace(/brand_color: info\??\.brandColor/g, '').includes('info.brandColor'));
check('the card field and wallet button follow the look on the pay page', pages.checkin.includes('<CardElement options={cardStyleFor(look)} />') && pages.checkin.includes("theme: look === 'dark' ? 'light' : 'dark'"));
check('the cancel button keeps a readable label on Dark (card colour on red, white on Light)', pages.manage.includes('rounded-md bg-bad text-card font-medium'));
check('the receipt still prints black on white whatever the look', pages.receipt.includes('.receipt-card * { color: #000 !important; background: transparent !important;') && pages.receipt.includes('print:bg-white') && pages.receipt.includes('.no-print, footer, nextjs-portal { display: none !important; }'));
const footer = readFileSync('src/components/Footer.tsx', 'utf8');
check('the site footer skips the three pages (not the shop receipt)', footer.includes('if (wearsCourseLook(pathname)) return null;') && footer.includes("!pathname.startsWith('/receipt/shop')"));

// Build 2026-11-19: the "booking changed" email is awaited and its failure said; the change stays saved.
check('manage: the updated-booking email is awaited, never fire-and-forget', !pages.manage.includes('.catch(() => undefined);') && (pages.manage.match(/await sendModifiedEmail\(\);/g) ?? []).length === 2 && pages.manage.includes("setEmailState(r && r.ok ? 'sent' : 'failed');"));
check('manage: a failed email says so, and that the change is saved; it never claims a sent email early', pages.manage.includes("We couldn&apos;t send the email. Your change is saved.") && pages.manage.includes("emailState === 'sending' ? 'Sending your updated confirmation email…'"));
// Build 2026-11-19: no resident window is promised until the server grants one.
check('the calendar note promises no resident window yet', !readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8').includes('Residents (with a resident card)'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
