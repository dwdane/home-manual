// store.js
/**
 * Persistence: a promise wrapper over IndexedDB with the stores declared in
 * config.js, a v1 -> v2 migration, and backup/restore that can include or
 * exclude photo binaries.
 *
 * v1 of this app shipped database version 1 with stores meta/tasks/assets/log
 * and a single 'profile' meta record. The upgrade to version 2 adds the new
 * stores and indexes; migrateV1() then turns the profile into a house subject
 * and tags every existing record with its subjectId.
 */

import { APP } from './config.js';

const META_STORE = 'meta';
const DB_VERSION = 2;

let dbPromise = null;

/** Open (and if needed create/upgrade) the database. */
function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(APP.db, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      const upTx = req.transaction;

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }

      for (const spec of APP.stores) {
        const os = db.objectStoreNames.contains(spec.name)
          ? upTx.objectStore(spec.name)
          : db.createObjectStore(spec.name, { keyPath: spec.keyPath || 'id' });
        for (const idx of spec.indexes || []) {
          if (!os.indexNames.contains(idx.name)) {
            os.createIndex(idx.name, idx.path, idx.options || {});
          }
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/**
 * Run a transaction and resolve when it commits.
 * @param {string|string[]} names
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => any} fn
 */
async function tx(names, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    let result;
    try {
      result = fn(t);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Wrap a request so `tx` resolves with its result. */
function req(request) {
  return { __req: request };
}

// --- meta ------------------------------------------------------------------

/** Read a meta record's value, or null. */
export async function getMeta(key) {
  const rec = await tx(META_STORE, 'readonly', (t) => req(t.objectStore(META_STORE).get(key)));
  return rec ? rec.value : null;
}

/** Write a meta record. */
export function setMeta(key, value) {
  return tx(META_STORE, 'readwrite', (t) => t.objectStore(META_STORE).put({ key, value }));
}

/** Delete a meta record. */
export function delMeta(key) {
  return tx(META_STORE, 'readwrite', (t) => t.objectStore(META_STORE).delete(key));
}

// --- collections -----------------------------------------------------------

/** Every record in a store. */
export function list(store) {
  return tx(store, 'readonly', (t) => req(t.objectStore(store).getAll()));
}

/** Records in a store matching an index value. */
export function listBy(store, index, value) {
  return tx(store, 'readonly', (t) => req(t.objectStore(store).index(index).getAll(value)));
}

/** One record by key. */
export function get(store, id) {
  return tx(store, 'readonly', (t) => req(t.objectStore(store).get(id)));
}

/** Insert or update one record. */
export function put(store, record) {
  return tx(store, 'readwrite', (t) => t.objectStore(store).put(record));
}

/** Insert or update many records in one transaction. */
export function putMany(store, records) {
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const r of records) os.put(r);
  });
}

/** Delete one record. */
export function remove(store, id) {
  return tx(store, 'readwrite', (t) => t.objectStore(store).delete(id));
}

/** Delete many records by id in one transaction. */
export function removeMany(store, ids) {
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const id of ids) os.delete(id);
  });
}

/** Empty a store. */
export function clearStore(store) {
  return tx(store, 'readwrite', (t) => t.objectStore(store).clear());
}

// --- v1 migration ----------------------------------------------------------

/** Short unique id with a readable prefix. */
export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * If this device holds v1 data (a profile but no subjects), convert it:
 * profile -> house subject; tasks/assets/log tagged with the subjectId.
 * Safe to call on every boot; does nothing once subjects exist.
 * @returns {Promise<boolean>} whether a migration ran
 */
export async function migrateV1() {
  const subjects = await list('subjects');
  if (subjects.length) return false;

  const profile = await getMeta('profile');
  if (!profile) return false;

  const houseId = newId('sub');
  await put('subjects', {
    id: houseId,
    kind: 'house',
    name: profile.houseName || 'My house',
    features: profile,
    specs: [],
    seeded: true,
    created: new Date().toISOString().slice(0, 10),
  });

  for (const store of ['tasks', 'assets', 'log']) {
    const records = await list(store);
    if (!records.length) continue;
    for (const r of records) r.subjectId = houseId;
    await putMany(store, records);
  }

  await setMeta('activeSubjectId', houseId);
  await delMeta('profile');
  return true;
}

// --- backup ----------------------------------------------------------------

/** Blob -> base64 string. */
function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read a photo.'));
    r.readAsDataURL(blob);
  });
}

/** base64 string -> Blob. */
function b64ToBlob(b64, type = 'image/jpeg') {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

/**
 * Serialize the database.
 * @param {{includePhotos?: boolean}} [opts] photo binaries roughly 10x the
 *   backup size; excluding them keeps the tags and captions so a restore
 *   loses images but not organization.
 */
export async function exportBackup({ includePhotos = false } = {}) {
  const data = {};
  for (const spec of APP.stores) {
    if (spec.name === 'photos') continue;
    data[spec.name] = await list(spec.name);
  }

  const photos = await list('photos');
  data.photos = [];
  for (const p of photos) {
    const rec = { ...p };
    if (includePhotos && p.blob) {
      rec.blobB64 = await blobToB64(p.blob);
      rec.thumbB64 = p.thumb ? await blobToB64(p.thumb) : null;
    }
    delete rec.blob;
    delete rec.thumb;
    data.photos.push(rec);
  }

  const meta = {};
  const metaRecs = await tx(META_STORE, 'readonly', (t) => req(t.objectStore(META_STORE).getAll()));
  for (const rec of metaRecs || []) meta[rec.key] = rec.value;

  return {
    app: APP.db,
    version: APP.version,
    exported: new Date().toISOString(),
    includesPhotos: includePhotos,
    meta,
    data,
  };
}

/**
 * Replace the database contents from a backup object.
 * @throws if the file came from a different app
 */
export async function importBackup(backup) {
  if (!backup || backup.app !== APP.db) {
    throw new Error('That backup file is from a different app.');
  }

  for (const spec of APP.stores) {
    await clearStore(spec.name);
    let records = (backup.data && backup.data[spec.name]) || [];
    if (spec.name === 'photos') {
      records = records.map((p) => {
        const rec = { ...p };
        if (rec.blobB64) {
          rec.blob = b64ToBlob(rec.blobB64);
          rec.thumb = rec.thumbB64 ? b64ToBlob(rec.thumbB64) : null;
        }
        delete rec.blobB64;
        delete rec.thumbB64;
        return rec;
      }).filter((p) => p.blob); // tag-only photo records are dropped on restore
    }
    if (records.length) await putMany(spec.name, records);
  }

  await clearStore(META_STORE);
  for (const [key, value] of Object.entries(backup.meta || {})) {
    await setMeta(key, value);
  }
}

/** Erase everything this app has stored on the device. */
export async function clearAllData() {
  for (const spec of APP.stores) await clearStore(spec.name);
  await clearStore(META_STORE);
}
