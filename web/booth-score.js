/*
 * Afterhours: Booth · scoring and coach notes. Pure functions (tested in Node).
 *
 * The game samples every control at a steady rate (20 per second) plus the
 * measured master loudness, and hands the samples here:
 *   sample = { t, db, A: deckSample, B: deckSample }
 *   deckSample = { on, vol, low, mid, high, filter, beat, bpm }
 *     on: playing; vol/low/mid/high/filter: knob positions 0..1 (EQ/filter 0.5 = centre);
 *     beat: position in that track's own beat grid (0 = its bar 1); bpm: effective tempo.
 * Bars in notes are the outgoing deck's bars (bar = floor(beat / 4) + 1).
 *
 * Each transition gets four scores (0-100): bass clash, volume, timing, smoothness,
 * a total weighted by technique, and coach notes that only say what the numbers show.
 */
(function (root) {
  'use strict';
  var PHRASE = 32;                       // beats: 8 bars
  function eqGain(v) { return v <= 0.5 ? Math.pow(v / 0.5, 2) : 1 + (v - 0.5) * 2; }
  function faderGain(v) { return v <= 0 ? 0 : v * v; }
  /** In the mix at all: playing with the fader off the bottom (a fade-in starts the moment the fader leaves zero). */
  function audible(d) { return !!d && d.on && d.vol > 0.005; }
  /** Its bass is really in the mix: fader above ~-24 dB, LOW above ~-12 dB, not high-passed away. */
  function bassOn(d) { return audible(d) && faderGain(d.vol) >= 0.06 && eqGain(d.low) >= 0.25 && !(d.filter > 0.68); }
  function other(k) { return k === 'A' ? 'B' : 'A'; }
  function bar(beat) { return Math.floor(beat / 4) + 1; }
  function barBeat(beat) { var b = Math.floor(beat); return 'bar ' + bar(b) + (b % 4 ? ' beat ' + (((b % 4) + 4) % 4 + 1) : ''); }
  function round(x, n) { var p = Math.pow(10, n || 0); return Math.round(x * p) / p; }
  function clamp(x) { return Math.max(0, Math.min(100, Math.round(x))); }
  function plural(n, w) { return n + ' ' + w + (Math.abs(n) === 1 ? '' : 's'); }
  function nearestBoundary(beat) { var o = ((beat % PHRASE) + PHRASE) % PHRASE; return o > PHRASE / 2 ? o - PHRASE : o; }   // beats after (+) or before (-) the nearest phrase start

  /** Find transitions: the moment a deck comes into the mix while the other is in it, until one leaves for good (2+ beats). */
  function findTransitions(S) {
    var out = [], cur = null;
    for (var i = 1; i < S.length; i++) {
      var p = S[i - 1], s = S[i];
      ['A', 'B'].forEach(function (k) {
        var o = other(k);
        if (!cur && audible(s[k]) && !audible(p[k]) && audible(s[o])) cur = { to: k, from: o, i0: i };
      });
      if (cur) {
        var gone = null;
        [cur.from, cur.to].forEach(function (k) { if (!gone && !audible(s[k])) gone = k; });
        if (gone) {
          // still gone 2 beats later (by the remaining deck's grid)?
          var stay = gone === cur.from ? cur.to : cur.from, b0 = s[stay].beat, j = i, back = false;
          while (j < S.length && S[j][stay].beat - b0 < 2) { if (audible(S[j][gone])) { back = true; break; } j++; }
          if (!back) { cur.i1 = i; cur.aborted = gone === cur.to; out.push(cur); cur = null; }
        }
      }
    }
    if (cur) { cur.i1 = S.length - 1; cur.open = true; out.push(cur); }
    return out;
  }

  /** Beats elapsed between samples i and i+1 on deck k's grid (never negative; ignores jumps). */
  function step(S, i, k) { var d = S[i + 1][k].beat - S[i][k].beat; return d > 0 && d < 2 ? d : 0; }

  function score(S, tr, opts) {
    opts = opts || {};
    var tech = opts.technique || 'free', plan = opts.plan || null, from = tr.from, to = tr.to;
    var i0 = tr.i0, i1 = tr.i1, notes = [], good = [], ev = {};
    var outBeat = function (i) { return S[i][from].beat; };
    // a beat count on the outgoing deck's grid that carries on after it stops (following the incoming deck)
    var lastOn = i0; for (var q = i0; q < S.length && S[q][from].on; q++) lastOn = q;
    var gridBeat = function (j) { return j <= lastOn || !S[j][to].on ? S[j][from].beat : S[lastOn][from].beat + (S[j][to].beat - S[lastOn][to].beat); };

    // ---- bass clash: both basses in the mix at once, counted in beats ----
    var clashes = [], cl = null, totalClash = 0;
    for (var i = i0; i < i1; i++) {
      var c = bassOn(S[i].A) && bassOn(S[i].B) && (tech !== 'volume' || (S[i].A.vol >= 0.5 && S[i].B.vol >= 0.5)), db = step(S, i, from);
      if (c) { if (!cl) cl = { start: outBeat(i), beats: 0 }; cl.beats += db; totalClash += db; }
      else if (cl) { clashes.push(cl); cl = null; }
    }
    if (cl) clashes.push(cl);
    clashes = clashes.filter(function (c) { return c.beats >= 0.5; }).map(function (c) { c.beats = round(c.beats, 1); return c; });
    ev.clashes = clashes;
    var worst = clashes.slice().sort(function (a, b) { return b.beats - a.beats; })[0];
    var allowed = tech === 'volume' ? 8 : 1;          // a volume-only fade can't avoid a short overlap (counted only while both are loud)
    var bassScore = clamp(100 - Math.max(0, totalClash - allowed) * (tech === 'volume' ? 6 : 9));
    if (worst && worst.beats > allowed) notes.push({ sev: worst.beats, text: 'Bass clash for ' + plural(Math.round(worst.beats), 'beat') + ' at bar ' + bar(worst.start) + (tech === 'volume' ? ': both decks loud with their full bass.' : ': both LOW EQs were up with both faders open.') + (clashes.length > 1 ? ' (' + clashes.length + ' clashes in total, ' + round(totalClash, 1) + ' beats.)' : '') });
    // where the bass changed hands
    var swapAt = null;
    for (i = i0; i < i1; i++) if (bassOn(S[i][to]) && !bassOn(S[i][from])) { swapAt = outBeat(i); break; }
    ev.swapBeat = swapAt;
    if (!clashes.length && swapAt !== null && (tech === 'bass' || tech === 'eq' || tech === 'free' || tech === 'long')) good.push('Clean bass swap at ' + barBeat(swapAt) + ', no overlap.');

    // ---- volume: the master's loudness per beat during the blend vs the 8 beats before ----
    function beatDb(a, b) {
      var acc = {}, j;
      for (j = 0; j < S.length; j++) { var bt = Math.floor(gridBeat(j)); if (bt < a || bt >= b || S[j].db === undefined) continue; (acc[bt] = acc[bt] || []).push(Math.pow(10, S[j].db / 10)); }
      var o = {}; Object.keys(acc).forEach(function (k) { var m = acc[k].reduce(function (x, y) { return x + y; }, 0) / acc[k].length; o[k] = 10 * Math.log10(m); }); return o;
    }
    var b0 = Math.floor(outBeat(i0)), b1 = Math.floor(outBeat(Math.max(i0, i1 - 1))) + (tr.open ? 0 : 8);
    var base = beatDb(b0 - 8, b0), baseVals = Object.keys(base).map(function (k) { return base[k]; });
    var volScore = 100, dip = null, spike = null;
    if (baseVals.length >= 3) {
      baseVals.sort(function (a, b) { return a - b; });
      var ref = baseVals[Math.floor(baseVals.length / 2)], during = beatDb(b0, b1 + 1), runD = null, runS = null;
      Object.keys(during).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
        var dv = during[k] - ref;
        if (dv < -3) { if (!runD) runD = { start: k, beats: 0, depth: 0 }; runD.beats++; runD.depth = Math.max(runD.depth, -dv); } else if (runD) { if (!dip || runD.depth * runD.beats > dip.depth * dip.beats) dip = runD; runD = null; }
        if (dv > 3) { if (!runS) runS = { start: k, beats: 0, height: 0 }; runS.beats++; runS.height = Math.max(runS.height, dv); } else if (runS) { if (!spike || runS.height * runS.beats > spike.height * spike.beats) spike = runS; runS = null; }
      });
      if (runD && (!dip || runD.depth * runD.beats > dip.depth * dip.beats)) dip = runD;
      if (runS && (!spike || runS.height * runS.beats > spike.height * spike.beats)) spike = runS;
      if (dip) { volScore -= (dip.depth - 3) * 8 + dip.beats * 2; notes.push({ sev: dip.depth, text: 'Volume dipped ' + round(dip.depth, 1) + ' dB at bar ' + bar(dip.start) + (dip.beats > 1 ? ' for ' + plural(dip.beats, 'beat') : '') + ': the incoming deck wasn\'t up yet when the outgoing one went down.' }); }
      if (spike) { volScore -= (spike.height - 3) * 8 + spike.beats * 2; notes.push({ sev: spike.height, text: 'Volume jumped up ' + round(spike.height, 1) + ' dB at bar ' + bar(spike.start) + (spike.beats > 1 ? ' for ' + plural(spike.beats, 'beat') : '') + ': both decks were loud at once.' }); }
      if (!dip && !spike) good.push('Level stayed steady through the blend (within 3 dB).');
      ev.volumeRef = round(ref, 1);
    } else volScore = null;
    ev.dip = dip; ev.spike = spike;

    // ---- timing: did the incoming come in on a phrase, with its phrases lined up? ----
    var inStart = S[i0][to].beat, outStart = outBeat(i0), off = nearestBoundary(outStart), inOff = nearestBoundary(inStart);
    var align = ((outStart - inStart) % PHRASE + PHRASE) % PHRASE; if (align > PHRASE / 2) align -= PHRASE;
    var timeScore = 100;
    ev.cameIn = { outBeat: round(outStart, 2), inBeat: round(inStart, 2), offBeats: round(off, 1), alignBeats: round(align, 1) };
    if (Math.abs(align) > 1) {
      timeScore -= Math.min(100, (Math.abs(align) - 1) * 15);
      var phraseBar = bar(Math.round((outStart - off) / 4) * 4);
      if (Math.abs(inOff) <= 1) notes.push({ sev: Math.abs(align), text: 'Deck ' + to + ' came in ' + plural(Math.round(Math.abs(off)), 'beat') + ' ' + (off > 0 ? 'after' : 'before') + ' the phrase at bar ' + phraseBar + '. Start it right on the bar where the new phrase begins.' });
      else notes.push({ sev: Math.abs(align), text: 'Deck ' + to + '\'s phrases don\'t line up with Deck ' + from + '\'s: it came in at its ' + barBeat(inStart) + ' while Deck ' + from + ' was at ' + barBeat(outStart) + '. Cue it from the start of a phrase (bar 1, 9, 17…) and drop it on Deck ' + from + '\'s phrase.' });
    } else good.push('Came in on the phrase at bar ' + bar(Math.round(outStart)) + '.');
    if (plan && plan.start !== undefined) {
      var late = outStart - plan.start;
      if (Math.abs(late) > 1) { timeScore -= Math.min(40, (Math.abs(late) - 1) * 4); notes.push({ sev: Math.abs(late) / 4, text: 'Brought Deck ' + to + ' in ' + barsText(late) + ' ' + (late > 0 ? 'late' : 'early') + ' (bar ' + bar(outStart) + ' instead of bar ' + bar(plan.start) + ').' }); }
    }
    var endBeat = outBeat(Math.min(i1, S.length - 1));
    if (tr.aborted) endBeat = S[Math.min(i1, S.length - 1)][from].beat;
    ev.endBeat = round(endBeat, 2);
    if (plan && plan.swap !== undefined && swapAt !== null) {
      var ds = swapAt - plan.swap;
      if (Math.abs(ds) > 1) { timeScore -= Math.min(30, (Math.abs(ds) - 1) * 3); notes.push({ sev: Math.abs(ds) / 4, text: 'Swapped the bass ' + barsText(ds) + ' ' + (ds > 0 ? 'late' : 'early') + ' (' + barBeat(swapAt) + ' instead of bar ' + bar(plan.swap) + ').' }); }
    }
    if (plan && plan.end !== undefined && !tr.open) {
      var de = endBeat - plan.end;
      if (Math.abs(de) > 2) { timeScore -= Math.min(30, (Math.abs(de) - 2) * 2); notes.push({ sev: Math.abs(de) / 4, text: 'Faded Deck ' + from + ' out ' + barsText(de) + ' ' + (de > 0 ? 'late' : 'early') + ' (gone at ' + barBeat(endBeat) + ', aim for bar ' + bar(plan.end) + ').' }); }
    }
    if (tr.aborted) notes.push({ sev: 10, text: 'Deck ' + to + ' went back out at ' + barBeat(endBeat) + ' before Deck ' + from + ' left, so the transition didn\'t finish.' });

    // ---- smoothness: steady fader and EQ moves (no wobbles; no jumps unless the technique is a cut) ----
    var moves = [], smooth = 100;
    var watch = [[from, 'vol', 'volume'], [to, 'vol', 'volume'], [from, 'low', 'LOW'], [to, 'low', 'LOW'], [from, 'filter', 'FILTER'], [to, 'filter', 'FILTER']];
    watch.forEach(function (w) {
      var k = w[0], key = w[1], dir = 0, ext = S[i0][k][key], wob = [], jumps = [], last = Math.min(i1 + 1, S.length);
      for (var j = i0 + 1; j < last; j++) {
        var v = S[j][k][key], d = v - ext;
        if (Math.abs(d) >= 0.04) { var nd = d > 0 ? 1 : -1; if (dir && nd !== dir) wob.push(outBeat(j)); dir = nd; ext = v; }
        if ((dir > 0 && v > ext) || (dir < 0 && v < ext)) ext = v;
      }
      // a jump: more than a third of the travel within one beat; reported from where the move started to where it stopped
      var floor = Math.max(0, i0 - 80), done = i0;
      for (j = i0 + 1; j < last; j++) {
        var j0 = j; while (j0 > done && outBeat(j) - outBeat(j0 - 1) <= 1) j0--;
        if (Math.abs(S[j][k][key] - S[j0][k][key]) > 0.35) {
          var sgn = S[j][k][key] > S[j0][k][key] ? 1 : -1, s0 = j0, e0 = j;
          while (s0 < j && Math.abs(S[s0 + 1][k][key] - S[s0][k][key]) <= 0.001) s0++;            // skip the still part before the move
          while (s0 > floor && (S[s0][k][key] - S[s0 - 1][k][key]) * sgn > 0.001) s0--;            // back to where the move began
          while (e0 + 1 < last && (S[e0 + 1][k][key] - S[e0][k][key]) * sgn > 0.001) e0++;          // on to where it stopped
          jumps.push({ at: outBeat(Math.min(s0 + 1, e0)), from: S[s0][k][key], to: S[e0][k][key] });
          done = e0; j = e0;
        }
      }
      var jumpOk = tech === 'cut' || (key === 'low' && (tech === 'bass' || tech === 'free')) || key === 'filter' && tech === 'cut';
      // one change of direction can be on purpose; two or more is a wobble
      if (wob.length >= 2) { smooth -= wob.length * 12; moves.push({ sev: wob.length, text: 'Deck ' + k + ' ' + w[2] + ' went back and forth (changed direction ' + wob.length + ' times from bar ' + bar(wob[0]) + '). Pick a direction and keep going.' }); }
      if (!jumpOk && jumps.length) { smooth -= jumps.length * 15; var jp = jumps[0]; moves.push({ sev: jumps.length * 2, text: 'Deck ' + k + ' ' + w[2] + ' jumped from ' + Math.round(jp.from * 100) + '% to ' + Math.round(jp.to * 100) + '% within a beat at bar ' + bar(jp.at) + '. Spread that move over ' + (tech === 'long' ? '8 bars or more' : 'a few bars') + '.' }); }
    });
    notes = notes.concat(moves);
    smooth = clamp(smooth);
    if (!moves.length) good.push('Smooth, even fader and EQ moves.');

    // ---- total ----
    var W = { bass: [.35, .2, .25, .2], eq: [.3, .25, .15, .3], filter: [.25, .25, .2, .3], volume: [.1, .35, .25, .3], long: [.3, .25, .15, .3], cut: [.3, .25, .45, 0], free: [.3, .25, .2, .25] }[tech] || [.3, .25, .2, .25];
    var parts = [bassScore, volScore === null ? null : clamp(volScore), clamp(timeScore), smooth], sum = 0, wsum = 0;
    parts.forEach(function (p, k) { if (p !== null) { sum += p * W[k]; wsum += W[k]; } });
    var total = Math.round(sum / (wsum || 1));
    if (tr.aborted) total = Math.min(total, 40);
    notes.sort(function (a, b) { return b.sev - a.sev; });
    return {
      from: from, to: to, technique: tech, total: total, grade: grade(total),
      scores: { bass: bassScore, volume: volScore === null ? null : clamp(volScore), timing: clamp(timeScore), smooth: smooth },
      notes: notes.slice(0, 4).map(function (n) { return n.text; }), good: good.slice(0, 2),
      events: ev, window: { i0: i0, i1: i1, fromBeat: round(outStart, 2), toBeat: ev.endBeat, bars: round((ev.endBeat - outStart) / 4, 1) }, clashBeats: round(totalClash, 1)
    };
  }
  function barsText(beats) { var b = Math.round(Math.abs(beats)); return b >= 4 && b % 4 === 0 ? plural(b / 4, 'bar') : b >= 4 ? round(b / 4, 1) + ' bars' : plural(Math.round(b), 'beat'); }
  function grade(t) { return t >= 95 ? 'S' : t >= 85 ? 'A' : t >= 70 ? 'B' : t >= 55 ? 'C' : 'D'; }

  /** A quick cut: the incoming comes up and the outgoing goes down at the same moment, on the phrase (plan.start). */
  function scoreCut(S, from, to, plan, i0) {
    i0 = i0 || 0;
    var up = -1, down = -1, i;
    for (i = Math.max(1, i0); i < S.length; i++) { if (up < 0 && audible(S[i][to]) && !audible(S[i - 1][to])) up = i; if (down < 0 && !audible(S[i][from]) && audible(S[i - 1][from]) && (up < 0 || i >= up - 40)) down = i; if (up >= 0 && down >= 0) break; }
    if (up < 0 || down < 0) return null;
    var g = function (j) { return S[j][from].on ? S[j][from].beat : S[up][from].beat + (S[j][to].beat - S[up][to].beat); };
    var upB = g(up), downB = g(down), target = plan && plan.start !== undefined ? plan.start : Math.round(upB / PHRASE) * PHRASE;
    var notes = [], good = [], gap = downB - upB;   // > 0: both up for a while; < 0: silence between
    var off = (upB + downB) / 2 - target, timing = clamp(100 - Math.max(0, Math.abs(off) - 0.5) * 25);
    var clean = clamp(100 - Math.max(0, Math.abs(gap) - 0.25) * 40);
    if (Math.abs(off) > 0.5) notes.push('Cut ' + (Math.abs(off) < 4 ? plural(Math.round(Math.abs(off) * 2) / 2, 'beat') : barsText(off)) + ' ' + (off > 0 ? 'late' : 'early') + ': aim for bar ' + bar(target) + ' (the 1).');
    else good.push('Cut right on bar ' + bar(target) + '.');
    if (gap > 0.25) notes.push('Both decks were up together for ' + round(gap, 1) + ' beats at bar ' + bar(upB) + '. Move both faders in the same instant.');
    else if (gap < -0.25) notes.push('A gap of ' + round(-gap, 1) + ' beats with nothing playing at bar ' + bar(downB) + '. Move both faders in the same instant.');
    else good.push('Clean handover, no gap and no overlap.');
    var total = Math.round(timing * 0.6 + clean * 0.4);
    return { from: from, to: to, technique: 'cut', total: total, grade: grade(total), scores: { bass: clean, volume: clean, timing: timing, smooth: null }, notes: notes, good: good, events: { upBeat: round(upB, 2), downBeat: round(downB, 2), gap: round(gap, 2) }, window: { i0: Math.min(up, down), i1: Math.max(up, down), fromBeat: round(Math.min(upB, downB), 2), toBeat: round(Math.max(upB, downB), 2) }, clashBeats: Math.max(0, round(gap, 1)) };
  }

  /** Manual beatmatching: tempo error (BPM) and phase drift (ms) over time, for deck k against the other. */
  function scoreBeatmatch(S, k, opts) {
    opts = opts || {};
    var o = other(k), bpmErr = [], phase = [], matchedAt = null, from = opts.fromIndex || 0;
    for (var i = from; i < S.length; i++) {
      var a = S[i][k], b = S[i][o]; if (!a.on || !b.on) continue;
      var e = a.bpm - b.bpm, ph = ((a.beat - Math.floor(a.beat)) - (b.beat - Math.floor(b.beat))); if (ph > 0.5) ph -= 1; if (ph < -0.5) ph += 1;
      var ms = ph * 60 / b.bpm * 1000;
      bpmErr.push(Math.abs(e)); phase.push(ms);
      if (matchedAt === null && Math.abs(e) < 0.1 && Math.abs(ms) < 20) matchedAt = S[i].t - S[from].t;
    }
    if (!bpmErr.length) return null;
    var tail = function (arr, f) { var n = Math.max(1, Math.floor(arr.length / 3)); return arr.slice(-n).reduce(function (s, x) { return s + f(x); }, 0) / n; };
    var endBpm = tail(bpmErr, function (x) { return x; }), endPhase = tail(phase, function (x) { return Math.abs(x); });
    // drift: how much the phase moved over the last third (ms per 8 bars)
    var n = Math.max(2, Math.floor(phase.length / 3)), seg = phase.slice(-n), secs = (S[S.length - 1].t - S[S.length - n].t) || 1, bpm = S[S.length - 1][o].bpm || 128;
    var drift = Math.abs(seg[seg.length - 1] - seg[0]) / secs * (32 * 60 / bpm);
    var sc = clamp(100 - endBpm * 120 - Math.max(0, endPhase - 10) * 1.2 - Math.max(0, drift - 10) * 0.8);
    var notes = [];
    if (endBpm >= 0.1) notes.push('Tempo still ' + round(endBpm, 2) + ' BPM off at the end. Small pitch fader moves: about 0.1 BPM at a time.');
    if (endPhase >= 20) notes.push('Kicks ' + Math.round(endPhase) + ' ms apart on average at the end. Use quick jog nudges until the kicks sound like one.');
    if (drift >= 25) notes.push('Beats drifted ' + Math.round(drift) + ' ms every 8 bars: the tempo is close but not exact.');
    if (matchedAt !== null) notes.push('Matched within ' + round(matchedAt, 1) + ' seconds.');
    return { score: sc, grade: grade(sc), bpmError: round(endBpm, 3), phaseMs: Math.round(endPhase), driftMs: Math.round(drift), matchedAt: matchedAt === null ? null : round(matchedAt, 1), notes: notes };
  }

  /** Ghost line: how closely a control followed a target curve [[beat, value]...] (on deck k's grid by default). */
  function scoreGhost(S, lines) {
    var res = [], tot = 0, cnt = 0;
    lines.forEach(function (L) {
      var errs = [], within = 0, worst = null;
      for (var i = 0; i < S.length; i++) {
        var gb = S[i][L.grid || L.deck].beat; if (gb < L.pts[0][0] || gb > L.pts[L.pts.length - 1][0]) continue;
        var target = interp(L.pts, gb), v = S[i][L.deck][L.key], e = Math.abs(v - target);
        errs.push(e); if (e <= 0.1) within++;
        if (!worst || e > worst.e) worst = { e: e, beat: gb, v: v, target: target };
      }
      if (!errs.length) return;
      var mean = errs.reduce(function (a, b) { return a + b; }, 0) / errs.length, sc = clamp(100 - mean * 220);
      res.push({ label: L.label, score: sc, within: Math.round(within / errs.length * 100), worst: worst });
      tot += sc; cnt++;
    });
    var total = cnt ? Math.round(tot / cnt) : 0;
    var notes = res.filter(function (r) { return r.within < 80; }).map(function (r) { return r.label + ': on the line ' + r.within + '% of the time. Furthest off at ' + barBeat(r.worst.beat) + ' (' + Math.round(r.worst.v * 100) + '% where the line was ' + Math.round(r.worst.target * 100) + '%).'; });
    return { total: total, grade: grade(total), lines: res, notes: notes };
  }
  function interp(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i], f = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * f; }
    return pts[pts.length - 1][1];
  }

  var api = { findTransitions: findTransitions, score: score, scoreCut: scoreCut, scoreBeatmatch: scoreBeatmatch, scoreGhost: scoreGhost, interp: interp, bassOn: bassOn, audible: audible, eqGain: eqGain, faderGain: faderGain, PHRASE: PHRASE, grade: grade, bar: bar };
  root.BoothScore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
