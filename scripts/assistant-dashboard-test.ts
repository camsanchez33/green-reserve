// ASSIST-2: the dashboard assistant on the current model with the course brief behind the cache breakpoint. Source
// checks (no model, no network): every turn is the current Opus, the brief is the session course's and sits in the
// cached block with only today's facts after it, the course's staff switch is honoured, the key fails closed, and
// no log line carries message text.
// Run: npx tsx scripts/assistant-dashboard-test.ts
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const route = readFileSync(new URL('../src/app/api/birdie/chat/route.ts', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../src/components/birdie/BirdieWidget.tsx', import.meta.url), 'utf8');

ok('model: every turn on ASSISTANT_MODEL', /model: ASSISTANT_MODEL/.test(route) && !/claude-haiku|BIRDIE_MODEL|TOOL_MODEL/.test(route));
ok('model: effort low, refusal fallback on', /output_config: \{ effort: ASSISTANT_EFFORT \}/.test(route) && /fallbacks: 'default'/.test(route) && /FALLBACK_BETA/.test(route));
ok('cache: persona → brief (breakpoint) → today', /systemBlocks\(OPERATOR_SYSTEM, brief\.text, facts\)/.test(route));
const persona = route.slice(route.indexOf('const OPERATOR_SYSTEM = `'), route.indexOf('`;', route.indexOf('const OPERATOR_SYSTEM = `')));
const interps = [...persona.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1].trim());
ok('cache: the frozen persona only interpolates constants', persona.length > 500 && interps.every(i => /^(DASHBOARD_PAGES\.map\(p => `- \[Open \$\{p\.label|p\.href|p\.does|DATA_RULE|OPERATOR_KNOWLEDGE)/.test(i)), interps);
ok('cache: today\'s date is only in the volatile facts', (route.match(/todayIn\(/g) || []).length === 1 && /const facts = `Today/.test(route));
ok('brief: the session\'s course, staff audience', /getCourseBrief\(session\.courseId, 'staff'\)/.test(route));
ok('switch: the course\'s staff switch is checked before any call', route.indexOf('brief.settings.staffOn') > 0 && route.indexOf('brief.settings.staffOn', route.indexOf('export async function POST')) < route.indexOf('assistantClient()'));
ok('switch: GET reports off when the course turned it off', /enabled = !!brief && brief\.settings\.staffOn/.test(route));
ok('key: fails closed through assistantClient()', /const client = assistantClient\(\);\s*if \(!client\) return/.test(route) && !/new Anthropic\(/.test(route));
ok('caps: taken before the body is read', route.indexOf('checkCaps(') < route.indexOf('req.json()'));
ok('data rule in the persona', /\$\{DATA_RULE\}/.test(route));
const logCall = route.slice(route.indexOf('logAssistant({'), route.indexOf('});', route.indexOf('logAssistant({')));
ok('log: logAssistant only, no question or reply text', logCall.length > 0 && !/logConversation/.test(route) && !/\b(question|reply|history|messages)\b/.test(logCall), logCall);
ok('log: tool inputs never logged', !/input: tu\.input/.test(route));
ok('log: applied card titles never logged', !/title: str\(a\.title/.test(route));
ok('log: errors logged by name, not body', !/console\.error\([^)]*err\.message/.test(route));
ok('widget: "What it knows" from the GET, with Live numbers', /What it knows/.test(widget) && /meta\.knows\.sections\.map/.test(widget) && /Live numbers/.test(widget));
ok('widget: it never saves on its own — cards still need Confirm', /ConfirmCard/.test(widget));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
