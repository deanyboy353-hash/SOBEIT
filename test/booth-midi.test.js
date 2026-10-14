const test = require('node:test');
const assert = require('node:assert');
const MAP = require('../web/booth-map.js');
const { Decoder } = require('../web/booth-midi.js');

test('Booth MIDI: every control has a unique message; mids, highs, trim are 14-bit', () => {
  const seen = {};
  MAP.controls.filter(c => c.msg).forEach(c => {
    const k = c.msg.join('.');
    assert.ok(!seen[k], c.id + ' clashes with ' + seen[k]);
    seen[k] = c.id;
    if (c.lsb) { const l = c.lsb.join('.'); assert.ok(!seen[l], c.id + ' lsb clash'); seen[l] = c.id + ' lsb'; }
  });
  ['A', 'B'].forEach(d => ['eqLow', 'eqMid', 'eqHigh', 'trim', 'volume', 'pitch'].forEach(n => assert.ok(MAP.controls.find(c => c.id === d + '.' + n).lsb, d + '.' + n)));
  assert.strictEqual(MAP.controls.filter(c => /^A\.pad\./.test(c.id)).length, 64);
});

test('Booth MIDI: 14-bit EQ, centre detent, buttons, note off, relative jog, unknown', () => {
  const dec = new Decoder(MAP);
  let e = dec.decode([0xB1, 0x03, 0x7F]);                // Deck A MID, MSB fully right
  assert.strictEqual(e.id, 'A.eqMid'); assert.ok(e.coarse);
  e = dec.decode([0xB1, 0x23, 0x7F]);                    // LSB
  assert.strictEqual(e.value, 1); assert.strictEqual(e.bits, 14);
  dec.decode([0xB2, 0x02, 0x40]); e = dec.decode([0xB2, 0x22, 0x00]);   // Deck B LOW at the detent (8192)
  assert.strictEqual(e.id, 'B.eqLow'); assert.strictEqual(e.value, 0.5);
  dec.decode([0xB2, 0x02, 0x00]); e = dec.decode([0xB2, 0x22, 0x00]);
  assert.strictEqual(e.value, 0, 'fully left is a full kill');
  e = dec.decode([0xB1, 0x01, 64]); assert.strictEqual(e.id, 'A.filter'); assert.strictEqual(e.value, 0.5);
  e = dec.decode([0x92, 0x07, 0x7F]); assert.deepStrictEqual([e.id, e.down], ['B.play', true]);
  e = dec.decode([0x82, 0x07, 0x40]); assert.deepStrictEqual([e.id, e.down], ['B.play', false], 'note off');
  e = dec.decode([0xB1, 0x09, 0x7E]); assert.deepStrictEqual([e.id, e.delta], ['A.jogEdge', -2]);
  e = dec.decode([0xB1, 0x0A, 0x03]); assert.deepStrictEqual([e.id, e.delta], ['A.jogTop', 3]);
  e = dec.decode([0x97, 0x62, 0x7F]); assert.strictEqual(e.id, 'B.pad.fx.3');
  e = dec.decode([0xB3, 0x55, 0x10]); assert.strictEqual(e.id, null);
});

test('Booth MIDI: a fix from the test screen overrides the default', () => {
  const dec = new Decoder(MAP, { 'A.eqMid': { msg: [0xB1, 0x13], lsb: null } });
  assert.strictEqual(dec.decode([0xB1, 0x13, 127]).value, 1);
  assert.strictEqual(dec.decode([0xB1, 0x03, 127]).id, null);
});
