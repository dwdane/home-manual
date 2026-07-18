// store.js
// Persistence layer.
//
// IndexedDB holds four object stores:
//
//   meta    A single record (id 'profile') holding the house profile.
//   tasks   One record per scheduled task.
//   assets  One record per tracked thing (fridge, washer, dog...). Carries
//           model, serial, warranty date, specs (filter sizes), and links.
//   log     Completion history: { id, taskId, title, date, note }.
//
// localStorage is not used for data - only IndexedDB - so a backup captures
// everything.

const DB_NAME = 'home-manual';
const DB_VERSION = 1;

let dbPromise = null;

/** Open (and if needed create) the database. Cached after the first call. */
function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('log')) {
        const log = db.createObjectStore('log', { keyPath: 'id' });
        log.createIndex('taskId', 'taskId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/** Run a transaction against one store and resolve with the request result. */
async function tx(storeName, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;

    try {
      result = work(store);
    } catch (err) {
      reject(err);
      return;
    }

    transaction.oncomplete = () => {
      resolve(result && typeof result.result !== 'undefined' ? result.result : result);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile() {
  const rec = await tx('meta', 'readonly', (s) => s.get('profile'));
  return rec ? rec.value : null;
}

export async function saveProfile(profile) {
  await tx('meta', 'readwrite', (s) => s.put({ id: 'profile', value: profile }));
  return profile;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks() {
  const all = await tx('tasks', 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));
}

export async function saveTask(task) {
  await tx('tasks', 'readwrite', (s) => s.put(task));
  return task;
}

export async function saveTasks(tasks) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    tasks.forEach((t) => store.put(t));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteTask(id) {
  await tx('tasks', 'readwrite', (s) => s.delete(id));
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function listAssets() {
  const all = await tx('assets', 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function saveAsset(asset) {
  asset.updatedAt = Date.now();
  await tx('assets', 'readwrite', (s) => s.put(asset));
  return asset;
}

export async function deleteAsset(id) {
  await tx('assets', 'readwrite', (s) => s.delete(id));
}

// ---------------------------------------------------------------------------
// Completion log
// ---------------------------------------------------------------------------

export async function addLog(entry) {
  await tx('log', 'readwrite', (s) => s.put(entry));
}

export async function listLog(limit = 200) {
  const all = await tx('log', 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit);
}

export async function logForTask(taskId) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('log', 'readonly');
    const idx = transaction.objectStore('log').index('taskId');
    const req = idx.getAll(taskId);
    req.onsuccess = () =>
      resolve((req.result || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Backup / restore / clear
// ---------------------------------------------------------------------------

export async function exportBackup() {
  const [profile, tasks, assets, log] = await Promise.all([
    getProfile(),
    listTasks(),
    listAssets(),
    tx('log', 'readonly', (s) => s.getAll()),
  ]);
  return {
    app: 'home-manual',
    schema: 1,
    exportedAt: new Date().toISOString(),
    profile,
    tasks,
    assets,
    log: log || [],
  };
}

export async function importBackup(data) {
  if (!data || data.app !== 'home-manual') throw new Error('Not a Home Manual backup file.');
  const db = await open();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['meta', 'tasks', 'assets', 'log'], 'readwrite');
    transaction.objectStore('meta').clear();
    transaction.objectStore('tasks').clear();
    transaction.objectStore('assets').clear();
    transaction.objectStore('log').clear();
    if (data.profile) transaction.objectStore('meta').put({ id: 'profile', value: data.profile });
    (data.tasks || []).forEach((t) => transaction.objectStore('tasks').put(t));
    (data.assets || []).forEach((a) => transaction.objectStore('assets').put(a));
    (data.log || []).forEach((l) => transaction.objectStore('log').put(l));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearAllData() {
  const db = await open();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['meta', 'tasks', 'assets', 'log'], 'readwrite');
    transaction.objectStore('meta').clear();
    transaction.objectStore('tasks').clear();
    transaction.objectStore('assets').clear();
    transaction.objectStore('log').clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
