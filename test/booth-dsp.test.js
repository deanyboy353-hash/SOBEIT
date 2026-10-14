const test = require('node:test');
const assert = require('node:assert');
const D = require('../web/booth-dsp.js');

function mono(l) { return l.left.map((v, i) => (v + l.right[i]) / 2); }
function pad(x, sr, secs) { const o = new Float32Array(x.length + Math.round(secs * sr)); o.set(x, Math.round(secs * sr)); return o; }

test('Booth DSP: generated loops have exact BPM and grid; analysis finds them', () => {
  for (const bpm of [124, 128, 132, 135, 140]) {
    const sr = 22050, l = D.makeLoop({ parts: ['kick', 'hats', 'rumble', 'acid'], bpm, bars: 24, sampleRate: sr });
    assert.strictEqual(l.left.length, Math.round(24 * 4 * 60 / bpm * sr));
    const off = 0.137, x = pad(mono(l), sr, off);
    const t = D.tempo(x, sr);
    assert.ok(Math.abs(t.bpm - bpm) < 0.05, 'bpm ' + bpm + ' got ' + t.bpm);
    const beat = 60 / bpm, err = Math.abs(((t.first - off) % beat + beat * 1.5) % beat - beat / 2);
    assert.ok(err < 0.012, bpm + ': first beat off by ' + Math.round(err * 1000) + ' ms');
  }
});

test('Booth DSP: key in Camelot for a minor and a major chord loop', () => {
  const sr = 22050, secs = 20;
  function chordTrack(notes) {
    const x = new Float32Array(sr * secs);
    for (let i = 0; i < x.length; i++) { const t = i / sr; let v = 0; notes.forEach((m, k) => { const f = 440 * Math.pow(2, (m - 69) / 12); v += Math.sin(2 * Math.PI * f * t) * (k === 0 ? 0.5 : 0.3) + 0.15 * Math.sin(4 * Math.PI * f * t); }); x[i] = v * 0.2; }
    return x;
  }
  assert.strictEqual(D.key(chordTrack([57, 60, 64, 69, 45]), sr).camelot, '8A');   // A minor
  assert.strictEqual(D.key(chordTrack([48, 52, 55, 60, 64]), sr).camelot, '8B');   // C major
  assert.strictEqual(D.key(chordTrack([50, 53, 57, 62, 38]), sr).camelot, '7A');   // D minor
  assert.ok(D.camelotFriends('8A', '9A') && D.camelotFriends('8A', '8B') && D.camelotFriends('12A', '1A') && !D.camelotFriends('8A', '10A'));
});

test('Booth DSP: full analysis gives waveform bands at 100 per second and a downbeat on the grid', () => {
  const sr = 22050, l = D.makeLoop({ parts: ['kick', 'hats', 'acid'], bpm: 130, bars: 32, sampleRate: sr });
  const a = D.analyse(mono(l), sr);
  assert.ok(Math.abs(a.bpm - 130) < 0.05);
  assert.strictEqual(a.waves.low.length, Math.ceil(l.left.length / (sr / 100)));
  const beat = 60 / 130, k = a.first / beat;
  assert.ok(Math.abs(k - Math.round(k)) < 0.03, 'downbeat lands on a beat');
  assert.ok(a.waves.low.some(v => v > 200) && a.waves.high.some(v => v > 50));
});
