// app.js
/**
 * Application shell and screens.
 *
 * Layout of this file:
 *   1. helpers and sheet host
 *   2. navigation
 *   3. subject state and switching
 *   4. Home
 *   5. Tasks (list, task sheet, completion, editor, idea browser)
 *   6. Manual (rooms, equipment, facts)
 *   7. Photos (capture, tagging, browsing)
 *   8. Inspection tool
 *   9. More (subjects, calendar, backup, updates)
 *  10. Setup wizard and subject forms
 *  11. boot
 */

import { APP, SCREEN_IDS, KINDS, DOC_TYPES } from './config.js';
import {
  getMeta, setMeta, list, listBy, put, putMany, remove, removeMany,
  newId, migrateV1, exportBackup, importBackup, clearAllData,
} from './store.js';
import {
  todayIso, addDays, addInterval, daysBetween, fmtDate, fmtCadence,
  nextDueAfter, DEFAULT_FEATURES, matches, taskFromEntry, blankTask,
  seedTasks, seedWarrantyTasks, buildIcs,
} from './schedule.js';
import {
  CATS, catLabel, LIBRARY, HOUSE_SECTIONS, VEHICLE_FIELDS, PET_FIELDS,
  SPEC_SUGGESTIONS, INSPECTION_BANK, WARRANTY_MILESTONES,
  EQUIPMENT_CATALOG, RARE_EQUIPMENT, suggestRooms, CONTACT_KINDS,
  SERVICE_SUGGESTIONS,
} from './library.js';
import { processImage, urlFor } from './photos.js';
import {
  configure as configureUpdates, checkForUpdate, applyUpdate, forceReinstall,
  start as startUpdates,
} from './updates.js';

// ---------------------------------------------------------------------------
// 1. Helpers and sheet host
// ---------------------------------------------------------------------------

/** @param {string} id */
const $ = (id) => document.getElementById(id);

/**
 * On-screen error reporter. A home-screen web app has no visible console,
 * so a thrown exception otherwise looks like a dead button. Any uncaught
 * error or rejected promise surfaces here; tap to dismiss.
 */
function showErr(err) {
  const el = $('errToast');
  const msg = err && err.message ? err.message : String(err || 'Unknown error');
  el.textContent = `Something went wrong - tell the developer: ${msg}`;
  el.hidden = false;
  clearTimeout(showErr._t);
  showErr._t = setTimeout(() => { el.hidden = true; }, 12000);
}
window.addEventListener('error', (e) => showErr(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showErr(e.reason || 'A background save failed'));

/** Escape a string for safe insertion into HTML. */
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Trigger a browser download. */
function download(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Two stacked sheet layers. 0 is the base, 1 sits above it. */
const sheetState = [{ onClose: null }, { onClose: null }];

/**
 * Open a sheet.
 * @param {0|1} level
 * @param {{title: string, body: string, onMount?: Function, onClose?: Function}} opts
 */
function openSheet(level, opts) {
  $(`sheet${level}Title`).textContent = opts.title;
  $(`sheet${level}Body`).innerHTML = opts.body;
  sheetState[level].onClose = opts.onClose || null;
  $(`sheet${level}`).hidden = false;
  if (opts.onMount) opts.onMount($(`sheet${level}Body`));
}

/** Close a sheet layer. */
function closeSheet(level) {
  const el = $(`sheet${level}`);
  if (el.hidden) return;
  el.hidden = true;
  $(`sheet${level}Body`).innerHTML = '';
  const cb = sheetState[level].onClose;
  sheetState[level].onClose = null;
  if (cb) cb();
}

for (const level of [0, 1]) {
  $(`sheet${level}Close`).addEventListener('click', () => closeSheet(level));
  $(`sheet${level}`).addEventListener('click', (e) => {
    if (e.target.id === `sheet${level}`) closeSheet(level);
  });
}

$('lightboxImg').addEventListener('click', () => { $('lightboxImg').hidden = true; });
$('errToast').addEventListener('click', () => { $('errToast').hidden = true; });

// ---------------------------------------------------------------------------
// 2. Navigation
// ---------------------------------------------------------------------------

/** In-memory caches, loaded at boot and kept current by every mutation. */
const db = {
  subjects: [], rooms: [], tasks: [], assets: [], log: [], photos: [],
  inspections: [], lists: [], contacts: [],
};
let activeSubjectId = null;

function buildTabs() {
  $('tabs').innerHTML = APP.tabs.map((t, i) => `
    <button type="button" data-tab="${t.id}" aria-pressed="${i === 0}">
      <span class="tab-i">${t.icon}</span>${esc(t.label)}
      ${t.id === 'tasks' ? '<span class="tab-badge" id="tasksBadge" hidden></span>' : ''}
    </button>`).join('');
}

let currentScreen = 'screen-home';

/** Show one screen; hide the rest; sync the tab bar. */
function show(screenId) {
  currentScreen = screenId;
  SCREEN_IDS.forEach((id) => { const el = $(id); if (el) el.hidden = id !== screenId; });
  const isTab = APP.tabs.some((t) => `screen-${t.id}` === screenId);
  $('tabs').hidden = !isTab;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.setAttribute('aria-pressed', String(`screen-${b.dataset.tab}` === screenId));
  });
  window.scrollTo(0, 0);
}

const RENDERERS = {
  home: renderHome,
  tasks: renderTasks,
  manual: renderManual,
  photos: renderPhotos,
  more: renderMore,
};

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  RENDERERS[btn.dataset.tab]();
  show(`screen-${btn.dataset.tab}`);
});

/** Re-render whatever screen is on. */
function refresh() {
  const tab = currentScreen.replace('screen-', '');
  if (RENDERERS[tab]) RENDERERS[tab]();
  updateBadge();
}

// ---------------------------------------------------------------------------
// 3. Subjects
// ---------------------------------------------------------------------------

function activeSubject() {
  return db.subjects.find((s) => s.id === activeSubjectId) || db.subjects[0] || null;
}

function subjectById(id) {
  return db.subjects.find((s) => s.id === id) || null;
}

/**
 * Switch the active subject. Synchronous on purpose: the in-memory state and
 * every visible chip update immediately, and the meta write happens in the
 * background. Gating renders behind the database write is what made subject
 * switching feel dead on iOS.
 */
function setActiveSubject(id) {
  activeSubjectId = id;
  syncChips();
  setMeta('activeSubjectId', id).catch(showErr);
}

function tasksOf(subjectId) {
  return db.tasks.filter((t) => t.subjectId === subjectId);
}

/** Overdue count for a subject (unpaused, scheduled, past due). */
function overdueCount(subjectId) {
  const today = todayIso();
  return tasksOf(subjectId).filter((t) => !t.paused && t.nextDue && t.nextDue < today).length;
}

function updateBadge() {
  const total = db.subjects.reduce((n, s) => n + overdueCount(s.id), 0);
  const badge = $('tasksBadge');
  if (!badge) return;
  badge.hidden = total === 0;
  badge.textContent = total;
}

/** Subject label used in chips: name, ellipsized by CSS. */
function subjectChipLabel(s) {
  return s ? `${KINDS[s.kind].glyph} ${esc(s.name)} \u25BE` : 'Set up \u25BE';
}

function syncChips() {
  const s = activeSubject();
  for (const id of ['manualSubjectChip', 'photoSubjectChip']) {
    $(id).innerHTML = subjectChipLabel(s);
  }
}

/** The quick switcher, opened from any subject chip. */
function openSwitcher() {
  openSheet(0, {
    title: 'Switch to\u2026',
    body: `
      ${db.subjects.map((s) => `
        <button class="toggle-row ${s.id === activeSubjectId ? 'on' : ''}" data-pick="${s.id}" type="button">
          <span class="box">\u2713</span>
          <span>${KINDS[s.kind].glyph} ${esc(s.name)}</span>
        </button>`).join('')}
      <button class="btn btn-block btn-quiet" id="swAdd" type="button">Add another house, vehicle or pet</button>`,
    onMount(root) {
      root.querySelectorAll('[data-pick]').forEach((b) => {
        b.addEventListener('click', () => {
          setActiveSubject(b.dataset.pick);
          closeSheet(0);
          refresh();
        });
      });
      root.querySelector('#swAdd').addEventListener('click', () => {
        closeSheet(0);
        openAddSubject();
      });
    },
  });
}

for (const id of ['manualSubjectChip', 'photoSubjectChip']) {
  $(id).addEventListener('click', openSwitcher);
}

/** Kind picker, then the right form. */
function openAddSubject() {
  openSheet(0, {
    title: 'Add to the household',
    body: `
      <button class="toggle-row" id="addHouse" type="button"><span class="box"></span><span>${KINDS.house.glyph} A house</span></button>
      <button class="toggle-row" id="addVehicle" type="button"><span class="box"></span><span>${KINDS.vehicle.glyph} A vehicle</span></button>
      <button class="toggle-row" id="addPet" type="button"><span class="box"></span><span>${KINDS.pet.glyph} A pet</span></button>`,
    onMount(root) {
      root.querySelector('#addHouse').addEventListener('click', () => { closeSheet(0); openHouseWizard(null); });
      root.querySelector('#addVehicle').addEventListener('click', () => { closeSheet(0); openSimpleSubjectForm('vehicle', null); });
      root.querySelector('#addPet').addEventListener('click', () => { closeSheet(0); openSimpleSubjectForm('pet', null); });
    },
  });
}

/** Delete a subject and everything attached to it. */
async function deleteSubject(subject) {
  const ok = confirm(
    `Delete ${subject.name}?\n\nIts tasks, history, rooms, equipment, photos and `
    + 'check-ups all go with it. This cannot be undone.',
  );
  if (!ok) return;

  const ids = (arr) => arr.filter((r) => r.subjectId === subject.id).map((r) => r.id);
  await removeMany('rooms', ids(db.rooms));
  await removeMany('tasks', ids(db.tasks));
  await removeMany('assets', ids(db.assets));
  await removeMany('photos', ids(db.photos));
  await removeMany('inspections', ids(db.inspections));
  await removeMany('log', db.log.filter((r) => r.subjectId === subject.id).map((r) => r.id));
  await remove('subjects', subject.id);

  for (const key of Object.keys(db)) {
    db[key] = db[key].filter((r) => r.subjectId !== subject.id && r.id !== subject.id);
  }
  if (activeSubjectId === subject.id) {
    setActiveSubject(db.subjects[0] ? db.subjects[0].id : null);
  }
  if (!db.subjects.length) {
    openHouseWizard(null, { firstRun: true });
  } else {
    syncChips();
    refresh();
  }
}

// ---------------------------------------------------------------------------
// 4. Home
// ---------------------------------------------------------------------------

function renderHome() {
  const today = new Date();
  $('homeGreeting').textContent = today.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  $('subjectRail').innerHTML = db.subjects.map((s) => {
    const over = overdueCount(s.id);
    const kindSub = s.kind === 'house' ? 'House' : KINDS[s.kind].label;
    return `
      <button class="subject-card ${s.id === activeSubjectId ? 'on' : ''}" data-sub="${s.id}" type="button">
        ${over ? `<span class="s-badge">${over}</span>` : ''}
        <span class="s-glyph">${KINDS[s.kind].glyph}</span>
        <span class="s-name">${esc(s.name)}</span>
        <span class="s-sub">${kindSub}</span>
      </button>`;
  }).join('') + `
    <button class="subject-card add" id="railAdd" type="button">
      <span class="s-glyph">&#43;</span>
      <span class="s-name">Add</span>
      <span class="s-sub">house, car, pet</span>
    </button>`;

  $('subjectRail').querySelectorAll('[data-sub]').forEach((b) => {
    b.addEventListener('click', () => {
      // Tap = open: select the subject, expand only it, land on its tasks.
      setActiveSubject(b.dataset.sub);
      expandOnly(b.dataset.sub);
      renderTasks();
      show('screen-tasks');
    });
  });
  $('railAdd').addEventListener('click', openAddSubject);

  // Needs attention: overdue and next-7-days across every subject.
  const today0 = todayIso();
  const soonEnd = addDays(today0, 7);
  const rows = db.tasks
    .filter((t) => !t.paused && t.nextDue && t.nextDue <= soonEnd)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 8);

  $('attnHd').hidden = false;
  $('attnList').innerHTML = rows.length ? rows.map((t) => {
    const s = subjectById(t.subjectId);
    const over = t.nextDue < today0;
    const cls = over ? 't-over' : 't-soon';
    const dueCls = over ? 'due-over' : 'due-soon';
    const when = over ? `${daysBetween(t.nextDue, today0)}d overdue` : (t.nextDue === today0 ? 'today' : fmtDate(t.nextDue));
    return `
      <div class="task ${cls}">
        <div class="task-main" data-open-task="${t.id}">
          <span class="task-title">${esc(t.title)}</span>
          <span class="task-sub">${s ? `${KINDS[s.kind].glyph} ${esc(s.name)} \u00B7 ` : ''}<span class="${dueCls}">${when}</span></span>
        </div>
        <button class="mini" data-done="${t.id}" type="button" aria-label="Mark done">\u2713</button>
      </div>`;
  }).join('') : `
    <div class="empty"><p>Nothing needs you this week.</p>
    <p class="empty-sub">Overdue and upcoming tasks show up here.</p></div>`;

  wireTaskRows($('attnList'));
  renderLists();
}

/** The Lists section on Home: projects, shopping, whatever needs a list. */
function renderLists() {
  const lists = [...db.lists].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  $('listsCount').textContent = lists.length || '';
  $('homeLists').innerHTML = lists.map((l) => {
    const done = l.items.filter((i) => i.done).length;
    return `
      <div class="card card-tap" data-list="${l.id}">
        <h3 class="card-hd">${esc(l.name)}
          <span class="tag ${done === l.items.length && l.items.length ? 'w-ok' : 'w-soon'}">${done}/${l.items.length}</span></h3>
        <p class="card-sub">${l.kind === 'shopping' ? 'Shopping list' : 'Project list'}</p>
      </div>`;
  }).join('') || '<p class="setting-note">A weekend project, a hardware-store run - jot it here.</p>';
  $('homeLists').querySelectorAll('[data-list]').forEach((el) => {
    el.addEventListener('click', () => openListSheet(db.lists.find((l) => l.id === el.dataset.list)));
  });
}

$('btnNewList').addEventListener('click', () => {
  openSheet(0, {
    title: 'New list',
    body: `
      <label class="field"><span class="field-label">Name it</span>
        <input id="nlName" type="text" placeholder="Deck project, Hardware run, Costco…"></label>
      <div class="seg" id="nlKind">
        <button type="button" class="seg-opt on" data-v="project">Project</button>
        <button type="button" class="seg-opt" data-v="shopping">Shopping</button>
      </div>
      <div class="sheet-actions"><button class="btn btn-primary" id="nlSave" type="button">Create</button></div>`,
    onMount(root) {
      let kind = 'project';
      root.querySelectorAll('#nlKind .seg-opt').forEach((b) => {
        b.addEventListener('click', () => {
          kind = b.dataset.v;
          root.querySelectorAll('#nlKind .seg-opt').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
      root.querySelector('#nlSave').addEventListener('click', async () => {
        const list = {
          id: newId('list'), name: root.querySelector('#nlName').value.trim() || 'List',
          kind, items: [], created: new Date().toISOString(),
        };
        db.lists.push(list);
        closeSheet(0);
        openListSheet(list);
        await put('lists', list);
      });
    },
    onClose: () => renderLists(),
  });
});

/** One list: check items off, add, remove, rename, delete. */
function openListSheet(list) {
  const itemRow = (it) => `
    <div class="list-row ${it.done ? 'done' : ''}" data-item="${it.id}">
      <button class="list-check" type="button" data-toggle="${it.id}">✓</button>
      <span class="list-text">${esc(it.text)}</span>
      <button class="list-x" type="button" data-del="${it.id}" aria-label="Remove">×</button>
    </div>`;

  openSheet(0, {
    title: list.name,
    body: `
      <div id="liRows">${list.items.map(itemRow).join('') || '<p class="setting-note">Nothing on it yet.</p>'}</div>
      <div class="field-pair" style="margin-top:12px">
        <label class="field" style="flex:2.5"><span class="field-label">Add to the list</span>
          <input id="liNew" type="text" placeholder="2x4s, caulk, pick up mulch…"></label>
        <label class="field"><span class="field-label">&nbsp;</span>
          <button class="btn" id="liAdd" type="button" style="width:100%">Add</button></label>
      </div>
      <label class="field"><span class="field-label">List name</span>
        <input id="liName" type="text" value="${esc(list.name)}"></label>
      <div class="sheet-actions">
        <button class="btn btn-primary" id="liSave" type="button">Done</button>
        <button class="btn btn-danger" id="liDelete" type="button">Delete list</button>
      </div>`,
    onMount(root) {
      const persist = () => put('lists', list).catch(showErr);
      const rerender = () => openListSheet(list);
      root.querySelectorAll('[data-toggle]').forEach((b) => {
        b.addEventListener('click', () => {
          const it = list.items.find((x) => x.id === b.dataset.toggle);
          it.done = !it.done;
          persist();
          rerender();
        });
      });
      root.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          list.items = list.items.filter((x) => x.id !== b.dataset.del);
          persist();
          rerender();
        });
      });
      const add = () => {
        const inp = root.querySelector('#liNew');
        const text = inp.value.trim();
        if (!text) return;
        list.items.push({ id: newId('li'), text, done: false });
        persist();
        rerender();
      };
      root.querySelector('#liAdd').addEventListener('click', add);
      root.querySelector('#liNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      root.querySelector('#liSave').addEventListener('click', () => {
        list.name = root.querySelector('#liName').value.trim() || list.name;
        persist();
        closeSheet(0);
        renderLists();
      });
      root.querySelector('#liDelete').addEventListener('click', async () => {
        if (!confirm(`Delete "${list.name}"?`)) return;
        await remove('lists', list.id);
        db.lists = db.lists.filter((l) => l.id !== list.id);
        closeSheet(0);
        renderLists();
      });
    },
    onClose: () => renderLists(),
  });
}

/** Shared wiring for any container holding task rows. */
function wireTaskRows(root) {
  root.querySelectorAll('[data-open-task]').forEach((el) => {
    el.addEventListener('click', () => {
      const task = db.tasks.find((t) => t.id === el.dataset.openTask);
      if (!task) return;
      if (task.subjectId !== activeSubjectId) setActiveSubject(task.subjectId);
      openTaskSheet(task);
    });
  });
  root.querySelectorAll('[data-done]').forEach((el) => {
    el.addEventListener('click', () => {
      const task = db.tasks.find((t) => t.id === el.dataset.done);
      if (task) openDoneSheet(task, 0);
    });
  });
}

$('btnQuickPhoto').addEventListener('click', () => openCaptureChooser());
$('btnQuickTask').addEventListener('click', () => openAddTaskChooser());

// ---------------------------------------------------------------------------
// 5. Tasks
// ---------------------------------------------------------------------------

let collapsedCats = {};
let collapsedSubjects = null; // Set of subject ids folded shut on the Tasks tab

async function loadCollapsed() {
  collapsedCats = (await getMeta('collapsedCats')) || {};
  const savedSubjects = await getMeta('collapsedSubjects');
  collapsedSubjects = savedSubjects
    ? new Set(savedSubjects)
    : new Set(db.subjects.filter((s) => s.id !== activeSubjectId).map((s) => s.id));
}

/** Expand exactly one subject section; fold the rest. */
function expandOnly(subjectId) {
  collapsedSubjects = new Set(db.subjects.filter((s) => s.id !== subjectId).map((s) => s.id));
  setMeta('collapsedSubjects', [...collapsedSubjects]).catch(showErr);
}

function isCollapsed(subjectId, cat) {
  return Boolean((collapsedCats[subjectId] || []).includes(cat));
}

function toggleCollapsed(subjectId, cat) {
  const set = new Set(collapsedCats[subjectId] || []);
  if (set.has(cat)) set.delete(cat); else set.add(cat);
  collapsedCats[subjectId] = [...set];
  setMeta('collapsedCats', collapsedCats).catch(showErr);
}

/** Sort tasks within a category: overdue, scheduled, unscheduled, paused. */
function taskSort(a, b) {
  if (a.paused !== b.paused) return a.paused ? 1 : -1;
  const ad = a.nextDue || '9999';
  const bd = b.nextDue || '9999';
  if (ad !== bd) return ad.localeCompare(bd);
  return a.title.localeCompare(b.title);
}

function taskRowHtml(t) {
  const today = todayIso();
  let cls = 't-ok';
  let dueBit = '';
  if (t.paused) {
    cls = 't-paused';
    dueBit = 'Paused';
  } else if (t.nextDue) {
    const over = t.nextDue < today;
    const soon = !over && daysBetween(today, t.nextDue) <= 7;
    cls = over ? 't-over' : soon ? 't-soon' : 't-ok';
    const label = over
      ? `<span class="due-over">${daysBetween(t.nextDue, today)}d overdue</span>`
      : `<span class="${soon ? 'due-soon' : ''}">${t.nextDue === today ? 'Due today' : `Due ${fmtDate(t.nextDue)}`}</span>`;
    dueBit = label;
  } else {
    dueBit = 'No date \u00B7 tap to see';
  }
  const last = t.lastDone ? `Done ${fmtDate(t.lastDone)}` : 'Never done';
  return `
    <div class="task ${cls}">
      <div class="task-main" data-open-task="${t.id}">
        <span class="task-title">${esc(t.title)}</span>
        <span class="task-sub">${last} \u00B7 ${dueBit}</span>
      </div>
      <button class="mini" data-done="${t.id}" type="button" aria-label="Mark done">\u2713</button>
    </div>`;
}

/** Category groups for one subject's tasks. */
function subjectTasksHtml(s, mine, today) {
  const cats = CATS[s.kind] || CATS.house;
  const groups = cats.map((c) => {
    const group = mine.filter((t) => (t.cat || 'other') === c.id).sort(taskSort);
    if (!group.length) return '';
    const anyOver = group.some((t) => !t.paused && t.nextDue && t.nextDue < today);
    const open = !isCollapsed(s.id, c.id);
    return `
      <div class="cat-group">
        <button class="cat-hd ${open ? 'open' : ''}" data-cat="${s.id}:${c.id}" type="button">
          <span class="chev">\u203A</span>${esc(c.label)}
          ${anyOver ? '<span class="dot-over"></span>' : ''}
          <span class="count">${group.length}</span>
        </button>
        <div ${open ? '' : 'hidden'}>${group.map(taskRowHtml).join('')}</div>
      </div>`;
  }).join('');
  return (groups || '<p class="setting-note" style="margin-top:10px">No tasks yet.</p>')
    + `<button class="add-inline" data-addto="${s.id}" type="button">\u002B Add a task to ${esc(s.name)}</button>`;
}

/**
 * The Tasks tab: every subject as its own collapsible section, category
 * groups inside. No either/or switching - fold and unfold instead.
 */
function renderTasks() {
  if (!db.subjects.length) { $('taskGroups').innerHTML = ''; return; }
  if (!collapsedSubjects) {
    collapsedSubjects = new Set(db.subjects.filter((s) => s.id !== activeSubjectId).map((s) => s.id));
  }
  const today = todayIso();

  $('taskGroups').innerHTML = db.subjects.map((s) => {
    const mine = tasksOf(s.id);
    const over = overdueCount(s.id);
    const open = !collapsedSubjects.has(s.id);
    return `
      <button class="subject-hd ${open ? 'open' : ''} ${s.id === activeSubjectId ? 'on' : ''}" data-subhd="${s.id}" type="button">
        <span class="chev">\u203A</span>
        <span>${KINDS[s.kind].glyph} ${esc(s.name)}</span>
        ${over ? `<span class="s-over">${over}</span>` : ''}
        <span class="s-count">${mine.length} tasks</span>
      </button>
      <div class="subject-body" ${open ? '' : 'hidden'}>${open ? subjectTasksHtml(s, mine, today) : ''}</div>`;
  }).join('');

  $('taskGroups').querySelectorAll('[data-subhd]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.subhd;
      if (collapsedSubjects.has(id)) {
        collapsedSubjects.delete(id);
        setActiveSubject(id); // opening a section makes it the active subject
      } else {
        collapsedSubjects.add(id);
      }
      setMeta('collapsedSubjects', [...collapsedSubjects]).catch(showErr);
      renderTasks();
    });
  });
  $('taskGroups').querySelectorAll('.cat-hd').forEach((b) => {
    b.addEventListener('click', () => {
      const [sid, cat] = b.dataset.cat.split(':');
      toggleCollapsed(sid, cat);
      renderTasks();
    });
  });
  $('taskGroups').querySelectorAll('[data-addto]').forEach((b) => {
    b.addEventListener('click', () => openAddTaskChooser(subjectById(b.dataset.addto)));
  });
  wireTaskRows($('taskGroups'));
  updateBadge();
}

$('btnAddTask').addEventListener('click', () => openAddTaskChooser());

/** "Write my own" or "Browse ideas". */
function openAddTaskChooser(subject) {
  const s = subject || activeSubject();
  if (!s) return;
  openSheet(0, {
    title: `Add a task \u00B7 ${esc(s.name)}`,
    body: `
      <button class="toggle-row" id="atOwn" type="button"><span class="box"></span><span>Write my own</span></button>
      <button class="toggle-row" id="atBrowse" type="button"><span class="box"></span><span>Browse task ideas</span></button>`,
    onMount(root) {
      root.querySelector('#atOwn').addEventListener('click', () => {
        closeSheet(0);
        openTaskEditor(blankTask(s.id, 'other'), { isNew: true });
      });
      root.querySelector('#atBrowse').addEventListener('click', () => {
        closeSheet(0);
        openIdeaBrowser(s);
      });
    },
  });
}

/** The library browser: every idea for this kind, suggested ones tagged. */
function openIdeaBrowser(subject) {
  const s = subject || activeSubject();
  const entries = LIBRARY[s.kind] || [];
  const existingKeys = new Set(tasksOf(s.id).map((t) => t.key).filter(Boolean));
  const cats = CATS[s.kind] || [];

  const catBlock = (c) => {
    const items = entries.filter((e) => e.cat === c.id);
    if (!items.length) return '';
    const suggestedMissing = items.filter((e) => matches(e, s.features) && !existingKeys.has(e.key));
    return `
      <div class="lib-cat">
        <div class="cat-hd open" style="cursor:default">
          ${esc(c.label)}
          ${suggestedMissing.length ? `<button class="spec-act" data-addcat="${c.id}" type="button" style="margin-left:auto">Add suggested (${suggestedMissing.length})</button>` : ''}
        </div>
        ${items.map((e) => {
    const has = existingKeys.has(e.key);
    const fit = matches(e, s.features);
    return `
          <div class="lib-row">
            <div class="lib-t">
              ${esc(e.title)} ${fit ? '<span class="fit">\u25CF fits</span>' : ''}
              <span class="lib-sub">${esc(fmtCadence(e))}</span>
            </div>
            <button class="lib-add" data-addkey="${e.key}" type="button" ${has ? 'disabled' : ''}>${has ? '\u2713' : '\u002B'}</button>
          </div>`;
  }).join('')}
      </div>`;
  };

  openSheet(0, {
    title: 'Task ideas',
    body: `<p class="setting-note">\u25CF fits = matches what you told us about ${esc(s.name)}. Add anything; every schedule is editable.</p>`
      + cats.map(catBlock).join(''),
    onMount(root) {
      const addEntry = async (entry) => {
        const start = todayIso();
        const due = entry.every || entry.windows
          ? (entry.windows ? null : addInterval(start, entry.every))
          : null;
        const task = taskFromEntry(entry, s.id, due);
        if (entry.windows) {
          task.nextDue = null; // seasonal: schedule from the sheet or leave listed
          const seeded = seedTasks(s.kind, s.features, s.id, start).find((t) => t.key === entry.key);
          if (seeded) task.nextDue = seeded.nextDue;
        }
        await put('tasks', task);
        db.tasks.push(task);
      };
      root.querySelectorAll('[data-addkey]').forEach((b) => {
        b.addEventListener('click', async () => {
          const entry = entries.find((e) => e.key === b.dataset.addkey);
          if (!entry) return;
          await addEntry(entry);
          b.disabled = true;
          b.textContent = '\u2713';
          updateBadge();
        });
      });
      root.querySelectorAll('[data-addcat]').forEach((b) => {
        b.addEventListener('click', async () => {
          const catId = b.dataset.addcat;
          const keys = new Set(tasksOf(s.id).map((t) => t.key).filter(Boolean));
          const toAdd = entries.filter((e) => e.cat === catId && matches(e, s.features) && !keys.has(e.key));
          for (const e of toAdd) await addEntry(e);
          closeSheet(0);
          renderTasks();
        });
      });
    },
    onClose: () => refresh(),
  });
}

/** The task detail sheet: why, how, photos, history, actions. */
/**
 * Resolve the equipment a task belongs to: an explicit link first, then a
 * fuzzy match on the library's assetHint against the subject's equipment
 * (exact name, then containment) so auto-created equipment shows up in
 * seeded tasks without any manual linking.
 */
function assetForTask(task) {
  const explicit = db.assets.find((a) => a.id === task.assetId);
  if (explicit || !task.assetHint) return explicit || null;
  const mine = db.assets.filter((a) => a.subjectId === task.subjectId);
  const hint = task.assetHint.toLowerCase();
  return mine.find((a) => a.name.toLowerCase() === hint)
    || mine.find((a) => {
      const n = a.name.toLowerCase();
      return n.includes(hint) || hint.includes(n);
    })
    || null;
}

function openTaskSheet(task) {
  const s = subjectById(task.subjectId);
  const asset = assetForTask(task);
  const history = db.log.filter((l) => l.taskId === task.id)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const photos = db.photos.filter((p) => task.photoIds.includes(p.id));
  const today = todayIso();

  const dueLine = task.paused ? 'Paused'
    : task.nextDue
      ? (task.nextDue < today ? `Due ${fmtDate(task.nextDue)} \u00B7 overdue` : `Due ${fmtDate(task.nextDue)}`)
      : 'No date set';

  openSheet(0, {
    title: task.title,
    body: `
      <p class="sheet-meta">${esc(fmtCadence(task))} \u00B7 ${esc(dueLine)}</p>
      ${task.lastDone ? `<p class="sheet-meta">Last done ${esc(fmtDate(task.lastDone))}</p>` : ''}
      ${task.why ? `<p style="font-size:14px; margin:10px 0 0">${esc(task.why)}</p>` : ''}
      ${asset ? `
        <div class="sheet-sec">
          <h3 class="sheet-sec-hd">What to buy / its equipment</h3>
          <div class="chip-row"><button class="chip brass" id="tsAsset" type="button">${esc(asset.name)}${asset.model ? ` \u00B7 ${esc([asset.brand, asset.model].filter(Boolean).join(' '))}` : ''}</button></div>
          ${(asset.specs || []).length
    ? (asset.specs || []).map(specRowHtml).join('')
    : '<p class="setting-note" style="margin:6px 0 0">Tap the chip and add its model # and sizes - they\u2019ll show right here next time.</p>'}
        </div>`
    : (task.assetHint ? `<p class="sheet-meta">Goes with: ${esc(task.assetHint)}</p>` : '')}

      ${task.how || task.note || photos.length ? `
        <div class="sheet-sec">
          <h3 class="sheet-sec-hd">How to do it</h3>
          ${task.how ? `<div class="how-box">${esc(task.how)}</div>` : ''}
          ${task.note ? `<div class="how-box" style="margin-top:8px; border-left-color: var(--rule-2)">${esc(task.note)}</div>` : ''}
          ${photos.length ? `<div class="thumb-row" id="tsPhotos"></div>` : ''}
        </div>` : ''}
      <div class="chip-row">
        <button class="chip" id="tsAddPhoto" type="button">\u002B Photo to this task</button>
        ${task.link ? `<a class="chip" href="${esc(task.link)}" target="_blank" rel="noopener">Open link \u2197</a>` : ''}
      </div>

      ${history.length ? `
        <div class="sheet-sec">
          <h3 class="sheet-sec-hd">History</h3>
          ${history.map((l) => `<div class="hist-row"><span class="hist-date">${esc(fmtDate(l.date))}</span><span class="hist-note">${esc(l.note) || 'Done'}</span></div>`).join('')}
        </div>` : ''}

      <div class="sheet-actions">
        <button class="btn btn-primary" id="tsDone" type="button">Mark done</button>
        <button class="btn" id="tsEdit" type="button">Edit</button>
      </div>`,
    onMount(root) {
      if (photos.length) {
        const holder = root.querySelector('#tsPhotos');
        for (const p of photos) {
          const btn = document.createElement('button');
          btn.className = 'ph';
          btn.type = 'button';
          const img = document.createElement('img');
          img.src = urlFor(p.thumb || p.blob);
          btn.appendChild(img);
          btn.addEventListener('click', () => {
            $('lightboxImg').src = urlFor(p.blob);
            $('lightboxImg').hidden = false;
          });
          holder.appendChild(btn);
        }
      }
      const assetBtn = root.querySelector('#tsAsset');
      if (assetBtn) assetBtn.addEventListener('click', () => { closeSheet(0); openAssetSheet(asset); });
      root.querySelector('#tsAddPhoto').addEventListener('click', () => {
        captureInto({ taskId: task.id, subjectId: task.subjectId });
      });
      root.querySelector('#tsDone').addEventListener('click', () => openDoneSheet(task, 1));
      root.querySelector('#tsEdit').addEventListener('click', () => openTaskEditor(task, { isNew: false, level: 1 }));
    },
    onClose: () => refresh(),
  });
}

/**
 * Completion sheet: date, note, and "schedule the next one" chips.
 * @param {object} task
 * @param {0|1} level sheet layer to use
 */
function openDoneSheet(task, level) {
  const usual = task.every || task.windows;
  const chips = [
    ...(usual && !task.oneShot ? [{ id: 'usual', label: `Usual (${fmtCadence(task)})` }] : []),
    { id: 'm1', label: '1 month' }, { id: 'm3', label: '3 months' },
    { id: 'm6', label: '6 months' }, { id: 'y1', label: '1 year' },
    { id: 'pick', label: 'Pick a date' }, { id: 'none', label: "Don't schedule" },
  ];
  let choice = usual && !task.oneShot ? 'usual' : 'none';

  openSheet(level, {
    title: `Done: ${task.title}`,
    body: `
      <label class="field"><span class="field-label">When did you do it?</span>
        <input id="dnDate" type="date" value="${todayIso()}"></label>
      <label class="field"><span class="field-label">Note (filter brand, mileage, who did it\u2026)</span>
        <input id="dnNote" type="text" placeholder="Optional"></label>
      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Schedule the next one?</h3>
        <div class="seg" id="dnSeg">
          ${chips.map((c) => `<button type="button" class="seg-opt ${c.id === choice ? 'on' : ''}" data-v="${c.id}">${esc(c.label)}</button>`).join('')}
        </div>
        <label class="field" id="dnPickWrap" hidden style="margin-top:10px"><span class="field-label">Next date</span>
          <input id="dnPick" type="date"></label>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-primary" id="dnSave" type="button">Save</button>
      </div>`,
    onMount(root) {
      root.querySelectorAll('#dnSeg .seg-opt').forEach((b) => {
        b.addEventListener('click', () => {
          choice = b.dataset.v;
          root.querySelectorAll('#dnSeg .seg-opt').forEach((x) => x.classList.toggle('on', x === b));
          root.querySelector('#dnPickWrap').hidden = choice !== 'pick';
        });
      });
      root.querySelector('#dnSave').addEventListener('click', async () => {
        const date = root.querySelector('#dnDate').value || todayIso();
        const note = root.querySelector('#dnNote').value.trim();

        const entry = { id: newId('log'), taskId: task.id, subjectId: task.subjectId, date, note };
        await put('log', entry);
        db.log.push(entry);

        task.lastDone = date;
        if (choice === 'usual') task.nextDue = nextDueAfter(task, date);
        else if (choice === 'm1') task.nextDue = addInterval(date, { n: 1, unit: 'm' });
        else if (choice === 'm3') task.nextDue = addInterval(date, { n: 3, unit: 'm' });
        else if (choice === 'm6') task.nextDue = addInterval(date, { n: 6, unit: 'm' });
        else if (choice === 'y1') task.nextDue = addInterval(date, { n: 1, unit: 'y' });
        else if (choice === 'pick') task.nextDue = root.querySelector('#dnPick').value || null;
        else task.nextDue = null;
        if (task.oneShot && choice === 'none') task.paused = false;
        await put('tasks', task);

        closeSheet(1);
        closeSheet(0);
        refresh();
      });
    },
  });
}

/**
 * Task editor for new and existing tasks.
 * @param {object} task a task record (mutated on save)
 * @param {{isNew: boolean, level?: 0|1}} opts
 */
function openTaskEditor(task, { isNew, level = 0 }) {
  const s = subjectById(task.subjectId) || activeSubject();
  const cats = CATS[s.kind] || CATS.house;
  const assets = db.assets.filter((a) => a.subjectId === s.id);

  let mode = task.every ? 'every' : task.windows ? 'season' : task.oneShot ? 'once' : 'none';

  openSheet(level, {
    title: isNew ? 'New task' : 'Edit task',
    body: `
      <label class="field"><span class="field-label">What needs doing?</span>
        <input id="teTitle" type="text" value="${esc(task.title)}" placeholder="e.g. Replace water filter"></label>
      <label class="field"><span class="field-label">Category</span>
        <select id="teCat">${cats.map((c) => `<option value="${c.id}" ${c.id === task.cat ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>

      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Schedule</h3>
        <div class="seg" id="teMode">
          <button type="button" class="seg-opt ${mode === 'every' ? 'on' : ''}" data-v="every">Repeats</button>
          <button type="button" class="seg-opt ${mode === 'season' ? 'on' : ''}" data-v="season">Season</button>
          <button type="button" class="seg-opt ${mode === 'once' ? 'on' : ''}" data-v="once">One time</button>
          <button type="button" class="seg-opt ${mode === 'none' ? 'on' : ''}" data-v="none">No date</button>
        </div>
        <div class="field-pair" id="teEveryWrap" ${mode === 'every' ? '' : 'hidden'} style="margin-top:10px">
          <label class="field"><span class="field-label">Every</span>
            <input id="teN" type="number" min="1" max="60" value="${task.every ? task.every.n : 3}"></label>
          <label class="field"><span class="field-label">&nbsp;</span>
            <select id="teUnit">
              <option value="w" ${task.every?.unit === 'w' ? 'selected' : ''}>weeks</option>
              <option value="m" ${!task.every || task.every.unit === 'm' ? 'selected' : ''}>months</option>
              <option value="y" ${task.every?.unit === 'y' ? 'selected' : ''}>years</option>
            </select></label>
        </div>
        <p class="setting-note" id="teSeasonNote" ${mode === 'season' ? '' : 'hidden'} style="margin-top:8px">
          Seasonal: ${esc(fmtCadence(task))}. Set the next date below; after each completion the app suggests the next season.</p>
        <label class="field" id="teDueWrap" style="margin-top:10px" ${mode === 'none' ? 'hidden' : ''}>
          <span class="field-label">Next due</span>
          <input id="teDue" type="date" value="${task.nextDue || ''}"></label>
      </div>

      <label class="field"><span class="field-label">Goes with (equipment)</span>
        <select id="teAsset">
          <option value="">\u2014</option>
          ${assets.map((a) => `<option value="${a.id}" ${a.id === task.assetId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select></label>
      <label class="field"><span class="field-label">Instructions / how-to</span>
        <textarea id="teHow" rows="3" placeholder="Steps for future-you (filter size, which valve, arrow direction\u2026)">${esc(task.how)}</textarea></label>
      <label class="field"><span class="field-label">Notes</span>
        <textarea id="teNote" rows="2" placeholder="Anything else">${esc(task.note)}</textarea></label>
      <label class="field"><span class="field-label">Link (product page, video)</span>
        <input id="teLink" type="url" value="${esc(task.link)}" placeholder="https://"></label>
      <button class="toggle-row ${task.paused ? 'on' : ''}" id="tePaused" type="button">
        <span class="box">\u2713</span><span>Paused (keep it, hide the nagging)</span></button>

      <div class="sheet-actions">
        <button class="btn btn-primary" id="teSave" type="button">Save</button>
        ${isNew ? '' : '<button class="btn btn-danger" id="teDelete" type="button">Delete</button>'}
      </div>`,
    onMount(root) {
      root.querySelectorAll('#teMode .seg-opt').forEach((b) => {
        b.addEventListener('click', () => {
          mode = b.dataset.v;
          root.querySelectorAll('#teMode .seg-opt').forEach((x) => x.classList.toggle('on', x === b));
          root.querySelector('#teEveryWrap').hidden = mode !== 'every';
          root.querySelector('#teSeasonNote').hidden = mode !== 'season';
          root.querySelector('#teDueWrap').hidden = mode === 'none';
        });
      });
      root.querySelector('#tePaused').addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('on');
      });
      root.querySelector('#teSave').addEventListener('click', async () => {
        task.title = root.querySelector('#teTitle').value.trim() || 'Untitled task';
        task.cat = root.querySelector('#teCat').value;
        task.assetId = root.querySelector('#teAsset').value || null;
        task.how = root.querySelector('#teHow').value.trim();
        task.note = root.querySelector('#teNote').value.trim();
        task.link = root.querySelector('#teLink').value.trim();
        task.paused = root.querySelector('#tePaused').classList.contains('on');

        const due = root.querySelector('#teDue').value || null;
        if (mode === 'every') {
          task.every = {
            n: Math.max(1, Number(root.querySelector('#teN').value) || 1),
            unit: root.querySelector('#teUnit').value,
          };
          task.windows = null;
          task.oneShot = false;
          task.nextDue = due || addInterval(todayIso(), task.every);
        } else if (mode === 'season') {
          task.every = null;
          task.oneShot = false;
          task.nextDue = due;
        } else if (mode === 'once') {
          task.every = null;
          task.windows = null;
          task.oneShot = true;
          task.nextDue = due;
        } else {
          task.every = null;
          task.windows = null;
          task.oneShot = false;
          task.nextDue = null;
        }

        await put('tasks', task);
        if (isNew) db.tasks.push(task);
        closeSheet(1);
        closeSheet(0);
        refresh();
      });
      const del = root.querySelector('#teDelete');
      if (del) {
        del.addEventListener('click', async () => {
          if (!confirm(`Delete "${task.title}" and its history?`)) return;
          const logIds = db.log.filter((l) => l.taskId === task.id).map((l) => l.id);
          await removeMany('log', logIds);
          await remove('tasks', task.id);
          db.log = db.log.filter((l) => l.taskId !== task.id);
          db.tasks = db.tasks.filter((t) => t.id !== task.id);
          closeSheet(1);
          closeSheet(0);
          refresh();
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// 6. Manual
// ---------------------------------------------------------------------------

let manualQuery = '';
let setupHintDismissed = {};

$('manualSearch').addEventListener('input', (e) => {
  manualQuery = e.target.value.trim().toLowerCase();
  renderManual();
});

/** Case-insensitive match across the searchable text of a record. */
function hit(text) {
  return !manualQuery || text.toLowerCase().includes(manualQuery);
}

function warrantyTag(iso) {
  if (!iso) return '';
  const days = daysBetween(todayIso(), iso);
  if (days < 0) return '<span class="tag w-out">warranty over</span>';
  if (days <= 90) return `<span class="tag w-soon">warranty ${days}d</span>`;
  return `<span class="tag w-ok">under warranty</span>`;
}

function renderManual() {
  syncChips();
  const s = activeSubject();
  if (!s) { $('manualBody').innerHTML = ''; return; }

  if (s.kind === 'house') renderHouseManual(s);
  else renderSubjectManual(s);
}

function renderHouseManual(s) {
  const rooms = db.rooms.filter((r) => r.subjectId === s.id)
    .filter((r) => hit(`${r.name} ${r.dims || ''} ${(r.paint || []).map((p) => `${p.area} ${p.color} ${p.sheen}`).join(' ')} ${(r.specs || []).map((x) => `${x.k} ${x.v}`).join(' ')}`))
    .sort((a, b) => (a.floor || '').localeCompare(b.floor || '') || a.name.localeCompare(b.name));
  const assets = db.assets.filter((a) => a.subjectId === s.id)
    .filter((a) => hit(`${a.name} ${a.brand || ''} ${a.model || ''} ${(a.specs || []).map((x) => `${x.k} ${x.v}`).join(' ')}`))
    .sort((a, b) => a.name.localeCompare(b.name));
  const facts = (s.specs || []).filter((x) => hit(`${x.k} ${x.v}`));

  const eqTotal = db.assets.filter((a) => a.subjectId === s.id).length;
  const eqDone = db.assets.filter((a) => a.subjectId === s.id && a.model).length;
  const rmTotal = db.rooms.filter((r) => r.subjectId === s.id).length;
  const rmDone = db.rooms.filter((r) => r.subjectId === s.id && r.dims).length;
  const setupPending = eqTotal && (eqDone < eqTotal || rmDone < rmTotal)
    && !(setupHintDismissed[s.id]);

  const papers = db.photos.filter((p) => p.subjectId === s.id && p.docType && p.docType !== 'photo')
    .sort((a, b) => (b.taken || '').localeCompare(a.taken || ''));

  $('manualBody').innerHTML = `
    ${setupPending ? `
      <div class="progress-card" id="mProgress">
        <button class="p-x" id="mProgressX" type="button" aria-label="Dismiss">\u00D7</button>
        <p class="p-hd">Finish setting up ${esc(s.name)}</p>
        <p class="p-sub">Tap each card and copy what's on the label.
          Equipment with model #: ${eqDone}/${eqTotal} \u00B7 Rooms with sizes: ${rmDone}/${rmTotal}</p>
      </div>` : ''}
    <h2 class="section-hd">House facts <span class="count">${(s.specs || []).length}</span></h2>
    <div class="card">
      ${facts.length ? facts.map(specRowHtml).join('') : '<p class="setting-note" style="margin:0">Sq footage, paint colors, filter sizes, shutoff locations\u2026</p>'}
      <button class="btn btn-block btn-quiet" id="mFacts" type="button">Edit facts</button>
    </div>

    <h2 class="section-hd">Rooms <span class="count">${rooms.length}</span></h2>
    ${rooms.map((r) => `
      <div class="card card-tap" data-room="${r.id}">
        <h3 class="card-hd">${esc(r.name)}</h3>
        <p class="card-sub">${esc([r.floor, r.dims].filter(Boolean).join(' \u00B7 ')) || 'Tap to add details'}</p>
      </div>`).join('') || '<p class="setting-note">No rooms yet. Add them with the + button.</p>'}

    <h2 class="section-hd">Equipment <span class="count">${assets.length}</span></h2>
    ${assets.map((a) => `
      <div class="card card-tap" data-asset="${a.id}">
        <h3 class="card-hd">${esc(a.name)} ${warrantyTag(a.warrantyEnds)}</h3>
        <p class="card-sub">${esc([a.brand, a.model].filter(Boolean).join(' ')) || 'Tap to add model & specs'}</p>
      </div>`).join('') || '<p class="setting-note">The stuff with model numbers: furnace, fridge, mower\u2026 Add with +.</p>'}

    <h2 class="section-hd">Papers &amp; documents <span class="count">${papers.length}</span></h2>
    <div class="thumb-row" id="mHousePapers"></div>
    <p class="setting-note">Warranty scans, receipts, closing documents - snap them with the camera and tag the kind. Insurance and phone numbers live in <button class="chip" id="mContactsLink" type="button">People &amp; policies</button></p>`;

  const px = $('manualBody').querySelector('#mProgressX');
  if (px) {
    px.addEventListener('click', () => {
      setupHintDismissed[s.id] = true;
      setMeta('setupHintDismissed', setupHintDismissed).catch(showErr);
      renderManual();
    });
  }
  const papersHolder = $('manualBody').querySelector('#mHousePapers');
  for (const p of papers.slice(0, 12)) papersHolder.appendChild(photoThumb(p));
  const paperAdd = document.createElement('button');
  paperAdd.className = 'thumb-add';
  paperAdd.type = 'button';
  paperAdd.textContent = '+';
  paperAdd.addEventListener('click', () => openCaptureChooser({ subjectId: s.id }));
  papersHolder.appendChild(paperAdd);
  $('manualBody').querySelector('#mContactsLink').addEventListener('click', openContactsSheet);

  $('mFacts').addEventListener('click', () => openSpecsEditor(s, 'specs', SPEC_SUGGESTIONS.house, () => renderManual()));
  $('manualBody').querySelectorAll('[data-room]').forEach((el) => {
    el.addEventListener('click', () => openRoomSheet(db.rooms.find((r) => r.id === el.dataset.room)));
  });
  $('manualBody').querySelectorAll('[data-asset]').forEach((el) => {
    el.addEventListener('click', () => openAssetSheet(db.assets.find((a) => a.id === el.dataset.asset)));
  });
}

/** Vehicle and pet manual: details, facts, papers, history. */
function renderSubjectManual(s) {
  const facts = (s.specs || []).filter((x) => hit(`${x.k} ${x.v}`));
  const papers = db.photos.filter((p) => p.subjectId === s.id && p.docType !== 'photo')
    .sort((a, b) => (b.taken || '').localeCompare(a.taken || ''));
  const myTaskIds = new Set(tasksOf(s.id).map((t) => t.id));
  const history = db.log.filter((l) => myTaskIds.has(l.taskId))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const taskName = (id) => (db.tasks.find((t) => t.id === id) || {}).title || 'Task';

  const detailBits = s.kind === 'vehicle'
    ? [s.features.year, s.features.make, s.features.model, { gas: 'Gas', hybrid: 'Hybrid', ev: 'EV' }[s.features.fuel]]
    : [s.features.species, s.features.birthday ? `born ${fmtDate(s.features.birthday)}` : ''];

  $('manualBody').innerHTML = `
    <div class="card">
      <h3 class="card-hd">${esc(s.name)}</h3>
      <p class="card-sub">${esc(detailBits.filter(Boolean).join(' \u00B7 '))}</p>
      <button class="btn btn-block btn-quiet" id="mEditSubject" type="button">Edit details</button>
    </div>

    <h2 class="section-hd">Facts &amp; numbers <span class="count">${(s.specs || []).length}</span></h2>
    <div class="card">
      ${facts.length ? facts.map(specRowHtml).join('')
    : `<p class="setting-note" style="margin:0">${s.kind === 'vehicle' ? 'Tire size, wiper sizes, filters, VIN\u2026' : 'Chip number, vet, meds and doses\u2026'}</p>`}
      <button class="btn btn-block btn-quiet" id="mSubSpecs" type="button">Edit facts</button>
    </div>

    <h2 class="section-hd">Papers &amp; documents <span class="count">${papers.length}</span></h2>
    <div class="thumb-row" id="mPapers"></div>
    <p class="setting-note">Snap receipts, warranty cards, vaccine certificates with the camera and tag the type.</p>

    ${history.length ? `
      <h2 class="section-hd">History</h2>
      <div class="card">
        ${history.map((l) => `<div class="hist-row"><span class="hist-date">${esc(fmtDate(l.date))}</span><span class="hist-note">${esc(taskName(l.taskId))}${l.note ? ` \u2014 ${esc(l.note)}` : ''}</span></div>`).join('')}
      </div>` : ''}`;

  $('mEditSubject').addEventListener('click', () => openSimpleSubjectForm(s.kind, s));
  $('mSubSpecs').addEventListener('click', () => openSpecsEditor(s, 'specs', SPEC_SUGGESTIONS[s.kind] || [], () => renderManual()));

  const holder = $('mPapers');
  for (const p of papers.slice(0, 12)) holder.appendChild(photoThumb(p));
  const add = document.createElement('button');
  add.className = 'thumb-add';
  add.type = 'button';
  add.textContent = '+';
  add.addEventListener('click', () => openCaptureChooser());
  holder.appendChild(add);
}

function specRowHtml(x) {
  const q = encodeURIComponent(x.v);
  return `
    <div class="spec-row">
      <span class="spec-k">${esc(x.k)}</span>
      <span class="spec-v">${esc(x.v)}</span>
      <button class="spec-act" data-copy="${esc(x.v)}" type="button">Copy</button>
      <a class="spec-act" href="https://www.amazon.com/s?k=${q}" target="_blank" rel="noopener">Find</a>
    </div>`;
}

/** Wire Copy buttons anywhere in the document (event delegation). */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  navigator.clipboard?.writeText(btn.dataset.copy).then(() => {
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = old; }, 900);
  });
});

/**
 * Generic key/value list editor, used for house facts, room specs,
 * equipment specs, vehicle and pet facts.
 * @param {object} owner record holding the list
 * @param {string} field property name on the record
 * @param {string[]} suggestions chips that prefill the name field
 * @param {Function} onSaved
 */
function openSpecsEditor(owner, field, suggestions, onSaved) {
  const working = (owner[field] || []).map((x) => ({ ...x }));

  const rowHtml = (x, i) => `
    <div class="field-pair" data-i="${i}">
      <label class="field"><span class="field-label">Name</span>
        <input class="sp-k" type="text" value="${esc(x.k)}" placeholder="e.g. Filter size"></label>
      <label class="field"><span class="field-label">Value</span>
        <input class="sp-v" type="text" value="${esc(x.v)}" placeholder="e.g. 20x25x1"></label>
    </div>`;

  openSheet(1, {
    title: 'Facts & numbers',
    body: `
      <div id="spRows">${working.map(rowHtml).join('')}</div>
      <button class="btn btn-block btn-quiet" id="spAdd" type="button">Add another</button>
      ${suggestions.length ? `<div class="chip-row">${suggestions.map((sg) => `<button class="chip" data-sg="${esc(sg)}" type="button">${esc(sg)}</button>`).join('')}</div>` : ''}
      <div class="sheet-actions"><button class="btn btn-primary" id="spSave" type="button">Save</button></div>`,
    onMount(root) {
      const rows = root.querySelector('#spRows');
      const collect = () => [...rows.querySelectorAll('.field-pair')].map((el) => ({
        k: el.querySelector('.sp-k').value.trim(),
        v: el.querySelector('.sp-v').value.trim(),
      })).filter((x) => x.k || x.v);
      const addRow = (k = '', v = '') => {
        rows.insertAdjacentHTML('beforeend', rowHtml({ k, v }, rows.children.length));
      };
      root.querySelector('#spAdd').addEventListener('click', () => addRow());
      root.querySelectorAll('[data-sg]').forEach((b) => {
        b.addEventListener('click', () => addRow(b.dataset.sg, ''));
      });
      if (!working.length) addRow();
      root.querySelector('#spSave').addEventListener('click', async () => {
        owner[field] = collect();
        const store = owner.kind ? 'subjects' : (owner.name !== undefined && owner.dims !== undefined ? 'rooms' : 'assets');
        await put(store, owner);
        closeSheet(1);
        onSaved();
      });
    },
  });
}

/** The + on the Manual tab: room, equipment, or fact. */
$('btnManualAdd').addEventListener('click', () => {
  const s = activeSubject();
  if (!s) return;
  if (s.kind !== 'house') {
    openSpecsEditor(s, 'specs', SPEC_SUGGESTIONS[s.kind] || [], () => renderManual());
    return;
  }
  openSheet(0, {
    title: 'Add to the manual',
    body: `
      <button class="toggle-row" id="maRoom" type="button"><span class="box"></span><span>A room</span></button>
      <button class="toggle-row" id="maEquip" type="button"><span class="box"></span><span>Equipment (has a model number)</span></button>
      <button class="toggle-row" id="maFact" type="button"><span class="box"></span><span>A house fact</span></button>`,
    onMount(root) {
      root.querySelector('#maRoom').addEventListener('click', async () => {
        closeSheet(0);
        const room = {
          id: newId('room'), subjectId: s.id, name: '', floor: '', dims: '',
          paint: [], specs: [], note: '',
        };
        openRoomSheet(room, true);
      });
      root.querySelector('#maEquip').addEventListener('click', () => {
        closeSheet(0);
        const asset = {
          id: newId('asset'), subjectId: s.id, roomId: null, name: '', brand: '',
          model: '', serial: '', warrantyEnds: '', specs: [], link: '', note: '',
        };
        openAssetSheet(asset, true);
      });
      root.querySelector('#maFact').addEventListener('click', () => {
        closeSheet(0);
        openSpecsEditor(s, 'specs', SPEC_SUGGESTIONS.house, () => renderManual());
      });
    },
  });
});

/** Room detail/editor sheet. */
function openRoomSheet(room, isNew = false) {
  const photos = db.photos.filter((p) => p.roomId === room.id);
  const equipment = db.assets.filter((a) => a.roomId === room.id);

  openSheet(0, {
    title: isNew ? 'New room' : room.name,
    body: `
      <div class="field-pair">
        <label class="field"><span class="field-label">Room name</span>
          <input id="rmName" type="text" value="${esc(room.name)}" placeholder="Kitchen"></label>
        <label class="field"><span class="field-label">Floor</span>
          <input id="rmFloor" type="text" value="${esc(room.floor)}" placeholder="Main"></label>
      </div>
      <label class="field"><span class="field-label">Dimensions</span>
        <input id="rmDims" type="text" value="${esc(room.dims)}" placeholder="12'2\u2033 \u00D7 13'6\u2033"></label>

      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Paint</h3>
        <div id="rmPaint">${(room.paint || []).map((p) => `
          <div class="spec-row"><span class="spec-k">${esc(p.area)}</span>
            <span class="spec-v">${esc([p.color, p.sheen, p.brand].filter(Boolean).join(' \u00B7 '))}</span>
            <button class="spec-act" data-copy="${esc([p.brand, p.color, p.sheen].filter(Boolean).join(' '))}" type="button">Copy</button>
          </div>`).join('') || '<p class="setting-note" style="margin:0">Color, sheen and brand - future-you will kiss present-you.</p>'}</div>
        <button class="btn btn-block btn-quiet" id="rmPaintAdd" type="button">Add paint</button>
      </div>

      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Sizes &amp; details</h3>
        <div id="rmSpecs">${(room.specs || []).map(specRowHtml).join('') || '<p class="setting-note" style="margin:0">Window sizes, bulb types, flooring\u2026</p>'}</div>
        <button class="btn btn-block btn-quiet" id="rmSpecsEdit" type="button">Edit details</button>
      </div>

      ${equipment.length ? `<div class="sheet-sec"><h3 class="sheet-sec-hd">In this room</h3>
        <div class="chip-row">${equipment.map((a) => `<button class="chip" data-eq="${a.id}" type="button">${esc(a.name)}</button>`).join('')}</div></div>` : ''}

      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Photos</h3>
        <div class="thumb-row" id="rmPhotos"></div>
      </div>

      <label class="field" style="margin-top:12px"><span class="field-label">Notes</span>
        <textarea id="rmNote" rows="2" placeholder="Quirks, squeaks, where the outlet hides">${esc(room.note)}</textarea></label>

      <div class="sheet-actions">
        <button class="btn btn-primary" id="rmSave" type="button">Save</button>
        ${isNew ? '' : '<button class="btn btn-danger" id="rmDelete" type="button">Delete</button>'}
      </div>`,
    onMount(root) {
      const holder = root.querySelector('#rmPhotos');
      for (const p of photos) holder.appendChild(photoThumb(p));
      const add = document.createElement('button');
      add.className = 'thumb-add';
      add.type = 'button';
      add.textContent = '+';
      add.addEventListener('click', () => captureInto({ roomId: room.id, subjectId: room.subjectId }));
      holder.appendChild(add);

      root.querySelectorAll('[data-eq]').forEach((b) => {
        b.addEventListener('click', () => {
          closeSheet(0);
          openAssetSheet(db.assets.find((a) => a.id === b.dataset.eq));
        });
      });

      const persist = async () => {
        room.name = root.querySelector('#rmName').value.trim() || 'Room';
        room.floor = root.querySelector('#rmFloor').value.trim();
        room.dims = root.querySelector('#rmDims').value.trim();
        room.note = root.querySelector('#rmNote').value.trim();
        await put('rooms', room);
        if (!db.rooms.some((r) => r.id === room.id)) db.rooms.push(room);
      };

      root.querySelector('#rmPaintAdd').addEventListener('click', async () => {
        await persist();
        openPaintEditor(room);
      });
      root.querySelector('#rmSpecsEdit').addEventListener('click', async () => {
        await persist();
        openSpecsEditor(room, 'specs', ['Windows', 'Bulbs', 'Flooring', 'Ceiling height'], () => openRoomSheet(room));
      });
      root.querySelector('#rmSave').addEventListener('click', async () => {
        await persist();
        closeSheet(0);
        renderManual();
      });
      const del = root.querySelector('#rmDelete');
      if (del) {
        del.addEventListener('click', async () => {
          if (!confirm(`Delete ${room.name}? Photos stay, untagged from the room.`)) return;
          for (const p of db.photos.filter((x) => x.roomId === room.id)) {
            p.roomId = null;
            await put('photos', p);
          }
          for (const a of db.assets.filter((x) => x.roomId === room.id)) {
            a.roomId = null;
            await put('assets', a);
          }
          await remove('rooms', room.id);
          db.rooms = db.rooms.filter((r) => r.id !== room.id);
          closeSheet(0);
          renderManual();
        });
      }
    },
  });
}

/** Paint entries editor for a room. */
function openPaintEditor(room) {
  const working = (room.paint || []).map((p) => ({ ...p }));
  const rowHtml = (p) => `
    <div class="pt-row" style="border-bottom:1px solid var(--rule); padding-bottom:8px; margin-bottom:8px">
      <div class="field-pair">
        <label class="field"><span class="field-label">Where</span>
          <input class="pt-area" type="text" value="${esc(p.area)}" placeholder="Walls / Trim / Ceiling"></label>
        <label class="field"><span class="field-label">Color</span>
          <input class="pt-color" type="text" value="${esc(p.color)}" placeholder="Agreeable Gray"></label>
      </div>
      <div class="field-pair">
        <label class="field"><span class="field-label">Sheen</span>
          <input class="pt-sheen" type="text" value="${esc(p.sheen)}" placeholder="Eggshell"></label>
        <label class="field"><span class="field-label">Brand / line</span>
          <input class="pt-brand" type="text" value="${esc(p.brand)}" placeholder="SW Duration"></label>
      </div>
    </div>`;

  openSheet(1, {
    title: `Paint \u00B7 ${room.name || 'room'}`,
    body: `
      <div id="ptRows">${working.map(rowHtml).join('')}</div>
      <button class="btn btn-block btn-quiet" id="ptAdd" type="button">Add another</button>
      <div class="sheet-actions"><button class="btn btn-primary" id="ptSave" type="button">Save</button></div>`,
    onMount(root) {
      const rows = root.querySelector('#ptRows');
      const addRow = () => rows.insertAdjacentHTML('beforeend', rowHtml({ area: '', color: '', sheen: '', brand: '' }));
      if (!working.length) addRow();
      root.querySelector('#ptAdd').addEventListener('click', addRow);
      root.querySelector('#ptSave').addEventListener('click', async () => {
        room.paint = [...rows.querySelectorAll('.pt-row')].map((el) => ({
          area: el.querySelector('.pt-area').value.trim(),
          color: el.querySelector('.pt-color').value.trim(),
          sheen: el.querySelector('.pt-sheen').value.trim(),
          brand: el.querySelector('.pt-brand').value.trim(),
        })).filter((p) => p.area || p.color);
        await put('rooms', room);
        closeSheet(1);
        openRoomSheet(room);
      });
    },
  });
}

/** Equipment detail/editor sheet. */
function openAssetSheet(asset, isNew = false) {
  const rooms = db.rooms.filter((r) => r.subjectId === asset.subjectId);
  const photos = db.photos.filter((p) => p.assetId === asset.id);
  const linkedTasks = db.tasks.filter((t) => t.assetId === asset.id);

  openSheet(0, {
    title: isNew ? 'New equipment' : asset.name,
    body: `
      <label class="field"><span class="field-label">What is it?</span>
        <input id="aqName" type="text" value="${esc(asset.name)}" placeholder="Water heater"></label>
      ${isNew ? `<div class="chip-row">${RARE_EQUIPMENT.map((n) => `<button class="chip" data-eqpick="${esc(n)}" type="button">${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="field-pair">
        <label class="field"><span class="field-label">Brand</span>
          <input id="aqBrand" type="text" value="${esc(asset.brand)}"></label>
        <label class="field"><span class="field-label">Model</span>
          <input id="aqModel" type="text" value="${esc(asset.model)}"></label>
      </div>
      <div class="field-pair">
        <label class="field"><span class="field-label">Serial #</span>
          <input id="aqSerial" type="text" value="${esc(asset.serial)}"></label>
        <label class="field"><span class="field-label">Warranty ends</span>
          <input id="aqWarranty" type="date" value="${esc(asset.warrantyEnds)}"></label>
      </div>
      <label class="field"><span class="field-label">Room</span>
        <select id="aqRoom"><option value="">\u2014</option>
          ${rooms.map((r) => `<option value="${r.id}" ${r.id === asset.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select></label>

      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Specs (filter sizes, bulb types, capacities)</h3>
        <div id="aqSpecs">${(asset.specs || []).map(specRowHtml).join('') || '<p class="setting-note" style="margin:0">"Filter: 20x25x1" \u00B7 "Bulb: BR30 2700K" \u00B7 Copy or Find buys it again in seconds.</p>'}</div>
        <button class="btn btn-block btn-quiet" id="aqSpecsEdit" type="button">Edit specs</button>
      </div>

      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Photos, receipts &amp; warranty papers</h3>
        <div class="thumb-row" id="aqPhotos"></div>
      </div>

      ${linkedTasks.length ? `<div class="sheet-sec"><h3 class="sheet-sec-hd">Its tasks</h3>
        <div class="chip-row">${linkedTasks.map((t) => `<button class="chip" data-lt="${t.id}" type="button">${esc(t.title)}</button>`).join('')}</div></div>` : ''}

      <label class="field" style="margin-top:12px"><span class="field-label">Link (manual PDF, product page)</span>
        <input id="aqLink" type="url" value="${esc(asset.link)}" placeholder="https://"></label>
      <label class="field"><span class="field-label">Notes</span>
        <textarea id="aqNote" rows="2">${esc(asset.note)}</textarea></label>

      <div class="sheet-actions">
        <button class="btn btn-primary" id="aqSave" type="button">Save</button>
        ${isNew ? '' : '<button class="btn btn-danger" id="aqDelete" type="button">Delete</button>'}
      </div>`,
    onMount(root) {
      root.querySelectorAll('[data-eqpick]').forEach((b) => {
        b.addEventListener('click', () => { root.querySelector('#aqName').value = b.dataset.eqpick; });
      });
      const holder = root.querySelector('#aqPhotos');
      for (const p of photos) holder.appendChild(photoThumb(p));
      const add = document.createElement('button');
      add.className = 'thumb-add';
      add.type = 'button';
      add.textContent = '+';
      add.addEventListener('click', () => captureInto({ assetId: asset.id, subjectId: asset.subjectId }));
      holder.appendChild(add);

      root.querySelectorAll('[data-lt]').forEach((b) => {
        b.addEventListener('click', () => {
          closeSheet(0);
          openTaskSheet(db.tasks.find((t) => t.id === b.dataset.lt));
        });
      });

      const persist = async () => {
        asset.name = root.querySelector('#aqName').value.trim() || 'Equipment';
        asset.brand = root.querySelector('#aqBrand').value.trim();
        asset.model = root.querySelector('#aqModel').value.trim();
        asset.serial = root.querySelector('#aqSerial').value.trim();
        asset.warrantyEnds = root.querySelector('#aqWarranty').value;
        asset.roomId = root.querySelector('#aqRoom').value || null;
        asset.link = root.querySelector('#aqLink').value.trim();
        asset.note = root.querySelector('#aqNote').value.trim();
        await put('assets', asset);
        if (!db.assets.some((a) => a.id === asset.id)) db.assets.push(asset);
      };

      root.querySelector('#aqSpecsEdit').addEventListener('click', async () => {
        await persist();
        openSpecsEditor(asset, 'specs', ['Filter size', 'Filter model #', 'Bulb type', 'Capacity', 'Battery type', 'Belt #'], () => openAssetSheet(asset));
      });
      root.querySelector('#aqSave').addEventListener('click', async () => {
        await persist();
        closeSheet(0);
        renderManual();
      });
      const del = root.querySelector('#aqDelete');
      if (del) {
        del.addEventListener('click', async () => {
          if (!confirm(`Delete ${asset.name}? Its photos stay, untagged.`)) return;
          for (const p of db.photos.filter((x) => x.assetId === asset.id)) {
            p.assetId = null;
            await put('photos', p);
          }
          for (const t of db.tasks.filter((x) => x.assetId === asset.id)) {
            t.assetId = null;
            await put('tasks', t);
          }
          await remove('assets', asset.id);
          db.assets = db.assets.filter((a) => a.id !== asset.id);
          closeSheet(0);
          renderManual();
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// 7. Photos
// ---------------------------------------------------------------------------

let photoTypeFilter = 'all';
let photoWhereFilter = 'all';

/** Small thumbnail button that opens the photo sheet. */
function photoThumb(p) {
  const btn = document.createElement('button');
  btn.className = 'ph';
  btn.type = 'button';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = urlFor(p.thumb || p.blob);
  btn.appendChild(img);
  if (p.docType && p.docType !== 'photo') {
    const lbl = document.createElement('span');
    lbl.className = 'ph-type';
    lbl.textContent = DOC_TYPES.find((d) => d.id === p.docType)?.label || p.docType;
    btn.appendChild(lbl);
  }
  btn.addEventListener('click', () => openPhotoSheet(p));
  return btn;
}

function renderPhotos() {
  syncChips();
  const s = activeSubject();
  if (!s) { $('photoGrid').innerHTML = ''; return; }

  // Filter rails
  const types = [{ id: 'all', label: 'All' }, ...DOC_TYPES];
  $('photoTypeRail').innerHTML = types.map((t) => `<button class="chip ${photoTypeFilter === t.id ? 'on' : ''}" data-tf="${t.id}" type="button">${esc(t.label)}</button>`).join('');

  const wheres = [{ id: 'all', label: 'Everywhere' }];
  for (const r of db.rooms.filter((r) => r.subjectId === s.id)) wheres.push({ id: `r:${r.id}`, label: r.name });
  for (const a of db.assets.filter((a) => a.subjectId === s.id)) wheres.push({ id: `a:${a.id}`, label: a.name });
  $('photoWhereRail').innerHTML = wheres.map((w) => `<button class="chip ${photoWhereFilter === w.id ? 'on' : ''}" data-wf="${w.id}" type="button">${esc(w.label)}</button>`).join('');

  $('photoTypeRail').querySelectorAll('[data-tf]').forEach((b) => {
    b.addEventListener('click', () => { photoTypeFilter = b.dataset.tf; renderPhotos(); });
  });
  $('photoWhereRail').querySelectorAll('[data-wf]').forEach((b) => {
    b.addEventListener('click', () => { photoWhereFilter = b.dataset.wf; renderPhotos(); });
  });

  let mine = db.photos.filter((p) => p.subjectId === s.id);
  if (photoTypeFilter !== 'all') mine = mine.filter((p) => (p.docType || 'photo') === photoTypeFilter);
  if (photoWhereFilter.startsWith('r:')) mine = mine.filter((p) => p.roomId === photoWhereFilter.slice(2));
  if (photoWhereFilter.startsWith('a:')) mine = mine.filter((p) => p.assetId === photoWhereFilter.slice(2));
  mine.sort((a, b) => (b.taken || '').localeCompare(a.taken || ''));

  if (!mine.length) {
    $('photoGrid').innerHTML = `
      <div class="empty"><p>No photos here yet.</p>
      <p class="empty-sub">Move-in photos, receipts, the inside of the breaker panel - snap it and tag it. Winter photos and warranty photos are just photos with dates.</p></div>`;
    return;
  }

  // Group by month
  $('photoGrid').innerHTML = '';
  let currentMonth = '';
  let grid = null;
  const monthName = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
  };
  for (const p of mine) {
    const ym = (p.taken || '').slice(0, 7) || 'undated';
    if (ym !== currentMonth) {
      currentMonth = ym;
      const hd = document.createElement('div');
      hd.className = 'month-hd';
      hd.textContent = ym === 'undated' ? 'Undated' : monthName(ym);
      $('photoGrid').appendChild(hd);
      grid = document.createElement('div');
      grid.className = 'photo-grid';
      $('photoGrid').appendChild(grid);
    }
    grid.appendChild(photoThumb(p));
  }
}

$('btnCamera').addEventListener('click', () => openCaptureChooser());

/** Pending tag context for the next capture. */
let pendingContext = null;

/** Camera or gallery chooser. Context pre-tags what the photo belongs to. */
function openCaptureChooser(context = {}) {
  pendingContext = { ...context };
  openSheet(0, {
    title: 'Add photos',
    body: `
      <button class="toggle-row" id="cpCam" type="button"><span class="box"></span><span>Take a photo <span class="chooser-sub">stored in this app only</span></span></button>
      <button class="toggle-row" id="cpGal" type="button"><span class="box"></span><span>Choose from my photos <span class="chooser-sub">stays in your photo roll too</span></span></button>
      <p class="setting-note" style="margin-top:10px">For anything important, shoot with the Camera app first, then add it here - it lives in both places. Any photo in the app can be pushed back out later with "Save a copy to my phone".</p>`,
    onMount(root) {
      root.querySelector('#cpCam').addEventListener('click', () => { closeSheet(0); $('camInput').click(); });
      root.querySelector('#cpGal').addEventListener('click', () => { closeSheet(0); $('galInput').click(); });
    },
  });
}

/** Direct capture into a known context (task, room, equipment). */
function captureInto(context) {
  openCaptureChooser(context);
}

async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const processed = [];
  for (const f of files) {
    try {
      processed.push(await processImage(f));
    } catch { /* skip unreadable file */ }
  }
  if (!processed.length) { alert('Could not read those photos.'); return; }
  openTagSheet(processed, pendingContext || {});
  pendingContext = null;
}

$('camInput').addEventListener('change', async (e) => { await handleFiles(e.target.files); e.target.value = ''; });
$('galInput').addEventListener('change', async (e) => { await handleFiles(e.target.files); e.target.value = ''; });

/**
 * Tag-and-save sheet for freshly captured photos.
 * @param {{blob: Blob, thumb: Blob}[]} processed
 * @param {{subjectId?, roomId?, assetId?, taskId?}} ctx
 */
function openTagSheet(processed, ctx) {
  const s = subjectById(ctx.subjectId) || activeSubject();
  const rooms = db.rooms.filter((r) => r.subjectId === s.id);
  const assets = db.assets.filter((a) => a.subjectId === s.id);

  openSheet(0, {
    title: processed.length === 1 ? 'Tag this photo' : `Tag these ${processed.length} photos`,
    body: `
      <p class="sheet-meta">${esc(s.name)}</p>
      <label class="field"><span class="field-label">What kind?</span>
        <div class="seg" id="tgType">
          ${DOC_TYPES.map((d, i) => `<button type="button" class="seg-opt ${i === 0 ? 'on' : ''}" data-v="${d.id}">${esc(d.label)}</button>`).join('')}
        </div></label>
      ${rooms.length ? `<label class="field"><span class="field-label">Room</span>
        <select id="tgRoom"><option value="">\u2014</option>
          ${rooms.map((r) => `<option value="${r.id}" ${r.id === ctx.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select></label>` : ''}
      ${assets.length ? `<label class="field"><span class="field-label">Equipment</span>
        <select id="tgAsset"><option value="">\u2014</option>
          ${assets.map((a) => `<option value="${a.id}" ${a.id === ctx.assetId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select></label>` : ''}
      <label class="field"><span class="field-label">Caption</span>
        <input id="tgCaption" type="text" placeholder="Optional - 'move-in', 'before winter', 'crack in garage'"></label>
      <label class="field"><span class="field-label">Date taken</span>
        <input id="tgDate" type="date" value="${todayIso()}"></label>
      <div class="sheet-actions"><button class="btn btn-primary" id="tgSave" type="button">Save</button></div>`,
    onMount(root) {
      let docType = DOC_TYPES[0].id;
      root.querySelectorAll('#tgType .seg-opt').forEach((b) => {
        b.addEventListener('click', () => {
          docType = b.dataset.v;
          root.querySelectorAll('#tgType .seg-opt').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
      root.querySelector('#tgSave').addEventListener('click', async () => {
        const roomSel = root.querySelector('#tgRoom');
        const assetSel = root.querySelector('#tgAsset');
        const recs = processed.map(({ blob, thumb }) => ({
          id: newId('ph'),
          subjectId: s.id,
          roomId: roomSel ? roomSel.value || null : ctx.roomId || null,
          assetId: assetSel ? assetSel.value || null : ctx.assetId || null,
          taskId: ctx.taskId || null,
          docType,
          caption: root.querySelector('#tgCaption').value.trim(),
          taken: root.querySelector('#tgDate').value || todayIso(),
          added: new Date().toISOString(),
          blob,
          thumb,
        }));
        await putMany('photos', recs);
        db.photos.push(...recs);
        if (ctx.taskId) {
          const task = db.tasks.find((t) => t.id === ctx.taskId);
          if (task) {
            task.photoIds = [...(task.photoIds || []), ...recs.map((r) => r.id)];
            await put('tasks', task);
          }
        }
        if (ctx.contactId) {
          const contact = db.contacts.find((x) => x.id === ctx.contactId);
          if (contact) {
            contact.photoIds = [...(contact.photoIds || []), ...recs.map((r) => r.id)];
            await put('contacts', contact);
          }
        }
        closeSheet(0);
        refresh();
      });
    },
  });
}

/**
 * Push a stored photo back out to the phone. The web platform cannot write
 * to the photo library silently, so this opens the share sheet when the
 * browser supports sharing files (iOS Safari does) and falls back to a
 * plain download (which lands in Files) otherwise.
 */
async function savePhotoToPhone(p) {
  const safe = (p.caption || 'photo').replace(/[^\w-]+/g, '_').slice(0, 40) || 'photo';
  const file = new File([p.blob], `${safe}-${p.taken || 'undated'}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch { /* user closed the share sheet */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Full-size photo sheet with tags, caption, delete. */
function openPhotoSheet(p) {
  const s = subjectById(p.subjectId);
  const room = db.rooms.find((r) => r.id === p.roomId);
  const asset = db.assets.find((a) => a.id === p.assetId);
  const rooms = db.rooms.filter((r) => r.subjectId === p.subjectId);
  const assets = db.assets.filter((a) => a.subjectId === p.subjectId);
  const typeLabel = DOC_TYPES.find((d) => d.id === (p.docType || 'photo'))?.label || 'Photo';

  openSheet(0, {
    title: p.caption || typeLabel,
    body: `
      <img class="photo-full" id="phImg" alt="Photo">
      <p class="sheet-meta">${esc(fmtDate(p.taken))} \u00B7 ${esc(typeLabel)}${s ? ` \u00B7 ${esc(s.name)}` : ''}${room ? ` \u00B7 ${esc(room.name)}` : ''}${asset ? ` \u00B7 ${esc(asset.name)}` : ''}</p>
      <label class="field"><span class="field-label">Caption</span>
        <input id="phCaption" type="text" value="${esc(p.caption)}"></label>
      <div class="field-pair">
        ${rooms.length ? `<label class="field"><span class="field-label">Room</span>
          <select id="phRoom"><option value="">\u2014</option>
          ${rooms.map((r) => `<option value="${r.id}" ${r.id === p.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
        ${assets.length ? `<label class="field"><span class="field-label">Equipment</span>
          <select id="phAsset"><option value="">\u2014</option>
          ${assets.map((a) => `<option value="${a.id}" ${a.id === p.assetId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="field-pair">
        <label class="field"><span class="field-label">Kind</span>
          <select id="phType">${DOC_TYPES.map((d) => `<option value="${d.id}" ${d.id === (p.docType || 'photo') ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Date taken</span>
          <input id="phDate" type="date" value="${esc(p.taken)}"></label>
      </div>
      <button class="btn btn-block btn-quiet" id="phToPhone" type="button">Save a copy to my phone</button>
      <div class="sheet-actions">
        <button class="btn btn-primary" id="phSave" type="button">Save</button>
        <button class="btn btn-danger" id="phDelete" type="button">Delete</button>
      </div>`,
    onMount(root) {
      const img = root.querySelector('#phImg');
      img.src = urlFor(p.blob);
      img.addEventListener('click', () => {
        $('lightboxImg').src = img.src;
        $('lightboxImg').hidden = false;
      });
      root.querySelector('#phToPhone').addEventListener('click', () => savePhotoToPhone(p));
      root.querySelector('#phSave').addEventListener('click', async () => {
        p.caption = root.querySelector('#phCaption').value.trim();
        const roomSel = root.querySelector('#phRoom');
        const assetSel = root.querySelector('#phAsset');
        if (roomSel) p.roomId = roomSel.value || null;
        if (assetSel) p.assetId = assetSel.value || null;
        p.docType = root.querySelector('#phType').value;
        p.taken = root.querySelector('#phDate').value || p.taken;
        await put('photos', p);
        closeSheet(0);
        refresh();
      });
      root.querySelector('#phDelete').addEventListener('click', async () => {
        if (!confirm('Delete this photo?')) return;
        await remove('photos', p.id);
        db.photos = db.photos.filter((x) => x.id !== p.id);
        for (const t of db.tasks.filter((t) => (t.photoIds || []).includes(p.id))) {
          t.photoIds = t.photoIds.filter((id) => id !== p.id);
          await put('tasks', t);
        }
        closeSheet(0);
        refresh();
      });
    },
  });
}

// ---------------------------------------------------------------------------
// 8. Inspection
// ---------------------------------------------------------------------------

let activeInspection = null;

$('btnInspection').addEventListener('click', () => {
  renderInspectHome();
  show('screen-inspect');
});
$('btnInspectBack').addEventListener('click', () => {
  activeInspection = null;
  renderMore();
  show('screen-more');
});

/** Landing view: continue, start, or review past check-ups. */
function renderInspectHome() {
  const s = activeSubject();
  const house = s && s.kind === 'house' ? s : db.subjects.find((x) => x.kind === 'house');
  $('inspectTitle').textContent = 'House check-up';
  $('inspectProgress').textContent = '';
  $('inspectDock').hidden = true;

  if (!house) {
    $('inspectBody').innerHTML = '<div class="empty"><p>Add a house first.</p></div>';
    return;
  }

  const past = db.inspections.filter((i) => i.subjectId === house.id)
    .sort((a, b) => (b.started || '').localeCompare(a.started || ''));
  const unfinished = past.find((i) => !i.finished);

  $('inspectBody').innerHTML = `
    <div class="card">
      <h3 class="card-hd">${esc(house.name)}</h3>
      <p class="setting-note">A once-a-year walk with your phone: outside, underneath, every faucet and
        detector. Twenty minutes that catches small problems while they're still small.</p>
      ${unfinished ? `<button class="btn btn-primary btn-block" id="inCont" type="button">Continue check-up from ${esc(fmtDate(unfinished.started))}</button>` : ''}
      <button class="btn btn-block ${unfinished ? 'btn-quiet' : 'btn-primary'}" id="inStart" type="button">Start a new check-up</button>
    </div>
    ${past.filter((i) => i.finished).length ? `
      <h2 class="section-hd">Past check-ups</h2>
      ${past.filter((i) => i.finished).map((i) => {
    const flags = i.items.filter((x) => x.state === 'flag').length;
    return `<div class="card card-tap" data-insp="${i.id}">
          <h3 class="card-hd">${esc(fmtDate(i.finished))} ${flags ? `<span class="tag w-out">${flags} flagged</span>` : '<span class="tag w-ok">all clear</span>'}</h3>
        </div>`;
  }).join('')}` : ''}`;

  const cont = $('inspectBody').querySelector('#inCont');
  if (cont) cont.addEventListener('click', () => { activeInspection = unfinished; renderInspectWalk(); });
  $('inspectBody').querySelector('#inStart').addEventListener('click', async () => {
    const items = [];
    for (const group of INSPECTION_BANK) {
      for (const item of group.items) {
        if (item.need && !item.need(house.features || {})) continue;
        items.push({ key: item.key, group: group.group, label: item.label, state: '', note: '' });
      }
    }
    activeInspection = {
      id: newId('insp'), subjectId: house.id, started: todayIso(), finished: null, items,
    };
    await put('inspections', activeInspection);
    db.inspections.push(activeInspection);
    renderInspectWalk();
  });
  $('inspectBody').querySelectorAll('[data-insp]').forEach((el) => {
    el.addEventListener('click', () => {
      activeInspection = db.inspections.find((i) => i.id === el.dataset.insp);
      renderInspectWalk(true);
    });
  });
}

/** The walk itself; readOnly for reviewing past records. */
function renderInspectWalk(readOnly = false) {
  const insp = activeInspection;
  $('inspectTitle').textContent = readOnly ? `Check-up \u00B7 ${fmtDate(insp.finished)}` : 'Walk the house';
  $('inspectDock').hidden = readOnly;

  const doneCount = insp.items.filter((i) => i.state).length;
  $('inspectProgress').textContent = `${doneCount}/${insp.items.length}`;

  const groups = [...new Set(insp.items.map((i) => i.group))];
  $('inspectBody').innerHTML = groups.map((g) => `
    <h2 class="section-hd">${esc(g)}</h2>
    ${insp.items.filter((i) => i.group === g).map((item, idx) => {
    const i = insp.items.indexOf(item);
    const stateCls = item.state === 'ok' ? 'st-ok' : item.state === 'flag' ? 'st-flag' : item.state === 'skip' ? 'st-skip' : '';
    return `
      <div class="insp-item ${stateCls}">
        <div class="insp-label">${esc(item.label)}</div>
        ${readOnly ? (item.state ? `<p class="sheet-meta">${item.state === 'ok' ? 'OK' : item.state === 'flag' ? `Flagged${item.note ? `: ${esc(item.note)}` : ''}` : 'Skipped'}</p>` : '')
    : `
        <div class="insp-acts">
          <button class="b ${item.state === 'ok' ? 'on-ok' : ''}" data-st="ok" data-i="${i}" type="button">OK</button>
          <button class="b ${item.state === 'flag' ? 'on-flag' : ''}" data-st="flag" data-i="${i}" type="button">Flag</button>
          <button class="b ${item.state === 'skip' ? 'on-skip' : ''}" data-st="skip" data-i="${i}" type="button">Skip</button>
        </div>
        ${item.state === 'flag' ? `
          <div class="insp-flag-box">
            <label class="field"><span class="field-label">What's wrong?</span>
              <input class="insp-note" data-i="${i}" type="text" value="${esc(item.note)}" placeholder="Describe it"></label>
            <button class="chip" data-flagphoto="${i}" type="button">\u002B Photo of it</button>
          </div>` : ''}`}
      </div>`;
  }).join('')}`).join('');

  if (readOnly) return;

  $('inspectBody').querySelectorAll('[data-st]').forEach((b) => {
    b.addEventListener('click', async () => {
      const i = Number(b.dataset.i);
      const item = insp.items[i];
      item.state = item.state === b.dataset.st ? '' : b.dataset.st;
      await put('inspections', insp);
      renderInspectWalk();
    });
  });
  $('inspectBody').querySelectorAll('.insp-note').forEach((inp) => {
    inp.addEventListener('change', async () => {
      insp.items[Number(inp.dataset.i)].note = inp.value.trim();
      await put('inspections', insp);
    });
  });
  $('inspectBody').querySelectorAll('[data-flagphoto]').forEach((b) => {
    b.addEventListener('click', () => {
      captureInto({ subjectId: insp.subjectId });
    });
  });
}

$('btnInspectFinish').addEventListener('click', async () => {
  const insp = activeInspection;
  if (!insp) return;
  const flags = insp.items.filter((i) => i.state === 'flag');
  const unchecked = insp.items.filter((i) => !i.state).length;
  const ok = confirm(
    `Finish this check-up?\n\n${flags.length} flagged \u00B7 ${unchecked} not checked.`
    + (flags.length ? '\n\nFlagged items stay in the record - handle them as tasks or calls.' : ''),
  );
  if (!ok) return;
  insp.finished = todayIso();
  await put('inspections', insp);
  activeInspection = null;
  renderInspectHome();
});

// ---------------------------------------------------------------------------
// 9. More
// ---------------------------------------------------------------------------

function renderMore() {
  $('subjectManageList').innerHTML = db.subjects.map((s) => `
    <div class="manage-row">
      <span>${KINDS[s.kind].glyph}</span>
      <span class="m-name">${esc(s.name)} <span class="m-kind">${KINDS[s.kind].label}</span></span>
      <button class="spec-act" data-medit="${s.id}" type="button">Edit</button>
      <button class="spec-act" data-mdel="${s.id}" type="button">Delete</button>
    </div>`).join('') || '<p class="setting-note">Nothing yet.</p>';

  $('subjectManageList').querySelectorAll('[data-medit]').forEach((b) => {
    b.addEventListener('click', () => {
      const s = subjectById(b.dataset.medit);
      if (!s) return;
      if (s.kind === 'house') openHouseWizard(s);
      else openSimpleSubjectForm(s.kind, s);
    });
  });
  $('subjectManageList').querySelectorAll('[data-mdel]').forEach((b) => {
    b.addEventListener('click', () => {
      const s = subjectById(b.dataset.mdel);
      if (s) deleteSubject(s);
    });
  });
}

$('btnAddSubject').addEventListener('click', openAddSubject);

$('btnIcs').addEventListener('click', () => {
  const rows = db.tasks
    .filter((t) => t.nextDue && !t.paused)
    .map((t) => ({ task: t, subjectName: (subjectById(t.subjectId) || {}).name || '' }));
  if (!rows.length) { alert('Nothing is scheduled yet.'); return; }
  download('home-manual.ics', buildIcs(rows, 'Home Manual'), 'text/calendar');
});

$('btnExport').addEventListener('click', async () => {
  const backup = await exportBackup({ includePhotos: false });
  download(`home-manual-backup-${todayIso()}.json`, JSON.stringify(backup));
});
$('btnExportFull').addEventListener('click', async () => {
  const backup = await exportBackup({ includePhotos: true });
  download(`home-manual-full-${todayIso()}.json`, JSON.stringify(backup));
});
$('btnImport').addEventListener('click', () => $('importInput').click());
$('btnSetupRestore').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const ok = confirm('Restoring replaces EVERYTHING currently in the app with the backup. Continue?');
    if (ok) {
      await importBackup(parsed);
      alert('Backup restored.');
      location.reload();
    }
  } catch (err) {
    alert(`Could not restore that file.\n\n${err.message}`);
  } finally {
    e.target.value = '';
  }
});

$('btnClear').addEventListener('click', async () => {
  if (!confirm('Erase every house, task, photo and record on this device? This cannot be undone.')) return;
  if (!confirm('Last chance - really erase everything?')) return;
  await clearAllData();
  location.reload();
});

configureUpdates({
  onStatus: (text, tone) => {
    const el = $('updateStatus');
    el.textContent = text;
    el.className = `setting-status${tone ? ` ${tone}` : ''}`;
  },
  onUpdateReady: (available, version) => {
    $('updateMsg').textContent = version ? `Version ${version} is ready` : 'Update available';
    $('updateBanner').hidden = !available;
  },
});
$('btnApplyUpdate').addEventListener('click', applyUpdate);
$('btnDismissUpdate').addEventListener('click', () => { $('updateBanner').hidden = true; });
$('btnCheckUpdate').addEventListener('click', () => checkForUpdate({ manual: true }));
$('btnForceReinstall').addEventListener('click', forceReinstall);

// ---------------------------------------------------------------------------
// 9b. People & policies
// ---------------------------------------------------------------------------

/** tel: href from a free-typed phone number. */
function telHref(phone) {
  return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
}

/** The contacts book: insurance, service pros, everyone else. */
function openContactsSheet() {
  const groups = CONTACT_KINDS.map((k) => {
    const rows = db.contacts.filter((c) => (c.kind || 'other') === k.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) return '';
    return `
      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">${esc(k.label)}</h3>
        ${rows.map((c) => `
          <div class="contact-row">
            <div class="contact-main" data-contact="${c.id}">
              <span class="contact-name">${esc(c.name)}</span>
              <span class="contact-sub">${esc([c.company, c.policyNo ? `#${c.policyNo}` : ''].filter(Boolean).join(' \u00B7 ')) || esc(c.phone || '')}</span>
            </div>
            ${c.phone ? `<a class="call-chip" href="${telHref(c.phone)}">Call</a>` : ''}
          </div>`).join('')}
      </div>`;
  }).join('');

  openSheet(0, {
    title: 'People & policies',
    body: `
      ${groups || '<p class="setting-note">Insurance policies with their numbers, the plumber you trust, the vet, the HVAC company on the sticker\u2026</p>'}
      <button class="btn btn-primary btn-block" id="ctAdd" type="button">Add someone</button>`,
    onMount(root) {
      root.querySelectorAll('[data-contact]').forEach((el) => {
        el.addEventListener('click', () => {
          openContactEditor(db.contacts.find((c) => c.id === el.dataset.contact));
        });
      });
      root.querySelector('#ctAdd').addEventListener('click', () => openContactEditor(null));
    },
  });
}

/** Create/edit one contact or policy, with attached document photos. */
function openContactEditor(existing) {
  const c = existing || {
    id: newId('ct'), kind: 'service', name: '', company: '', phone: '',
    policyNo: '', note: '', photoIds: [],
  };
  const photos = db.photos.filter((p) => (c.photoIds || []).includes(p.id));

  openSheet(1, {
    title: existing ? c.name || 'Edit' : 'Add someone',
    body: `
      <div class="seg" id="ctKind">
        ${CONTACT_KINDS.map((k) => `<button type="button" class="seg-opt ${k.id === c.kind ? 'on' : ''}" data-v="${k.id}">${esc(k.label)}</button>`).join('')}
      </div>
      ${existing ? '' : `<div class="chip-row">${SERVICE_SUGGESTIONS.map((sg) => `<button class="chip" data-ctpick="${esc(sg)}" type="button">${esc(sg)}</button>`).join('')}</div>`}
      <label class="field" style="margin-top:10px"><span class="field-label">Who / what</span>
        <input id="ctName" type="text" value="${esc(c.name)}" placeholder="Plumber \u00B7 Home insurance \u00B7 Dr. Ruiz"></label>
      <div class="field-pair">
        <label class="field"><span class="field-label">Company</span>
          <input id="ctCompany" type="text" value="${esc(c.company)}"></label>
        <label class="field"><span class="field-label">Phone</span>
          <input id="ctPhone" type="tel" value="${esc(c.phone)}"></label>
      </div>
      <label class="field"><span class="field-label">Policy / account #</span>
        <input id="ctPolicy" type="text" value="${esc(c.policyNo)}"></label>
      <label class="field"><span class="field-label">Notes (coverage, deductible, gate code\u2026)</span>
        <textarea id="ctNote" rows="2">${esc(c.note)}</textarea></label>
      <div class="sheet-sec">
        <h3 class="sheet-sec-hd">Documents (policy scans, cards)</h3>
        <div class="thumb-row" id="ctPhotos"></div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-primary" id="ctSave" type="button">Save</button>
        ${existing ? '<button class="btn btn-danger" id="ctDelete" type="button">Delete</button>' : ''}
      </div>`,
    onMount(root) {
      let kind = c.kind;
      root.querySelectorAll('#ctKind .seg-opt').forEach((b) => {
        b.addEventListener('click', () => {
          kind = b.dataset.v;
          root.querySelectorAll('#ctKind .seg-opt').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
      root.querySelectorAll('[data-ctpick]').forEach((b) => {
        b.addEventListener('click', () => { root.querySelector('#ctName').value = b.dataset.ctpick; });
      });

      const holder = root.querySelector('#ctPhotos');
      for (const p of photos) holder.appendChild(photoThumb(p));
      const add = document.createElement('button');
      add.className = 'thumb-add';
      add.type = 'button';
      add.textContent = '+';
      add.addEventListener('click', async () => {
        // Persist first so the tag flow has a real record to attach to.
        await persist(false);
        captureInto({ contactId: c.id, subjectId: activeSubjectId });
      });
      holder.appendChild(add);

      const persist = async (close) => {
        c.kind = kind;
        c.name = root.querySelector('#ctName').value.trim() || 'Contact';
        c.company = root.querySelector('#ctCompany').value.trim();
        c.phone = root.querySelector('#ctPhone').value.trim();
        c.policyNo = root.querySelector('#ctPolicy').value.trim();
        c.note = root.querySelector('#ctNote').value.trim();
        if (!db.contacts.some((x) => x.id === c.id)) db.contacts.push(c);
        await put('contacts', c);
        if (close) {
          closeSheet(1);
          openContactsSheet();
        }
      };
      root.querySelector('#ctSave').addEventListener('click', () => persist(true).catch(showErr));
      const del = root.querySelector('#ctDelete');
      if (del) {
        del.addEventListener('click', async () => {
          if (!confirm(`Delete ${c.name}?`)) return;
          await remove('contacts', c.id);
          db.contacts = db.contacts.filter((x) => x.id !== c.id);
          closeSheet(1);
          openContactsSheet();
        });
      }
    },
  });
}

$('btnContacts').addEventListener('click', openContactsSheet);

// ---------------------------------------------------------------------------
// 10. Setup wizard and subject forms
// ---------------------------------------------------------------------------

/** Equipment records auto-created for a new house from its features. */
function seedEquipment(features, subjectId) {
  return EQUIPMENT_CATALOG.filter((e) => e.need(features || {})).map((e) => ({
    id: newId('asset'), subjectId, roomId: null, name: e.name,
    brand: '', model: '', serial: '', warrantyEnds: '',
    specs: [], link: '', note: '',
  }));
}

/** Room records auto-created for a new house. */
function seedRooms(features, subjectId) {
  return suggestRooms(features || {}).map((r) => ({
    id: newId('room'), subjectId, name: r.name, floor: r.floor,
    dims: '', paint: [], specs: [], note: '',
  }));
}

/**
 * Point seeded tasks at their auto-created equipment via assetHint:
 * exact name match first, containment second (so "Washer" never grabs
 * the Dishwasher).
 */
function linkTasksToEquipment(tasks, assets) {
  for (const t of tasks) {
    if (t.assetId || !t.assetHint) continue;
    const hint = t.assetHint.toLowerCase();
    const hitRec = assets.find((a) => a.name.toLowerCase() === hint)
      || assets.find((a) => {
        const n = a.name.toLowerCase();
        return n.includes(hint) || hint.includes(n);
      });
    if (hitRec) t.assetId = hitRec.id;
  }
}

/** "It's in" sheet after creating a subject: where to go next. */
function openNextStepsSheet(subject) {
  const isHouse = subject.kind === 'house';
  const count = tasksOf(subject.id).length;
  openSheet(0, {
    title: `${subject.name} is in`,
    body: `
      ${isHouse ? '<p class="setting-note">Its rooms and equipment are roughed in from what you told us. Walk the Manual tab and copy what\u2019s on each label - model numbers, filter sizes, paint colors.</p>' : ''}
      ${isHouse ? '<button class="btn btn-primary btn-block" id="nsManual" type="button">Set up equipment &amp; rooms</button>' : ''}
      <button class="btn btn-block ${isHouse ? '' : 'btn-primary'}" id="nsTasks" type="button">See its tasks${count ? ` (${count})` : ''}</button>
      <button class="btn btn-block btn-quiet" id="nsDone" type="button">Done for now</button>`,
    onMount(root) {
      const goManual = root.querySelector('#nsManual');
      if (goManual) {
        goManual.addEventListener('click', () => {
          closeSheet(0);
          renderManual();
          show('screen-manual');
        });
      }
      root.querySelector('#nsTasks').addEventListener('click', () => {
        closeSheet(0);
        expandOnly(subject.id);
        renderTasks();
        show('screen-tasks');
      });
      root.querySelector('#nsDone').addEventListener('click', () => closeSheet(0));
    },
  });
}

let wizard = null; // { subject|null, features, firstRun }

function fieldHtml(f, value) {
  if (f.kind === 'toggle') {
    return `<button class="toggle-row ${value ? 'on' : ''}" data-f="${f.key}" data-fk="toggle" type="button">
      <span class="box">\u2713</span><span>${esc(f.label)}</span></button>`;
  }
  if (f.kind === 'seg') {
    return `<div class="field-inline"><span class="field-label">${esc(f.label)}</span>
      <div class="seg" data-f="${f.key}" data-fk="seg">
        ${f.options.map((o) => `<button type="button" class="seg-opt ${String(o.v) === String(value) ? 'on' : ''}" data-v="${esc(String(o.v))}">${esc(o.label)}</button>`).join('')}
      </div></div>`;
  }
  if (f.kind === 'count') {
    return `<div class="field-inline"><span class="field-label">${esc(f.label)}</span>
      <div class="count-row" data-f="${f.key}" data-fk="count" data-min="${f.min}" data-max="${f.max}" data-step="${f.step || 1}">
        <button class="count-btn" data-d="-1" type="button">\u2212</button>
        <span class="count-val">${value}</span>
        <button class="count-btn" data-d="1" type="button">\u002B</button>
      </div></div>`;
  }
  if (f.kind === 'date') {
    return `<label class="field field-inline"><span class="field-label">${esc(f.label)}</span>
      <input type="date" data-f="${f.key}" data-fk="date" value="${esc(value || '')}"></label>`;
  }
  return `<label class="field field-inline"><span class="field-label">${esc(f.label)}</span>
    <input type="text" data-f="${f.key}" data-fk="text" value="${esc(value || '')}" placeholder="${esc(f.placeholder || '')}"></label>`;
}

function wireFields(root, state) {
  root.querySelectorAll('[data-fk="toggle"]').forEach((b) => {
    b.addEventListener('click', () => {
      state[b.dataset.f] = !state[b.dataset.f];
      b.classList.toggle('on', state[b.dataset.f]);
    });
  });
  root.querySelectorAll('[data-fk="seg"]').forEach((seg) => {
    seg.querySelectorAll('.seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        const raw = b.dataset.v;
        // Restore the option's original type: booleans and numbers survive
        // the round-trip through the data attribute. 'garage' stays a string
        // ('0'..'3') by design.
        let value = raw;
        if (raw === 'true') value = true;
        else if (raw === 'false') value = false;
        else if (seg.dataset.f === 'stories') value = Number(raw);
        state[seg.dataset.f] = value;
        seg.querySelectorAll('.seg-opt').forEach((x) => x.classList.toggle('on', x === b));
      });
    });
  });
  root.querySelectorAll('[data-fk="count"]').forEach((row) => {
    const val = row.querySelector('.count-val');
    row.querySelectorAll('.count-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const step = Number(row.dataset.step) || 1;
        const next = (Number(state[row.dataset.f]) || 0) + Number(b.dataset.d) * step;
        state[row.dataset.f] = Math.min(Number(row.dataset.max), Math.max(Number(row.dataset.min), next));
        val.textContent = state[row.dataset.f];
      });
    });
  });
  root.querySelectorAll('[data-fk="date"], [data-fk="text"]').forEach((inp) => {
    inp.addEventListener('input', () => { state[inp.dataset.f] = inp.value; });
  });
}

/**
 * The house wizard, used for creating and for editing features.
 * @param {object|null} subject existing house, or null for new
 * @param {{firstRun?: boolean}} [opts]
 */
function openHouseWizard(subject, { firstRun = false } = {}) {
  const features = { ...DEFAULT_FEATURES.house, ...(subject ? subject.features : {}) };
  if (subject) features.name = subject.name;
  wizard = { subject, features, firstRun, seed: 'yes' };

  $('setupTitle').textContent = subject ? 'Edit the house' : 'Describe the house';
  $('btnSetupCancel').hidden = firstRun;
  $('seedBlock').hidden = Boolean(subject);
  $('btnSetupRestore').hidden = !firstRun;

  $('setupBody').innerHTML = HOUSE_SECTIONS.map((sec) => `
    <div class="setup-sec">
      <h2 class="sec-label">${esc(sec.title)}</h2>
      ${sec.fields.map((f) => fieldHtml(f, features[f.key])).join('')}
    </div>`).join('');
  wireFields($('setupBody'), features);

  if (!subject) {
    $('seedSeg').querySelectorAll('.seg-opt').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === wizard.seed);
      b.onclick = () => {
        wizard.seed = b.dataset.v;
        $('seedSeg').querySelectorAll('.seg-opt').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
  }

  show('screen-setup');
}

$('btnSetupCancel').addEventListener('click', () => {
  wizard = null;
  $('setupBody').innerHTML = '';
  renderMore();
  show('screen-home');
  refresh();
});

$('btnSetupSave').addEventListener('click', async () => {
  if (!wizard) return;
  const btn = $('btnSetupSave');
  if (btn.disabled) return; // no duplicate subjects from double taps
  btn.disabled = true;

  try {
    const { subject, features, seed } = wizard;
    const name = (features.name || '').trim() || 'My house';
    delete features.name;

    if (!subject) {
      const rec = {
        id: newId('sub'), kind: 'house', name, features,
        specs: [], seeded: seed === 'yes', created: todayIso(),
      };
      db.subjects.push(rec);
      await put('subjects', rec);
      setActiveSubject(rec.id);

      // Guided setup: rooms and equipment roughed in from the features.
      const rooms = seedRooms(features, rec.id);
      const equip = seedEquipment(features, rec.id);
      db.rooms.push(...rooms);
      db.assets.push(...equip);
      await putMany('rooms', rooms);
      await putMany('assets', equip);

      if (seed === 'yes') {
        const seeded = seedTasks('house', features, rec.id, todayIso());
        if (features.warrantyStart) seeded.push(...seedWarrantyTasks(features.warrantyStart, rec.id));
        linkTasksToEquipment(seeded, equip);
        db.tasks.push(...seeded);
        await putMany('tasks', seeded);
      }

      wizard = null;
      $('setupBody').innerHTML = '';
      expandOnly(rec.id);
      renderHome();
      show('screen-home');
      updateBadge();
      openNextStepsSheet(rec);
    } else {
      const hadWarranty = Boolean((subject.features || {}).warrantyStart);
      subject.name = name;
      subject.features = features;
      await put('subjects', subject);
      if (subject.seeded) await reconcileSeeded(subject);
      if (!hadWarranty && features.warrantyStart) {
        const existing = new Set(tasksOf(subject.id).map((t) => t.key));
        const warr = seedWarrantyTasks(features.warrantyStart, subject.id)
          .filter((t) => !existing.has(t.key));
        db.tasks.push(...warr);
        await putMany('tasks', warr);
      }
      wizard = null;
      $('setupBody').innerHTML = '';
      syncChips();
      renderMore();
      show('screen-more');
      updateBadge();
    }
  } catch (err) {
    showErr(err);
  } finally {
    btn.disabled = false;
  }
});

/**
 * After a feature edit: pause seeded tasks that no longer apply, add newly
 * applicable ones. Custom tasks and anything already touched stay alone.
 */
async function reconcileSeeded(subject) {
  const entriesByKey = new Map(LIBRARY[subject.kind].map((e) => [e.key, e]));
  const mine = tasksOf(subject.id);
  const changed = [];

  for (const t of mine) {
    if (!t.key || t.custom) continue;
    const entry = entriesByKey.get(t.key);
    if (!entry) continue;
    const fits = matches(entry, subject.features);
    if (!fits && !t.paused && !t.lastDone) {
      t.paused = true;
      changed.push(t);
    } else if (fits && t.paused && !t.lastDone) {
      t.paused = false;
      changed.push(t);
    }
  }

  const have = new Set(mine.map((t) => t.key).filter(Boolean));
  const fresh = seedTasks(subject.kind, subject.features, subject.id, todayIso())
    .filter((t) => !have.has(t.key));
  if (changed.length) await putMany('tasks', changed);
  if (fresh.length) {
    await putMany('tasks', fresh);
    db.tasks.push(...fresh);
  }
}

/**
 * Vehicle and pet create/edit form (sheet).
 * @param {'vehicle'|'pet'} kind
 * @param {object|null} subject
 */
function openSimpleSubjectForm(kind, subject) {
  const fields = kind === 'vehicle' ? VEHICLE_FIELDS : PET_FIELDS;
  const state = { ...DEFAULT_FEATURES[kind], ...(subject ? subject.features : {}) };
  state.name = subject ? subject.name : '';
  let seed = 'yes';

  openSheet(0, {
    title: subject ? `Edit ${subject.name}` : (kind === 'vehicle' ? 'Add a vehicle' : 'Add a pet'),
    body: `
      <div id="ssFields">${fields.map((f) => fieldHtml(f, state[f.key])).join('')}</div>
      ${subject ? '' : `
        <div class="sheet-sec">
          <h3 class="sheet-sec-hd">Start with the usual tasks?</h3>
          <div class="seg" id="ssSeed">
            <button type="button" class="seg-opt on" data-v="yes">Yes, add them</button>
            <button type="button" class="seg-opt" data-v="no">Start empty</button>
          </div>
        </div>`}
      <div class="sheet-actions"><button class="btn btn-primary" id="ssSave" type="button">Save</button></div>`,
    onMount(root) {
      wireFields(root.querySelector('#ssFields'), state);
      const seg = root.querySelector('#ssSeed');
      if (seg) {
        seg.querySelectorAll('.seg-opt').forEach((b) => {
          b.addEventListener('click', () => {
            seed = b.dataset.v;
            seg.querySelectorAll('.seg-opt').forEach((x) => x.classList.toggle('on', x === b));
          });
        });
      }
      root.querySelector('#ssSave').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return; // no duplicate subjects from double taps
        btn.disabled = true;
        try {
          const name = (state.name || '').trim()
            || (kind === 'vehicle' ? [state.year, state.make, state.model].filter(Boolean).join(' ') : '')
            || (kind === 'vehicle' ? 'My vehicle' : 'My pet');
          const features = { ...state };
          delete features.name;

          if (!subject) {
            const rec = {
              id: newId('sub'), kind, name, features, specs: [],
              seeded: seed === 'yes', created: todayIso(),
            };
            db.subjects.push(rec);
            await put('subjects', rec);
            setActiveSubject(rec.id);
            if (seed === 'yes') {
              const seeded = seedTasks(kind, features, rec.id, todayIso());
              db.tasks.push(...seeded);
              await putMany('tasks', seeded);
            }
            closeSheet(0);
            expandOnly(rec.id);
            renderHome();
            show('screen-home');
            updateBadge();
            openNextStepsSheet(rec);
          } else {
            subject.name = name;
            subject.features = features;
            await put('subjects', subject);
            if (subject.seeded) await reconcileSeeded(subject);
            closeSheet(0);
            syncChips();
            refresh();
          }
        } catch (err) {
          showErr(err);
        } finally {
          btn.disabled = false;
        }
      });
    },
  });
}

// ---------------------------------------------------------------------------
// 11. Boot
// ---------------------------------------------------------------------------

async function boot() {
  buildTabs();
  const label = `v${APP.version}`;
  $('headerVersion').textContent = label;
  $('settingsVersion').textContent = label;
  document.title = APP.name;

  await migrateV1();

  const [subjects, rooms, tasks, assets, log, photos, inspections, lists, contacts] = await Promise.all([
    list('subjects'), list('rooms'), list('tasks'), list('assets'),
    list('log'), list('photos'), list('inspections'), list('lists'), list('contacts'),
  ]);
  Object.assign(db, {
    subjects, rooms, tasks, assets, log, photos, inspections, lists, contacts,
  });
  setupHintDismissed = (await getMeta('setupHintDismissed')) || {};

  activeSubjectId = await getMeta('activeSubjectId');
  await loadCollapsed();
  if (!subjectById(activeSubjectId) && db.subjects.length) {
    await setActiveSubject(db.subjects[0].id);
  }

  syncChips();

  if (!db.subjects.length) {
    openHouseWizard(null, { firstRun: true });
  } else {
    renderHome();
    show('screen-home');
  }
  updateBadge();

  startUpdates();
}

boot();
