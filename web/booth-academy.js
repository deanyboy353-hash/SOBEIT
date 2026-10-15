/*
 * Afterhours: Booth · Advanced Academy.
 * Each technique: Explain (2-3 sentences) -> Demo (the decks play it, the diagram shows each control) -> Practice
 * (prompts and ghost lines, feedback per move) -> Test (scored by BoothSkills, within 1/8 beat for quick moves) ->
 * Result, plus "On other gear" (CDJ + DJM). Mastery: Learning -> Solid -> Locked in (with the ear-training aids off).
 * Also: timing calibration (tap along), a 10-minute warm-up of your weakest techniques, live challenges and
 * technique spotting in Free mix and Set mode, and a one-page summary of every technique.
 * All timing runs on a lesson clock (bars counted from Deck A) at the moment you HEARD it, minus your calibrated delay.
 */
(function () {
  'use strict';
  var P = window.BoothPlay, K = window.BoothSkills, G = window.BoothGame;
  var S = null, L = null;                      // shell; the running lesson
  var Q = 1 / 8;                               // quick moves: full marks within 1/8 beat
  function E() { return P.engine(); }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return S.esc(s); }
  function bar(b) { return Math.floor(b / 4) + 1; }

  // ---------- the techniques (beats are relative to P, the lesson's phrase; Deck A starts at track beat `from`) ----------
  // step: { at, say, ids: [controls to light], act: [demo actions], rules: [BoothSkills rules], hold }
  // act: { at, id, down } button/pad, { at, id, delta } encoder, { at, id, ramp: [[beat, value], ...] } fader/knob
  function press(id, at, o) { return Object.assign({ type: 'press', id: id, at: at, tol: Q }, o || {}); }
  function tap(id, at, len) { return [{ at: at, id: id, down: true }, { at: at + (len || 0.15), id: id, down: false }]; }
  function knob(id, pts) { return { at: pts[0][0], id: id, ramp: pts }; }
  var MODULES = [
    { id: 'loops', name: 'Looping' }, { id: 'filters', name: 'Filters' }, { id: 'eq', name: 'EQ and speed' }, { id: 'fx', name: 'FX exits' },
    { id: 'cues', name: 'Hot cues and structure' }, { id: 'tempo', name: 'Tempo and key' }, { id: 'match', name: 'Advanced beatmatching' }
  ];
  var T = [
    // ---- 1. Looping ----
    { id: 'loopManual', mod: 'loops', name: 'Manual loop in and out', tracks: ['loop:groove128'], from: 48,
      why: 'LOOP IN marks where a loop starts, LOOP OUT closes it. Hit both exactly on the beat and the loop is seamless; a loop of 4, 8 or 16 beats keeps you on the phrase.',
      gear: 'CDJ: IN/CUE and OUT buttons (RELOOP/EXIT to leave). DJM: nothing needed, it\'s all on the deck.',
      need: { 'A.volume': '>' },
      steps: [
        { at: 0, say: 'Press Deck A LOOP IN right on the 1 of {bar:0}.', ids: ['A.loopIn'], act: tap('A.loopIn', 0), rules: [press('A.loopIn', 0)] },
        { at: 4, say: 'Press Deck A LOOP OUT on the 1 of {bar:4}: a 4-beat loop.', ids: ['A.loopOut'], act: tap('A.loopOut', 4), rules: [press('A.loopOut', 4), { type: 'loop', deck: 'A', len: 4, at: 6 }] },
        { at: 16, say: 'Press LOOP OUT again on {bar:16} to let it go.', ids: ['A.loopOut'], act: tap('A.loopOut', 16), rules: [press('A.loopOut', 16, { say: 'Loop released' }), { type: 'loop', deck: 'A', len: 0, at: 18 }] }
      ], len: 20, speed: { n: 4, every: 8, label: '4 clean 1-beat loops in a row', steps: function (k) { var a = k * 8; return [{ at: a, say: 'LOOP IN on {bar:' + a + '}, LOOP OUT one beat later, LOOP OUT again on beat 4.', ids: ['A.loopIn', 'A.loopOut'], act: tap('A.loopIn', a).concat(tap('A.loopOut', a + 1), tap('A.loopOut', a + 4)), rules: [press('A.loopIn', a), press('A.loopOut', a + 1), press('A.loopOut', a + 4, { say: 'Released' })] }]; } } },
    { id: 'halving', mod: 'loops', name: 'Halving build into the drop', tracks: ['loop:rumble130'], from: 32,
      why: 'Start an 8-beat loop, then halve it every few beats: 8, 4, 2, 1, ½. The loop speeds up and builds tension; let it go exactly on the 1 and the track drops back in.',
      gear: 'CDJ: 4-beat loop button then the 1/2X button; release with RELOOP/EXIT. DJM: add a high-pass sweep as it builds.',
      need: { 'A.volume': '>' },
      steps: [
        { at: 0, say: 'Loop pads (press LOOP mode): pad 6 for an 8-beat loop on {bar:0}.', ids: ['A.mode2', 'A.pad.hotcue.6'], act: tap('A.pad.loop.6', 0), rules: [press('A.pad.loop.6', 0), { type: 'loop', deck: 'A', len: 8, at: 3 }] },
        { at: 8, say: 'Turn the LOOP knob left once on {bar:8}: 4 beats.', ids: ['A.loopKnob'], act: [{ at: 8, id: 'A.loopKnob', delta: -1 }], rules: [{ type: 'turn', id: 'A.loopKnob', dir: -1, at: 8, tol: Q }] },
        { at: 12, say: 'Left again on {bar:12}: 2 beats.', ids: ['A.loopKnob'], act: [{ at: 12, id: 'A.loopKnob', delta: -1 }], rules: [{ type: 'turn', id: 'A.loopKnob', dir: -1, at: 12, tol: Q }] },
        { at: 14, say: 'Left on beat 3: 1 beat.', ids: ['A.loopKnob'], act: [{ at: 14, id: 'A.loopKnob', delta: -1 }], rules: [{ type: 'turn', id: 'A.loopKnob', dir: -1, at: 14, tol: Q }] },
        { at: 15, say: 'Left on beat 4: half a beat.', ids: ['A.loopKnob'], act: [{ at: 15, id: 'A.loopKnob', delta: -1 }], rules: [{ type: 'turn', id: 'A.loopKnob', dir: -1, at: 15, tol: Q }, { type: 'loop', deck: 'A', len: 0.5, at: 15.6 }] },
        { at: 16, say: 'Push the LOOP knob on the 1 of {bar:16}: drop!', ids: ['A.loopPush'], act: tap('A.loopPush', 16), rules: [press('A.loopPush', 16, { say: 'Loop released' }), { type: 'loop', deck: 'A', len: 0, at: 17, msg: 'The loop was still on after the drop.' }] }
      ], len: 20 },
    { id: 'rolls', mod: 'loops', name: 'Loop rolls as fills', tracks: ['loop:groove128'], from: 32,
      why: 'Hold SHIFT and a loop pad for a roll: it stutters, and when you let go the track is exactly where it would have been. Shorter rolls on the last beats of a phrase make a fill.',
      gear: 'CDJ: hold a Beat Loop button with Slip on. DJM: the Roll Beat FX does the same.',
      need: { 'A.volume': '>' },
      steps: [
        { at: 12, say: 'Hold SHIFT + pad 3 (1-beat roll) from beat 1 of {bar:12}, let go on beat 3.', ids: ['A.shift', 'A.pad.hotcue.3'], act: tap('A.pad.loopShift.3', 12, 2), rules: [press('A.pad.loopShift.3', 12), press('A.pad.loopShift.3', 14, { release: true })] },
        { at: 14, say: 'SHIFT + pad 2 (½-beat roll) on beat 3, let go on beat 4.', ids: ['A.shift', 'A.pad.hotcue.2'], act: tap('A.pad.loopShift.2', 14.02, 0.98), rules: [press('A.pad.loopShift.2', 14), press('A.pad.loopShift.2', 15, { release: true })] },
        { at: 15, say: 'SHIFT + pad 1 (¼-beat roll) on beat 4, let go on the 1 of {bar:16}.', ids: ['A.shift', 'A.pad.hotcue.1'], act: tap('A.pad.loopShift.1', 15.02, 0.98), rules: [press('A.pad.loopShift.1', 15), press('A.pad.loopShift.1', 16, { release: true, say: 'Roll let go' }), { type: 'deckPhase', deck: 'A', at: 18, msg: 'After the rolls the track wasn\'t on the beat any more.' }] }
      ], len: 20, speed: { n: 5, every: 4, label: '5 loop rolls in a row, one per bar', steps: function (k) { var a = k * 4 + 2; return [{ at: a, say: 'SHIFT + pad 3 on beat 3, let go on the 1.', ids: ['A.shift', 'A.pad.hotcue.3'], act: tap('A.pad.loopShift.3', a, 2), rules: [press('A.pad.loopShift.3', a), press('A.pad.loopShift.3', a + 2, { release: true })] }]; } } },
    { id: 'outro', mod: 'loops', name: 'Extend an outro with a 16-bar loop', tracks: ['loop:groove128'], from: 16,
      why: 'Running out of track before your blend is done? Set LOOP IN on a phrase and LOOP OUT exactly 16 bars later: the last 16 bars play again, seamlessly, for as long as you need.',
      gear: 'CDJ: IN on the phrase, OUT 16 bars later (or a 32-beat Beat Loop and double it). DJM: nothing extra.',
      need: { 'A.volume': '>' },
      steps: [
        { at: 0, say: 'LOOP IN on the 1 of {bar:0}.', ids: ['A.loopIn'], act: tap('A.loopIn', 0), rules: [press('A.loopIn', 0)] },
        { at: 32, say: 'Halfway. Count the phrases: LOOP OUT comes on {bar:64}.', ids: [] },
        { at: 64, say: 'LOOP OUT on the 1 of {bar:64}: a 16-bar loop.', ids: ['A.loopOut'], act: tap('A.loopOut', 64), rules: [press('A.loopOut', 64), { type: 'loop', deck: 'A', len: 64, at: 70, msg: 'The loop wasn\'t 16 bars: LOOP OUT has to land exactly 64 beats after LOOP IN.' }, { type: 'deckPhase', deck: 'A', at: 72, offset: 0 }] }
      ], len: 74 },
    { id: 'introLoop', mod: 'loops', name: 'Loop the incoming intro', tracks: ['loop:groove128', 'loop:rumble130'], from: 16, bCue: 0,
      why: 'Start the next track and loop its first 8 bars: its intro keeps going while you take your time with the blend, and when you let go on a phrase it carries on in time.',
      gear: 'CDJ: Beat Loop 32 on the incoming deck, RELOOP/EXIT on the phrase. DJM: blend with the channel fader as normal.',
      need: { 'A.volume': '>', 'B.volume': '<', 'B.sync': 'on' },
      steps: [
        { at: 0, say: 'Press Deck B PLAY on the 1 of {bar:0}, then straight away pad 8 (32-beat loop) on Deck B.', ids: ['B.play', 'B.mode2', 'B.pad.hotcue.8'], act: tap('B.play', 0).concat(tap('B.pad.loop.8', 0.3)), rules: [press('B.play', 0), press('B.pad.loop.8', 0.25, { tol: 0.5, say: 'Loop set' }), { type: 'loop', deck: 'B', len: 32, at: 4 }] },
        { at: 8, say: 'Bring Deck B volume up slowly over the next 4 bars. Its intro is looping.', ids: ['B.volume'], act: [knob('B.volume', [[8, 0], [24, 0.85]])], rules: [] },
        { at: 32, say: 'Deck B is still looping its intro. Let go on {bar:48}.', ids: [] },
        { at: 48, say: 'Pad 8 on Deck B on the 1 of {bar:48}: the loop lets go.', ids: ['B.pad.hotcue.8'], act: tap('B.pad.loop.8', 48), rules: [press('B.pad.loop.8', 48, { say: 'Loop released' }), { type: 'loop', deck: 'B', len: 0, at: 50 }, { type: 'align', at: 52, tol: 0.25 }] }
      ], len: 54 },
    { id: 'beatjump', mod: 'loops', name: 'Shift a loop, then beat-jump back to the phrase', tracks: ['loop:acid132'], from: 32,
      why: 'Beat jump moves the track (and any loop) by whole beats. Move a loop to a better part, then jump back so the track is on the phrase again: count where you are, jump the difference.',
      gear: 'CDJ: Beat Jump in the menu or the loop shift with SHIFT + the jog. DJM: nothing extra.',
      need: { 'A.volume': '>' },
      steps: [
        { at: 0, say: 'Pad 5 in LOOP mode on {bar:0}: a 4-beat loop.', ids: ['A.mode2', 'A.pad.hotcue.5'], act: tap('A.pad.loop.5', 0), rules: [press('A.pad.loop.5', 0), { type: 'loop', deck: 'A', len: 4, at: 2 }] },
        { at: 8, say: 'Beatjump mode (SHIFT + the 4th mode button), pad 6 (+4 beats) on {bar:8}: the loop moves on a bar.', ids: ['A.shift', 'A.mode4', 'A.pad.hotcue.6'], act: tap('A.pad.beatjump.6', 8), rules: [press('A.pad.beatjump.6', 8)] },
        { at: 12, say: 'Push the LOOP knob on {bar:12} to let go. The track is now 2 bars behind the phrase.', ids: ['A.loopPush'], act: tap('A.loopPush', 12), rules: [press('A.loopPush', 12, { tol: 0.5 })] },
        { at: 16, say: 'Pad 8 (+8 beats) on the 1 of {bar:16}: back on the phrase.', ids: ['A.pad.hotcue.8'], act: tap('A.pad.beatjump.8', 16), rules: [press('A.pad.beatjump.8', 16), { type: 'deckPhase', deck: 'A', at: 20 }] }
      ], len: 22 },
    // ---- 2. Filters ----
    { id: 'hpOutLpIn', mod: 'filters', name: 'High-pass out, low-pass in', tracks: ['loop:groove128', 'loop:rumble130'], from: 32, bPlays: true,
      why: 'Turn the outgoing track\'s FILTER right (high-pass: the bass drains away) while the incoming track\'s FILTER comes back from the left (low-pass: muffled to full). They trade places without the basses fighting.',
      gear: 'DJM: the Color FX knob set to FILTER on each channel. CDJ: nothing extra.',
      need: { 'A.volume': '>', 'B.volume': '>', 'B.filter': 'lp' },
      steps: [
        { at: -8, say: 'Deck B is playing low-passed (FILTER left). Get ready to trade on {bar:0}.', ids: ['A.filter', 'B.filter'] },
        { at: 0, say: 'Over 4 bars: Deck A FILTER slowly right, Deck B FILTER slowly back to the middle. Follow the lines.', ids: ['A.filter', 'B.filter'], act: [knob('A.filter', [[0, 0.5], [16, 0.85]]), knob('B.filter', [[0, 0.15], [16, 0.5]])], rules: [{ type: 'ramp', deck: 'A', key: 'filter', pts: [[0, 0.5], [16, 0.85]], w: 2 }, { type: 'ramp', deck: 'B', key: 'filter', pts: [[0, 0.15], [16, 0.5]], w: 2 }] },
        { at: 16, say: 'On {bar:16}: Deck A volume all the way down.', ids: ['A.volume'], act: [knob('A.volume', [[16, 1], [16.3, 0]])], rules: [{ type: 'move', deck: 'A', key: 'volume', to: 0, from: 1, at: 16, tol: 0.25 }, { type: 'state', deck: 'B', key: 'filter', v: 0.5, at: 18, msg: 'Deck B\'s FILTER wasn\'t back in the middle when it took over.' }] }
      ], len: 20 },
    { id: 'sweep', mod: 'filters', name: 'Filter sweep into the phrase', tracks: ['loop:rumble130'], from: 16,
      why: 'Sweep the FILTER right slowly over the last 4 bars of a phrase, then snap it back to the middle exactly on the 1. The release is the moment: early or late kills it.',
      gear: 'DJM: Color FX FILTER (or the Sweep FX) with the knob. CDJ: nothing extra.',
      need: { 'A.volume': '>', 'A.filter': 'mid' },
      steps: [
        { at: -16, say: 'Over the next 4 bars, sweep Deck A FILTER slowly right. Follow the line.', ids: ['A.filter'], act: [knob('A.filter', [[-16, 0.5], [-0.3, 0.85], [0, 0.5]])], rules: [{ type: 'ramp', deck: 'A', key: 'filter', pts: [[-16, 0.5], [-1, 0.85]] }] },
        { at: 0, say: 'Snap it back to the middle on the 1 of {bar:0}!', ids: ['A.filter'], rules: [{ type: 'move', deck: 'A', key: 'filter', to: 0.5, from: 0.85, at: 0, tol: Q, w: 2 }, { type: 'state', deck: 'A', key: 'filter', v: 0.5, at: 1, msg: 'The filter wasn\'t back in the middle when the phrase started.' }] }
      ], len: 4 },
    { id: 'loopFilter', mod: 'filters', name: 'Loop and filter build', tracks: ['loop:acid132'], from: 32,
      why: 'Put a loop on and halve it while sweeping the high-pass up: two kinds of tension at once. Let go of both on the 1.',
      gear: 'CDJ: 4-beat loop and 1/2X. DJM: Color FX FILTER, often with a little echo.',
      need: { 'A.volume': '>', 'A.filter': 'mid' },
      steps: [
        { at: 0, say: 'Pad 6 (8-beat loop, LOOP mode) on {bar:0}, and start sweeping the FILTER right.', ids: ['A.pad.hotcue.6', 'A.filter'], act: tap('A.pad.loop.6', 0).concat([knob('A.filter', [[0, 0.5], [15.7, 0.8], [16, 0.5]])]), rules: [press('A.pad.loop.6', 0), { type: 'ramp', deck: 'A', key: 'filter', pts: [[0, 0.5], [15, 0.8]] }] },
        { at: 8, say: 'LOOP knob left on {bar:8} (4 beats), and again on {bar:12} (2 beats).', ids: ['A.loopKnob'], act: [{ at: 8, id: 'A.loopKnob', delta: -1 }, { at: 12, id: 'A.loopKnob', delta: -1 }], rules: [{ type: 'turn', id: 'A.loopKnob', dir: -1, at: 8, tol: Q }, { type: 'turn', id: 'A.loopKnob', dir: -1, at: 12, tol: Q }] },
        { at: 16, say: 'On the 1 of {bar:16}: push the LOOP knob and FILTER back to the middle.', ids: ['A.loopPush', 'A.filter'], act: tap('A.loopPush', 16), rules: [press('A.loopPush', 16), { type: 'loop', deck: 'A', len: 0, at: 17 }, { type: 'state', deck: 'A', key: 'filter', v: 0.5, at: 17, msg: 'The filter was still on when the drop hit.' }] }
      ], len: 20 },
    { id: 'acidRide', mod: 'filters', name: 'Acid filter ride', tracks: ['loop:acid126'], from: 16,
      why: 'Acid lines love a hand on the low-pass: close it right down, open it up, play it like an instrument in time with the phrase.',
      gear: 'DJM: Color FX FILTER, turned left of centre. CDJ: nothing extra.',
      need: { 'A.volume': '>', 'A.filter': 'mid' },
      steps: [
        { at: 0, say: 'Ride Deck A FILTER along the line: down to the left and back, twice, over 8 bars.', ids: ['A.filter'], act: [knob('A.filter', [[0, 0.5], [6, 0.18], [12, 0.45], [20, 0.12], [28, 0.5], [32, 0.5]])], rules: [{ type: 'ramp', deck: 'A', key: 'filter', pts: [[0, 0.5], [6, 0.18], [12, 0.45], [20, 0.12], [28, 0.5]], w: 3 }, { type: 'state', deck: 'A', key: 'filter', v: 0.5, at: 30, msg: 'Finish with the filter back in the middle.' }] }
      ], len: 32 },
    // ---- 3. EQ and speed ----
    { id: 'fastSwap', mod: 'eq', name: 'Bass swap in one beat', tracks: ['loop:groove128', 'loop:rumble130'], from: 32, bPlays: true,
      why: 'Both tracks are playing; only one has its bass. On the 1, swap them in a single move: one LOW fully left as the other comes to the middle. One beat, no overlap, no gap.',
      gear: 'DJM: the LOW EQ knobs (or the 3-band isolator). CDJ: nothing extra.',
      need: { 'A.volume': '>', 'B.volume': '>', 'B.eqLow': 'kill', 'A.eqLow': 'mid' },
      steps: [
        { at: -4, say: 'Hands on both LOW knobs. Swap on the 1 of {bar:0}.', ids: ['A.eqLow', 'B.eqLow'] },
        { at: 0, say: 'Swap: Deck A LOW fully left, Deck B LOW to the middle, together.', ids: ['A.eqLow', 'B.eqLow'], act: [knob('A.eqLow', [[0, 0.5], [0.3, 0]]), knob('B.eqLow', [[0, 0], [0.3, 0.5]])], rules: [{ type: 'move', deck: 'A', key: 'eqLow', to: 0, from: 0.5, at: 0, tol: Q }, { type: 'move', deck: 'B', key: 'eqLow', to: 0.5, from: 0, at: 0, tol: Q }, { type: 'noClash', from: -2, to: 6, allow: 0.5 }] }
      ], len: 8, speed: { n: 4, every: 4, label: '4 clean swaps, one per bar', steps: function (k) { var a = k * 4, odd = k % 2; return [{ at: a, say: 'Swap the bass on {bar:' + a + '}.', ids: ['A.eqLow', 'B.eqLow'], act: [knob('A.eqLow', [[a, odd ? 0 : 0.5], [a + 0.3, odd ? 0.5 : 0]]), knob('B.eqLow', [[a, odd ? 0.5 : 0], [a + 0.3, odd ? 0 : 0.5]])], rules: [{ type: 'move', deck: 'A', key: 'eqLow', to: odd ? 0.5 : 0, from: odd ? 0 : 0.5, at: a, tol: Q }, { type: 'move', deck: 'B', key: 'eqLow', to: odd ? 0 : 0.5, from: odd ? 0.5 : 0, at: a, tol: Q }] }]; } } },
    { id: 'chop', mod: 'eq', name: 'EQ chopping', tracks: ['loop:rumble130'], from: 32,
      why: 'Kill and bring back the bass on the beat to make the groove stutter: off on 1, back on 2, off on 3, back on 4. Precision is everything.',
      gear: 'DJM: LOW EQ (or isolator) kills, or the channel fader cut. CDJ: nothing extra.',
      need: { 'A.volume': '>', 'A.eqLow': 'mid' },
      steps: [
        { at: 0, say: 'Deck A LOW: off on 1, back on 2, off on 3, back on 4 of {bar:0}.', ids: ['A.eqLow'], act: [knob('A.eqLow', [[0, 0.5], [0.1, 0], [0.95, 0], [1.05, 0.5], [1.95, 0.5], [2.05, 0], [2.95, 0], [3.05, 0.5]])],
          rules: [{ type: 'move', deck: 'A', key: 'eqLow', to: 0, from: 0.5, at: 0, tol: Q, window: 0.5 }, { type: 'move', deck: 'A', key: 'eqLow', to: 0.5, from: 0, at: 1, tol: Q, window: 0.5 }, { type: 'move', deck: 'A', key: 'eqLow', to: 0, from: 0.5, at: 2, tol: Q, window: 0.5 }, { type: 'move', deck: 'A', key: 'eqLow', to: 0.5, from: 0, at: 3, tol: Q, window: 0.5 }] }
      ], len: 6 },
    { id: 'cutDown', mod: 'eq', name: 'Quick cut on the downbeat', tracks: ['loop:acid132', 'loop:hard135'], from: 32, bPlays: true, bVol: 0,
      why: 'A hard cut: one fader down and the other up in the same instant, exactly on the 1. Done right it sounds like the record changed itself.',
      gear: 'DJM: channel faders (or the crossfader set to a sharp curve). CDJ: nothing extra.',
      need: { 'A.volume': '>', 'B.volume': '<' },
      steps: [
        { at: -4, say: 'Deck B is playing silently in time. Cut on the 1 of {bar:0}.', ids: ['A.volume', 'B.volume'] },
        { at: 0, say: 'Cut now: Deck A down, Deck B up.', ids: ['A.volume', 'B.volume'], act: [knob('A.volume', [[0, 1], [0.1, 0]]), knob('B.volume', [[0, 0], [0.1, 1]])], rules: [{ type: 'move', deck: 'A', key: 'volume', to: 0, from: 1, at: 0, tol: Q }, { type: 'move', deck: 'B', key: 'volume', to: 1, from: 0, at: 0, tol: Q }] }
      ], len: 6 },
    { id: 'longBlend', mod: 'eq', name: 'Three-band blend over 16 bars', tracks: ['loop:groove128', 'loop:acid126'], from: 16, bPlays: true, bVol: 0, aux: true,
      why: 'Bring the new track in band by band: highs first, then mids, then swap the lows, then take the old track\'s highs and mids out. Sixteen bars where the two become one.',
      gear: 'DJM: HI, MID and LOW EQ on both channels. CDJ: nothing extra.',
      need: { 'A.volume': '>', 'B.volume': '<', 'B.eqLow': 'kill', 'B.eqMid': 'kill', 'B.eqHigh': 'kill' },
      steps: [
        { at: 0, say: 'Deck B volume up, then its HIGH to the middle over 4 bars.', ids: ['B.volume', 'B.eqHigh'], act: [knob('B.volume', [[0, 0], [2, 1]]), knob('B.eqHigh', [[2, 0], [16, 0.5]])], rules: [{ type: 'ramp', deck: 'B', key: 'eqHigh', pts: [[2, 0], [16, 0.5]] }] },
        { at: 16, say: 'Deck B MID to the middle over 4 bars.', ids: ['B.eqMid'], act: [knob('B.eqMid', [[16, 0], [32, 0.5]])], rules: [{ type: 'ramp', deck: 'B', key: 'eqMid', pts: [[16, 0], [32, 0.5]] }] },
        { at: 32, say: 'Swap the LOWs over 2 bars: A down, B up.', ids: ['A.eqLow', 'B.eqLow'], act: [knob('A.eqLow', [[32, 0.5], [40, 0]]), knob('B.eqLow', [[32, 0], [40, 0.5]])], rules: [{ type: 'ramp', deck: 'B', key: 'eqLow', pts: [[32, 0], [40, 0.5]] }, { type: 'ramp', deck: 'A', key: 'eqLow', pts: [[32, 0.5], [40, 0]] }, { type: 'noClash', from: 30, to: 64, allow: 2 }] },
        { at: 48, say: 'Deck A HIGH and MID down over 4 bars, then its volume out.', ids: ['A.eqHigh', 'A.eqMid', 'A.volume'], act: [knob('A.eqHigh', [[48, 0.5], [60, 0]]), knob('A.eqMid', [[48, 0.5], [60, 0]]), knob('A.volume', [[60, 1], [64, 0]])], rules: [{ type: 'ramp', deck: 'A', key: 'eqHigh', pts: [[48, 0.5], [60, 0]] }, { type: 'state', deck: 'A', key: 'volume', op: '<', v: 0.1, at: 66, msg: 'Deck A was still up at the end.' }] }
      ], len: 68 },
    // ---- 4. FX exits ----
    { id: 'echoOut', mod: 'fx', name: 'Echo out', tracks: ['loop:groove128', 'loop:hard135'], from: 32, bPlays: true, bVol: 0,
      why: 'Turn an echo on, then pull the fader down on the 1: the track stops but its echoes ring out over the next one. A clean way out of anything.',
      gear: 'DJM: Beat FX ECHO at 3/4 or 1 beat, ON before the cut. CDJ: nothing extra.',
      need: { 'A.volume': '>', 'B.volume': '<' },
      steps: [
        { at: -4, say: 'FX pads (FX mode): pad 2, Echo ¾, on Deck A at the start of {bar:-4}.', ids: ['A.shift', 'A.mode2', 'A.pad.hotcue.2'], act: tap('A.pad.fx.2', -4), rules: [press('A.pad.fx.2', -4, { tol: 0.5 }), { type: 'fx', deck: 'A', on: 'echo', at: -1 }] },
        { at: 0, say: 'On the 1 of {bar:0}: Deck A volume down and Deck B up. Let the echo ring.', ids: ['A.volume', 'B.volume'], act: [knob('A.volume', [[0, 1], [0.1, 0]]), knob('B.volume', [[0, 0], [0.3, 1]])], rules: [{ type: 'move', deck: 'A', key: 'volume', to: 0, from: 1, at: 0, tol: Q }, { type: 'state', deck: 'B', key: 'volume', op: '>', v: 0.6, at: 2, msg: 'Deck B wasn\'t up when the echo was ringing out.' }] },
        { at: 4, say: 'Turn the echo off (pad 2 again) once the tail has gone.', ids: ['A.pad.hotcue.2'], act: tap('A.pad.fx.2', 6), rules: [{ type: 'fx', deck: 'A', at: 12, msg: 'Deck A\'s echo was still on. Turn it off so it\'s ready for next time.' }] }
      ], len: 14 },
    { id: 'fxCover', mod: 'fx', name: 'FX to cover a quick change', tracks: ['loop:acid126', 'loop:hard135'], from: 32,
      why: 'Two tracks that don\'t blend (different tempo or style)? Wash the old one with reverb, cut, and start the new one on the 1. The FX hides the join.',
      gear: 'DJM: Beat FX REVERB or ECHO, then a channel-fader cut. CDJ: start the next deck on the cut.',
      need: { 'A.volume': '>', 'B.volume': '>' },
      steps: [
        { at: -8, say: 'FX mode, pad 5 (Reverb) on Deck A on {bar:-8}.', ids: ['A.shift', 'A.mode2', 'A.pad.hotcue.5'], act: tap('A.pad.fx.5', -8), rules: [{ type: 'fx', deck: 'A', on: 'reverb', at: -2 }] },
        { at: 0, say: 'On the 1 of {bar:0}: Deck A volume down and Deck B PLAY.', ids: ['A.volume', 'B.play'], act: [knob('A.volume', [[0, 1], [0.1, 0]])].concat(tap('B.play', 0)), rules: [{ type: 'move', deck: 'A', key: 'volume', to: 0, from: 1, at: 0, tol: Q }, press('B.play', 0)] },
        { at: 4, say: 'Reverb off (pad 5 again).', ids: ['A.pad.hotcue.5'], act: tap('A.pad.fx.5', 6), rules: [{ type: 'fx', deck: 'A', at: 10 }] }
      ], len: 12 },
    // ---- 5. Hot cues and structure ----
    { id: 'cues', mod: 'cues', name: 'Hot cues on phrases, and jumping', tracks: ['loop:rumble130'], from: 16, clearCues: true,
      why: 'Set hot cues on phrase starts as the track plays. Later, jump to one exactly on the 1 and the track carries on in time, from a different part.',
      gear: 'CDJ: HOT CUE A-H buttons (set while playing, press to jump). DJM: nothing extra.',
      need: { 'A.volume': '>' },
      steps: [
        { at: 0, say: 'Hot cue mode: pad 1 on the 1 of {bar:0} (sets a cue on the phrase).', ids: ['A.mode1', 'A.pad.hotcue.1'], act: tap('A.pad.hotcue.1', 0), rules: [press('A.pad.hotcue.1', 0)] },
        { at: 16, say: 'Pad 2 on {bar:16} (another phrase).', ids: ['A.pad.hotcue.2'], act: tap('A.pad.hotcue.2', 16), rules: [press('A.pad.hotcue.2', 16)] },
        { at: 32, say: 'Now jump: pad 1 on the 1 of {bar:32}. The track goes back, still on the phrase.', ids: ['A.pad.hotcue.1'], act: tap('A.pad.hotcue.1', 32), rules: [press('A.pad.hotcue.1', 32), { type: 'deckPhase', deck: 'A', at: 36 }] }
      ], len: 38 },
    { id: 'doubleDrop', mod: 'cues', name: 'Double drop', tracks: ['loop:drop130', 'loop:dropacid130'], from: 0, bCue: 32, bVol: 0,
      why: 'Two tracks with drops at the same point: start the second one exactly so both breakdowns and both drops land together. Both full on the drop, one bass killed.',
      gear: 'CDJ: Beat Sync plus a hot cue on the incoming track. DJM: kill one LOW so the drops don\'t clash.',
      need: { 'A.volume': '>', 'B.volume': '<', 'B.eqLow': 'kill', 'B.sync': 'on' },
      steps: [
        { at: 16, say: 'Deck B is cued at its bar 9. Press Deck B PLAY on the 1 of {bar:32}.', ids: ['B.play'] },
        { at: 32, say: 'Deck B PLAY now!', ids: ['B.play'], act: tap('B.play', 32), rules: [press('B.play', 32)] },
        { at: 64, say: 'The breakdown (both tracks). Bring Deck B volume up for the drop on {bar:96}.', ids: ['B.volume'], act: [knob('B.volume', [[64, 0], [90, 1]])], rules: [] },
        { at: 96, say: 'The drop: both tracks, one bass.', ids: [], rules: [{ type: 'dropTogether', at: 96, tol: 0.25, w: 3 }, { type: 'state', deck: 'B', key: 'volume', op: '>', v: 0.6, at: 98, msg: 'Deck B wasn\'t up for the drop.' }] }
      ], len: 100, absolute: true },
    // ---- 6. Tempo and key ----
    { id: 'tempoRide', mod: 'tempo', name: 'Gradual tempo change: 132 to 138', tracks: ['loop:acid132'], from: 16, syncOff: 'A',
      why: 'Raise the tempo so slowly nobody notices: a tiny nudge of the pitch fader every bar, about 0.4 BPM at a time, over 16 bars.',
      gear: 'CDJ: the TEMPO slider in small steps (with Master Tempo on to keep the key). DJM: nothing extra.',
      need: { 'A.volume': '>', 'A.sync': 'off' },
      steps: [
        { at: 0, say: 'Push Deck A\'s pitch fader down (faster) a hair every bar. Aim for 138 BPM by {bar:64}.', ids: ['A.pitch'], act: [knob('A.pitch', [[0, 0], [62, 6 / 132]])], rules: [{ type: 'tempo', deck: 'A', target: 138, from: 0, to: 64, maxStep: 0.25, w: 2 }] }
      ], len: 66, pitchDemo: true },
    { id: 'harmonic', mod: 'tempo', name: 'Harmonic mixing: hear a key clash', kind: 'quiz', tracks: ['loop:acid132', 'loop:acid132e', 'loop:acid132eb'],
      why: 'Tracks in neighbouring Camelot keys (8A with 7A, 9A or 8B) sit together; keys far apart clash: the basslines rub and it sounds sour. You\'ll hear two blends: pick the one that clashed.',
      gear: 'CDJ: the key shows on the screen (rekordbox analysis). DJM: nothing. Pick neighbouring Camelot numbers.' },
    // ---- 7. Advanced beatmatching ----
    { id: 'byEar', mod: 'match', name: 'Beatmatch by ear, no aids', kind: 'match', tracks: ['loop:groove128', 'loop:rumble130'], from: 16, aidsOff: true,
      why: 'No waveforms, no numbers, no guide lights. Listen: if the kicks gallop, nudge the jog; if they drift apart over time, move the pitch fader. Match within 12 bars, then keep it locked for 12 more.',
      gear: 'CDJ: TEMPO slider and the jog wheel edge (Sync off, the BPM display covered). DJM: cue the incoming deck in your headphones.',
      need: { 'A.volume': '>', 'B.volume': '>', 'B.sync': 'off' } },
    { id: 'drift', mod: 'match', name: 'Riding the pitch to correct drift', kind: 'match', drift: true, tracks: ['loop:acid126', 'loop:acid132'], from: 16,
      why: 'Even matched tracks drift. Don\'t keep fixing it with the jog wheel: hear which way it\'s going and make one tiny pitch fader move so it stops drifting.',
      gear: 'CDJ: the TEMPO slider at 0.02% steps (wide range off). DJM: headphone cue on the incoming channel.',
      need: { 'A.volume': '>', 'B.volume': '>', 'B.sync': 'off' } }
  ];
  var ORDER = T.map(function (t) { return t.id; });
  function tech(id) { return T.filter(function (t) { return t.id === id; })[0]; }
  var NEED_TEXT = { '>': 'up', '<': 'down', mid: 'in the middle', kill: 'fully left', lp: 'turned left (a low-pass)', on: 'on', off: 'off' };
  var NAMES = { volume: 'volume', eqLow: 'LOW', eqMid: 'MID', eqHigh: 'HIGH', filter: 'FILTER', sync: 'SYNC' };

  // ---------- storage ----------
  function progress() { return S.load('academy', {}) || {}; }
  function record(id, a) {
    var p = progress(); (p[id] = p[id] || []).push(a); if (p[id].length > 30) p[id].splice(0, p[id].length - 30); S.save('academy', p);
    // the Nudge app unlocks an outfit for your first lesson at Solid or better
    try { if (id.indexOf(':') === -1 && K.mastery(p[id]).level !== 'Learning' && !S.load('mastered', '')) S.save('mastered', id); } catch (e) {}
  }
  function aids() { return S.load('aids', { phrase: true, waves: true, energy: true }); }
  function aidsOff() { var a = aids(); return a.phrase === false && a.waves === false && a.energy === false; }
  function latency() { return S.load('latency', null); }
  function deviceSig() { var e = E(), st = P.settings(); return (st.outId || 'default') + '|' + (e ? Math.round(((e.ctx.outputLatency || 0) + (e.ctx.baseLatency || 0)) * 100) : 0); }
  function needsCalibration() { var l = latency(); return !l || l.dev !== deviceSig(); }

  // ---------- the lesson clock: bars counted from Deck A, continuous through loops and jumps ----------
  function clockAt(t) { var c = L.clk; return c.b0 + (t - c.t0) * c.bpm / 60; }
  function heardBeat(ts) { var lat = (latency() || { ms: 0 }).ms / 1000; return clockAt(P.heardAt(ts) - lat); }
  function anchor() { var A = E().decks.A, now = E().now(); L.clk = { b0: A.beatPos(now), t0: now, bpm: A.bpm() }; }
  function keepClock() { var A = E().decks.A, now = E().now(); if (Math.abs(A.bpm() - L.clk.bpm) > 1e-4) L.clk = { b0: clockAt(now), t0: now, bpm: A.bpm() }; }
  function ds(d) { return { on: d.playing && !!d.track, vol: d.vals.volume, low: d.vals.eqLow, mid: d.vals.eqMid, high: d.vals.eqHigh, filter: d.vals.filter, beat: d.track ? d.beatPos() : 0, bpm: d.track ? d.bpm() : 0, loop: d.loop ? d.loopLen() : 0, fx: d.fxLabel() }; }

  // ---------- picking tracks ----------
  function lib() { return P.lib(); }
  function tracksFor(t) {
    var src = S.load('acSrc', 'loops');
    if (src === 'mine' && t.kind !== 'quiz' && !/drop|acid132e/.test(t.tracks.join(' '))) {
      var mine = lib().items.filter(function (x) { return x.own && x.analysed && !x.error && x.bpm; });
      if (mine.length >= (t.tracks.length > 1 ? 2 : 1)) {
        var a = mine[Math.floor(Math.random() * mine.length)];
        if (t.tracks.length < 2) return [a];
        var fr = lib().friends(a).filter(function (x) { return x.own && x.analysed; });
        if (fr.length) return [a, fr[Math.floor(Math.random() * fr.length)]];
      }
      S.toast('Not enough of your own analysed tracks for this one: using the built-in loops.');
    }
    return t.tracks.map(function (id) { return lib().get(id); });
  }

  // ---------- the play screen ----------
  function playHtml(title, sub) {
    var a = aids();
    return '<canvas id="club" class="club" aria-hidden="true"' + (a.energy === false ? ' hidden' : '') + '></canvas>' +
      '<section class="panel hud"><div class="hud-top"><div class="grow"><div class="eyebrow">' + esc(sub || '') + '</div><h2 id="hudTitle">' + esc(title) + '</h2></div>' + (G && G.topBarHtml ? G.topBarHtml('play') : '') + '<button type="button" class="bbtn ghost sm" data-ac="leave">Stop and leave</button></div>' +
      '<div class="hud-main"><div class="grow"><div class="step" id="hudStep"></div><div class="hud-sub" id="hudSub"></div><div class="warn" id="hudWarn"></div><div class="ac-feed" id="acFeed"></div><div class="lanes-wrap" id="lanesWrap" hidden><canvas id="lanes" class="lanes"></canvas></div></div>' +
      '<div class="hud-dia" id="hudDia">' + S.diagram() + '</div></div></section>' +
      '<div class="guide" id="guide"></div><div class="wfs"><canvas id="wfA" class="wf"></canvas><canvas id="wfB" class="wf"></canvas></div>' +
      '<div class="decks3" id="decks3">' + P.deckPanel('A') + P.mixerPanel() + P.deckPanel('B') + '</div><div id="resultSlot"></div>';
  }
  function setStep(text, ids, sub, warn) {
    var s = el('hudStep'); if (s && s.textContent !== text) { s.textContent = text; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
    var u = el('hudSub'); if (u && u.innerHTML !== (sub || '')) u.innerHTML = sub || '';
    var w = el('hudWarn'); if (w && w.textContent !== (warn || '')) w.textContent = warn || '';
    var key = (ids || []).join(','); if (setStep.last !== key) { setStep.last = key; focus(ids || []); }
  }
  function diaG(id) {
    var pm = /^([AB])\.pad\.[a-zA-Z]+\.(\d)$/.exec(id);
    return document.querySelectorAll(pm ? '#hudDia [data-pad="' + pm[1] + '.' + pm[2] + '"]' : '#hudDia [data-id="' + id + '"], #hudDia [data-also="' + id + '"]');
  }
  function focus(ids) {
    document.querySelectorAll('#hudDia .c.focus').forEach(function (g) { g.classList.remove('focus'); });
    ids.forEach(function (id) { diaG(id).forEach(function (g) { g.classList.add('focus'); }); });
  }
  /** The demo moves the controls on the mini diagram too. */
  function paintDia(id, v, hit) {
    diaG(id).forEach(function (g) {
      if (hit) { g.classList.add('hit'); setTimeout(function () { g.classList.remove('hit'); }, 300); }
      if (v === undefined) return;
      var ind = g.querySelector('.ind'); if (ind && !/jog/.test(id)) ind.setAttribute('transform', 'rotate(' + (-135 + v * 270) + ')');
      var vf = g.getAttribute('data-vf'); if (vf) { var y = vf.split(',').map(Number), cap = g.querySelector('.cap'); if (cap) cap.setAttribute('y', y[1] - (y[1] - y[0]) * (/pitch/.test(id) ? 1 - v : v) - 9); }
    });
  }
  function fillText(s) {
    var showBars = aids().phrase !== false;
    return s.replace(/\{bar:(-?\d+(?:\.\d+)?)\}/g, function (_, n) { return showBars ? 'bar ' + bar(L.P + +n) : 'the next phrase'; });
  }
  function countdown(beatsLeft) { if (aids().phrase === false) return ''; var b = Math.ceil(beatsLeft); return b > 16 ? 'in ' + Math.ceil(b / 4) + ' bars' : b > 0 ? '<span class="count">' + (b <= 4 ? b : Math.ceil(b / 4) + ' bars') + '</span>' : ''; }

  // ---------- running a lesson ----------
  // phase: 'explain' | 'demo' | 'practice' | 'test' | 'speed' | 'warm'
  function start(id, phase, opts) {
    var t = tech(id); if (!t) return;
    opts = opts || {};
    if (phase !== 'explain' && phase !== 'demo' && needsCalibration() && !S.load('skipCal', false)) { S.save('afterCal', { id: id, phase: phase }); location.hash = 'calibrate'; return; }
    P.start().then(function () {
      if (G && G.stop) G.stop();
      var v = P.view; v.hideBpm = {}; v.hideWaves = aids().waves === false || !!t.aidsOff; v.helper = !t.aidsOff; v.guide = t.aidsOff ? 'off' : 'auto'; v.guideDeck = ''; v.onLoad = null; v.onControl = onControl; v.frame = frame;
      L = { t: t, id: id, phase: phase, state: 'loading', E: [], S: [], feed: [], warm: opts.warm || null, steps: phase === 'speed' && t.speed ? speedSteps(t) : t.steps || [] };
      if (location.hash.indexOf('#play') !== 0) location.hash = 'play';
      S.el('screen').innerHTML = playHtml(t.name, ({ explain: 'Academy', demo: 'Demo', practice: 'Practice', test: 'Test', speed: 'Speed challenge', warm: 'Warm-up' })[phase] + ' · ' + modName(t.mod));
      P.sizeCanvases(); if (G && G.sizeClub) G.sizeClub(); P.dirty();
      if (phase === 'explain') return explain();
      if (t.kind === 'quiz') return quizStart();
      load();
    });
  }
  function modName(m) { return (MODULES.filter(function (x) { return x.id === m; })[0] || {}).name || ''; }
  function speedSteps(t) { var out = []; for (var k = 0; k < t.speed.n; k++) out = out.concat(t.speed.steps(k)); return out; }
  function explain() {
    var t = L.t;
    L.state = 'explain';
    var btns = t.kind ? '<button type="button" class="bbtn primary" data-ac="phase" data-p="practice">' + (t.kind === 'quiz' ? 'Listen' : 'Practise it') + '</button><button type="button" class="bbtn" data-ac="phase" data-p="test">Take the test</button>' :
      '<button type="button" class="bbtn primary" data-ac="phase" data-p="demo">Watch the demo</button><button type="button" class="bbtn" data-ac="phase" data-p="practice">Practise it</button><button type="button" class="bbtn" data-ac="phase" data-p="test">Straight to the test</button>';
    if (t.speed) btns += '<button type="button" class="bbtn ghost" data-ac="phase" data-p="speed">Speed challenge: ' + esc(t.speed.label) + '</button>';
    setStep(t.why, [], '<p class="small ac-gear"><b>On other gear:</b> ' + esc(t.gear) + '</p><div class="row wrap">' + btns + '</div>', '');
    focus(uniqueIds(t.steps || []).concat(t.kind === 'match' ? ['B.pitch', 'B.jogEdge'] : []));
  }
  function uniqueIds(steps) { var o = []; steps.forEach(function (s) { (s.ids || []).forEach(function (i) { if (o.indexOf(i) === -1) o.push(i); }); }); return o; }
  function load() {
    var t = L.t, e = E(), A = e.decks.A, B = e.decks.B, tr = tracksFor(t);
    setStep('Loading the tracks…', []);
    A.stop(); B.stop(); A.clearOffset(); B.clearOffset(); A.setLoop(null); B.setLoop(null); A.setFx(null); B.setFx(null);
    var jobs = [P.loadTo('A', tr[0], true)]; if (t.kind === 'match' || tr[1]) jobs.push(P.loadTo('B', tr[1] || tr[0], true));
    Promise.all(jobs).then(function () {
      A.setSync(!t.syncOff); B.setSync(t.kind !== 'match');
      if (t.clearCues) A.hot = [];
      L.state = L.phase === 'demo' || L.phase === 'selftest' ? 'demoSetup' : 'setup'; P.dirty();
    }, function () { setStep('Couldn\'t load those tracks. Check the Library.', []); });
  }
  /** Before the clock starts: the controls you need in place (checked live). */
  function needs() {
    var t = L.t, n = t.need || {}, out = [], e = E();
    Object.keys(n).forEach(function (k) {
      var d = e.decks[k[0]], what = k.slice(2), want = n[k], ok;
      if (what === 'sync') ok = want === 'on' ? d.sync : !d.sync;
      else { var v = d.vals[what]; ok = want === '>' ? v > 0.7 : want === '<' ? v < 0.03 : want === 'mid' ? Math.abs(v - 0.5) < 0.06 : want === 'kill' ? v < 0.05 : want === 'lp' ? v < 0.25 : true; }
      out.push({ id: k, ok: ok, text: 'Deck ' + k[0] + ' ' + NAMES[what] + ' ' + NEED_TEXT[want] });
    });
    return out;
  }
  function begin() {
    // Deck A from its start point; the lesson clock and the phrase P follow
    var t = L.t, e = E(), A = e.decks.A, B = e.decks.B, bs = A.beatSec();
    A.seek(A.track.first + t.from * bs); A.play();
    anchor();
    L.P = t.absolute ? 0 : t.from + 16;                                          // a 4-bar lead-in
    if (t.absolute) { L.P = 0; L.clk.b0 = t.from; }
    var first = L.steps.length ? Math.min.apply(null, L.steps.map(function (s) { return s.at; })) : 0;
    if (L.P + first < t.from + 8) { var lead = t.from + 8 - (L.P + first); L.P += Math.ceil(lead / 16) * 16; }
    if (t.bCue !== undefined || t.bPlays || t.kind === 'match') {
      B.seek(B.track.first + (t.bCue || 0) * B.beatSec());
      if (t.bPlays || t.kind === 'match') {
        var k = t.kind === 'match';
        if (k) { var r = (t.drift ? 0.25 + Math.random() * 0.2 : 1.5 + Math.random() * 2.5) / 100 * (Math.random() < 0.5 ? -1 : 1); B.startAtPitch(A.track.bpm * (1 + r) / B.track.bpm - 1); if (t.drift) B.seek(B.track.first + (A.beatPos() + 0.0) * B.beatSec()); }
        else { B.seek(B.track.first + A.beatPos() * B.beatSec()); }
        B.play();
      }
    }
    L.iS = L.S.length; L.state = 'run'; L.t0 = e.now();
    if (t.kind === 'match') { L.len = 96; L.rules = t.drift ? [{ type: 'phaseLock', from: 24, to: 94, w: 2 }, { type: 'bpmMatch', at: 92, tol: 0.04 }] : [{ type: 'bpmMatch', at: 48, tol: 0.08 }, { type: 'phaseLock', from: 48, to: 94, w: 2 }]; L.P = t.from + 0; }   // a built-in loop is 32 bars: keep it inside
    else { L.len = L.phase === 'speed' ? L.steps[L.steps.length - 1].at + 6 : t.len; L.rules = []; L.steps.forEach(function (s) { (s.rules || []).forEach(function (r) { L.rules.push(r); }); }); }
  }
  function shift(r) {
    var o = Object.assign({}, r), P0 = L.P;
    if (typeof o.at === 'number') o.at += P0;
    if (o.type === 'noClash' || o.type === 'tempo' || o.type === 'phaseLock') { o.from += P0; o.to += P0; }   // beat windows (a move's from/to are knob values)
    if (o.pts) o.pts = o.pts.map(function (p) { return [p[0] + P0, p[1]]; });
    if (!o.grid && o.type !== 'align' && o.type !== 'phaseLock' && o.type !== 'dropTogether') o.grid = 'C';
    return o;
  }
  function onControl(e) {
    if (!L || L.state !== 'run' || L.phase === 'demo' || (L.demoing && L.phase !== 'selftest')) return;
    if (e.value !== undefined && e.kind !== 'button') return;          // faders and knobs are read from the samples
    if (e.id === 'A.shift' || e.id === 'B.shift') return;
    L.E.push({ id: e.id, down: e.down, delta: e.delta, bC: heardBeat(e.ts || performance.now()) });
  }
  // the demo: the decks play it, the diagram shows each move
  function demoTick(now) {
    L.demoing = true;
    L.steps.forEach(function (s) {
      (s.act || []).forEach(function (a) {
        var at = L.P + a.at;
        if (a.ramp) {
          var r0 = L.P + a.ramp[0][0], r1 = L.P + a.ramp[a.ramp.length - 1][0]; if (now < r0 - 0.05 || now > r1 + 0.6) return;
          var v = K.interp(a.ramp.map(function (p) { return [L.P + p[0], p[1]]; }), now), key = a.id + '|' + Math.round(v * (/pitch$/.test(a.id) ? 200000 : 400));
          if (L.sent[a.id] === key) return; L.sent[a.id] = key;
          if (/pitch$/.test(a.id)) { var dk = E().decks[a.id[0]]; dk.picked = true; dk.pitchFader(0.5 + v / (2 * dk.pitchRange)); v = 0.5 + v / (2 * dk.pitchRange); } else P.control({ id: a.id, kind: 'fader', value: v, ts: performance.now() });
          paintDia(a.id, v);
        } else {
          var key2 = a.id + '@' + a.at + (a.down === false ? 'u' : 'd') + (a.delta || ''); if (L.sent[key2] || now < at) return; L.sent[key2] = 1;
          if (a.delta) P.control({ id: a.id, kind: 'relative', delta: a.delta, ts: performance.now() });
          else P.control({ id: a.id, kind: 'button', down: a.down !== false, ts: performance.now() });
          if (a.down !== false) paintDia(a.id, undefined, true);
        }
      });
    });
    L.demoing = false;
  }
  function frame() {
    if (!L) return;
    var e = E(); if (!e) return;
    if (L.state === 'loading' || L.state === 'done' || L.state === 'explain' || L.state === 'quiz') { drawLanes(); return; }
    if (L.state === 'setup' || L.state === 'demoSetup') {
      if (L.state === 'demoSetup') { L.sent = {}; P.applyHardware(); begin(); demoPrep(); return; }
      var n = needs(), missing = n.filter(function (x) { return !x.ok; });
      if (!missing.length || L.go) { begin(); return; }
      setStep('Get ready: ' + missing[0].text + '.', missing.map(function (x) { return x.id; }).filter(function (x) { return !/sync/.test(x); }).concat(missing.some(function (x) { return /sync/.test(x.id); }) ? missing.filter(function (x) { return /sync/.test(x.id); }).map(function (x) { return x.id; }) : []),
        n.map(function (x) { return (x.ok ? '✓ ' : '○ ') + esc(x.text); }).join(' · ') + ' · <button type="button" class="bbtn sm ghost" data-ac="go">Start anyway</button>');
      return;
    }
    keepClock();
    var now = heardBeat(performance.now()), A = e.decks.A, B = e.decks.B;
    if (!L.lastS || e.now() - L.lastS > 0.045) { L.lastS = e.now(); L.S.push({ t: e.now(), db: e.masterDb(), A: ds(A), B: ds(B), C: { beat: now } }); }
    if (L.phase === 'demo' || L.phase === 'selftest') demoTick(now);
    var rel = now - L.P, cur = null;
    L.steps.forEach(function (s) { if (rel >= s.at - 4) cur = s; });
    if (L.t.kind === 'match') {
      var left = L.len - rel;
      setStep(L.t.drift ? 'Keep them locked: hear the drift, fix it with tiny pitch moves (not the jog).' : 'Match Deck B to Deck A by ear: pitch fader for tempo, jog edge for the kicks.', ['B.pitch', 'B.jogEdge'], countdown(Math.max(0, left)) + (L.t.drift ? '' : ' Scored from ' + (aids().phrase === false ? 'the 12th bar' : 'bar ' + bar(L.P + 48)) + ': tempo and how locked the kicks stay.'));
    } else if (!cur) setStep('Listen in. The lesson starts on ' + (aids().phrase === false ? 'the next phrase' : 'bar ' + bar(L.P + L.steps[0].at)) + '.', uniqueIds([L.steps[0]]), countdown(L.P + L.steps[0].at - now));
    else {
      var nx = L.steps.filter(function (s) { return s.at > rel; })[0];
      setStep(fillText(cur.say), cur.ids, (rel < cur.at ? countdown(cur.at - rel) + ' ' : '') + (nx && L.phase !== 'test' ? '<span class="muted">Next: ' + esc(fillText(nx.say)) + '</span>' : ''), '');
    }
    // practice: feedback on each step once its moment has passed
    if (L.phase === 'practice' || L.phase === 'demo') L.steps.forEach(function (s, i) {
      if (L.feedDone === undefined) L.feedDone = {};
      if (L.feedDone[i] || !s.rules || !s.rules.length || rel < s.at + (s.hold || 2)) return;
      L.feedDone[i] = 1;
      if (L.phase === 'demo') return;
      var r = K.evaluate(s.rules.map(shift), L.E, L.S.slice(L.iS));
      L.feed.unshift(r.total >= 90 ? '✓ ' + (r.good[0] || 'Spot on.') : (r.total >= 60 ? '~ ' : '✗ ') + (r.notes[0] || ''));
      var f = el('acFeed'); if (f) f.innerHTML = L.feed.slice(0, 3).map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('');
    });
    drawLanes(now);
    if (rel > L.len) finish();
  }
  function demoPrep() {
    // the demo sets the starting positions itself
    var t = L.t, e = E(), n = t.need || {};
    Object.keys(n).forEach(function (k) {
      var d = e.decks[k[0]], what = k.slice(2), want = n[k];
      if (what === 'sync') { d.setSync(want === 'on'); return; }
      d.set(what, want === '>' ? 1 : want === '<' ? 0 : want === 'kill' ? 0 : want === 'lp' ? 0.15 : 0.5); paintDia(k, d.vals[what]);
    });
    if (t.kind === 'match') { e.decks.B.set('volume', 0.8); }
  }
  function finish() {
    var t = L.t, phase = L.phase;
    L.state = 'done'; setStep('', []);
    if (phase === 'demo') { P.applyHardware(); return showAfterDemo(); }
    if (phase === 'selftest') { var st = K.evaluate(L.rules.map(shift), L.E, L.S.slice(L.iS)); L.selftest = st; P.applyHardware(); return showResult(st); }   // the demo scoring itself: checks every lesson's rules
    var res = K.evaluate(L.rules.map(shift), L.E, L.S.slice(L.iS));
    if (phase === 'test' || phase === 'warm' || phase === 'speed') record(phase === 'speed' ? t.id + ':speed' : t.id, { score: res.total, aidsOff: aidsOff() || !!t.aidsOff, at: Date.now() });
    if (L.warm) return warmNext(res);
    showResult(res);
  }
  function showAfterDemo() {
    el('resultSlot').innerHTML = '<div class="result panel"><h2>That\'s how it goes</h2><p class="small">Your turn. The decks and mixer are back where your controller actually is.</p><div class="row wrap"><button type="button" class="bbtn primary" data-ac="phase" data-p="practice">Practise it</button><button type="button" class="bbtn" data-ac="phase" data-p="demo">Watch again</button><button type="button" class="bbtn" data-ac="phase" data-p="test">Take the test</button></div></div>';
  }
  function showResult(res) {
    var t = L.t, phase = L.phase, m = K.mastery(progress()[t.id] || []), idx = ORDER.indexOf(t.id), nextT = T[idx + 1];
    var h = '<div class="result panel"><div class="res-head"><div class="grade g' + res.grade + '">' + res.grade + '</div><div class="grow"><div class="eyebrow">' + (phase === 'practice' ? 'Practice' : phase === 'speed' ? 'Speed challenge' : 'Test') + ' · ' + esc(modName(t.mod)) + '</div><h2>' + esc(t.name) + ': ' + res.total + '</h2>' +
      (phase !== 'practice' ? '<div class="small">Mastery: <b>' + esc(m.level) + '</b>' + (m.needs ? ' · ' + esc(m.needs) : '') + '</div>' : '<div class="small muted">Practice isn\'t counted. Take the test when it feels right.</div>') + '</div></div>';
    h += '<div class="ac-parts">' + res.parts.map(function (p) { return '<div class="ac-part"><span class="grow">' + esc(p.label) + '</span><span class="sbar"><i style="width:' + p.score + '%"></i></span><b class="mono">' + p.score + '</b></div>'; }).join('') + '</div>';
    if (res.notes.length) h += '<ul class="notes">' + res.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    if (res.good.length) h += '<ul class="notes good">' + res.good.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    if (phase === 'test' && !aidsOff() && m.level === 'Solid') h += '<p class="small">To lock it in, turn the ear-training aids off (Academy page) and pass the test 3 more times.</p>';
    h += '<p class="small"><b>On other gear:</b> ' + esc(t.gear) + '</p>';
    h += '<div class="row wrap">' + (phase === 'practice' ? '<button type="button" class="bbtn primary" data-ac="phase" data-p="test">Take the test</button><button type="button" class="bbtn" data-ac="phase" data-p="practice">Practise again</button>' :
      '<button type="button" class="bbtn primary" data-ac="phase" data-p="' + phase + '">Again</button><button type="button" class="bbtn" data-ac="phase" data-p="practice">Practise</button>') +
      (t.speed && phase !== 'speed' ? '<button type="button" class="bbtn" data-ac="phase" data-p="speed">Speed challenge</button>' : '') +
      (nextT && res.total >= 60 ? '<button type="button" class="bbtn" data-ac="open" data-t="' + nextT.id + '">Next: ' + esc(nextT.name) + '</button>' : '') +
      '<button type="button" class="bbtn ghost" data-ac="hub">All techniques</button></div></div>';
    el('resultSlot').innerHTML = h;
    el('resultSlot').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- ghost lines for knob and fader moves ----------
  function drawLanes(now) {
    var c = el('lanes'), wrap = el('lanesWrap'); if (!c || !L || !L.rules) return;
    var lines = L.rules.filter(function (r) { return r.type === 'ramp'; }).map(shift);
    if (!lines.length || L.phase === 'explain') { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (!c.width) { var rr = c.getBoundingClientRect(), dpr0 = window.devicePixelRatio || 1; c.width = Math.round(rr.width * dpr0); c.height = Math.round(rr.height * dpr0); if (!c.width) return; }
    var g = c.getContext('2d'), W = c.width, H = c.height, dpr = window.devicePixelRatio || 1, n = lines.length, lh = H / n, x0 = W * 0.22, span = 32, ppb = (W - x0) / (span * 0.78);
    now = now === undefined ? (L.S.length ? L.S[L.S.length - 1].C.beat : 0) : now;
    var bx = function (b) { return x0 + (b - now) * ppb; };
    g.clearRect(0, 0, W, H);
    for (var b = Math.ceil(now - x0 / ppb); b < now + span; b++) { if (b % 4) continue; g.fillStyle = b % 16 === 0 ? 'rgba(255,63,180,.5)' : 'rgba(255,255,255,.08)'; g.fillRect(bx(b), 0, dpr, H); }
    lines.forEach(function (Ln, i) {
      var y0 = i * lh, yv = function (v) { return y0 + lh - 6 * dpr - v * (lh - 14 * dpr); }, col = Ln.deck === 'A' ? '#ff3fb4' : '#7ff9ff', key = { volume: 'vol', eqLow: 'low', eqMid: 'mid', eqHigh: 'high' }[Ln.key] || Ln.key;
      g.fillStyle = 'rgba(244,236,255,.7)'; g.font = '600 ' + (11 * dpr) + 'px Inter, sans-serif'; g.fillText('Deck ' + Ln.deck + ' ' + (NAMES[Ln.key] || Ln.key), 8 * dpr, y0 + 15 * dpr);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3 * dpr; g.beginPath(); g.moveTo(bx(Ln.pts[0][0]), yv(Ln.pts[0][1])); Ln.pts.forEach(function (p) { g.lineTo(bx(p[0]), yv(p[1])); }); g.stroke();
      g.strokeStyle = col; g.lineWidth = 2.5 * dpr; g.beginPath(); var st = false;
      L.S.slice(Math.max(L.iS || 0, L.S.length - 500)).forEach(function (s) { var x = bx(s.C.beat); if (x < 0) return; var y = yv(s[Ln.deck][key]); if (!st) { g.moveTo(x, y); st = true; } else g.lineTo(x, y); });
      g.stroke();
    });
    g.fillStyle = '#fff'; g.fillRect(x0 - dpr, 0, 2 * dpr, H);
  }

  // ---------- harmonic quiz: hear two blends, pick the one that clashed ----------
  function quizStart() {
    var e = E(), tr = L.t.tracks.map(function (id) { return lib().get(id); }), clashFirst = Math.random() < 0.5;
    L.quiz = { order: clashFirst ? [tr[2], tr[1]] : [tr[1], tr[2]], answer: clashFirst ? 'first' : 'second', part: 0 };
    L.state = 'quiz';
    setStep('Loading…', []);
    Promise.all([P.loadTo('A', tr[0], true), P.loadTo('B', L.quiz.order[0], true)]).then(function () { quizPlay(0); });
  }
  function quizPlay(k) {
    var e = E(), A = e.decks.A, B = e.decks.B;
    var go = function () {
      A.setSync(true); B.setSync(true); A.stop(); B.stop(); A.seek(A.track.first); B.seek(B.track.first);
      A.set('volume', 1); B.set('volume', 1); B.set('eqLow', 0); A.play(); B.play();
      setStep('Blend ' + (k + 1) + ' of 2: listen to how the two acid lines sit together.', [], '8A with ' + (aids().phrase === false ? 'another key' : esc(L.quiz.order[k].camelot || '?')) + '. 16 seconds.');
      clearTimeout(L.qt); L.qt = setTimeout(function () { if (!L || L.state !== 'quiz') return; if (k === 0) { B.stop(); P.loadTo('B', L.quiz.order[1], true).then(function () { quizPlay(1); }); } else quizAsk(); }, 16000);
    };
    go();
  }
  function quizAsk() {
    var e = E(); e.decks.A.stop(); e.decks.B.stop(); P.applyHardware();
    setStep('Which blend clashed?', []);
    el('resultSlot').innerHTML = '<div class="result panel"><h2>Which blend clashed?</h2><p class="small">One acid line was a neighbouring key (9A, sits fine with 8A); the other was 2A, far round the wheel.</p><div class="row wrap"><button type="button" class="bbtn" data-ac="quiz" data-v="first">The first one</button><button type="button" class="bbtn" data-ac="quiz" data-v="second">The second one</button><button type="button" class="bbtn ghost" data-ac="phase" data-p="test">Play them again</button></div></div>';
  }
  function quizAnswer(v) {
    var res = K.evaluate([{ type: 'quiz', answer: L.quiz.answer, given: v, label: 'Picked the clash', msg: 'It was the ' + L.quiz.answer + ' one: E flat minor (2A) against A minor (8A) is 5 steps round the Camelot wheel, so the basslines rub. 9A is one step: it sits.' }], [], []);
    record(L.t.id, { score: res.total, aidsOff: aidsOff(), at: Date.now() });
    L.state = 'done'; showResult(res);
  }

  // ---------- the Academy page ----------
  function drawHub() {
    var p = progress(), un = K.unlocked(ORDER, p), a = aids(), src = S.load('acSrc', 'loops'), lat = latency();
    var h = '<h1>Advanced Academy</h1><p class="sub">Each technique: a short explanation, a demo on the decks, practice with prompts, then a test scored to the 1/8 beat. Pass a test (60+) to unlock the next one; jump to anything unlocked.</p>';
    h += '<div class="ac-tools panel"><div class="row wrap"><button type="button" class="bbtn primary" data-ac="warm">10-minute warm-up</button><a class="bbtn" href="#techniques">One-page summary</a><a class="bbtn" href="#calibrate">Calibrate timing' + (lat ? ' (' + lat.ms + ' ms)' : '') + '</a></div>' +
      '<div class="row wrap" style="margin-top:10px"><span class="small">Ear-training aids (mastery needs them all off):</span>' + [['phrase', 'Phrase counter'], ['waves', 'Waveforms'], ['energy', 'Energy meter']].map(function (x) { var on = a[x[0]] !== false; return '<button type="button" class="bbtn sm' + (on ? ' on' : '') + '" data-ac="aid" data-v="' + x[0] + '" aria-pressed="' + on + '">' + x[1] + ': ' + (on ? 'on' : 'off') + '</button>'; }).join('') + '</div>' +
      '<div class="row wrap" style="margin-top:8px"><span class="small">Tracks:</span><button type="button" class="bbtn sm' + (src === 'loops' ? ' on' : '') + '" data-ac="src" data-v="loops">Built-in loops</button><button type="button" class="bbtn sm' + (src === 'mine' ? ' on' : '') + '" data-ac="src" data-v="mine">My tracks</button></div></div>';
    MODULES.forEach(function (m, mi) {
      var list = T.filter(function (t) { return t.mod === m.id; });
      h += '<h3 class="sect">' + (mi + 1) + '. ' + esc(m.name) + '</h3><div class="modes">' + list.map(function (t) {
        var ok = un[t.id], ms = K.mastery(p[t.id] || []), sp = (p[t.id + ':speed'] || []).reduce(function (x, a2) { return Math.max(x, a2.score); }, 0);
        return '<button type="button" class="mode' + (ok ? '' : ' locked') + '" data-ac="open" data-t="' + t.id + '"' + (ok ? '' : ' aria-disabled="true"') + '><span class="tag' + (ms.level !== 'Learning' ? ' ok' : '') + '">' + (ok ? esc(ms.level) + (ms.best ? ' · best ' + ms.best : '') : 'Locked') + '</span><b>' + esc(t.name) + '</b><span class="small muted">' + esc(t.why.split('. ')[0]) + '.</span>' + (sp ? '<span class="small">Speed best ' + sp + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    });
    h += '<h3 class="sect">In Free mix</h3><div class="panel"><p class="small">Turn on <b>Live challenges</b> in Free mix: when a technique fits where the track is, a challenge pops up with a deadline; pull it off to build a combo. Techniques you do on your own are spotted and scored too, in Free mix and Set mode.</p><button type="button" class="bbtn' + (S.load('liveCh', false) ? ' on' : '') + '" data-ac="live">Live challenges: ' + (S.load('liveCh', false) ? 'on' : 'off') + '</button> <span class="small muted">Best combo: ' + (S.load('bestCombo', 0) || 0) + '</span></div>';
    S.el('screen').innerHTML = h;
  }
  function drawSummary() {
    var p = progress(), first = firstThree();
    var h = '<h1>Every technique on one page</h1><p class="sub">What each one is, and how to do it on club gear (Pioneer CDJ + DJM).</p>';
    h += '<section class="panel"><h3>Practise these 3 first</h3><ol>' + first.map(function (t) { return '<li><b>' + esc(t.name) + '</b>: ' + esc(t.why.split('. ')[0]) + '.</li>'; }).join('') + '</ol></section>';
    MODULES.forEach(function (m, mi) {
      h += '<section class="panel"><h3>' + (mi + 1) + '. ' + esc(m.name) + '</h3><table class="ac-table"><thead><tr><th>Technique</th><th>What it is</th><th>On CDJ + DJM</th><th>You</th></tr></thead><tbody>' + T.filter(function (t) { return t.mod === m.id; }).map(function (t) {
        var ms = K.mastery(p[t.id] || []); return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.why) + '</td><td>' + esc(t.gear) + '</td><td>' + esc(ms.level) + (ms.best ? ' (' + ms.best + ')' : '') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    });
    S.el('screen').innerHTML = h;
  }
  /** The three to practise first: the foundations you haven't made Solid yet (or your weakest, once they are). */
  function firstThree() {
    var p = progress(), base = ['loopManual', 'fastSwap', 'echoOut', 'sweep', 'byEar', 'halving', 'rolls', 'cutDown'];
    var notSolid = base.filter(function (id) { return K.mastery(p[id] || []).level === 'Learning'; });
    var ids = notSolid.length >= 3 ? notSolid.slice(0, 3) : notSolid.concat(ORDER.filter(function (id) { return notSolid.indexOf(id) === -1; }).sort(function (a, b) { return K.mastery(p[a] || []).best - K.mastery(p[b] || []).best; })).slice(0, 3);
    return ids.map(tech);
  }

  // ---------- 10-minute warm-up: the techniques you've learned, weakest most often ----------
  function warmStart() {
    var p = progress(), learned = ORDER.filter(function (id) { return (p[id] || []).length && tech(id).kind !== 'quiz'; });
    if (!learned.length) return S.toast('Take a test or two first: the warm-up uses techniques you\'ve learned.');
    var w = { until: Date.now() + 10 * 60000, results: [], learned: learned };
    start(K.warmupPick(learned, p), 'warm', { warm: w });
  }
  function warmNext(res) {
    var w = L.warm; w.results.push({ id: L.id, name: L.t.name, score: res.total, note: res.notes[0] || '' });
    if (Date.now() < w.until) { var nextId = K.warmupPick(w.learned, progress()); return start(nextId, 'warm', { warm: w }); }
    var avg = Math.round(w.results.reduce(function (s, r) { return s + r.score; }, 0) / w.results.length);
    el('resultSlot').innerHTML = '<div class="result panel"><div class="res-head"><div class="grade g' + K.grade(avg) + '">' + K.grade(avg) + '</div><div class="grow"><div class="eyebrow">Warm-up done</div><h2>' + w.results.length + ' techniques, average ' + avg + '</h2></div></div><ul class="notes">' + w.results.map(function (r) { return '<li><b>' + r.score + '</b> ' + esc(r.name) + (r.note ? ': ' + esc(r.note) : '') + '</li>'; }).join('') + '</ul><div class="row wrap"><button type="button" class="bbtn primary" data-ac="warm">Another warm-up</button><button type="button" class="bbtn ghost" data-ac="hub">All techniques</button></div></div>';
  }

  // ---------- timing calibration: tap along with the clicks ----------
  var cal = null;
  function drawCalibrate() {
    var l = latency();
    S.el('screen').innerHTML = '<h1>Calibrate your timing</h1><p class="sub">Your controller, your speakers and your ears all add a little delay. Tap along with the clicks so scores measure you, not your setup. Do it again whenever you change speakers or headphones.</p>' +
      '<section class="panel"><p>Press <b>Start</b>, listen to 4 count-in clicks, then press <b>any pad or button on the Inpulse 500</b> (or the space bar) on every click. 16 taps.</p>' +
      '<div class="ac-cal" id="calBox"><div class="ac-dot" id="calDot"></div><div id="calText" class="small">' + (l ? 'Current: ' + l.ms + ' ms' : 'Not calibrated yet.') + '</div></div>' +
      '<div class="row wrap"><button type="button" class="bbtn primary" data-ac="calGo">Start</button><button type="button" class="bbtn ghost" data-ac="calSkip">Skip for now</button></div></section>';
  }
  function calStart() {
    P.start().then(function () {
      var e = E(), c = e.ctx, bpm = 100, step = 60 / bpm, t0 = c.currentTime + 0.6, clicks = [];
      for (var i = 0; i < 22; i++) {
        var t = t0 + i * step, o = c.createOscillator(), g = c.createGain();
        o.frequency.value = i < 4 ? 660 : 1000; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g); g.connect(e.master); o.start(t); o.stop(t + 0.08); clicks.push(t);
      }
      cal = { clicks: clicks, taps: [], step: step };
      el('calText').textContent = 'Count in: 1, 2, 3, 4… then tap on every click.';
      clearTimeout(cal.done); cal.done = setTimeout(calFinish, (22 * step + 1.2) * 1000);
      (function blink() { if (!cal) return; var n = c.currentTime, k = clicks.filter(function (x) { return x <= n; }).length; var d = el('calDot'); if (d) d.classList.toggle('on', k > 0 && n - clicks[k - 1] < 0.1); if (n < clicks[clicks.length - 1] + 0.5) requestAnimationFrame(blink); })();
    });
  }
  function calTap(ts) {
    if (!cal) return;
    var heard = P.heardAt(ts), near = cal.clicks.slice(4).reduce(function (b, x) { return Math.abs(x - heard) < Math.abs(b - heard) ? x : b; }, 1e9);
    if (Math.abs(near - heard) < cal.step / 2) cal.taps.push(heard - near);
    var t = el('calText'); if (t) t.textContent = cal.taps.length + ' taps…';
  }
  function calFinish() {
    if (!cal) return;
    var taps = cal.taps.slice().sort(function (a, b) { return a - b; }); cal = null;
    var t = el('calText');
    if (taps.length < 8) { if (t) t.textContent = 'Only ' + taps.length + ' taps landed near a click. Press Start and try again.'; return; }
    var mid = taps.slice(Math.floor(taps.length * 0.2), Math.ceil(taps.length * 0.8)), ms = Math.round(mid.reduce(function (s, x) { return s + x; }, 0) / mid.length * 1000);
    var spread = Math.round((mid[mid.length - 1] - mid[0]) * 1000);
    S.save('latency', { ms: ms, dev: deviceSig(), at: Date.now() }); S.save('skipCal', false);
    if (t) t.textContent = 'Done: ' + ms + ' ms (' + (ms > 0 ? 'you tap a little after you hear the click' : 'you tap a little ahead') + '; your taps were within ' + spread + ' ms of each other). Scores now allow for it.';
    var after = S.load('afterCal', null); if (after) { S.save('afterCal', null); setTimeout(function () { start(after.id, after.phase); }, 1500); }
  }

  // ---------- Free mix and Set mode: spotting techniques, and live challenges ----------
  var live = { E: [], ch: null, combo: 0, lastSpot: 0, lastCh: 0 };
  P.listen(function (e) {
    var sc = S && S.screen(); if (sc === 'calibrate') { if (e.kind === 'button' && e.down && !/shift/.test(e.id)) calTap(e.ts || performance.now()); return; }
    if (L && L.state === 'run') return;
    if (sc !== 'free' && !(sc === 'play' && G && G.session() && G.session().kind === 'set')) return;
    if (e.value !== undefined && e.kind !== 'button') return;
    var en = E(), lat = (latency() || { ms: 0 }).ms / 1000, h = P.heardAt(e.ts || performance.now()) - lat;
    live.E.push({ id: e.id, down: e.down, delta: e.delta, bA: en.decks.A.track ? en.decks.A.beatPos(h) : 0, bB: en.decks.B.track ? en.decks.B.beatPos(h) : 0 });
    if (live.E.length > 200) live.E.splice(0, 100);
  });
  document.addEventListener('keydown', function (ev) { if (ev.code === 'Space' && S && S.screen() === 'calibrate' && cal) { ev.preventDefault(); calTap(ev.timeStamp); } });
  var LIVE = [
    { tech: 'rollFill', name: 'Loop roll fill', fits: function (d, toPhrase, both) { return !both && toPhrase >= 8 && toPhrase <= 16; }, say: function (d, at) { return 'Loop roll fill on Deck ' + d + ' into bar ' + bar(at) + ' (SHIFT + a loop pad, let go on the 1)'; } },
    { tech: 'filterSweep', name: 'Filter sweep', fits: function (d, toPhrase, both) { return !both && toPhrase >= 16 && toPhrase <= 28; }, say: function (d, at) { return 'Filter sweep on Deck ' + d + ', back to the middle on bar ' + bar(at); } },
    { tech: 'halvingBuild', name: 'Halving build', fits: function (d, toPhrase, both) { return !both && toPhrase >= 24 && toPhrase <= 32; }, say: function (d, at) { return 'Halving build on Deck ' + d + ': loop, halve 3 times, let go on bar ' + bar(at); } },
    { tech: 'fastSwap', name: 'Bass swap', fits: function (d, toPhrase, both) { return both && toPhrase >= 4 && toPhrase <= 16; }, say: function (d, at) { return 'Swap the bass in one beat on bar ' + bar(at); } },
    { tech: 'echoOut', name: 'Echo out', fits: function (d, toPhrase, both) { return both && toPhrase >= 8 && toPhrase <= 24; }, say: function (d, at) { return 'Echo out Deck ' + d + ' on bar ' + bar(at); } }
  ];
  function liveTick() {
    var sc = S && S.screen(), set = sc === 'play' && G && G.session() && G.session().kind === 'set';
    if (!(sc === 'free' || set) || (L && L.state === 'run')) return;
    var en = E(); if (!en) return;
    var now = Date.now(), smp = G ? G.samples() : [];
    if (now - live.lastSpot > 1500) {
      live.lastSpot = now;
      var spots = K.recognise(live.E, smp.slice(-400));
      spots.forEach(function (r) {
        var ch = live.ch;
        if (ch && ch.tech === r.tech && r.deck === ch.deck) {
          var ok = r.score >= 70; live.combo = ok ? Math.min(5, live.combo + 1) : 0; if (live.combo > S.load('bestCombo', 0)) S.save('bestCombo', live.combo);
          S.toast((ok ? '✓ Challenge done: ' : '~ Close: ') + r.note + (ok ? ' · combo ×' + live.combo : ' · combo reset')); live.ch = null; drawLive();
        } else S.toast('Spotted: ' + ({ loopManual: 'manual loop', halvingBuild: 'halving build', rollFill: 'loop roll', echoOut: 'echo out', fastSwap: 'fast bass swap', filterSweep: 'filter sweep' })[r.tech] + ', ' + r.note + ' (' + r.score + ')');
      });
    }
    if (!S.load('liveCh', false) || sc !== 'free') { if (live.ch) { live.ch = null; drawLive(); } return; }
    if (!el('liveCh')) drawLive();                                      // Free mix redraws its screen now and then
    var A = en.decks.A, B = en.decks.B, aOn = A.playing && A.vals.volume > 0.3, bOn = B.playing && B.vals.volume > 0.3;
    var lead = aOn ? 'A' : bOn ? 'B' : ''; if (!lead) return;
    var d = en.decks[lead], beat = d.beatPos(), toPhrase = 32 - (((beat % 32) + 32) % 32), both = aOn && bOn;
    if (live.ch) beat = en.decks[live.ch.lead].beatPos();
    if (live.ch && beat > live.ch.at + 2) { live.combo = 0; S.toast('Challenge missed. Combo reset, no harm done.'); live.ch = null; drawLive(); }
    if (!live.ch && now - live.lastCh > 25000) {
      var fits = LIVE.filter(function (c) { return c.fits(lead, toPhrase, both); });
      if (fits.length) { var c = fits[Math.floor(Math.random() * fits.length)], at = beat + toPhrase; live.ch = { tech: c.tech, deck: c.tech === 'fastSwap' ? (lead === 'A' ? 'B' : 'A') : lead, lead: lead, at: at, text: c.say(lead, at) }; live.lastCh = now; drawLive(); }
    }
    if (live.ch) { var t = el('liveCh'); if (t && t.querySelector('.ac-left')) { var left = live.ch.at - en.decks[live.ch.lead].beatPos(); t.querySelector('.ac-left').textContent = left > 0 ? Math.ceil(left) + ' beats' : 'now!'; } }
  }
  function drawLive() {
    var box = el('liveCh');
    if (!box) { var scr = S.el('screen'); if (!scr || S.screen() !== 'free') return; box = document.createElement('div'); box.id = 'liveCh'; box.className = 'ac-live'; scr.insertBefore(box, scr.firstChild.nextSibling); }
    box.innerHTML = live.ch ? '<b>Challenge</b> <span class="grow">' + esc(live.ch.text) + '</span> <span class="ac-left mono"></span> <span class="small">combo ×' + Math.max(1, live.combo) + '</span>' : '<span class="small muted">Live challenges on: one pops up when a technique fits where the track is.' + (live.combo ? ' Combo ×' + live.combo : '') + '</span>';
    box.hidden = !S.load('liveCh', false);
  }
  setInterval(liveTick, 250);

  // ---------- Controller test: check each pad mode really reaches Booth ----------
  function padCheckHtml() {
    var ok = S.load('padModes', {});
    var banks = [['hotcue', 'Hot cue', 'the 1st mode button'], ['loop', 'Loop', 'the 2nd mode button'], ['slicer', 'Slicer', 'the 3rd mode button'], ['sampler', 'Sampler', 'the 4th mode button'], ['fx', 'FX', 'SHIFT + the 2nd mode button'], ['beatjump', 'Beatjump', 'SHIFT + the 4th mode button']];
    return '<section class="panel" id="padCheck"><h3>Pad modes</h3><p class="small">For each mode: press its mode button on Deck A, then any pad; then hold SHIFT and press a pad. Each lights up when Booth hears that mode. (The Academy needs Loop, FX, Beatjump and Hot cue.)</p><div class="ac-pads">' +
      banks.map(function (b) { var a = ok[b[0]], s = ok[b[0] + 'Shift']; return '<div class="ac-pad' + (a && s ? ' ok' : a ? ' half' : '') + '"><b>' + b[1] + '</b><span class="small">' + b[2] + '</span><span class="small">' + (a ? '✓ pads' : '○ pads') + ' · ' + (s ? '✓ SHIFT' : '○ SHIFT') + '</span></div>'; }).join('') + '</div></section>';
  }
  function padSeen(id) {
    var m = /^[AB]\.pad\.([a-z]+?)(Shift)?\.\d$/.exec(id || ''); if (!m) return;
    var ok = S.load('padModes', {}), k = m[1] + (m[2] || ''); if (ok[k]) return;
    ok[k] = true; S.save('padModes', ok); var box = el('padCheck'); if (box) box.outerHTML = padCheckHtml();
  }

  // ---------- input ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ac]'); if (!t || !S) return;
    var a = t.dataset.ac;
    if (a === 'open') { if (t.getAttribute('aria-disabled') === 'true') return S.toast('Pass the test before this one (60 or more) to unlock it.'); return start(t.dataset.t, 'explain'); }
    if (a === 'phase') return start(L.id, t.dataset.p);
    if (a === 'go') { if (L) L.go = true; return; }
    if (a === 'leave' || a === 'hub') { stop(); location.hash = 'academy'; return; }
    if (a === 'aid') { var x = aids(); x[t.dataset.v] = x[t.dataset.v] === false; S.save('aids', x); return drawHub(); }
    if (a === 'src') { S.save('acSrc', t.dataset.v); return drawHub(); }
    if (a === 'warm') return warmStart();
    if (a === 'live') { S.save('liveCh', !S.load('liveCh', false)); return drawHub(); }
    if (a === 'quiz') return quizAnswer(t.dataset.v);
    if (a === 'calGo') return calStart();
    if (a === 'calSkip') { S.save('skipCal', true); var af = S.load('afterCal', null); S.save('afterCal', null); if (af) return start(af.id, af.phase); location.hash = 'academy'; return; }
  });
  function stop() {
    if (!L) return;
    clearTimeout(L.qt); L = null;
    var v = P.view; v.frame = null; v.onControl = null; v.hideWaves = false; v.helper = true; v.guide = 'auto';
    var e = E(); if (e) { e.decks.A.stop(); e.decks.B.stop(); e.decks.A.setLoop(null); e.decks.B.setLoop(null); e.decks.A.clearOffset(); e.decks.B.clearOffset(); P.applyHardware(); }
  }

  window.BoothAcademy = {
    init: function (shell) { S = shell; },
    screens: { academy: drawHub, techniques: drawSummary, calibrate: drawCalibrate },
    leave: function (next) { if (next !== 'play' && L) stop(); if (next === 'free') setTimeout(drawLive, 50); },
    active: function () { return !!L; },
    /** For tests and the curious: where the lesson is (P, the beat you're hearing now, the phase). */
    now: function () { return L && L.clk ? { P: L.P, beat: heardBeat(performance.now()), state: L.state, phase: L.phase, id: L.id } : L ? { state: L.state, phase: L.phase } : null; },
    padCheckHtml: padCheckHtml, padSeen: padSeen, needsCalibration: needsCalibration,
    TECHNIQUES: T, MODULES: MODULES, start: start, firstThree: firstThree, _debug: function () { return L; }   // read-only, for the browser tests
  };
})();
