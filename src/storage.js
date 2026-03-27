/**
 * IndexedDB wrapper for persisting transaction data.
 * localStorage is used only for lightweight settings (column mapping, preferences).
 * Transaction data never leaves the browser.
 */

const DB_NAME = 'localledger';
const DB_VERSION = 1;
const TX_STORE = 'transactions';

let _db = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(TX_STORE)) {
        db.createObjectStore(TX_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

/** Save (overwrite) all transactions in IndexedDB */
export async function saveTransactions(transactions) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TX_STORE, 'readwrite');
    const store = tx.objectStore(TX_STORE);
    store.clear();
    transactions.forEach((t) => store.put(t));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load all transactions from IndexedDB */
export async function loadTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TX_STORE, 'readonly');
    const store = tx.objectStore(TX_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Delete all transactions from IndexedDB */
export async function clearTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TX_STORE, 'readwrite');
    const store = tx.objectStore(TX_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// localStorage helpers for settings (small, non-sensitive data)
// ---------------------------------------------------------------------------

const LS_PREFIX = 'll_';

export function saveSetting(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable – silently fail
  }
}

export function loadSetting(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw !== null ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function clearSettings() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
