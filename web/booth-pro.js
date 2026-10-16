/*
 * Afterhours: Booth · phase 6, real-world skills (pure, so it can be tested).
 *  - Quantise: a hot cue jump keeps the beat (lands at the same point in the beat you jumped from), like Q on a CDJ.
 *  - Toneplay: pads play the track from hot cue 1, pitched in semitones (vinyl style: speed and pitch move together).
 *  - Track selection: what makes a good next track (tempo, key on the Camelot wheel, energy), scored and explained,
 *    and a quiz that builds the habit.
 */
(function (root) {
  /** Where a quantised jump lands: the target hot cue plus how far into the current beat you are. */
  function quantJump(pos, target, first, bpm) {
    if (!bpm) return target;
    var beat = 60 / bpm, into = ((pos - first) % beat + beat) % beat;
    if (into > beat - 1e-6) into = 0;
    var start = first + Math.floor((target - first) / beat + 1e-6) * beat;   // the beat the hot cue is on
    return start + into;
  }
  // Toneplay pads: top row down, bottom row up (pad 1 = -4 ... pad 8 = +4, no 0: the hot cue itself plays at pitch)
  var TONES = [-1, -2, -3, -4, 1, 2, 3, 4];
  function toneRate(semi) { return Math.pow(2, (semi || 0) / 12); }

  // ---------- track selection ----------
  function cam(c) { var m = /^(\d{1,2})([AB])$/.exec(c || ''); return m ? { n: +m[1], l: m[2] } : null; }
  /** Key relation on the Camelot wheel: 'same', 'adjacent' (±1), 'relative' (A/B same number), 'boost' (+2, an energy lift), 'clash' or 'unknown'. */
  function keyRelation(a, b) {
    var x = cam(a), y = cam(b); if (!x || !y) return 'unknown';
    var up = (y.n - x.n + 12) % 12, down = (x.n - y.n + 12) % 12, d = Math.min(up, down);
    if (x.l === y.l && d === 0) return 'same';
    if (x.l !== y.l && d === 0) return 'relative';
    if (x.l === y.l && d === 1) return 'adjacent';
    if (x.l === y.l && up === 2) return 'boost';
    return 'clash';
  }
  /** Tempo: percent change needed (also allowing half / double time). */
  function tempoGap(a, b) {
    if (!a || !b) return null;
    var best = Infinity; [b, b * 2, b / 2].forEach(function (t) { best = Math.min(best, Math.abs(t / a - 1) * 100); });
    return Math.round(best * 10) / 10;
  }
  /**
   * How well `next` follows `cur` (0-100), with the reasons a DJ would give. Energy is optional (1-10).
   * cur/next: { bpm, camelot, energy, genre }
   */
  function nextScore(cur, next, want) {
    var s = 100, why = [], good = [];
    var t = tempoGap(cur.bpm, next.bpm), k = keyRelation(cur.camelot, next.camelot);
    if (t === null) why.push('No tempo for one of them yet: analyse it first.');
    else if (t <= 2) good.push('Tempo within ' + t + '%: an easy, clean match.');
    else if (t <= 4) { s -= 15; why.push('Tempo ' + t + '% apart: it works, but the pitch moves enough to hear.'); }
    else if (t <= 6) { s -= 35; why.push('Tempo ' + t + '% apart: a big pitch change. Better with a quick cut or a loop.'); }
    else { s -= 60; why.push('Tempo ' + t + '% apart: too far to blend.'); }
    if (k === 'same') good.push('Same key (' + next.camelot + '): no clash at all.');
    else if (k === 'adjacent') good.push('One step on the Camelot wheel (' + cur.camelot + ' to ' + next.camelot + '): blends smoothly.');
    else if (k === 'relative') good.push('Relative major/minor (' + cur.camelot + ' to ' + next.camelot + '): same notes, different mood.');
    else if (k === 'boost') { s -= 5; good.push('Two steps up (' + cur.camelot + ' to ' + next.camelot + '): an energy lift. Mix it quickly so the clash doesn\'t linger.'); }
    else if (k === 'clash') { s -= 40; why.push(cur.camelot + ' and ' + next.camelot + ' are far apart on the wheel: the basslines and melodies will clash. Only with a hard cut.'); }
    else why.push('Unknown key: trust your ears in the headphones.');
    var dir = want || 'hold';
    if (cur.energy && next.energy) {
      var de = next.energy - cur.energy;
      if (dir === 'up' && de < 0) { s -= 20; why.push('You wanted to build, but it drops the energy (' + cur.energy + ' to ' + next.energy + ').'); }
      else if (dir === 'down' && de > 0) { s -= 20; why.push('You wanted to bring it down, but it raises the energy.'); }
      else if (Math.abs(de) > 3) { s -= 15; why.push('A big jump in energy (' + cur.energy + ' to ' + next.energy + '): the floor will notice.'); }
      else if (dir === 'hold' && Math.abs(de) >= 2) { s -= 12; why.push('You wanted to hold the floor, but the energy ' + (de > 0 ? 'jumps' : 'drops') + ' (' + cur.energy + ' to ' + next.energy + ').'); }
      else good.push('Energy ' + (de > 0 ? 'lifts' : de < 0 ? 'eases' : 'holds') + ' (' + cur.energy + ' to ' + next.energy + ').');
    }
    return { score: Math.max(0, s), tempo: t, key: k, why: why, good: good };
  }
  /** A quiz round: the best next track hidden among two weaker ones. rnd: () -> [0,1). */
  function quizRound(pool, rnd, want) {
    rnd = rnd || Math.random;
    var usable = pool.filter(function (x) { return x.bpm && x.camelot; });
    if (usable.length < 4) return null;
    for (var tries = 0; tries < 40; tries++) {
      var cur = usable[Math.floor(rnd() * usable.length)], rest = usable.filter(function (x) { return x.id !== cur.id; });
      var scored = rest.map(function (x) { return { t: x, r: nextScore(cur, x, want) }; }).sort(function (a, b) { return b.r.score - a.r.score; });
      var best = scored[0], weak = scored.filter(function (x) { return x.r.score <= best.r.score - 25; });
      if (best.r.score < 70 || weak.length < 2) continue;
      var w1 = weak[Math.floor(rnd() * weak.length)], w2 = weak.filter(function (x) { return x !== w1; })[Math.floor(rnd() * (weak.length - 1))];
      var opts = [best, w1, w2].sort(function () { return rnd() - 0.5; });
      return { now: cur, want: want || 'hold', options: opts.map(function (o) { return { track: o.t, result: o.r }; }), answer: opts.indexOf(best) };
    }
    return null;
  }
  /** A practice crate (made-up tracks, just the facts a DJ reads off a screen) for when your own library is small. */
  function crate(rnd) {
    rnd = rnd || Math.random; var out = [], names = ['Night Bus', 'Glass Floor', 'Low Sun', 'Second Wind', 'Static Bloom', 'Undertow', 'Velvet Hour', 'Ferro', 'Halflight', 'Northbound', 'Copper Rain', 'Blue Hour', 'Signal Fire', 'Ritual', 'Afterglow', 'Drift Code', 'Heat Map', 'Paper Moon', 'Deep Field', 'Lantern', 'Hollow', 'Neon Tide', 'Groundswell', 'Overpass'];
    names.forEach(function (n, i) { out.push({ id: 'crate:' + i, name: n, bpm: 120 + Math.round(rnd() * 14), camelot: (1 + Math.floor(rnd() * 12)) + (rnd() < 0.7 ? 'A' : 'B'), energy: 3 + Math.floor(rnd() * 7), crate: true }); });
    return out;
  }
  var api = { crate: crate, quantJump: quantJump, TONES: TONES, toneRate: toneRate, keyRelation: keyRelation, tempoGap: tempoGap, nextScore: nextScore, quizRound: quizRound };
  root.BoothPro = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
