/*
 * Afterhours: Booth · getting back to the start of a track (pure, so it can be tested).
 *   CUE while playing   : back to the cue point and stop.
 *   CUE while paused    : back to the cue point (the first beat unless you've set one).
 *                         Straight after scrubbing with the jog wheel, it sets the cue point there instead.
 *                         Held at the cue point: preview.
 *   SHIFT + CUE         : straight to the very start of the track (keeps playing if it was).
 *   Beatjump pads       : back 1, 4, 8, 16, 32 beats, and pad 8 is "back to start".
 */
(function (root) {
  var SCRUB_WINDOW = 3;   // seconds after a scrub in which CUE sets the cue point
  function cueAction(s) {
    if (!s || !s.loaded) return 'none';
    if (s.shift) return 'start';
    if (s.playing) return 'back';
    var away = Math.abs(s.pos - s.cuePos) > 0.02;
    if (!away) return 'preview';
    if (s.scrubbedAt !== undefined && s.scrubbedAt !== null && s.now - s.scrubbedAt <= SCRUB_WINDOW) return 'set';
    return 'return';
  }
  // Beatjump pads (top row 1-4, bottom row 5-8). Numbers are beats; 'start' and 'cue' are places.
  var JUMP_PADS = [-1, 1, -4, 4, -8, -16, -32, 'start'];
  var JUMP_PADS_SHIFT = [-2, 2, 8, 16, 32, 64, -64, 'cue'];
  function padJump(k, shift) { return (shift ? JUMP_PADS_SHIFT : JUMP_PADS)[k]; }
  function padJumpLabel(k, shift) {
    var j = padJump(k, shift);
    if (j === 'start') return { t: 'Start', tip: 'Back to the very start of the track' };
    if (j === 'cue') return { t: 'Cue', tip: 'Back to the cue point' };
    return { t: (j > 0 ? '+' : '−') + Math.abs(j), tip: 'Jump ' + Math.abs(j) + ' beat' + (Math.abs(j) === 1 ? '' : 's') + ' ' + (j > 0 ? 'forward' : 'back') };
  }
  var api = { cueAction: cueAction, padJump: padJump, padJumpLabel: padJumpLabel, JUMP_PADS: JUMP_PADS, JUMP_PADS_SHIFT: JUMP_PADS_SHIFT, SCRUB_WINDOW: SCRUB_WINDOW };
  root.BoothCue = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
