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
  function openDb(name, ver, upgrade) {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('This browser can\'t store tracks.'));
      var r = indexedDB.open(name, ver);
      r.onupgradeneeded = function () { upgrade(r.result); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  var tracksDb = null, boothDb = null;
  function tdb() { return tracksDb || (tracksDb = openDb('lq-dj', 1, function (d) { if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' }); })); }
  function bdb() { return boothDb || (boothDb = openDb('booth', 2, function (d) { if (!d.objectStoreNames.contains('analysis')) d.createObjectStore('analysis', { keyPath: 'id' }); if (!d.objectStoreNames.contains('mixes')) d.createObjectStore('mixes', { keyPath: 'id' }); })); }
  function tx(dbp, store, mode, fn) {
    return dbp.then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = function () { res(r ? r.result : undefined); }; t.onerror = function () { rej(t.error); }; }); });
  }

  // Built-in loops: exact BPM, grid at 0, known key (the acid line is in A minor = 8A).
  var LOOPS = [
    { id: 'loop:kick125', name: 'Built-in: kick only', bpm: 125, parts: ['kick'], genre: 'Drill loop' },
    { id: 'loop:groove128', name: 'Built-in: kick and hats', bpm: 128, parts: ['kick', 'hats'], genre: 'Drill loop' },
    { id: 'loop:rumble130', name: 'Built-in: rumble techno', bpm: 130, parts: ['kick', 'hats', 'rumble'], genre: 'Techno' },
    { id: 'loop:acid132', name: 'Built-in: acid line', bpm: 132, parts: ['kick', 'hats', 'acid'], genre: 'Acid', camelot: '8A', key: 'Am' },
    { id: 'loop:acid126', name: 'Built-in: slow acid', bpm: 126, parts: ['kick', 'acid'], genre: 'Acid', camelot: '8A', key: 'Am' },
    { id: 'loop:hard135', name: 'Built-in: hard groove', bpm: 135, parts: ['kick', 'hats', 'rumble'], genre: 'Hard groove' }
  ];

  function Library(ctx) {
    this.ctx = ctx; this.items = []; this.buffers = {}; this.worker = null; this.jobs = {};
  }
  var L = Library.prototype;
  L.list = function () {
    var self = this;
    return Promise.all([
      tx(tdb(), 'tracks', 'readonly', function (s) { return s.getAll(); }).catch(function () { return []; }),
      tx(bdb(), 'analysis', 'readonly', function (s) { return s.getAll(); }).catch(function () { return []; })
    ]).then(function (r) {
      var an = {}; (r[1] || []).forEach(function (a) { an[a.id] = a; });
      var mine = (r[0] || []).sort(function (a, b) { return a.added - b.added; }).map(function (t) {
        var a = an[t.id];
        return { id: t.id, name: t.name, own: true, analysed: !!(a && a.v >= 2), bpm: a ? a.bpm : t.bpm, first: a ? a.first : t.first, key: a ? a.key : '', camelot: a ? a.camelot : '', waves: a ? a.waves : null, dur: a ? a.dur : t.dur, genre: a && a.genre || '', hot: a && a.hot || [], edited: !!(a && a.edited) };
      });
      var loops = LOOPS.map(function (l) { var a = an[l.id] || {}, prev = self.items.filter(function (x) { return x.id === l.id; })[0]; return { id: l.id, name: l.name, loop: l, own: false, analysed: true, bpm: l.bpm, first: 0, key: l.key || '', camelot: l.camelot || '', waves: prev ? prev.waves : null, dur: 32 * 4 * 60 / l.bpm, genre: l.genre, hot: a.hot || [] }; });
      self.items = mine.concat(loops);
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
      var g = DSP.makeLoop({ parts: item.loop.parts, bpm: item.loop.bpm, bars: 32, sampleRate: c.sampleRate, seed: item.loop.bpm });
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
      return self.analyseOne(it).catch(function (e) { it.error = e.message; }).then(function () { i++; return next(); });
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
  /** Add audio files from your computer (shared with the first DJ game). */
  L.addFiles = function (files) {
    var self = this;
    return Promise.all([].slice.call(files).map(function (f) {
      var id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return tx(tdb(), 'tracks', 'readwrite', function (s) { s.put({ id: id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 80), blob: f, bpm: 0, first: 0, dur: 0, added: Date.now() }); });
    })).then(function () { return self.list(); });
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
