// W2-6: the course shapes and the rounds each can sell. Pure.
// Run: npx tsx scripts/course-shape-test.ts
import { SHAPES, shapeDef, shapeNines, shapeRounds, guessShape } from '../src/lib/course-shape';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
const on = (k: string, names: string[] = []) => shapeRounds(shapeDef(k)!, names).filter(r => r.on).map(r => r.label);

ok('every shape makes as many nines as its holes need', SHAPES.every(s => shapeNines(s, []).length === s.holes / 9), JSON.stringify(SHAPES.map(s => [s.key, shapeNines(s, []).length])));
ok('an 18 sells 18 holes by default, 9s and back-9 starts are a tick away', on('eighteen').join() === '18 holes' && shapeRounds(shapeDef('eighteen')!, []).length === 3);
ok('three nines sell the three pairs, named by their nines', on('three_nines', ['Red', 'White', 'Blue']).join() === 'Red + White,White + Blue,Red + Blue');
ok('an 18 and a separate 9 sell both', on('eighteen_plus_nine', ['F', 'B', 'Exec']).join() === '18 holes,Exec');
ok('two 18s are named by their courses, each with a front and back', on('two_eighteens', ['Lakes', 'Hills']).join() === 'Lakes,Hills' && shapeNines(shapeDef('two_eighteens')!, ['Lakes', 'Hills']).map(n => n.name).join() === 'Lakes front,Lakes back,Hills front,Hills back');
ok('a nine can also sell 18 as twice around', shapeRounds(shapeDef('nine')!, []).some(r => r.key === 'twice:0' && r.holes === 18 && r.nines.join() === '0'));
ok('blank names fall back to the defaults', shapeNines(shapeDef('eighteen')!, ['  ', '']).map(n => n.name).join() === 'Front 9,Back 9');
ok('every round only uses nines the shape has', SHAPES.every(s => shapeRounds(s, []).every(r => r.nines.every(i => i < shapeNines(s, []).length))));
ok('round keys are unique per shape', SHAPES.every(s => { const k = shapeRounds(s, []).map(r => r.key); return new Set(k).size === k.length; }));
ok('guess: 27 holes → three nines; 9 → nine; 36 → two 18s; else 18', guessShape(27, 0) === 'three_nines' && guessShape(9, 0) === 'nine' && guessShape(36, 4) === 'two_eighteens' && guessShape(18, 2) === 'eighteen' && guessShape(null, 0) === 'eighteen');
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('course-shape: all passed');
