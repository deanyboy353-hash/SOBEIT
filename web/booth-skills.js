/*
 * Afterhours: Booth · Advanced Academy scoring (pure: tested in Node with known answers).
 *
 * Inputs
 *   events:  [{ id: 'A.loopIn' | 'A.pad.loop.6' | 'A.loopKnob' | ..., down: true/false (buttons), delta (encoders),
 *             bA, bB: the beat on Deck A's and Deck B's grid that you were HEARING when you did it (latency removed) }]
 *   samples: the 20-per-second control samples from the game ({ t, db, A: { on, vol, low, mid, high, filter, beat, bpm, loop, fx }, B })
 *   rules:   what the technique asks for, with deck letters filled in (see each type below)
 * Output: { total, grade, parts: [{ label, score, note }], notes (what to fix, worst first), good }
 * Every note states exactly what happened ("Loop released 1/2 beat late").
 */
(function (root) {
  'use strict';
  var Sc = root.BoothScore || (typeof require === 'function' ? require('./booth-score.js') : null);
  var FR = [[1 / 8, '1/8'], [1 / 4, '1/4'], [3 / 8, '3/8'], [1 / 2, '1/2'], [5 / 8, '5/8'], [3 / 4, '3/4'], [7 / 8, '7/8']];
  /** 0.25 -> "1/4 beat", 1.5 -> "1 1/2 beats", 8 -> "2 bars" (to the nearest 1/8 beat). */
  function beats(b) {
    var q = Math.round(Math.abs(b) * 8) / 8;
    if (q >= 8 && q % 4 === 0) return q / 4 + ' bars';
    var whole = Math.floor(q), f = q - whole, fs = '';
    FR.forEach(function (x) { if (Math.abs(x[0] - f) < 1e-6) fs = x[1]; });
    return (whole ? whole + (fs ? ' ' + fs : '') : fs || '0') + ' beat' + (q > 1 ? 's' : '');
  }
  function bar(b) { return Math.floor(b / 4) + 1; }
  function barBeat(b) { var k = Math.round(b * 8) / 8, w = Math.floor(k), bt = ((w % 4) + 4) % 4 + 1, f = k - w; return 'bar ' + bar(w) + (bt !== 1 || f ? ' beat ' + bt + (f ? ' and ' + beats(f).replace(' beat', '') : '') : ''); }
  function clamp(x) { return Math.max(0, Math.min(100, Math.round(x))); }
  function grade(t) { return t >= 95 ? 'S' : t >= 85 ? 'A' : t >= 70 ? 'B' : t >= 55 ? 'C' : 'D'; }
  /** Full marks within the tolerance (1/8 beat for quick moves), down to zero at 1 beat off. */
  function timingScore(err, tol) { err = Math.abs(err); return err <= tol + 1e-9 ? 100 : clamp(100 * (1 - (err - tol) / (1 - tol))); }

  // ---------- names of controls, as printed on the Inpulse 500 ----------
  var BANKS = { hotcue: 'Hot cue', loop: 'Loop', slicer: 'Slicer', sampler: 'Sampler', fx: 'FX', beatjump: 'Beatjump', slicerloop: 'Slicer loop', toneplay: 'Toneplay' };
  var KEYS = { volume: 'volume fader', vol: 'volume fader', eqLow: 'LOW', low: 'LOW', eqMid: 'MID', mid: 'MID', eqHigh: 'HIGH', high: 'HIGH', filter: 'FILTER', trim: 'TRIM', pitch: 'pitch fader' };
  function ctlName(id) {
    var m = /^([AB])\.pad\.([a-z]+?)(Shift)?\.(\d)$/.exec(id);
    if (m) return (m[3] ? 'SHIFT + ' : '') + 'Deck ' + m[1] + ' pad ' + m[4] + ' (' + (BANKS[m[2]] || m[2]) + ' mode)';
    var n = /^([AB])\.(.+)$/.exec(id); if (!n) return id;
    var names = { loopIn: 'LOOP IN', loopOut: 'LOOP OUT', loopKnob: 'LOOP knob', loopPush: 'LOOP knob (push)', play: 'PLAY', cue: 'CUE', sync: 'SYNC', pfl: 'headphone CUE', load: 'LOAD', shift: 'SHIFT', jogEdge: 'jog wheel', jogTop: 'jog wheel' };
    return 'Deck ' + n[1] + ' ' + (names[n[2]] || KEYS[n[2]] || n[2]);
  }
  function sampleKey(k) { return { volume: 'vol', eqLow: 'low', eqMid: 'mid', eqHigh: 'high' }[k] || k; }
  function valAt(S, deck, key, beat, grid) {
    grid = grid || deck; key = sampleKey(key);
    var best = null, bd = 1e9;
    for (var i = 0; i < S.length; i++) { var d = Math.abs(S[i][grid].beat - beat); if (d < bd) { bd = d; best = S[i]; } }
    return best ? best[deck][key] : null;
  }

  // ---------- rule types ----------
  var RULES = {
    /** A button or pad pressed (or released, with release: true) at a beat. */
    press: function (r, E, S) {
      var g = r.grid || r.id[0], want = !r.release, win = r.window || 2;
      var hits = E.filter(function (e) { return e.id === r.id && (e.down === undefined ? true : !!e.down === want) && Math.abs(e['b' + g] - r.at) <= win && !e.used; });
      var label = (r.release ? 'Let go of ' : '') + ctlName(r.id) + ' on ' + barBeat(r.at);
      if (!hits.length) {
        // the right moment but the wrong control?
        var near = E.filter(function (e) { return e.id !== r.id && e.id[0] === r.id[0] && e.down !== false && e.delta === undefined && Math.abs(e['b' + g] - r.at) <= 0.75 && !/\.(volume|eq|filter|trim|pitch|jog)/.test(e.id); })[0];
        if (near) return { label: label, score: 0, note: 'Pressed ' + ctlName(near.id) + ' instead of ' + ctlName(r.id) + ' at ' + barBeat(r.at) + '.' + (/\.pad\./.test(r.id) && /\.pad\./.test(near.id) ? ' Check the pad mode: press the ' + (BANKS[r.id.split('.')[2].replace('Shift', '')] || '') + ' mode button first.' : '') };
        return { label: label, score: 0, note: (r.release ? 'Didn\'t let go of ' : 'Didn\'t press ') + ctlName(r.id) + ' (wanted ' + barBeat(r.at) + ').' };
      }
      hits.sort(function (a, b) { return Math.abs(a['b' + g] - r.at) - Math.abs(b['b' + g] - r.at); });
      var e = hits[0], err = e['b' + g] - r.at, s = timingScore(err, r.tol || 0.25); e.used = true;
      var what = r.say || (r.release ? ctlName(r.id) + ' released' : ctlName(r.id) + ' pressed');
      return { label: label, score: s, err: err, note: s === 100 ? '' : what + ' ' + beats(err) + ' ' + (err > 0 ? 'late' : 'early') + ' (' + barBeat(e['b' + g]) + ').' };
    },
    /** An encoder turned one way (LOOP knob: -1 halves, +1 doubles). */
    turn: function (r, E) {
      var g = r.grid || r.id[0], hits = E.filter(function (e) { return e.id === r.id && e.delta && (e.delta > 0 ? 1 : -1) === r.dir && Math.abs(e['b' + g] - r.at) <= (r.window || 2) && !e.used; });
      var what = ctlName(r.id) + ' turned ' + (r.dir < 0 ? 'left (halve)' : 'right (double)');
      if (!hits.length) return { label: what + ' on ' + barBeat(r.at), score: 0, note: 'Didn\'t turn ' + ctlName(r.id) + (r.dir < 0 ? ' left' : ' right') + ' (wanted ' + barBeat(r.at) + ').' };
      hits.sort(function (a, b) { return Math.abs(a['b' + g] - r.at) - Math.abs(b['b' + g] - r.at); });
      var e = hits[0], err = e['b' + g] - r.at, s = timingScore(err, r.tol || 0.25); e.used = true;
      return { label: what + ' on ' + barBeat(r.at), score: s, err: err, note: s === 100 ? '' : (r.say || what) + ' ' + beats(err) + ' ' + (err > 0 ? 'late' : 'early') + '.' };
    },
    /** A knob or fader moved to a new position at a beat (a kill, a cut, a swap). Timed where it crosses halfway. */
    move: function (r, E, S) {
      var g = r.grid || r.deck, key = sampleKey(r.key), from = r.from !== undefined ? r.from : valAt(S, r.deck, key, r.at - 1, g), mid = (from + r.to) / 2, up = r.to > from;
      var label = ctlName(r.deck + '.' + r.key) + ' to ' + Math.round(r.to * 100) + '% on ' + barBeat(r.at), cross = null;
      for (var i = 1; i < S.length; i++) {
        var b0 = S[i - 1][g].beat, b1 = S[i][g].beat; if (b1 < r.at - (r.window || 2) || b0 > r.at + (r.window || 2)) continue;
        var v0 = S[i - 1][r.deck][key], v1 = S[i][r.deck][key];
        if (up ? (v0 < mid && v1 >= mid) : (v0 > mid && v1 <= mid)) { var f = (mid - v0) / ((v1 - v0) || 1); var at = b0 + (b1 - b0) * f; if (cross === null || Math.abs(at - r.at) < Math.abs(cross - r.at)) cross = at; }
      }
      if (cross === null) return { label: label, score: 0, note: 'Didn\'t move ' + ctlName(r.deck + '.' + r.key) + (r.to < from ? ' down' : ' up') + ' on ' + barBeat(r.at) + '.' };
      var err = cross - r.at, s = timingScore(err, r.tol || 0.25);
      return { label: label, score: s, err: err, note: s === 100 ? '' : (r.say || ctlName(r.deck + '.' + r.key) + ' moved') + ' ' + beats(err) + ' ' + (err > 0 ? 'late' : 'early') + '.' };
    },
    /** Follow a line: [[beat, value], ...]. */
    ramp: function (r, E, S) {
      var g = r.grid || r.deck, key = sampleKey(r.key), errs = [], worst = null, a = r.pts[0][0], z = r.pts[r.pts.length - 1][0];
      S.forEach(function (s) { var b = s[g].beat; if (b < a || b > z) return; var t = interp(r.pts, b), e = Math.abs(s[r.deck][key] - t); errs.push(e); if (!worst || e > worst.e) worst = { e: e, b: b, v: s[r.deck][key], t: t }; });
      var label = ctlName(r.deck + '.' + r.key) + ' from ' + barBeat(a) + ' to ' + barBeat(z);
      if (!errs.length) return { label: label, score: 0, note: 'Missed the ' + ctlName(r.deck + '.' + r.key) + ' move (' + barBeat(a) + ' to ' + barBeat(z) + ').' };
      var mean = errs.reduce(function (x, y) { return x + y; }, 0) / errs.length, s = clamp(100 - Math.max(0, mean - 0.04) * 260);
      return { label: label, score: s, note: s >= 80 ? '' : ctlName(r.deck + '.' + r.key) + ' was off the line by ' + Math.round(mean * 100) + '% on average; furthest at ' + barBeat(worst.b) + ' (' + Math.round(worst.v * 100) + '% where it should have been ' + Math.round(worst.t * 100) + '%).' };
    },
    /** Something must be true at a beat: e.g. filter back in the middle when the drop hits. */
    state: function (r, E, S) {
      var v = valAt(S, r.deck, r.key, r.at, r.grid), ok = v !== null && (r.op === '<' ? v < r.v : r.op === '>' ? v > r.v : Math.abs(v - r.v) <= (r.tol || 0.06));
      return { label: r.label || ctlName(r.deck + '.' + r.key) + ' at ' + barBeat(r.at), score: ok ? 100 : 0, note: ok ? '' : r.msg };
    },
    /** A loop of a given length running (or none, with len 0) at a beat. */
    loop: function (r, E, S) {
      var v = valAt(S, r.deck, 'loop', r.at, r.grid) || 0, ok = r.len ? Math.abs(v - r.len) < 1e-3 || (r.alt && r.alt.indexOf(Math.round(v * 1000) / 1000) !== -1) : !v;
      return { label: r.label || 'Deck ' + r.deck + (r.len ? ' looping ' + beats(r.len) : ' not looping') + ' at ' + barBeat(r.at), score: ok ? 100 : 0, note: ok ? '' : r.msg || (r.len ? 'Deck ' + r.deck + ' wasn\'t looping ' + beats(r.len) + ' at ' + barBeat(r.at) + (v ? ' (it was ' + beats(v) + ')' : '') + '.' : 'Deck ' + r.deck + '\'s loop was still on at ' + barBeat(r.at) + '.') };
    },
    /** An FX on (kind) or off at a beat. */
    fx: function (r, E, S) {
      var v = valAt(S, r.deck, 'fx', r.at, r.grid) || '', ok = r.on ? v.indexOf(r.on) === 0 : !v;
      return { label: r.label || 'Deck ' + r.deck + ' FX at ' + barBeat(r.at), score: ok ? 100 : 0, note: ok ? '' : r.msg || (r.on ? 'Deck ' + r.deck + '\'s ' + r.on + ' wasn\'t on at ' + barBeat(r.at) + '.' : 'Deck ' + r.deck + '\'s FX was still on at ' + barBeat(r.at) + '.') };
    },
    /** No bass clash between beats a and b (both LOW EQs up with both faders open). */
    noClash: function (r, E, S) {
      var clash = 0, start = null, g = r.grid || 'A';
      for (var i = 1; i < S.length; i++) { var b = S[i][g].beat; if (b < r.from || b > r.to) continue; if (Sc.bassOn(S[i].A) && Sc.bassOn(S[i].B)) { var d = b - S[i - 1][g].beat; if (d > 0 && d < 2) { clash += d; if (start === null) start = b; } } }
      var allowed = r.allow || 0.25, s = clamp(100 - Math.max(0, clash - allowed) * 12);
      return { label: 'No bass clash', score: s, note: clash > allowed ? 'Bass clash for ' + beats(clash) + ' from ' + barBeat(start) + '.' : '' };
    },
    /** Phrases lined up: the two decks' bar 1s fall together (within tol beats, mod 32). */
    align: function (r, E, S) {
      var s0 = null; S.forEach(function (s) { if (s.A.on && s.B.on && Math.abs(s.A.beat - r.at) < 0.1) s0 = s; });
      if (!s0) S.forEach(function (s) { if (s.A.on && s.B.on && (!s0 || Math.abs(s.A.beat - r.at) < Math.abs(s0.A.beat - r.at))) s0 = s; });
      if (!s0) return { label: 'Phrases lined up', score: 0, note: 'Both decks need to be playing at ' + barBeat(r.at) + '.' };
      var d = ((s0.A.beat - s0.B.beat) % 32 + 48) % 32 - 16, s = timingScore(d, r.tol || 0.25);
      return { label: 'Phrases lined up at ' + barBeat(r.at), score: s, note: s === 100 ? '' : 'Deck B\'s phrases were ' + beats(d) + ' ' + (d < 0 ? 'ahead of' : 'behind') + ' Deck A\'s at ' + barBeat(r.at) + '.' };
    },
    /** Tempo ride: reach a BPM, without any sudden jumps. */
    tempo: function (r, E, S) {
      var lastB = null, lastBpm = null, maxStep = 0, at = null, end = null, g = r.grid || r.deck;
      S.forEach(function (s) { var b = s[g].beat; if (b < r.from || b > r.to || !s[r.deck].on) return; if (lastB !== null && b - lastB > 0) { var step = Math.abs(s[r.deck].bpm - lastBpm) / (b - lastB); if (step > maxStep) { maxStep = step; at = b; } } lastB = b; lastBpm = s[r.deck].bpm; end = s[r.deck].bpm; });
      var reach = end === null ? 99 : Math.abs(end - r.target), sm = maxStep > (r.maxStep || 0.25), s = clamp(100 - reach * 40 - (sm ? Math.min(50, (maxStep - (r.maxStep || 0.25)) * 100) : 0));
      var notes = []; if (reach > 0.5) notes.push('Ended at ' + (end || 0).toFixed(1) + ' BPM, aiming for ' + r.target + '.'); if (sm) notes.push('The tempo jumped ' + maxStep.toFixed(2) + ' BPM in a beat at ' + barBeat(at) + ': move the pitch fader in smaller, slower steps.');
      return { label: 'Tempo to ' + r.target + ' BPM smoothly', score: s, note: notes.join(' ') };
    },
    /** Keep the beats locked: phase error between decks during a window (ms). */
    phaseLock: function (r, E, S) {
      var errs = []; S.forEach(function (s) { var b = s.A.beat; if (b < r.from || b > r.to || !s.A.on || !s.B.on) return; var ph = (s.B.beat - Math.floor(s.B.beat)) - (s.A.beat - Math.floor(s.A.beat)); if (ph > 0.5) ph -= 1; if (ph < -0.5) ph += 1; errs.push(Math.abs(ph * 60 / (s.A.bpm || 128) * 1000)); });
      if (!errs.length) return { label: 'Beats locked', score: 0, note: 'Both decks need to be playing.' };
      var mean = errs.reduce(function (a, b) { return a + b; }, 0) / errs.length, worst = Math.max.apply(null, errs), s = clamp(100 - Math.max(0, mean - 8) * 3);
      return { label: 'Beats locked together', score: s, note: s >= 85 ? '' : 'The kicks were ' + Math.round(mean) + ' ms apart on average (worst ' + Math.round(worst) + ' ms). Correct drift with small pitch fader moves, not just the jog wheel.' };
    },
    /** Phrase-locked double drop: the two tracks' phrase starts (every 32 beats) land together. */
    dropTogether: function (r, E, S) { return RULES.align({ at: r.at, tol: r.tol || 0.25 }, E, S); }
  };
  function interp(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i], f = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * f; }
    return pts[pts.length - 1][1];
  }

  function evaluate(rules, events, samples) {
    var E = events.map(function (e) { return Object.assign({}, e); }), parts = [];
    rules.forEach(function (r) { var fn = RULES[r.type]; if (!fn) return; var p = fn(r, E, samples); p.w = r.w || 1; p.type = r.type; parts.push(p); });
    var tw = parts.reduce(function (s, p) { return s + p.w; }, 0) || 1, total = Math.round(parts.reduce(function (s, p) { return s + p.score * p.w; }, 0) / tw);
    var notes = parts.filter(function (p) { return p.note; }).sort(function (a, b) { return a.score - b.score; }).map(function (p) { return p.note; });
    var good = parts.filter(function (p) { return p.score === 100; }).slice(0, 3).map(function (p) { return p.label + ': spot on.'; });
    return { total: total, grade: grade(total), parts: parts, notes: notes.slice(0, 5), good: good };
  }

  // ---------- mastery and unlocks ----------
  /** attempts: [{ score, aidsOff: bool }] (tests only). Learning -> Solid (3 of the last 5 at 70+) -> Locked in (3 of the last 5 at 85+ with every aid off). */
  function mastery(attempts) {
    var last = (attempts || []).slice(-5), solid = last.filter(function (a) { return a.score >= 70; }).length >= 3, locked = last.filter(function (a) { return a.score >= 85 && a.aidsOff; }).length >= 3;
    var best = (attempts || []).reduce(function (m, a) { return Math.max(m, a.score); }, 0);
    return { level: locked ? 'Locked in' : solid ? 'Solid' : 'Learning', best: best, tests: (attempts || []).length, needs: locked ? '' : solid ? 'Score 85+ with the phrase counter, waveforms and energy meter all hidden, 3 times in your last 5 tests.' : 'Score 70+ in 3 of your last 5 tests.' };
  }
  /** Techniques unlock in order: each one after you've passed (60+) a test of the one before. */
  function unlocked(order, progress) {
    var out = {};
    order.forEach(function (id, i) { out[id] = i === 0 || ((progress[order[i - 1]] || []).some(function (a) { return a.score >= 60; })) || !!out[id]; });
    return out;
  }
  /** Warm-up order: learned techniques, the weakest first (more likely to come up). */
  function warmupPick(learned, progress, rand) {
    rand = rand || Math.random;
    var w = learned.map(function (id) { var a = progress[id] || [], last = a.slice(-5), avg = last.length ? last.reduce(function (s, x) { return s + x.score; }, 0) / last.length : 50; return { id: id, w: 0.25 + (100 - avg) / 100 }; });
    var tot = w.reduce(function (s, x) { return s + x.w; }, 0), r = rand() * tot;
    for (var i = 0; i < w.length; i++) { r -= w[i].w; if (r <= 0) return w[i].id; }
    return w.length ? w[w.length - 1].id : null;
  }

  // ---------- recognising techniques in Free mix and Set mode ----------
  // Each looks at recent events/samples and returns { tech, deck, score, note } once, when the move finishes.
  var RECOG = {
    loopManual: function (E) {
      for (var i = E.length - 1; i >= 0; i--) { var e = E[i]; if (!/\.loopOut$/.test(e.id) || !e.down || e.seen) continue; var d = e.id[0], inn = E.slice(0, i).reverse().filter(function (x) { return x.id === d + '.loopIn' && x.down; })[0]; if (!inn) continue; var len = e['b' + d] - inn['b' + d]; if (len < 0.5 || len > 64) continue; var k = Math.round(len), off = Math.abs(len - k); e.seen = true; return { tech: 'loopManual', deck: d, score: timingScore(off, 0.125), note: k + '-beat loop ' + (off <= 0.125 ? 'right on the beat' : 'off the beat by ' + beats(off)) }; }
      return null;
    },
    halvingBuild: function (E) {
      // 3+ halvings on the LOOP knob within 16 beats, then the loop released on a bar's 1
      for (var i = E.length - 1; i >= 0; i--) {
        var x = E[i]; if (x.seen || !(/\.loopPush$/.test(x.id) && x.down) && !(/\.pad\.loop\.\d$/.test(x.id) && x.down)) continue;
        var d = x.id[0], halves = E.slice(0, i).filter(function (e) { return e.id === d + '.loopKnob' && e.delta < 0 && x['b' + d] - e['b' + d] <= 16; });
        if (halves.length < 3) continue;
        x.seen = true; var off = x['b' + d] - Math.round(x['b' + d] / 4) * 4;
        return { tech: 'halvingBuild', deck: d, score: timingScore(off, 0.125), note: halves.length + ' halvings, released ' + (Math.abs(off) <= 0.125 ? 'right on the 1' : beats(off) + ' ' + (off > 0 ? 'late' : 'early')) };
      }
      return null;
    },
    rollFill: function (E) {
      for (var i = E.length - 1; i >= 0; i--) { var e = E[i]; if (e.seen || e.down !== false || !/\.pad\.loopShift\.\d$/.test(e.id)) continue; var d = e.id[0], off = e['b' + d] - Math.round(e['b' + d]); e.seen = true; return { tech: 'rollFill', deck: d, score: timingScore(off, 0.125), note: 'roll released ' + (Math.abs(off) <= 0.125 ? 'on the beat' : beats(off) + ' ' + (off > 0 ? 'late' : 'early')) }; }
      return null;
    },
    echoOut: function (E, S) {
      // an echo on a deck, then that deck's fader cut to zero within a beat while the echo is on
      for (var i = S.length - 1; i > 0; i--) {
        var s = S[i], p = S[i - 1];
        for (var k = 0; k < 2; k++) { var d = k ? 'B' : 'A'; if (s.seen || !(p[d].vol > 0.3 && s[d].vol < 0.05 && String(p[d].fx).indexOf('echo') === 0)) continue; var j = i; while (j > 0 && S[i][d].beat - S[j][d].beat < 1) j--; if (S[j][d].vol < 0.6) continue; s.seen = true; var off = s[d].beat - Math.round(s[d].beat / 4) * 4; return { tech: 'echoOut', deck: d, score: timingScore(off, 0.125), note: 'echo out cut ' + (Math.abs(off) <= 0.125 ? 'on the 1' : beats(off) + ' off the 1') }; }
      }
      return null;
    },
    fastSwap: function (E, S) {
      for (var i = S.length - 1; i > 20; i--) {
        var s = S[i]; if (s.seen) continue;
        var nowA = Sc.bassOn(s.A), nowB = Sc.bassOn(s.B); if (nowA === nowB) continue;
        var to = nowA ? 'A' : 'B', from = to === 'A' ? 'B' : 'A', j = i; while (j > 0 && s[from].beat - S[j][from].beat < 4 && !(Sc.bassOn(S[j][from]) && !Sc.bassOn(S[j][to]))) j--;
        if (!(Sc.bassOn(S[j][from]) && !Sc.bassOn(S[j][to])) || !S[j][to].on || !S[j][from].on) continue;
        var took = s[from].beat - S[j][from].beat; if (took > 2) continue; s.seen = true;
        return { tech: 'fastSwap', deck: to, score: clamp(100 - Math.max(0, took - 1) * 60), note: 'bass handed to Deck ' + to + ' in ' + beats(took) };
      }
      return null;
    },
    filterSweep: function (E, S) {
      for (var i = S.length - 1; i > 0; i--) { var s = S[i], p = S[i - 1]; for (var k = 0; k < 2; k++) { var d = k ? 'B' : 'A'; if (s.seen || !(Math.abs(p[d].filter - 0.5) > 0.25 && Math.abs(s[d].filter - 0.5) < 0.06 && s[d].on)) continue; var peak = 0; for (var j = i; j > 0 && s[d].beat - S[j][d].beat < 64; j--) peak = Math.max(peak, Math.abs(S[j][d].filter - 0.5)); if (peak < 0.3) continue; s.seen = true; var off = s[d].beat - Math.round(s[d].beat / 4) * 4; return { tech: 'filterSweep', deck: d, score: timingScore(off, 0.125), note: 'filter back to the middle ' + (Math.abs(off) <= 0.125 ? 'on the 1' : beats(off) + ' off the 1') }; } }
      return null;
    }
  };
  function recognise(events, samples) { var out = []; Object.keys(RECOG).forEach(function (k) { var r = RECOG[k](events, samples); if (r) out.push(r); }); return out; }

  var api = { evaluate: evaluate, RULES: RULES, beats: beats, barBeat: barBeat, ctlName: ctlName, timingScore: timingScore, mastery: mastery, unlocked: unlocked, warmupPick: warmupPick, recognise: recognise, RECOG: RECOG, interp: interp, grade: grade };
  root.BoothSkills = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
