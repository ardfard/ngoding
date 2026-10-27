// Tiny IndexedDB key-value store (used for the saved VM snapshot).
const DB = "ngoding";
const STORE = "kv";

function open() {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((ok, fail) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      ok(req.result);
    };
    t.onerror = () => fail(t.error);
  });
}

export const get = (key) => tx("readonly", (s) => s.get(key));
export const put = (key, value) => tx("readwrite", (s) => s.put(value, key));
export const del = (key) => tx("readwrite", (s) => s.delete(key));
