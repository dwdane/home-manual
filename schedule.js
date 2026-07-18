// schedule.js
// The scheduling engine.
//
// Three jobs live here:
//
//   1. Profile -> task list. Filter the library by the house profile and turn
//      matching entries into concrete task instances with due dates.
//   2. Recurrence math. Given a task and a completion date, compute the next
//      due date - strict intervals for interval tasks, next seasonal window
//      for windowed tasks.
//   3. Load balancing. Seasonal tasks are spread across the weeks of their
//      windows instead of all landing on the 1st of the month, so no single
//      weekend gets buried.
//
// Dates are ISO date strings (YYYY-MM-DD) throughout. They sort lexically,
// diff trivially, and serialize to IndexedDB without timezone surprises.

import { LIBRARY, WARRANTY_MILESTONES } from './library.js';

export const DEFAULT_PROFILE = {
  houseName: '',
  warrantyStart: '',          // ISO date; empty = no builder warranty tasks
  climate: 'freezing',        // freezing | mild - gates winterization tasks

  // Systems
  forcedAir: true,
  centralAir: true,
  humidifier: false,
  erv: false,
  fireplace: 'none',          // none | gas | wood
  waterHeater: 'tank',        // tank | tankless
  foundation: 'slab',         // slab | crawl | basement

  // Water treatment & appliances
  softener: false,
  showerFilter: false,
  sedimentFilter: false,
  fridgeFilter: true,
  frontLoadWasher: false,
  disposal: true,
  sumpPump: false,
  septic: false,
  well: false,

  // Outside
  garage: true,
  gutters: true,
  deck: false,
  sprinklers: false,

  // Garden
  lawn: true,
  beds: true,
  hydrangeas: false,
  roses: false,
  fruitTrees: false,

  // Pets
  dog: false,
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function todayIso() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function isoOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function addInterval(iso, every) {
  const d = parseIso(iso);
  if (every.unit === 'w') d.setDate(d.getDate() + every.n * 7);
  else if (every.unit === 'm') d.setMonth(d.getMonth() + every.n);
  else d.setFullYear(d.getFullYear() + every.n);
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Whole days from `a` to `b` (positive if b is later). */
export function daysBetween(a, b) {
  return Math.round((parseIso(b) - parseIso(a)) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date().getFullYear();
  return `${MONTHS[m - 1]} ${d}${y !== now ? ' ' + y : ''}`;
}

/** Human description of a task's cadence, for the list rows. */
export function fmtCadence(task) {
  if (task.every) {
    const { n, unit } = task.every;
    const word = unit === 'w' ? 'week' : unit === 'm' ? 'month' : 'year';
    return n === 1 ? `Every ${word}` : `Every ${n} ${word}s`;
  }
  if (task.windows && task.windows.length) {
    const names = task.windows
      .map(([a, b]) => (a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}\u2013${MONTHS[b - 1]}`))
      .join(' & ');
    const gap = task.yearGap && task.yearGap > 1 ? `, every ${task.yearGap} yrs` : '';
    return `${names}${gap}`;
  }
  return 'One time';
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

/**
 * Next occurrence of a windowed task strictly after `afterIso`.
 * Returns the ISO date of the start of the next eligible window (day is
 * refined by the seeder's week-spreading; recomputation after completion
 * lands on the window start, which the user can nudge if they care).
 */
function nextWindowStart(windows, yearGap, afterIso) {
  const after = parseIso(afterIso);
  const gap = Math.max(1, yearGap || 1);

  // Collect candidate window starts across this year and the next few, then
  // pick the earliest one after the reference date.
  const candidates = [];
  for (let y = after.getFullYear(); y <= after.getFullYear() + gap + 1; y++) {
    for (const [startM] of windows) {
      candidates.push(new Date(y, startM - 1, 1));
    }
  }
  candidates.sort((a, b) => a - b);
  const next = candidates.find((c) => c > after);
  // yearGap > 1: push whole years forward from the found occurrence.
  if (gap > 1) next.setFullYear(next.getFullYear() + (gap - 1));
  return isoOf(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

/** Is `iso` inside one of the task's month windows? */
function insideWindow(windows, iso) {
  const m = Number(iso.split('-')[1]);
  return windows.some(([a, b]) => (a <= b ? m >= a && m <= b : m >= a || m <= b));
}

/**
 * If `iso` falls inside one of the windows, return the last day of that
 * window (handling windows that wrap the year end, like Nov-Feb). Otherwise
 * return `iso` unchanged. Used so completing a task inside its window
 * schedules the NEXT window rather than repeating this one.
 */
function windowEndRef(windows, iso) {
  const [y, m] = iso.split('-').map(Number);
  const w = windows.find(([a, b]) => (a <= b ? m >= a && m <= b : m >= a || m <= b));
  if (!w) return iso;
  const [a, b] = w;
  const endYear = a > b && m >= a ? y + 1 : y; // wrap window, still in the head
  return isoOf(endYear, b, 28);
}

/**
 * Compute the next due date after completing a task on `doneIso`.
 */
export function nextDueAfter(task, doneIso) {
  if (task.every) return addInterval(doneIso, task.every);
  if (task.windows && task.windows.length) {
    return nextWindowStart(task.windows, task.yearGap, windowEndRef(task.windows, doneIso));
  }
  return null; // one-shot task: no next occurrence
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Does a library entry's `requires` block match the profile? */
export function matches(entry, profile) {
  if (!entry.requires) return true;
  return Object.entries(entry.requires).every(([key, want]) => {
    const have = profile[key];
    return typeof want === 'boolean' ? Boolean(have) === want : have === want;
  });
}

let idCounter = 0;
function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

/**
 * Build the initial task list for a profile.
 *
 * Load balancing: instead of dumping every task's first due date on "today"
 * or on the 1st of its window month, tasks are bucketed by due month and then
 * spread across the days of that month round-robin (7-day steps: the 1st,
 * 8th, 15th, 22nd), so a month with eight seasonal tasks becomes two per
 * weekend, not eight in one.
 */
export function seedTasks(profile, fromIso) {
  const start = fromIso || todayIso();
  const tasks = [];

  for (const entry of LIBRARY) {
    if (!matches(entry, profile)) continue;

    let firstDue;
    if (entry.windows) {
      // If we are inside a window right now, the task is due now; otherwise
      // the soonest upcoming window (gap of 1 at seed time - the first
      // occurrence should never be pushed years out).
      firstDue = insideWindow(entry.windows, start)
        ? start
        : nextWindowStart(entry.windows, 1, start);
    } else {
      // Interval tasks: first due one interval from now, except monthly-or-
      // faster habits which start within the first month.
      firstDue = addInterval(start, entry.every);
    }

    tasks.push({
      id: newId('t'),
      key: entry.key,
      title: entry.title,
      cat: entry.cat,
      why: entry.why || '',
      every: entry.every || null,
      windows: entry.windows || null,
      yearGap: entry.yearGap || 1,
      nextDue: firstDue,
      lastDone: null,
      assetId: null,
      assetHint: entry.asset || null,
      note: '',
      link: '',
      paused: false,
      custom: false,
    });
  }

  spreadWithinMonths(tasks, start);
  return tasks;
}

/**
 * Spread tasks sharing a due month across that month. Mutates nextDue.
 * Interval tasks keep their computed day; only windowed (seasonal) tasks are
 * spread, since those are the ones that pile up on month boundaries.
 * `minIso`, if given, floors every assigned date so a fresh seed never
 * starts life already overdue.
 */
export function spreadWithinMonths(tasks, minIso) {
  const byMonth = new Map();
  for (const t of tasks) {
    if (!t.windows || !t.nextDue) continue;
    const ym = t.nextDue.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(t);
  }
  for (const [ym, group] of byMonth) {
    group.sort((a, b) => a.key.localeCompare(b.key)); // deterministic
    group.forEach((t, i) => {
      const day = 1 + (i % 4) * 7 + Math.floor(i / 4); // 1,8,15,22,2,9,16,23...
      let due = `${ym}-${String(Math.min(day, 28)).padStart(2, '0')}`;
      if (minIso && due < minIso) due = addDays(minIso, i % 7);
      t.nextDue = due;
    });
  }
}

/**
 * One-shot builder-warranty milestone tasks from a warranty start date.
 */
export function seedWarrantyTasks(warrantyStartIso) {
  if (!warrantyStartIso) return [];
  return WARRANTY_MILESTONES.map((m) => ({
    id: newId('w'),
    key: m.key,
    title: m.title,
    cat: m.cat,
    why: m.why,
    every: null,
    windows: null,
    yearGap: 1,
    nextDue: addDays(warrantyStartIso, m.offsetDays),
    lastDone: null,
    assetId: null,
    assetHint: null,
    note: '',
    link: '',
    paused: false,
    custom: false,
    oneShot: true,
  }));
}

/** A blank custom task the editor can fill in. */
export function blankTask() {
  return {
    id: newId('c'),
    key: null,
    title: '',
    cat: 'clean',
    why: '',
    every: { n: 1, unit: 'm' },
    windows: null,
    yearGap: 1,
    nextDue: todayIso(),
    lastDone: null,
    assetId: null,
    assetHint: null,
    note: '',
    link: '',
    paused: false,
    custom: true,
  };
}

// ---------------------------------------------------------------------------
// Grouping for the Today screen
// ---------------------------------------------------------------------------

export const BUCKETS = [
  { id: 'over', label: 'Overdue' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'later', label: 'Coming up' },
];

export function bucketOf(task, today) {
  const diff = daysBetween(today, task.nextDue);
  if (diff < 0) return 'over';
  if (diff <= 7) return 'week';
  if (diff <= 31) return 'month';
  return 'later';
}

// ---------------------------------------------------------------------------
// Calendar export (.ics)
// ---------------------------------------------------------------------------

function icsDate(iso) {
  return iso.replaceAll('-', '');
}

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Build an iCalendar file: one all-day event per active task at its next due
 * date, with a repeat rule where the cadence maps cleanly, and a reminder
 * alarm the morning before. Subscribing/importing this into the phone's
 * native calendar is how a serverless app gets real notifications.
 */
export function buildIcs(tasks, houseName) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Home Manual//EN',
    `X-WR-CALNAME:${icsEscape(houseName || 'Home Manual')}`,
  ];

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  for (const t of tasks) {
    if (t.paused || !t.nextDue) continue;

    let rrule = '';
    if (t.every) {
      const freq = t.every.unit === 'w' ? 'WEEKLY' : t.every.unit === 'm' ? 'MONTHLY' : 'YEARLY';
      rrule = `RRULE:FREQ=${freq};INTERVAL=${t.every.n}`;
    } else if (t.windows && !t.oneShot) {
      rrule = `RRULE:FREQ=YEARLY;INTERVAL=${Math.max(1, t.yearGap || 1)}`;
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@home-manual`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(t.nextDue)}`,
      `SUMMARY:${icsEscape('\u2302 ' + t.title)}`,
      `DESCRIPTION:${icsEscape(t.why)}`,
    );
    if (rrule) lines.push(rrule);
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(t.title)}`,
      'TRIGGER:-PT12H',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
