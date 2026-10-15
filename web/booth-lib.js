/*
 * Afterhours: Booth · track library.
 * Your tracks live in this browser (IndexedDB "lq-dj", shared with the first DJ game,
 * so the 12 you already added show up here). Booth keeps its own analysis cache
 * (IndexedDB "booth": BPM, beat grid, downbeat, key, waveform, genre, hot cues),
 * so each track is analysed once. Built-in loops are generated with exact grids.
 */
(function (root) {
  'use strict';
  var DSP = root.BoothDSP;
  /*
   * Storage rules (learned the hard way):
   * - Never delete or "start fresh": upgrades only ever ADD stores (see the upgrade functions).
   * - A database upgrade waits while another tab has the old version open. We never wait forever:
   *   every open/read has a time limit, the built-in loops never depend on storage, and the tracks
   *   database doesn't depend on the analysis database.
   * - When another tab upgrades, this tab closes its connection so it can't block the upgrade.
   */
  var status = { blocked: '', updated: false, lastError: '' }, listeners = [];
  function notify(what, detail) { listeners.forEach(function (f) { try { f(what, detail, status); } catch (e) {} }); }
  function openDb(name, ver, upgrade) {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('This browser can\'t store tracks.'));
      var r; try { r = root.indexedDB.open(name, ver); } catch (e) { return rej(e); }
      r.onupgradeneeded = function (e) { upgrade(r.result, e.oldVersion || 0); };
      r.onsuccess = function () {
        var d = r.result;
        if (status.blocked === name) { status.blocked = ''; notify('unblocked', name); }
        d.onversionchange = function () { d.close(); if (name === 'lq-dj') tracksDb = null; else boothDb = null; status.updated = true; notify('updated', name); };
        res(d);
      };
      r.onerror = function () { rej(r.error || new Error('Couldn\'t open ' + name)); };
      r.onblocked = function () { status.blocked = name; notify('blocked', name); };
    });
  }
  function timeout(p, ms, what) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { var e = new Error(what); e.code = status.blocked ? 'blocked' : 'timeout'; rej(e); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  var tracksDb = null, boothDb = null, WAIT = 4000;
  // lq-dj v1: { tracks } (shared with the first DJ game; never change its version)
  function tdb() { return tracksDb || (tracksDb = openDb('lq-dj', 1, function (d) { if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' }); })); }
  // booth v1: { analysis }; v2 adds { mixes }. Upgrades only add what's missing.
  function bdb() { return boothDb || (boothDb = openDb('booth', 2, function (d, from) { if (!d.objectStoreNames.contains('analysis')) d.createObjectStore('analysis', { keyPath: 'id' }); if (!d.objectStoreNames.contains('mixes')) d.createObjectStore('mixes', { keyPath: 'id' }); })); }
  function tx(dbp, store, mode, fn) {
    return timeout(dbp, WAIT, 'Your library is taking too long to open.').then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = function () { res(r ? r.result : undefined); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error('Storage write was cancelled.')); }; }); });
  }

  // Built-in loops: exact BPM, grid at 0, known key (the acid line is in A minor = 8A).
  var LOOPS = [
    { id: 'loop:kick125', name: 'Built-in: kick only', bpm: 125, parts: ['kick'], genre: 'Drill loop' },
    { id: 'loop:groove128', name: 'Built-in: kick and hats', bpm: 128, parts: ['kick', 'hats'], genre: 'Drill loop' },
    { id: 'loop:rumble130', name: 'Built-in: rumble techno', bpm: 130, parts: ['kick', 'hats', 'rumble'], genre: 'Techno' },
    { id: 'loop:acid132', name: 'Built-in: acid line', bpm: 132, parts: ['kick', 'hats', 'acid'], genre: 'Acid', camelot: '8A', key: 'Am' },
    { id: 'loop:acid126', name: 'Built-in: slow acid', bpm: 126, parts: ['kick', 'acid'], genre: 'Acid', camelot: '8A', key: 'Am' },
    { id: 'loop:hard135', name: 'Built-in: hard groove', bpm: 135, parts: ['kick', 'hats', 'rumble'], genre: 'Hard groove' },
    // for the Academy: breakdowns (bars 17-24) with a drop on bar 25, and acid lines in other keys
    { id: 'loop:drop130', name: 'Built-in: techno with a drop', bpm: 130, parts: ['kick', 'hats', 'rumble'], breakdown: [16, 24], genre: 'Techno' },
    { id: 'loop:dropacid130', name: 'Built-in: acid with a drop', bpm: 130, parts: ['kick', 'hats', 'acid'], breakdown: [16, 24], genre: 'Acid', camelot: '8A', key: 'Am' },
    { id: 'loop:acid132e', name: 'Built-in: acid in E minor', bpm: 132, parts: ['kick', 'hats', 'acid'], root: 52, genre: 'Acid', camelot: '9A', key: 'Em' },
    { id: 'loop:acid132eb', name: 'Built-in: acid in E flat minor', bpm: 132, parts: ['kick', 'hats', 'acid'], root: 51, genre: 'Acid', camelot: '2A', key: 'Ebm' }
  ];

  function loopItems(prev, an) {
    return LOOPS.map(function (l) { var a = (an && an[l.id]) || {}, old = (prev || []).filter(function (x) { return x.id === l.id; })[0]; return { id: l.id, name: l.name, loop: l, own: false, analysed: true, bpm: l.bpm, first: 0, key: l.key || '', camelot: l.camelot || '', waves: old ? old.waves : null, dur: 32 * 4 * 60 / l.bpm, genre: l.genre, hot: a.hot || (old && old.hot) || [] }; });
  }
  function Library(ctx) {
    this.ctx = ctx; this.buffers = {}; this.worker = null; this.jobs = {};
    this.items = loopItems();            // the built-in loops are always there, whatever happens to storage
    this.problem = '';
  }
  Library.status = status;
  Library._setWait = function (ms) { WAIT = ms; };   // tests
  Library.onStatus = function (f) { listeners.push(f); };
  var L = Library.prototype;
  L.list = function () {
    var self = this, problems = [];
    var why = function (e, what) { problems.push(e && e.code === 'blocked' ? 'blocked' : what + ': ' + (e && e.message || e)); return null; };
    return Promise.all([
      tx(tdb(), 'tracks', 'readonly', function (s) { return s.getAll(); }).catch(function (e) { return why(e, 'Your tracks couldn\'t be read'); }),
      tx(bdb(), 'analysis', 'readonly', function (s) { return s.getAll(); }).catch(function (e) { return why(e, 'Track analysis couldn\'t be read'); })
    ]).then(function (r) {
      self.problem = problems.indexOf('blocked') !== -1 ? 'blocked' : problems.join(' · ');
      if (r[0] === null && self.items.some(function (x) { return x.own; })) { self.items = self.items; return self.items; }   // keep what we had rather than showing nothing
      var an = {}; (r[1] || []).forEach(function (a) { an[a.id] = a; });
      var mine = (r[0] || []).sort(function (a, b) { return a.added - b.added; }).map(function (t) {
        var a = an[t.id];
        return { id: t.id, name: t.name, own: true, analysed: !!(a && a.v >= 2), bpm: a ? a.bpm : t.bpm, first: a ? a.first : t.first, key: a ? a.key : '', camelot: a ? a.camelot : '', waves: a ? a.waves : null, dur: a ? a.dur : t.dur, genre: a && a.genre || '', hot: a && a.hot || [], edited: !!(a && a.edited) };
      });
      var oldOwn = {}; self.items.forEach(function (x) { if (x.own) oldOwn[x.id] = x; });
      if (r[1] === null) mine = mine.map(function (m) { var o = oldOwn[m.id]; return o ? Object.assign(m, { analysed: o.analysed, bpm: o.bpm, first: o.first, key: o.key, camelot: o.camelot, waves: o.waves, genre: o.genre, hot: o.hot }) : m; });
      self.items = mine.concat(loopItems(self.items, an));
      return self.items;
    });
  };
  L.get = function (id) { return this.items.filter(function (x) { return x.id === id; })[0]; };
  /** The decoded audio for a track (built-in loops are generated). Keeps the last few in memory. */
  L.buffer = function (item) {
    var self = this, c = this.ctx;
    if (this.buffers[item.id]) { if (item.loop && !item.waves) item.waves = DSP.waves(this.buffers[item.id].getChannelData(0), c.sampleRate); return Promise.resolve(this.buffers[item.id]); }
    var p;
    if (item.loop) {
      var g = DSP.makeLoop({ parts: item.loop.parts, bpm: item.loop.bpm, bars: 32, sampleRate: c.sampleRate, seed: item.loop.bpm, root: item.loop.root, breakdown: item.loop.breakdown });
      var b = c.createBuffer(2, g.left.length, c.sampleRate); b.copyToChannel(g.left, 0); b.copyToChannel(g.right, 1);
      if (!item.waves) item.waves = DSP.waves(g.left, c.sampleRate);
      p = Promise.resolve(b);
    } else {
      p = tx(tdb(), 'tracks', 'readonly', function (s) { return s.get(item.id); }).then(function (rec) {
        if (!rec || !rec.blob) throw new Error('That track\'s audio is missing on this computer.');
        return rec.blob.arrayBuffer();
      }).then(function (ab) { return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); }); });
    }
    return p.then(function (buf) {
      if (item.loop && !item.waves) item.waves = DSP.waves(buf.getChannelData(0), buf.sampleRate);
      var keys = Object.keys(self.buffers); if (keys.length >= 4) delete self.buffers[keys[0]];
      self.buffers[item.id] = buf; return buf;
    });
  };
  function mono(buf) {
    var a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, o = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) o[i] = b ? (a[i] + b[i]) * 0.5 : a[i];
    return o;
  }
  L.analyseOne = function (item) {
    var self = this;
    if (!this.worker) {
      this.worker = new Worker('booth-dsp.js');
      this.worker.onmessage = function (e) { var j = self.jobs[e.data.id]; if (!j) return; delete self.jobs[e.data.id]; if (e.data.ok) j.res(e.data.result); else j.rej(new Error(e.data.error)); };
    }
    return this.buffer(item).then(function (buf) {
      var m = mono(buf);
      return new Promise(function (res, rej) { self.jobs[item.id] = { res: res, rej: rej }; self.worker.postMessage({ id: item.id, mono: m, sampleRate: buf.sampleRate }, [m.buffer]); });
    }).then(function (r) {
      r.id = item.id; r.genre = item.genre || ''; r.hot = item.hot || []; r.at = Date.now();
      return tx(bdb(), 'analysis', 'readwrite', function (s) { s.put(r); }).then(function () {
        // keep the first DJ game in step with the better grid
        tx(tdb(), 'tracks', 'readwrite', function (s) { var g = s.get(item.id); g.onsuccess = function () { var t = g.result; if (t) { t.bpm = r.bpm; t.first = r.first; s.put(t); } }; }).catch(function () {});
        Object.assign(item, { analysed: true, bpm: r.bpm, first: r.first, key: r.key, camelot: r.camelot, waves: r.waves, dur: r.dur });
        return item;
      });
    });
  };
  /** Analyse everything that hasn't been yet, one at a time. progress(done, total, item). */
  L.analyseAll = function (progress) {
    var self = this, todo = this.items.filter(function (x) { return x.own && !x.analysed; }), i = 0;
    function next() {
      if (i >= todo.length) return Promise.resolve(todo.length);
      var it = todo[i];
      progress && progress(i, todo.length, it);
      return self.analyseOne(it).then(function () { i++; return next(); }, function (e) {
        if (e && (e.code === 'blocked' || e.code === 'timeout')) return i;        // storage is stuck: stop and try again later, don't mark tracks as broken
        it.error = /decode|EncodingError/i.test(e && (e.name + ' ' + e.message)) ? 'Chrome can\'t read this file\'s audio' : (e && e.message || String(e)); i++; return next();
      });
    }
    return next();
  };
  /** Save edits to a track: grid (bpm, first), genre, hot cues. */
  L.update = function (item, change) {
    Object.assign(item, change);
    if (change.bpm !== undefined || change.first !== undefined) item.edited = true;
    if (item.loop) {
      return tx(bdb(), 'analysis', 'readwrite', function (s) { s.put({ id: item.id, hot: item.hot, v: 0 }); });
    }
    return tx(bdb(), 'analysis', 'readwrite', function (s) {
      var g = s.get(item.id);
      g.onsuccess = function () { var a = g.result || { id: item.id }; ['bpm', 'first', 'genre', 'hot', 'edited'].forEach(function (k) { if (item[k] !== undefined) a[k] = item[k]; }); s.put(a); };
    }).then(function () {
      if (change.bpm === undefined && change.first === undefined) return;
      return tx(tdb(), 'tracks', 'readwrite', function (s) { var g = s.get(item.id); g.onsuccess = function () { var t = g.result; if (t) { t.bpm = item.bpm; t.first = item.first; s.put(t); } }; });
    });
  };
  var AUDIO_EXT = /\.(mp3|wav|wave|aiff?|flac|ogg|oga|opus|m4a|mp4|aac|webm)$/i;
  function friendly(e) {
    var n = e && (e.name || ''), m = e && e.message || String(e);
    if (n === 'QuotaExceededError' || /quota/i.test(m)) return 'There isn\'t enough storage space for it. Free up some disk space, or remove tracks you don\'t use, then try again.';
    if (e && e.code === 'blocked') return 'Your library is locked by another Booth tab. Close (or reload) your other Booth tabs, then try again.';
    if (e && e.code === 'timeout') return 'Your library is taking too long to open. Close other Booth tabs and reload this page, then try again.';
    return m;
  }
  Library.friendly = friendly;
  /** Add audio files from your computer (shared with the first DJ game). Each file is checked first.
   *  Resolves { added: [names], failed: [{ name, reason }] }. */
  L.addFiles = function (files) {
    var self = this, c = this.ctx, added = [], failed = [];
    var list = [].slice.call(files || []);
    return list.reduce(function (p, f) {
      return p.then(function () {
        var name = String(f.name || 'Track');
        if (!(/^audio\//.test(f.type || '') || AUDIO_EXT.test(name))) { failed.push({ name: name, reason: 'This isn\'t an audio file. Booth takes MP3, WAV, AIFF, FLAC, OGG or M4A.' }); return; }
        if (f.size > 300 * 1024 * 1024) { failed.push({ name: name, reason: 'It\'s over 300 MB, too big to keep in the browser. Use an MP3 or a shorter file.' }); return; }
        if (!f.size) { failed.push({ name: name, reason: 'The file is empty.' }); return; }
        return f.arrayBuffer().then(function (ab) {
          // can Chrome actually play it? (decoding a copy, so the original bytes are stored untouched)
          return new Promise(function (res, rej) { try { var pr = c.decodeAudioData(ab.slice(0), res, rej); if (pr && pr.then) pr.then(res, rej); } catch (e) { rej(e); } })
            .then(null, function () { var e = new Error('Chrome can\'t read the audio in this file (it may be damaged, or in a format Chrome can\'t play, like ALAC). Convert it to MP3 or WAV and try again.'); e.decode = true; throw e; });
        }).then(function () {
          var id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          return tx(tdb(), 'tracks', 'readwrite', function (s) { s.put({ id: id, name: name.replace(/\.[^.]+$/, '').slice(0, 80), blob: f, bpm: 0, first: 0, dur: 0, added: Date.now() }); });
        }).then(function () { added.push(name); }, function (e) { failed.push({ name: name, reason: e && e.decode ? e.message : friendly(e) }); });
      });
    }, Promise.resolve()).then(function () { return self.list(); }).then(function () { return { added: added, failed: failed }; });
  };
  /** Ask the browser to never clear the library on its own (Chrome usually agrees for sites you use). */
  Library.persist = function () {
    var s = root.navigator && navigator.storage;
    if (!s || !s.persist) return Promise.resolve(false);
    return s.persisted().then(function (p) { return p || s.persist(); }).catch(function () { return false; });
  };
  /** What's in storage right now (for the Storage check in Sound settings). */
  L.diagnose = function () {
    var out = { tracks: null, analysis: null, mixes: null, persisted: null, usage: null, quota: null, blocked: status.blocked, problem: this.problem };
    var s = root.navigator && navigator.storage;
    return Promise.all([
      tx(tdb(), 'tracks', 'readonly', function (st) { return st.count(); }).then(function (n) { out.tracks = n; }, function (e) { out.tracksError = friendly(e); }),
      tx(bdb(), 'analysis', 'readonly', function (st) { return st.count(); }).then(function (n) { out.analysis = n; }, function (e) { out.analysisError = friendly(e); }),
      tx(bdb(), 'mixes', 'readonly', function (st) { return st.count(); }).then(function (n) { out.mixes = n; }, function () {}),
      s && s.persisted ? s.persisted().then(function (p) { out.persisted = p; }) : null,
      s && s.estimate ? s.estimate().then(function (e) { out.usage = e.usage; out.quota = e.quota; }) : null
    ]).then(function () { return out; });
  };

  // ---------- library backup: one file with every track, its analysis, grid edits, genres and hot cues ----------
  function b64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function unb64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  var MAGIC = 'BOOTHLIB1';
  L.exportBackup = function () {
    return Promise.all([tx(tdb(), 'tracks', 'readonly', function (s) { return s.getAll(); }), tx(bdb(), 'analysis', 'readonly', function (s) { return s.getAll(); }).catch(function () { return []; })]).then(function (r) {
      var tracks = r[0] || [], off = 0, parts = [];
      var head = { format: 'booth-library', version: 1, exported: new Date().toISOString(), tracks: tracks.map(function (t) { var o = { id: t.id, name: t.name, bpm: t.bpm, first: t.first, dur: t.dur, added: t.added, type: t.blob && t.blob.type || '', size: t.blob ? t.blob.size : 0, offset: off }; off += o.size; parts.push(t.blob || new Blob([])); return o; }),
        analysis: (r[1] || []).map(function (a) { var o = Object.assign({}, a); if (a.waves) o.waves = { rate: a.waves.rate, low: b64(a.waves.low), mid: b64(a.waves.mid), high: b64(a.waves.high) }; return o; }) };
      var hj = new TextEncoder().encode(JSON.stringify(head)), len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, hj.length);
      return new Blob([MAGIC, len, hj].concat(parts), { type: 'application/octet-stream' });
    });
  };
  /** Restore a backup: adds tracks you don't have (same ids are kept as they are) and their analysis. Never deletes. */
  L.importBackup = function (file) {
    var self = this;
    return file.slice(0, MAGIC.length + 4).arrayBuffer().then(function (ab) {
      var u = new Uint8Array(ab), magic = new TextDecoder().decode(u.subarray(0, MAGIC.length));
      if (magic !== MAGIC) throw new Error('That isn\'t a Booth library backup (it should end in .boothlib).');
      var hl = new DataView(ab).getUint32(MAGIC.length), base = MAGIC.length + 4 + hl;
      return file.slice(MAGIC.length + 4, base).arrayBuffer().then(function (hb) {
        var head = JSON.parse(new TextDecoder().decode(new Uint8Array(hb)));
        return Promise.all([tx(tdb(), 'tracks', 'readonly', function (s) { return s.getAllKeys(); }), tx(bdb(), 'analysis', 'readonly', function (s) { return s.getAllKeys(); }).catch(function () { return []; })]).then(function (keys) {
          var haveT = {}, haveA = {}; (keys[0] || []).forEach(function (k) { haveT[k] = 1; }); (keys[1] || []).forEach(function (k) { haveA[k] = 1; });
          var newT = head.tracks.filter(function (t) { return !haveT[t.id]; }), newA = head.analysis.filter(function (a) { return !haveA[a.id]; });
          return tx(tdb(), 'tracks', 'readwrite', function (s) { newT.forEach(function (t) { s.put({ id: t.id, name: t.name, bpm: t.bpm, first: t.first, dur: t.dur, added: t.added, blob: file.slice(base + t.offset, base + t.offset + t.size, t.type) }); }); })
            .then(function () { return newA.length ? tx(bdb(), 'analysis', 'readwrite', function (s) { newA.forEach(function (a) { var o = Object.assign({}, a); if (a.waves) o.waves = { rate: a.waves.rate, low: unb64(a.waves.low), mid: unb64(a.waves.mid), high: unb64(a.waves.high) }; s.put(o); }); }) : null; })
            .then(function () { return self.list(); })
            .then(function () { return { tracks: newT.length, analysis: newA.length, skipped: head.tracks.length - newT.length }; });
        });
      });
    });
  };
  L.remove = function (item) {
    var self = this;
    return Promise.all([tx(tdb(), 'tracks', 'readwrite', function (s) { s.delete(item.id); }), tx(bdb(), 'analysis', 'readwrite', function (s) { s.delete(item.id); })]).then(function () { delete self.buffers[item.id]; return self.list(); });
  };
  /** Which tracks mix well with this one: BPM within 6% and a friendly Camelot key. */
  L.friends = function (item) {
    return this.items.filter(function (x) {
      if (x.id === item.id || !x.bpm || !item.bpm) return false;
      var r = x.bpm / item.bpm; if (r < 0.94 || r > 1.06) return false;
      return !item.camelot || !x.camelot || DSP.camelotFriends(item.camelot, x.camelot);
    });
  };

  // ---------- recorded mixes ----------
  L.saveMix = function (m) { return tx(bdb(), 'mixes', 'readwrite', function (s) { s.put(m); }); };
  L.mixes = function () { return tx(bdb(), 'mixes', 'readonly', function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (x, y) { return y.at - x.at; }); }); };
  L.deleteMix = function (id) { return tx(bdb(), 'mixes', 'readwrite', function (s) { s.delete(id); }); };

  Library.LOOPS = LOOPS;
  root.BoothLibrary = Library;
})(typeof window !== 'undefined' ? window : globalThis);
