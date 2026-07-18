// app.js
// UI, wiring, update flow, boot.
//
// Screen map:
//   Today     Due tasks bucketed by urgency. Done / snooze from the row.
//   Schedule  Every task grouped by category; tap to edit cadence and dates.
//   Things    Asset registry: models, serials, sizes, warranty countdowns,
//             purchase links. The standing-in-the-store screen.
//   Setup     House profile wizard. Runs on first boot, editable later.
//   Settings  Calendar export, backup, history, updates, data controls.

import {
  getProfile, saveProfile,
  listTasks, saveTask, saveTasks, deleteTask,
  listAssets, saveAsset, deleteAsset,
  addLog, listLog, logForTask,
  exportBackup, importBackup, clearAllData,
} from './store.js';

import {
  DEFAULT_PROFILE, seedTasks, seedWarrantyTasks, blankTask, matches,
  nextDueAfter, todayIso, addDays, daysBetween,
  fmtDate, fmtCadence, bucketOf, BUCKETS, buildIcs, spreadWithinMonths,
} from './schedule.js';

import { CATS, LIBRARY } from './library.js';

const APP_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let profile = null;
let tasks = [];
let assets = [];
let todayFilter = 'all';     // 'all' | category key
let planFilter = 'all';
let openDrawerId = null;     // expanded task row on Today
let editingTask = null;      // task open in the task modal
let editingAsset = null;     // asset open in the asset modal
let waitingWorker = null;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(s) { return escapeHtml(s); }

function amazonSearchUrl(q) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const old = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = old; }, 1200);
    }
  } catch { /* clipboard unavailable; nothing sensible to do */ }
}

// ---------------------------------------------------------------------------
// Screens & tabs
// ---------------------------------------------------------------------------

const SCREENS = ['screen-today', 'screen-plan', 'screen-things', 'screen-setup', 'screen-settings'];
const TABS = { today: 'screen-today', plan: 'screen-plan', things: 'screen-things', settings: 'screen-settings' };

function show(screenId) {
  SCREENS.forEach((id) => { $(id).hidden = id !== screenId; });
  const inTabs = Object.values(TABS).includes(screenId);
  $('tabs').hidden = !inTabs;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.setAttribute('aria-pressed', String(TABS[b.dataset.tab] === screenId));
  });
  window.scrollTo(0, 0);
}

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  const screen = TABS[btn.dataset.tab];
  if (screen === 'screen-today') renderToday();
  if (screen === 'screen-plan') renderPlan();
  if (screen === 'screen-things') renderThings();
  if (screen === 'screen-settings') renderSettings();
  show(screen);
});

// ---------------------------------------------------------------------------
// Today screen
// ---------------------------------------------------------------------------

function buildRail(el, current, onPick) {
  const cats = Object.entries(CATS);
  let html = `<button type="button" data-f="all" aria-pressed="${current === 'all'}">All</button>`;
  for (const [key, cat] of cats) {
    html += `<button type="button" data-f="${key}" aria-pressed="${current === key}">${cat.icon} ${cat.name}</button>`;
  }
  el.innerHTML = html;
  el.onclick = (e) => {
    const b = e.target.closest('button[data-f]');
    if (b) onPick(b.dataset.f);
  };
}

function taskRow(t, today) {
  const overdue = daysBetween(today, t.nextDue) < 0;
  const dueSoon = !overdue && daysBetween(today, t.nextDue) <= 7;
  const cat = CATS[t.cat] || { icon: '', name: t.cat };
  const open = openDrawerId === t.id;
  const asset = t.assetId ? assets.find((a) => a.id === t.assetId) : null;

  let drawer = '';
  if (open) {
    const assetChip = asset
      ? `<button type="button" class="chip chip-asset" data-act="asset" data-id="${t.id}">&#9881; ${escapeHtml(asset.name)}</button>`
      : '';
    const linkChip = t.link
      ? `<a class="chip chip-link" href="${escapeAttr(t.link)}" target="_blank" rel="noopener">Open link &#8599;</a>`
      : '';
    drawer = `
      <div class="drawer">
        ${t.why ? `<p class="why">${escapeHtml(t.why)}</p>` : ''}
        <p class="meta-line">${fmtCadence(t)} &middot; due ${fmtDate(t.nextDue)}${t.lastDone ? ` &middot; last done ${fmtDate(t.lastDone)}` : ''}</p>
        ${t.note ? `<p class="task-note">${escapeHtml(t.note)}</p>` : ''}
        <div class="chip-row">${assetChip}${linkChip}
          <button type="button" class="chip" data-act="edit" data-id="${t.id}">Edit task</button>
        </div>
      </div>`;
  }

  return `
    <div class="task ${overdue ? 'is-over' : dueSoon ? 'is-soon' : ''}" data-id="${t.id}">
      <div class="task-main" data-act="toggle" data-id="${t.id}">
        <span class="task-cat">${cat.icon}</span>
        <div class="task-txt">
          <span class="task-title">${escapeHtml(t.title)}</span>
          <span class="task-sub">${fmtDate(t.nextDue)} &middot; ${fmtCadence(t)}</span>
        </div>
        <div class="task-acts">
          <button type="button" class="mini mini-snooze" data-act="snooze" data-id="${t.id}" aria-label="Snooze one week">+1w</button>
          <button type="button" class="mini mini-done" data-act="done" data-id="${t.id}" aria-label="Mark done">&#10003;</button>
        </div>
      </div>
      ${drawer}
    </div>`;
}

function renderToday() {
  const today = todayIso();
  buildRail($('todayRail'), todayFilter, (f) => { todayFilter = f; renderToday(); });

  const active = tasks.filter((t) => !t.paused && t.nextDue);
  const visible = active.filter((t) => todayFilter === 'all' || t.cat === todayFilter);

  const byBucket = { over: [], week: [], month: [], later: [] };
  for (const t of visible) byBucket[bucketOf(t, today)].push(t);

  const overdueCount = active.filter((t) => bucketOf(t, today) === 'over').length;
  const badge = $('badgeToday');
  badge.hidden = overdueCount === 0;
  badge.textContent = overdueCount;
  $('todayTagline').textContent = overdueCount
    ? `${overdueCount} overdue. The house is keeping score.`
    : `All caught up. The house thanks you.`;

  let html = '';
  for (const bucket of BUCKETS) {
    const list = byBucket[bucket.id];
    if (!list.length) continue;
    // "Coming up" is capped so the screen stays a to-do list, not an archive.
    const shown = bucket.id === 'later' ? list.slice(0, 8) : list;
    html += `<h2 class="bucket-hd bucket-${bucket.id}">${bucket.label} <b>${list.length}</b></h2>`;
    html += shown.map((t) => taskRow(t, today)).join('');
    if (shown.length < list.length) {
      html += `<p class="more-note">${list.length - shown.length} more on the Schedule tab.</p>`;
    }
  }

  $('todayList').innerHTML = html || `
    <div class="empty">
      <p>Nothing scheduled${todayFilter !== 'all' ? ' in this category' : ''}.</p>
      <p class="empty-sub">Add tasks from the Schedule tab, or edit the house profile in More.</p>
    </div>`;
}

$('todayList').addEventListener('click', onTaskListClick);

async function onTaskListClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  switch (el.dataset.act) {
    case 'toggle':
      // Taps on the mini buttons bubble here too; they carry their own act,
      // so this only fires for the row body.
      openDrawerId = openDrawerId === id ? null : id;
      renderToday();
      break;
    case 'done':
      await completeTask(t);
      break;
    case 'snooze':
      t.nextDue = addDays(t.nextDue < todayIso() ? todayIso() : t.nextDue, 7);
      await saveTask(t);
      renderToday();
      break;
    case 'edit':
      openTaskModal(t);
      break;
    case 'asset': {
      const asset = assets.find((a) => a.id === t.assetId);
      if (asset) { renderThings(asset.id); show('screen-things'); }
      break;
    }
  }
}

async function completeTask(t) {
  const today = todayIso();
  t.lastDone = today;
  const next = nextDueAfter(t, today);
  if (next) {
    t.nextDue = next;
  } else {
    // One-shot (warranty milestone): done means done.
    t.nextDue = null;
    t.paused = true;
  }
  await saveTask(t);
  await addLog({
    id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: t.id,
    title: t.title,
    date: today,
  });
  openDrawerId = null;
  renderToday();
}

// ---------------------------------------------------------------------------
// Schedule (plan) screen
// ---------------------------------------------------------------------------

function renderPlan() {
  buildRail($('planRail'), planFilter, (f) => { planFilter = f; renderPlan(); });

  const groups = new Map();
  for (const t of tasks) {
    if (planFilter !== 'all' && t.cat !== planFilter) continue;
    if (!groups.has(t.cat)) groups.set(t.cat, []);
    groups.get(t.cat).push(t);
  }

  let html = '';
  for (const [catKey, cat] of Object.entries(CATS)) {
    const list = groups.get(catKey);
    if (!list || !list.length) continue;
    list.sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));
    html += `<h2 class="bucket-hd">${cat.icon} ${cat.name} <b>${list.length}</b></h2>`;
    html += list.map((t) => `
      <div class="task ${t.paused ? 'is-paused' : ''}" data-id="${t.id}">
        <div class="task-main" data-edit="${t.id}">
          <div class="task-txt">
            <span class="task-title">${escapeHtml(t.title)}</span>
            <span class="task-sub">${t.paused ? (t.oneShot && t.lastDone ? `Done ${fmtDate(t.lastDone)}` : 'Paused') : `${fmtDate(t.nextDue)} &middot; ${fmtCadence(t)}`}</span>
          </div>
          <span class="task-chev">&rsaquo;</span>
        </div>
      </div>`).join('');
  }

  $('planList').innerHTML = html || `
    <div class="empty"><p>No tasks yet.</p>
    <p class="empty-sub">Run the house profile from More, or add one with +.</p></div>`;
}

$('planList').addEventListener('click', (e) => {
  const el = e.target.closest('[data-edit]');
  if (!el) return;
  const t = tasks.find((x) => x.id === el.dataset.edit);
  if (t) openTaskModal(t);
});

$('btnAddTask').addEventListener('click', () => openTaskModal(blankTask(), true));

// ---------------------------------------------------------------------------
// Task editor modal
// ---------------------------------------------------------------------------

let taskIsNew = false;

function openTaskModal(t, isNew = false) {
  editingTask = structuredClone(t);
  taskIsNew = isNew;
  $('taskModalTitle').textContent = isNew ? 'New task' : 'Edit task';
  $('taskDelete').hidden = isNew;
  renderTaskForm();
  $('taskModal').hidden = false;
}

function renderTaskForm() {
  const t = editingTask;
  const catOpts = Object.entries(CATS)
    .map(([k, c]) => `<option value="${k}" ${t.cat === k ? 'selected' : ''}>${c.name}</option>`).join('');
  const assetOpts = ['<option value="">None</option>']
    .concat(assets.map((a) => `<option value="${a.id}" ${t.assetId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`))
    .join('');

  const mode = t.every ? 'every' : (t.windows ? 'season' : 'once');
  const everyN = t.every ? t.every.n : 3;
  const everyU = t.every ? t.every.unit : 'm';
  const winStart = t.windows ? t.windows[0][0] : 4;
  const winGap = t.yearGap || 1;

  const monthOpts = (sel) => Array.from({ length: 12 }, (_, i) =>
    `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${['January','February','March','April','May','June','July','August','September','October','November','December'][i]}</option>`).join('');

  $('taskForm').innerHTML = `
    <label class="fld"><span>Task</span>
      <input id="tfTitle" type="text" value="${escapeAttr(t.title)}" placeholder="e.g. Replace shower filter">
    </label>
    <label class="fld"><span>Category</span>
      <select id="tfCat">${catOpts}</select>
    </label>
    <label class="fld"><span>Repeats</span>
      <select id="tfMode">
        <option value="every" ${mode === 'every' ? 'selected' : ''}>On an interval</option>
        <option value="season" ${mode === 'season' ? 'selected' : ''}>In a season, yearly</option>
        <option value="once" ${mode === 'once' ? 'selected' : ''}>One time</option>
      </select>
    </label>
    <div class="fld-row" id="tfEveryRow" ${mode !== 'every' ? 'hidden' : ''}>
      <label class="fld"><span>Every</span>
        <input id="tfEveryN" type="number" min="1" max="120" value="${everyN}">
      </label>
      <label class="fld"><span>&nbsp;</span>
        <select id="tfEveryU">
          <option value="w" ${everyU === 'w' ? 'selected' : ''}>weeks</option>
          <option value="m" ${everyU === 'm' ? 'selected' : ''}>months</option>
          <option value="y" ${everyU === 'y' ? 'selected' : ''}>years</option>
        </select>
      </label>
    </div>
    <div class="fld-row" id="tfSeasonRow" ${mode !== 'season' ? 'hidden' : ''}>
      <label class="fld"><span>Around</span>
        <select id="tfWinStart">${monthOpts(winStart)}</select>
      </label>
      <label class="fld"><span>Every</span>
        <select id="tfWinGap">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${winGap === n ? 'selected' : ''}>${n} yr${n > 1 ? 's' : ''}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="fld"><span>Next due</span>
      <input id="tfDue" type="date" value="${t.nextDue || ''}">
    </label>
    <label class="fld"><span>Linked thing</span>
      <select id="tfAsset">${assetOpts}</select>
    </label>
    <label class="fld"><span>Link (product page, how-to video&hellip;)</span>
      <input id="tfLink" type="url" value="${escapeAttr(t.link)}" placeholder="https://">
    </label>
    <label class="fld"><span>Notes</span>
      <textarea id="tfNote" rows="2" placeholder="Sizes, steps, quirks">${escapeHtml(t.note)}</textarea>
    </label>
    <label class="fld fld-check">
      <input id="tfPaused" type="checkbox" ${t.paused ? 'checked' : ''}>
      <span>Paused (kept, but never shows as due)</span>
    </label>`;

  $('tfMode').onchange = () => {
    $('tfEveryRow').hidden = $('tfMode').value !== 'every';
    $('tfSeasonRow').hidden = $('tfMode').value !== 'season';
  };
}

$('taskSave').addEventListener('click', async () => {
  const t = editingTask;
  t.title = $('tfTitle').value.trim();
  if (!t.title) { $('tfTitle').focus(); return; }
  t.cat = $('tfCat').value;
  const mode = $('tfMode').value;
  if (mode === 'every') {
    t.every = { n: Math.max(1, Number($('tfEveryN').value) || 1), unit: $('tfEveryU').value };
    t.windows = null;
  } else if (mode === 'season') {
    const m = Number($('tfWinStart').value);
    t.windows = [[m, Math.min(12, m + 1)]];
    t.yearGap = Number($('tfWinGap').value) || 1;
    t.every = null;
  } else {
    t.every = null;
    t.windows = null;
    t.oneShot = true;
  }
  t.nextDue = $('tfDue').value || todayIso();
  t.assetId = $('tfAsset').value || null;
  t.link = $('tfLink').value.trim();
  t.note = $('tfNote').value.trim();
  t.paused = $('tfPaused').checked;

  await saveTask(t);
  const i = tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) tasks[i] = t; else tasks.push(t);
  closeTaskModal();
  renderPlan();
  renderToday();
});

$('taskDelete').addEventListener('click', async () => {
  if (!confirm('Delete this task? Its history stays in the log.')) return;
  await deleteTask(editingTask.id);
  tasks = tasks.filter((x) => x.id !== editingTask.id);
  closeTaskModal();
  renderPlan();
  renderToday();
});

$('taskClose').addEventListener('click', closeTaskModal);
function closeTaskModal() { $('taskModal').hidden = true; editingTask = null; }

// ---------------------------------------------------------------------------
// Things screen
// ---------------------------------------------------------------------------

function assetCard(a, highlight) {
  const today = todayIso();
  let warranty = '';
  if (a.warrantyEnds) {
    const left = daysBetween(today, a.warrantyEnds);
    const cls = left < 0 ? 'w-out' : left <= 90 ? 'w-soon' : 'w-ok';
    warranty = `<span class="wtag ${cls}">${left < 0 ? 'Warranty ended ' + fmtDate(a.warrantyEnds) : `Warranty: ${left}d left (${fmtDate(a.warrantyEnds)})`}</span>`;
  }

  const specs = (a.specs || []).filter((s) => s.k || s.v).map((s) => `
    <div class="spec">
      <span class="spec-k">${escapeHtml(s.k)}</span>
      <span class="spec-v">${escapeHtml(s.v)}</span>
      <button type="button" class="mini" data-copy="${escapeAttr(s.v)}">Copy</button>
      <a class="mini mini-a" href="${amazonSearchUrl(s.v)}" target="_blank" rel="noopener">Amazon</a>
    </div>`).join('');

  const links = (a.links || []).filter((l) => l.url).map((l) => `
    <a class="chip chip-link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || 'Link')} &#8599;</a>`).join('');

  const idLine = [a.brand, a.model].filter(Boolean).join(' ');

  return `
    <div class="asset ${highlight === a.id ? 'is-hi' : ''}" data-id="${a.id}">
      <div class="asset-hd" data-aedit="${a.id}">
        <div class="asset-txt">
          <span class="asset-name">${escapeHtml(a.name)}</span>
          <span class="asset-sub">${escapeHtml(idLine)}${a.serial ? ` &middot; SN ${escapeHtml(a.serial)}` : ''}${a.location ? ` &middot; ${escapeHtml(a.location)}` : ''}</span>
        </div>
        <span class="task-chev">&rsaquo;</span>
      </div>
      ${warranty}
      ${specs ? `<div class="specs">${specs}</div>` : ''}
      ${links ? `<div class="chip-row">${links}</div>` : ''}
      ${a.notes ? `<p class="task-note">${escapeHtml(a.notes)}</p>` : ''}
    </div>`;
}

function renderThings(highlightId) {
  const q = ($('assetSearch').value || '').toLowerCase().trim();
  const list = !q ? assets : assets.filter((a) =>
    JSON.stringify([a.name, a.brand, a.model, a.serial, a.location, a.notes, a.specs, a.links])
      .toLowerCase().includes(q));

  $('assetList').innerHTML = list.length
    ? list.map((a) => assetCard(a, highlightId)).join('')
    : `<div class="empty">
        <p>${q ? 'Nothing matches.' : 'No things yet.'}</p>
        <p class="empty-sub">Add the fridge, washer, HVAC, the dog &mdash; with model numbers, filter sizes, and the links to reorder them.</p>
      </div>`;
}

$('assetSearch').addEventListener('input', () => renderThings());

$('assetList').addEventListener('click', (e) => {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) { copyText(copyBtn.dataset.copy, copyBtn); return; }
  const edit = e.target.closest('[data-aedit]');
  if (edit) {
    const a = assets.find((x) => x.id === edit.dataset.aedit);
    if (a) openAssetModal(a);
  }
});

$('btnAddAsset').addEventListener('click', () => openAssetModal({
  id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name: '', brand: '', model: '', serial: '', location: '',
  purchased: '', warrantyEnds: '', notes: '',
  specs: [], links: [],
}, true));

// ---------------------------------------------------------------------------
// Asset editor modal
// ---------------------------------------------------------------------------

let assetIsNew = false;

function openAssetModal(a, isNew = false) {
  editingAsset = structuredClone(a);
  if (!editingAsset.specs) editingAsset.specs = [];
  if (!editingAsset.links) editingAsset.links = [];
  assetIsNew = isNew;
  $('assetModalTitle').textContent = isNew ? 'New thing' : 'Edit thing';
  $('assetDelete').hidden = isNew;
  renderAssetForm();
  $('assetModal').hidden = false;
}

function renderAssetForm() {
  const a = editingAsset;
  const specRows = a.specs.map((s, i) => `
    <div class="fld-row">
      <input type="text" data-sk="${i}" value="${escapeAttr(s.k)}" placeholder="What (filter size, bulb...)">
      <input type="text" data-sv="${i}" value="${escapeAttr(s.v)}" placeholder="Value (20x25x1, EDR1RXD1...)">
      <button type="button" class="mini mini-x" data-sx="${i}" aria-label="Remove">&times;</button>
    </div>`).join('');

  const linkRows = a.links.map((l, i) => `
    <div class="fld-row">
      <input type="text" data-lk="${i}" value="${escapeAttr(l.label)}" placeholder="Label (Buy filter, Manual...)">
      <input type="url" data-lv="${i}" value="${escapeAttr(l.url)}" placeholder="https://amazon.com/...">
      <button type="button" class="mini mini-x" data-lx="${i}" aria-label="Remove">&times;</button>
    </div>`).join('');

  $('assetForm').innerHTML = `
    <label class="fld"><span>Name</span>
      <input id="afName" type="text" value="${escapeAttr(a.name)}" placeholder="Refrigerator, HVAC, Biscuit the dog&hellip;">
    </label>
    <div class="fld-row">
      <label class="fld"><span>Brand</span><input id="afBrand" type="text" value="${escapeAttr(a.brand)}"></label>
      <label class="fld"><span>Model</span><input id="afModel" type="text" value="${escapeAttr(a.model)}"></label>
    </div>
    <div class="fld-row">
      <label class="fld"><span>Serial</span><input id="afSerial" type="text" value="${escapeAttr(a.serial)}"></label>
      <label class="fld"><span>Location</span><input id="afLoc" type="text" value="${escapeAttr(a.location)}" placeholder="Kitchen, attic&hellip;"></label>
    </div>
    <div class="fld-row">
      <label class="fld"><span>Purchased</span><input id="afPurchased" type="date" value="${a.purchased || ''}"></label>
      <label class="fld"><span>Warranty ends</span><input id="afWarranty" type="date" value="${a.warrantyEnds || ''}"></label>
    </div>
    <div class="fld"><span class="fld-hd">Sizes &amp; part numbers <button type="button" class="mini" id="afAddSpec">+ Add</button></span>
      <div id="afSpecs">${specRows}</div>
    </div>
    <div class="fld"><span class="fld-hd">Links <button type="button" class="mini" id="afAddLink">+ Add</button></span>
      <div id="afLinks">${linkRows}</div>
    </div>
    <label class="fld"><span>Notes</span>
      <textarea id="afNotes" rows="2" placeholder="Breaker #14, vaccine lot numbers, install quirks">${escapeHtml(a.notes)}</textarea>
    </label>`;

  $('afAddSpec').onclick = () => { pullAssetForm(); editingAsset.specs.push({ k: '', v: '' }); renderAssetForm(); };
  $('afAddLink').onclick = () => { pullAssetForm(); editingAsset.links.push({ label: '', url: '' }); renderAssetForm(); };
  $('assetForm').querySelectorAll('[data-sx]').forEach((b) => {
    b.onclick = () => { pullAssetForm(); editingAsset.specs.splice(Number(b.dataset.sx), 1); renderAssetForm(); };
  });
  $('assetForm').querySelectorAll('[data-lx]').forEach((b) => {
    b.onclick = () => { pullAssetForm(); editingAsset.links.splice(Number(b.dataset.lx), 1); renderAssetForm(); };
  });
}

/** Read the current form values back into editingAsset. */
function pullAssetForm() {
  const a = editingAsset;
  a.name = $('afName').value.trim();
  a.brand = $('afBrand').value.trim();
  a.model = $('afModel').value.trim();
  a.serial = $('afSerial').value.trim();
  a.location = $('afLoc').value.trim();
  a.purchased = $('afPurchased').value;
  a.warrantyEnds = $('afWarranty').value;
  a.notes = $('afNotes').value.trim();
  $('assetForm').querySelectorAll('[data-sk]').forEach((el) => { a.specs[Number(el.dataset.sk)].k = el.value.trim(); });
  $('assetForm').querySelectorAll('[data-sv]').forEach((el) => { a.specs[Number(el.dataset.sv)].v = el.value.trim(); });
  $('assetForm').querySelectorAll('[data-lk]').forEach((el) => { a.links[Number(el.dataset.lk)].label = el.value.trim(); });
  $('assetForm').querySelectorAll('[data-lv]').forEach((el) => { a.links[Number(el.dataset.lv)].url = el.value.trim(); });
}

$('assetSave').addEventListener('click', async () => {
  pullAssetForm();
  if (!editingAsset.name) { $('afName').focus(); return; }
  editingAsset.specs = editingAsset.specs.filter((s) => s.k || s.v);
  editingAsset.links = editingAsset.links.filter((l) => l.url);
  await saveAsset(editingAsset);
  const i = assets.findIndex((x) => x.id === editingAsset.id);
  if (i >= 0) assets[i] = editingAsset; else assets.push(editingAsset);
  assets.sort((a, b) => a.name.localeCompare(b.name));
  const savedId = editingAsset.id;
  closeAssetModal();
  renderThings(savedId);
});

$('assetDelete').addEventListener('click', async () => {
  if (!confirm('Delete this thing? Tasks linked to it stay, unlinked.')) return;
  const id = editingAsset.id;
  await deleteAsset(id);
  assets = assets.filter((x) => x.id !== id);
  // Unlink any tasks that pointed at it.
  const linked = tasks.filter((t) => t.assetId === id);
  linked.forEach((t) => { t.assetId = null; });
  if (linked.length) await saveTasks(linked);
  closeAssetModal();
  renderThings();
});

$('assetClose').addEventListener('click', closeAssetModal);
function closeAssetModal() { $('assetModal').hidden = true; editingAsset = null; }

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

const SETUP_SECTIONS = [
  { hd: 'The basics', fields: [
    { k: 'houseName', type: 'text', label: 'House name (optional)', ph: 'e.g. 214 Maple' },
    { k: 'warrantyStart', type: 'date', label: 'Builder warranty start (closing date, if new construction)' },
    { k: 'climate', type: 'choice', label: 'Winters here', opts: [['freezing', 'Freeze'], ['mild', 'Stay mild']] },
    { k: 'foundation', type: 'choice', label: 'Foundation', opts: [['slab', 'Slab'], ['crawl', 'Crawlspace'], ['basement', 'Basement']] },
  ]},
  { hd: 'Air & heat', fields: [
    { k: 'forcedAir', type: 'toggle', label: 'Forced-air heat (furnace / heat pump with filters)' },
    { k: 'centralAir', type: 'toggle', label: 'Central AC' },
    { k: 'humidifier', type: 'toggle', label: 'Whole-house humidifier' },
    { k: 'erv', type: 'toggle', label: 'ERV / HRV fresh-air system' },
    { k: 'fireplace', type: 'choice', label: 'Fireplace', opts: [['none', 'None'], ['gas', 'Gas'], ['wood', 'Wood']] },
  ]},
  { hd: 'Water', fields: [
    { k: 'waterHeater', type: 'choice', label: 'Water heater', opts: [['tank', 'Tank'], ['tankless', 'Tankless']] },
    { k: 'softener', type: 'toggle', label: 'Water softener' },
    { k: 'showerFilter', type: 'toggle', label: 'Shower hard-water filter' },
    { k: 'sedimentFilter', type: 'toggle', label: 'Whole-house sediment filter' },
    { k: 'fridgeFilter', type: 'toggle', label: 'Fridge water/ice filter' },
    { k: 'frontLoadWasher', type: 'toggle', label: 'Front-loading washer' },
    { k: 'disposal', type: 'toggle', label: 'Garbage disposal' },
    { k: 'sumpPump', type: 'toggle', label: 'Sump pump' },
    { k: 'septic', type: 'toggle', label: 'Septic system' },
    { k: 'well', type: 'toggle', label: 'Well water' },
  ]},
  { hd: 'Outside', fields: [
    { k: 'garage', type: 'toggle', label: 'Garage with opener' },
    { k: 'gutters', type: 'toggle', label: 'Gutters' },
    { k: 'deck', type: 'toggle', label: 'Wood deck' },
    { k: 'sprinklers', type: 'toggle', label: 'Sprinkler / irrigation system' },
  ]},
  { hd: 'Garden', fields: [
    { k: 'lawn', type: 'toggle', label: 'Lawn' },
    { k: 'beds', type: 'toggle', label: 'Planting beds (mulch, perennials)' },
    { k: 'hydrangeas', type: 'toggle', label: 'Hydrangeas' },
    { k: 'roses', type: 'toggle', label: 'Roses' },
    { k: 'fruitTrees', type: 'toggle', label: 'Fruit trees' },
  ]},
  { hd: 'Pets', fields: [
    { k: 'dog', type: 'toggle', label: 'Dog (vaccines, prevention, license)' },
  ]},
];

let draft = null;
let firstRun = false;

function renderSetup() {
  let html = '';
  for (const section of SETUP_SECTIONS) {
    html += `<h2 class="setup-hd">${section.hd}</h2>`;
    for (const f of section.fields) {
      const v = draft[f.k];
      if (f.type === 'toggle') {
        html += `
          <button type="button" class="tgl" data-k="${f.k}" aria-pressed="${Boolean(v)}">
            <span class="tgl-box">${v ? '&#10003;' : ''}</span>${f.label}
          </button>`;
      } else if (f.type === 'choice') {
        html += `<div class="fld"><span>${f.label}</span><div class="seg" data-k="${f.k}">
          ${f.opts.map(([val, lab]) => `<button type="button" data-v="${val}" aria-pressed="${v === val}">${lab}</button>`).join('')}
        </div></div>`;
      } else {
        html += `<label class="fld"><span>${f.label}</span>
          <input type="${f.type}" data-k="${f.k}" value="${escapeAttr(v)}" ${f.ph ? `placeholder="${f.ph}"` : ''}>
        </label>`;
      }
    }
  }
  $('setupForm').innerHTML = html;
  updatePreview();
}

function updatePreview() {
  const n = LIBRARY.filter((e) => matches(e, draft)).length + (draft.warrantyStart ? 4 : 0);
  $('previewCount').textContent = n;
}

$('setupForm').addEventListener('click', (e) => {
  const tgl = e.target.closest('.tgl');
  if (tgl) {
    draft[tgl.dataset.k] = !draft[tgl.dataset.k];
    renderSetup();
    return;
  }
  const seg = e.target.closest('.seg button');
  if (seg) {
    draft[seg.closest('.seg').dataset.k] = seg.dataset.v;
    renderSetup();
  }
});

$('setupForm').addEventListener('input', (e) => {
  const el = e.target.closest('input[data-k]');
  if (el) { draft[el.dataset.k] = el.value; updatePreview(); }
});

$('btnSetupSave').addEventListener('click', async () => {
  profile = structuredClone(draft);
  await saveProfile(profile);
  await applyProfileToTasks();
  $('todayTitle').textContent = profile.houseName || 'Home Manual';
  renderToday();
  show('screen-today');
});

$('btnSetupCancel').addEventListener('click', () => {
  renderSettings();
  show('screen-settings');
});

/**
 * Reconcile the task list with the (possibly changed) profile.
 *  - Library tasks that now match but do not exist are seeded (spread across
 *    the month so they do not all land on one day).
 *  - Library tasks that no longer match are paused, not deleted, so history
 *    and any customization survive turning a feature off and on again.
 *  - Custom tasks and completed one-shots are never touched.
 */
async function applyProfileToTasks() {
  const byKey = new Map(tasks.filter((t) => t.key).map((t) => [t.key, t]));
  const changed = [];

  for (const entry of LIBRARY) {
    const existing = byKey.get(entry.key);
    const fits = matches(entry, profile);
    if (fits && !existing) {
      const [seeded] = seedTasks({ ...profile }, todayIso())
        .filter((t) => t.key === entry.key);
      if (seeded) { tasks.push(seeded); changed.push(seeded); }
    } else if (existing && !existing.oneShot) {
      if (!fits && !existing.paused) { existing.paused = true; changed.push(existing); }
      else if (fits && existing.paused) { existing.paused = false; changed.push(existing); }
    }
  }

  // Warranty milestones: seed once when a start date first appears.
  if (profile.warrantyStart && !tasks.some((t) => t.key && t.key.startsWith('warr-'))) {
    const warr = seedWarrantyTasks(profile.warrantyStart);
    tasks.push(...warr);
    changed.push(...warr);
  }

  spreadWithinMonths(changed.filter((t) => !t.lastDone), todayIso());
  if (changed.length) await saveTasks(changed);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function renderSettings() {
  const log = await listLog(30);
  $('logList').innerHTML = log.length
    ? log.map((l) => `<div class="log-row"><span class="log-date">${fmtDate(l.date)}</span>${escapeHtml(l.title)}</div>`).join('')
    : '<p class="setting-note">Completed tasks will show up here.</p>';
}

$('btnEditProfile').addEventListener('click', () => {
  draft = structuredClone(profile);
  firstRun = false;
  $('setupTitle').textContent = 'Your house';
  $('btnSetupCancel').hidden = false;
  $('btnSetupSave').textContent = 'Update schedule';
  renderSetup();
  show('screen-setup');
});

$('btnIcs').addEventListener('click', () => {
  const ics = buildIcs(tasks, profile?.houseName);
  download('home-manual.ics', ics, 'text/calendar');
});

$('btnExport').addEventListener('click', async () => {
  const data = await exportBackup();
  download(`home-manual-backup-${todayIso()}.json`, JSON.stringify(data, null, 1), 'application/json');
});

$('btnImport').addEventListener('click', () => $('importInput').click());

$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm('Restoring replaces everything currently on this device. Continue?')) return;
    await importBackup(data);
    await boot();
  } catch (err) {
    alert(`Restore failed: ${err.message}`);
  }
});

$('btnClearData').addEventListener('click', async () => {
  if (!confirm('Erase the profile, all tasks, all things, and all history?')) return;
  if (!confirm('Last chance. This cannot be undone.')) return;
  await clearAllData();
  location.reload();
});

// ---------------------------------------------------------------------------
// Service worker & update flow
// ---------------------------------------------------------------------------

function showUpdateBanner(worker) {
  waitingWorker = worker;
  $('updateBanner').hidden = false;
}

$('btnApplyUpdate').addEventListener('click', () => {
  if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING');
});

$('btnDismissUpdate').addEventListener('click', () => { $('updateBanner').hidden = true; });

async function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    if (reg.waiting) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  } catch { /* offline first load, or SW unsupported */ }
}

$('btnCheckUpdate').addEventListener('click', async () => {
  const status = $('updateCheckStatus');
  status.textContent = 'Checking\u2026';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { status.textContent = 'Not installed as an app yet.'; return; }
    await reg.update();
    status.textContent = reg.waiting ? 'Update ready - see the banner.' : 'You are on the latest version.';
    if (reg.waiting) showUpdateBanner(reg.waiting);
  } catch {
    status.textContent = 'Could not check (offline?).';
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  $('versionString').textContent = `v${APP_VERSION}`;
  $('setVersion').textContent = `v${APP_VERSION}`;

  profile = await getProfile();
  tasks = await listTasks();
  assets = await listAssets();

  if (!profile) {
    draft = structuredClone(DEFAULT_PROFILE);
    firstRun = true;
    $('setupTitle').textContent = 'Welcome. Describe the house.';
    $('btnSetupCancel').hidden = true;
    $('btnSetupSave').textContent = 'Build my schedule';
    renderSetup();
    show('screen-setup');
  } else {
    $('todayTitle').textContent = profile.houseName || 'Home Manual';
    renderToday();
    show('screen-today');
  }

  registerSw();
}

boot();
