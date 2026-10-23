// Cam 2026-10-19: Birdie can be tucked away (remembered) and sits clear of the
// phone tab bar; Messages says when to expect a reply and offers email.
// Source guards. Run: npx tsx scripts/birdie-messages-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const w = readFileSync('src/components/birdie/BirdieWidget.tsx', 'utf8');
// Cam 2026-10-23: nothing a course sees says "Birdie" (the code keeps the name internally).
const shown = w.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
check('the widget never shows the word Birdie', !/(^|[>'"`\s])Birdie([\s<'"`.,!?]|$)/m.test(shown.replace(/import[^\n]*\n/g, '').replace(/\bBirdie(Widget|Turn)\b/g, '')));
check('Birdie can be tucked into an edge tab', w.includes('aria-label="Tuck the assistant away"') && w.includes('aria-label="Open the assistant"'));
check('…and stays tucked until opened', w.includes("localStorage.setItem(TUCK_KEY, '1')") && w.includes("localStorage.getItem(TUCK_KEY) === '1'"));
check('an Ask Birdie link untucks it', /onAsk[\s\S]{0,300}setTucked\(false\)/.test(w));
check('on phones it sits above the bottom tab bar', w.includes('fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4'));
// W2-1 (Cam 2026-10-19): back in the bottom corner on every screen, with the tuck to push it off.
check('the launcher and edge tab show on every screen size', !w.includes('md:hidden fixed') && w.includes('md:bottom-5 md:right-5'));
check('the phone launcher says Ask, not just the logo', />Ask<\/span>/.test(w));
check('an empty question only opens the panel, keeping a draft', /if \(q\.trim\(\)\) setInput/.test(w));
const bar = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
check('the top bar no longer carries a second Ask Birdie', !bar.includes('openBirdie'));
const m = readFileSync('src/app/dashboard/messages/page.tsx', 'utf8');
check('Messages says when to expect a reply', m.includes('We reply within one business day.'));
check('…and offers email', m.includes('mailto:${ADMIN_EMAIL}'));
check('the compose bar clears Birdie\'s corner buttons on every screen', m.includes('pr-[8.5rem]') && !m.includes('md:pr-6'));
check('no eyebrow label', !m.includes('<Eyebrow'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
