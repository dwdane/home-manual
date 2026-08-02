// test-schedule.mjs
/**
 * Engine tests for schedule.js and the library, run in Node.
 *
 *     node test-schedule.mjs
 *
 * Covers date math, window recurrence, seeding per kind against feature
 * sets, the never-born-overdue rule, warranty milestones, and the ics build.
 * store.js is stubbed because Node has no IndexedDB.
 */

import { mkdtempSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Stub store.js (schedule.js imports newId from it) in a temp copy.
const dir = mkdtempSync(join(tmpdir(), 'hm2-'));
for (const f of ['schedule.js', 'library.js']) {
  cpSync(join(HERE, f), join(dir, f));
}
writeFileSync(join(dir, 'store.js'),
  'let n = 0;\nexport function newId(p) { return `${p}_${n++}`; }\n');

const S = await import(pathToFileURL(join(dir, 'schedule.js')).href);
const L = await import(pathToFileURL(join(dir, 'library.js')).href);

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`ok    ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}

// --- date math -------------------------------------------------------------

check('addDays crosses months', S.addDays('2026-01-30', 3) === '2026-02-02');
check('addInterval months clamps day', S.addInterval('2026-01-31', { n: 1, unit: 'm' }) === '2026-02-28');
check('addInterval years', S.addInterval('2026-03-05', { n: 2, unit: 'y' }) === '2028-03-05');
check('daysBetween', S.daysBetween('2026-08-01', '2026-08-11') === 10);

// --- recurrence ------------------------------------------------------------

const seasonal = { windows: [[4, 5], [10, 11]], yearGap: 1 };
check('nextDueAfter jumps to next window',
  S.nextDueAfter(seasonal, '2026-04-20') === '2026-10-01');
check('nextDueAfter wraps the year',
  S.nextDueAfter(seasonal, '2026-11-15') === '2027-04-01');

const wrapWin = { windows: [[11, 2]], yearGap: 1 };
const wrapNext = S.nextDueAfter(wrapWin, '2026-12-10');
check('wrap window (Nov-Feb) schedules the next season, not this one',
  wrapNext === '2027-11-01', wrapNext);

const gap2 = { windows: [[3, 5]], yearGap: 3 };
check('yearGap respected', S.nextDueAfter(gap2, '2026-04-10') === '2029-03-01');

const interval = { every: { n: 3, unit: 'm' } };
check('interval from completion date', S.nextDueAfter(interval, '2026-08-01') === '2026-11-01');
check('one-shot returns null', S.nextDueAfter({ oneShot: true }, '2026-08-01') === null);

// --- seeding: house --------------------------------------------------------

const start = '2026-08-01';
const houseAll = S.seedTasks('house', S.DEFAULT_FEATURES.house, 'sub_h', start);
check('house seeding produces a healthy list', houseAll.length >= 35, String(houseAll.length));
check('nothing is born overdue', houseAll.every((t) => !t.nextDue || t.nextDue >= start));
check('interval tasks staggered, not day-one',
  houseAll.filter((t) => t.every).every((t) => t.nextDue > start));

const slabNoAC = { ...S.DEFAULT_FEATURES.house, centralAC: false, foundation: 'slab', sump: false };
const slabTasks = S.seedTasks('house', slabNoAC, 'sub_h', start);
check('no AC tasks without AC', !slabTasks.some((t) => ['ac-service', 'condensate', 'condenser-clean'].includes(t.key)));
check('no crawl check on a slab', !slabTasks.some((t) => t.key === 'crawl-check'));

const tanklessF = { ...S.DEFAULT_FEATURES.house, waterHeater: 'tankless' };
const tanklessTasks = S.seedTasks('house', tanklessF, 'sub_h', start);
check('tankless gets descale, not flush',
  tanklessTasks.some((t) => t.key === 'wh-descale') && !tanklessTasks.some((t) => t.key === 'wh-flush'));

const recircF = { ...S.DEFAULT_FEATURES.house, otrMicrowave: true, hood: 'recirc' };
check('recirculating OTR microwave gets the charcoal filter task',
  S.seedTasks('house', recircF, 'sub_h', start).some((t) => t.key === 'otr-charcoal'));
const ventedF = { ...S.DEFAULT_FEATURES.house, hood: 'vented' };
check('vented hood skips charcoal, gets degrease',
  !S.seedTasks('house', ventedF, 'sub_h', start).some((t) => t.key === 'otr-charcoal')
  && S.seedTasks('house', ventedF, 'sub_h', start).some((t) => t.key === 'hood-filter'));

check('septic pumping appears for septic homes',
  S.seedTasks('house', { ...S.DEFAULT_FEATURES.house, sewage: 'septic' }, 's', start)
    .some((t) => t.key === 'septic-pump'));

// Seasonal spreading: no month-day gets more than a few seeded seasonal tasks.
const byDay = new Map();
for (const t of houseAll.filter((x) => x.windows && x.nextDue)) {
  byDay.set(t.nextDue, (byDay.get(t.nextDue) || 0) + 1);
}
check('seasonal tasks spread within their month', Math.max(...byDay.values()) <= 4,
  JSON.stringify([...byDay.entries()].sort()));

// --- seeding: vehicle and pet ----------------------------------------------

const gasCar = S.seedTasks('vehicle', { fuel: 'gas' }, 'sub_v', start);
check('gas vehicle gets oil changes', gasCar.some((t) => t.key === 'oil'));
const ev = S.seedTasks('vehicle', { fuel: 'ev' }, 'sub_v', start);
check('EV skips oil and engine air but keeps tires and 12V',
  !ev.some((t) => t.key === 'oil') && !ev.some((t) => t.key === 'engine-air')
  && ev.some((t) => t.key === 'tire-rotate') && ev.some((t) => t.key === 'battery-12v'));

const dog = S.seedTasks('pet', { species: 'dog' }, 'sub_p', start);
const cat = S.seedTasks('pet', { species: 'cat' }, 'sub_p', start);
check('dog gets heartworm; cat does not',
  dog.some((t) => t.key === 'heartworm') && !cat.some((t) => t.key === 'heartworm'));
check('cat gets FVRCP and litter deep-clean',
  cat.some((t) => t.key === 'fvrcp') && cat.some((t) => t.key === 'litter-deep'));

// --- warranty milestones ---------------------------------------------------

const warr = S.seedWarrantyTasks('2026-06-15', 'sub_h');
check('four warranty milestones', warr.length === 4);
check('11-month lands before the anniversary',
  warr.find((t) => t.key === 'warr-11mo').nextDue === S.addDays('2026-06-15', 330));
check('warranty tasks are one-shot', warr.every((t) => t.oneShot));

// --- completion flow helpers ----------------------------------------------

const t1 = S.taskFromEntry({ key: 'x', title: 'X', cat: 'other', every: { n: 6, unit: 'm' } }, 's', '2026-08-10');
check('taskFromEntry carries schedule', t1.every.n === 6 && t1.nextDue === '2026-08-10');
check('blankTask is unscheduled', S.blankTask('s').nextDue === null);

// --- ics -------------------------------------------------------------------

const rows = [
  { task: { ...t1, id: 'a1', title: 'Filter', nextDue: '2026-09-01', why: 'Because', paused: false }, subjectName: 'House' },
  { task: { id: 'a2', title: 'Heartworm', nextDue: '2026-09-03', every: { n: 1, unit: 'm' }, paused: false, oneShot: false }, subjectName: 'Biscuit' },
  { task: { id: 'a3', title: 'Skip me', nextDue: null, paused: false }, subjectName: 'House' },
];
const ics = S.buildIcs(rows, 'Home Manual');
check('ics prefixes subject when multiple subjects', ics.includes('SUMMARY:[Biscuit] Heartworm'));
check('ics skips unscheduled tasks', !ics.includes('Skip me'));
check('ics has alarms and rrules', ics.includes('TRIGGER:-PT12H') && ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1'));
check('ics dates are DATE values', ics.includes('DTSTART;VALUE=DATE:20260901'));

// --- inspection bank -------------------------------------------------------

const feats = S.DEFAULT_FEATURES.house;
let bankCount = 0;
for (const g of L.INSPECTION_BANK) {
  for (const item of g.items) if (!item.need || item.need(feats)) bankCount++;
}
check('inspection bank yields a real walk (25+ items)', bankCount >= 25, String(bankCount));
// Defaults have no sump and no deck; adding both must grow the walk.
const rich = { ...feats, sump: true, deck: 'wood' };
let richCount = 0;
for (const g of L.INSPECTION_BANK) {
  for (const item of g.items) if (!item.need || item.need(rich)) richCount++;
}
check('inspection bank filters by features', richCount > bankCount,
  `${richCount} vs ${bankCount}`);

console.log();
if (failures) { console.log(`${failures} FAILURE(S)`); process.exit(1); }
console.log('ALL ENGINE TESTS PASSED');
