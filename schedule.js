// schedule.js
/**
 * The scheduling engine: date helpers, recurrence math, seeding a subject's
 * task list from its features, spreading seasonal work across a month, and
 * the .ics calendar export.
 *
 * Dates are ISO YYYY-MM-DD strings compared lexically. No timezone math.
 * A task with nextDue === null is deliberately unscheduled: it lives on the
 * list as a reference item, keeps its history, and can be scheduled at any
 * completion.
 */

import { LIBRARY, WARRANTY_MILESTONES } from './library.js';
import { newId } from './store.js';

// --- dates -----------------------------------------------------------------

/** Today as YYYY-MM-DD in local time. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build an ISO date, clamping the day into the month. */
export function isoOf(year, month, day) {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Add whole days to an ISO date. */
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

/** Add an interval {n, unit: 'w'|'m'|'y'} to an ISO date. */
export function addInterval(iso, every) {
  const [y, m, d] = iso.split('-').map(Number);
  if (every.unit === 'w') return addDays(iso, every.n * 7);
  if (every.unit === 'm') {
    const total = m - 1 + every.n;
    return isoOf(y + Math.floor(total / 12), (total % 12) + 1, d);
  }
  return isoOf(y + every.n, m, d);
}

/** Human date: "Mar 12" this year, "Mar 12, 2027" otherwise. */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const thisYear = new Date().getFullYear();
  return `${months[m - 1]} ${d}${y === thisYear ? '' : `, ${y}`}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Human cadence: "Every 3 months", "Apr-May & Oct-Nov", "One time". */
export function fmtCadence(task) {
  if (task.every) {
    const unit = { w: 'week', m: 'month', y: 'year' }[task.every.unit];
    return task.every.n === 1 ? `Every ${unit}` : `Every ${task.every.n} ${unit}s`;
  }
  if (task.windows && task.windows.length) {
    const gap = task.yearGap > 1 ? `, every ${task.yearGap} yrs` : '';
    const parts = task.windows.map(([a, b]) => (a === b
      ? MONTH_NAMES[a - 1].slice(0, 3)
      : `${MONTH_NAMES[a - 1].slice(0, 3)}\u2013${MONTH_NAMES[b - 1].slice(0, 3)}`));
    return parts.join(' & ') + gap;
  }
  if (task.oneShot) return 'One time';
  return 'Unscheduled';
}

// --- recurrence ------------------------------------------------------------

/** Whether an ISO date's month falls inside any window (handles Nov-Feb). */
export function insideWindow(windows, iso) {
  const m = Number(iso.split('-')[1]);
  return windows.some(([a, b]) => (a <= b ? m >= a && m <= b : m >= a || m <= b));
}

/**
 * The first day of the next window strictly after `afterIso`, respecting a
 * gap of `yearGap` years between occurrences.
 */
export function nextWindowStart(windows, yearGap, afterIso) {
  const gap = Math.max(1, yearGap || 1);
  const afterYear = Number(afterIso.split('-')[0]);
  const candidates = [];
  for (let y = afterYear; y <= afterYear + gap + 1; y++) {
    for (const [a] of windows) candidates.push(isoOf(y, a, 1));
  }
  candidates.sort();
  const next = candidates.find((c) => c > afterIso);
  if (gap === 1) return next;
  const [y, m] = next.split('-').map(Number);
  return isoOf(y + (gap - 1), m, 1);
}

/**
 * If `iso` falls inside one of the windows, return the last day of that
 * window (handling wrap windows like Nov-Feb); otherwise `iso` unchanged.
 * Completing inside a window schedules the NEXT window, not a repeat.
 */
function windowEndRef(windows, iso) {
  const [y, m] = iso.split('-').map(Number);
  const w = windows.find(([a, b]) => (a <= b ? m >= a && m <= b : m >= a || m <= b));
  if (!w) return iso;
  const [a, b] = w;
  const endYear = a > b && m >= a ? y + 1 : y;
  return isoOf(endYear, b, 28);
}

/** Next due date after completing on `doneIso`, or null for one-shots. */
export function nextDueAfter(task, doneIso) {
  if (task.every) return addInterval(doneIso, task.every);
  if (task.windows && task.windows.length) {
    return nextWindowStart(task.windows, task.yearGap, windowEndRef(task.windows, doneIso));
  }
  return null;
}

// --- seeding ---------------------------------------------------------------

/** Default feature sets per subject kind. */
export const DEFAULT_FEATURES = {
  house: {
    type: 'house', stories: 2, beds: 3, baths: 2,
    climateFreeze: true, foundation: 'slab', garage: '1',
    porch: true, patio: false, deck: 'none', fence: false,
    yard: true, gardenBeds: false, trees: false, sprinklers: false,
    pool: false, hotTub: false, shed: false, gutters: true,
    driveway: 'concrete',
    furnace: 'gas', centralAC: true, miniSplit: false, boiler: false,
    humidifier: false, erv: false, ceilingFans: true, bathFans: true,
    atticFan: false, fireplace: 'none',
    waterHeater: 'tank', softener: false, sedimentFilter: false,
    showerFilter: false, sump: false, sewage: 'sewer', water: 'city',
    fridgeFilter: true, standFreezer: false, dishwasher: true,
    disposal: true, range: 'electric', hood: 'recirc', otrMicrowave: true,
    washer: 'front', dryer: 'electric',
    smoke: true, radonArea: false, security: false, generator: false,
    warrantyStart: '',
  },
  vehicle: { fuel: 'gas', year: '', make: '', model: '' },
  pet: { species: 'dog', birthday: '' },
};

/** Whether a library entry applies to a feature set. */
export function matches(entry, features) {
  return entry.need ? Boolean(entry.need(features || {})) : true;
}

/**
 * Build a task record from a library entry.
 * @param {object} entry library entry
 * @param {string} subjectId
 * @param {string|null} nextDue
 */
export function taskFromEntry(entry, subjectId, nextDue) {
  return {
    id: newId('task'),
    subjectId,
    key: entry.key,
    title: entry.title,
    cat: entry.cat,
    why: entry.why || '',
    how: entry.how || '',
    every: entry.every || null,
    windows: entry.windows || null,
    yearGap: entry.yearGap || 1,
    nextDue: nextDue || null,
    lastDone: null,
    assetId: null,
    assetHint: entry.assetHint || '',
    note: '',
    link: entry.link || '',
    photoIds: [],
    paused: false,
    custom: false,
    oneShot: Boolean(entry.oneShot),
  };
}

/** A blank custom task for the editor. */
export function blankTask(subjectId, cat) {
  return {
    id: newId('task'),
    subjectId,
    key: null,
    title: '',
    cat: cat || 'other',
    why: '',
    how: '',
    every: null,
    windows: null,
    yearGap: 1,
    nextDue: null,
    lastDone: null,
    assetId: null,
    assetHint: '',
    note: '',
    link: '',
    photoIds: [],
    paused: false,
    custom: true,
    oneShot: false,
  };
}

/**
 * First due date for a library entry seeded on `start`.
 */
function firstDue(entry, start) {
  if (entry.windows) {
    return insideWindow(entry.windows, start)
      ? start
      : nextWindowStart(entry.windows, 1, start);
  }
  if (entry.every) {
    const stagger = { w: 7, m: 21, y: 60 }[entry.every.unit] || 21;
    return addDays(start, Math.min(stagger, entry.every.n * (entry.every.unit === 'w' ? 7 : 30)));
  }
  return start;
}

/**
 * Seed scheduled tasks for a subject from its features.
 * @param {string} kind 'house'|'vehicle'|'pet'
 * @param {object} features
 * @param {string} subjectId
 * @param {string} start ISO date
 * @returns {object[]} tasks, spread within months, never overdue at seed
 */
export function seedTasks(kind, features, subjectId, start) {
  const tasks = (LIBRARY[kind] || [])
    .filter((entry) => matches(entry, features))
    .map((entry) => taskFromEntry(entry, subjectId, firstDue(entry, start)));
  spreadWithinMonths(tasks, start);
  return tasks;
}

/**
 * Spread windowed (seasonal) tasks sharing a due month across days
 * 1/8/15/22 so a season change doesn't dump everything on one day.
 * `minIso` floors assigned dates so nothing is born overdue.
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
    group.sort((a, b) => (a.key || a.title).localeCompare(b.key || b.title));
    group.forEach((t, i) => {
      const day = 1 + (i % 4) * 7 + Math.floor(i / 4);
      let due = `${ym}-${String(Math.min(day, 28)).padStart(2, '0')}`;
      if (minIso && due < minIso) due = addDays(minIso, i % 7);
      t.nextDue = due;
    });
  }
}

/**
 * One-shot builder-warranty milestone tasks from a closing date.
 * @param {string} warrantyStart ISO date
 * @param {string} subjectId
 */
export function seedWarrantyTasks(warrantyStart, subjectId) {
  return WARRANTY_MILESTONES.map((m) => ({
    ...taskFromEntry(m, subjectId, addDays(warrantyStart, m.offsetDays)),
    oneShot: true,
  }));
}

// --- ics -------------------------------------------------------------------

/** RRULE for a task, or empty for one-shots/unscheduled. */
function rruleFor(task) {
  if (task.every) {
    const freq = { w: 'WEEKLY', m: 'MONTHLY', y: 'YEARLY' }[task.every.unit];
    return `RRULE:FREQ=${freq};INTERVAL=${task.every.n}`;
  }
  if (task.windows && task.windows.length) {
    return `RRULE:FREQ=YEARLY;INTERVAL=${Math.max(1, task.yearGap || 1)}`;
  }
  return '';
}

/** Escape ICS text. */
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Build a VCALENDAR of every scheduled task, with a reminder the evening
 * before. Tasks may come from several subjects; each event is prefixed with
 * the subject's name when more than one subject is present.
 * @param {{task: object, subjectName: string}[]} rows
 * @param {string} calName
 */
export function buildIcs(rows, calName) {
  const multi = new Set(rows.map((r) => r.subjectName)).size > 1;
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//home-manual//EN',
    `X-WR-CALNAME:${icsEscape(calName)}`,
  ];

  for (const { task, subjectName } of rows) {
    if (!task.nextDue || task.paused) continue;
    const title = multi ? `[${subjectName}] ${task.title}` : task.title;
    const dt = task.nextDue.replace(/-/g, '');
    const rrule = task.oneShot ? '' : rruleFor(task);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${task.id}@home-manual`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:${icsEscape(title)}`,
      task.why ? `DESCRIPTION:${icsEscape(task.why)}` : '',
      rrule,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(title)}`,
      'TRIGGER:-PT12H',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}
