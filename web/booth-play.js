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
  var libState = { persisted: null, lastAdd: null };
  /** A plain-English banner when the library can't be read (nothing is ever deleted). */
  function problemHtml() {
    if (!lib) return '';
    var st = BoothLibrary.status, p = lib.problem;
    if (st.updated) return '<div class="alert">Booth was updated in another tab. <b>Reload this page</b> to keep using your library. Nothing is lost.</div>';
    if (p === 'blocked' || st.blocked) return '<div class="alert"><b>Your library is locked by another Booth tab</b> that\'s still running an older version. Close your other Booth tabs (or reload them) and your tracks come straight back. Nothing has been deleted. <button type="button" class="bbtn sm" data-act="relist">Try again</button></div>';
    if (p) return '<div class="alert"><b>Some of your library couldn\'t be read.</b> ' + esc(p) + ' Nothing has been deleted. Reload the page, and if it keeps happening use Sound settings, Storage check. <button type="button" class="bbtn sm" data-act="relist">Try again</button></div>';
    return '';
  }
  function drawProblem() { var b = el('libProblem'); if (b) b.innerHTML = problemHtml(); }
  var settings = null, padMode = { A: 'hotcue', B: 'hotcue' }, lastLoop = { A: '', B: '' };
  var LOOP_SIZES = [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32], JUMPS = [-1, 1, -2, 2, -4, 4, -8, 8];
  var PAD_NAMES = { hotcue: 'Hot cue', loop: 'Loop', slicer: 'Slicer', slicerloop: 'Slicer loop', sampler: 'Sampler', beatjump: 'Beatjump', toneplay: 'Toneplay', fx: 'FX' };
  var FX_PADS = [['echo', 0.5, 'Echo ½'], ['echo', 0.75, 'Echo ¾'], ['echo', 1, 'Echo 1'], ['echo', 2, 'Echo 2'], ['reverb', 0, 'Reverb']];
  var SAMPLES = ['Air horn', 'Siren', 'Riser', 'Laser', 'Clap', 'Kick', 'Crash', 'Sub drop'];
  function beatsText(b) { return b === 0.25 ? '¼ beat' : b === 0.5 ? '½ beat' : b === 0.125 ? '⅛ beat' : b + ' beat' + (b === 1 ? '' : 's'); }
  // what the current game mode wants: hidden BPMs, hidden waveforms, guide lights, a per-frame hook
  var view = { hideBpm: {}, hideWaves: false, helper: true, guide: 'auto', guideDeck: '', frame: null, always: null, onLoad: null, onControl: null };
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
    BoothLibrary.persist().then(function (ok) { libState.persisted = ok; });
    BoothLibrary.onStatus(function (what) {
      if (what === 'unblocked') lib.list().then(function () { refreshScreen(); autoAnalyse(); });
      drawProblem();
    });
    E.resume();                       // sound may wait for a click; the library doesn't
    return lib.list().then(function () { refreshScreen(); drawProblem(); autoAnalyse(); });
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
  function refreshScreen() { var s = S.screen(); if (s === 'free') drawFree(); else if (s === 'library') drawLibrary(); else if (s === 'settings') drawSettings(); }

  // ---------- one path for every control ----------
  function control(e) {
    if (!e || !e.id) return;
    if (view.onControl && E) { try { view.onControl(e); } catch (err) { console.error(err); } }
    if (!E) { if (e.kind === 'button' && e.down && S.screen() === 'free') S.toast('Click "Turn the sound on" first: Chrome needs one click before it plays sound.'); return; }   // positions are kept in S.values and applied when the sound starts
    var m = /^([AB])\.(.+)$/.exec(e.id);
    if (!m) {
      if (e.id === 'xfader') { E.setXfader(e.value); if (E.xfLocked && S.screen() === 'free' && Math.abs(e.value - 0.5) > 0.2) hint('The crossfader is locked to the middle. Mix with the volume faders and EQs, or unlock it in Sound settings.'); }
      if (e.id === 'browse' && e.delta) moveSel(e.delta > 0 ? 1 : -1);
      if (e.id === 'browsePush' && e.down) { var free = !E.decks.A.playing ? 'A' : !E.decks.B.playing ? 'B' : ''; if (free) loadTo(free).catch(function () {}); else S.toast('Both decks are playing. Stop one first.'); }
      return;
    }
    var id = m[1], n = m[2], d = E.decks[id];
    if (/^(volume|trim|eqLow|eqMid|eqHigh|filter)$/.test(n)) { if (e.value !== undefined) d.set(n, e.value); return; }
    if (n === 'pitch') { if (e.value !== undefined) { d.pitchFader(settings.invertPitch ? 1 - e.value : e.value); if (d.sync && d.track && S.screen() === 'free') hint('SYNC is on for Deck ' + id + ', so the pitch fader is ignored. Press SYNC to turn it off and beatmatch by hand.'); } return; }
    if (n === 'jogEdge' || n === 'jogTop') { d.jog(e.delta); return; }
    if (n === 'loopKnob') { var sz = e.delta < 0 ? d.loopHalve() : d.loopDouble(); hint('Deck ' + id + (d.loop ? ' loop: ' : ' next loop: ') + beatsText(sz)); ui.dirty = true; return; }
    if (n === 'jogTouch') { d.touching = e.down; return; }
    if (n === 'shift') { shift[id] = e.down; return; }
    var pm = /^pad\.([a-z]+?)(Shift)?\.(\d)$/.exec(n);
    if (pm) { if (padMode[id] !== pm[1]) setPadMode(id, pm[1]); pad(d, id, pm[1], !!pm[2] || shift[id], +pm[3] - 1, e.down); ui.dirty = true; return; }
    if (e.kind === 'button' && !e.down) { if (n === 'cue') d.cueUp(); return; }
    if (n === 'play') { if (!d.track) return S.toast('Load a track onto Deck ' + id + ' first (LOAD ' + id + ').'); if (d.playing) d.stop(); else d.play(); }
    else if (n === 'cue') d.cueDown();
    else if (n === 'sync') { d.setSync(!d.sync); S.toast('Deck ' + id + ' SYNC ' + (d.sync ? 'on: it follows the other deck' : 'off: match it with the pitch fader and jog wheel')); }
    else if (n === 'pfl') d.set('pfl', d.vals.pfl ? 0 : 1);
    else if (n === 'load') loadTo(id).catch(function () {});
    else if (/^mode\d$/.test(n)) { setPadMode(id, S.map.modeBank[+n.slice(4) - 1]); }
    else if (n === 'loopIn') { var li = d.loopInBtn(); if (li === 'in') S.toast('Deck ' + id + ' loop starts here. Press LOOP OUT to close it.'); }
    else if (n === 'loopOut') { var lo = d.loopOutBtn(); if (lo === 'noin') S.toast('Press LOOP IN first, then LOOP OUT where the loop should end.'); else if (typeof lo === 'number') S.toast('Deck ' + id + ' looping ' + beatsText(lo) + '. LOOP OUT again to leave it.'); }
    else if (n === 'loopPush') { if (d.loop) d.setLoop(null); else if (d.track && d.playing) { d.beatLoop(d.loopSize); S.toast('Deck ' + id + ' looping ' + beatsText(d.loopSize) + '.'); } }
    ui.dirty = true;
  }
  function key(id, dir, _v, ts) {
    if (!E) { if (S.screen() === 'free') start(); return; }
    var c = S.dec.control(id) || {};
    if (/nudge/.test(id)) return E.decks[id[0]].jog(dir * 14);
    if (c.kind === 'fader' || c.kind === 'knob' || c.kind === 'center') {
      var step = /pitch/.test(id) ? 0.00625 : 0.05, cur = S.values[id] === undefined ? (c.kind === 'center' || /pitch|trim/.test(id) ? 0.5 : 0) : S.values[id];
      S.values[id] = Math.max(0, Math.min(1, cur + dir * step));
      control({ id: id, kind: c.kind, value: S.values[id], ts: ts }); return syncInputs();
    }
    control({ id: id, kind: 'button', down: true, ts: ts });
    if (/\.cue$/.test(id)) setTimeout(function () { control({ id: id, kind: 'button', down: false }); }, 250);
  }
  function setPadMode(id, bank) {
    padMode[id] = bank;
    if (bank === 'toneplay') S.toast('Toneplay isn\'t in Booth yet. Hot cue, Loop, Slicer, Sampler, FX and Beatjump work.');
    var row = el('pm' + id); if (row) row.querySelectorAll('[data-pm]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-pm') === id + '.' + bank); });
    ui.dirty = true;
  }
  /** One pad press or release, in whichever mode the pads are in. */
  function pad(d, id, bank, sh, k, down) {
    if (!d.track && bank !== 'sampler') { if (down) S.toast('Load a track onto Deck ' + id + ' first.'); return; }
    if (bank === 'hotcue') { if (!down) return; var r = d.hotcue(k, sh); if (r === 'set' || r === 'deleted') saveHot(d); if (r === 'deleted') S.toast('Hot cue ' + (k + 1) + ' deleted'); return; }
    if (bank === 'loop') {
      if (sh) return d.roll(LOOP_SIZES[k], down);                                  // SHIFT: loop roll, the track carries on underneath
      if (!down) return; if (!d.playing) return S.toast('Play Deck ' + id + ' first, then press a loop pad.');
      var res = d.beatLoop(LOOP_SIZES[k]); hint(res === 'exit' ? 'Deck ' + id + ' loop off' : 'Deck ' + id + ' looping ' + beatsText(LOOP_SIZES[k]));
      return;
    }
    if (bank === 'slicer' || bank === 'slicerloop') return d.slice(k, down);
    if (bank === 'beatjump') { if (down) d.beatJump(JUMPS[k] * (sh ? 4 : 1)); return; }
    if (bank === 'sampler') { if (down) playSample(k); return; }
    if (bank === 'fx') {
      var f = FX_PADS[k]; if (!f) { if (down) S.toast('FX pads 1 to 5: Echo ½, ¾, 1, 2 beats and Reverb.'); return; }
      var same = d.fx && d.fx.kind === f[0] && d.fx.beats === f[1];
      if (sh) { d.setFx(down ? f[0] : null, f[1]); return; }                      // SHIFT: on only while held
      if (!down) return;
      d.setFx(same ? null : f[0], f[1]); hint('Deck ' + id + (same ? ' FX off (the tail rings out)' : ' ' + f[2] + ' on'));
      return;
    }
    if (down) S.toast(PAD_NAMES[bank] + ' isn\'t in Booth yet. Pick Hot cue, Loop, Slicer, Sampler, FX or Beatjump.');
  }
  // ---------- sampler: 8 one-shots made on the fly (in time with the master tempo) ----------
  function playSample(k) {
    var c = E.ctx, t = E.now() + 0.01, out = c.createGain(), A = E.decks.A, B = E.decks.B, lead = A.playing ? A : B.playing ? B : null, beat = 60 / (lead && lead.track ? lead.bpm() : 128);
    out.gain.value = 0.5; out.connect(E.master);
    function osc(type, f0, f1, dur, vol, at) { var o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, at || t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, (at || t) + dur); g.gain.setValueAtTime(vol, at || t); g.gain.exponentialRampToValueAtTime(0.0001, (at || t) + dur); o.connect(g); g.connect(out); o.start(at || t); o.stop((at || t) + dur + 0.02); return o; }
    function noise(dur, vol, hp, at, sweep) { var n = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), ch = n.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = n; f.type = 'highpass'; f.frequency.setValueAtTime(hp, at || t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, (at || t) + dur); g.gain.setValueAtTime(sweep ? 0.0001 : vol, at || t); if (sweep) g.gain.exponentialRampToValueAtTime(vol, (at || t) + dur); else g.gain.exponentialRampToValueAtTime(0.0001, (at || t) + dur); s.connect(f); f.connect(g); g.connect(out); s.start(at || t); }
    if (k === 0) [0, 0.18, 0.36].forEach(function (d0) { [233, 294, 349].forEach(function (f) { osc('sawtooth', f, 0, 0.16, 0.18, t + d0); }); });
    else if (k === 1) { var o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain(); o.type = 'square'; o.frequency.value = 700; l.frequency.value = 4; lg.gain.value = 250; l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.12, t); g.gain.setValueAtTime(0.12, t + beat * 4 - 0.1); g.gain.linearRampToValueAtTime(0, t + beat * 4); o.connect(g); g.connect(out); o.start(t); l.start(t); o.stop(t + beat * 4); l.stop(t + beat * 4); }
    else if (k === 2) noise(beat * 8, 0.35, 300, t, 9000);
    else if (k === 3) osc('square', 2400, 120, 0.35, 0.18);
    else if (k === 4) [0, 0.012, 0.024].forEach(function (d0) { noise(0.09, 0.5, 900, t + d0); });
    else if (k === 5) osc('sine', 150, 45, 0.4, 0.9);
    else if (k === 6) noise(2.2, 0.35, 4000, t);
    else if (k === 7) osc('sine', 90, 28, 1.6, 0.9);
    hint('Sampler: ' + SAMPLES[k]);
  }
  /** Which moment of the music you were hearing when something happened (performance time in ms), in audio-clock seconds. */
  function heardAt(ts) {
    var c = E.ctx, now = performance.now(); ts = ts || now;
    try { if (c.getOutputTimestamp) { var o = c.getOutputTimestamp(); if (o.performanceTime) return o.contextTime + (ts - o.performanceTime) / 1000; } } catch (e) {}
    return c.currentTime - (c.outputLatency || 0) - (c.baseLatency || 0) - (now - ts) / 1000;
  }
  function saveHot(d) { var it = lib && lib.get(d.track.id); if (it) lib.update(it, { hot: d.hot.slice() }); }
  var hintT = 0, lastHint = '';
  function hint(msg) { if (msg === lastHint && Date.now() - hintT < 8000) return; lastHint = msg; hintT = Date.now(); S.toast(msg); }

  function loadTo(id, item, force) {
    if (!E) return start().then(function () { return loadTo(id, item, force); });
    item = item || visible()[sel]; if (!item) { S.toast('Pick a track in the list first.'); return Promise.reject(new Error('none')); }
    var d = E.decks[id];
    if (d.playing && d.vals.volume > 0.1 && !force) { S.toast('Deck ' + id + ' is playing out loud. Bring its volume down or stop it before loading.'); return Promise.reject(new Error('busy')); }
    var go = item.analysed ? Promise.resolve(item) : (S.toast('Analysing ' + item.name + ' first…'), lib.analyseOne(item));
    return go.then(function () { return lib.buffer(item); }).then(function (buf) {
      d.load({ id: item.id, name: item.name, bpm: item.bpm, first: item.first, waves: item.waves, key: item.key, camelot: item.camelot, hot: item.hot }, buf);
      S.toast(item.name + ' on Deck ' + id + ' · ' + item.bpm + ' BPM' + (item.camelot ? ' · ' + item.camelot : ''));
      ui.dirty = true; if (S.screen() === 'free') drawFree();
      if (view.onLoad) view.onLoad(id, item);
      return d;
    }, function (e) { S.toast(e.message); throw e; });
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
    if (!E) return '<span class="tmx"></span>';
    var out = [];
    ['A', 'B'].forEach(function (id) {
      var d = E.decks[id]; if (!d.track || d.track.id === item.id || !item.bpm) return;
      var r = item.bpm / d.bpm(); if (r < 0.94 || r > 1.06) return;
      if (item.camelot && d.track.camelot && !BoothDSP.camelotFriends(item.camelot, d.track.camelot)) return;
      out.push(id);
    });
    return '<span class="tmx">' + (out.length ? '<span class="tag ok">Mixes with ' + out.join(' and ') + '</span>' : '') + '</span>';
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
      '<div class="pm row wrap" id="pm' + id + '">' + ['hotcue', 'loop', 'slicer', 'sampler', 'fx', 'beatjump'].map(function (b) { return '<button type="button" class="bbtn sm ghost' + (padMode[id] === b ? ' on' : '') + '" data-pm="' + id + '.' + b + '">' + PAD_NAMES[b] + '</button>'; }).join('') + '</div>' +
      '<div class="hot" id="pads' + id + '">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (k) { return '<button type="button" class="hc" data-hot="' + id + '.' + k + '"></button>'; }).join('') + '</div>' +
      '<div class="row wrap loops"><button type="button" class="bbtn sm" data-b="' + id + '.loopIn" id="li' + id + '">Loop in</button><button type="button" class="bbtn sm" data-b="' + id + '.loopOut" id="lo' + id + '">Loop out</button>' +
      '<button type="button" class="bbtn sm ghost" data-lsz="' + id + '.-1" aria-label="Halve the loop">½×</button><span class="mono small" id="lsz' + id + '">4 beats</span><button type="button" class="bbtn sm ghost" data-lsz="' + id + '.1" aria-label="Double the loop">2×</button><button type="button" class="bbtn sm" data-b="' + id + '.loopPush" id="lp' + id + '">Loop on / off</button></div>' +
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
    var h = (window.BoothGame ? BoothGame.freeTop() : '') + '<div id="libProblem">' + problemHtml() + '</div><div id="analysing"></div>';
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
    if (view.hideWaves && S.screen() === 'play') { g.fillStyle = '#6f5f8f'; g.font = (14 * (window.devicePixelRatio || 1)) + 'px Inter, sans-serif'; g.fillText('Deck ' + id + ': waveforms are off. Use your ears.', 16, main / 2); return; }
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
    // loop
    if (d.loop) { var lx0 = W / 2 + (d.loop.start - now) * pxPerSec, lx1 = W / 2 + (d.loop.end - now) * pxPerSec; g.fillStyle = 'rgba(93,255,168,.16)'; g.fillRect(lx0, 0, lx1 - lx0, main); g.fillStyle = '#5dffa8'; g.fillRect(lx0, 0, 2 * dpr, main); g.fillRect(lx1 - 2 * dpr, 0, 2 * dpr, main); }
    else if (d.loopIn !== null && d.loopIn !== undefined) { g.fillStyle = '#5dffa8'; g.fillRect(W / 2 + (d.loopIn - now) * pxPerSec - dpr, 0, 2 * dpr, main); }
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
  var lastTxt = {}, frameN = 0;
  function setTxt(idn, v) { if (lastTxt[idn] === v) return; lastTxt[idn] = v; var e = el(idn); if (e) e.textContent = v; }
  function drawReadouts() {
    ['A', 'B'].forEach(function (id) {
      var d = E.decks[id]; if (!d.track) return;
      var hid = view.hideBpm[id] && S.screen() === 'play';
      setTxt('bpm' + id, hid ? '???' : d.bpm().toFixed(2)); setTxt('pitch' + id, hid ? 'hidden' : pct(d.baseRate()) + (d.sync ? ' · SYNC' : ''));
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
    if (S.screen() === 'play' && !view.helper) gtxt = '';
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
    var sc = S.screen();
    if (sc === 'free' || sc === 'play') { drawWave('A'); drawWave('B'); drawReadouts(); if (ui.dirty || (frameN++ % 6 === 0)) { ui.dirty = false; refreshHot(); } }
    if (view.frame && sc === 'play') { try { view.frame(); } catch (err) { console.error(err); } }
    if (view.always) { try { view.always(sc); } catch (err) { console.error(err); } }
    var n = performance.now(); if (n - ledT > 90) { ledT = n; lights(); }
  }
  function padLabel(id, k) {
    var d = E.decks[id], m = padMode[id];
    if (m === 'hotcue') return { t: d.hot[k] !== null && d.hot[k] !== undefined ? 'Cue ' + (k + 1) : '+ ' + (k + 1), on: d.hot[k] !== null && d.hot[k] !== undefined, tip: 'Hot cue ' + (k + 1) + ': press to set or jump. SHIFT + pad (or right-click) deletes.' };
    if (m === 'loop') return { t: beatsText(LOOP_SIZES[k]).replace(' beats', '').replace(' beat', ''), on: !!d.loop && Math.abs(d.loopLen() - LOOP_SIZES[k]) < 1e-6, tip: 'Loop ' + beatsText(LOOP_SIZES[k]) + '. SHIFT + pad: loop roll (the track carries on underneath).' };
    if (m === 'slicer' || m === 'slicerloop') return { t: 'Slice ' + (k + 1), on: d.track && d.playing && d.sliceIndex() === k, tip: 'Plays slice ' + (k + 1) + ' of the 8 beats you\'re in, while held.' };
    if (m === 'beatjump') return { t: (JUMPS[k] > 0 ? '+' : '−') + Math.abs(JUMPS[k]), on: false, tip: 'Jump ' + Math.abs(JUMPS[k]) + ' beat' + (Math.abs(JUMPS[k]) === 1 ? '' : 's') + ' ' + (JUMPS[k] > 0 ? 'forward' : 'back') + '. With SHIFT: 4× as far.' };
    if (m === 'sampler') return { t: SAMPLES[k], on: false, tip: 'Plays the ' + SAMPLES[k] + ' sample.' };
    if (m === 'fx') { var f = FX_PADS[k]; return f ? { t: f[2], on: !!(d.fx && d.fx.kind === f[0] && d.fx.beats === f[1]), tip: f[2] + ': press to turn on or off. SHIFT + pad: only while held.' } : { t: '–', on: false, tip: '' }; }
    return { t: '–', on: false, tip: '' };
  }
  function refreshHot() {
    ['A', 'B'].forEach(function (id) {
      document.querySelectorAll('[data-hot^="' + id + '."]').forEach(function (b) { var k = +b.getAttribute('data-hot').split('.')[1], L = padLabel(id, k); if (b.textContent !== L.t) b.textContent = L.t; b.classList.toggle('set', L.on); b.title = L.tip; b.classList.toggle('small', L.t.length > 6); });
      var d = E.decks[id], ls = el('lsz' + id); if (ls) ls.textContent = d.loop ? 'looping ' + beatsText(+d.loopLen().toFixed(3)) : 'next: ' + beatsText(d.loopSize);
      ['li', 'lo', 'lp'].forEach(function (p) { var b = el(p + id); if (b) b.classList.toggle('on', !!d.loop || (p === 'li' && d.loopIn !== null && d.loopIn !== undefined && !d.loop && false)); });
    });
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
      var bank = padMode[id], mine = id === 'A' ? C.pink : C.cyan;
      for (var mi = 1; mi <= 8; mi++) send(id + 'mode' + mi, c('mode' + mi).led, S.map.modeBank[mi - 1] === bank ? 0x7F : 0);
      send(id + 'li', c('loopIn').led, d.loop || (d.loopIn !== null && d.loopIn !== undefined && blink) ? 0x7F : 0);
      send(id + 'lo', c('loopOut').led, d.loop ? 0x7F : 0);
      var pc = c('pad.' + bank + '.1');
      for (var k = 0; k < 8; k++) {
        var L = padLabel(id, k), col = bank === 'hotcue' ? (L.on ? mine : 0) : bank === 'loop' ? (L.on ? mine : C.dimBlue) : bank === 'slicer' || bank === 'slicerloop' ? (L.on ? C.white : C.dimCyan) : bank === 'beatjump' ? (JUMPS[k] > 0 ? C.dimGreen : C.dimRed) : bank === 'sampler' ? C.dimGreen : bank === 'fx' ? (k < 5 ? (L.on ? C.orange : C.dimRed) : 0) : 0;
        if (pc) send(id + 'pad' + bank + k, c('pad.' + bank + '.' + (k + 1)).led, col);
      }
      // Beatmatch Guide: only for a deck you're matching by hand (SYNC off), against the other playing deck.
      var G = MAP.lights.guide[id], tUp = 0, tDn = 0, tOk = 0, pL = 0, pR = 0, pOk = 0, onlyDeck = S.screen() === 'play' && view.guideDeck;
      if ((!onlyDeck || onlyDeck === id) && !d.sync && d.playing && o.playing && d.track && o.track && guideOn()) {
        var diff = d.bpm() - o.bpm();
        if (Math.abs(diff) < 0.05) tOk = 0x7F; else if (diff > 0) tUp = 0x7F; else tDn = 0x7F;      // up arrow = move the fader up (slower)
        if (Math.abs(diff) < 0.5) { var ms = d.phaseTo(o) * 60 / o.bpm() * 1000; if (Math.abs(ms) < 12) pOk = 0x7F; else if (ms > 0) pL = 0x7F; else pR = 0x7F; }
      }
      send(id + 'tu', G.tempoUp, tUp); send(id + 'td', G.tempoDown, tDn); send(id + 'to', G.tempoOk, tOk);
      send(id + 'pl', G.phaseLeft, pL); send(id + 'pr', G.phaseRight, pR); send(id + 'po', G.phaseOk, pOk);
    });
  }
  function guideOn() { return S.screen() === 'play' ? view.guide !== 'off' : settings.guide !== false; }

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
      '<div id="libProblem">' + problemHtml() + '</div>' + addResultHtml() +
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
    h += '<section class="panel"><h3>Your library</h3><p class="small muted" style="margin:0 0 10px">Your tracks are stored in this browser on this computer. A backup file holds every track with its beat grid, key, genre and hot cues.</p>' +
      '<div class="row wrap"><button type="button" class="bbtn primary" data-act="exportLib">Export library backup</button><label class="bbtn filebtn">Import library backup<input type="file" id="importLib" accept=".boothlib,application/octet-stream" hidden></label><button type="button" class="bbtn" data-act="persist">Keep my library safe</button><button type="button" class="bbtn ghost" data-act="diag">Storage check</button></div><div id="diagOut" class="small" style="margin-top:10px"></div></section>';
    if (!E) h += '<div class="startbox panel"><button type="button" class="bbtn primary" data-act="start">Turn the sound on to see your devices and library</button></div>';
    S.el('screen').innerHTML = h;
    fillDevices(false);
    if (E) runDiag();
  }
  function mb(n) { return n === null || n === undefined ? '?' : n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : Math.round(n / 1e6) + ' MB'; }
  function runDiag() {
    var o = el('diagOut'); if (!o || !lib) return; o.textContent = 'Checking…';
    lib.diagnose().then(function (d) {
      o.innerHTML = '<div>Tracks stored: <b>' + (d.tracks === null ? 'couldn\'t read (' + esc(d.tracksError || '') + ')' : d.tracks) + '</b> · analysed: <b>' + (d.analysis === null ? 'couldn\'t read (' + esc(d.analysisError || '') + ')' : d.analysis) + '</b> · recordings: ' + (d.mixes === null ? '–' : d.mixes) + '</div>' +
        '<div>Space used: ' + mb(d.usage) + ' of ' + mb(d.quota) + ' · ' + (d.persisted ? '<span style="color:var(--green)">Protected: Chrome won\'t clear it on its own</span>' : '<span style="color:var(--amber)">Not protected yet: press Keep my library safe</span>') + '</div>' +
        (d.blocked ? '<div style="color:var(--amber)">Another Booth tab is holding the library open. Close or reload your other Booth tabs.</div>' : '');
    });
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
    var hp = ev.target.closest('[data-hot]');
    if (hp && S && E && ev.button === 0) {
      ev.preventDefault();
      var q = hp.getAttribute('data-hot').split('.'), dk = E.decks[q[0]], k = +q[1];
      var bankNow = padMode[q[0]], padId = q[0] + '.pad.' + bankNow + (ev.shiftKey ? 'Shift' : '') + '.' + (k + 1);
      control({ id: padId, kind: 'button', down: true, ts: ev.timeStamp });
      var up2 = function (e2) { control({ id: padId, kind: 'button', down: false, ts: e2.timeStamp }); document.removeEventListener('pointerup', up2); };
      document.addEventListener('pointerup', up2); return;
    }
    var b = ev.target.closest('[data-b]'); if (!b || !S) return;
    ev.preventDefault();
    if (!E) return start();
    var id = b.getAttribute('data-b');
    control({ id: id, kind: 'button', down: true, ts: ev.timeStamp });
    var up = function (e2) { control({ id: id, kind: 'button', down: false, ts: e2.timeStamp }); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointerup', up);
  });
  document.addEventListener('input', function (ev) {
    var r = ev.target.closest && ev.target.closest('[data-r]'); if (r && S) { var id = r.getAttribute('data-r'), c0 = S.dec.control(id) || {}; S.values[id] = +r.value; control({ id: id, kind: c0.kind, value: +r.value, ts: ev.timeStamp }); return; }
    var f = ev.target.getAttribute && ev.target.getAttribute('data-f'); if (f === 'q') { libFilter.q = ev.target.value; sel = 0; var box = document.querySelector('.tracks'); if (box) box.outerHTML = S.screen() === 'free' ? trackRows(visible(), true) : box.outerHTML; if (S.screen() === 'library') drawLibraryKeepFocus(); }
  });
  function addResultHtml() {
    var r = libState.lastAdd; if (!r) return '';
    if (r.busy) return '<div class="note">Checking and adding ' + r.n + ' file' + (r.n === 1 ? '' : 's') + '…</div>';
    return (r.added.length ? '<div class="note">Added ' + r.added.length + ' track' + (r.added.length === 1 ? '' : 's') + ': ' + esc(r.added.join(', ')) + '. They\'ll be analysed now.</div>' : '') +
      (r.failed.length ? '<div class="alert"><b>' + r.failed.length + ' file' + (r.failed.length === 1 ? '' : 's') + ' couldn\'t be added:</b><ul>' + r.failed.map(function (f) { return '<li><b>' + esc(f.name) + '</b>: ' + esc(f.reason) + '</li>'; }).join('') + '</ul></div>' : '');
  }
  function drawLibraryKeepFocus() { var v = libFilter.q; drawLibrary(); var i = document.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!S) return;
    var f = t.getAttribute('data-f'); if (f === 'sort' || f === 'genre') { libFilter[f] = t.value; sel = 0; return refreshScreen(); }
    if (t.getAttribute('data-genre')) { var it = lib.get(t.getAttribute('data-genre')); if (it) lib.update(it, { genre: t.value }); return; }
    if (t.id === 'addFiles' && t.files.length) {
      var files = [].slice.call(t.files); t.value = '';
      libState.lastAdd = { busy: true, n: files.length }; drawLibrary();
      return lib.addFiles(files).then(function (r) { libState.lastAdd = r; drawLibrary(); autoAnalyse(); }, function (e) { libState.lastAdd = { added: [], failed: files.map(function (f) { return { name: f.name, reason: BoothLibrary.friendly(e) }; }) }; drawLibrary(); });
    }
    if (t.id === 'importLib' && t.files.length) {
      var bf = t.files[0]; t.value = ''; S.toast('Restoring your library…');
      return lib.importBackup(bf).then(function (r) { S.toast('Restored ' + r.tracks + ' track' + (r.tracks === 1 ? '' : 's') + (r.skipped ? ' (' + r.skipped + ' you already had were left as they are)' : '') + '.'); autoAnalyse(); drawSettings(); }, function (e) { S.toast('Couldn\'t restore that backup: ' + BoothLibrary.friendly(e)); });
    }
    if (t.name === 'cue') { settings.cueMode = t.value; saveSettings(); if (t.value === 'device' && !settings.cueId) S.toast('Now pick the device under "Cue to".'); return; }
    if (t.id === 'outSel') { settings.outId = t.value; saveSettings(); return; }
    if (t.id === 'cueSel') { settings.cueId = t.value; if (settings.cueMode !== 'device') settings.cueMode = 'device'; saveSettings(); drawSettings(); return; }
    if (t.id === 'xfLock') { settings.xfLocked = t.checked; saveSettings(); return; }
    if (t.id === 'pRange') { settings.pitchRange = +t.value; saveSettings(); return; }
    if (t.id === 'pInv') { settings.invertPitch = t.checked; saveSettings(); return; }
    if (t.id === 'guideOn') { settings.guide = t.checked; saveSettings(); return; }
  });
  document.addEventListener('contextmenu', function (ev) { var h = ev.target.closest('[data-hot]'); if (!h || !E) return; ev.preventDefault(); var p = h.getAttribute('data-hot').split('.'), d = E.decks[p[0]]; if (padMode[p[0]] !== 'hotcue') return; d.hotcue(+p[1], true); saveHot(d); ui.dirty = true; });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, [data-sel]'); if (!t || !S) return;
    var d = t.dataset;
    if (d.act === 'start') return start().then(refreshScreen);
    if (d.sel !== undefined && !ev.target.closest('button, select')) { sel = +d.sel; return moveSel(0); }
    if (d.load) { loadTo(d.load, lib.get(d.item)).catch(function () {}); return; }
    if (d.pm) { var pp = d.pm.split('.'); setPadMode(pp[0], pp[1]); return; }
    if (d.lsz) { var lz = d.lsz.split('.'), dl = E.decks[lz[0]]; if (+lz[1] < 0) dl.loopHalve(); else dl.loopDouble(); ui.dirty = true; return; }
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
    if (d.act === 'relist') return lib.list().then(function () { refreshScreen(); drawProblem(); autoAnalyse(); });
    if (d.act === 'persist') return BoothLibrary.persist().then(function (ok) { S.toast(ok ? 'Done: Chrome will keep your library.' : 'Chrome said no for now. It usually agrees once you\'ve used Booth a few times or installed Nudge. Keep a backup to be safe.'); runDiag(); });
    if (d.act === 'diag') return runDiag();
    if (d.act === 'exportLib') { S.toast('Building your backup… (big libraries take a moment)'); return lib.exportBackup().then(function (blob) { var a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'booth-library-' + new Date().toISOString().slice(0, 10) + '.boothlib'; a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); }, 60000); S.toast('Backup saved (' + mb(blob.size) + '). Keep it somewhere safe.'); }, function (e) { S.toast('Couldn\'t build the backup: ' + BoothLibrary.friendly(e)); }); }
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
    start: start,
    loadTo: loadTo,
    lib: function () { return lib; },
    view: view,
    settings: function () { return settings; },
    deckPanel: deckPanel, mixerPanel: mixerPanel, sizeCanvases: sizeCanvases, trackRows: trackRows, visible: visible, fmtTime: fmtTime,
    dirty: function () { ui.dirty = true; },
    shell: function () { return S; }, heardAt: heardAt,
    padMode: padMode, setPadMode: setPadMode, beatsText: beatsText,
    leave: function (next) { if (next !== 'free' && gridDeck) gridDeck = ''; },
    engine: function () { return E; }
  };
})();
