const test = require('node:test');
const assert = require('node:assert');
const K = require('../web/booth-skills.js');

// 20 samples a second at 128 BPM; ctl(beat) gives per-deck overrides. Both grids run together (B = A + off).
function sim(o) {
  const bpm = o.bpm || 128, S = [], from = o.from || 0, to = o.to || 96, off = o.off || 0;
  for (let i = 0; from + i / 20 * bpm / 60 <= to; i++) {
    const a = from + i / 20 * bpm / 60, c = o.ctl ? o.ctl(a) : {};
    const d = { on: true, vol: 1, low: .5, mid: .5, high: .5, filter: .5, bpm, loop: 0, fx: '' };
    S.push({ t: i / 20, db: -9, A: Object.assign({}, d, { beat: a }, c.A), B: Object.assign({}, d, { beat: a + off }, c.B) });
  }
  return S;
}
const ev = (id, b, x) => Object.assign({ id, down: true, bA: b, bB: b }, x);

test('Skills: a press right on the beat scores 100 with no notes', () => {
  const r = K.evaluate([{ type: 'press', id: 'A.pad.loop.5', at: 64, tol: 1 / 8 }], [ev('A.pad.loop.5', 64.02)], []);
  assert.strictEqual(r.total, 100); assert.strictEqual(r.grade, 'S'); assert.deepStrictEqual(r.notes, []);
});

test('Skills: a press 1/4 beat early loses marks and says exactly that', () => {
  const r = K.evaluate([{ type: 'press', id: 'A.pad.loop.5', at: 64, tol: 1 / 8 }], [ev('A.pad.loop.5', 63.75)], []);
  assert.ok(r.total < 90 && r.total > 70, 'total ' + r.total);
  assert.match(r.notes[0], /1\/4 beat early/);
  assert.match(r.notes[0], /bar 16 beat 4 and 3\/4/);
});

test('Skills: 1/8 beat is inside the quick-move tolerance, 3/8 is not', () => {
  assert.strictEqual(K.timingScore(0.125, 0.125), 100);
  assert.ok(K.timingScore(0.375, 0.125) < 75);
  assert.strictEqual(K.timingScore(1, 0.125), 0);
});

test('Skills: the wrong control at the right moment is named, with a pad-mode hint', () => {
  const r = K.evaluate([{ type: 'press', id: 'A.pad.loop.5', at: 64 }], [ev('A.pad.hotcue.5', 64)], []);
  assert.strictEqual(r.total, 0);
  assert.match(r.notes[0], /Pressed Deck A pad 5 \(Hot cue mode\) instead of Deck A pad 5 \(Loop mode\)/);
  assert.match(r.notes[0], /press the Loop mode button/);
});

test('Skills: nothing pressed says what was wanted; releases are checked separately', () => {
  let r = K.evaluate([{ type: 'press', id: 'A.loopIn', at: 64 }], [], []);
  assert.match(r.notes[0], /Didn't press Deck A LOOP IN \(wanted bar 17\)/);
  r = K.evaluate([{ type: 'press', id: 'A.pad.loopShift.3', at: 68, release: true, tol: 1 / 8 }],
    [ev('A.pad.loopShift.3', 66), ev('A.pad.loopShift.3', 68.5, { down: false })], []);
  assert.match(r.notes[0], /released 1\/2 beat late/);
});

test('Skills: one press can only count once', () => {
  const r = K.evaluate([{ type: 'press', id: 'A.loopIn', at: 64 }, { type: 'press', id: 'A.loopIn', at: 65 }], [ev('A.loopIn', 64)], []);
  assert.strictEqual(r.total, 50);
});

test('Skills: LOOP knob turns: right direction and timing', () => {
  const E = [ev('A.loopKnob', 72, { down: undefined, delta: -1 }), ev('A.loopKnob', 76.25, { down: undefined, delta: 1 })];
  const r = K.evaluate([{ type: 'turn', id: 'A.loopKnob', dir: -1, at: 72, tol: 1 / 8 }, { type: 'turn', id: 'A.loopKnob', dir: -1, at: 76, tol: 1 / 8 }], E, []);
  assert.strictEqual(r.parts[0].score, 100);
  assert.strictEqual(r.parts[1].score, 0);
  assert.match(r.notes[0], /Didn't turn Deck A LOOP knob left/);
});

test('Skills: a fader cut timed where it crosses halfway', () => {
  const S = sim({ ctl: a => ({ A: { vol: a < 64.5 ? 1 : 0 } }) });
  let r = K.evaluate([{ type: 'move', deck: 'A', key: 'volume', to: 0, at: 64, tol: 1 / 8 }], [], S);
  assert.match(r.notes[0], /1\/2 beat late/);
  const S2 = sim({ ctl: a => ({ A: { vol: a < 64 ? 1 : 0 } }) });
  r = K.evaluate([{ type: 'move', deck: 'A', key: 'volume', to: 0, at: 64, tol: 1 / 8 }], [], S2);
  assert.strictEqual(r.total, 100);
});

test('Skills: following a filter line; drifting off it is reported', () => {
  const line = [[32, .5], [64, .9]];
  const good = sim({ ctl: a => ({ B: { filter: a < 32 ? .5 : a > 64 ? .9 : .5 + .4 * (a - 32) / 32 } }) });
  assert.strictEqual(K.evaluate([{ type: 'ramp', deck: 'B', key: 'filter', pts: line }], [], good).total, 100);
  const bad = sim({ ctl: a => ({ B: { filter: .5 } }) });
  const r = K.evaluate([{ type: 'ramp', deck: 'B', key: 'filter', pts: line }], [], bad);
  assert.ok(r.total < 70, 'total ' + r.total);
  assert.match(r.notes[0], /off the line by 20% on average/);
});

test('Skills: filter still on at the drop fails with the given message', () => {
  const S = sim({ ctl: a => ({ A: { filter: .8 } }) });
  const r = K.evaluate([{ type: 'state', deck: 'A', key: 'filter', v: .5, at: 64, msg: 'The filter was still on when the drop hit.' }], [], S);
  assert.strictEqual(r.total, 0); assert.deepStrictEqual(r.notes, ['The filter was still on when the drop hit.']);
});

test('Skills: loop length and FX state checks', () => {
  const S = sim({ ctl: a => ({ A: { loop: a < 60 ? 2 : 0, fx: a < 62 ? 'echo 3/4' : '' } }) });
  let r = K.evaluate([{ type: 'loop', deck: 'A', len: 2, at: 56 }, { type: 'loop', deck: 'A', len: 0, at: 64 }], [], S);
  assert.strictEqual(r.total, 100);
  r = K.evaluate([{ type: 'loop', deck: 'A', len: 4, at: 56 }], [], S);
  assert.match(r.notes[0], /wasn't looping 4 beats at bar 15 \(it was 2 beats\)/);
  r = K.evaluate([{ type: 'fx', deck: 'A', on: 'echo', at: 56 }, { type: 'fx', deck: 'A', at: 64 }], [], S);
  assert.strictEqual(r.total, 100);
});

test('Skills: bass clash, phrase alignment and beat lock', () => {
  const clash = sim({ to: 40 });
  let r = K.evaluate([{ type: 'noClash', from: 0, to: 32 }], [], clash);
  assert.match(r.notes[0], /Bass clash for 8 bars/);
  const swap = sim({ to: 40, ctl: a => ({ B: { low: a < 16 ? 0 : .5 }, A: { low: a < 16 ? .5 : 0 } }) });
  assert.strictEqual(K.evaluate([{ type: 'noClash', from: 0, to: 32 }], [], swap).total, 100);
  assert.strictEqual(K.evaluate([{ type: 'align', at: 32 }], [], sim({ to: 40, off: 64 })).total, 100);
  r = K.evaluate([{ type: 'align', at: 32 }], [], sim({ to: 40, off: 66 }));
  assert.match(r.notes[0], /2 beats ahead of/);
  assert.strictEqual(K.evaluate([{ type: 'phaseLock', from: 0, to: 32 }], [], sim({ to: 40 })).total, 100);
  r = K.evaluate([{ type: 'phaseLock', from: 0, to: 32 }], [], sim({ to: 40, off: .1 }));
  assert.match(r.notes[0], /47 ms apart/);
});

test('Skills: a tempo ride must be gradual', () => {
  const smooth = sim({ to: 128, ctl: a => ({ A: { bpm: 132 + 6 * Math.min(1, a / 96) } }) });
  assert.strictEqual(K.evaluate([{ type: 'tempo', deck: 'A', target: 138, from: 0, to: 120 }], [], smooth).total, 100);
  const jump = sim({ to: 128, ctl: a => ({ A: { bpm: a < 64 ? 132 : 138 } }) });
  const r = K.evaluate([{ type: 'tempo', deck: 'A', target: 138, from: 0, to: 120 }], [], jump);
  assert.ok(r.total < 60); assert.match(r.notes[0], /The tempo jumped/);
});

test('Skills: mastery needs repeated tests, and Locked in needs the aids off', () => {
  assert.strictEqual(K.mastery([]).level, 'Learning');
  assert.strictEqual(K.mastery([{ score: 90 }, { score: 90 }]).level, 'Learning');
  assert.strictEqual(K.mastery([{ score: 72 }, { score: 40 }, { score: 75 }, { score: 80 }]).level, 'Solid');
  assert.strictEqual(K.mastery([{ score: 95 }, { score: 95 }, { score: 95 }]).level, 'Solid');
  assert.strictEqual(K.mastery([{ score: 95, aidsOff: true }, { score: 88, aidsOff: true }, { score: 60 }, { score: 90, aidsOff: true }]).level, 'Locked in');
});

test('Skills: unlocks go in order, and stay open once earned', () => {
  const order = ['a', 'b', 'c'];
  assert.deepStrictEqual(K.unlocked(order, {}), { a: true, b: false, c: false });
  assert.deepStrictEqual(K.unlocked(order, { a: [{ score: 59 }, { score: 61 }] }), { a: true, b: true, c: false });
});

test('Skills: the warm-up favours weak techniques', () => {
  const prog = { strong: [{ score: 98 }, { score: 97 }], weak: [{ score: 30 }, { score: 40 }] };
  let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = { strong: 0, weak: 0 };
  for (let i = 0; i < 1000; i++) n[K.warmupPick(['strong', 'weak'], prog, rand)]++;
  assert.ok(n.weak > n.strong * 2, JSON.stringify(n));
});

test('Skills: Free-mix recognisers spot a manual loop, a halving build and a roll', () => {
  let r = K.recognise([ev('A.loopIn', 32), ev('A.loopOut', 36.05)], []);
  assert.strictEqual(r[0].tech, 'loopManual'); assert.strictEqual(r[0].score, 100); assert.match(r[0].note, /4-beat loop right on the beat/);
  const knob = b => ev('A.loopKnob', b, { down: undefined, delta: -1 });
  r = K.recognise([ev('A.pad.loop.6', 48), knob(56), knob(60), knob(62), ev('A.loopPush', 64.5)], []);
  assert.ok(r.some(x => x.tech === 'halvingBuild' && /released 1\/2 beat late/.test(x.note)), JSON.stringify(r));
  r = K.recognise([ev('A.pad.loopShift.2', 30), ev('A.pad.loopShift.2', 32, { down: false })], []);
  assert.ok(r.some(x => x.tech === 'rollFill' && x.score === 100));
});

test('Skills: recognisers spot an echo out, a fast bass swap and a filter sweep', () => {
  let S = sim({ to: 72, ctl: a => ({ A: { fx: a > 56 ? 'echo 3/4' : '', vol: a < 64 ? 1 : 0 } }) });
  let r = K.recognise([], S);
  assert.ok(r.some(x => x.tech === 'echoOut' && x.score === 100), JSON.stringify(r));
  S = sim({ to: 72, ctl: a => ({ A: { low: a < 64 ? .5 : 0 }, B: { low: a < 64 ? 0 : .5 } }) });
  r = K.recognise([], S);
  assert.ok(r.some(x => x.tech === 'fastSwap' && x.deck === 'B'), JSON.stringify(r));
  S = sim({ to: 72, ctl: a => ({ B: { filter: a < 32 ? .5 : a < 64 ? .5 + .4 * (a - 32) / 32 : .5 } }) });
  r = K.recognise([], S);
  assert.ok(r.some(x => x.tech === 'filterSweep' && x.score === 100), JSON.stringify(r));
});

test('Skills: beat text', () => {
  assert.strictEqual(K.beats(0.25), '1/4 beat'); assert.strictEqual(K.beats(1.5), '1 1/2 beats'); assert.strictEqual(K.beats(8), '2 bars');
  assert.strictEqual(K.barBeat(64), 'bar 17'); assert.strictEqual(K.barBeat(66.5), 'bar 17 beat 3 and 1/2');
});
