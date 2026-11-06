// Thin layer around IndexedDB. All data stays on the device.

const DB_NAME = 'gymlog';
const STORES = ['exercises', 'workouts', 'sets', 'notes', 'meta'];
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(stores, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = work(t);
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getAll = (store) => tx([store], 'readonly', (t) => t.objectStore(store).getAll());
export const put = (store, value) => tx([store], 'readwrite', (t) => { t.objectStore(store).put(value); });
export const remove = (store, id) => tx([store], 'readwrite', (t) => { t.objectStore(store).delete(id); });

export const putMany = (store, values) =>
  tx([store], 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const value of values) os.put(value);
  });

export const removeMany = (store, ids) =>
  tx([store], 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const id of ids) os.delete(id);
  });

export const getMeta = async (key, fallback = null) => {
  const row = await tx(['meta'], 'readonly', (t) => t.objectStore('meta').get(key));
  return row ? row.value : fallback;
};

export const setMeta = (key, value) => put('meta', { key, value });
export const removeMeta = (key) => remove('meta', key);

/** Clears the training data in one go. Backup settings in meta are kept. */
export const clearData = (metaKeys = []) =>
  tx(STORES, 'readwrite', (t) => {
    for (const name of ['exercises', 'workouts', 'sets', 'notes']) t.objectStore(name).clear();
    for (const key of metaKeys) t.objectStore('meta').delete(key);
  });
