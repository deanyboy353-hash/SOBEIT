/*
 * Afterhours: Booth · the game: tutorials (incl. loops), transition drills, ghost line,
 * manual beatmatching, set mode, daily challenge, coach cards with replay, stats,
 * recording and the club scene. Uses BoothPlay (engine, decks, library) and BoothScore.
 */
(function () {
  'use strict';
  var P = window.BoothPlay, Sc = window.BoothScore;
  var S = null, samples = [], sess = null, result = null, rec = null, crowd = { e: 0.55, cheer: 0, boo: 0 }, lastSampleT = 0;
  // your login: the same saved key as Nudge (or ?key= in the link)
  try { var urlKey = new URLSearchParams(location.search).get('key'); if (urlKey) localStorage.setItem('lq-key', JSON.stringify(urlKey)); } catch (e) {}
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function E() { return P.engine(); }
  function lib() { return P.lib(); }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return S.esc(s); }
  function bar(b) { return Math.floor(b / 4) + 1; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function rng(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }

  // ---------- sampling: every control and the master level, 20 times a second ----------
  function deckSample(d) { return { on: d.playing && !!d.track, vol: d.vals.volume, low: d.vals.eqLow, mid: d.vals.eqMid, high: d.vals.eqHigh, filter: d.vals.filter, beat: d.track ? d.beatPos() : 0, bpm: d.track ? d.bpm() : 0, loop: d.loop ? d.loopLen() : 0, fx: d.fxLabel ? d.fxLabel() : '' }; }
  setInterval(function () {
    var e = E(); if (!e || !S) return;
    var sc = S.screen(); if (sc !== 'play' && sc !== 'free') return;
    var A = e.decks.A, B = e.decks.B, now = e.now();
    if (now - lastSampleT < 0.04) return; lastSampleT = now;
    samples.push({ t: now, db: e.masterDb(), A: deckSample(A), B: deckSample(B) });
    if (!sess && samples.length > 24000) samples.splice(0, 4000);
    if (A.playing || B.playing) addPractice(0.05);
  }, 50);

  // ---------- stats (this computer) ----------
  function stats() { var s = S.load('stats', null) || {}; s.secs = s.secs || {}; s.trans = s.trans || []; s.bm = s.bm || []; s.sets = s.sets || []; return s; }
  var pendingSecs = 0;
  function addPractice(sec) { pendingSecs += sec; if (pendingSecs >= 5) { var s = stats(), k = today(); s.secs[k] = (s.secs[k] || 0) + pendingSecs; pendingSecs = 0; S.save('stats', s); } }
  function logTransition(mode, r) { var s = stats(); s.trans.push({ at: Date.now(), mode: mode, tech: r.technique, total: r.total, grade: r.grade, sc: r.scores }); if (s.trans.length > 600) s.trans.splice(0, s.trans.length - 600); S.save('stats', s); }
  function logBeatmatch(level, r) { var s = stats(); s.bm.push({ at: Date.now(), level: level, score: r.score, bpm: r.bpmError, ms: r.phaseMs, drift: r.driftMs, t: r.matchedAt }); if (s.bm.length > 400) s.bm.splice(0, s.bm.length - 400); S.save('stats', s); }

  // ---------- techniques: target lines (ghost), steps and the plan, all in beats from the phrase P ----------
  // roles: 'out' is the deck you're leaving, 'in' the one you're bringing in.
  var TECH = {
    volume: { name: 'Volume fade', blurb: 'The simplest blend: bring the new track up, then the old one down, quickly, without touching the EQs.',
      lines: [['in', 'vol', [[0, 0], [8, 1]]], ['out', 'vol', [[8, 1], [16, 0]]]],
      steps: [[0, 'Bring {in} volume to the top over 2 bars.', ['in.volume']], [8, 'Now bring {out} volume all the way down over 2 bars.', ['out.volume']], [16, 'Done: {in} is on its own.', []]],
      plan: { start: 0, end: 16 }, len: 16 },
    bass: { name: 'Bass swap', blurb: 'The club classic: bring the new track in with its bass cut, then swap the basses in one move on the 1.',
      lines: [['in', 'vol', [[0, 0], [32, 1]]], ['in', 'low', [[0, 0], [31.95, 0], [32, 0.5]]], ['out', 'low', [[0, 0.5], [31.95, 0.5], [32, 0]]], ['out', 'vol', [[32, 1], [48, 0]]]],
      steps: [[0, 'Bring {in} volume to the top, slowly, over 8 bars. Keep its LOW fully left.', ['in.volume']], [28, 'Get ready to swap the bass on bar {b32}: {out} LOW fully left and {in} LOW to the middle, together.', ['out.eqLow', 'in.eqLow']], [32, 'Swap the bass now: {out} LOW fully left, {in} LOW to the middle.', ['out.eqLow', 'in.eqLow']], [34, 'Bring {out} volume down over 4 bars.', ['out.volume']], [48, 'Done: {in} is on its own.', []]],
      plan: { start: 0, swap: 32, end: 48 }, len: 48, prepLow: true },
    eq: { name: 'EQ blend', blurb: 'A smooth blend: the new track comes in with its bass cut and its highs low, then the basses cross over gradually.',
      lines: [['in', 'vol', [[0, 0], [16, 1]]], ['in', 'high', [[0, 0.25], [16, 0.25], [32, 0.5]]], ['in', 'low', [[0, 0], [32, 0], [40, 0.5]]], ['out', 'low', [[0, 0.5], [32, 0.5], [40, 0]]], ['out', 'vol', [[40, 1], [56, 0]]]],
      steps: [[0, 'Bring {in} volume to the top over 4 bars (LOW fully left, HIGH at a quarter).', ['in.volume']], [16, 'Turn {in} HIGH up to the middle over 4 bars.', ['in.eqHigh']], [32, 'Cross the bass over 2 bars: {out} LOW slowly to fully left while {in} LOW comes up to the middle.', ['out.eqLow', 'in.eqLow']], [40, 'Bring {out} volume down over 4 bars.', ['out.volume']], [56, 'Done: {in} is on its own.', []]],
      plan: { start: 0, swap: 36, end: 56 }, len: 56, prepLow: true, prepHigh: true },
    filter: { name: 'Filter fade', blurb: 'The outgoing track is filtered away (high-pass) as the new one takes over.',
      lines: [['in', 'vol', [[0, 0], [16, 1]]], ['out', 'filter', [[16, 0.5], [32, 0.85]]], ['in', 'low', [[0, 0], [32, 0], [32.05, 0.5]]], ['out', 'vol', [[32, 1], [40, 0]]]],
      steps: [[0, 'Bring {in} volume to the top over 4 bars (LOW fully left).', ['in.volume']], [16, 'Turn {out} FILTER to the right, slowly, over 4 bars: its bass and body disappear.', ['out.filter']], [32, 'On bar {b32}: {in} LOW to the middle, and bring {out} volume down over 2 bars.', ['in.eqLow', 'out.volume']], [40, 'Done. Put {out} FILTER back to the middle for next time.', ['out.filter']]],
      plan: { start: 0, swap: 32, end: 40 }, len: 40, prepLow: true },
    long: { name: '32-bar blend', blurb: 'A long, patient blend for groovy techno: both tracks ride together for 32 bars.',
      lines: [['in', 'vol', [[0, 0], [32, 1]]], ['in', 'low', [[0, 0], [64, 0], [72, 0.5]]], ['out', 'low', [[0, 0.5], [64, 0.5], [72, 0]]], ['out', 'high', [[72, 0.5], [104, 0.2]]], ['out', 'vol', [[96, 1], [128, 0]]]],
      steps: [[0, 'Bring {in} volume to the top over 8 bars (LOW fully left).', ['in.volume']], [32, 'Let them ride together for 8 bars. Listen to how they sit.', []], [64, 'Cross the bass over 2 bars: {out} LOW down, {in} LOW up to the middle.', ['out.eqLow', 'in.eqLow']], [72, 'Turn {out} HIGH down to a quarter over 8 bars.', ['out.eqHigh']], [96, 'Bring {out} volume down over 8 bars.', ['out.volume']], [128, 'Done: a full 32-bar blend.', []]],
      plan: { start: 0, swap: 68, end: 128 }, len: 128, prepLow: true },
    cut: { name: 'Quick cut', blurb: 'A hard cut on the 1: one fader down and the other up in the same instant.',
      lines: [['in', 'vol', [[-0.05, 0], [0, 1]]], ['out', 'vol', [[-0.05, 1], [0, 0]]]],
      steps: [[-4, 'On bar {b0} (the 1): pull {out} volume down and push {in} volume up at the same instant.', ['out.volume', 'in.volume']], [0, 'Cut now!', ['out.volume', 'in.volume']], [8, 'Done.', []]],
      plan: { start: 0 }, len: 8 }
  };
  var TECH_ORDER = ['volume', 'bass', 'eq', 'filter', 'cut', 'long'];
  var LOOP_PAIRS = { volume: ['loop:groove128', 'loop:rumble130'], bass: ['loop:rumble130', 'loop:acid132'], eq: ['loop:groove128', 'loop:acid126'], filter: ['loop:hard135', 'loop:rumble130'], cut: ['loop:acid132', 'loop:hard135'], long: ['loop:acid126', 'loop:groove128'] };

  function roleIds(ids, from, to) { return ids.map(function (x) { return x.replace(/^in\./, to + '.').replace(/^out\./, from + '.'); }); }
  function fill(text, from, to, Pb) { return text.replace(/\{in\}/g, 'Deck ' + to).replace(/\{out\}/g, 'Deck ' + from).replace(/\{b(\d+)\}/g, function (_, n) { return String(bar(Pb + +n)); }); }

  // ---------- tutorials ----------
  var GUIDES = {
    loops: { name: 'Loops 101', blurb: 'LOOP IN and LOOP OUT, the LOOP knob, loop pads and loop rolls, and how loops save a mix.', steps: [
      { t: 'Load a track onto Deck A (turn BROWSE, press LOAD A), bring Deck A volume up and press Deck A PLAY.', ids: ['A.load', 'A.volume', 'A.play'], ok: function (A) { return A.track && A.playing && A.vals.volume > 0.3; }, help: 'loadA' },
      { t: 'Watch the bar numbers on the waveform. Press Deck A LOOP IN right on the 1 of a bar.', ids: ['A.loopIn'], ok: function (A) { return A.loopIn !== null && A.loopIn !== undefined; }, say: function (A) { var b = Math.round((A.loopIn - A.track.first) * A.track.bpm / 60); return b % 4 === 0 ? 'Right on the 1 of bar ' + bar(b) + '.' : 'That was beat ' + (((b % 4) + 4) % 4 + 1) + ' of bar ' + bar(b) + ', not the 1. It still works, but try to hit the 1 next time.'; } },
      { t: 'Count 4 beats (1, 2, 3, 4) and press Deck A LOOP OUT on the next 1. That makes a 1-bar loop.', ids: ['A.loopOut'], ok: function (A) { return !!A.loop; }, say: function (A) { var n = Math.round(A.loopLen()); return n === 4 ? 'A 4-beat loop: perfect.' : 'Your loop is ' + n + ' beats. Loops of 4, 8 or 16 beats keep the phrase; others leave you off the bar when you exit.'; } },
      { t: 'Listen to it loop. Now press Deck A LOOP OUT again to leave the loop: the track carries on from there.', ids: ['A.loopOut'], ok: function (A) { return !A.loop; } },
      { t: 'Push the Deck A LOOP knob: an instant 4-beat loop from the current beat.', ids: ['A.loopKnob'], ok: function (A) { return !!A.loop && Math.abs(A.loopLen() - 4) < 0.01; } },
      { t: 'Turn the Deck A LOOP knob to the left, two clicks: the loop halves to 2 beats, then 1. Hear it tighten.', ids: ['A.loopKnob'], ok: function (A) { return !!A.loop && A.loopLen() <= 1.01; } },
      { t: 'Turn the LOOP knob to the right until the loop is 8 beats long.', ids: ['A.loopKnob'], ok: function (A) { return !!A.loop && A.loopLen() >= 7.99; } },
      { t: 'Push the LOOP knob again to leave the loop.', ids: ['A.loopKnob'], ok: function (A) { return !A.loop; } },
      { t: 'Press the LOOP pad-mode button (second above the pads). Now the pads are loop sizes: pad 5 is 4 beats. Press pad 5.', ids: ['A.mode2', 'A.pad.hotcue.5'], ok: function (A) { return !!A.loop && Math.abs(A.loopLen() - 4) < 0.01; } },
      { t: 'Press pad 5 again to leave the loop.', ids: ['A.pad.hotcue.5'], ok: function (A) { return !A.loop; } },
      { t: 'Loop roll: hold SHIFT and hold pad 3 (1 beat) for a couple of beats, then let go. It stutters, and when you let go the track is exactly where it would have been.', ids: ['A.shift', 'A.pad.hotcue.3'], ok: function (A, st) { return st.rolled; } },
      { t: 'The one that saves mixes: pad 8 loops the last 32 beats (8 bars). Use it when the outgoing track is ending before your blend is done. Press pad 8, then pad 8 again to leave.', ids: ['A.pad.hotcue.8'], ok: function (A, st) { return st.saw32 && !A.loop; } },
      { t: 'Done! LOOP IN and OUT for your own loops, the LOOP knob for quick ones, loop pads for exact sizes, SHIFT for rolls.', ids: [], ok: function () { return false; }, end: true }
    ] },
    eq: { name: 'EQ and filter basics', blurb: 'What LOW, MID, HIGH and the FILTER do, one at a time.', steps: [
      { t: 'Load a track onto Deck A, bring Deck A volume up and press PLAY.', ids: ['A.load', 'A.volume', 'A.play'], ok: function (A) { return A.track && A.playing && A.vals.volume > 0.3; }, help: 'loadA' },
      { t: 'Turn Deck A LOW fully left: the kick and bass disappear (a "kill").', ids: ['A.eqLow'], ok: function (A) { return A.vals.eqLow < 0.05; } },
      { t: 'Bring Deck A LOW back to the middle (12 o\'clock).', ids: ['A.eqLow'], ok: function (A) { return Math.abs(A.vals.eqLow - 0.5) < 0.06; } },
      { t: 'Turn Deck A MID fully left: vocals, synths and snares go. Then back to the middle.', ids: ['A.eqMid'], ok: function (A, st) { if (A.vals.eqMid < 0.05) st.mid = true; return st.mid && Math.abs(A.vals.eqMid - 0.5) < 0.06; } },
      { t: 'Turn Deck A HIGH fully left: the hats and air go. Then back to the middle.', ids: ['A.eqHigh'], ok: function (A, st) { if (A.vals.eqHigh < 0.05) st.high = true; return st.high && Math.abs(A.vals.eqHigh - 0.5) < 0.06; } },
      { t: 'Turn Deck A FILTER slowly left: a low-pass, the track goes muffled and far away. Then back to the middle.', ids: ['A.filter'], ok: function (A, st) { if (A.vals.filter < 0.2) st.lp = true; return st.lp && Math.abs(A.vals.filter - 0.5) < 0.04; } },
      { t: 'Turn Deck A FILTER slowly right: a high-pass, the bass drains out and it goes thin. Then back to the middle.', ids: ['A.filter'], ok: function (A, st) { if (A.vals.filter > 0.8) st.hp = true; return st.hp && Math.abs(A.vals.filter - 0.5) < 0.04; } },
      { t: 'Done. In a mix only one track should have its LOW up at a time. That\'s what the bass swap is for.', ids: [], ok: function () { return false; }, end: true }
    ] },
    match: { name: 'Beatmatching basics', blurb: 'Tempo with the pitch fader, phase with the jog wheel, with the Beatmatch Guide lights helping.', steps: [
      { t: 'Load a track on Deck A and one on Deck B (similar BPM). Bring Deck A volume up and press Deck A PLAY.', ids: ['A.load', 'B.load', 'A.volume', 'A.play'], ok: function (A, st, B) { return A.track && B.track && A.playing; }, help: 'loadAB' },
      { t: 'Press Deck B SYNC so it\'s off (unlit). You\'re matching by hand now.', ids: ['B.sync'], ok: function (A, st, B) { return !B.sync; } },
      { t: 'Press Deck B PLAY and bring Deck B volume halfway up so you hear both.', ids: ['B.play', 'B.volume'], ok: function (A, st, B) { return B.playing && B.vals.volume > 0.3; } },
      { t: 'Tempo: watch the arrow above the Deck B pitch fader. It points the way to move it. Move it until the middle light comes on.', ids: ['B.pitch'], ok: function (A, st, B) { return Math.abs(A.bpm() - B.bpm()) < 0.05; } },
      { t: 'Phase: the kicks may still be apart. Nudge Deck B with its jog wheel (the outer edge), in the direction of the phase arrow, until the kicks sound like one.', ids: ['B.jogEdge'], ok: function (A, st, B) { return Math.abs(B.phaseTo(A) * 60 / A.bpm() * 1000) < 15 && Math.abs(A.bpm() - B.bpm()) < 0.08; } },
      { t: 'Matched! Now try the Manual beatmatching mode, where the guide lights go away as you level up.', ids: [], ok: function () { return false; }, end: true }
    ] }
  };

  // ---------- picking tracks ----------
  function ownPair(rand) {
    var mine = lib().items.filter(function (x) { return x.own && x.analysed && !x.error; });
    if (mine.length < 2) return null;
    for (var tries = 0; tries < 20; tries++) {
      var a = mine[Math.floor((rand || Math.random)() * mine.length)], fr = lib().friends(a).filter(function (x) { return x.own; });
      if (fr.length) return [a, fr[Math.floor(Math.random() * fr.length)]];
    }
    return [mine[0], mine[1]];
  }
  function pairFor(tech, src) {
    if (src === 'mine') { var p = ownPair(); if (p) return p; S.toast('You need 2 analysed tracks of your own with similar BPM. Using the built-in loops.'); }
    var ids = LOOP_PAIRS[tech] || LOOP_PAIRS.bass; return [lib().get(ids[0]), lib().get(ids[1])];
  }

  // ---------- the play screen ----------
  function playHtml(title, sub) {
    return '<canvas id="club" class="club" aria-hidden="true"></canvas>' +
      '<section class="panel hud"><div class="hud-top"><div class="grow"><div class="eyebrow">' + esc(sub || '') + '</div><h2 id="hudTitle">' + esc(title) + '</h2></div>' + topBar('play') + '<button type="button" class="bbtn ghost sm" data-g="stop">Stop and leave</button></div>' +
      '<div class="hud-main"><div class="grow"><div class="step" id="hudStep"></div><div class="hud-sub" id="hudSub"></div><div class="warn" id="hudWarn"></div><div class="lanes-wrap" id="lanesWrap"><canvas id="lanes" class="lanes"></canvas></div></div>' +
      '<div class="hud-dia" id="hudDia">' + S.diagram() + '</div></div></section>' +
      '<div class="guide" id="guide"></div><div class="wfs"><canvas id="wfA" class="wf"></canvas><canvas id="wfB" class="wf"></canvas></div>' +
      '<div class="decks3" id="decks3">' + P.deckPanel('A') + P.mixerPanel() + P.deckPanel('B') + '</div><div id="resultSlot"></div>';
  }
  function topBar(where) {
    var on = rec && rec.state === 'recording';
    return '<span class="recbar"><button type="button" class="bbtn sm' + (on ? ' rec' : '') + '" data-g="rec" id="recBtn">' + (on ? '■ Stop recording' : '● Record this mix') + '</button><span class="mono small" id="recTime"></span></span>';
  }
  function resetView() { var v = P.view; v.hideBpm = {}; v.hideWaves = false; v.helper = true; v.guide = 'auto'; v.guideDeck = ''; v.frame = null; v.onLoad = redrawDecks; v.onControl = null; }
  // after a track loads, show it in the deck panels (titles, key, hot cues)
  function redrawDecks() { if (S.screen() !== 'play') return; var d = el('decks3'); if (!d) return; d.innerHTML = P.deckPanel('A') + P.mixerPanel() + P.deckPanel('B'); P.dirty(); }
  function openPlay(title, sub) {
    result = null;
    var keepY = location.hash.indexOf('#play') === 0 ? window.scrollY : 0;   // Try again / Next lesson: the decks stay where they are
    if (!keepY) location.hash = 'play';
    S.el('screen').innerHTML = playHtml(title, sub);
    P.sizeCanvases(); sizeLanes(); sizeClub(); P.dirty();
    if (keepY) window.scrollTo(0, keepY);
  }
  function setStep(text, ids, sub, warn) {
    var s = el('hudStep'); if (s && s.textContent !== text) { s.textContent = text; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
    var u = el('hudSub'); if (u && u.innerHTML !== (sub || '')) u.innerHTML = sub || '';
    var w = el('hudWarn'); if (w && w.textContent !== (warn || '')) w.textContent = warn || '';
    var key = (ids || []).join(','); if (setStep.last !== key) { setStep.last = key; document.querySelectorAll('#hudDia .c').forEach(function (g) { var id = g.getAttribute('data-id'); g.classList.toggle('focus', (ids || []).some(function (x) { return x === id || (/\.pad\.hotcue\.\d$/.test(x) && g.getAttribute('data-pad') === x.replace('.pad.hotcue.', '.')); })); }); }
  }

  // ---------- transition sessions (tutorial transitions, drills, ghost line, daily) ----------
  function startTransition(o) {
    // o: { mode: 'tutorial'|'drill'|'ghost'|'daily', tech, src: 'loops'|'mine', title, pair }
    P.start().then(function () {
      resetView();
      var T = TECH[o.tech], pair = o.pair || pairFor(o.tech, o.src);
      if (!pair || !pair[0] || !pair[1]) return S.toast('No tracks to use. Add some in the Library.');
      sess = { kind: 'transition', mode: o.mode, tech: o.tech, T: T, src: o.src, from: 'A', to: 'B', state: 'loading', title: o.title || T.name, rep: 0, results: [], daily: o.daily, pairNext: o.pairNext };
      openPlay(sess.title, modeLabel(o.mode) + ' · ' + T.name);
      setStep('Loading the tracks…', []);
      var e = E(); e.decks.A.stop(); e.decks.B.stop(); e.decks.A.setSync(true); e.decks.B.setSync(true);
      e.decks.A.clearOffset(); e.decks.B.clearOffset();
      Promise.all([P.loadTo('A', pair[0], true), P.loadTo('B', pair[1], true)]).then(function () { sess.state = 'setup'; P.dirty(); }, function () { setStep('Couldn\'t load those tracks.', []); });
      P.view.frame = frameTransition;
    });
  }
  function modeLabel(m) { return { tutorial: 'Tutorial', drill: 'Drill', ghost: 'Ghost line', daily: 'Daily challenge', set: 'Set mode', beatmatch: 'Beatmatching', guide: 'Tutorial' }[m] || ''; }
  function grid() {
    var e = E(), f = e.decks[sess.from], t = e.decks[sess.to];
    if (f.playing || !t.playing) { sess.lastF = f.beatPos(); sess.lastT = t.beatPos(); return f.beatPos(); }
    return (sess.lastF || 0) + (t.beatPos() - (sess.lastT || 0));
  }
  function frameTransition() {
    if (!sess || sess.kind !== 'transition') return;
    var e = E(), f = e.decks[sess.from], t = e.decks[sess.to], T = sess.T;
    if (sess.state === 'loading' || sess.state === 'done') { drawLanes(); return; }
    if (sess.state === 'setup') {
      if (!(f.playing && f.vals.volume > 0.3)) { setStep('Bring Deck ' + sess.from + ' volume to the top and press Deck ' + sess.from + ' PLAY.', [sess.from + '.volume', sess.from + '.play'], 'Deck ' + sess.from + ': ' + esc(f.track ? f.track.name : '') + ' · Deck ' + sess.to + ': ' + esc(t.track ? t.track.name : '') + ' (cued at its bar 1, SYNC on).'); drawLanes(); return; }
      // the phrase where the transition starts: 2+ phrases ahead so there's time to get ready
      var g = f.beatPos(), lead = T.plan.start !== undefined && sess.tech === 'cut' ? 40 : 44;
      sess.P = Math.ceil((g + lead) / 32) * 32;
      sess.plan = {}; Object.keys(T.plan).forEach(function (k) { sess.plan[k] = sess.P + T.plan[k]; });
      sess.lines = T.lines.map(function (L) { var deck = L[0] === 'in' ? sess.to : sess.from; return { deck: deck, grid: sess.from, key: L[1], label: 'Deck ' + deck + ' ' + ({ vol: 'volume', low: 'LOW', high: 'HIGH', mid: 'MID', filter: 'FILTER' })[L[1]], pts: L[2].map(function (p) { return [sess.P + p[0], p[1]]; }) }; });
      sess.iStart = samples.length; sess.state = 'run'; sess.startT = e.now();
      if (t.playing) t.stop(); t.seek(t.track.first); t.cuePos = t.track.first;
    }
    var g2 = grid(), Pb = sess.P, playAt = Pb - 32, from = sess.from, to = sess.to, warn = '';
    var stepTxt = '', ids = [], sub = '';
    if (!t.playing && g2 < Pb + 4) {
      var toPlay = playAt - g2;
      ids = [to + '.play'];
      if (toPlay > 0) {
        var prep = [];
        if (T.prepLow && t.vals.eqLow > 0.05) prep.push('turn Deck ' + to + ' LOW fully left');
        if (T.prepHigh && Math.abs(t.vals.eqHigh - 0.25) > 0.08) prep.push('set Deck ' + to + ' HIGH to a quarter (9 o\'clock)');
        if (t.vals.volume > 0.005) prep.push('bring Deck ' + to + ' volume all the way down');
        stepTxt = prep.length ? 'Get ready: ' + prep.join(', ') + '.' : 'Press Deck ' + to + ' PLAY right on bar ' + bar(playAt) + ' (it starts silent, fader down).';
        if (prep.length) ids = (T.prepLow ? [to + '.eqLow'] : []).concat(T.prepHigh ? [to + '.eqHigh'] : []).concat([to + '.volume']);
        sub = countdown(toPlay, playAt);
      } else { stepTxt = 'Press Deck ' + to + ' PLAY now!'; warn = toPlay < -2 ? 'Deck ' + to + ' should have started on bar ' + bar(playAt) + '. Press PLAY now, then follow the line.' : ''; }
    } else {
      var st = null; T.steps.forEach(function (s) { if (g2 >= Pb + s[0] - (s[0] === 0 ? 4 : 0)) st = s; });
      if (!st || g2 < Pb - 4) { stepTxt = 'Deck ' + to + ' is playing silently. Wait for bar ' + bar(Pb) + '.'; sub = countdown(Pb - g2, Pb); ids = []; }
      else { stepTxt = fill(st[1], from, to, Pb); ids = roleIds(st[2], from, to); var nx = T.steps.filter(function (s) { return Pb + s[0] > g2; })[0]; sub = nx ? 'Next, on bar ' + bar(Pb + nx[0]) + ': ' + esc(fill(nx[1], from, to, Pb)) : ''; }
      if (g2 < Pb - 0.5 && t.vals.volume > 0.02) warn = 'Keep Deck ' + to + ' volume down until bar ' + bar(Pb) + '.';
    }
    setStep(stepTxt, ids, sub, warn);
    drawLanes();
    // is it finished?
    if (e.now() - (sess.checkT || 0) < 0.3) return; sess.checkT = e.now();
    var slice = samples.slice(sess.iStart), res = null;
    if (sess.tech === 'cut') { if (g2 > Pb + 8) { res = Sc.scoreCut(slice, from, to, sess.plan) || failResult('The cut didn\'t happen: Deck ' + to + ' never came up while Deck ' + from + ' went down.'); } }
    else {
      var trs = Sc.findTransitions(slice).filter(function (x) { return x.from === from && x.to === to; }), done = trs.filter(function (x) { return !x.open; })[0];
      if (done) res = Sc.score(slice, done, { technique: sess.tech, plan: sess.plan });
      else if (g2 > (sess.plan.end || Pb) + 48) { var op = trs[0]; res = op ? Sc.score(slice, op, { technique: sess.tech, plan: sess.plan }) : failResult('Deck ' + to + ' never came into the mix.'); res.notes.unshift('The transition wasn\'t finished by bar ' + bar((sess.plan.end || Pb) + 48) + '.'); res.total = Math.min(res.total, 50); res.grade = Sc.grade(res.total); }
    }
    if (!res) return;
    if (sess.mode === 'ghost') { var gh = Sc.scoreGhost(slice, sess.lines); res = Object.assign({}, res, { ghost: gh, total: gh.total, grade: gh.grade, notes: gh.notes.concat(res.notes).slice(0, 4) }); }
    finishTransition(res, slice);
  }
  function countdown(beats, at) { var b = Math.max(0, Math.ceil(beats)); return b > 8 ? 'Bar ' + bar(at) + ' in ' + Math.ceil(b / 4) + ' bars' : b > 0 ? '<span class="count">' + (b <= 4 ? b : Math.ceil(b / 4) + ' bars') + '</span>' : ''; }
  function failResult(msg) { return { total: 0, grade: 'D', scores: { bass: null, volume: null, timing: 0, smooth: null }, notes: [msg], good: [], events: {}, window: { i0: 0, i1: 0 }, from: sess.from, to: sess.to, technique: sess.tech }; }
  function finishTransition(res, slice) {
    sess.state = 'done'; result = { res: res, slice: slice, kind: 'transition', from: sess.from, to: sess.to, tracks: { A: E().decks.A.track, B: E().decks.B.track }, lines: sess.lines };
    logTransition(sess.mode, res); sess.results.push(res);
    crowd.e = Math.max(0.15, Math.min(1, crowd.e + (res.total - 60) / 100)); if (res.total >= 85) crowd.cheer = 1;
    var bestKey = 'best-' + sess.mode + '-' + sess.tech, best = S.load(bestKey, 0); if (res.total > best) S.save(bestKey, res.total);
    if (sess.mode === 'daily') submitDaily(res);
    showResult();
  }
  function nextRep() {
    // the deck you just brought in becomes the outgoing one; a new track goes on the other deck
    var e = E(), oldFrom = sess.from; sess.from = sess.to; sess.to = oldFrom; sess.rep++;
    var cur = e.decks[sess.from].track, cands = lib().items.filter(function (x) { return x.analysed && (sess.src === 'mine' ? x.own : !x.own) && x.id !== (cur && cur.id) && x.bpm && Math.abs(x.bpm / e.decks[sess.from].bpm() - 1) < 0.06; });
    if (!cands.length) cands = lib().items.filter(function (x) { return x.analysed && x.id !== (cur && cur.id); });
    var next = cands[Math.floor(Math.random() * cands.length)];
    sess.state = 'loading'; result = null; el('resultSlot').innerHTML = '';
    e.decks[sess.to].stop();
    P.loadTo(sess.to, next, true).then(function () { e.decks[sess.to].setSync(true); sess.state = 'setup'; });
  }

  // ---------- lanes: the target lines scrolling with the music, and your moves ----------
  function sizeLanes() { var c = el('lanes'); if (!c) return; var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  function drawLanes() {
    var c = el('lanes'); if (!c || !c.width) return;
    var g = c.getContext('2d'), W = c.width, H = c.height, dpr = window.devicePixelRatio || 1;
    g.clearRect(0, 0, W, H);
    if (!sess || !sess.lines || sess.state === 'loading') { el('lanesWrap').hidden = !sess || !sess.lines; return; }
    el('lanesWrap').hidden = false;
    var lines = sess.lines, n = lines.length, lh = H / n, now = grid(), span = 32, x0 = W * 0.22, ppb = (W - x0) / (span * 0.78), left = now - x0 / ppb;
    var bx = function (b) { return x0 + (b - now) * ppb; };
    // bars and phrase lines
    for (var b = Math.ceil(left); b < now + span; b++) { if (b % 4) continue; g.fillStyle = b % 32 === 0 ? 'rgba(255,63,180,.55)' : 'rgba(255,255,255,.08)'; g.fillRect(bx(b), 0, (b % 32 === 0 ? 2 : 1) * dpr, H); if (b % 16 === 0) { g.fillStyle = 'rgba(244,236,255,.5)'; g.font = (10 * dpr) + 'px Inter, sans-serif'; g.fillText('bar ' + bar(b), bx(b) + 3 * dpr, H - 4 * dpr); } }
    var slice = samples.slice(Math.max(sess.iStart || 0, samples.length - 400));
    lines.forEach(function (L, i) {
      var y0 = i * lh, yv = function (v) { return y0 + lh - 6 * dpr - v * (lh - 14 * dpr); }, col = L.deck === 'A' ? '#ff3fb4' : '#7ff9ff';
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, y0 + 2, W, lh - 4);
      g.fillStyle = 'rgba(244,236,255,.7)'; g.font = '600 ' + (11 * dpr) + 'px Inter, sans-serif'; g.fillText(L.label, 8 * dpr, y0 + 15 * dpr);
      // target (ghost) line, extended flat both ways
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3 * dpr; g.setLineDash([]); g.shadowColor = col; g.shadowBlur = 12 * dpr;
      g.beginPath(); var pts = L.pts; g.moveTo(0, yv(pts[0][1])); pts.forEach(function (p) { g.lineTo(bx(p[0]), yv(p[1])); }); g.lineTo(W, yv(pts[pts.length - 1][1])); g.stroke(); g.shadowBlur = 0;
      // your line (what you actually did)
      g.strokeStyle = col; g.lineWidth = 2.5 * dpr; g.beginPath(); var started = false;
      slice.forEach(function (s) { var gb = sess.from === L.grid ? s[L.grid].beat : null; if (gb === null) return; var x = bx(s[L.grid].on ? gb : gb); if (x < 0) return; var y = yv(s[L.deck][L.key]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
      g.stroke();
    });
    g.fillStyle = '#fff'; g.fillRect(x0 - dpr, 0, 2 * dpr, H);
  }

  // ---------- result card with replay ----------
  function bars(v) { return v === null || v === undefined ? '<span class="muted">–</span>' : '<span class="sbar"><i style="width:' + v + '%"></i></span><b class="mono">' + v + '</b>'; }
  function showResult() {
    var r = result.res, slot = el('resultSlot'); if (!slot) return;
    var isBm = result.kind === 'beatmatch', h = '<div class="result panel"><div class="res-head"><div class="grade g' + r.grade + '">' + r.grade + '</div><div class="grow"><div class="eyebrow">' + esc(modeLabel(sess.mode)) + '</div><h2>' + (isBm ? 'Beatmatch: ' + r.score : esc((TECH[r.technique] || {}).name || 'Transition') + ': ' + r.total) + '</h2>' +
      (result.res.ghost ? '<div class="small muted">On the ghost line: ' + result.res.ghost.lines.map(function (l) { return esc(l.label) + ' ' + l.within + '%'; }).join(' · ') + '</div>' : '') + '</div></div>';
    if (isBm) h += '<div class="res-scores"><div>Tempo off at the end<b class="mono">' + r.bpmError + ' BPM</b></div><div>Kicks apart<b class="mono">' + r.phaseMs + ' ms</b></div><div>Drift per 8 bars<b class="mono">' + r.driftMs + ' ms</b></div><div>Matched after<b class="mono">' + (r.matchedAt === null ? 'not yet' : r.matchedAt + ' s') + '</b></div></div>';
    else h += '<div class="res-scores"><div>Bass clash' + bars(r.scores.bass) + '</div><div>Volume' + bars(r.scores.volume) + '</div><div>Timing' + bars(r.scores.timing) + '</div><div>Smoothness' + bars(r.scores.smooth) + '</div></div>';
    h += (r.notes.length ? '<ul class="notes">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') + (r.good && r.good.length ? '<ul class="notes good">' + r.good.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '');
    h += '<div class="replay"><canvas id="replay" class="replaycv"></canvas><input type="range" id="scrub" min="0" max="1000" value="500" aria-label="Scrub through the replay"><div class="small mono" id="scrubInfo"></div></div>';
    h += '<div class="row wrap">' + resultButtons() + '</div>' + (sess.mode === 'daily' ? '<div id="dailyVs" class="small"></div>' : '') + '</div>';
    slot.innerHTML = h;
    var c = el('replay'), rr = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; c.width = Math.round(rr.width * dpr); c.height = Math.round(rr.height * dpr);
    drawReplay(0.5);
    if (sess.mode === 'daily') drawDailyVs();
  }
  function resultButtons() {
    var m = sess.mode, keep = '<button type="button" class="bbtn" data-keep="1">Keep playing</button>';
    if (m === 'drill' || m === 'ghost') return '<button type="button" class="bbtn primary" data-g="again">Try again</button><button type="button" class="bbtn" data-g="next">Next rep (Deck ' + sess.to + ' becomes the outgoing track)</button>' + keep + '<button type="button" class="bbtn ghost" data-g="stop">Stop</button>';
    if (m === 'beatmatch') return '<button type="button" class="bbtn primary" data-g="again">Try again</button>' + keep + '<button type="button" class="bbtn ghost" data-g="stop">Stop</button>';
    if (m === 'daily') return '<button type="button" class="bbtn primary" data-g="again">Try again (your best counts)</button>' + keep + '<button type="button" class="bbtn ghost" data-g="stop">Done</button>';
    var nx = TECH_ORDER[TECH_ORDER.indexOf(sess.tech) + 1];
    return '<button type="button" class="bbtn primary" data-g="again">Try again</button>' + (nx ? '<button type="button" class="bbtn" data-gstart="tut:' + nx + ':' + (sess.src || 'loops') + '">Next lesson: ' + esc(TECH[nx].name) + '</button>' : '') + keep + '<button type="button" class="bbtn ghost" data-g="tutorials">Back to tutorials</button>';
  }
  function drawReplay(f) {
    var c = el('replay'); if (!c || !result) return;
    var g = c.getContext('2d'), W = c.width, H = c.height, dpr = window.devicePixelRatio || 1, Sx = result.slice, r = result.res;
    g.clearRect(0, 0, W, H); if (!Sx.length) return;
    var from = result.from, to = result.to, isBm = result.kind === 'beatmatch';
    // the window: 8 beats either side of the transition, on the outgoing grid (carried on after it stops)
    var lastOn = 0; Sx.forEach(function (s, i) { if (s[from].on) lastOn = i; });
    var gb = function (i) { var s = Sx[i]; return i <= lastOn || !s[to].on ? s[from].beat : Sx[lastOn][from].beat + (s[to].beat - Sx[lastOn][to].beat); };
    var i0 = isBm ? 0 : Math.max(0, r.window.i0), i1 = isBm ? Sx.length - 1 : Math.min(Sx.length - 1, Math.max(r.window.i1, i0 + 1));
    var b0 = gb(i0) - (isBm ? 0 : 8), b1 = gb(i1) + (isBm ? 0 : 8), ix0 = 0, ix1 = Sx.length - 1;
    for (var k = 0; k < Sx.length; k++) { if (gb(k) <= b0) ix0 = k; if (gb(k) <= b1) ix1 = k; }
    var X = function (b) { return (b - b0) / ((b1 - b0) || 1) * W }, top = 0, wfH = H * 0.42, lnH = H - wfH - 16 * dpr;
    // waveforms of both decks across the window
    ['A', 'B'].forEach(function (d, row) {
      var tr = result.tracks[d]; if (!tr || !tr.waves) return; var w = tr.waves, y0 = top + row * wfH / 2, mid = y0 + wfH / 4;
      for (var i = ix0; i <= ix1; i++) { var s = Sx[i]; if (!s[d].on) continue; var tsec = tr.first + s[d].beat * 60 / tr.bpm, j = Math.floor(tsec * w.rate); if (j < 0 || j >= w.low.length) continue; var x = X(gb(i)), v = Math.max(w.low[j], w.mid[j]) / 255 * (wfH / 4 - 2) * Math.min(1, P.lib && s[d].vol * 1.6 + 0.15); g.fillStyle = d === 'A' ? 'rgba(255,63,180,.55)' : 'rgba(127,249,255,.5)'; g.fillRect(x, mid - v, Math.max(1, dpr), v * 2); }
      g.fillStyle = 'rgba(244,236,255,.6)'; g.font = (10 * dpr) + 'px Inter, sans-serif'; g.fillText('Deck ' + d, 6 * dpr, y0 + 12 * dpr);
    });
    // bar lines
    for (var b = Math.ceil(b0); b <= b1; b++) if (b % 4 === 0) { g.fillStyle = b % 32 === 0 ? 'rgba(255,63,180,.6)' : 'rgba(255,255,255,.1)'; g.fillRect(X(b), 0, dpr, H); if (b % 16 === 0) { g.fillStyle = 'rgba(244,236,255,.6)'; g.fillText('bar ' + bar(b), X(b) + 3 * dpr, H - 3 * dpr); } }
    var ly = function (v) { return wfH + 8 * dpr + (1 - v) * lnH; };
    if (!isBm) {
      // bass clash shading
      for (var i2 = ix0; i2 < ix1; i2++) if (Sc.bassOn(Sx[i2].A) && Sc.bassOn(Sx[i2].B)) { g.fillStyle = 'rgba(255,90,110,.25)'; g.fillRect(X(gb(i2)), wfH, X(gb(i2 + 1)) - X(gb(i2)) + 1, lnH + 8 * dpr); }
      if (r.events && r.events.dip) { g.fillStyle = 'rgba(255,196,77,.2)'; g.fillRect(X(r.events.dip.start), wfH, X(r.events.dip.start + r.events.dip.beats) - X(r.events.dip.start), lnH + 8 * dpr); }
      // target lines (ghost) if any
      (result.lines || []).forEach(function (L) { if (L.key !== 'vol' && L.key !== 'low') return; g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([4 * dpr, 4 * dpr]); g.lineWidth = 1.5 * dpr; g.beginPath(); L.pts.forEach(function (p, q) { var x = X(p[0]), y = ly(p[1] * (L.key === 'low' ? 1 : 1)); if (q) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); });
      // your moves: volume solid, LOW dashed
      [['A', 'vol', '#ff3fb4', []], ['B', 'vol', '#7ff9ff', []], ['A', 'low', '#ff3fb4', [6, 4]], ['B', 'low', '#7ff9ff', [6, 4]]].forEach(function (L) {
        g.strokeStyle = L[2]; g.lineWidth = 2.2 * dpr; g.setLineDash(L[3].map(function (x) { return x * dpr; })); g.beginPath();
        for (var i3 = ix0; i3 <= ix1; i3++) { var x = X(gb(i3)), y = ly(L[1] === 'low' ? Math.min(1, Sx[i3][L[0]].low * 2) : Sx[i3][L[0]].vol); if (i3 === ix0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke(); g.setLineDash([]);
      });
    } else {
      // beatmatching: BPM difference and phase over time
      g.strokeStyle = '#ffc44d'; g.lineWidth = 2 * dpr; g.beginPath();
      for (var i4 = ix0; i4 <= ix1; i4++) { var s4 = Sx[i4], dbpm = s4.B.bpm - s4.A.bpm, x4 = X(gb(i4)), y4 = ly(0.5 - Math.max(-2, Math.min(2, dbpm)) / 4); if (i4 === ix0) g.moveTo(x4, y4); else g.lineTo(x4, y4); }
      g.stroke();
      g.strokeStyle = '#5dffa8'; g.beginPath();
      for (var i5 = ix0; i5 <= ix1; i5++) { var s5 = Sx[i5], ph = (s5.B.beat - Math.floor(s5.B.beat)) - (s5.A.beat - Math.floor(s5.A.beat)); if (ph > .5) ph -= 1; if (ph < -.5) ph += 1; var x5 = X(gb(i5)), y5 = ly(0.5 - ph); if (i5 === ix0) g.moveTo(x5, y5); else g.lineTo(x5, y5); }
      g.stroke(); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, ly(0.5), W, dpr);
    }
    // scrub cursor
    var cb = b0 + f * (b1 - b0), cx = X(cb); g.fillStyle = '#fff'; g.fillRect(cx - dpr, 0, 2 * dpr, H);
    var near = ix0; for (var i6 = ix0; i6 <= ix1; i6++) if (gb(i6) <= cb) near = i6;
    var s6 = Sx[near], pct = function (v) { return Math.round(v * 100) + '%'; };
    var info = 'Bar ' + bar(cb) + ' beat ' + (((Math.floor(cb) % 4) + 4) % 4 + 1) + ' · ';
    info += isBm ? 'Deck B ' + (s6.B.bpm - s6.A.bpm >= 0 ? '+' : '') + (s6.B.bpm - s6.A.bpm).toFixed(2) + ' BPM vs Deck A' : 'A vol ' + pct(s6.A.vol) + ' LOW ' + pct(s6.A.low) + ' · B vol ' + pct(s6.B.vol) + ' LOW ' + pct(s6.B.low) + ' · master ' + s6.db.toFixed(1) + ' dB';
    var si = el('scrubInfo'); if (si) si.textContent = info + (isBm ? '  (yellow: tempo difference, green: phase)' : '  (solid: volume, dashed: LOW, red: bass clash, amber: volume dip, white dashes: target)');
  }

  // ---------- guided tutorials (loops, EQ basics, beatmatching basics) ----------
  function startGuide(id) {
    P.start().then(function () {
      resetView();
      var G = GUIDES[id];
      sess = { kind: 'guide', mode: 'guide', id: id, G: G, i: 0, st: {}, said: '' };
      openPlay(G.name, 'Tutorial');
      el('lanesWrap').hidden = true;
      P.view.onControl = function (e) {
        var m = /^([AB])\.pad\.loopShift\.\d$/.exec(e.id); if (m && e.down) sess.st.rolled = true;
      };
      P.view.frame = frameGuide;
    });
  }
  function frameGuide() {
    if (!sess || sess.kind !== 'guide') return;
    var e = E(), A = e.decks.A, B = e.decks.B, step = sess.G.steps[sess.i];
    if (A.loop && Math.abs(A.loopLen() - 32) < 0.01) sess.st.saw32 = true;
    var prog = '<span class="muted">Step ' + (sess.i + 1) + ' of ' + sess.G.steps.length + '</span>' + (sess.said ? ' · <span class="said">' + esc(sess.said) + '</span>' : '') +
      (step.help === 'loadA' && !A.track ? ' · <button type="button" class="bbtn sm" data-g="helpLoadA">Load a track for me</button>' : '') + (step.help === 'loadAB' && (!A.track || !B.track) ? ' · <button type="button" class="bbtn sm" data-g="helpLoadAB">Load two tracks for me</button>' : '') +
      (!step.end ? ' · <button type="button" class="bbtn sm ghost" data-g="skipStep">Skip this step</button>' : ' · <button type="button" class="bbtn sm primary" data-g="tutorials">Back to tutorials</button>');
    if (setStep.lastProg !== prog) { setStep.lastProg = prog; setStep(step.t, step.ids, prog, ''); } else setStep(step.t, step.ids, el('hudSub').innerHTML, '');
    if (!step.end && step.ok(A, sess.st, B)) {
      sess.said = step.say ? step.say(A, sess.st, B) : 'Nice.';
      sess.i++; setStep.lastProg = ''; if (window.navigator.vibrate) {}
      crowd.e = Math.min(1, crowd.e + 0.06);
    }
  }

  // ---------- manual beatmatching ----------
  function startBeatmatch(level, src) {
    P.start().then(function () {
      resetView();
      var v = P.view; v.hideBpm = { A: true, B: true }; v.hideWaves = level >= 2; v.guide = level <= 2 ? 'on' : 'off'; v.guideDeck = 'B'; v.helper = level === 1;
      var pair = src === 'mine' ? ownPair() : null;
      if (!pair) { var loops = ['loop:groove128', 'loop:rumble130', 'loop:acid132', 'loop:acid126', 'loop:kick125', 'loop:hard135']; var a = loops[Math.floor(Math.random() * loops.length)], b; do { b = loops[Math.floor(Math.random() * loops.length)]; } while (b === a); pair = [lib().get(a), lib().get(b)]; }
      sess = { kind: 'beatmatch', mode: 'beatmatch', level: level, src: src, state: 'loading', from: 'A', to: 'B', results: [] };
      openPlay('Manual beatmatching · level ' + level, 'Beatmatching · ' + ['', 'guide lights and waveforms', 'guide lights only', 'ears only'][level]);
      el('lanesWrap').hidden = true;
      var e = E(); e.decks.A.stop(); e.decks.B.stop();
      Promise.all([P.loadTo('A', pair[0], true), P.loadTo('B', pair[1], true)]).then(function () {
        var A = e.decks.A, B = e.decks.B, r = (1.5 + Math.random() * 2.5) / 100 * (Math.random() < 0.5 ? -1 : 1);
        A.startAtPitch(0); B.startAtPitch(A.track.bpm * (1 + r) / B.track.bpm - 1);
        sess.offset = r; sess.state = 'setup'; P.dirty();
      });
      v.frame = frameBeatmatch;
    });
  }
  function frameBeatmatch() {
    if (!sess || sess.kind !== 'beatmatch') return;
    var e = E(), A = e.decks.A, B = e.decks.B, L = sess.level;
    if (sess.state === 'loading' || sess.state === 'done') return;
    if (sess.state === 'setup') {
      if (!(A.playing && A.vals.volume > 0.3)) return setStep('Bring Deck A volume up and press Deck A PLAY.', ['A.volume', 'A.play'], 'Deck B starts at a different tempo. SYNC is off on both decks.');
      if (!(B.playing && B.vals.volume > 0.25)) return setStep('Press Deck B PLAY and bring Deck B volume up to the middle so you hear both.', ['B.play', 'B.volume'], 'Tip: cut Deck B LOW (fully left) so the two kicks don\'t blur together.');
      sess.state = 'run'; sess.iStart = samples.length; sess.t0 = e.now(); sess.dur = 45;
    }
    var left = Math.max(0, sess.dur - (e.now() - sess.t0));
    var tip = L === 1 ? 'Arrows above the Deck B pitch fader show which way to move it; the phase arrows show which way to nudge the jog wheel.' : L === 2 ? 'Guide lights only. No numbers, no waveforms.' : 'Ears only. Listen for the kicks galloping (phase) or drifting apart over time (tempo).';
    setStep('Match Deck B to Deck A: pitch fader for tempo, jog wheel to line up the kicks.', ['B.pitch', 'B.jogEdge'], '<span class="count">' + Math.ceil(left) + ' s</span> ' + tip);
    if (left <= 0) {
      sess.state = 'done';
      var slice = samples.slice(sess.iStart), r = Sc.scoreBeatmatch(slice, 'B') || { score: 0, grade: 'D', bpmError: 9, phaseMs: 999, driftMs: 999, matchedAt: null, notes: ['Both decks need to be playing to score.'] };
      r.technique = 'beatmatch'; r.total = r.score; r.good = r.score >= 85 ? ['Locked in. Try the next level.'] : [];
      result = { res: r, slice: slice, kind: 'beatmatch', from: 'A', to: 'B', tracks: { A: A.track, B: B.track } };
      logBeatmatch(L, r); crowd.e = Math.max(0.15, Math.min(1, crowd.e + (r.score - 60) / 100));
      var bestKey = 'best-beatmatch-' + L; if (r.score > S.load(bestKey, 0)) S.save(bestKey, r.score);
      showResult();
    }
  }

  // ---------- set mode ----------
  function startSet(ids) {
    P.start().then(function () {
      resetView();
      var items = ids.map(function (id) { return lib().get(id); }).filter(Boolean);
      if (items.length < 2) return S.toast('Pick at least 2 tracks.');
      sess = { kind: 'set', mode: 'set', items: items, idx: 0, from: 'A', to: 'B', state: 'loading', results: [], iStart: samples.length };
      openPlay('Set: ' + items.length + ' tracks', 'Set mode');
      el('lanesWrap').hidden = true;
      var e = E(); e.decks.A.stop(); e.decks.B.stop(); e.decks.A.setSync(true); e.decks.B.setSync(true);
      Promise.all([P.loadTo('A', items[0], true), P.loadTo('B', items[1], true)]).then(function () { sess.state = 'run'; sess.iStart = samples.length; });
      P.view.frame = frameSet;
    });
  }
  function frameSet() {
    if (!sess || sess.kind !== 'set' || sess.state === 'loading') return;
    var e = E(), f = e.decks[sess.from], t = e.decks[sess.to], n = sess.items.length, cur = sess.idx + 1;
    if (sess.state === 'end') return;
    var nextName = sess.idx + 1 < n ? sess.items[sess.idx + 1].name : '';
    if (!f.playing) setStep('Bring Deck ' + sess.from + ' volume up and press Deck ' + sess.from + ' PLAY to start your set.', [sess.from + '.volume', sess.from + '.play'], 'Track 1 of ' + n + ': ' + esc(sess.items[0].name));
    else if (nextName) setStep('Mix Deck ' + sess.to + ' in when you\'re ready, on a phrase. Any technique.', [sess.to + '.play', sess.to + '.volume'], 'Playing track ' + cur + ' of ' + n + ' on Deck ' + sess.from + ' · next: ' + esc(nextName) + ' on Deck ' + sess.to + ' · ' + sess.results.length + ' transition' + (sess.results.length === 1 ? '' : 's') + ' scored');
    else setStep('Last track. Let it play out, or press Finish the set.', [], '<button type="button" class="bbtn sm primary" data-g="finishSet">Finish the set</button>');
    if (e.now() - (sess.checkT || 0) < 0.4) return; sess.checkT = e.now();
    var slice = samples.slice(sess.iStart), done = Sc.findTransitions(slice).filter(function (x) { return !x.open && x.from === sess.from && x.to === sess.to; })[0];
    if (done) {
      var res = Sc.score(slice, done, { technique: 'free' }); res.track = sess.items[sess.idx + 1].name; sess.results.push(res); logTransition('set', res);
      crowd.e = Math.max(0.15, Math.min(1, crowd.e + (res.total - 60) / 100)); if (res.total >= 85) crowd.cheer = 1;
      S.toast('Transition ' + sess.results.length + ': ' + res.grade + ' ' + res.total + (res.notes[0] ? ' · ' + res.notes[0] : ''));
      sess.idx++; var old = sess.from; sess.from = sess.to; sess.to = old; sess.iStart = samples.length;
      if (sess.idx + 1 < n) { sess.state = 'loading'; e.decks[sess.to].stop(); P.loadTo(sess.to, sess.items[sess.idx + 1], true).then(function () { e.decks[sess.to].setSync(true); sess.state = 'run'; }); }
    }
    if (sess.idx === n - 1 && f.ended) finishSet();
  }
  function finishSet() {
    if (!sess || sess.kind !== 'set') return;
    sess.state = 'end';
    var rs = sess.results, avg = rs.length ? Math.round(rs.reduce(function (s, r) { return s + r.total; }, 0) / rs.length) : 0, gr = Sc.grade(avg);
    var s = stats(); s.sets.push({ at: Date.now(), tracks: sess.items.length, avg: avg, grade: gr }); S.save('stats', s);
    el('resultSlot').innerHTML = '<div class="result panel"><div class="res-head"><div class="grade g' + gr + '">' + gr + '</div><div class="grow"><div class="eyebrow">Set mode</div><h2>Your set: ' + avg + ' average over ' + rs.length + ' transition' + (rs.length === 1 ? '' : 's') + '</h2></div></div>' +
      (rs.length ? '<ol class="setlist">' + rs.map(function (r) { return '<li><b>' + r.grade + ' ' + r.total + '</b> into ' + esc(r.track) + (r.notes[0] ? '<br><span class="small muted">' + esc(r.notes[0]) + '</span>' : r.good[0] ? '<br><span class="small" style="color:var(--green)">' + esc(r.good[0]) + '</span>' : '') + '</li>'; }).join('') + '</ol>' : '<p class="muted">No transitions were finished.</p>') +
      '<div class="row wrap"><button type="button" class="bbtn primary" data-g="setAgain">Play the set again</button><button type="button" class="bbtn" data-keep="1">Keep playing</button><button type="button" class="bbtn ghost" data-g="stop">Done</button></div></div>';
  }

  // ---------- daily challenge (same for both of you) ----------
  function dailySpec(ymd) {
    var r = rng('booth-daily-' + ymd), techs = ['bass', 'eq', 'filter', 'volume', 'cut', 'bass', 'eq'], tech = techs[Math.floor(r() * techs.length)];
    var L = BoothLibrary.LOOPS.filter(function (x) { return x.id !== 'loop:kick125' && !x.breakdown && !x.root; }), a = L[Math.floor(r() * L.length)], cands = L.filter(function (x) { return x.id !== a.id && Math.abs(x.bpm / a.bpm - 1) < 0.06; }), b = cands[Math.floor(r() * cands.length)] || L[0];
    return { tech: tech, a: a.id, b: b.id, title: TECH[tech].name + ': ' + a.name.replace('Built-in: ', '') + ' into ' + b.name.replace('Built-in: ', '') };
  }
  function apiCall(fn, args) {
    var key = ''; try { key = JSON.parse(localStorage.getItem('lq-key') || '""'); } catch (e) {}
    var api = ''; try { api = JSON.parse(localStorage.getItem('lq-api') || '""'); } catch (e) {}
    api = api || (window.LQ_CONFIG && LQ_CONFIG.api);
    if (!key || !api) return Promise.reject(new Error('Open Nudge on this computer once (your app link) so Booth knows who you are.'));
    return fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, key: key, args: args || [] }) }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error); return j.result; });
  }
  var dailyState = null;
  function submitDaily(res) {
    var spec = dailySpec(today());
    apiCall('submitBooth', [res.total, res.grade, spec.title]).then(function (st) { dailyState = st.booth; drawDailyVs(); }, function (e) { dailyState = { error: e.message }; drawDailyVs(); });
  }
  function drawDailyVs() {
    var d = el('dailyVs'); if (!d) return;
    if (!dailyState) { d.textContent = 'Saving your score…'; return; }
    if (dailyState.error) { d.textContent = 'Score not saved: ' + dailyState.error; return; }
    var m = dailyState.mine, o = dailyState.other;
    d.innerHTML = '<b>Today, head to head:</b> you ' + (m ? m.grade + ' ' + m.score : '–') + ' · Yaz ' + (o ? o.grade + ' ' + o.score : 'not played yet') + '. It shows in Nudge, Play, Mix.';
  }

  // ---------- recording ----------
  function toggleRec() {
    var e = E(); if (!e) return P.start().then(toggleRec);
    if (rec && rec.state === 'recording') { rec.mr.stop(); return; }
    if (!window.MediaRecorder) return S.toast('This browser can\'t record. Use Chrome.');
    var dest = rec && rec.dest || e.ctx.createMediaStreamDestination(); e.out.connect(dest);
    var type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    var mr = new MediaRecorder(dest.stream, type ? { mimeType: type, audioBitsPerSecond: 256000 } : {}), chunks = [];
    rec = { mr: mr, dest: dest, state: 'recording', t0: Date.now() };
    mr.ondataavailable = function (ev) { if (ev.data.size) chunks.push(ev.data); };
    mr.onstop = function () {
      rec.state = 'idle'; try { e.out.disconnect(dest); } catch (x) {}
      var blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), secs = Math.round((Date.now() - rec.t0) / 1000), d = new Date();
      var m = { id: 'm' + Date.now().toString(36), at: Date.now(), secs: secs, name: 'Mix ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), blob: blob };
      lib().saveMix(m).then(function () { S.toast('Recording saved (' + Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2) + '). It\'s in Recordings.'); });
      paintRec();
    };
    mr.start(1000); paintRec(); S.toast('Recording. Press Stop recording when you\'re done.');
  }
  function paintRec() {
    var b = el('recBtn'); if (!b) return; var on = rec && rec.state === 'recording';
    b.textContent = on ? '■ Stop recording' : '● Record this mix'; b.classList.toggle('rec', !!on);
  }
  function drawRecordings() {
    var box = S.el('screen');
    box.innerHTML = '<h1>Recordings</h1><p class="sub">Mixes you recorded in Booth (kept in this browser). Press <b>● Record this mix</b> in Free mix or any mode.</p><div id="mixList" class="panel">Loading…</div>';
    P.start().then(function () { return lib().mixes(); }).then(function (list) {
      el('mixList').innerHTML = list.length ? list.map(function (m) { var u = URL.createObjectURL(m.blob); return '<div class="mixrow"><div class="grow"><b>' + esc(m.name) + '</b> <span class="muted small">' + Math.floor(m.secs / 60) + ':' + ('0' + m.secs % 60).slice(-2) + '</span><audio controls preload="none" src="' + u + '"></audio></div><a class="bbtn sm" download="' + esc(m.name) + '.webm" href="' + u + '">Download</a><button type="button" class="bbtn sm ghost" data-delmix="' + m.id + '">Delete</button></div>'; }).join('') : '<p class="muted">No recordings yet.</p>';
    });
  }

  // ---------- stats ----------
  function drawStats() {
    var s = stats(), days = Object.keys(s.secs).sort(), total = days.reduce(function (a, k) { return a + s.secs[k]; }, 0);
    var week = days.filter(function (k) { return (Date.now() - new Date(k + 'T12:00:00')) < 7 * 864e5; }).reduce(function (a, k) { return a + s.secs[k]; }, 0);
    var streak = 0, d = new Date(); if (!(s.secs[today()] >= 60)) d.setDate(d.getDate() - 1);
    for (;;) { var k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); if (s.secs[k] >= 60) { streak++; d.setDate(d.getDate() - 1); } else break; }
    var hm = function (x) { var h = Math.floor(x / 3600), m = Math.round(x % 3600 / 60); return h ? h + 'h ' + m + 'm' : m + ' min'; };
    var h = '<h1>Stats</h1><p class="sub">From this computer. Practice time counts while a deck is playing.</p>';
    h += '<div class="statgrid"><div class="panel stat"><span>Practised</span><b>' + hm(total) + '</b><i>' + hm(week) + ' this week</i></div><div class="panel stat"><span>Streak</span><b>' + streak + ' day' + (streak === 1 ? '' : 's') + '</b><i>1+ minute a day keeps it</i></div><div class="panel stat"><span>Transitions</span><b>' + s.trans.length + '</b><i>' + s.sets.length + ' set' + (s.sets.length === 1 ? '' : 's') + '</i></div><div class="panel stat"><span>Beatmatch rounds</span><b>' + s.bm.length + '</b><i>' + (s.bm.length ? 'last ' + s.bm[s.bm.length - 1].score : '–') + '</i></div></div>';
    h += '<section class="panel"><h3>Average score per technique</h3><div class="techs">' + TECH_ORDER.concat(['free']).map(function (t) { var l = s.trans.filter(function (x) { return x.tech === t; }), av = l.length ? Math.round(l.reduce(function (a, x) { return a + x.total; }, 0) / l.length) : null, last5 = l.slice(-5), av5 = last5.length ? Math.round(last5.reduce(function (a, x) { return a + x.total; }, 0) / last5.length) : null; return '<div class="techrow"><span class="grow">' + (TECH[t] ? TECH[t].name : 'Free (set mode)') + '</span><span class="muted small">' + l.length + ' done</span>' + (av === null ? '<span class="mono">–</span>' : '<span class="sbar"><i style="width:' + av + '%"></i></span><b class="mono">' + av + '</b><span class="small muted">last 5: ' + av5 + '</span>') + '</div>'; }).join('') + '</div></section>';
    h += '<section class="panel"><h3>Beatmatching over time</h3>' + (s.bm.length ? spark(s.bm.map(function (x) { return x.score; }), 100) + '<p class="small muted">Score per round (higher is better). Recent: ' + s.bm.slice(-5).map(function (x) { return 'L' + x.level + ' ' + x.bpm + ' BPM / ' + x.ms + ' ms'; }).join(' · ') + '</p>' : '<p class="muted">No rounds yet.</p>') + '</section>';
    h += '<section class="panel"><h3>Recent transitions</h3>' + (s.trans.length ? s.trans.slice(-12).reverse().map(function (x) { return '<div class="techrow"><b class="mono">' + x.grade + ' ' + x.total + '</b><span class="grow">' + esc(TECH[x.tech] ? TECH[x.tech].name : 'Free') + ' · ' + esc(modeLabel(x.mode)) + '</span><span class="small muted">' + new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span></div>'; }).join('') : '<p class="muted">None yet.</p>') + '</section>';
    S.el('screen').innerHTML = h;
  }
  function spark(vals, max) {
    if (vals.length < 2) return '<p class="mono">' + vals[0] + '</p>';
    var W = 600, H = 80, pts = vals.map(function (v, i) { return (i / (vals.length - 1) * W).toFixed(1) + ',' + (H - v / max * (H - 6) - 3).toFixed(1); }).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="#ff3fb4" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>';
  }

  // ---------- picker screens ----------
  function card(go, title, blurb, tag, extra) { return '<button type="button" class="mode" data-gstart="' + esc(go) + '"><span class="tag' + (tag ? ' ok' : '') + '">' + esc(tag || 'Start') + '</span><b>' + esc(title) + '</b><span class="small muted">' + esc(blurb) + '</span>' + (extra || '') + '</button>'; }
  function bestTag(k) { var b = S.load(k, 0); return b ? 'Best ' + Sc.grade(b) + ' ' + b : ''; }
  function drawTutorials() {
    var h = '<h1>Tutorials</h1><p class="sub">Step by step, with the exact control to use lit up on the Inpulse 500. Nothing is locked: do them in any order.</p>';
    h += '<h3 class="sect">Controller skills</h3><div class="modes">' + Object.keys(GUIDES).map(function (id) { return card('guide:' + id, GUIDES[id].name, GUIDES[id].blurb); }).join('') + '</div>';
    h += '<h3 class="sect">Transitions (built-in loops, exact grids)</h3><div class="modes">' + TECH_ORDER.map(function (t) { return card('tut:' + t + ':loops', TECH[t].name, TECH[t].blurb, bestTag('best-tutorial-' + t)); }).join('') + '</div>';
    h += '<h3 class="sect">With your own tracks</h3><div class="modes">' + ['bass', 'eq', 'filter'].map(function (t) { return card('tut:' + t + ':mine', TECH[t].name + ' with your tracks', 'Same steps, using two of your tracks that mix well.', ''); }).join('') + card('go:set', 'A full set', 'Pick 3 or 4 tracks and mix them in order.', '') + '</div>';
    S.el('screen').innerHTML = h;
  }
  function drawDrills() {
    var src = S.load('drillSrc', 'loops');
    var h = '<h1>Transition drills</h1><p class="sub">Pick a technique and repeat it. After each one, the track you brought in becomes the outgoing track and a new one is loaded, so you can keep going.</p>' +
      '<div class="row" style="margin-bottom:12px"><span class="small">Tracks:</span><button type="button" class="bbtn sm' + (src === 'loops' ? ' on' : '') + '" data-dsrc="loops">Built-in loops (exact grids)</button><button type="button" class="bbtn sm' + (src === 'mine' ? ' on' : '') + '" data-dsrc="mine">My tracks</button></div>';
    h += '<div class="modes">' + TECH_ORDER.map(function (t) { return card('drill:' + t + ':' + src, TECH[t].name, TECH[t].blurb, bestTag('best-drill-' + t)); }).join('') + '</div>';
    S.el('screen').innerHTML = h;
  }
  function drawGhostPick() {
    var h = '<h1>Ghost line</h1><p class="sub">The target fader and EQ moves scroll past like a rhythm game. Keep your lines on the white ones. Scored on how closely you follow them.</p><div class="modes">' + TECH_ORDER.map(function (t) { return card('ghost:' + t, TECH[t].name, TECH[t].lines.length + ' lines to follow', bestTag('best-ghost-' + t)); }).join('') + '</div>';
    S.el('screen').innerHTML = h;
  }
  function drawBeatmatchPick() {
    var src = S.load('bmSrc', 'loops');
    var h = '<h1>Manual beatmatching</h1><p class="sub">SYNC is off. Deck B starts 1.5 to 4% away from Deck A\'s tempo, at a random phase. Match it with the pitch fader and jog wheel. 45-second rounds, scored on tempo error and how far the beats drift.</p>' +
      '<div class="row" style="margin-bottom:12px"><span class="small">Tracks:</span><button type="button" class="bbtn sm' + (src === 'loops' ? ' on' : '') + '" data-bsrc="loops">Built-in loops</button><button type="button" class="bbtn sm' + (src === 'mine' ? ' on' : '') + '" data-bsrc="mine">My tracks</button></div><div class="modes">' +
      [[1, 'Level 1: lights and waveforms', 'Beatmatch Guide lights, waveforms and the helper line.'], [2, 'Level 2: lights only', 'Guide lights on the controller. No waveforms, no numbers.'], [3, 'Level 3: ears only', 'Nothing but your ears. The real thing.']].map(function (x) { return card('bm:' + x[0] + ':' + src, x[1], x[2], bestTag('best-beatmatch-' + x[0])); }).join('') + '</div>';
    S.el('screen').innerHTML = h;
  }
  var setPick = [];
  function drawSetPick() {
    P.start().then(function () {
      var items = lib().items.filter(function (x) { return x.analysed; });
      var h = '<h1>Set mode</h1><p class="sub">Pick 3 or 4 tracks in the order you want to play them. Each transition is scored; the set gets an average.</p><section class="panel"><div class="tracks full">' + items.map(function (x) { var n = setPick.indexOf(x.id); return '<div class="trk' + (n >= 0 ? ' on' : '') + '" data-pick="' + esc(x.id) + '"><span class="pickn">' + (n >= 0 ? n + 1 : '') + '</span><span class="tn grow">' + esc(x.name) + '</span><span class="tb mono">' + x.bpm.toFixed(1) + '</span><span class="tk mono">' + esc(x.camelot || '') + '</span></div>'; }).join('') + '</div></section>' +
        '<div class="row" style="margin-top:12px"><button type="button" class="bbtn primary" data-g="startSet"' + (setPick.length >= 2 ? '' : ' disabled') + '>Start the set (' + setPick.length + ' track' + (setPick.length === 1 ? '' : 's') + ')</button><button type="button" class="bbtn ghost" data-g="clearPick">Clear</button><span class="small muted">' + (setPick.length < 3 ? 'Pick at least 3 (2 works for a quick one).' : '') + '</span></div>';
      S.el('screen').innerHTML = h;
    });
  }
  function drawDaily() {
    var spec = dailySpec(today());
    S.el('screen').innerHTML = '<h1>Daily challenge</h1><p class="sub">The same challenge for you and Yaz today. Your best score counts and shows up head to head in Nudge (Play, Mix).</p>' +
      '<section class="panel"><div class="eyebrow">' + esc(today()) + '</div><h2>' + esc(spec.title) + '</h2><p class="muted">' + esc(TECH[spec.tech].blurb) + '</p><div id="dailyVs" class="small"></div><button type="button" class="bbtn primary" data-gstart="daily">Start today\'s challenge</button></section>';
    apiCall('gamesState', []).then(function (st) { dailyState = st.booth; drawDailyVs(); }, function (e) { var d = el('dailyVs'); if (d) d.textContent = e.message; });
  }

  // ---------- lights and the energy meter (2D, cheap: never in the way of MIDI, audio or scoring) ----------
  // Energy reacts to the mix as it happens: bass clashes and volume holes pull it down, clean transitions and drops push it up.
  var aids = null;   // ear-training toggles (Academy): which helpers are hidden
  function aid(name) { aids = S.load('aids', { phrase: true, waves: true, energy: true }); return aids[name] !== false; }
  function sizeClub() { var c = el('club'); if (!c) return; var r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  window.addEventListener('resize', function () { sizeClub(); sizeLanes(); });
  var dbHist = [];
  function crowdUpdate(dt) {
    var e = E(); if (!e) return;
    var s = samples[samples.length - 1]; if (!s) return;
    dbHist.push(s.db); if (dbHist.length > 120) dbHist.shift();               // ~6 s of master level
    var recent = avgDb(dbHist.slice(-10)), before = avgDb(dbHist.slice(-90, -30));
    var loud = s.db > -38, clash = Sc.bassOn(s.A) && Sc.bassOn(s.B) && !(sess && sess.kind === 'beatmatch');
    var hole = loud && before > -60 && recent < before - 5, drop = before > -60 && recent > before + 4;
    if (drop && crowd.cheer < 0.3) crowd.cheer = 0.8;
    var target = !loud ? 0.12 : clash ? 0.15 : hole ? 0.25 : 0.62;
    crowd.e += (target - crowd.e) * Math.min(1, dt * (clash || hole ? 1.4 : 0.25));
    crowd.boo = clash ? Math.min(1, crowd.boo + dt * 3) : Math.max(0, crowd.boo - dt * 1.5);
    crowd.why = clash ? 'Bass clash' : hole ? 'Volume drop' : crowd.cheer > 0.4 ? 'Going off' : loud ? 'Dancing' : 'Quiet';
    crowd.cheer = Math.max(0, crowd.cheer - dt * 0.2);
  }
  function avgDb(a) { if (!a.length) return -120; var p = 0; a.forEach(function (d) { p += Math.pow(10, d / 10); }); return 10 * Math.log10(p / a.length); }
  var lastClubT = 0;
  function drawClub() {
    var c = el('club'); if (!c || !c.width) return;
    var e = E(), now = performance.now() / 1000;
    if (now - lastClubT < 1 / 40) return;                                      // 40 fps is plenty for lights
    var dt = Math.min(0.1, now - (lastClubT || now)); lastClubT = now;
    crowdUpdate(dt);
    var g = c.getContext('2d'), W = c.width, H = c.height, beat = now * 2;
    if (e) { var A = e.decks.A, B = e.decks.B, lead = A.playing && (A.vals.volume >= B.vals.volume || !B.playing) ? A : B.playing ? B : null; if (lead && lead.track) beat = lead.beatPos(); }
    var ph = beat - Math.floor(beat), pulse = reduced ? 0.3 : Math.pow(1 - ph, 2.5), en = Math.min(1, crowd.e + crowd.cheer * 0.4), boo = crowd.boo, nb = 16;
    g.fillStyle = '#07030f'; g.fillRect(0, 0, W, H);
    // neon bars across the top: they pulse on every beat, brighter on the bar, red on a clash
    var barH = H * 0.42, isBar = ((Math.floor(beat) % 4) + 4) % 4 === 0;
    for (var i = 0; i < nb; i++) {
      var hue = boo > 0.3 ? 350 : (i % 2 ? 318 : 188), wave = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(beat * Math.PI / 2 + i * 0.7);
      var a = 0.12 + (pulse * (isBar ? 0.85 : 0.55) * (0.4 + en)) * (0.5 + 0.5 * wave);
      g.fillStyle = 'hsla(' + hue + ',100%,' + (50 + pulse * 15) + '%,' + Math.min(1, a) + ')';
      var x = i * W / nb + 2, w = W / nb - 4; g.fillRect(x, 6, w, barH * (0.35 + 0.65 * wave * (0.3 + en)));
    }
    // energy meter
    var my = H * 0.62, mh = H * 0.18, mw = W - 24;
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(12, my, mw, mh);
    var grad = g.createLinearGradient(12, 0, 12 + mw, 0); grad.addColorStop(0, '#5dffa8'); grad.addColorStop(0.6, '#ff3fb4'); grad.addColorStop(1, '#ffd36b');
    g.fillStyle = boo > 0.3 ? '#ff5a6e' : grad; g.fillRect(12, my, mw * en, mh);
    g.fillStyle = 'rgba(244,236,255,.85)'; g.font = '700 ' + Math.round(H * 0.13) + 'px Inter, sans-serif'; g.textBaseline = 'top';
    g.fillText('ENERGY · ' + (crowd.why || '').toUpperCase(), 14, my + mh + 4);
  }
  function freeTop() { return '<canvas id="club" class="club" aria-hidden="true"' + (aid('energy') ? '' : ' hidden') + '></canvas><div class="row freebar"><span class="grow small muted">Free mix: no scoring, just play.</span>' + topBar('free') + '</div>'; }
  P.view.always = function (sc) {
    if (sc === 'play' || sc === 'free') { var c = el('club'); if (c && !c.width) sizeClub(); drawClub(); }
    if (rec && rec.state === 'recording') { var t = el('recTime'); if (t) { var s = Math.round((Date.now() - rec.t0) / 1000); t.textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); } }
  };

  // ---------- input ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, [data-pick]'); if (!t || !S) return;
    var d = t.dataset;
    if (d.gstart) {
      var a = d.gstart.split(':');
      if (a[0] === 'guide') return startGuide(a[1]);
      if (a[0] === 'tut') return startTransition({ mode: 'tutorial', tech: a[1], src: a[2] });
      if (a[0] === 'drill') return startTransition({ mode: 'drill', tech: a[1], src: a[2] });
      if (a[0] === 'ghost') return startTransition({ mode: 'ghost', tech: a[1], src: 'loops' });
      if (a[0] === 'bm') return startBeatmatch(+a[1], a[2]);
      if (a[0] === 'go') { location.hash = a[1]; return; }
      if (a[0] === 'daily') { var sp = dailySpec(today()); return P.start().then(function () { startTransition({ mode: 'daily', tech: sp.tech, src: 'loops', title: 'Daily: ' + sp.title, pair: [lib().get(sp.a), lib().get(sp.b)] }); }); }
    }
    if (d.dsrc) { S.save('drillSrc', d.dsrc); return drawDrills(); }
    if (d.bsrc) { S.save('bmSrc', d.bsrc); return drawBeatmatchPick(); }
    if (d.pick) { var i = setPick.indexOf(d.pick); if (i >= 0) setPick.splice(i, 1); else if (setPick.length < 4) setPick.push(d.pick); else S.toast('4 tracks at most.'); return drawSetPick(); }
    if (d.delmix) { if (!confirm('Delete this recording?')) return; return lib().deleteMix(d.delmix).then(drawRecordings); }
    if (!d.g) return;
    if (d.g === 'rec') return toggleRec();
    if (d.g === 'startSet') return startSet(setPick.slice());
    if (d.g === 'clearPick') { setPick = []; return drawSetPick(); }
    if (d.g === 'finishSet') return finishSet();
    if (d.g === 'setAgain') return startSet(sess.items.map(function (x) { return x.id; }));
    if (d.g === 'stop') { stopSession(); location.hash = 'menu'; return; }
    if (d.g === 'tutorials') { stopSession(); location.hash = 'lessons'; return; }
    if (d.g === 'next') return nextRep();
    if (d.g === 'again') {
      if (sess.kind === 'beatmatch') return startBeatmatch(sess.level, sess.src);
      var e = E(); return startTransition({ mode: sess.mode, tech: sess.tech, src: sess.src, title: sess.title, pair: [lib().get(e.decks.A.track && sess.from === 'A' ? e.decks.A.track.id : e.decks[sess.from].track.id), lib().get(e.decks[sess.to].track.id)] });
    }
    if (d.g === 'skipStep' && sess && sess.kind === 'guide') { sess.said = 'Skipped.'; sess.i = Math.min(sess.G.steps.length - 1, sess.i + 1); setStep.lastProg = ''; return; }
    if (d.g === 'helpLoadA') return P.loadTo('A', lib().get('loop:acid132'), true).catch(function () {});
    if (d.g === 'helpLoadAB') return Promise.all([P.loadTo('A', lib().get('loop:groove128'), true), P.loadTo('B', lib().get('loop:rumble130'), true)]).catch(function () {});
  });
  document.addEventListener('input', function (ev) { if (ev.target.id === 'scrub') drawReplay(+ev.target.value / 1000); });
  function stopSession() { sess = null; result = null; resetView(); var e = E(); if (e) { e.decks.A.clearOffset(); e.decks.B.clearOffset(); } }

  // ---------- Next track: the selection trainer (tempo, key, energy) ----------
  var selRound = null, selPick = -1, selSrc = 'crate', selCrate = null;
  function drawSelect() {
    var own = lib().items.filter(function (x) { return x.own && x.bpm && x.camelot; }), pool;
    if (selSrc === 'mine' && own.length < 6) selSrc = 'crate';
    pool = selSrc === 'mine' ? own : (selCrate || (selCrate = BoothPro.crate()));
    if (!selRound) { var wants = ['hold', 'up', 'down', 'hold']; selRound = BoothPro.quizRound(pool, Math.random, wants[Math.floor(Math.random() * wants.length)]); selPick = -1; }
    var st = S.load('selStats', { right: 0, total: 0, run: 0, best: 0 }), r = selRound;
    var meta = function (t) { return '<span class="mono small">' + Math.round(t.bpm) + ' BPM · ' + esc(t.camelot) + (t.energy ? ' · energy ' + t.energy : '') + '</span>'; };
    var h = '<h1>Next track</h1><p class="sub">Choosing what to play next is half of DJing. Read the tempo, the key on the Camelot wheel and the energy, and pick the one that works. ' +
      st.right + ' of ' + st.total + ' right · run of ' + st.run + ' (best ' + st.best + ').</p>' +
      '<div class="row" style="margin-bottom:12px"><span class="small">Tracks:</span><button type="button" class="bbtn sm' + (selSrc === 'crate' ? ' on' : '') + '" data-selsrc="crate">Practice crate</button><button type="button" class="bbtn sm' + (selSrc === 'mine' ? ' on' : '') + '" data-selsrc="mine"' + (own.length >= 6 ? '' : ' disabled title="Needs 6 analysed tracks in your library"') + '>My tracks</button></div>';
    if (!r) { S.el('screen').innerHTML = h + '<p class="muted">Not enough tracks with a tempo and key to make a round. Add and analyse a few more in Library.</p>'; return; }
    h += '<section class="panel"><div class="eyebrow">Now playing</div><h2 style="margin:4px 0">' + esc(r.now.name) + '</h2>' + meta(r.now) +
      '<p class="small" style="margin:10px 0 0">The floor: <b>' + ({ hold: 'keep it where it is', up: 'build it up', down: 'bring it down a bit' })[r.want] + '</b>. Which one next?</p></section><div class="modes">';
    r.options.forEach(function (o, i) {
      var cls = selPick < 0 ? '' : i === r.answer ? ' right' : i === selPick ? ' wrong' : ' dim';
      h += '<button type="button" class="mode sel' + cls + '" data-selpick="' + i + '"' + (selPick >= 0 ? ' disabled' : '') + '><b>' + esc(o.track.name) + '</b>' + meta(o.track) +
        (selPick >= 0 ? '<span class="small">' + o.result.score + ' / 100</span>' + o.result.good.map(function (g) { return '<span class="small good">' + esc(g) + '</span>'; }).join('') + o.result.why.map(function (w) { return '<span class="small warn">' + esc(w) + '</span>'; }).join('') : '') + '</button>';
    });
    h += '</div>' + (selPick >= 0 ? '<p><b>' + (selPick === r.answer ? 'Right.' : 'Not quite: the best was ' + esc(r.options[r.answer].track.name) + '.') + '</b></p><div class="row wrap"><button type="button" class="bbtn primary" data-selnext="1">Next round</button>' +
      (selSrc === 'mine' ? '<button type="button" class="bbtn" data-go="free">Try it in Free mix</button>' : '') + '</div>' : '');
    h += '<details class="panel" style="margin-top:14px"><summary>The Camelot wheel in one minute</summary><p class="small">Every key has a number (1 to 12) and a letter (A minor, B major). Same number and letter: perfect. One step either way (8A to 7A or 9A): smooth. Same number, other letter (8A to 8B): same notes, brighter or darker. Two steps up (8A to 10A): an energy lift if you mix it quickly. Anything further: the basslines fight, so only with a cut. Tempo: within 2-3% is easy; past 6% sounds stretched.</p></details>';
    S.el('screen').innerHTML = h;
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-selsrc], [data-selpick], [data-selnext]'); if (!t || !S || S.screen() !== 'select') return;
    if (t.dataset.selsrc) { selSrc = t.dataset.selsrc; selRound = null; selCrate = null; return drawSelect(); }
    if (t.dataset.selnext) { selRound = null; return drawSelect(); }
    if (selPick >= 0 || !selRound) return;
    selPick = +t.dataset.selpick;
    var st = S.load('selStats', { right: 0, total: 0, run: 0, best: 0 }), ok = selPick === selRound.answer;
    st.total++; if (ok) { st.right++; st.run++; st.best = Math.max(st.best, st.run); } else st.run = 0;
    S.save('selStats', st); drawSelect();
  });

  window.BoothGame = {
    init: function (shell) { S = shell; },
    topBar: topBar, freeTop: freeTop, aid: aid,
    screens: { select: drawSelect, lessons: drawTutorials, drills: drawDrills, ghost: drawGhostPick, beatmatch: drawBeatmatchPick, set: drawSetPick, daily: drawDaily, stats: drawStats, recordings: drawRecordings,
      play: function () { if (!sess && !(window.BoothAcademy && BoothAcademy.active())) { location.hash = 'menu'; } } },
    leave: function (next) { if (next !== 'play' && sess) stopSession(); },
    session: function () { return sess; }, samples: function () { return samples; }, TECH: TECH, dailySpec: dailySpec,
    stop: function () { if (sess) stopSession(); }, topBarHtml: topBar, sizeClub: function () { sizeClub(); }
  };
})();
