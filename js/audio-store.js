/* === 录音本地存储（IndexedDB）===
   每条口语回答的录音（WAV Blob）存在浏览器 IndexedDB，按 audioId 存取。
   ⚠️ 不进 DATA / localStorage：因此不随 KV 云端同步、不进 JSON 导出备份；
      换浏览器 / 清站点数据会丢（用户已选本地存储，知情）。
   挂全局 window.audioStore，供 speaking.js 在软导航重跑后继续访问。 */
(function () {
  const DB = 'ielts-hub-audio';
  const STORE = 'recordings';
  let _dbp = null;

  function open() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (ok, no) {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function (e) { ok(e.target.result); };
      r.onerror = function (e) { no(e); };
    });
    return _dbp;
  }

  function put(blob, meta) {
    return open().then(function (db) {
      return new Promise(function (ok, no) {
        const id = 'a' + Date.now() + Math.random().toString(36).slice(2, 7);
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(Object.assign({ id: id, blob: blob }, meta || {}));
        tx.oncomplete = function () { ok(id); };
        tx.onerror = function () { no(tx.error); };
      });
    });
  }

  function get(id) {
    if (!id) return Promise.resolve(null);
    return open().then(function (db) {
      return new Promise(function (ok, no) {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () { ok(req.result ? req.result.blob : null); };
        req.onerror = function () { no(req.error); };
      });
    });
  }

  function del(id) {
    if (!id) return Promise.resolve();
    return open().then(function (db) {
      return new Promise(function (ok, no) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { no(tx.error); };
      });
    });
  }

  window.audioStore = { put: put, get: get, del: del };
})();
