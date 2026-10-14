const test = require('node:test');
const assert = require('node:assert');
const Sc = require('../web/booth-score.js');

// Simulator: both decks at 128 BPM, 20 samples a second. Deck A (outgoing) starts at its beat `aStart`.
// ctl(beatA) returns { A: {vol, low, mid, high, filter, on}, B: {...} } ; B's beat = beatA - bOffset while B plays.
function sim(o) {
  const bpm = o.bpm || 128, rate = 20, S = [], beats = o.beats || 160, aStart = o.aStart === undefined ? 96 : o.aStart;
  for (let i = 0; i <= beats * 60 / bpm * rate; i++) {
    const t = i / rate, a = aStart + t * bpm / 60, c = o.ctl(a);
    const A = Object.assign({ on: true, vol: 1, low: .5, mid: .5, high: .5, filter: .5, beat: a, bpm }, c.A);
    const B = Object.assign({ on: a >= o.bIn - 16, vol: 0, low: .5, mid: .5, high: .5, filter: .5, beat: a - o.bOffset, bpm }, c.B);
    // measured loudness model: each deck's power from its fader and EQ bands, plus a little kick ripple
    const pw = d => d.on ? Math.pow(Sc.faderGain(d.vol), 2) * (Math.pow(Sc.eqGain(d.low), 2) * .6 + Math.pow(Sc.eqGain(d.mid), 2) * .3 + Math.pow(Sc.eqGain(d.high), 2) * .1) : 0;
    const p = pw(A) + pw(B) + 1e-9, ripple = (a % 1) < .15 ? 1.5 : 0;
    S.push({ t, A, B, db: (o.db ? o.db(a) : 10 * Math.log10(p)) - 9 + ripple });
  }
  return S;
}
const ramp = (x, a, b, v0, v1) => x <= a ? v0 : x >= b ? v1 : v0 + (v1 - v0) * (x - a) / (b - a);

// A perfect bass swap: B in on the phrase at A's bar 33 (beat 128) from its own bar 1 (beat 0); B's LOW killed;
// B's fader up over 8 bars; bass swap in one move on bar 41 (beat 160); A's fader down over 4 bars, gone by bar 45 (beat 176).
const perfect = a => ({
  A: { vol: ramp(a, 160, 176, 1, 0), low: a < 160 ? .5 : 0 },
  B: { vol: ramp(a, 128, 160, 0, 1), low: a < 160 ? 0 : .5 }
});

test('Scoring: a perfect bass swap scores high with only true praise', () => {
  const S = sim({ bIn: 128, bOffset: 128, ctl: perfect, beats: 120 });
  const tr = Sc.findTransitions(S);
  assert.strictEqual(tr.length, 1); assert.strictEqual(tr[0].from, 'A'); assert.strictEqual(tr[0].to, 'B');
  const r = Sc.score(S, tr[0], { technique: 'bass', plan: { start: 128, swap: 160, end: 176 } });
  assert.strictEqual(r.clashBeats, 0);
  assert.strictEqual(r.scores.bass, 100); assert.strictEqual(r.scores.timing, 100);
  assert.ok(r.scores.volume >= 95, 'volume ' + r.scores.volume);
  assert.ok(r.scores.smooth >= 95, 'smooth ' + r.scores.smooth);
  assert.ok(r.total >= 95 && r.grade === 'S', JSON.stringify(r));
  assert.deepStrictEqual(r.notes, []);
  assert.ok(r.good.some(g => /Clean bass swap at bar 41/.test(g)), r.good.join(' | '));
});

test('Scoring: a deliberate 8-beat bass clash is reported exactly', () => {
  // B's LOW comes up at beat 160 but A's LOW stays up until beat 168
  const S = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: ramp(a, 168, 184, 1, 0), low: a < 168 ? .5 : 0 }, B: { vol: ramp(a, 128, 160, 0, 1), low: a < 160 ? 0 : .5 } }) });
  const r = Sc.score(S, Sc.findTransitions(S)[0], { technique: 'bass' });
  assert.ok(Math.abs(r.clashBeats - 8) <= 0.15, 'clash beats ' + r.clashBeats);
  assert.ok(r.notes.some(n => /^Bass clash for 8 beats at bar 41/.test(n)), r.notes.join(' | '));
  assert.ok(r.scores.bass <= 40, 'bass ' + r.scores.bass);
  assert.ok(!r.good.some(g => /Clean bass swap/.test(g)));
});

test('Scoring: a mistimed start (3 beats after the phrase) is caught; on-phrase is not', () => {
  const late = sim({ bIn: 131, bOffset: 131, beats: 120, ctl: a => ({ A: { vol: ramp(a, 163, 179, 1, 0), low: a < 163 ? .5 : 0 }, B: { vol: ramp(a, 131, 163, 0, 1), low: a < 163 ? 0 : .5 } }) });
  const r = Sc.score(late, Sc.findTransitions(late)[0], { technique: 'bass' });
  assert.ok(r.notes.some(n => /^Deck B came in 3 beats after the phrase at bar 33/.test(n)), r.notes.join(' | '));
  assert.ok(r.scores.timing <= 75);
  // phrases out of line: B starts at its bar 3 (beat 8) on A's phrase
  const off = sim({ bIn: 128, bOffset: 120, beats: 120, ctl: perfect });
  const r2 = Sc.score(off, Sc.findTransitions(off)[0], { technique: 'bass' });
  assert.ok(r2.notes.some(n => /phrases don't line up/.test(n) && /its bar 3/.test(n) && /bar 33/.test(n)), r2.notes.join(' | '));
});

test('Scoring: a volume dip in the measured output is found with its bar', () => {
  // A drops out at beat 160 while B is still only half up: a real hole
  const S = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: a < 160 ? 1 : ramp(a, 160, 161, 1, 0) }, B: { vol: ramp(a, 128, 176, 0, 1), low: a < 160 ? 0 : .5 } }) });
  const r = Sc.score(S, Sc.findTransitions(S)[0], { technique: 'eq' });
  assert.ok(r.events.dip && r.events.dip.depth >= 3, JSON.stringify(r.events.dip));
  assert.ok(r.notes.some(n => /^Volume dipped [\d.]+ dB at bar 41/.test(n)), r.notes.join(' | '));
  assert.ok(r.scores.volume < 80);
});

test('Scoring: early fade-out vs the plan, wobbly faders and an aborted transition', () => {
  // A gone at beat 144 when the plan said 176 -> 8 bars early
  const S = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: ramp(a, 136, 144, 1, 0), low: a < 136 ? .5 : 0 }, B: { vol: ramp(a, 128, 136, 0, 1), low: a < 136 ? 0 : .5 } }) });
  const r = Sc.score(S, Sc.findTransitions(S)[0], { technique: 'bass', plan: { start: 128, swap: 160, end: 176 } });
  assert.ok(r.notes.some(n => /^Faded Deck A out 8 bars early/.test(n)), r.notes.join(' | '));
  // B's fader wobbles up and down while coming in
  const W = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: ramp(a, 160, 176, 1, 0), low: a < 160 ? .5 : 0 }, B: { vol: Math.min(1, ramp(a, 128, 160, 0, 1) + (a > 136 && a < 152 ? .12 * Math.sin((a - 136) / 16 * Math.PI * 3) : 0)), low: a < 160 ? 0 : .5 } }) });
  const rw = Sc.score(W, Sc.findTransitions(W)[0], { technique: 'eq' });
  assert.ok(rw.notes.some(n => /Deck B volume went back and forth/.test(n)), rw.notes.join(' | '));
  assert.ok(rw.scores.smooth < 90);
  // a fader slammed up in a beat during an EQ blend
  const J = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: ramp(a, 160, 176, 1, 0), low: a < 160 ? .5 : 0 }, B: { vol: ramp(a, 128, 128.5, 0, 1), low: a < 160 ? 0 : .5 } }) });
  const rj = Sc.score(J, Sc.findTransitions(J)[0], { technique: 'eq' });
  assert.ok(rj.notes.some(n => /Deck B volume jumped from 0% to 100% within a beat at bar 33/.test(n)), rj.notes.join(' | '));
  // B goes back out before A leaves
  const Ab = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: {}, B: { vol: a < 150 ? ramp(a, 128, 140, 0, .8) : 0 } }) });
  const tr = Sc.findTransitions(Ab)[0];
  assert.ok(tr.aborted);
  const ra = Sc.score(Ab, tr, { technique: 'eq' });
  assert.ok(ra.total <= 40 && ra.notes.some(n => /went back out/.test(n)));
});

test('Scoring: a quick cut on the phrase is fine; volume-only fades allow a short overlap', () => {
  const C = sim({ bIn: 160, bOffset: 160, beats: 120, ctl: a => ({ A: { vol: a < 160 ? 1 : 0 }, B: { vol: a < 160 ? 0 : 1 } }) });
  const trs = Sc.findTransitions(C);
  // a cut has no overlap: the incoming arrives in the same sample the outgoing leaves
  assert.ok(trs.length <= 1);
  // a quick volume-only fade: both above half volume for 8 beats (132-140): that's the technique, no penalty
  const V = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: ramp(a, 136, 144, 1, 0) }, B: { vol: ramp(a, 128, 136, 0, 1) } }) });
  const rv = Sc.score(V, Sc.findTransitions(V)[0], { technique: 'volume' });
  assert.ok(Math.abs(rv.clashBeats - 8) <= 0.2 && rv.scores.bass === 100, 'volume-only fade bass ' + rv.scores.bass + ' clash ' + rv.clashBeats);
  // a slow one: both loud for 16 beats (136-152) is too long
  const V2 = sim({ bIn: 128, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: ramp(a, 144, 160, 1, 0) }, B: { vol: ramp(a, 128, 144, 0, 1) } }) });
  const rv2 = Sc.score(V2, Sc.findTransitions(V2)[0], { technique: 'volume' });
  assert.ok(rv2.scores.bass >= 49 && rv2.scores.bass <= 53 && rv2.notes.some(n => /^Bass clash for 16 beats at bar 35: both decks loud/.test(n)), rv2.scores.bass + ' ' + rv2.notes.join(' | '));
  // cuts: on the 1 and 2 beats late with a gap
  const cutAt = (u, d) => sim({ bIn: 150, bOffset: 128, beats: 120, ctl: a => ({ A: { vol: a < d ? 1 : 0 }, B: { vol: a < u ? 0 : 1 } }) });
  const c1 = Sc.scoreCut(cutAt(160, 160), 'A', 'B', { start: 160 });
  assert.ok(c1.total >= 95 && c1.good.some(g => /Cut right on bar 41/.test(g)), JSON.stringify(c1));
  const c2 = Sc.scoreCut(cutAt(163, 162), 'A', 'B', { start: 160 });
  assert.ok(c2.notes.some(n => /^Cut 2.5 beats late: aim for bar 41/.test(n)) && c2.notes.some(n => /gap of 1(\.\d)? beats with nothing playing at bar 41/.test(n)), JSON.stringify(c2.notes));
});

test('Beatmatching and ghost line scores', () => {
  const S = [];
  for (let i = 0; i < 400; i++) {
    const t = i / 20, bErr = Math.max(0, 1.5 - t * 0.2), ph = Math.max(0, 0.2 - t * 0.02);
    S.push({ t, A: { on: true, bpm: 128, beat: t * 128 / 60, vol: 1 }, B: { on: true, bpm: 128 + bErr, beat: t * 128 / 60 + ph, vol: 1 } });
  }
  const r = Sc.scoreBeatmatch(S, 'B');
  assert.ok(r.bpmError < 0.05 && r.phaseMs < 15, JSON.stringify(r));
  assert.ok(r.score >= 85 && r.matchedAt > 5 && r.matchedAt < 12, JSON.stringify(r));
  const off = S.map(s => ({ t: s.t, A: s.A, B: Object.assign({}, s.B, { bpm: 128.6 }) }));
  const r2 = Sc.scoreBeatmatch(off, 'B');
  assert.ok(r2.notes.some(n => /Tempo still 0.6 BPM off/.test(n)) && r2.score < 50, JSON.stringify(r2));
  const G = S.map(s => ({ t: s.t, A: Object.assign({}, s.A, { vol: Sc.interp([[0, 0], [32, 1]], s.A.beat) }), B: s.B }));
  const g = Sc.scoreGhost(G, [{ deck: 'A', key: 'vol', label: 'Deck A volume', pts: [[0, 0], [32, 1]] }]);
  assert.strictEqual(g.total, 100);
  const G2 = S.map(s => ({ t: s.t, A: Object.assign({}, s.A, { vol: s.A.beat < 16 ? 0 : 1 }), B: s.B }));
  const g2 = Sc.scoreGhost(G2, [{ deck: 'A', key: 'vol', label: 'Deck A volume', pts: [[0, 0], [32, 1]] }]);
  assert.ok(g2.total < 60 && g2.notes[0].indexOf('Deck A volume') === 0, JSON.stringify(g2));
});

test('Booth daily challenge: best score counts, both of you see each other', () => {
  const { loadProject } = require('./fakes');
  const g = loadProject({ now: new Date('2026-10-14T19:00:00Z') });
  g.ctx.setup();
  const me = g.state.props.WEBAPP_KEY, partner = g.state.props.PARTNER_KEY, plain = x => JSON.parse(JSON.stringify(x));
  let st = plain(g.ctx.submitBooth(me, 72, 'B', 'Bass swap at 128'));
  assert.strictEqual(st.booth.mine.score, 72); assert.strictEqual(st.last.points, 7);
  st = plain(g.ctx.submitBooth(me, 60, 'C', 'Bass swap at 128'));
  assert.strictEqual(st.booth.mine.score, 72, 'a worse try keeps the best');
  st = plain(g.ctx.submitBooth(me, 91, 'A', 'Bass swap at 128'));
  assert.strictEqual(st.booth.mine.score, 91);
  const ps = plain(g.ctx.submitBooth(partner, 80, 'B', 'Bass swap at 128'));
  assert.strictEqual(ps.booth.other.score, 91); assert.strictEqual(ps.booth.mine.score, 80);
  assert.throws(() => g.ctx.submitBooth(me, 140, 'S', 'x'));
});
