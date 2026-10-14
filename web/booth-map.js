/*
 * Afterhours: Booth · Hercules DJControl Inpulse 500 mapping.
 * This is the ONE file that holds MIDI numbers. Everything else asks for
 * controls by name ("A.eqLow", "B.play"...).
 *
 * Starting point: the Mixxx community mapping for the Inpulse 500
 * (res/controllers/Hercules_DJControl_Inpulse_500.midi.xml). Every entry starts
 * "unverified"; the Controller Test screen checks each one against your unit
 * and saves fixes on top of this file (Export gives you the merged JSON).
 *
 * kinds:
 *   fader / knob : absolute 0..1. 14-bit when lsb is given (MSB then LSB).
 *   center       : a knob whose middle is "off" (EQ, filter). Still 0..1, 0.5 = middle.
 *   button       : note on (127) = down, note off or velocity 0 = up.
 *   relative     : endless encoder / jog. 1..63 = clockwise ticks, 65..127 = anticlockwise.
 *   analog       : on the hardware only, sends no MIDI (shown so you know it's not broken).
 */
(function (root) {
  var DECKS = {
    A: { note: 0x91, cc: 0xB1, shiftNote: 0x94, shiftCc: 0xB4, pads: 0x96 },
    B: { note: 0x92, cc: 0xB2, shiftNote: 0x95, shiftCc: 0xB5, pads: 0x97 }
  };
  // Pad banks: the note offset each pad mode sends (pad n = base + n - 1). Holding SHIFT sends base + 8 + n - 1.
  var PAD_BANKS = [
    { id: 'hotcue', name: 'Hot cue', base: 0x00 },
    { id: 'loop', name: 'Loop', base: 0x10 },
    { id: 'slicer', name: 'Slicer', base: 0x20 },
    { id: 'sampler', name: 'Sampler', base: 0x30 },
    { id: 'toneplay', name: 'Toneplay', base: 0x40 },
    { id: 'slicerloop', name: 'Slicer loop', base: 0x50 },
    { id: 'fx', name: 'FX', base: 0x60 },
    { id: 'beatjump', name: 'Beatjump', base: 0x70 }
  ];
  // The 8 pad-mode buttons above the pads (4 buttons, the other 4 with SHIFT), in the order of their notes.
  var PAD_MODES = ['Hot cue', 'Loop', 'Slicer', 'Sampler', 'Toneplay', 'FX', 'Slicer loop', 'Beatjump'];
  // Which bank each mode button switches the pads to.
  var MODE_BANK = ['hotcue', 'loop', 'slicer', 'sampler', 'toneplay', 'fx', 'slicerloop', 'beatjump'];

  var controls = [];
  function add(id, o) { o.id = id; controls.push(o); }

  ['A', 'B'].forEach(function (d) {
    var D = DECKS[d], L = 'Deck ' + d + ' ';
    add(d + '.volume', { label: L + 'volume fader', kind: 'fader', msg: [D.cc, 0x00], lsb: [D.cc, 0x20], deck: d, part: 'mixer' });
    add(d + '.trim', { label: L + 'TRIM (gain) knob', kind: 'knob', msg: [D.cc, 0x05], lsb: [D.cc, 0x25], deck: d, part: 'mixer' });
    add(d + '.eqHigh', { label: L + 'HIGH EQ knob', kind: 'center', msg: [D.cc, 0x04], lsb: [D.cc, 0x24], deck: d, part: 'mixer' });
    add(d + '.eqMid', { label: L + 'MID EQ knob', kind: 'center', msg: [D.cc, 0x03], lsb: [D.cc, 0x23], deck: d, part: 'mixer' });
    add(d + '.eqLow', { label: L + 'LOW EQ knob', kind: 'center', msg: [D.cc, 0x02], lsb: [D.cc, 0x22], deck: d, part: 'mixer' });
    add(d + '.filter', { label: L + 'FILTER knob', kind: 'center', msg: [D.cc, 0x01], deck: d, part: 'mixer' });
    add(d + '.pfl', { label: L + 'headphone cue (PFL) button', kind: 'button', msg: [D.note, 0x0C], deck: d, part: 'mixer', led: [D.note, 0x0C] });
    add(d + '.pitch', { label: L + 'pitch fader', kind: 'fader', msg: [D.cc, 0x08], lsb: [D.cc, 0x28], deck: d, part: 'deck' });
    add(d + '.jogTouch', { label: L + 'jog wheel (touch the top)', kind: 'button', msg: [D.note, 0x08], deck: d, part: 'deck' });
    add(d + '.jogTop', { label: L + 'jog wheel (turn while touching the top)', kind: 'relative', msg: [D.cc, 0x0A], deck: d, part: 'deck' });
    add(d + '.jogEdge', { label: L + 'jog wheel (turn by the outer edge)', kind: 'relative', msg: [D.cc, 0x09], deck: d, part: 'deck' });
    add(d + '.play', { label: L + 'PLAY button', kind: 'button', msg: [D.note, 0x07], deck: d, part: 'deck', led: [D.note, 0x07] });
    add(d + '.cue', { label: L + 'CUE button', kind: 'button', msg: [D.note, 0x06], deck: d, part: 'deck', led: [D.note, 0x06] });
    add(d + '.sync', { label: L + 'SYNC button', kind: 'button', msg: [D.note, 0x05], deck: d, part: 'deck', led: [D.note, 0x05] });
    add(d + '.shift', { label: L + 'SHIFT button', kind: 'button', msg: [D.note, 0x04], deck: d, part: 'deck' });
    add(d + '.load', { label: 'LOAD ' + d + ' button', kind: 'button', msg: [D.note, 0x0D], deck: d, part: 'mixer' });
    add(d + '.vinyl', { label: L + 'VINYL button', kind: 'button', msg: [D.note, 0x03], deck: d, part: 'deck', led: [D.note, 0x03] });
    add(d + '.slip', { label: L + 'SLIP button', kind: 'button', msg: [D.note, 0x01], deck: d, part: 'deck', led: [D.note, 0x01] });
    add(d + '.quant', { label: L + 'Q (quantise) button', kind: 'button', msg: [D.note, 0x02], deck: d, part: 'deck', led: [D.note, 0x02] });
    add(d + '.loopIn', { label: L + 'LOOP IN button', kind: 'button', msg: [D.note, 0x09], deck: d, part: 'deck', led: [D.note, 0x09] });
    add(d + '.loopOut', { label: L + 'LOOP OUT button', kind: 'button', msg: [D.note, 0x0A], deck: d, part: 'deck', led: [D.note, 0x0A] });
    add(d + '.loopKnob', { label: L + 'LOOP knob (turn)', kind: 'relative', msg: [D.cc, 0x0E], deck: d, part: 'deck' });
    add(d + '.loopPush', { label: L + 'LOOP knob (push)', kind: 'button', msg: [D.note, 0x2C], deck: d, part: 'deck' });
    PAD_MODES.forEach(function (name, i) {
      add(d + '.mode' + (i + 1), { label: L + 'pad mode: ' + name + (i >= 4 ? ' (SHIFT + mode button)' : ''), kind: 'button', msg: [D.note, 0x0F + i], deck: d, part: 'pads', led: [D.note, 0x0F + i] });
    });
    PAD_BANKS.forEach(function (b) {
      for (var n = 1; n <= 8; n++) {
        add(d + '.pad.' + b.id + '.' + n, { label: L + 'pad ' + n + ' (' + b.name + ' mode)', kind: 'button', msg: [D.pads, b.base + n - 1], deck: d, part: 'pads', pad: n, bank: b.id, led: [D.pads, b.base + n - 1] });
        add(d + '.pad.' + b.id + 'Shift.' + n, { label: L + 'SHIFT + pad ' + n + ' (' + b.name + ' mode)', kind: 'button', msg: [D.pads, b.base + 8 + n - 1], deck: d, part: 'pads', pad: n, bank: b.id + 'Shift', shift: true, led: [D.pads, b.base + 8 + n - 1] });
      }
    });
  });
  add('xfader', { label: 'Crossfader', kind: 'fader', msg: [0xB0, 0x00], part: 'mixer' });
  add('browse', { label: 'BROWSE knob (turn)', kind: 'relative', msg: [0xB0, 0x01], part: 'mixer' });
  add('browsePush', { label: 'BROWSE knob (push)', kind: 'button', msg: [0x90, 0x00], part: 'mixer' });
  add('master', { label: 'MASTER level knob', kind: 'analog', part: 'mixer' });
  add('headphone', { label: 'HEADPHONE level knob', kind: 'analog', part: 'mixer' });
  add('cueMix', { label: 'Headphone CUE/MASTER mix knob', kind: 'analog', part: 'mixer' });

  // Lights you can drive. Values: 0x7F on, 0 off. Pads take a colour as the value.
  var LIGHTS = {
    colours: { off: 0x00, red: 0x60, orange: 0x74, yellow: 0x7C, green: 0x1C, cyan: 0x1F, blue: 0x03, magenta: 0x42, pink: 0x63, white: 0x7F, dimRed: 0x40, dimBlue: 0x02, dimCyan: 0x12, dimGreen: 0x10 },
    // Beatmatch Guide (per deck note channel). Which arrow is which is checked on the test screen.
    guide: {
      A: { tempoUp: [0x91, 0x1E], tempoDown: [0x91, 0x1F], tempoOk: [0x91, 0x2C], phaseLeft: [0x91, 0x1C], phaseRight: [0x91, 0x1D], phaseOk: [0x91, 0x2D] },
      B: { tempoUp: [0x92, 0x1E], tempoDown: [0x92, 0x1F], tempoOk: [0x92, 0x2C], phaseLeft: [0x92, 0x1C], phaseRight: [0x92, 0x1D], phaseOk: [0x92, 0x2D] }
    },
    vu: { A: [0xB1, 0x40], B: [0xB2, 0x40], masterL: [0xB0, 0x40], masterR: [0xB0, 0x41] },
    // Asks the controller to report where every knob and fader is right now.
    dumpRequest: [0xB0, 0x7F, 0x7F]
  };

  // Keyboard and mouse fallback (every action). Shown on screen; same names as the controls.
  var KEYS = {
    'A.play': 'z', 'A.cue': 'x', 'A.sync': 'c', 'A.pfl': 'v', 'A.load': '1',
    'B.play': 'm', 'B.cue': ',', 'B.sync': '.', 'B.pfl': 'n', 'B.load': '2',
    'A.volume+': 'w', 'A.volume-': 's', 'B.volume+': 'o', 'B.volume-': 'l',
    'A.eqLow+': 'e', 'A.eqLow-': 'd', 'B.eqLow+': 'i', 'B.eqLow-': 'k',
    'A.eqMid+': 'r', 'A.eqMid-': 'f', 'B.eqMid+': 'u', 'B.eqMid-': 'j',
    'A.eqHigh+': 't', 'A.eqHigh-': 'g', 'B.eqHigh+': 'y', 'B.eqHigh-': 'h',
    'A.filter+': 'b', 'A.filter-': 'q', 'B.filter+': 'p', 'B.filter-': '/',
    'A.pitch+': 'ArrowDown', 'A.pitch-': 'ArrowUp', 'B.pitch+': 'PageDown', 'B.pitch-': 'PageUp',
    'A.nudge-': 'ArrowLeft', 'A.nudge+': 'ArrowRight', 'B.nudge-': 'Home', 'B.nudge+': 'End',
    'xfader-': '[', 'xfader+': ']'
  };

  var MAP = { name: 'Hercules DJControl Inpulse 500', version: 2, decks: DECKS, padBanks: PAD_BANKS, padModes: PAD_MODES, modeBank: MODE_BANK, controls: controls, lights: LIGHTS, keys: KEYS,
    // A device name containing one of these is treated as the Inpulse 500.
    match: [/inpulse\s*500/i, /DJControl Inpulse 500/i] };

  root.BOOTH_MAP = MAP;
  if (typeof module !== 'undefined') module.exports = MAP;
})(typeof window !== 'undefined' ? window : globalThis);
