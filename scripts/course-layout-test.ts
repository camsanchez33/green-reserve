// Settings rework part 2 (Cam 2026-10-19): the guided course layout.
// Run: npx tsx scripts/course-layout-test.ts
import { readFileSync } from 'fs';
import { candidateRounds, sameNines } from '../src/lib/course-rounds';
import { teeColour } from '../src/lib/tee-colour';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

const three = candidateRounds([{ id: 'n', name: 'North' }, { id: 's', name: 'South' }, { id: 'w', name: 'West' }]);
check('27 holes: three 18-hole pairs', three.filter(r => r.holes === 18).map(r => r.label).join('|') === 'North + South|North + West|South + West');
check('27 holes: each nine alone as a 9', three.filter(r => r.holes === 9).length === 3);
check('36 holes: six pairs', candidateRounds([1, 2, 3, 4].map(i => ({ id: String(i), name: String(i) }))).filter(r => r.holes === 18).length === 6);
check('same nines in any order', sameNines(['a', 'b'], ['b', 'a']) && !sameNines(['a'], ['a', 'b']));
check('tee colour from the name', teeColour('Blue') === '#1F4FA3' && teeColour('Black tips') === '#1A1A1A' && teeColour('Championship') === null);

const page = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');
const tab = readFileSync('src/components/dashboard/CourseLayoutTab.tsx', 'utf8');
const pub = readFileSync('src/lib/public-course.ts', 'utf8');
const booking = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('Course layout saves itself (no header Save)', /NO_SAVE_BUTTON: Section\[\] = \['Course layout'/.test(page));
check('no loose holes/par/yardage fields left on the page', !page.includes("set('yardage'") && !page.includes("set('courseRating'"));
check('staff see the layout read-only', page.includes('readOnly={isStaffLogin}') && tab.includes('readOnly'));
check('unticking a round deactivates, never deletes', !tab.includes("'/api/operator/course-products', 'DELETE'"));
check('golfer page loads tees and nines', pub.includes('teeSets:') && pub.includes('nines:'));
check('golfer page shows The tees', booking.includes('The tees'));
check('tee item waits for the count', page.includes('photos.length : null, teeSetCount,') && readFileSync('src/lib/setup-missing.ts', 'utf8').includes('if (f.teeSetCount === 0)'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
