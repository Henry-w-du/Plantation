(function (P) {
  'use strict';
  const DB_NAME = 'plantation-pwa';
  const DB_VERSION = 2;
  const STORE_NAME = 'application';
  const STATE_KEY = 'state-v2';
  const FALLBACK_KEY = 'plantation.github-pages.v2';
  const LEGACY_KEYS = ['plantation-local-v1', 'plantation-singlefile-v1'];
  let storageMode = 'indexedDB';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Cannot open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    });
  }

  async function readIndexedDB() {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Cannot read IndexedDB'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB read aborted'));
      });
    } finally {
      db.close();
    }
  }

  async function writeIndexedDB(state) {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(state, STATE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Cannot write IndexedDB'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
      });
    } finally {
      db.close();
    }
  }

  function readLocalStorageCandidates() {
    const candidates = [];
    const invalidKeys = [];
    for (const key of [FALLBACK_KEY, ...LEGACY_KEYS]) {
      const serialized = localStorage.getItem(key);
      if (!serialized) continue;
      try { candidates.push({ raw: JSON.parse(serialized), source: key }); }
      catch (error) { invalidKeys.push(key); }
    }
    return { candidates, invalidKeys };
  }

  function candidateTimestamp(raw) {
    const value = Date.parse(raw?.meta?.updatedAt || raw?.meta?.createdAt || '');
    return Number.isFinite(value) ? value : 0;
  }

  async function save(state) {
    const clean = P.Backup.normalize(state);
    clean.meta.updatedAt = new Date().toISOString();
    try {
      await writeIndexedDB(clean);
      storageMode = 'indexedDB';
      return clean;
    } catch (idbError) {
      try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(clean));
        storageMode = 'localStorage';
        return clean;
      } catch (localError) {
        const error = new Error('浏览器拒绝保存数据。请退出无痕模式、释放存储空间，或先导出备份。');
        error.cause = { idbError, localError };
        throw error;
      }
    }
  }

  async function load() {
    const candidates = [];
    const warningParts = [];
    let indexedDBAvailable = false;
    try {
      const raw = await readIndexedDB();
      indexedDBAvailable = true;
      storageMode = 'indexedDB';
      if (raw) candidates.push({ raw, source: STATE_KEY });
    } catch (error) {
      storageMode = 'localStorage';
      warningParts.push('当前环境无法使用 IndexedDB，已改用 localStorage。请更频繁地导出备份。');
    }
    try {
      const local = readLocalStorageCandidates();
      candidates.push(...local.candidates);
      if (local.invalidKeys.length) warningParts.push('有一份本机备用数据无法解析，原内容未被覆盖。');
    } catch (error) {
      warningParts.push('本机备用存储无法读取，原内容未被覆盖。');
    }
    if (!candidates.length) return { state: P.Backup.emptyState(), storageMode, migrated: false, warning: warningParts.join(' ') };

    const valid = [];
    for (const candidate of candidates) {
      try {
        valid.push({ ...candidate, state: P.Backup.normalize(candidate.raw), updatedAt: candidateTimestamp(candidate.raw) });
      } catch (error) {
        warningParts.push(`一份本机数据未通过校验（${error.message}），已继续查找可用副本。`);
      }
    }
    if (!valid.length) return {
      state: P.Backup.emptyState(), storageMode, migrated: false,
      warning: `${warningParts.join(' ')} 本机数据均无法使用，尚未覆盖原内容。`.trim()
    };

    valid.sort((first, second) => second.updatedAt - first.updatedAt || (first.source === STATE_KEY ? -1 : second.source === STATE_KEY ? 1 : 0));
    const chosen = valid[0];
    const migrated = Number(chosen.raw.schemaVersion) !== 2 || LEGACY_KEYS.includes(chosen.source);
    if (chosen.source === FALLBACK_KEY && candidates.some((item) => item.source === STATE_KEY) && chosen.updatedAt > candidateTimestamp(candidates.find((item) => item.source === STATE_KEY).raw)) {
      warningParts.push('检测到比 IndexedDB 更新的本地备用数据，已优先恢复。');
    }

    let state = chosen.state;
    if (migrated || (indexedDBAvailable && chosen.source !== STATE_KEY)) {
      try { state = await save(state); }
      catch (error) { warningParts.push('恢复的数据暂时无法同步到首选存储，请立即导出完整备份。'); }
    }
    return { state, storageMode, migrated, warning: warningParts.join(' ') };
  }

  P.Storage = { load, save, mode: () => storageMode, fallbackKey: FALLBACK_KEY };
})(window.Plantation = window.Plantation || {});
