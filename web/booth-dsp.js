/*
 * Afterhours: Booth · signal analysis and generated loops.
 * Pure functions (no browser APIs), so they run in a Web Worker and in Node tests.
 *   analyse(mono, sampleRate) -> { bpm, first, downbeat, key, camelot, waves, dur, sure }
 *   makeLoop(spec) -> { left, right, sampleRate, bpm, first: 0, bars }
 */
(function (root) {
  'use strict';

  // ---------- tempo and beat grid ----------
  function onsets(x, sr) {
    var fps = 200, hop = sr / fps, nf = Math.floor(x.length / hop);
    var lowE = new Float32Array(nf), allE = new Float32Array(nf);
    var a = Math.exp(-2 * Math.PI * 160 / sr), lp = 0, j = 0;
    for (var f = 0; f < nf; f++) {
      var end = Math.floor((f + 1) * hop), el2 = 0, ea = 0, cnt = 0;
      for (; j < end; j++) { var s = x[j]; lp = s + a * (lp - s); el2 += lp * lp; ea += s * s; cnt++; }
      lowE[f] = Math.sqrt(el2 / (cnt || 1)); allE[f] = Math.sqrt(ea / (cnt || 1));
    }
    var raw = new Float32Array(nf), on = new Float32Array(nf), kick = new Float32Array(nf), pre = new Float64Array(nf + 1), w = 40, mx = 0;
    for (f = 1; f < nf; f++) { kick[f] = Math.max(0, lowE[f] - lowE[f - 1]); raw[f] = kick[f] * 2 + Math.max(0, allE[f] - allE[f - 1]); }
    for (f = 0; f < nf; f++) pre[f + 1] = pre[f] + raw[f];
    for (f = 0; f < nf; f++) { var lo = Math.max(0, f - w), hi = Math.min(nf, f + w + 1); on[f] = Math.max(0, raw[f] - (pre[hi] - pre[lo]) / (hi - lo)); if (on[f] > mx) mx = on[f]; }
    if (mx) for (f = 0; f < nf; f++) on[f] /= mx;
    return { on: on, kick: kick, lowE: lowE, fps: fps, nf: nf, mx: mx };
  }
  function comb(sig, nf, fps, bpm, phases) {
    var per = 60 * fps / bpm, top = -1, ph = 0, n2 = phases || 48;
    for (var k = 0; k < n2; k++) {
      var o = per * k / n2, sum = 0, n = 0;
      for (var b = o; b < nf - 1; b += per) { var i = Math.floor(b), fr = b - i; sum += sig[i] * (1 - fr) + sig[i + 1] * fr; n++; }
      sum /= (n || 1);
      if (sum > top) { top = sum; ph = o; }
    }
    return { score: top, first: ph / fps };
  }
  /** Tempo for club music: autocorrelation backed by bar multiples, preferring 110-150, then a fine comb search. */
  function tempo(x, sr, lo, hi) {
    var O = onsets(x, sr), on = O.on, nf = O.nf, fps = O.fps;
    if (!O.mx) return { bpm: 125, first: 0, sure: false, O: O };
    lo = lo || 90; hi = hi || 160;
    var maxL = Math.round(60 * fps / lo), acf = new Float64Array(4 * maxL + 4), L;
    for (L = 20; L < acf.length; L++) { var s = 0; for (var f = 0; f + L < nf; f++) s += on[f] * on[f + L]; acf[L] = s / (nf - L); }
    function pk(i) { return i + 1 < acf.length ? Math.max(acf[i - 1], acf[i], acf[i + 1]) : 0; }
    var best = -1, coarse = 125;
    for (L = Math.round(60 * fps / hi); L <= maxL; L++) {
      var sal = pk(L) + 0.5 * pk(2 * L) + 0.33 * pk(3 * L) + pk(4 * L);
      var bpm = 60 * fps / L, sc = sal * Math.exp(-0.5 * Math.pow(Math.log(bpm / 128) / Math.LN2 / 0.5, 2));
      if (sc > best) { best = sc; coarse = bpm; }
    }
    var fineBest = -1, fine = coarse;
    for (var c = coarse * 0.985; c <= coarse * 1.015; c += 0.01) { var r = comb(on, nf, fps, c).score; if (r > fineBest) { fineBest = r; fine = c; } }
    var rounded = Math.round(fine);
    if (Math.abs(fine - rounded) < 0.06) fine = rounded;
    var first = comb(O.kick, nf, fps, fine, 120).first;
    return { bpm: Math.round(fine * 100) / 100, first: Math.round(first * 10000) / 10000, sure: fineBest > 0, O: O };
  }
  /** Which of the 4 beats starts the bar: the one where the low end changes most often (bass lines, fills, drops land there). */
  function downbeat(O, bpm, first) {
    var per = 60 * O.fps / bpm, score = [0, 0, 0, 0], beats = Math.floor((O.nf - first * O.fps) / per);
    var lowAt = function (b) { var i = Math.round(first * O.fps + b * per); return i >= 0 && i < O.nf ? O.lowE[i] : 0; };
    for (var b = 4; b < beats - 4; b++) {
      // energy jump compared with the previous bar's same beat, plus a little weight for loudness on the beat
      score[b % 4] += Math.abs(lowAt(b) - lowAt(b - 4)) * 0.2 + Math.max(0, lowAt(b) - lowAt(b - 1));
    }
    var k = 0; for (var i = 1; i < 4; i++) if (score[i] > score[k]) k = i;
    return k;
  }

  // ---------- key (Camelot) ----------
  // Krumhansl-Kessler profiles, correlated with a chromagram from a simple FFT.
  var MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Camelot number for each tonic: majors (B) and minors (A).
  var CAM_MAJ = { 0: 8, 7: 9, 2: 10, 9: 11, 4: 12, 11: 1, 6: 2, 1: 3, 8: 4, 3: 5, 10: 6, 5: 7 };
  var CAM_MIN = { 9: 8, 4: 9, 11: 10, 6: 11, 1: 12, 8: 1, 3: 2, 10: 3, 5: 4, 0: 5, 7: 6, 2: 7 };
  function fft(re, im) {
    var n = re.length, i, j = 0;
    for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (j = 0; j < len / 2; j++) {
          var ar = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, ai = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j + len / 2] = re[i + j] - ar; im[i + j + len / 2] = im[i + j] - ai; re[i + j] += ar; im[i + j] += ai;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  function key(x, sr) {
    // decimate to ~11 kHz (averaging), then 4096-point frames every ~0.75 s
    var dec = Math.max(1, Math.round(sr / 11025)), fs = sr / dec, n = Math.floor(x.length / dec), y = new Float32Array(n);
    for (var i = 0; i < n; i++) { var s = 0; for (var k = 0; k < dec; k++) s += x[i * dec + k]; y[i] = s / dec; }
    var N = 4096, hopN = Math.round(fs * 0.75), chroma = new Float64Array(12), re = new Float64Array(N), im = new Float64Array(N);
    var win = new Float64Array(N); for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var binPc = new Int8Array(N / 2), binW = new Float64Array(N / 2);
    for (var b = 1; b < N / 2; b++) {
      var f = b * fs / N; if (f < 55 || f > 2000) { binPc[b] = -1; continue; }
      var midi = 69 + 12 * Math.log(f / 440) / Math.LN2, near = Math.round(midi);
      binPc[b] = ((near % 12) + 12) % 12; binW[b] = Math.max(0, 1 - Math.abs(midi - near) * 2);   // only bins close to a semitone centre
    }
    for (var st = 0; st + N <= n; st += hopN) {
      for (i = 0; i < N; i++) { re[i] = y[st + i] * win[i]; im[i] = 0; }
      fft(re, im);
      var frame = new Float64Array(12), tot = 0;
      for (b = 1; b < N / 2; b++) if (binPc[b] >= 0) { var m = Math.sqrt(re[b] * re[b] + im[b] * im[b]) * binW[b]; frame[binPc[b]] += m; tot += m; }
      if (tot > 0) for (i = 0; i < 12; i++) chroma[i] += frame[i] / tot;
    }
    function corr(p, rot) {
      var ma = 0, mb = 0, j; for (j = 0; j < 12; j++) { ma += chroma[j]; mb += p[j]; } ma /= 12; mb /= 12;
      var num = 0, da = 0, db = 0;
      for (j = 0; j < 12; j++) { var a1 = chroma[(j + rot) % 12] - ma, b1 = p[j] - mb; num += a1 * b1; da += a1 * a1; db += b1 * b1; }
      return da && db ? num / Math.sqrt(da * db) : 0;
    }
    var best = { r: -2 };
    for (var t = 0; t < 12; t++) {
      var rM = corr(MAJ, t), rm = corr(MIN, t);
      if (rM > best.r) best = { r: rM, tonic: t, minor: false };
      if (rm > best.r) best = { r: rm, tonic: t, minor: true };
    }
    if (best.r < 0) return { key: '', camelot: '', sure: 0 };
    return { key: NOTES[best.tonic] + (best.minor ? 'm' : ''), camelot: (best.minor ? CAM_MIN : CAM_MAJ)[best.tonic] + (best.minor ? 'A' : 'B'), sure: Math.round(best.r * 100) / 100 };
  }
  /** Two Camelot keys mix well: same, +/-1 on the wheel, or the relative major/minor. */
  function camelotFriends(a, b) {
    var pa = /^(\d+)([AB])$/.exec(a || ''), pb = /^(\d+)([AB])$/.exec(b || '');
    if (!pa || !pb) return false;
    var na = +pa[1], nb = +pb[1], d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
    return (pa[2] === pb[2] && d <= 1) || (na === nb);
  }

  // ---------- coloured waveform: low / mid / high energy, 100 per second ----------
  function waves(x, sr) {
    var rate = 100, hop = sr / rate, n = Math.ceil(x.length / hop);
    var lo = new Float32Array(n), mid = new Float32Array(n), hi = new Float32Array(n);
    var aL = Math.exp(-2 * Math.PI * 200 / sr), aH = Math.exp(-2 * Math.PI * 2500 / sr), l1 = 0, l2 = 0, h1 = 0, j = 0, mL = 1e-6, mM = 1e-6, mH = 1e-6;
    for (var i = 0; i < n; i++) {
      var end = Math.min(x.length, Math.floor((i + 1) * hop)), pl = 0, pm = 0, ph = 0;
      for (; j < end; j++) {
        var s = x[j]; l1 = s + aL * (l1 - s); l2 = l1 + aL * (l2 - l1);   // 2-pole low
        h1 = s + aH * (h1 - s);                                           // below 2.5k
        var low = l2, high = s - h1, md = h1 - l2;
        if (Math.abs(low) > pl) pl = Math.abs(low); if (Math.abs(md) > pm) pm = Math.abs(md); if (Math.abs(high) > ph) ph = Math.abs(high);
      }
      lo[i] = pl; mid[i] = pm; hi[i] = ph;
      if (pl > mL) mL = pl; if (pm > mM) mM = pm; if (ph > mH) mH = ph;
    }
    var q = function (a, m) { var o = new Uint8Array(a.length); for (var k = 0; k < a.length; k++) o[k] = Math.min(255, Math.round(a[k] / m * 255)); return o; };
    return { rate: rate, low: q(lo, mL), mid: q(mid, mM), high: q(hi, mH) };
  }

  function analyse(mono, sr) {
    var cut = mono.length > sr * 240 ? mono.subarray(Math.floor(sr * 20), Math.floor(sr * 200)) : mono;   // tempo from the body of the track
    var off = cut === mono ? 0 : 20;
    var t = tempo(cut, sr);
    var beat = 60 / t.bpm, first = ((t.first + off) % beat + beat) % beat;
    var db = downbeat(t.O, t.bpm, t.first);
    var firstDown = first + ((db - Math.round(off / beat)) % 4 + 4) % 4 * beat;
    var k = key(mono.length > sr * 300 ? mono.subarray(0, sr * 300) : mono, sr);
    return { bpm: t.bpm, first: Math.round(firstDown * 10000) / 10000, sure: t.sure, key: k.key, camelot: k.camelot, keySure: k.sure, waves: waves(mono, sr), dur: mono.length / sr, v: 2 };
  }

  // ---------- generated loops with exact, known grids ----------
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; }
  /** spec: { parts: ['kick','hats','rumble','acid'], bpm, bars, sampleRate, seed, root } */
  function makeLoop(spec) {
    var sr = spec.sampleRate || 44100, bpm = spec.bpm || 128, bars = spec.bars || 16, beat = 60 / bpm, n = Math.round(bars * 4 * beat * sr);
    var L = new Float32Array(n), R = new Float32Array(n), rand = rng(spec.seed || 7), parts = spec.parts || ['kick'];
    var has = function (p) { return parts.indexOf(p) !== -1; }, steps = bars * 16, step = beat / 4;
    function add(at, len, fn, gl, gr) { var s0 = Math.round(at * sr), e = Math.min(n, s0 + Math.round(len * sr)); for (var i = s0; i < e; i++) { var v = fn((i - s0) / sr); L[i] += v * gl; R[i] += v * (gr === undefined ? gl : gr); } }
    for (var st = 0; st < steps; st++) {
      var t = st * step, inBeat = st % 4;
      if (has('kick') && inBeat === 0) add(t, 0.35, function (u) { var f = 45 + 110 * Math.exp(-u * 28); return Math.sin(2 * Math.PI * (45 * u + 110 * (1 - Math.exp(-u * 28)) / 28)) * Math.exp(-u * 7) * 0.9; }, 1);
      if (has('hats') && inBeat === 2) add(t, 0.06, function (u) { return (rand() * 2 - 1) * Math.exp(-u * 60) * 0.35; }, 0.8, 1);
      if (has('hats') && (inBeat === 1 || inBeat === 3)) add(t, 0.03, function (u) { return (rand() * 2 - 1) * Math.exp(-u * 120) * 0.15; }, 1, 0.8);
      if (has('rumble') && inBeat === 1) add(t, step * 3, function (u) { return Math.sin(2 * Math.PI * 48 * u) * Math.exp(-u * 5) * 0.35 * Math.min(1, u * 40); }, 1);
    }
    if (has('acid')) {
      var root = spec.root || 45, pat = [0, 0, 12, 0, 3, 0, 15, 0, 0, 10, 0, 12, 0, 3, 7, 0], acc = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
      var lp = 0, bp = 0;
      for (var i = 0; i < n; i++) {
        var tt = i / sr, s2 = Math.floor(tt / step), u2 = tt - s2 * step, note = root + pat[s2 % 16], f = 440 * Math.pow(2, (note - 69) / 12);
        var saw = 2 * ((tt * f) % 1) - 1, env = Math.exp(-u2 * (acc[s2 % 16] ? 9 : 18));
        var cutoff = 180 + 2600 * env * (0.6 + 0.4 * Math.sin(2 * Math.PI * tt / (beat * 32))), F = 2 * Math.sin(Math.PI * Math.min(cutoff, sr / 6) / sr), Q = 0.18;
        lp += F * bp; var hp = saw - lp - Q * bp; bp += F * hp;                      // state-variable filter, resonant
        var v = Math.tanh(lp * 1.6) * 0.32 * Math.min(1, u2 * 400) * (u2 < step * 0.8 ? 1 : 0.2);
        L[i] += v; R[i] += v;
      }
    }
    for (var k2 = 0; k2 < n; k2++) { L[k2] = Math.tanh(L[k2]); R[k2] = Math.tanh(R[k2]); }
    return { left: L, right: R, sampleRate: sr, bpm: bpm, first: 0, bars: bars };
  }

  var api = { analyse: analyse, tempo: tempo, key: key, waves: waves, makeLoop: makeLoop, camelotFriends: camelotFriends };
  root.BoothDSP = api;
  if (typeof module !== 'undefined') module.exports = api;
  // As a Web Worker: analyse tracks off the main thread.
  if (typeof importScripts === 'function' && typeof window === 'undefined') {
    root.onmessage = function (e) {
      var d = e.data;
      try { var r = analyse(d.mono, d.sampleRate); root.postMessage({ id: d.id, ok: true, result: r }); }
      catch (err) { root.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) }); }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
