/*
 * Afterhours: Booth · playing: Free mix, the Library, the beat-grid editor,
 * sound settings, controller lights and the Beatmatch Guide.
 * Every action goes through control(), whether it came from the Inpulse 500,
 * the keyboard or the mouse.
 */
(function () {
  'use strict';
  var S = null, E = null, lib = null, raf = 0, ledT = 0, shift = { A: false, B: false }, sel = 0, gridDeck = '', metro = { A: false, B: false }, lastClick = { A: -1, B: -1 };
  var libFilter = { q: '', sort: 'name', genre: '', near: '' }, analysing = null, ledCache = {}, ui = {};
  var settings = null;
  var GENRES = ['', 'Techno', 'Acid', 'Hard groove', 'Club', 'House', 'Minimal', 'Drill loop'];
  function esc(s) { return S.esc(s); }
  function el(id) { return document.getElementById(id); }
  function fmtTime(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + ('0' + r).slice(-2); }
  function pct(r) { var p = (r - 1) * 100; return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(2) + '%'; }

  // ---------- engine and library (sound needs one click first: Chrome's rule) ----------
  function ready() { return !!E; }
  function start() {
    if (E) { E.resume(); return Promise.resolve(); }
    E = new BoothAudio.Engine(); lib = new BoothLibrary(E.ctx);
    applySettings();
    // the controller's real positions (it reported them when it connected)
    ['A', 'B'].forEach(function (d) {
      ['trim', 'eqLow', 'eqMid', 'eqHigh', 'filter', 'volume'].forEach(function (n) { var v = S.values[d + '.' + n]; if (v !== undefined) E.decks[d].set(n, v); });
      var p = S.values[d + '.pitch']; if (p !== undefined) E.decks[d].pitchFader(settings.invertPitch ? 1 - p : p);
    });
    if (S.values.xfader !== undefined) E.setXfader(S.values.xfader);
    if (S.conn.status.state === 'ready') S.conn.requestDump();
    loop();
    return E.resume().then(function () { return lib.list(); }).then(function () { refreshScreen(); autoAnalyse(); });
  }
  function applySettings() {
    if (!E) return;
    E.xfLocked = settings.xfLocked; E.setXfader(E.xf);
    ['A', 'B'].forEach(function (d) { E.decks[d].pitchRange = settings.pitchRange; });
    if (settings.outId && E.ctx.setSinkId) E.setOutput(settings.outId).then(function () { E.route(settings.cueMode, settings.cueId); }, function () { E.route(settings.cueMode, settings.cueId); });
    else E.route(settings.cueMode, settings.cueId);
  }
  function autoAnalyse() {
    if (analysing || !lib.items.some(function (x) { return x.own && !x.analysed; })) return;
    analysing = { done: 0, total: 0, name: '' };
    lib.analyseAll(function (i, n, it) { analysing = { done: i, total: n, name: it.name }; drawAnalysing(); }).then(function () { analysing = null; drawAnalysing(); refreshScreen(); S.toast('Tracks analysed. BPM, key and beat grids are ready.'); });
    drawAnalysing();
  }
  function drawAnalysing() {
    var b = el('analysing'); if (!b) return;
    b.innerHTML = analysing ? '<div class="note">Analysing your tracks (once only): ' + (analysing.done + 1) + ' of ' + analysing.total + ' · ' + esc(analysing.name) + '<div class="bar"><i style="width:' + (analysing.total ? analysing.done / analysing.total * 100 : 0) + '%"></i></div></div>' : '';
  }
  function refreshScreen() { var s = S.screen(); if (s === 'free') drawFree(); else if (s === 'library') drawLibrary(); }

  // ---------- one path for every control ----------
  function control(e) {
    if (!e || !e.id) return;
    if (!E) { if (e.kind === 'button' && e.down && S.screen() === 'free') S.toast('Click "Turn the sound on" first: Chrome needs one click before it plays sound.'); return; }   // positions are kept in S.values and applied when the sound starts
    var m = /^([AB])\.(.+)$/.exec(e.id);
    if (!m) {
      if (e.id === 'xfader') { E.setXfader(e.value); if (E.xfLocked && S.screen() === 'free' && Math.abs(e.value - 0.5) > 0.2) hint('The crossfader is locked to the middle. Mix with the volume faders and EQs, or unlock it in Sound settings.'); }
      if (e.id === 'browse' && e.delta) moveSel(e.delta > 0 ? 1 : -1);
      if (e.id === 'browsePush' && e.down) { var free = !E.decks.A.playing ? 'A' : !E.decks.B.playing ? 'B' : ''; if (free) loadTo(free); else S.toast('Both decks are playing. Stop one first.'); }
      return;
    }
    var id = m[1], n = m[2], d = E.decks[id];
    if (/^(volume|trim|eqLow|eqMid|eqHigh|filter)$/.test(n)) { if (e.value !== undefined) d.set(n, e.value); return; }
    if (n === 'pitch') { if (e.value !== undefined) { d.pitchFader(settings.invertPitch ? 1 - e.value : e.value); if (d.sync && d.track && S.screen() === 'free') hint('SYNC is on for Deck ' + id + ', so the pitch fader is ignored. Press SYNC to turn it off and beatmatch by hand.'); } return; }
    if (n === 'jogEdge' || n === 'jogTop') { d.jog(e.delta); return; }
    if (n === 'jogTouch') { d.touching = e.down; return; }
    if (n === 'shift') { shift[id] = e.down; return; }
    if (e.kind === 'button' && !e.down) { if (n === 'cue') d.cueUp(); return; }
    if (n === 'play') { if (!d.track) return S.toast('Load a track onto Deck ' + id + ' first (LOAD ' + id + ').'); if (d.playing) d.stop(); else d.play(); }
    else if (n === 'cue') d.cueDown();
    else if (n === 'sync') { d.setSync(!d.sync); S.toast('Deck ' + id + ' SYNC ' + (d.sync ? 'on: it follows the other deck' : 'off: match it with the pitch fader and jog wheel')); }
    else if (n === 'pfl') d.set('pfl', d.vals.pfl ? 0 : 1);
    else if (n === 'load') loadTo(id);
    else if (/^mode\d$/.test(n)) { if (n !== 'mode1') S.toast('Booth uses the pads in HOT CUE mode. Press HOT CUE.'); }
    else if (/^pad\.hotcue\.\d$/.test(n)) { var k = +n.slice(-1) - 1, r = d.hotcue(k, shift[id]); if (r === 'set' || r === 'deleted') saveHot(d); }
    ui.dirty = true;
  }
  function key(id, dir) {
    if (!E) { if (S.screen() === 'free') start(); return; }
    var c = S.dec.control(id) || {};
    if (/nudge/.test(id)) return E.decks[id[0]].jog(dir * 14);
    if (c.kind === 'fader' || c.kind === 'knob' || c.kind === 'center') {
      var step = /pitch/.test(id) ? 0.00625 : 0.05, cur = S.values[id] === undefined ? (c.kind === 'center' || /pitch|trim/.test(id) ? 0.5 : 0) : S.values[id];
      S.values[id] = Math.max(0, Math.min(1, cur + dir * step));
      control({ id: id, kind: c.kind, value: S.values[id] }); return syncInputs();
    }
    control({ id: id, kind: 'button', down: true });
    if (/\.cue$/.test(id)) setTimeout(function () { control({ id: id, kind: 'button', down: false }); }, 250);
  }
  function saveHot(d) { var it = lib && lib.get(d.track.id); if (it) lib.update(it, { hot: d.hot.slice() }); }
  var hintT = 0, lastHint = '';
  function hint(msg) { if (msg === lastHint && Date.now() - hintT < 8000) return; lastHint = msg; hintT = Date.now(); S.toast(msg); }

  function loadTo(id, item) {
    if (!E) return start().then(function () { loadTo(id, item); });
    item = item || visible()[sel]; if (!item) return S.toast('Pick a track in the list first.');
    var d = E.decks[id];
    if (d.playing && d.vals.volume > 0.1) return S.toast('Deck ' + id + ' is playing out loud. Bring its volume down or stop it before loading.');
    var go = item.analysed ? Promise.resolve(item) : (S.toast('Analysing ' + item.name + ' first…'), lib.analyseOne(item));
    return go.then(function () { return lib.buffer(item); }).then(function (buf) {
      d.load({ id: item.id, name: item.name, bpm: item.bpm, first: item.first, waves: item.waves, key: item.key, camelot: item.camelot, hot: item.hot }, buf);
      S.toast(item.name + ' on Deck ' + id + ' · ' + item.bpm + ' BPM' + (item.camelot ? ' · ' + item.camelot : ''));
      ui.dirty = true; if (S.screen() === 'free') drawFree();
    }, function (e) { S.toast(e.message); });
  }

  // ---------- library list helpers ----------
  function visible() {
    if (!lib) return [];
    var q = libFilter.q.toLowerCase(), near = libFilter.near && lib.get(libFilter.near);
    var list = lib.items.filter(function (x) { return (!q || x.name.toLowerCase().indexOf(q) !== -1) && (!libFilter.genre || x.genre === libFilter.genre); });
    if (near) { var fr = lib.friends(near).map(function (x) { return x.id; }); list = list.filter(function (x) { return x.id === near.id || fr.indexOf(x.id) !== -1; }); }
    var s = libFilter.sort;
    list.sort(function (a, b) { return s === 'bpm' ? (a.bpm || 999) - (b.bpm || 999) : s === 'key' ? camNum(a.camelot) - camNum(b.camelot) : a.name.localeCompare(b.name); });
    return list;
  }
  function camNum(c) { var m = /^(\d+)([AB])$/.exec(c || ''); return m ? +m[1] * 2 + (m[2] === 'B' ? 1 : 0) : 99; }
  function moveSel(dir) {
    var n = visible().length; if (!n) return;
    sel = Math.max(0, Math.min(n - 1, sel + dir));
    document.querySelectorAll('[data-sel]').forEach(function (r) { r.classList.toggle('on', +r.getAttribute('data-sel') === sel); });
    var r = document.querySelector('[data-sel="' + sel + '"]'); if (r) r.scrollIntoView({ block: 'nearest' });
  }
  function mixesWith(item) {
    if (!E) return '';
    var out = [];
    ['A', 'B'].forEach(function (id) {
      var d = E.decks[id]; if (!d.track || d.track.id === item.id || !item.bpm) return;
      var r = item.bpm / d.bpm(); if (r < 0.94 || r > 1.06) return;
      if (item.camelot && d.track.camelot && !BoothDSP.camelotFriends(item.camelot, d.track.camelot)) return;
      out.push(id);
    });
    return out.length ? '<span class="tag ok">Mixes with ' + out.join(' and ') + '</span>' : '';
  }
  function trackRows(list, compact) {
    if (!lib) return '';
    if (!list.length) return '<p class="muted">No tracks match. ' + (lib.items.some(function (x) { return x.own; }) ? '' : 'Add your tracks in the Library.') + '</p>';
    return '<div class="tracks' + (compact ? ' compact' : '') + '">' + list.map(function (x, i) {
      return '<div class="trk' + (i === sel ? ' on' : '') + '" data-sel="' + i + '"><span class="tn grow">' + esc(x.name) + (x.error ? ' <span class="tag bad">couldn\'t read</span>' : '') + '</span>' +
        '<span class="tb mono">' + (x.analysed ? x.bpm.toFixed(1) : '…') + '</span><span class="tk mono">' + esc(x.camelot || '') + '</span>' + (compact ? '' : '<span class="tg">' + esc(x.genre || '') + '</span>') + '<span class="tl mono">' + fmtTime(x.dur) + '</span>' + mixesWith(x) +
        '<button type="button" class="bbtn sm" data-load="A" data-item="' + esc(x.id) + '">Load A</button><button type="button" class="bbtn sm" data-load="B" data-item="' + esc(x.id) + '">Load B</button></div>';
    }).join('') + '</div>';
  }

  // ---------- Free mix screen ----------
  function deckPanel(id) {
    var d = E && E.decks[id], t = d && d.track;
    return '<section class="panel deckp deck' + id + '"><div class="row"><span class="dk">DECK ' + id + '</span><b class="grow ttl" id="t' + id + '">' + (t ? esc(t.name) : 'No track: press LOAD ' + id + ' or a Load ' + id + ' button below') + '</b></div>' +
      '<div class="dstats"><div><span class="big mono" id="bpm' + id + '">' + (t ? d.bpm().toFixed(2) : '--') + '</span> <span class="muted small">BPM</span></div><div class="mono" id="pitch' + id + '">±0.00%</div><div class="mono" id="key' + id + '">' + (t && t.camelot ? esc(t.camelot) + ' · ' + esc(t.key) : '') + '</div><div class="mono" id="time' + id + '">' + (t ? '−' + fmtTime(d.left()) : '') + '</div></div>' +
      '<div class="dbtns"><button type="button" class="bbtn tbtn" data-b="' + id + '.play" id="play' + id + '">Play / pause</button><button type="button" class="bbtn tbtn" data-b="' + id + '.cue">Cue</button><button type="button" class="bbtn tbtn" data-b="' + id + '.sync" id="sync' + id + '">Sync</button></div>' +
      '<label class="slider">Pitch fader <span class="muted tiny">(top slower, bottom faster)</span><input type="range" min="0" max="1" step="0.0005" data-r="' + id + '.pitch" value="' + (S.values[id + '.pitch'] === undefined ? 0.5 : S.values[id + '.pitch']) + '"></label>' +
      '<div class="hot">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (k) { var set = d && d.hot[k] !== null && d.hot[k] !== undefined; return '<button type="button" class="hc' + (set ? ' set' : '') + '" data-hot="' + id + '.' + k + '" title="' + (set ? 'Jump to hot cue ' + (k + 1) + ' (right-click to delete)' : 'Set hot cue ' + (k + 1) + ' here') + '">' + (k + 1) + '</button>'; }).join('') + '</div>' +
      '<div class="row wrap"><button type="button" class="bbtn sm" data-nudge="' + id + '.-1">Nudge back</button><button type="button" class="bbtn sm" data-nudge="' + id + '.1">Nudge forward</button><button type="button" class="bbtn sm ghost" data-grid="' + id + '"' + (t ? '' : ' disabled') + '>Fix beat grid</button><button type="button" class="bbtn sm ghost' + (metro[id] ? ' on' : '') + '" data-metro="' + id + '">Click on beats</button></div></section>';
  }
  function knobRow(id, n, label, val) { return '<label class="kn">' + label + '<input type="range" min="0" max="1" step="0.005" data-r="' + id + '.' + n + '" value="' + val + '"></label>'; }
  function mixerPanel() {
    function col(id) {
      var v = function (n, dflt) { return S.values[id + '.' + n] === undefined ? dflt : S.values[id + '.' + n]; };
      return '<div class="mcol deck' + id + '"><div class="dk">' + id + '</div>' + knobRow(id, 'trim', 'TRIM', v('trim', .5)) + knobRow(id, 'eqHigh', 'HIGH', v('eqHigh', .5)) + knobRow(id, 'eqMid', 'MID', v('eqMid', .5)) + knobRow(id, 'eqLow', 'LOW', v('eqLow', .5)) + knobRow(id, 'filter', 'FILTER', v('filter', .5)) +
        '<button type="button" class="bbtn sm pfl" data-b="' + id + '.pfl" id="pfl' + id + '">Headphone cue</button><label class="vf">VOLUME<input type="range" class="vert" min="0" max="1" step="0.005" data-r="' + id + '.volume" value="' + v('volume', 0) + '"></label><div class="meter"><i id="lv' + id + '"></i></div></div>';
    }
    return '<section class="panel mixer"><div class="mcols">' + col('A') + col('B') + '</div>' +
      '<label class="slider xf">Crossfader ' + (settings.xfLocked ? '<span class="tag">locked to centre</span>' : '') + '<input type="range" min="0" max="1" step="0.005" data-r="xfader" value="' + (S.values.xfader === undefined ? .5 : S.values.xfader) + '"' + (settings.xfLocked ? ' disabled' : '') + '></label>' +
      '<div class="row small"><span class="grow">Master</span><span class="mono" id="mdb">−∞ dB</span></div><div class="meter wide"><i id="lvM"></i></div></section>';
  }
  function drawFree() {
    var h = '<div id="analysing"></div>';
    if (!E) h += '<div class="startbox panel"><h2>Ready to mix</h2><p class="muted">Chrome needs one click before it plays sound.</p><button type="button" class="bbtn primary" data-act="start">Turn the sound on</button></div>';
    h += '<div class="guide" id="guide"></div><div class="wfs"><canvas id="wfA" class="wf"></canvas><canvas id="wfB" class="wf"></canvas></div>' +
      '<div class="decks3">' + (E ? deckPanel('A') + mixerPanel() + deckPanel('B') : '') + '</div>' +
      (E ? '<section class="panel browser"><div class="row"><h3 class="grow">Tracks <span class="muted small">· BROWSE knob to move, push it or LOAD A / LOAD B to load</span></h3><input type="search" placeholder="Search" data-f="q" value="' + esc(libFilter.q) + '"><select data-f="sort"><option value="name">Sort by name</option><option value="bpm"' + (libFilter.sort === 'bpm' ? ' selected' : '') + '>Sort by BPM</option><option value="key"' + (libFilter.sort === 'key' ? ' selected' : '') + '>Sort by key</option></select></div>' + trackRows(visible(), true) + '</section>' : '') +
      '<div id="gridSlot"></div>';
    S.el('screen').innerHTML = h;
    drawAnalysing(); drawGrid(); sizeCanvases(); ui.dirty = true;
  }
  function sizeCanvases() {
    ['A', 'B'].forEach(function (id) { var c = el('wf' + id); if (!c) return; var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); });
  }
  window.addEventListener('resize', function () { if (S && S.screen() === 'free') sizeCanvases(); });
  function syncInputs() {
    document.querySelectorAll('[data-r]').forEach(function (inp) { var k = inp.getAttribute('data-r'); if (document.activeElement !== inp && S.values[k] !== undefined) inp.value = S.values[k]; });
  }

  // ---------- drawing (every frame) ----------
  var COL = { low: '#3d6bff', mid: '#ffb13d', high: '#f4ecff' };
  function drawWave(id) {
    var c = el('wf' + id); if (!c || !c.width) return;
    var g = c.getContext('2d'), W = c.width, H = c.height, d = E.decks[id], t = d.track;
    g.clearRect(0, 0, W, H);
    var main = H * 0.78, ov = H - main;
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, 0, W, main);
    if (!t || !t.waves) { g.fillStyle = '#6f5f8f'; g.font = (14 * (window.devicePixelRatio || 1)) + 'px Inter, sans-serif'; g.fillText(t ? 'Waveform after analysis…' : 'Deck ' + id + ': no track', 16, main / 2); return; }
    var now = d.time(), span = 8 * 60 / t.bpm * 2, pxPerSec = W / span, w = t.waves, mid = main / 2, rate = w.rate;
    // bands
    for (var x = 0; x < W; x += 2) {
      var s = now + (x - W / 2) / pxPerSec, i = Math.floor(s * rate); if (i < 0 || i >= w.low.length) continue;
      var lo = w.low[i] / 255, md = w.mid[i] / 255, hi = w.high[i] / 255;
      g.fillStyle = COL.low; g.fillRect(x, mid - lo * mid * 0.95, 2, lo * mid * 1.9);
      g.fillStyle = COL.mid; g.fillRect(x, mid - md * mid * 0.6, 2, md * mid * 1.2);
      g.fillStyle = COL.high; g.fillRect(x, mid - hi * mid * 0.3, 2, hi * mid * 0.6);
    }
    // beat grid: bars brighter, every 16 bars (a phrase) in pink with the bar number
    var beat = 60 / t.bpm, b0 = Math.ceil((now - span / 2 - t.first) / beat), b1 = Math.floor((now + span / 2 - t.first) / beat), dpr = window.devicePixelRatio || 1;
    g.font = (10 * dpr) + 'px Inter, sans-serif';
    for (var b = b0; b <= b1; b++) {
      var bx = W / 2 + (t.first + b * beat - now) * pxPerSec, bar = Math.floor(b / 4) + 1, phrase = b % 64 === 0;
      g.fillStyle = phrase ? '#ff3fb4' : b % 4 === 0 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.16)';
      g.fillRect(bx - (phrase ? 1 : 0.5) * dpr, 0, (phrase ? 2 : 1) * dpr, main);
      if (b % 4 === 0 && b >= 0) { g.fillStyle = phrase ? '#ff3fb4' : 'rgba(244,236,255,.6)'; g.fillText(String(bar), bx + 3 * dpr, 11 * dpr); }
    }
    // cue + hot cues
    g.fillStyle = '#ffc44d'; var cx = W / 2 + (d.cuePos - now) * pxPerSec; g.fillRect(cx - dpr, 0, 2 * dpr, main);
    d.hot.forEach(function (h, k) { if (h === null || h === undefined) return; var hx = W / 2 + (h - now) * pxPerSec; g.fillStyle = id === 'A' ? '#ff3fb4' : '#7ff9ff'; g.fillRect(hx - dpr, main - 14 * dpr, 2 * dpr, 14 * dpr); g.fillText(String(k + 1), hx + 3 * dpr, main - 4 * dpr); });
    // playhead
    g.fillStyle = '#fff'; g.fillRect(W / 2 - dpr, 0, 2 * dpr, main);
    // overview of the whole track
    var dur = d.buffer.duration, n = w.low.length;
    for (x = 0; x < W; x += 2) { var j = Math.floor(x / W * n), v = Math.max(w.low[j], w.mid[j]) / 255; g.fillStyle = (x / W) < now / dur ? 'rgba(180,75,255,.75)' : 'rgba(180,75,255,.3)'; g.fillRect(x, main + ov / 2 - v * ov * 0.42, 2, v * ov * 0.84); }
    g.fillStyle = '#fff'; g.fillRect(now / dur * W - dpr, main, 2 * dpr, ov);
  }
  var lastTxt = {};
  function setTxt(idn, v) { if (lastTxt[idn] === v) return; lastTxt[idn] = v; var e = el(idn); if (e) e.textContent = v; }
  function drawReadouts() {
    ['A', 'B'].forEach(function (id) {
      var d = E.decks[id]; if (!d.track) return;
      setTxt('bpm' + id, d.bpm().toFixed(2)); setTxt('pitch' + id, pct(d.baseRate()) + (d.sync ? ' · SYNC' : ''));
      setTxt('time' + id, '−' + fmtTime((d.buffer.duration - d.time()) / (d.curRate || 1)));
      var p = el('play' + id); if (p) p.classList.toggle('on', d.playing);
      var s = el('sync' + id); if (s) s.classList.toggle('on', d.sync);
      var f = el('pfl' + id); if (f) f.classList.toggle('on', !!d.vals.pfl);
      var lv = el('lv' + id); if (lv) lv.style.height = Math.min(100, d.level() * 100) + '%';
    });
    var db = E.masterDb(), m = el('lvM'); setTxt('mdb', db < -90 ? '−∞ dB' : db.toFixed(1) + ' dB'); if (m) m.style.width = Math.max(0, Math.min(100, (db + 48) / 48 * 100)) + '%';
    // beatmatch helper text
    var A = E.decks.A, B = E.decks.B, gtxt = '';
    if (A.track && B.track && A.playing && B.playing) {
      var diff = A.bpm() - B.bpm(), ph = A.phaseTo(B), ms = ph * 60 / B.bpm() * 1000;
      gtxt = (Math.abs(diff) < 0.05 ? 'Tempo matched' : 'Deck ' + (diff > 0 ? 'A' : 'B') + ' is ' + Math.abs(diff).toFixed(2) + ' BPM faster') + ' · ' + (Math.abs(ms) < 12 ? 'beats lined up' : 'Deck A is ' + Math.abs(ms).toFixed(0) + ' ms ' + (ms > 0 ? 'ahead' : 'behind'));
    }
    setTxt('guide', gtxt);
  }
  function scheduleClicks() {
    ['A', 'B'].forEach(function (id) {
      var d = E.decks[id]; if (!metro[id] || !d.playing || !d.track) return;
      var t = E.now(), bp = d.beatPos(t), next = Math.ceil(bp), dt = (next - bp) * 60 / (d.track.bpm * d.curRate);
      if (dt < 0.1 && next !== lastClick[id]) {
        lastClick[id] = next;
        var o = E.ctx.createOscillator(), gn = E.ctx.createGain(), at = t + dt;
        o.frequency.value = next % 4 === 0 ? 1760 : 1175; gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(0.4, at + 0.002); gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
        o.connect(gn); gn.connect(E.out); o.start(at); o.stop(at + 0.06);
      }
    });
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    E.tick(); scheduleClicks();
    if (S.screen() === 'free') { drawWave('A'); drawWave('B'); drawReadouts(); if (ui.dirty) { ui.dirty = false; refreshHot(); } }
    var n = performance.now(); if (n - ledT > 90) { ledT = n; lights(); }
  }
  function refreshHot() {
    ['A', 'B'].forEach(function (id) { var d = E.decks[id]; document.querySelectorAll('[data-hot^="' + id + '."]').forEach(function (b) { var k = +b.getAttribute('data-hot').split('.')[1]; b.classList.toggle('set', d.hot[k] !== null && d.hot[k] !== undefined); }); });
    syncInputs();
  }

  // ---------- controller lights and the Beatmatch Guide ----------
  function send(key, bytes, v) { if (ledCache[key] === v) return; ledCache[key] = v; S.conn.send([bytes[0], bytes[1], v]); }
  function lights() {
    if (!S.conn.output || !E) return;
    var MAP = S.map, C = MAP.lights.colours, blink = Math.floor(performance.now() / 400) % 2;
    ['A', 'B'].forEach(function (id) {
      var d = E.decks[id], c = function (n) { return S.dec.control(id + '.' + n); }, o = E.other(d);
      send(id + 'play', c('play').led, d.playing ? 0x7F : d.track && blink ? 0x7F : 0);
      send(id + 'cue', c('cue').led, d.track && !d.playing && Math.abs(d.pos - d.cuePos) < 0.02 ? 0x7F : 0);
      send(id + 'sync', c('sync').led, d.sync ? 0x7F : 0);
      send(id + 'pfl', c('pfl').led, d.vals.pfl ? 0x7F : 0);
      send(id + 'mode1', c('mode1').led, 0x7F);
      for (var k = 0; k < 8; k++) { var set = d.hot[k] !== null && d.hot[k] !== undefined; send(id + 'pad' + k, c('pad.hotcue.' + (k + 1)).led, set ? (id === 'A' ? C.pink : C.cyan) : 0); }
      // Beatmatch Guide: only for a deck you're matching by hand (SYNC off), against the other playing deck.
      var G = MAP.lights.guide[id], tUp = 0, tDn = 0, tOk = 0, pL = 0, pR = 0, pOk = 0;
      if (!d.sync && d.playing && o.playing && d.track && o.track && guideOn()) {
        var diff = d.bpm() - o.bpm();
        if (Math.abs(diff) < 0.05) tOk = 0x7F; else if (diff > 0) tUp = 0x7F; else tDn = 0x7F;      // up arrow = move the fader up (slower)
        if (Math.abs(diff) < 0.5) { var ms = d.phaseTo(o) * 60 / o.bpm() * 1000; if (Math.abs(ms) < 12) pOk = 0x7F; else if (ms > 0) pL = 0x7F; else pR = 0x7F; }
      }
      send(id + 'tu', G.tempoUp, tUp); send(id + 'td', G.tempoDown, tDn); send(id + 'to', G.tempoOk, tOk);
      send(id + 'pl', G.phaseLeft, pL); send(id + 'pr', G.phaseRight, pR); send(id + 'po', G.phaseOk, pOk);
    });
  }
  function guideOn() { return settings.guide !== false; }

  // ---------- beat-grid editor ----------
  function drawGrid() {
    var s = el('gridSlot'); if (!s) return;
    if (!gridDeck || !E || !E.decks[gridDeck].track) { s.innerHTML = ''; return; }
    var d = E.decks[gridDeck], t = d.track;
    s.innerHTML = '<div class="gridpanel panel"><div class="row"><h3 class="grow">Beat grid · Deck ' + gridDeck + ' · ' + esc(t.name) + '</h3><button type="button" class="bbtn sm ghost" data-act="gridClose">Close</button></div>' +
      '<p class="small muted">Play the track with <b>Click on beats</b> on. The clicks should land exactly on the kicks, and the bright lines with bar numbers should start each bar. Scoring depends on this being right.</p>' +
      '<div class="row wrap"><span class="mono big">' + t.bpm.toFixed(2) + ' BPM</span><span class="mono muted">grid starts at ' + t.first.toFixed(3) + ' s</span></div>' +
      '<div class="row wrap"><b class="small">Move the grid:</b>' + [[-0.01, '10 ms earlier'], [-0.001, '1 ms earlier'], [0.001, '1 ms later'], [0.01, '10 ms later']].map(function (x) { return '<button type="button" class="bbtn sm" data-gshift="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row wrap"><b class="small">Bar 1:</b><button type="button" class="bbtn sm" data-gact="here">Set bar 1 at the playhead</button><button type="button" class="bbtn sm" data-gact="beatEarly">Downbeat one beat earlier</button><button type="button" class="bbtn sm" data-gact="beatLate">Downbeat one beat later</button></div>' +
      '<div class="row wrap"><b class="small">Tempo:</b><button type="button" class="bbtn sm" data-gact="half">Halve BPM</button><button type="button" class="bbtn sm" data-gact="double">Double BPM</button>' + [[-0.1, '−0.1'], [-0.01, '−0.01'], [0.01, '+0.01'], [0.1, '+0.1']].map(function (x) { return '<button type="button" class="bbtn sm" data-gbpm="' + x[0] + '">' + x[1] + ' BPM</button>'; }).join('') + '</div></div>';
  }
  function gridChange(fn) {
    var d = E.decks[gridDeck], t = d.track, beat = 60 / t.bpm;
    fn(t, beat, d);
    t.bpm = Math.round(t.bpm * 1000) / 1000; t.first = Math.round(t.first * 10000) / 10000;
    var it = lib.get(t.id); if (it) lib.update(it, { bpm: t.bpm, first: t.first });
    d.applyRate(); drawGrid();
  }

  // ---------- Library screen ----------
  function drawLibrary() {
    if (!E) { S.el('screen').innerHTML = '<h1>Library</h1><div class="startbox panel"><p class="muted">Your tracks live in this browser. Turn the sound on to open them (Chrome\'s rule).</p><button type="button" class="bbtn primary" data-act="start">Open my library</button></div>'; return; }
    var list = visible(), near = libFilter.near && lib.get(libFilter.near);
    S.el('screen').innerHTML = '<div class="row"><h1 class="grow">Library</h1><label class="bbtn primary filebtn">Add tracks from this computer<input type="file" id="addFiles" accept="audio/*" multiple hidden></label></div>' +
      '<p class="sub">BPM, beat grid and key are worked out once per track and saved. Key is shown in Camelot: neighbours on the wheel (8A with 7A, 9A or 8B) mix in key.</p><div id="analysing"></div>' +
      '<section class="panel"><div class="row wrap"><input type="search" placeholder="Search" data-f="q" value="' + esc(libFilter.q) + '"><select data-f="genre">' + GENRES.map(function (g) { return '<option value="' + g + '"' + (libFilter.genre === g ? ' selected' : '') + '>' + (g || 'Every genre') + '</option>'; }).join('') + '</select>' +
      '<select data-f="sort"><option value="name">Sort by name</option><option value="bpm"' + (libFilter.sort === 'bpm' ? ' selected' : '') + '>Sort by BPM</option><option value="key"' + (libFilter.sort === 'key' ? ' selected' : '') + '>Sort by key</option></select>' +
      (near ? '<span class="tag ok">Showing what mixes with ' + esc(near.name) + '</span><button type="button" class="bbtn sm ghost" data-act="nearOff">Show everything</button>' : '') + '</div>' +
      '<div class="tracks full">' + list.map(function (x, i) {
        return '<div class="trk' + (i === sel ? ' on' : '') + '" data-sel="' + i + '"><span class="tn grow">' + esc(x.name) + (x.loop ? ' <span class="tag">exact grid</span>' : x.edited ? ' <span class="tag ok">grid checked</span>' : '') + '</span>' +
          '<span class="tb mono">' + (x.analysed ? x.bpm.toFixed(2) : '…') + '</span><span class="tk mono">' + esc(x.camelot ? x.camelot + ' ' + x.key : '') + '</span>' +
          '<select data-genre="' + esc(x.id) + '"' + (x.loop ? ' disabled' : '') + '>' + GENRES.map(function (g) { return '<option value="' + g + '"' + (x.genre === g ? ' selected' : '') + '>' + (g || 'Genre?') + '</option>'; }).join('') + '</select>' +
          '<span class="tl mono">' + fmtTime(x.dur) + '</span><button type="button" class="bbtn sm ghost" data-near="' + esc(x.id) + '">What mixes with this</button>' + (x.own ? '<button type="button" class="bbtn sm ghost" data-del="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">Remove</button>' : '') + '</div>';
      }).join('') + '</div></section>';
    drawAnalysing();
  }

  // ---------- Sound settings ----------
  function drawSettings() {
    var mc = E ? E.ctx.destination.maxChannelCount : 0;
    var h = '<h1>Sound settings</h1><p class="sub">Where the sound goes, headphone cueing, crossfader and pitch.</p>';
    h += '<section class="panel"><h3>Headphone cue (PFL)</h3><p class="small">' + (E ? 'Your current output has <b>' + mc + ' channels</b>. ' : '') +
      'A browser can only send a separate headphone mix to the Inpulse 500 if Windows shows it as a 4-channel device. If it shows 2 channels, you can send the cue to another output instead (your PC\'s own headphone socket), or skip cueing and listen to the master.</p>' +
      [['master', 'Headphones hear the master (no separate cue)'], ['split', 'Inpulse 500 headphones (outputs 3-4, needs a 4-channel output)'], ['device', 'Send the cue to another sound device']].map(function (o) {
        var dis = o[0] === 'split' && E && mc < 4;
        return '<label class="radio' + (dis ? ' dis' : '') + '"><input type="radio" name="cue" value="' + o[0] + '"' + (settings.cueMode === o[0] ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + o[1] + (dis ? ' <span class="tiny muted">(this output has ' + mc + ' channels)</span>' : '') + '</label>';
      }).join('') +
      '<details class="small" style="margin-top:8px"><summary>How to make the Inpulse 500 a 4-channel output in Windows</summary><ol><li>Install the Hercules DJControl Inpulse 500 driver (from hercules.com, Support).</li><li>Windows Settings, System, Sound, More sound settings. Pick the Inpulse 500 under Playback, then Configure, and choose Quadraphonic.</li><li>Pick that output below, then choose "Inpulse 500 headphones". If it\'s still greyed out, Chrome can\'t see 4 channels and the second-device option is the way.</li></ol></details></section>';
    h += '<section class="panel"><h3>Output devices</h3><div class="row wrap"><label>Master out <select id="outSel"><option value="">Windows default</option></select></label><label>Cue to <select id="cueSel"><option value="">Pick a device</option></select></label><button type="button" class="bbtn sm" data-act="names">Show device names</button></div>' +
      '<p class="tiny muted">Chrome only shows device names after you allow the microphone once (nothing is recorded).</p><div class="row wrap"><button type="button" class="bbtn sm" data-act="beepM">Play a test beep on the master</button><button type="button" class="bbtn sm" data-act="beepC">Play a test beep on the headphones</button></div></section>';
    h += '<section class="panel"><h3>Mixer</h3><label class="radio"><input type="checkbox" id="xfLock"' + (settings.xfLocked ? ' checked' : '') + '> Lock the crossfader to the centre (recommended: mix with volume faders and EQs)</label>' +
      '<label class="radio">Pitch fader range <select id="pRange"><option value="0.08"' + (settings.pitchRange === 0.08 ? ' selected' : '') + '>±8%</option><option value="0.16"' + (settings.pitchRange === 0.16 ? ' selected' : '') + '>±16%</option><option value="0.06"' + (settings.pitchRange === 0.06 ? ' selected' : '') + '>±6%</option></select></label>' +
      '<label class="radio"><input type="checkbox" id="pInv"' + (settings.invertPitch ? ' checked' : '') + '> Flip pitch faders (top faster)</label>' +
      '<label class="radio"><input type="checkbox" id="guideOn"' + (settings.guide !== false ? ' checked' : '') + '> Beatmatch Guide lights on the controller in Free mix</label></section>';
    if (!E) h += '<div class="startbox panel"><button type="button" class="bbtn primary" data-act="start">Turn the sound on to see your devices</button></div>';
    S.el('screen').innerHTML = h;
    fillDevices(false);
  }
  function fillDevices(ask) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    var p = ask ? navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); }) : Promise.resolve();
    p.then(function () { return navigator.mediaDevices.enumerateDevices(); }).then(function (list) {
      var outs = list.filter(function (d) { return d.kind === 'audiooutput'; });
      ['outSel', 'cueSel'].forEach(function (sid) {
        var s = el(sid); if (!s) return; var cur = sid === 'outSel' ? settings.outId : settings.cueId;
        s.innerHTML = '<option value="">' + (sid === 'outSel' ? 'Windows default' : 'Pick a device') + '</option>' + outs.filter(function (d) { return d.deviceId !== 'default'; }).map(function (d, i) { return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' + esc(d.label || 'Output ' + (i + 1)) + '</option>'; }).join('');
      });
    }, function () { S.toast('Chrome didn\'t share device names. You can still pick by number.'); });
  }
  function beep(toCue) {
    if (!E) return start().then(function () { beep(toCue); });
    var o = E.ctx.createOscillator(), g = E.ctx.createGain(), t = E.now();
    o.frequency.value = toCue ? 660 : 440; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(toCue ? E.cueBus : E.out); o.start(t); o.stop(t + 0.65);
    if (toCue && E.cueMode === 'master') S.toast('No separate cue is set up, so that beep went nowhere. Pick a headphone option above.');
  }
  function saveSettings() { S.save('settings', settings); applySettings(); }

  // ---------- input from the page ----------
  document.addEventListener('pointerdown', function (ev) {
    var b = ev.target.closest('[data-b]'); if (!b || !S) return;
    ev.preventDefault();
    if (!E) return start();
    var id = b.getAttribute('data-b');
    control({ id: id, kind: 'button', down: true });
    var up = function () { control({ id: id, kind: 'button', down: false }); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointerup', up);
  });
  document.addEventListener('input', function (ev) {
    var r = ev.target.closest && ev.target.closest('[data-r]'); if (r && S) { var id = r.getAttribute('data-r'); S.values[id] = +r.value; control({ id: id, value: +r.value }); return; }
    var f = ev.target.getAttribute && ev.target.getAttribute('data-f'); if (f === 'q') { libFilter.q = ev.target.value; sel = 0; var box = document.querySelector('.tracks'); if (box) box.outerHTML = S.screen() === 'free' ? trackRows(visible(), true) : box.outerHTML; if (S.screen() === 'library') drawLibraryKeepFocus(); }
  });
  function drawLibraryKeepFocus() { var v = libFilter.q; drawLibrary(); var i = document.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!S) return;
    var f = t.getAttribute('data-f'); if (f === 'sort' || f === 'genre') { libFilter[f] = t.value; sel = 0; return refreshScreen(); }
    if (t.getAttribute('data-genre')) { var it = lib.get(t.getAttribute('data-genre')); if (it) lib.update(it, { genre: t.value }); return; }
    if (t.id === 'addFiles' && t.files.length) { S.toast('Adding ' + t.files.length + ' track' + (t.files.length === 1 ? '' : 's') + '…'); return lib.addFiles(t.files).then(function () { drawLibrary(); autoAnalyse(); }); }
    if (t.name === 'cue') { settings.cueMode = t.value; saveSettings(); if (t.value === 'device' && !settings.cueId) S.toast('Now pick the device under "Cue to".'); return; }
    if (t.id === 'outSel') { settings.outId = t.value; saveSettings(); return; }
    if (t.id === 'cueSel') { settings.cueId = t.value; if (settings.cueMode !== 'device') settings.cueMode = 'device'; saveSettings(); drawSettings(); return; }
    if (t.id === 'xfLock') { settings.xfLocked = t.checked; saveSettings(); return; }
    if (t.id === 'pRange') { settings.pitchRange = +t.value; saveSettings(); return; }
    if (t.id === 'pInv') { settings.invertPitch = t.checked; saveSettings(); return; }
    if (t.id === 'guideOn') { settings.guide = t.checked; saveSettings(); return; }
  });
  document.addEventListener('contextmenu', function (ev) { var h = ev.target.closest('[data-hot]'); if (!h || !E) return; ev.preventDefault(); var p = h.getAttribute('data-hot').split('.'), d = E.decks[p[0]]; d.hotcue(+p[1], true); saveHot(d); ui.dirty = true; });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, [data-sel]'); if (!t || !S) return;
    var d = t.dataset;
    if (d.act === 'start') return start().then(refreshScreen);
    if (d.sel !== undefined && !ev.target.closest('button, select')) { sel = +d.sel; return moveSel(0); }
    if (d.load) return loadTo(d.load, lib.get(d.item));
    if (d.hot) { var p = d.hot.split('.'), dk = E.decks[p[0]], r = dk.hotcue(+p[1], false); if (r === 'set') saveHot(dk); ui.dirty = true; return; }
    if (d.nudge) { var q = d.nudge.split('.'); E.decks[q[0]].jog(+q[1] * 14); return; }
    if (d.metro) { metro[d.metro] = !metro[d.metro]; t.classList.toggle('on', metro[d.metro]); return; }
    if (d.grid) { gridDeck = gridDeck === d.grid ? '' : d.grid; return drawGrid(); }
    if (d.act === 'gridClose') { gridDeck = ''; return drawGrid(); }
    if (d.gshift) return gridChange(function (tr) { tr.first += +d.gshift; });
    if (d.gbpm) return gridChange(function (tr, beat, dk) { var anchor = dk.time(), k = (anchor - tr.first) / beat; tr.bpm += +d.gbpm; tr.first = anchor - k * 60 / tr.bpm; });
    if (d.gact) return gridChange(function (tr, beat, dk) {
      if (d.gact === 'here') tr.first = dk.time();
      if (d.gact === 'beatEarly') tr.first -= beat;
      if (d.gact === 'beatLate') tr.first += beat;
      if (d.gact === 'half') tr.bpm /= 2;
      if (d.gact === 'double') tr.bpm *= 2;
    });
    if (d.near) { libFilter.near = d.near; sel = 0; return drawLibrary(); }
    if (d.act === 'nearOff') { libFilter.near = ''; return drawLibrary(); }
    if (d.del) { var it = lib.get(d.del); if (!it || !confirm('Remove ' + it.name + ' from this computer\'s library?')) return; return lib.remove(it).then(drawLibrary); }
    if (d.act === 'names') return fillDevices(true);
    if (d.act === 'beepM') return beep(false);
    if (d.act === 'beepC') return beep(true);
  });
  document.addEventListener('keyup', function (ev) {
    if (!E || !S || ev.target.closest('input, textarea, select')) return;
    var k = ev.key.toLowerCase(); ['A', 'B'].forEach(function (id) { if ((S.map.keys[id + '.cue'] || '').toLowerCase() === k) E.decks[id].cueUp(); });
  });

  window.BoothPlay = {
    init: function (shell) {
      S = shell;
      settings = Object.assign({ xfLocked: true, pitchRange: 0.08, invertPitch: false, cueMode: 'master', outId: '', cueId: '', guide: true }, S.load('settings', {}));
    },
    screens: { free: function () { drawFree(); if (E) autoAnalyse(); }, library: drawLibrary, settings: drawSettings },
    control: control,
    key: key,
    leave: function (next) { if (next !== 'free' && gridDeck) gridDeck = ''; },
    engine: function () { return E; }
  };
})();
