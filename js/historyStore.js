export const historyStore = (function () {
  const DB = "bingkai-history", STORE = "exports", CAP = 24;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function store(mode) { const db = await open(); return db.transaction(STORE, mode).objectStore(STORE); }
  async function list() { const st = await store("readonly"); const all = await reqP(st.getAll()); return (all || []).sort((a, b) => b.ts - a.ts); }
  async function add(rec) { const st = await store("readwrite"); await reqP(st.put(rec)); await prune(); }
  async function remove(id) { const st = await store("readwrite"); await reqP(st.delete(id)); }
  async function clear() { const st = await store("readwrite"); await reqP(st.clear()); }
  async function prune() {
    const items = await list();
    if (items.length > CAP) { const st = await store("readwrite"); for (const o of items.slice(CAP)) st.delete(o.id); }
  }
  return { add, list, remove, clear };
})();
