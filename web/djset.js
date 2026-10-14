/*
 * DJ Set: a rhythm game for real transitions ("Guitar Hero for mixing").
 * Two decks play your own tracks or the Life Quest stations. Notes scroll down
 * a highway: drop the next track in on the phrase, ride the crossfader along
 * the line, swap the bass on the bar, take the old track out. Scored on timing,
 * tempo, beatmatch, fader rides and bass clashes, with combos and an S-D grade.
 * Keyboard, touch, or a MIDI controller: a starter map for the Hercules
 * DJControl Inpulse 500, plus MIDI learn for any control. Exposed as window.LQDJ.
 */
(function () {
  'use strict';
  var M = function () { return window.LQMusic; };
  var STORE = 'lq-djset', RANGE = 0.16, KILL = -26;
  var A_COL = '#ff5fae', B_COL = '#2fe0d6';
  var KEYS0 = { a: 'KeyF', b: 'KeyJ', bass: 'Space', xfL: 'ArrowLeft', xfR: 'ArrowRight', filtDown: 'ArrowDown', filtUp: 'ArrowUp', pitchDown: 'BracketLeft', pitchUp: 'BracketRight', nudgeBack: 'Comma', nudgeFwd: 'Period', sync: 'KeyY', pause: 'Escape' };
  var ACTIONS = [['a', 'Deck A: play / stop'], ['b', 'Deck B: play / stop'], ['bass', 'Bass swap'], ['xfL', 'Crossfader left (hold, Shift for faster)'], ['xfR', 'Crossfader right (hold, Shift for faster)'],
    ['filtDown', 'Filter down on the outgoing deck (hold)'], ['filtUp', 'Filter up on the outgoing deck (hold)'], ['pitchDown', 'Pitch down, incoming deck (Shift: bigger steps)'], ['pitchUp', 'Pitch up, incoming deck (Shift: bigger steps)'],
    ['nudgeBack', 'Nudge the incoming deck back (hold)'], ['nudgeFwd', 'Nudge the incoming deck forward (hold)'], ['sync', 'Sync the incoming tempo'], ['pause', 'Pause']];
  var MIDI_ROWS = [['xf', 'Crossfader']];
  ['a', 'b'].forEach(function (d) {
    var D = d.toUpperCase();
    MIDI_ROWS.push([d + '.play', 'Deck ' + D + ' play'], [d + '.sync', 'Deck ' + D + ' sync'], [d + '.pitch', 'Deck ' + D + ' pitch fader'], [d + '.jog', 'Deck ' + D + ' jog wheel'],
      [d + '.low', 'Deck ' + D + ' low EQ'], [d + '.filter', 'Deck ' + D + ' filter'], [d + '.vol', 'Deck ' + D + ' volume']);
  });
  // Starter map for the Hercules DJControl Inpulse 500: mixer on MIDI channel 1, deck A on 2, deck B on 3.
  // If a control doesn't respond, press Learn on its row and move it.
  var INPULSE = { xf: '11.0.0' };
  ['a', 'b'].forEach(function (d, i) {
    var ch = i + 1;
    INPULSE[d + '.play'] = '9.' + ch + '.7'; INPULSE[d + '.sync'] = '9.' + ch + '.5'; INPULSE[d + '.pitch'] = '11.' + ch + '.8'; INPULSE[d + '.jog'] = '11.' + ch + '.10';
    INPULSE[d + '.low'] = '11.' + ch + '.4'; INPULSE[d + '.filter'] = '11.' + ch + '.1'; INPULSE[d + '.vol'] = '11.' + ch + '.0';
  });
  var DEF = { diff: 'normal', mixes: 3, bars: 8, skip: 0, crate: ['vice-house', 'sunset-disco', 'afro-house', 'warehouse', 'garage-run', 'trance'], curve: 'smooth', offset: 0, keys: KEYS0, midi: null, flipPitch: false, files: [] };
  var STYLES = { easy: ['blend', 'blend', 'quick', 'blend'], normal: ['blend', 'quick', 'cut', 'blend', 'quick', 'cut'], hard: ['blend', 'cut', 'quick', 'blend', 'cut', 'quick'] };
  var LEN = { blend: 32, quick: 16, cut: 20 };
  var WIN = { P: 45, G: 90, O: 150, M: 380 };
  var WORD = { P: 'Perfect', G: 'Great', O: 'Good', M: 'Miss' }, WEIGHT = { P: 1, G: 0.75, O: 0.45, M: 0 }, PTS = { P: 300, G: 200, O: 100, M: 0 };
  var LABEL = { play: 'Drop in', stop: 'Out', bass: 'Bass swap', cut: 'Cut', ride: 'Fader ride', filter: 'Filter sweep', tempo: 'Tempo match', match: 'Beatmatch' };
  var DIFF_TEXT = { easy: 'Tempo synced for you, drops snap to the beat, wide timing windows.', normal: 'Match the tempo yourself (Sync is there, but caps that note at Good). Normal windows.', hard: 'No Sync, tight windows, filter sweeps on top.' };

  var P = loadPrefs(), ctx = null, master = null, decks = null, st = null, view = 'setup', lib = [], memLib = [], held = {}, rebinding = '', busyMsg = '';
  var midi = null, midiOut = null, learn = null, lastMsg = '', rev = {}, opts = {}, root = null, ledState = {};

  // ---------- prefs ----------
  function loadPrefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) {}
    var o = Object.assign({}, DEF, p);
    o.keys = Object.assign({}, KEYS0, p.keys || {});
    return o;
  }
  function savePrefs() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) {} buildRev(); }
  function keyName(code) {
    if (!code) return '-';
    var m = { Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Escape: 'Esc', Slash: '/', Semicolon: ';', Quote: '\'', Backquote: '`', Minus: '-', Equal: '=', Backslash: '\\', Enter: 'Enter', Tab: 'Tab' };
    return m[code] || code.replace(/^Key|^Digit|^Numpad/, '');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function toast(m, bad) { if (opts.toast) opts.toast(m, bad); }

  // ---------- your track library (IndexedDB, stays on this device) ----------
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('No storage'));
      var r = indexedDB.open('lq-dj', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('tracks', { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('tracks', mode), out = fn(t.objectStore('tracks'));
        t.oncomplete = function () { res(out ? out.result : undefined); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function libAll() {
    return tx('readonly', function (s) { return s.getAll(); }).then(function (l) { return l || []; }, function () { return memLib.slice(); })
      .then(function (l) { return l.sort(function (a, b) { return a.added - b.added; }); });
  }
  function libPut(r) { return tx('readwrite', function (s) { s.put(r); }).catch(function () { memLib = memLib.filter(function (x) { return x.id !== r.id; }).concat([r]); }); }
  function libDel(id) { return tx('readwrite', function (s) { s.delete(id); }).catch(function () { memLib = memLib.filter(function (x) { return x.id !== id; }); }); }

  // ---------- beat detection: tempo and the first beat ----------
  function analyse(buf) {
    var sr = buf.sampleRate, fps = 200, hop = sr / fps, len = Math.min(buf.length, Math.floor(sr * 150));
    var c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    var nf = Math.floor(len / hop), lowE = new Float32Array(nf), allE = new Float32Array(nf);
    var a = Math.exp(-2 * Math.PI * 160 / sr), lp = 0, j = 0, f;
    for (f = 0; f < nf; f++) {
      var end = Math.floor((f + 1) * hop), el2 = 0, ea = 0, cnt = 0;
      for (; j < end; j++) { var x = c1 ? (c0[j] + c1[j]) * 0.5 : c0[j]; lp = x + a * (lp - x); el2 += lp * lp; ea += x * x; cnt++; }
      lowE[f] = Math.sqrt(el2 / (cnt || 1)); allE[f] = Math.sqrt(ea / (cnt || 1));
    }
    var raw = new Float32Array(nf), on = new Float32Array(nf), pre = new Float64Array(nf + 1), w = 40, mx = 0;
    var kick = new Float32Array(nf);
    for (f = 1; f < nf; f++) { kick[f] = Math.max(0, lowE[f] - lowE[f - 1]); raw[f] = kick[f] * 2 + Math.max(0, allE[f] - allE[f - 1]); }
    for (f = 0; f < nf; f++) pre[f + 1] = pre[f] + raw[f];
    for (f = 0; f < nf; f++) { var lo = Math.max(0, f - w), hi = Math.min(nf, f + w + 1); on[f] = Math.max(0, raw[f] - (pre[hi] - pre[lo]) / (hi - lo)); if (on[f] > mx) mx = on[f]; }
    if (!mx) return { bpm: 120, first: 0, sure: false };
    for (f = 0; f < nf; f++) on[f] /= mx;
    // tempo: autocorrelation, with each lag backed up by its multiples (beats line up with bars), gently preferring 80-160 BPM
    var acf = new Float64Array(Math.min(nf, 4 * Math.round(60 * fps / 68) + 4)), L;
    for (L = 20; L < acf.length; L++) { var s = 0; for (f = 0; f + L < nf; f++) s += on[f] * on[f + L]; acf[L] = s / (nf - L); }
    var best = -1, coarse = 120;
    for (L = Math.round(60 * fps / 185); L <= Math.round(60 * fps / 68); L++) {
      var pk = function (x) { return x + 1 < acf.length ? Math.max(acf[x - 1], acf[x], acf[x + 1]) : 0; };
      var sal = pk(L) + 0.5 * pk(2 * L) + 0.33 * pk(3 * L) + pk(4 * L);   // the bar (4 beats) counts as much as the beat
      var bpm = 60 * fps / L, sc = sal * Math.exp(-0.5 * Math.pow(Math.log(bpm / 120) / Math.LN2 / 0.6, 2));
      if (sc > best) { best = sc; coarse = bpm; }
    }
    function comb(bpm2, sig, phases) {
      var per = 60 * fps / bpm2, top = -1, ph = 0, n2 = phases || 48;
      for (var kk = 0; kk < n2; kk++) {
        var o = per * kk / n2, sum = 0, n = 0;
        for (var b = o; b < nf - 1; b += per) { var i = Math.floor(b), fr = b - i; sum += sig[i] * (1 - fr) + sig[i + 1] * fr; n++; }
        sum /= (n || 1);
        if (sum > top) { top = sum; ph = o; }
      }
      return { score: top, first: ph / fps };
    }
    var fineBest = -1, fine = coarse, cand;
    for (cand = coarse * 0.985; cand <= coarse * 1.015; cand += 0.02) { var r = comb(cand, on).score; if (r > fineBest) { fineBest = r; fine = cand; } }
    var rounded = Math.round(fine);
    if (Math.abs(fine - rounded) < 0.08) fine = rounded;
    var bestFine = comb(fine, kick, 96);   // the first beat: where the kicks land
    return { bpm: Math.round(fine * 100) / 100, first: Math.round(bestFine.first * 1000) / 1000, sure: true };
  }
  function peaks(buf) {
    var sr = buf.sampleRate, step = Math.max(1, Math.floor(sr / 100)), n = Math.ceil(buf.length / step), out = new Float32Array(n), c = buf.getChannelData(0), top = 0.0001;
    for (var i = 0; i < n; i++) {
      var m = 0, e = Math.min(buf.length, (i + 1) * step);
      for (var j = i * step; j < e; j += 4) { var v = Math.abs(c[j]); if (v > m) m = v; }
      out[i] = m; if (m > top) top = m;
    }
    for (i = 0; i < n; i++) out[i] /= top;
    return out;
  }

  // ---------- the decks ----------
  function audio() { ctx = M() ? M().audio() : (ctx || new (window.AudioContext || window.webkitAudioContext)()); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  function lat() { return (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + (P.offset || 0) / 1000; }
  function at() { return ctx.currentTime - lat(); }
  function makeDeck(side) {
    var d = { side: side, track: null, src: null, playing: false, pitch: 0, nudge: 0, pos: 0, lastT: 0, low: 0, filter: 0, vol: 1, cue: 0, picked: {}, jogTimer: 0 };
    d.inp = ctx.createGain();
    d.lowF = ctx.createBiquadFilter(); d.lowF.type = 'lowshelf'; d.lowF.frequency.value = 220;
    d.highF = ctx.createBiquadFilter(); d.highF.type = 'highshelf'; d.highF.frequency.value = 3500; d.highF.gain.value = 0;
    d.filt = ctx.createBiquadFilter(); d.filt.type = 'lowpass'; d.filt.frequency.value = 22000; d.filt.Q.value = 0.7;
    d.ch = ctx.createGain(); d.xg = ctx.createGain();
    d.inp.connect(d.lowF); d.lowF.connect(d.highF); d.highF.connect(d.filt); d.filt.connect(d.ch); d.ch.connect(d.xg); d.xg.connect(master);
    d.rate = function () { return (1 + d.pitch) * (1 + d.nudge); };
    d.now = function (t) { return d.playing ? d.pos + (t - d.lastT) * d.rate() : d.pos; };
    d.sync = function (t) { d.pos = d.now(t); d.lastT = t; };
    d.beat = function (t) { return d.track ? (d.now(t) - d.track.first) * d.track.bpm / 60 : 0; };
    d.bpm = function () { return d.track ? d.track.bpm * (1 + d.pitch) : 0; };
    d.setRate = function () { var t = ctx.currentTime; d.sync(t); if (d.src) d.src.playbackRate.setValueAtTime(d.rate(), t); };
    d.start = function (t, pos) {
      if (d.src) { try { d.src.stop(); } catch (e) {} }
      var src = ctx.createBufferSource(), dur = d.track.buf.duration;
      src.buffer = d.track.buf; src.loop = !!d.track.loop;
      if (src.loop) { src.loopStart = 0; src.loopEnd = dur; }
      src.playbackRate.value = d.rate(); src.connect(d.inp);
      if (pos < 0) src.start(t - pos / d.rate(), 0);
      else src.start(t, d.track.loop ? pos % dur : Math.min(pos, dur - 0.01));
      src.onended = function () { if (d.src === src) { d.sync(ctx.currentTime); d.playing = false; d.src = null; } };
      d.src = src; d.pos = pos; d.lastT = t; d.playing = true;
    };
    d.stop = function () { if (!d.playing) return; d.sync(ctx.currentTime); d.playing = false; var s = d.src; d.src = null; if (s) { try { s.stop(); } catch (e) {} } };
    d.load = function (tr) { d.stop(); d.track = tr; d.pitch = 0; d.nudge = 0; d.filter = 0; d.picked = {}; d.cue = tr.cue; d.pos = tr.cue; setLow(d, 0); setFilter(d, 0); };
    d.unload = function () { d.stop(); d.track = null; };
    return d;
  }
  function setLow(d, db2) { d.low = Math.max(KILL, Math.min(6, db2)); d.lowF.gain.setTargetAtTime(d.low, ctx.currentTime, 0.012); }
  function setFilter(d, v) {
    v = Math.max(-1, Math.min(1, v)); d.filter = v;
    var t = ctx.currentTime;
    if (Math.abs(v) < 0.02) { d.filt.type = 'lowpass'; d.filt.frequency.setTargetAtTime(22000, t, 0.01); d.filt.Q.value = 0.7; }
    else if (v > 0) { d.filt.type = 'highpass'; d.filt.frequency.setTargetAtTime(20 * Math.pow(2, v * 9.4), t, 0.01); d.filt.Q.value = 1.2; }
    else { d.filt.type = 'lowpass'; d.filt.frequency.setTargetAtTime(22000 * Math.pow(2, v * 7.4), t, 0.01); d.filt.Q.value = 1.2; }
  }
  function xfGains(x) {
    if (P.curve === 'cut') return [x < 0.9 ? 1 : (1 - x) / 0.1, x > 0.1 ? 1 : x / 0.1];
    return [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
  }
  function setXf(x) {
    st.xf = Math.max(0, Math.min(1, x));
    var g = xfGains(st.xf), t = ctx.currentTime;
    decks.a.xg.gain.setTargetAtTime(g[0], t, 0.006); decks.b.xg.gain.setTargetAtTime(g[1], t, 0.006);
    var r = el('djXf'); if (r && document.activeElement !== r) r.value = st.xf;
  }
  function setVol(d, v) { d.vol = Math.max(0, Math.min(1, v)); d.ch.gain.setTargetAtTime(d.vol, ctx.currentTime, 0.01); }
  function audible(d) { return d.playing && d.vol > 0.25 && xfGains(st.xf)[d.side === 'a' ? 0 : 1] > 0.3; }
  function other(s) { return s === 'a' ? 'b' : 'a'; }

  // ---------- tracks ----------
  function seeded(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h += 0x6D2B79F5; var t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function stationBy(id) { return (M() ? M().STATIONS : []).filter(function (s) { return s.id === id; })[0]; }
  function buildList() {
    var files = P.files.map(function (id) { return lib.filter(function (r) { return r.id === id; })[0]; }).filter(Boolean);
    var need = Math.max(P.mixes, Math.min(8, files.length - 1)) + 1, list = files.slice(0, need).map(function (r) { return { file: r }; });
    var crate = P.crate.map(stationBy).filter(Boolean);
    if (!crate.length) crate = DEF.crate.map(stationBy).filter(Boolean);
    var rnd = seeded('set' + Date.now()), pool = crate.slice().sort(function () { return rnd() - 0.5; });
    for (var i = 0; list.length < need; i++) list.push({ station: pool[i % pool.length] });
    return list;
  }
  function loadTrack(item, idx, masterBpm) {
    if (item.station) {
      var s = item.station, rnd = seeded(s.id + idx + Date.now());
      var bpm = idx === 0 ? s.bpm : P.diff === 'easy' ? masterBpm : Math.round(masterBpm * (1 + (rnd() < 0.5 ? -1 : 1) * (0.02 + rnd() * 0.035)) * 10) / 10;
      return M().loop(s.id, bpm, 8, s.id + '-dj-' + idx + '-' + Math.floor(rnd() * 1e6)).then(function (buf) {
        return { name: s.name, style: s.style, c1: s.c1, bpm: bpm, first: 0, cue: 0, buf: buf, loop: true, peaks: peaks(buf) };
      });
    }
    var r = item.file;
    return r.blob.arrayBuffer().then(function (ab) { return new Promise(function (res, rej) { audio().decodeAudioData(ab, res, rej); }); }).then(function (buf) {
      var beat = 60 / r.bpm, cue = r.first, skip = idx === 0 ? 0 : P.skip * 4 * beat;
      if (skip && r.first + skip + 64 * beat < buf.duration) cue = r.first + skip;
      return { name: r.name, style: Math.round(r.bpm * 10) / 10 + ' BPM', c1: '', bpm: r.bpm, first: r.first, cue: cue, buf: buf, loop: false, peaks: peaks(buf) };
    });
  }

  // ---------- the chart ----------
  function buildChart(n, T, from, to, style, diff) {
    var s0 = from === 'a' ? 0 : 1, s1 = 1 - s0, ev = [], end = T + LEN[style];
    if (diff !== 'easy') ev.push({ kind: 'tempo', beat: T });
    ev.push({ kind: 'play', deck: to, beat: T });
    if (style === 'blend') {
      ev.push({ kind: 'ride', a: T, b: T + 16, pts: [[T, s0], [T + 16, 0.5]] });
      ev.push({ kind: 'bass', beat: T + 16 });
      if (diff === 'hard') ev.push({ kind: 'filter', deck: from, a: T + 16, b: T + 28, pts: [[T + 16, 0], [T + 28, 0.6]] });
      ev.push({ kind: 'ride', a: T + 16, b: T + 32, pts: [[T + 16, 0.5], [T + 24, 0.5], [T + 32, s1]] });
    } else if (style === 'quick') {
      ev.push({ kind: 'ride', a: T, b: T + 8, pts: [[T, s0], [T + 8, 0.5]] });
      ev.push({ kind: 'bass', beat: T + 8 });
      ev.push({ kind: 'ride', a: T + 8, b: T + 16, pts: [[T + 8, 0.5], [T + 16, s1]] });
    } else {
      if (diff === 'hard') ev.push({ kind: 'filter', deck: from, a: T, b: T + 16, pts: [[T, 0], [T + 16, 0.5]] });
      ev.push({ kind: 'cut', beat: T + 16, to: s1 });
    }
    ev.push({ kind: 'stop', deck: from, beat: end });
    ev.push({ kind: 'match', beat: end, sum: 0, dur: 0 });
    ev.forEach(function (e) { e.done = false; if (e.a !== undefined) { e.sum = 0; e.dur = 0; } });
    return { n: n, T: T, from: from, to: to, style: style, ev: ev, end: end, res: [], synced: false };
  }
  function guide(pts, b) {
    if (b <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (b <= pts[i][0]) { var p = pts[i - 1], q = pts[i]; return p[1] + (q[1] - p[1]) * (b - p[0]) / (q[0] - p[0]); }
    return pts[pts.length - 1][1];
  }
  function win(k) { return WIN[k] * (P.diff === 'easy' ? 1.4 : P.diff === 'hard' ? 0.85 : 1); }
  function msPerBeat() { return 60000 / (decks[st.main].bpm() || 120); }
  function errMs(beat) { return (decks[st.main].beat(at()) - beat) * msPerBeat(); }
  function pending(kind, deck) { var tr = st && st.tr; return tr ? tr.ev.filter(function (e) { return !e.done && e.kind === kind && (!deck || e.deck === deck); })[0] : null; }

  // ---------- scoring ----------
  function award(e, j, note) {
    e.done = true; e.j = j;
    st.count[j]++;
    st.weights.push(WEIGHT[j]);
    if (j === 'M') st.combo = 0; else { st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo); }
    st.mult = 1 + Math.min(3, Math.floor(st.combo / 4));
    st.score += PTS[j] * st.mult;
    if (st.tr) st.tr.res.push([LABEL[e.kind], j, note || '']);
    pop(WORD[j] + (e.kind === 'tempo' || e.kind === 'match' || e.kind === 'ride' || e.kind === 'filter' ? ': ' + LABEL[e.kind].toLowerCase() : ''), j === 'P' ? '#ffd166' : j === 'G' ? '#7cf29b' : j === 'O' ? '#9db8ff' : '#ff6b6b', note);
    if (j === 'M' && e.kind !== 'match' && e.kind !== 'tempo') flashMiss();
  }
  function tapJudge(e, err) {
    var a = Math.abs(err), j = a <= win('P') ? 'P' : a <= win('G') ? 'G' : a <= win('O') ? 'O' : 'M';
    award(e, j, j === 'P' ? '' : (err < 0 ? 'early ' : 'late ') + Math.round(a) + ' ms');
  }
  function slideJudge(e) {
    var mean = e.dur > 0 && e.moved ? e.sum / e.dur : 1, k = P.diff === 'easy' ? 1.4 : P.diff === 'hard' ? 0.85 : 1;   // never touched it: a miss
    award(e, mean <= 0.07 * k ? 'P' : mean <= 0.14 * k ? 'G' : mean <= 0.24 * k ? 'O' : 'M');
  }
  function accuracy() {
    if (!st.weights.length) return 0;
    var s = st.weights.reduce(function (x, y) { return x + y; }, 0) / st.weights.length * 100 - st.clashes * 3;
    return Math.max(0, Math.min(100, Math.round(s * 10) / 10));
  }
  function grade(acc) { return acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D'; }
  function pop(text, col, sub) { st.pops.push({ text: text, col: col || '#fff', sub: sub || '', t0: performance.now() }); if (st.pops.length > 4) st.pops.shift(); }
  function hint(text) { st.hint = { text: text, until: performance.now() + 1600 }; }
  function flashMiss() { var h = el('djHwy'); if (h) { h.classList.remove('miss'); void h.offsetWidth; h.classList.add('miss'); } }

  // ---------- actions ----------
  function deckPress(side) {
    if (!st || !st.running || st.paused) return;
    st.flash[side] = performance.now() + 140;
    var d = decks[side];
    if (!d.track) return hint('Nothing loaded on deck ' + side.toUpperCase() + ' yet');
    if (d.playing) {
      var e = pending('stop', side);
      if (!e) return hint(side === st.main ? 'That would stop the music. Wait for STOP.' : 'Deck ' + side.toUpperCase() + ' is already playing');
      var err = errMs(e.beat);
      if (err < -win('M')) return hint('Not yet. Ride the fader across first.');
      tapJudge(e, err); doStop(side);
    } else {
      var p = pending('play', side);
      if (!p) return hint('Wait for the PLAY note on deck ' + side.toUpperCase());
      var err2 = errMs(p.beat);
      if (err2 < -win('M')) return hint('Too early. Drop it on the line.');
      tapJudge(p, err2); doPlay(side, p, P.diff === 'easy');
    }
  }
  function doPlay(side, e, quantize) {
    var d = decks[side], m = decks[st.main], tr = st.tr, te = pending('tempo');
    if (te) {
      var gap = Math.abs(d.bpm() - m.bpm()), j = gap <= 0.15 ? 'P' : gap <= 0.35 ? 'G' : gap <= 0.8 ? 'O' : 'M';
      if (tr.synced && j !== 'M') j = 'O';
      award(te, j, gap.toFixed(1) + ' BPM apart');
      if (j === 'M') { syncDeck(side, true); hint('Tempos were miles apart. Sync saved it.'); }
    }
    var t0 = ctx.currentTime, pos;
    if (quantize) pos = d.cue + (m.beat(t0) - e.beat) * 60 / d.track.bpm;
    else pos = d.cue + lat() * d.rate();
    d.start(t0, pos);
  }
  function doStop(side) {
    var tr = st.tr, d = decks[side];
    d.stop();
    var s1 = tr.to === 'a' ? 0 : 1;
    if (Math.abs(st.xf - s1) > 0.2) setXf(s1);
    if (decks[tr.to].low < -8) setLow(decks[tr.to], 0);
    endTransition();
  }
  function doBass() {
    var tr = st.tr; if (!tr) return;
    setLow(decks[tr.from], KILL); setLow(decks[tr.to], 0);
  }
  function bassPress() {
    if (!st || !st.running || st.paused) return;
    st.flash.bass = performance.now() + 140;
    var e = pending('bass');
    if (!e) return hint(st.tr && st.tr.style === 'cut' ? 'This one\'s a cut: slam the fader on the CUT line' : 'No bass swap right now');
    if (!decks[st.tr.to].playing) return hint('Drop the next track in first');
    var err = errMs(e.beat);
    if (err < -win('M')) return hint('Not yet. Swap on the yellow line.');
    tapJudge(e, err); doBass();
  }
  function syncDeck(side, silent) {
    var d = decks[side], m = decks[side === st.main ? other(side) : st.main];
    if (!d.track || !m.track || !m.bpm()) return;
    if (P.diff === 'hard' && !silent) return hint('No Sync on Hard. Use your ears.');
    d.pitch = Math.max(-RANGE, Math.min(RANGE, m.bpm() / d.track.bpm - 1)); d.picked.pitch = false; d.setRate();
    if (!silent && st.tr && side === st.tr.to && pending('tempo')) st.tr.synced = true;
    if (!silent) hint('Synced deck ' + side.toUpperCase());
  }
  function pitchBy(side, delta) { var d = decks[side]; if (!d.track) return; d.pitch = Math.max(-RANGE, Math.min(RANGE, Math.round((d.pitch + delta) * 10000) / 10000)); d.setRate(); }
  function nudge(side, v) { var d = decks[side]; d.nudge = v; d.setRate(); }

  // ---------- the set ----------
  function start() {
    if (!M()) return toast('Music isn\'t available here.', true);
    if (P.files.length === 0 && !P.crate.length) P.crate = DEF.crate.slice();
    audio();
    if (M().now && M().now()) M().stop(true);
    teardown();
    master = ctx.createGain(); master.gain.value = 0.9;
    var lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
    master.connect(lim); lim.connect(ctx.destination); master._lim = lim;
    decks = { a: makeDeck('a'), b: makeDeck('b') };
    var list = buildList();
    st = { list: list, idx: 0, main: 'a', xf: 0, tr: null, running: false, paused: false, over: false, score: 0, combo: 0, maxCombo: 0, mult: 1,
      count: { P: 0, G: 0, O: 0, M: 0 }, weights: [], clashes: 0, clashT: 0, log: [], pops: [], flash: {}, hint: null, raf: 0, master: 0, since: 0, outro: null };
    view = 'loading'; busyMsg = 'Loading ' + (list[0].file ? list[0].file.name : list[0].station.name) + '…'; render();
    var me = st;
    loadTrack(list[0], 0, 0).then(function (t0) {
      if (st !== me) return;
      st.master = t0.bpm;
      busyMsg = 'Loading ' + (list[1].file ? list[1].file.name : list[1].station.name) + '…'; render();
      return loadTrack(list[1], 1, t0.bpm).then(function (t1) {
        if (st !== me) return;
        decks.a.load(t0); decks.b.load(t1); prepIncoming('b');
        setXf(0); setVol(decks.a, 1); setVol(decks.b, 1);
        view = 'play'; render();
        decks.a.start(ctx.currentTime + 0.15, t0.cue);
        st.since = (t0.cue - t0.first) * t0.bpm / 60;
        st.tr = buildChart(0, nextT(), 'a', 'b', styleFor(0), P.diff);
        st.running = true;
        st.lastNow = ctx.currentTime;
        frame();
      });
    }).catch(function (err) { if (st === me) { view = 'setup'; render(); toast('Couldn\'t load a track: ' + (err && err.message || err), true); } });
  }
  function styleFor(n) { var s = STYLES[P.diff] || STYLES.normal; return s[n % s.length]; }
  function prepIncoming(side) {
    var d = decks[side], m = decks[other(side)];
    setLow(d, KILL); setFilter(d, 0);
    var need = (m.bpm() || st.master) / d.track.bpm - 1;
    if (P.diff === 'easy' || Math.abs(need) > RANGE) d.pitch = Math.max(-RANGE, Math.min(RANGE, need));
    d.picked = {}; d.setRate();
  }
  function nextT() {
    var m = decks[st.main], tr = m.track, mb = Math.max(st.since, m.beat(at()));
    var T = Math.ceil((st.since + P.bars * 4) / 16) * 16, len = LEN[styleFor(st.idx)];
    while (T < mb + 8) T += 16;
    if (!tr.loop) {
      var maxT = (tr.buf.duration - tr.first) * tr.bpm / 60 - len - 4;
      if (T > maxT) T = Math.max(Math.ceil((mb + 8) / 4) * 4, Math.floor(maxT / 4) * 4);
    }
    return T;
  }
  function endTransition() {
    var tr = st.tr;
    tr.ev.forEach(function (e) {
      if (e.done) return;
      if (e.kind === 'match') {
        var dropped = tr.ev.filter(function (x) { return x.kind === 'play'; })[0], ms = e.dur > 0 ? e.sum / e.dur : 999, j = ms <= 12 ? 'P' : ms <= 25 ? 'G' : ms <= 50 ? 'O' : 'M';
        if (dropped && dropped.j === 'M') award(e, 'M', 'the drop was missed');   // no credit for the autopilot
        else award(e, j, Math.round(ms) + ' ms apart on average');
      } else if (e.kind === 'ride' || e.kind === 'filter') slideJudge(e);
      else award(e, 'M');
    });
    if (decks[tr.from].filter) setFilter(decks[tr.from], 0);
    st.log.push(tr);
    var tm = decks[tr.to];
    st.since = tm.beat(at());
    st.main = tr.to; st.tr = null;
    var freed = tr.from;
    decks[freed].unload();
    st.idx++;
    pop('Mix ' + (tr.n + 1) + ' done', '#c9b8ff');
    if (st.idx + 1 < st.list.length) {
      var me = st, n = st.idx;
      loadTrack(st.list[n + 1], n + 1, st.master).then(function (t) {
        if (st !== me || st.over) return;
        decks[freed].load(t); prepIncoming(freed);
        st.tr = buildChart(n, nextT(), st.main, freed, styleFor(n), P.diff);
      }, function () { st.outro = decks[st.main].beat(at()) + 16; hint('Couldn\'t load the next track. Finishing here.'); });
    } else st.outro = st.since + 16;
  }
  function finish() {
    if (!st || st.over) return;
    st.over = true; st.running = false;
    cancelAnimationFrame(st.raf);
    var t = ctx.currentTime;
    master.gain.setTargetAtTime(0, t, 0.8);
    var dk = decks;
    setTimeout(function () { if (dk) { dk.a.stop(); dk.b.stop(); } }, 3500);
    leds(true);
    var acc = accuracy(), mixes = st.log.length;
    st.result = { acc: acc, score: st.score, mixes: mixes, grade: grade(acc), maxCombo: st.maxCombo, clashes: st.clashes, count: st.count };
    view = 'results'; render();
    if (mixes && opts.submit) {
      st.result.saving = true;
      opts.submit(st.result).then(function (last) {
        if (!st || !st.result) return;
        st.result.saving = false; st.result.saved = last || {};
        render();
      }, function () { if (st && st.result) { st.result.saving = false; st.result.failed = true; render(); } });
    }
  }
  function teardown() {
    if (st) { st.over = true; st.running = false; cancelAnimationFrame(st.raf); }
    if (decks) { ['a', 'b'].forEach(function (s) { var d = decks[s]; d.stop(); try { d.xg.disconnect(); } catch (e) {} }); }
    if (master) { try { master.disconnect(); master._lim.disconnect(); } catch (e) {} }
    held = {};
    decks = null; master = null;
  }
  function pause(on) {
    if (!st || !st.running) return;
    st.paused = on;
    if (on) ctx.suspend(); else { ctx.resume(); st.lastNow = ctx.currentTime; }
    var p = el('djPause'); if (p) p.hidden = !on;
  }

  // ---------- every frame ----------
  function frame() {
    if (!st || st.over) return;
    st.raf = requestAnimationFrame(frame);
    if (st.paused) return;
    var now = ctx.currentTime, dt = Math.max(0, Math.min(0.1, now - (st.lastNow || now)));
    st.lastNow = now;
    var xd = (held.xfR ? 1 : 0) - (held.xfL ? 1 : 0);
    if (xd) setXf(st.xf + xd * dt * (held.shift ? 2.6 : 1.1));
    var fd = (held.filtUp ? 1 : 0) - (held.filtDown ? 1 : 0), out = st.tr ? decks[st.tr.from] : decks[st.main];
    if (fd) setFilter(out, out.filter + fd * dt * 0.9);
    var t = at(), m = decks[st.main], mb = m.beat(t), tr = st.tr;
    if (tr) {
      var inc = decks[tr.to], late = win('M');
      tr.ev.forEach(function (e) {
        if (e.done) return;
        if (e.kind === 'ride' || e.kind === 'filter') {
          if (mb >= e.a && mb <= e.b) { var v = e.kind === 'ride' ? st.xf : decks[e.deck].filter, er = Math.abs(v - guide(e.pts, mb)); if (e.v0 === undefined) e.v0 = v; if (Math.abs(v - e.v0) > 0.05) e.moved = true; e.sum += er * dt; e.dur += dt; e.on = er < 0.12; }
          else if (mb > e.b) slideJudge(e);
        } else if (e.kind === 'match') {
          if (inc.playing && m.playing) { e.sum += Math.abs(phaseMs()) * dt; e.dur += dt; }
        } else if (e.kind === 'tempo') {
          // judged with the drop
        } else {
          if (e.kind === 'bass' && inc.playing && decks[tr.from].low <= -12 && inc.low >= -6) { var eb = errMs(e.beat); if (eb >= -late) { tapJudge(e, eb); return; } }
          if (e.kind === 'cut' && inc.playing && (e.to === 1 ? st.xf > 0.5 : st.xf < 0.5)) { tapJudge(e, errMs(e.beat)); if (inc.low < -8) doBass(); return; }
          if ((mb - e.beat) * msPerBeat() > late) {
            award(e, 'M');
            if (e.kind === 'play') doPlay(e.deck, e, true);
            else if (e.kind === 'bass') doBass();
            else if (e.kind === 'cut') { setXf(e.to); doBass(); }
            else if (e.kind === 'stop') doStop(e.deck);
          }
        }
      });
    } else if (st.outro !== null && mb >= st.outro) return finish();
    if (!m.playing && !(tr && decks[tr.to].playing)) return finish();
    // bass clash: both lows up while both are loud
    var a = decks.a, b = decks.b;
    if (audible(a) && audible(b) && a.low > -8 && b.low > -8) {
      if (st.clashT >= 0) { st.clashT += dt; if (st.clashT > 60 / (m.bpm() || 120)) { st.clashes++; st.combo = 0; st.mult = 1; st.score = Math.max(0, st.score - 150); pop('Bass clash', '#ff6b6b', 'kill one low end'); flashMiss(); st.clashT = -2 * 60 / (m.bpm() || 120); } }
      else st.clashT += dt;
    } else if (st.clashT > 0) st.clashT = 0;
    else if (st.clashT < 0) st.clashT = Math.min(0, st.clashT + dt);
    draw(mb, t);
    hud(mb);
    leds(false, mb);
  }
  function phaseMs() {
    var tr = st.tr; if (!tr) return 0;
    var t = at(), a = decks[tr.from].beat(t), b = decks[tr.to].beat(t), d = ((a - b) % 1 + 1.5) % 1 - 0.5;
    return d * msPerBeat();
  }

  // ---------- drawing ----------
  function fit(cv) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    return dpr;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function draw(mb, t) {
    var cv = el('djHwy'); if (!cv) return;
    var dpr = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height, nowP = performance.now();
    g.clearRect(0, 0, W, H);
    var hitY = H * 0.84, ppb = hitY / 9, lw = W * 0.2, cx0 = lw, cw = W - 2 * lw;
    var Y = function (b) { return hitY - (b - mb) * ppb; }, X = function (v) { return cx0 + cw * (0.06 + 0.88 * v); };
    g.fillStyle = 'rgba(255,95,174,.08)'; g.fillRect(0, 0, lw, H);
    g.fillStyle = 'rgba(47,224,214,.08)'; g.fillRect(W - lw, 0, lw, H);
    g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(cx0, 0, cw, H);
    for (var b = Math.floor(mb - 2); b <= mb + 10; b++) {
      var y = Y(b); if (y < -4 || y > H) continue;
      g.fillStyle = b % 16 === 0 ? 'rgba(255,255,255,.34)' : b % 4 === 0 ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.06)';
      g.fillRect(0, y, W, (b % 16 === 0 ? 2 : 1) * dpr);
    }
    var tr = st.tr, font = function (px, w) { return (w || 700) + ' ' + Math.round(px * dpr) + 'px system-ui, sans-serif'; };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (tr) {
      tr.ev.forEach(function (e) {
        if (e.kind === 'ride' || e.kind === 'filter') {
          if (e.b < mb - 1 || e.a > mb + 10) return;
          var lane = e.kind === 'ride', x0 = e.deck === 'b' ? W - lw : 0;
          g.save(); g.beginPath();
          for (var bb = Math.max(e.a, mb - 1), first = true; bb <= Math.min(e.b, mb + 10) + 0.001; bb += 0.125) {
            var v = guide(e.pts, bb), xx = lane ? X(v) : x0 + lw * (0.15 + 0.7 * v), yy = Y(bb);
            if (first) { g.moveTo(xx, yy); first = false; } else g.lineTo(xx, yy);
          }
          g.lineWidth = (lane ? 12 : 8) * dpr; g.lineCap = 'round'; g.lineJoin = 'round';
          g.strokeStyle = e.done ? 'rgba(255,255,255,.12)' : lane ? 'rgba(201,184,255,.85)' : 'rgba(255,209,102,.8)';
          if (!e.done && e.on) { g.shadowColor = '#7cf29b'; g.shadowBlur = 18 * dpr; }
          g.stroke(); g.restore();
          if (!lane && !e.done && mb >= e.a - 2 && mb <= e.b) { g.fillStyle = 'rgba(255,209,102,.9)'; g.font = font(10); g.fillText('FILTER ' + keyName(P.keys.filtUp), x0 + lw / 2, Y(e.a) + 14 * dpr); }
          return;
        }
        if (e.done || e.kind === 'tempo' || e.kind === 'match') return;
        var y2 = Y(e.beat); if (y2 < -20 * dpr || y2 > H + 20 * dpr) return;
        if (e.kind === 'play' || e.kind === 'stop') {
          var lx = e.deck === 'a' ? 0 : W - lw, col = e.deck === 'a' ? A_COL : B_COL;
          g.fillStyle = e.kind === 'play' ? col : 'rgba(255,255,255,.9)';
          rr(g, lx + 6 * dpr, y2 - 13 * dpr, lw - 12 * dpr, 26 * dpr, 8 * dpr); g.fill();
          g.fillStyle = '#120d18'; g.font = font(12);
          g.fillText((e.kind === 'play' ? 'PLAY ' : 'STOP ') + keyName(P.keys[e.deck]), lx + lw / 2, y2);
        } else if (e.kind === 'bass') {
          var gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, A_COL); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, B_COL);
          g.fillStyle = gr; g.fillRect(0, y2 - 4 * dpr, W, 8 * dpr);
          g.fillStyle = '#ffd166'; g.font = font(12); g.fillText('BASS SWAP ' + keyName(P.keys.bass), W / 2, y2 - 14 * dpr);
        } else if (e.kind === 'cut') {
          g.fillStyle = '#ffffff'; g.fillRect(cx0, y2 - 3 * dpr, cw, 6 * dpr);
          g.font = font(13); g.fillText(e.to === 1 ? 'CUT →' : '← CUT', W / 2, y2 - 14 * dpr);
        }
      });
    }
    // hit line, pads and the fader puck
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(0, hitY - 1.5 * dpr, W, 3 * dpr);
    [['a', lw / 2, A_COL], ['b', W - lw / 2, B_COL]].forEach(function (p) {
      var on = (st.flash[p[0]] || 0) > nowP, playing = decks[p[0]].playing;
      g.beginPath(); g.arc(p[1], hitY, 15 * dpr, 0, Math.PI * 2);
      g.fillStyle = on ? p[2] : 'rgba(18,13,24,.9)'; g.fill();
      g.lineWidth = 3 * dpr; g.strokeStyle = p[2]; g.stroke();
      g.fillStyle = on ? '#120d18' : '#fff'; g.font = font(11); g.fillText(keyName(P.keys[p[0]]), p[1], hitY);
      if (playing) { g.fillStyle = p[2]; g.font = font(9, 600); g.fillText('ON AIR', p[1], hitY + 26 * dpr); }
    });
    var ride = tr && tr.ev.filter(function (e) { return e.kind === 'ride' && !e.done && mb >= e.a && mb <= e.b; })[0];
    var px = X(st.xf);
    g.beginPath(); g.arc(px, hitY, 12 * dpr, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    if (ride) { g.lineWidth = 4 * dpr; g.strokeStyle = ride.on ? '#7cf29b' : '#ff6b6b'; g.stroke(); }
    if ((st.flash.bass || 0) > nowP) { g.fillStyle = 'rgba(255,209,102,.35)'; g.fillRect(0, hitY - 10 * dpr, W, 20 * dpr); }
    // words
    st.pops = st.pops.filter(function (p) { return nowP - p.t0 < 900; });
    st.pops.forEach(function (p, i) {
      var age = (nowP - p.t0) / 900;
      g.globalAlpha = 1 - age; g.fillStyle = p.col; g.font = font(22, 800);
      var yy = hitY - 70 * dpr - age * 30 * dpr - (st.pops.length - 1 - i) * 30 * dpr;
      g.fillText(p.text, W / 2, yy);
      if (p.sub) { g.font = font(11, 600); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(p.sub, W / 2, yy + 17 * dpr); }
      g.globalAlpha = 1;
    });
    var msg = '';
    if (st.hint && st.hint.until > nowP) msg = st.hint.text;
    else if (!tr && st.outro !== null) msg = 'Last track. Enjoy it.';
    else if (!tr) msg = 'Loading the next track…';
    else if (mb < tr.T - 8) msg = 'Next: ' + decks[tr.to].track.name + ' in ' + Math.ceil((tr.T - mb) / 4) + ' bars';
    if (msg) { g.fillStyle = 'rgba(255,255,255,.75)'; g.font = font(13, 600); g.fillText(msg, W / 2, H * 0.12); }
    drawWave('djWaveA', decks.a, t, A_COL);
    drawWave('djWaveB', decks.b, t, B_COL);
  }
  function drawWave(id, d, t, col) {
    var cv = el(id); if (!cv) return;
    var dpr = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    if (!d.track) { g.fillStyle = 'rgba(255,255,255,.3)'; g.font = Math.round(11 * dpr) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Loading…', W / 2, H / 2); return; }
    var pk = d.track.peaks, dur = d.track.buf.duration, pos = d.now(t), span = 6, step = 2 * dpr;
    g.fillStyle = col; g.globalAlpha = d.playing ? 0.85 : 0.4;
    for (var x = 0; x < W; x += step) {
      var s = pos + (x / W - 0.5) * span;
      if (d.track.loop) s = ((s % dur) + dur) % dur; else if (s < 0 || s >= dur) continue;
      var h = (pk[Math.floor(s * 100)] || 0) * H * 0.9;
      g.fillRect(x, (H - h) / 2, step - 0.5 * dpr, h);
    }
    g.globalAlpha = 1;
    var bp = 60 / d.track.bpm, k0 = Math.ceil((pos - span / 2 - d.track.first) / bp);
    for (var k = k0; ; k++) {
      var bt = d.track.first + k * bp, xx = ((bt - pos) / span + 0.5) * W;
      if (xx > W) break;
      g.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)';
      g.fillRect(xx, 0, (k % 4 === 0 ? 2 : 1) * dpr, H);
    }
    g.fillStyle = '#fff'; g.fillRect(W / 2 - dpr, 0, 2 * dpr, H);
  }
  var hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; var e = el(id); if (e) e.innerHTML = v; } }
  function hud(mb) {
    setText('djScore', st.score.toLocaleString('en-GB'));
    setText('djCombo', st.combo ? st.combo + ' combo ×' + st.mult : '');
    setText('djAcc', st.weights.length ? accuracy().toFixed(1) + '%' : '');
    ['a', 'b'].forEach(function (s) {
      var d = decks[s], S = s.toUpperCase();
      setText('djName' + S, d.track ? esc(d.track.name) : 'Empty');
      setText('djMeta' + S, d.track ? d.bpm().toFixed(1) + ' BPM · ' + (d.pitch >= 0 ? '+' : '') + (d.pitch * 100).toFixed(1) + '% · bass ' + (d.low <= -12 ? '<b class="off">off</b>' : 'on') + (Math.abs(d.filter) > 0.02 ? ' · filter ' + Math.round(d.filter * 100) : '') : '');
    });
    var tr = st.tr, info = '', ok = false;
    if (tr && decks[tr.to].track) {
      var gap = decks[tr.to].bpm() - decks[tr.from].bpm();
      ok = Math.abs(gap) <= 0.15;
      info = 'Tempo gap <b class="' + (ok ? 'good' : 'bad') + '">' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' BPM</b>';
    }
    setText('djTempo', info);
    var n = el('djNeedle'), both = tr && decks[tr.from].playing && decks[tr.to].playing;
    if (n) {
      var ms = both ? phaseMs() : 0;
      n.style.transform = 'translateX(' + Math.max(-50, Math.min(50, ms / msPerBeat() * 100)).toFixed(1) + 'px)';
      n.className = !both ? '' : Math.abs(ms) < 20 ? 'good' : Math.abs(ms) < 50 ? 'meh' : 'bad';
    }
    var bar = el('djProg'); if (bar) bar.style.width = Math.min(100, (st.idx + (tr && mb > tr.T ? Math.min(1, (mb - tr.T) / (tr.end - tr.T)) : 0)) / Math.max(1, st.list.length - 1) * 100) + '%';
  }

  // ---------- MIDI ----------
  function buildRev() { rev = {}; var m = P.midi || {}; Object.keys(m).forEach(function (k) { rev[m[k]] = k; }); }
  function midiConnect(quiet) {
    if (!navigator.requestMIDIAccess) { if (!quiet) toast('This browser can\'t talk to MIDI controllers. Use Chrome or Edge on your PC.', true); return; }
    navigator.requestMIDIAccess({ sysex: false }).then(function (acc) {
      midi = acc; bindMidi();
      acc.onstatechange = function () { bindMidi(); if (view === 'setup') render(); };
      if (view === 'setup') render();
    }, function () { if (!quiet) toast('MIDI was blocked. Allow it in the address bar and try again.', true); });
  }
  function midiNames() { var n = []; if (midi) midi.inputs.forEach(function (i) { n.push(i.name); }); return n; }
  function bindMidi() {
    if (!midi) return;
    var herc = false;
    midi.inputs.forEach(function (i) { i.onmidimessage = onMidi; if (/inpulse|hercules|djcontrol/i.test(i.name)) herc = true; });
    midiOut = null;
    midi.outputs.forEach(function (o) { if (!midiOut || /inpulse|hercules|djcontrol/i.test(o.name)) midiOut = o; });
    if (herc && !P.midi) { P.midi = Object.assign({}, INPULSE); savePrefs(); toast('Inpulse 500 found. Starter map loaded.'); }
  }
  function onMidi(ev) {
    var d = ev.data; if (!d || d.length < 3) return;
    var hi = d[0] >> 4, ch = d[0] & 15;
    if (hi === 9 && d[2] === 0) return;            // note off
    if (hi !== 9 && hi !== 11) return;
    var key = hi + '.' + ch + '.' + d[1];
    lastMsg = (hi === 9 ? 'Button' : 'Control') + ' ' + d[1] + ' on channel ' + (ch + 1) + ' (' + d[2] + ')';
    if (learn) { learn.msgs.push([hi, d[1], key]); if (!learn.timer) learn.timer = setTimeout(finishLearn, 350); return; }
    var row = rev[key];
    if (view === 'setup') { var lm = el('djLast'); if (lm) lm.textContent = lastMsg; if (row) { var r = document.querySelector('[data-mrow="' + row + '"]'); if (r) { r.classList.add('hit'); setTimeout(function () { r.classList.remove('hit'); }, 300); } } return; }
    if (!row || !st || !st.running) return;
    var v = d[2] / 127, parts = row.split('.'), deck = decks[parts[0]], what = parts[1];
    if (row === 'xf') return setXf(v);
    if (what === 'play') return hi === 9 && deckPress(parts[0]);
    if (what === 'sync') return hi === 9 && syncDeck(parts[0]);
    if (st.paused) return;
    if (what === 'jog') {
      var rel = d[2] < 64 ? d[2] : d[2] - 128;
      deck.nudge = Math.max(-0.1, Math.min(0.1, rel * 0.012)); deck.setRate();
      clearTimeout(deck.jogTimer); deck.jogTimer = setTimeout(function () { deck.nudge = 0; deck.setRate(); }, 90);
    } else if (what === 'pitch') {
      var target = (P.flipPitch ? -1 : 1) * (v - 0.5) * 2 * RANGE;
      if (Math.abs(v - 0.5) < 0.01) target = 0;
      if (!deck.picked.pitch) { if (Math.abs(target - deck.pitch) < 0.006) deck.picked.pitch = true; else return hint('Move the deck ' + parts[0].toUpperCase() + ' pitch fader to ' + (deck.pitch >= 0 ? '+' : '') + (deck.pitch * 100).toFixed(1) + '% to pick it up'); }
      deck.pitch = target; deck.setRate();
    } else if (what === 'low') {
      setLow(deck, Math.abs(v - 0.5) < 0.03 ? 0 : v < 0.5 ? KILL + (v / 0.5) * -KILL : (v - 0.5) / 0.5 * 6);
    } else if (what === 'filter') setFilter(deck, Math.abs(v - 0.5) < 0.04 ? 0 : (v - 0.5) * 2);
    else if (what === 'vol') setVol(deck, v);
  }
  function finishLearn() {
    var l = learn; learn = null; if (!l || !l.msgs.length) return render();
    var notes = l.msgs.filter(function (m) { return m[0] === 9; }), pick = notes[0] || l.msgs.slice().sort(function (a, b) { return a[1] - b[1]; })[0];
    P.midi = P.midi || {};
    Object.keys(P.midi).forEach(function (k) { if (P.midi[k] === pick[2]) delete P.midi[k]; });
    P.midi[l.row] = pick[2]; savePrefs();
    toast('Learned: ' + MIDI_ROWS.filter(function (r) { return r[0] === l.row; })[0][1]);
    render();
  }
  function leds(off, mb) {
    if (!midiOut || !P.midi) return;
    ['a', 'b'].forEach(function (s) {
      var k = P.midi[s + '.play']; if (!k || k.indexOf('9.') !== 0) return;
      var on = false;
      if (!off && decks) {
        var p = pending('play', s);
        if (p && mb > p.beat - 8) on = (mb % 1) < 0.5; else on = decks[s].playing;
      }
      if (ledState[s] === on) return;
      ledState[s] = on;
      var bits = k.split('.');
      try { midiOut.send([0x90 | +bits[1], +bits[2], on ? 127 : 0]); } catch (e) {}
    });
  }

  // ---------- keyboard ----------
  function actionFor(code) { var k = P.keys; for (var a in k) if (k[a] === code) return a; return ''; }
  function onKey(ev) {
    if (!root) return;
    ev.stopPropagation();                         // the game owns the keyboard while it's open
    if (rebinding) {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.code !== 'Escape') { var was = actionFor(ev.code); if (was && was !== rebinding) P.keys[was] = P.keys[rebinding]; P.keys[rebinding] = ev.code; savePrefs(); }
      rebinding = ''; return render();
    }
    if (view !== 'play') { if (ev.code === 'Escape' && view === 'setup') close(); return; }
    var tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag) && ev.target.type !== 'range') return;
    var a = actionFor(ev.code);
    held.shift = ev.shiftKey;
    if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    if (a === 'pause') return pause(!st.paused);
    if (ev.repeat && /^(a|b|bass|sync|nudgeBack|nudgeFwd)$/.test(a)) return;
    var inc = st.tr ? st.tr.to : other(st.main);
    if (a === 'a' || a === 'b') deckPress(a);
    else if (a === 'bass') bassPress();
    else if (a === 'sync') syncDeck(inc);
    else if (a === 'pitchUp' || a === 'pitchDown') pitchBy(inc, (a === 'pitchUp' ? 1 : -1) * (ev.shiftKey ? 0.01 : 0.001));
    else if (a === 'nudgeBack' || a === 'nudgeFwd') nudge(inc, a === 'nudgeFwd' ? 0.04 : -0.04);
    else held[a] = true;
  }
  function onKeyUp(ev) {
    if (!root || view !== 'play' || !st) return;
    held.shift = ev.shiftKey;
    var a = actionFor(ev.code);
    if (!a) return;
    if (a === 'nudgeBack' || a === 'nudgeFwd') { nudge(st.tr ? st.tr.to : other(st.main), 0); return; }
    held[a] = false;
  }

  // ---------- screens ----------
  function seg(name, list, cur) { return '<div class="dj-seg">' + list.map(function (o) { return '<button type="button" data-dj="pref" data-k="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function bestLine(b, who) {
    if (!b || !b.tries) return '<span class="dj-muted">' + who + ': not played yet</span>';
    return '<span>' + who + ': <b>' + (b.grade || '-') + '</b> ' + (b.acc != null ? b.acc + '%' : '') + ' · ' + (b.score || 0).toLocaleString('en-GB') + '</span>';
  }
  function setupHtml() {
    var best = opts.best ? opts.best() : null, stations = M() ? M().STATIONS : [];
    var h = '<div class="dj-head"><div><div class="dj-eyebrow">Life Quest · the full mixing game</div><h2>DJ Set</h2></div><button type="button" class="dj-x" data-dj="close" aria-label="Close">Close</button></div>';
    h += '<p class="dj-sub">Guitar Hero for mixing. Drop the next track on the line, ride the crossfader along the purple path, swap the bass on the yellow line and take the old track out. Your own tracks or the stations, scored on every transition.</p>';
    if (best) h += '<div class="dj-card dj-best">' + bestLine(best.mine, 'You') + bestLine(best.other, esc(opts.otherName || 'Them')) + '<span class="dj-muted">XP for your first scoring set each day. Replays count for your best.</span></div>';
    // tracks
    h += '<div class="dj-card"><div class="dj-h3">Your tracks <span class="dj-muted">(saved on this device)</span></div>';
    if (lib.length) h += '<div class="dj-tracks">' + lib.map(function (r) {
      var on = P.files.indexOf(r.id) !== -1;
      return '<div class="dj-track' + (on ? ' on' : '') + '"><button type="button" class="dj-tick" data-dj="pick" data-id="' + r.id + '" aria-pressed="' + on + '" aria-label="Use in the set">' + (on ? P.files.indexOf(r.id) + 1 : '') + '</button><span class="dj-tname">' + esc(r.name) + '</span>' +
        '<span class="dj-bpm">' + r.bpm.toFixed(1) + ' BPM</span><button type="button" class="dj-mini" data-dj="half" data-id="' + r.id + '" title="Half the tempo">÷2</button><button type="button" class="dj-mini" data-dj="double" data-id="' + r.id + '" title="Double the tempo">×2</button><button type="button" class="dj-mini" data-dj="shift" data-id="' + r.id + '" title="Beat grid on the off-beat? Shift it half a beat">\u00bd</button><button type="button" class="dj-mini" data-dj="del" data-id="' + r.id + '" aria-label="Remove">✕</button></div>';
    }).join('') + '</div>';
    else h += '<p class="dj-muted">Add MP3s, WAVs or any audio from your computer. They\'re analysed for tempo and beats once, then saved here for next time.</p>';
    h += '<label class="dj-btn soft">' + (busyMsg && view === 'setup' ? esc(busyMsg) : 'Add tracks') + '<input type="file" id="djFiles" accept="audio/*" multiple hidden></label>';
    h += '<p class="dj-muted small">Tick tracks to play them, in the order you tick. Too few? Stations fill the rest. Tempo looks wrong? Try ÷2 or ×2. Beats feel half a beat off? Press ½.</p></div>';
    // stations
    h += '<div class="dj-card"><div class="dj-h3">Stations in the crate</div><div class="dj-chips">' + stations.filter(function (s) { return s.id !== 'clean-ambient'; }).map(function (s) {
      return '<button type="button" class="dj-chip" data-dj="crate" data-id="' + s.id + '" aria-pressed="' + (P.crate.indexOf(s.id) !== -1) + '" style="--c:' + s.c1 + '">' + esc(s.name) + '</button>';
    }).join('') + '</div></div>';
    // set
    h += '<div class="dj-card"><div class="dj-h3">The set</div>' +
      '<div class="dj-row"><span>Difficulty</span>' + seg('diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], P.diff) + '</div><p class="dj-muted small">' + DIFF_TEXT[P.diff] + '</p>' +
      '<div class="dj-row"><span>Mixes</span>' + seg('mixes', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], P.mixes) + '</div>' +
      '<div class="dj-row"><span>Solo bars per track</span>' + seg('bars', [[8, '8'], [16, '16'], [32, '32']], P.bars) + '</div>' +
      '<div class="dj-row"><span>Skip intros on your tracks</span>' + seg('skip', [[0, 'No'], [16, '16 bars'], [32, '32 bars']], P.skip) + '</div>' +
      '<div class="dj-row"><span>Crossfader</span>' + seg('curve', [['smooth', 'Smooth'], ['cut', 'Sharp']], P.curve) + '</div>' +
      '<div class="dj-row"><span>Timing <b id="djOffV">' + (P.offset > 0 ? '+' : '') + P.offset + ' ms</b></span><input type="range" id="djOff" min="-150" max="150" step="5" value="' + P.offset + '" aria-label="Timing offset"></div><p class="dj-muted small">Hits always late? Move it right. Always early? Left. Bluetooth headphones usually need +150.</p></div>';
    // keyboard
    h += '<div class="dj-card"><div class="dj-h3">Keyboard</div><div class="dj-keys">' + ACTIONS.map(function (a) {
      return '<div class="dj-key"><span>' + a[1] + '</span><button type="button" class="dj-kbd' + (rebinding === a[0] ? ' wait' : '') + '" data-dj="rebind" data-a="' + a[0] + '">' + (rebinding === a[0] ? 'Press a key' : esc(keyName(P.keys[a[0]]))) + '</button></div>';
    }).join('') + '</div><button type="button" class="dj-btn line" data-dj="keysReset">Reset keys</button></div>';
    // MIDI
    var names = midiNames();
    h += '<div class="dj-card"><div class="dj-h3">DJ controller (MIDI)</div>';
    if (!navigator.requestMIDIAccess) h += '<p class="dj-muted">This browser can\'t use MIDI. Open Life Quest in Chrome or Edge on your PC.</p>';
    else if (!midi) h += '<p class="dj-muted">Plug in your Hercules DJControl Inpulse 500 by USB, close DJUCED (only one app can use it at a time), then connect.</p><button type="button" class="dj-btn primary" data-dj="midi">Connect controller</button>';
    else {
      h += '<p>' + (names.length ? 'Connected: <b>' + esc(names.join(', ')) + '</b>' : '<span class="dj-muted">No controller found. Plug it in, close DJUCED, and it shows up here.</span>') + '</p>';
      h += '<p class="dj-muted small">Last message: <span id="djLast">' + esc(lastMsg || 'move something') + '</span></p>';
      h += '<div class="dj-midi">' + MIDI_ROWS.map(function (r) {
        var k = P.midi && P.midi[r[0]];
        return '<div class="dj-mrow" data-mrow="' + r[0] + '"><span>' + r[1] + '</span><span class="dj-muted small">' + (k ? (k.indexOf('9.') === 0 ? 'button ' : 'control ') + k.split('.')[2] + ', ch ' + (+k.split('.')[1] + 1) : 'not set') + '</span><button type="button" class="dj-kbd' + (learn && learn.row === r[0] ? ' wait' : '') + '" data-dj="learn" data-row="' + r[0] + '">' + (learn && learn.row === r[0] ? 'Move it now' : 'Learn') + '</button></div>';
      }).join('') + '</div>';
      h += '<div class="dj-row"><button type="button" class="dj-btn line" data-dj="preset">Load the Inpulse 500 map</button><button type="button" class="dj-btn line" data-dj="flip" aria-pressed="' + !!P.flipPitch + '">' + (P.flipPitch ? 'Pitch faders flipped' : 'Flip pitch faders') + '</button></div>';
      h += '<p class="dj-muted small">Rows flash when that control moves. If one doesn\'t, press Learn and move it. Sound comes out of the computer (or the Inpulse if it\'s your output in Windows), and headphone cueing isn\'t available in a browser, so beatmatch with the phase meter.</p>';
    }
    h += '</div>';
    h += '<div class="dj-card dj-how"><div class="dj-h3">How it plays</div><ol>' +
      '<li><b>PLAY</b> notes fall in the next deck\'s lane. Hit its key ' + esc(keyName(P.keys.a)) + ' or ' + esc(keyName(P.keys.b)) + ' on the line to drop it in on the phrase.</li>' +
      '<li>The <b>purple path</b> is the crossfader. Keep the white puck on it with ' + esc(keyName(P.keys.xfL)) + ' ' + esc(keyName(P.keys.xfR)) + ', the slider or your controller.</li>' +
      '<li>The <b>yellow line</b> is the bass swap (' + esc(keyName(P.keys.bass)) + ', or turn one low EQ down and the other up). Both basses up together is a clash.</li>' +
      '<li><b>CUT</b> means slam the fader across on that beat. <b>STOP</b> takes the old track out.</li>' +
      '<li>Before a drop, match the tempo: the gap shows above the highway. Pitch with ' + esc(keyName(P.keys.pitchDown)) + ' ' + esc(keyName(P.keys.pitchUp)) + ', nudge with ' + esc(keyName(P.keys.nudgeBack)) + ' ' + esc(keyName(P.keys.nudgeFwd)) + ' until the phase needle sits in the middle.</li></ol></div>';
    h += '<button type="button" class="dj-go" data-dj="start">Start the set</button>';
    return h;
  }
  function playHtml() {
    return '<div class="dj-top"><button type="button" class="dj-x" data-dj="pause" aria-label="Pause">Pause</button><div class="dj-prog"><i id="djProg"></i></div><div class="dj-scorebox"><b id="djScore">0</b><span id="djCombo"></span><span id="djAcc"></span></div></div>' +
      '<div class="dj-decks"><div class="dj-deck a"><div class="dj-dhead"><b id="djNameA"></b><span id="djMetaA"></span></div><canvas id="djWaveA"></canvas></div>' +
      '<div class="dj-deck b"><div class="dj-dhead"><b id="djNameB"></b><span id="djMetaB"></span></div><canvas id="djWaveB"></canvas></div></div>' +
      '<div class="dj-mid"><span id="djTempo"></span><span class="dj-phase" title="Phase: keep the needle in the middle"><i id="djNeedle"></i></span></div>' +
      '<canvas id="djHwy" class="dj-hwy"></canvas>' +
      '<div class="dj-pads"><button type="button" class="dj-pad a" data-dj="deck" data-d="a">A</button><input type="range" id="djXf" min="0" max="1" step="0.01" value="0" aria-label="Crossfader"><button type="button" class="dj-pad b" data-dj="deck" data-d="b">B</button></div>' +
      '<div class="dj-pads2"><button type="button" data-dj="bass">Bass swap</button><button type="button" data-dj="pitch" data-v="-0.001">Pitch −</button><button type="button" data-dj="pitch" data-v="0.001">Pitch +</button>' +
      '<button type="button" data-hold="-0.04">Nudge back</button><button type="button" data-hold="0.04">Nudge on</button><button type="button" data-dj="sync">Sync</button>' +
      (P.diff === 'hard' ? '<label class="dj-filt">Filter<input type="range" id="djFilt" min="-1" max="1" step="0.02" value="0" aria-label="Filter on the outgoing deck"></label>' : '') + '</div>' +
      '<div class="dj-pause" id="djPause" hidden><div class="dj-card"><h3>Paused</h3><button type="button" class="dj-go" data-dj="resume">Keep mixing</button><button type="button" class="dj-btn line" data-dj="endset">End the set here</button><button type="button" class="dj-btn line" data-dj="restart">Start again</button><button type="button" class="dj-btn line" data-dj="quit">Back to setup</button></div></div>';
  }
  function resultsHtml() {
    var r = st.result, c = r.count, h = '<div class="dj-head"><div><div class="dj-eyebrow">Set complete</div><h2>DJ Set</h2></div><button type="button" class="dj-x" data-dj="close" aria-label="Close">Close</button></div>';
    h += '<div class="dj-grade g' + r.grade + '">' + r.grade + '</div>';
    h += '<div class="dj-stats"><div><b>' + r.score.toLocaleString('en-GB') + '</b><span>score</span></div><div><b>' + r.acc + '%</b><span>accuracy</span></div><div><b>' + r.maxCombo + '</b><span>best combo</span></div><div><b>' + r.clashes + '</b><span>bass clashes</span></div></div>';
    h += '<p class="dj-muted center">' + c.P + ' perfect · ' + c.G + ' great · ' + c.O + ' good · ' + c.M + ' missed</p>';
    h += '<p class="center">' + (!r.mixes ? 'No mixes finished, so nothing to save.' : r.saving ? 'Saving to Life Quest…' : r.failed ? 'Couldn\'t save it. Check your connection.' : r.saved ? (r.saved.points ? r.saved.points + ' points' + (r.saved.firstXp ? ', +' + r.saved.firstXp + ' XP' : ' (XP already earned today)') : 'Under 50% earns nothing. Go again.') : '') + '</p>';
    st.log.forEach(function (tr, i) {
      h += '<div class="dj-card"><div class="dj-h3">Mix ' + (i + 1) + ' <span class="dj-muted">' + ({ blend: 'Long blend', quick: 'Quick blend', cut: 'Cut' })[tr.style] + '</span></div>' + tr.res.map(function (x) {
        return '<div class="dj-res"><span>' + x[0] + (x[2] ? ' <span class="dj-muted small">' + esc(x[2]) + '</span>' : '') + '</span><b class="j' + x[1] + '">' + WORD[x[1]] + '</b></div>';
      }).join('') + '</div>';
    });
    h += '<button type="button" class="dj-go" data-dj="start">Play again</button><button type="button" class="dj-btn line wide" data-dj="quit">Change the set</button>';
    return h;
  }
  function render() {
    if (!root) return;
    var body = el('djBody');
    root.className = 'dj dj-' + view;
    if (view === 'setup') body.innerHTML = setupHtml();
    else if (view === 'loading') body.innerHTML = '<div class="dj-loading"><div class="dj-spin"></div><p>' + esc(busyMsg) + '</p></div>';
    else if (view === 'play') { hudCache = {}; body.innerHTML = playHtml(); }
    else if (view === 'results') body.innerHTML = resultsHtml();
  }

  // ---------- events ----------
  function addFiles(files) {
    files = [].slice.call(files || []);
    if (!files.length) return;
    var c = audio(), i = 0;
    (function next() {
      if (i >= files.length) { busyMsg = ''; return libAll().then(function (l) { lib = l; render(); }); }
      var f = files[i++];
      busyMsg = 'Analysing ' + i + ' of ' + files.length + '…'; render();
      f.arrayBuffer().then(function (ab) { return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); }); }).then(function (buf) {
        var a = analyse(buf), id = 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
        return libPut({ id: id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 60), blob: f, bpm: a.bpm, first: a.first, dur: buf.duration, added: Date.now() }).then(function () { if (P.files.length < 9) { P.files.push(id); savePrefs(); } });
      }).catch(function () { toast('Couldn\'t read ' + f.name + '. Try an MP3 or WAV.', true); }).then(next);
    })();
  }
  function onClick(ev) {
    var t = ev.target.closest('[data-dj]'); if (!t || !root.contains(t)) return;
    var a = t.dataset.dj, id = t.dataset.id;
    if (a === 'close') return close();
    if (a === 'start') return start();
    if (a === 'pref') { var k = t.dataset.k, v = t.dataset.v; P[k] = /^-?\d+$/.test(v) ? +v : v; savePrefs(); return render(); }
    if (a === 'crate') { var ix = P.crate.indexOf(id); if (ix === -1) P.crate.push(id); else P.crate.splice(ix, 1); savePrefs(); return render(); }
    if (a === 'pick') { var j = P.files.indexOf(id); if (j === -1) P.files.push(id); else P.files.splice(j, 1); savePrefs(); return render(); }
    if (a === 'half' || a === 'double' || a === 'del' || a === 'shift') {
      var r = lib.filter(function (x) { return x.id === id; })[0]; if (!r) return;
      if (a === 'del') { P.files = P.files.filter(function (x) { return x !== id; }); savePrefs(); return libDel(id).then(libAll).then(function (l) { lib = l; render(); }); }
      if (a === 'shift') { var bp = 60 / r.bpm; r.first = Math.round(((r.first + bp / 2) % bp) * 1000) / 1000; toast('Beat grid moved half a beat'); return libPut(r).then(render); }
      var nb = a === 'half' ? r.bpm / 2 : r.bpm * 2;
      if (nb < 50 || nb > 220) return toast('That would be ' + Math.round(nb) + ' BPM. Leaving it.', true);
      r.bpm = Math.round(nb * 100) / 100; r.first = r.first % (60 / r.bpm);
      return libPut(r).then(render);
    }
    if (a === 'rebind') { rebinding = rebinding === t.dataset.a ? '' : t.dataset.a; return render(); }
    if (a === 'keysReset') { P.keys = Object.assign({}, KEYS0); savePrefs(); return render(); }
    if (a === 'midi') return midiConnect(false);
    if (a === 'learn') { learn = { row: t.dataset.row, msgs: [], timer: 0 }; render(); setTimeout(function () { if (learn && !learn.msgs.length && learn.row === t.dataset.row) { learn = null; render(); } }, 8000); return; }
    if (a === 'preset') { P.midi = Object.assign({}, INPULSE); savePrefs(); toast('Inpulse 500 map loaded'); return render(); }
    if (a === 'flip') { P.flipPitch = !P.flipPitch; savePrefs(); return render(); }
    if (!st) return;
    if (a === 'pause') return pause(true);
    if (a === 'resume') return pause(false);
    if (a === 'endset') { pause(false); return finish(); }
    if (a === 'restart') { pause(false); return start(); }
    if (a === 'quit') { if (st.paused) pause(false); teardown(); view = 'setup'; return render(); }
    if (a === 'deck') return deckPress(t.dataset.d);
    if (a === 'bass') return bassPress();
    if (a === 'sync') return syncDeck(st.tr ? st.tr.to : other(st.main));
    if (a === 'pitch') return pitchBy(st.tr ? st.tr.to : other(st.main), +t.dataset.v);
  }
  function onInput(ev) {
    var t = ev.target;
    if (t.id === 'djOff') { P.offset = +t.value; savePrefs(); var o = el('djOffV'); if (o) o.textContent = (P.offset > 0 ? '+' : '') + P.offset + ' ms'; }
    if (!st || !st.running) return;
    if (t.id === 'djXf') setXf(+t.value);
    if (t.id === 'djFilt') setFilter(st.tr ? decks[st.tr.from] : decks[st.main], +t.value);
  }
  function onChange(ev) { if (ev.target.id === 'djFiles') { addFiles(ev.target.files); ev.target.value = ''; } }
  function onDown(ev) { var t = ev.target.closest && ev.target.closest('[data-hold]'); if (t && st && st.running) { ev.preventDefault(); nudge(st.tr ? st.tr.to : other(st.main), +t.dataset.hold); } }
  function onUp(ev) { var t = ev.target.closest && ev.target.closest('[data-hold]'); if (t && st && decks) nudge(st.tr ? st.tr.to : other(st.main), 0); }
  function onVis() { if (document.hidden && st && st.running && !st.paused) pause(true); }

  function open(o) {
    opts = o || {};
    P = loadPrefs(); buildRev(); ledState = {};
    if (root) close();
    root = document.createElement('div');
    root.id = 'djset'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'DJ Set');
    root.innerHTML = '<div class="dj-in" id="djBody"></div>';
    document.body.appendChild(root);
    document.body.classList.add('dj-open');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onDown);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (e) { root.addEventListener(e, onUp, true); });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('visibilitychange', onVis);
    view = 'setup'; render();
    libAll().then(function (l) { lib = l; P.files = P.files.filter(function (id) { return l.some(function (r) { return r.id === id; }); }); render(); });
    if (navigator.requestMIDIAccess && P.midi) midiConnect(true);
  }
  function close() {
    teardown(); st = null;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (midi) midi.inputs.forEach(function (i) { i.onmidimessage = null; });
    leds(true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('visibilitychange', onVis);
    if (root) root.remove();
    root = null;
    document.body.classList.remove('dj-open');
    if (opts.onClose) opts.onClose();
  }

  window.LQDJ = { open: open, close: close, analyse: analyse, buildChart: buildChart, guide: guide, INPULSE: INPULSE,
    _state: function () { return st; }, _decks: function () { return decks; }, _at: function () { return ctx ? at() : 0; } };
})();
