/*
 * Nudge · outbox. Every change you make is saved on the phone first (IndexedDB), the screen updates straight away,
 * and the changes go to the server in the background, several at a time. A change is only forgotten once the server
 * has it. If the server can't be reached it retries quietly (1s, 3s, 8s, 20s, then every minute) and keeps your
 * change safe meanwhile; only the server saying "no" (e.g. not enough cash) undoes it.
 */
(function (root) {
  var BACKOFF = [1000, 3000, 8000, 20000, 60000];

  /** A tiny key-value store: IndexedDB when there is one, otherwise memory (tests, private windows). */
  function idbStore(name) {
    var mem = {}, dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (res) {
        try {
          if (!root.indexedDB) return res(null);
          var q = root.indexedDB.open(name || 'nudge', 1);
          q.onupgradeneeded = function () { q.result.createObjectStore('kv'); };
          q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; q.onblocked = function () { res(null); };
        } catch (e) { res(null); }
      });
      return dbp;
    }
    function tx(mode, fn) { return db().then(function (d) { if (!d) return fn(null); return new Promise(function (res) { try { var t = d.transaction('kv', mode), s = t.objectStore('kv'), r = fn(s); t.oncomplete = function () { res(r && r.result); }; t.onerror = function () { res(null); }; } catch (e) { res(fn(null)); } }); }); }
    return {
      get: function (k) { return tx('readonly', function (s) { return s ? s.get(k) : { result: mem[k] }; }).then(function (v) { return v === undefined ? mem[k] : v; }); },
      set: function (k, v) { mem[k] = v; return tx('readwrite', function (s) { if (s) s.put(v, k); return null; }); }
    };
  }
  function memStore() { var m = {}; return { get: function (k) { return Promise.resolve(m[k]); }, set: function (k, v) { m[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); }, _m: m }; }

  /**
   * opts: send(items) -> Promise<{ results: [{ id, ok, result, error }], state }> (a rejection means "couldn't reach it"),
   *       onResult(item, result, state), onReject(item, error, state), onState(state, morePending), onStatus({ pending, failing, offline }),
   *       store, key, delay (ms to gather taps), timers ({ set, clear }), now
   */
  function create(opts) {
    var store = opts.store || idbStore('nudge'), key = opts.key || 'outbox', delay = opts.delay === undefined ? 200 : opts.delay;
    var T = opts.timers || { set: function (f, ms) { return setTimeout(f, ms); }, clear: function (h) { clearTimeout(h); } };
    var q = [], sending = null, timer = null, fails = 0, n = 0, ready, waiters = {};
    var status = function () { if (opts.onStatus) opts.onStatus({ pending: q.length, failing: fails, offline: fails >= 3 }); };
    var persist = function () { return store.set(key, q); };
    ready = Promise.resolve(store.get(key)).then(function (saved) { if (Array.isArray(saved) && saved.length) { q = saved.concat(q); status(); schedule(0); } });
    function schedule(ms) { if (timer) T.clear(timer); timer = T.set(function () { timer = null; flush(); }, ms); }
    function add(fn, args, meta) {
      var it = { id: Date.now().toString(36) + '.' + (++n).toString(36), fn: fn, args: args || [], at: Date.now(), tries: 0, meta: meta || null };
      q.push(it); persist(); status(); schedule(delay);
      return { id: it.id, done: new Promise(function (res, rej) { waiters[it.id] = { res: res, rej: rej }; }) };
    }
    function settle(id, ok, v) { var w = waiters[id]; if (!w) return; delete waiters[id]; if (ok) w.res(v); else w.rej(v); }
    function flush() {
      if (sending) return sending;
      if (!q.length) return Promise.resolve();
      var batch = q.slice(0, 40);
      batch.forEach(function (it) { it.tries++; });
      sending = Promise.resolve().then(function () { return opts.send(batch.map(function (it) { return { id: it.id, fn: it.fn, args: it.args }; })); }).then(function (out) {
        sending = null; fails = 0;
        var byId = {}; (out.results || []).forEach(function (r) { byId[r.id] = r; });
        var sent = {}; batch.forEach(function (it) { sent[it.id] = 1; });
        q = q.filter(function (it) { return !sent[it.id]; });
        persist();
        batch.forEach(function (it) {
          var r = byId[it.id] || { ok: false, error: 'No reply for that change.' };
          if (r.ok) { if (opts.onResult) opts.onResult(it, r.result, out.state); settle(it.id, true, { result: r.result, state: out.state }); }
          else { if (opts.onReject) opts.onReject(it, r.error, out.state); settle(it.id, false, new Error(r.error)); }
        });
        if (opts.onState && out.state) opts.onState(out.state, q.length > 0);
        status();
        if (q.length) schedule(0);
      }, function () {
        // couldn't reach the server: keep everything, try again later
        sending = null; fails++; status();
        schedule(BACKOFF[Math.min(fails - 1, BACKOFF.length - 1)]);
      });
      return sending;
    }
    return { add: add, flush: flush, ready: ready, pending: function () { return q.slice(); }, failing: function () { return fails; }, retryNow: function () { schedule(0); } };
  }

  var api = { create: create, idbStore: idbStore, memStore: memStore, BACKOFF: BACKOFF };
  root.NudgeOutbox = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
