// config.js
/**
 * App identity and structure. The tab bar, database schema, and test tooling
 * are all driven from here.
 *
 * When releasing, bump `version` here plus CACHE_VERSION in sw.js and
 * "version" in version.json - check-ui.py fails the build if they drift.
 */

export const APP = {
  name: 'Home Manual',
  short: 'Manual',
  tagline: "The manual your house didn't come with.",
  version: '2.1.0',

  /** IndexedDB database name. Changing this on a live app orphans user data. */
  db: 'home-manual',

  /**
   * Object stores. `meta` is created automatically by the store layer.
   * v1 shipped tasks/assets/log without indexes; the upgrade path in store.js
   * adds the subject indexes and the new stores.
   */
  stores: [
    { name: 'subjects', keyPath: 'id' },
    { name: 'rooms', keyPath: 'id', indexes: [{ name: 'bySubject', path: 'subjectId' }] },
    { name: 'tasks', keyPath: 'id', indexes: [{ name: 'bySubject', path: 'subjectId' }] },
    { name: 'assets', keyPath: 'id', indexes: [{ name: 'bySubject', path: 'subjectId' }] },
    { name: 'log', keyPath: 'id', indexes: [{ name: 'taskId', path: 'taskId' }] },
    { name: 'photos', keyPath: 'id', indexes: [{ name: 'bySubject', path: 'subjectId' }] },
    { name: 'inspections', keyPath: 'id', indexes: [{ name: 'bySubject', path: 'subjectId' }] },
    { name: 'lists', keyPath: 'id' },
    { name: 'contacts', keyPath: 'id' },
  ],

  /** Bottom tab bar. Each id needs a <section id="screen-{id}"> in index.html. */
  tabs: [
    { id: 'home', label: 'Home', icon: '\u2302' },
    { id: 'tasks', label: 'Tasks', icon: '\u2713' },
    { id: 'manual', label: 'Manual', icon: '\u25A4' },
    { id: 'photos', label: 'Photos', icon: '\u25A3' },
    { id: 'more', label: 'More', icon: '\u22EF' },
  ],

  /** Screens reachable outside the tab bar. */
  extraScreens: ['setup', 'inspect'],
};

/** All screen ids the shell knows about, tabs first. */
export const SCREEN_IDS = [
  ...APP.tabs.map((t) => `screen-${t.id}`),
  ...APP.extraScreens.map((s) => `screen-${s}`),
];

/** Subject kinds, their labels and glyphs. */
export const KINDS = {
  house: { label: 'House', glyph: '\u2302', plural: 'Houses' },
  vehicle: { label: 'Vehicle', glyph: '\u26FD', plural: 'Vehicles' },
  pet: { label: 'Pet', glyph: '\u2764', plural: 'Pets' },
};

/** Photo document types, in display order. */
export const DOC_TYPES = [
  { id: 'photo', label: 'Photo' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'warranty', label: 'Warranty' },
  { id: 'manual', label: 'Manual page' },
  { id: 'paper', label: 'Paperwork' },
];
