// test-schedule.mjs
// Smoke tests for the scheduling engine. Run with: node test-schedule.mjs

import {
  DEFAULT_PROFILE, seedTasks, seedWarrantyTasks, nextDueAfter, buildIcs,
  spreadWithinMonths, daysBetween, addDays,
} from './schedule.js';
import { LIBRARY } from './library.js';

let failures = 0;
function check(name, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
  else console.log(`ok    ${name}`);
}

// --- seeding -----------------------------------------------------------
const profile = {
  ...DEFAULT_PROFILE,
  showerFilter: true, softener: true, frontLoadWasher: true, dog: true,
  hydrangeas: true, roses: true, sprinklers: true, deck: true,
  foundation: 'crawl', fireplace: 'gas', warrantyStart: '2026-06-01',
};
const seeded = seedTasks(profile, '2026-07-18');

check('seed produces a substantial list', seeded.length > 60, `got ${seeded.length}`);
check('no seeded task is overdue at seed time',
  seeded.every((t) => t.nextDue >= '2026-07-18'),
  seeded.filter((t) => t.nextDue < '2026-07-18').map((t) => `${t.key}:${t.nextDue}`).join(','));
check('slab tasks excluded on crawl profile', !seeded.some((t) => t.key === 'basement-look'));
check('crawl task included', seeded.some((t) => t.key === 'crawl-check'));
check('shower filter task included', seeded.some((t) => t.key === 'shower-filter'));
check('dog tasks included', seeded.filter((t) => t.cat === 'pet').length >= 7);
check('tankless task excluded on tank profile', !seeded.some((t) => t.key === 'wh-tankless-descale'));
check('every seeded task has a valid ISO date', seeded.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.nextDue)));

// Spreading: no month should have more than a few seasonal tasks per day.
const perDay = new Map();
for (const t of seeded.filter((t) => t.windows)) {
  perDay.set(t.nextDue, (perDay.get(t.nextDue) || 0) + 1);
}
const worst = Math.max(...perDay.values());
check('seasonal tasks spread across days (max 3 per day)', worst <= 3, `worst day has ${worst}`);

// --- warranty ----------------------------------------------------------
const warr = seedWarrantyTasks('2026-06-01');
check('4 warranty milestones', warr.length === 4);
check('11-month milestone lands in month 11', warr[2].nextDue === addDays('2026-06-01', 330), warr[2].nextDue);
check('warranty tasks are one-shot', warr.every((t) => t.oneShot));

// --- recurrence --------------------------------------------------------
const monthly = { every: { n: 1, unit: 'm' } };
check('monthly interval', nextDueAfter(monthly, '2026-07-18') === '2026-08-18');

const q = { every: { n: 3, unit: 'm' } };
check('quarterly interval', nextDueAfter(q, '2026-11-30') === '2027-03-02' || nextDueAfter(q, '2026-11-30') === '2027-02-28' || nextDueAfter(q, '2026-11-30') === '2027-03-01',
  nextDueAfter(q, '2026-11-30'));

const gutters = { windows: [[4, 5], [10, 11]], yearGap: 1 };
check('twice-yearly: done in spring -> due in fall', nextDueAfter(gutters, '2026-04-20') === '2026-10-01',
  nextDueAfter(gutters, '2026-04-20'));
check('twice-yearly: done in fall -> due next spring', nextDueAfter(gutters, '2026-10-15') === '2027-04-01',
  nextDueAfter(gutters, '2026-10-15'));
check('done between windows -> next window', nextDueAfter(gutters, '2026-07-18') === '2026-10-01',
  nextDueAfter(gutters, '2026-07-18'));

const hydrangea = { windows: [[2, 3]], yearGap: 1 };
check('yearly window: done inside -> next year', nextDueAfter(hydrangea, '2026-02-20') === '2027-02-01',
  nextDueAfter(hydrangea, '2026-02-20'));

const septic = { windows: [[5, 9]], yearGap: 3 };
const septicNext = nextDueAfter(septic, '2026-06-10');
check('3-year gap task lands ~3 years out', septicNext.startsWith('2029'), septicNext);

const radon = { windows: [[11, 2]], yearGap: 2 };
const radonNext = nextDueAfter(radon, '2026-12-05');   // inside a wrap window
check('wrap window (Nov-Feb): done in Dec -> ~2 years out', radonNext >= '2028-11-01', radonNext);
const radonNext2 = nextDueAfter(radon, '2027-01-15');  // inside the tail of the wrap
check('wrap window: done in Jan handled', /^\d{4}-\d{2}-\d{2}$/.test(radonNext2), radonNext2);

// --- ics ---------------------------------------------------------------
const ics = buildIcs(seeded.concat(warr), 'Test House');
check('ics has calendar wrapper', ics.startsWith('BEGIN:VCALENDAR') && ics.endsWith('END:VCALENDAR'));
check('ics event per active task',
  (ics.match(/BEGIN:VEVENT/g) || []).length === seeded.length + warr.length);
check('interval tasks carry RRULE', ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1'));
check('one-shot warranty events carry no RRULE',
  !ics.split('BEGIN:VEVENT').find((v) => v.includes('warr-11mo') && v.includes('RRULE')));

// --- library sanity ----------------------------------------------------
const keys = new Set();
let dupes = 0;
for (const e of LIBRARY) { if (keys.has(e.key)) dupes++; keys.add(e.key); }
check('library keys unique', dupes === 0);
check('every library entry has every OR windows', LIBRARY.every((e) => Boolean(e.every) !== Boolean(e.windows)));
check('library has 80+ tasks', LIBRARY.length >= 80, `got ${LIBRARY.length}`);

console.log(failures ? `\n${failures} FAILURES` : '\nALL TESTS PASSED');
process.exit(failures ? 1 : 0);
