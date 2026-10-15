const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Cue = require('../web/booth-cue.js');

// ---------- a stand-in Web Audio context: every node accepts any call ----------
function fakeCtx() {
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => new Proxy({ connect() {}, disconnect() {}, start() {}, stop() {}, getFloatTimeDomainData() {} }, {
    get(t, k) { if (k in t) return t[k]; if (/^(gain|frequency|Q|playbackRate|delayTime|threshold|knee|ratio|attack|release)$/.test(k)) return (t[k] = param()); return undefined; },
    set(t, k, v) { t[k] = v; return true; }
  });
  const c = { currentTime: 0, sampleRate: 8000, state: 'running', destination: node(), resume() { return Promise.resolve(); },
    createBuffer(ch, len) { return { duration: len / 8000, getChannelData: () => new Float32Array(len) }; } };
  ['Gain', 'BiquadFilter', 'DynamicsCompressor', 'Analyser', 'Delay', 'Convolver', 'BufferSource', 'MediaStreamDestination', 'ChannelSplitter', 'ChannelMerger', 'Oscillator'].forEach(n => { c['create' + n] = node; });
  return c;
}
function engine() {
  let ctx;
  globalThis.window = globalThis;
  globalThis.AudioContext = function () { ctx = fakeCtx(); return ctx; };
  require('../web/booth-cue.js');
  delete require.cache[require.resolve('../web/booth-audio.js')];
  require('../web/booth-audio.js');
  const E = new globalThis.BoothAudio.Engine();
  E.other = d => E.decks[d.id === 'A' ? 'B' : 'A'];
  const d = E.decks.A;
  d.load({ bpm: 120, first: 0.5, hot: [] }, { duration: 200 });     // a beat every 0.5 s, first beat at 0.5 s
  return { E, d, ctx };
}

// ---------- the rules ----------

test('CUE rules: playing -> back to cue; paused -> back to cue; just after a scrub -> set it; at the cue -> preview; SHIFT -> start', () => {
  const base = { loaded: true, playing: false, pos: 30, cuePos: 0.5, now: 100 };
  assert.strictEqual(Cue.cueAction(Object.assign({}, base, { playing: true })), 'back');
  assert.strictEqual(Cue.cueAction(base), 'return', 'paused away from the cue goes back to it');
  assert.strictEqual(Cue.cueAction(Object.assign({}, base, { scrubbedAt: 99 })), 'set', 'right after scrubbing, CUE sets the cue point');
  assert.strictEqual(Cue.cueAction(Object.assign({}, base, { scrubbedAt: 90 })), 'return', 'a scrub a while ago does not count');
  assert.strictEqual(Cue.cueAction(Object.assign({}, base, { pos: 0.5 })), 'preview');
  assert.strictEqual(Cue.cueAction(Object.assign({}, base, { shift: true })), 'start');
  assert.strictEqual(Cue.cueAction(Object.assign({}, base, { shift: true, playing: true })), 'start');
  assert.strictEqual(Cue.cueAction({ loaded: false }), 'none');
});

test('Beatjump pads: back 8, 16 and 32 beats, and a pad straight to the start', () => {
  const all = Cue.JUMP_PADS.concat(Cue.JUMP_PADS_SHIFT);
  [-8, -16, -32].forEach(n => assert.ok(Cue.JUMP_PADS.includes(n), 'back ' + n + ' on a pad without SHIFT'));
  assert.strictEqual(Cue.padJump(7, false), 'start');
  assert.strictEqual(Cue.padJump(7, true), 'cue');
  assert.strictEqual(Cue.JUMP_PADS.length, 8); assert.strictEqual(Cue.JUMP_PADS_SHIFT.length, 8);
  assert.ok(all.includes(1) && all.includes(-1));
  assert.strictEqual(Cue.padJumpLabel(6, false).t, '−32');
  assert.strictEqual(Cue.padJumpLabel(7, false).t, 'Start');
});

// ---------- a real deck ----------

test('Deck: the cue point starts on the first beat; CUE while paused goes back to it', () => {
  const { d, ctx } = engine();
  assert.strictEqual(d.cuePos, 0.5, 'default cue = first beat');
  d.play(); ctx.currentTime = 20; d.stop();
  assert.ok(d.pos > 10, 'played on to ' + d.pos);
  ctx.currentTime = 30;
  assert.strictEqual(d.cueDown(false), 'return');
  assert.strictEqual(d.pos, 0.5);
  assert.strictEqual(d.playing, false);
});

test('Deck: CUE while playing goes back to the cue and stops; scrub then CUE sets a new cue on the beat', () => {
  const { d, ctx } = engine();
  d.play(); ctx.currentTime = 10;
  assert.strictEqual(d.cueDown(false), 'back');
  assert.strictEqual(d.playing, false); assert.strictEqual(d.pos, 0.5);
  d.seek(12.1); ctx.currentTime = 11; d.jog(10);                    // scrub with the jog wheel while paused
  assert.strictEqual(d.cueDown(false), 'set');
  assert.strictEqual(d.cuePos, d.snap(d.cuePos)); assert.ok(Math.abs(d.cuePos - 12) < 0.3, 'new cue near 12 s: ' + d.cuePos);
});

test('Deck: SHIFT + CUE and the Start button go straight to 0:00 and leave a loop; it keeps playing if it was', () => {
  const { d, ctx } = engine();
  d.play(); ctx.currentTime = 40; d.beatLoop(4);
  assert.ok(d.loop);
  assert.strictEqual(d.cueDown(true), 'start');
  assert.strictEqual(d.loop, null);
  assert.strictEqual(d.playing, true, 'still playing, from the top');
  assert.ok(d.time(ctx.currentTime + 0.005) < 0.1);
  d.stop(); d.seek(50); d.toStart();
  assert.strictEqual(d.pos, 0); assert.strictEqual(d.playing, false);
});

// ---------- the controller and the screen ----------

test('Inpulse 500: SHIFT + CUE has its own message; Start has a key; the diagram shows it', () => {
  const MAP = require('../web/booth-map.js');
  ['A', 'B'].forEach(id => {
    const c = MAP.controls.find(x => x.id === id + '.shiftCue');
    assert.ok(c, id + '.shiftCue mapped');
    assert.deepStrictEqual(c.msg, [MAP.decks[id].shiftNote, 0x06], 'same note as CUE on the SHIFT channel');
    assert.ok(MAP.keys[id + '.start'], 'keyboard shortcut for ' + id);
  });
  const shell = fs.readFileSync(path.join(__dirname, '../web/booth.js'), 'utf8');
  assert.match(shell, /SHIFT\+CUE: START/);
  assert.match(shell, /data-also="' \+ d \+ '\.shiftCue"/);
  const play = fs.readFileSync(path.join(__dirname, '../web/booth-play.js'), 'utf8');
  assert.match(play, /data-b="' \+ id \+ '\.start"/, 'an on-screen Back to start button per deck');
});

test('Results never scroll the page: no scrollIntoView, a docked panel, and Try again / Next lesson / Keep playing', () => {
  const dir = path.join(__dirname, '../web');
  ['booth-academy.js', 'booth-game.js'].forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/resultSlot[^;]*scrollIntoView|slot\.scrollIntoView/.test(src), f + ' scrolls to the result');
    assert.match(src, /Try again/); assert.match(src, /Keep playing/); assert.match(src, /Next lesson/);
    assert.match(src, /keepY/, f + ' keeps the scroll position when a lesson restarts');
  });
  const css = fs.readFileSync(path.join(dir, 'booth.css'), 'utf8');
  assert.match(css, /#resultSlot:not\(:empty\)\s*\{[^}]*position:\s*fixed/);
  assert.match(fs.readFileSync(path.join(dir, 'booth.html'), 'utf8'), /booth-cue\.js/);
});
