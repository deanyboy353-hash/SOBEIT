const test = require('node:test');
const assert = require('node:assert');
const P = require('../web/booth-pro.js');
const seeded = n => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };

test('Quantise: a hot cue jump lands at the same point in the beat (stays in time)', () => {
  const bpm = 120, beat = 0.5, first = 0.1;
  const to = P.quantJump(10.35, 4.1, first, bpm);          // 0.25 into a beat → 4.1 + 0.25
  assert.ok(Math.abs(to - 4.35) < 1e-9, to);
  const phase = x => (((x - first) % beat) + beat) % beat;
  assert.ok(Math.abs(phase(to) - phase(10.35)) < 1e-9, 'same phase after the jump');
  assert.strictEqual(P.quantJump(10.35, 4.1, first, 0), 4.1, 'no tempo: plain jump');
});

test('Toneplay: eight pads, semitones up and down, vinyl-style rate', () => {
  assert.strictEqual(P.TONES.length, 8);
  assert.ok(Math.abs(P.toneRate(12) - 2) < 1e-9);
  assert.ok(Math.abs(P.toneRate(-12) - 0.5) < 1e-9);
  assert.ok(Math.abs(P.toneRate(1) - 1.0594630943592953) < 1e-9);
});

test('Key relations on the Camelot wheel', () => {
  assert.strictEqual(P.keyRelation('8A', '8A'), 'same');
  assert.strictEqual(P.keyRelation('8A', '9A'), 'adjacent');
  assert.strictEqual(P.keyRelation('1A', '12A'), 'adjacent', 'the wheel wraps round');
  assert.strictEqual(P.keyRelation('8A', '8B'), 'relative');
  assert.strictEqual(P.keyRelation('8A', '10A'), 'boost');
  assert.strictEqual(P.keyRelation('8A', '2A'), 'clash');
  assert.strictEqual(P.keyRelation('', '2A'), 'unknown');
});

test('Next track: tempo, key and energy scored like a DJ would, with the reasons', () => {
  const cur = { bpm: 126, camelot: '8A', energy: 6 };
  const good = P.nextScore(cur, { bpm: 127, camelot: '9A', energy: 7 }, 'up');
  assert.ok(good.score >= 90, JSON.stringify(good)); assert.ok(good.good.some(g => /Camelot wheel/.test(g)));
  const clash = P.nextScore(cur, { bpm: 126, camelot: '2A', energy: 6 });
  assert.ok(clash.score <= 60 && clash.why.some(w => /clash/.test(w)));
  const far = P.nextScore(cur, { bpm: 140, camelot: '8A', energy: 6 });
  assert.ok(far.score <= 45 && far.why.some(w => /too far/.test(w)), JSON.stringify(far));
  assert.strictEqual(P.tempoGap(126, 63), 0, 'half time counts');
  const wrongWay = P.nextScore(cur, { bpm: 126, camelot: '8A', energy: 3 }, 'up');
  assert.ok(wrongWay.why.some(w => /wanted to build/.test(w)));
  const hold = P.nextScore({ bpm: 129, camelot: '5A', energy: 4 }, { bpm: 131, camelot: '7A', energy: 7 }, 'hold');
  assert.ok(hold.why.some(w => /hold the floor/.test(w)), 'holding the floor means no big energy jump');
});

test('Next track quiz: one clearly best answer and two weaker ones, from the practice crate', () => {
  for (let n = 1; n < 30; n++) {
    const r = P.quizRound(P.crate(seeded(n)), seeded(n * 31), ['hold', 'up', 'down'][n % 3]);
    if (!r) continue;
    assert.strictEqual(r.options.length, 3);
    const best = r.options[r.answer].result.score;
    r.options.forEach((o, i) => { if (i !== r.answer) assert.ok(o.result.score <= best - 25, 'the others are clearly weaker'); });
    assert.ok(best >= 70);
    assert.ok(!r.options.some(o => o.track.id === r.now.id));
  }
});
