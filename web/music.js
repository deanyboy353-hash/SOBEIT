/* Nudge music: original, generated mixes that last as long as your chore.
 * Each station is a style (tempo, drum pattern, bass, chords). A mix is built
 * phrase by phrase (8 bars at a time) and always ends on a proper outro, so it
 * never stops mid-beat: at most one phrase (~15-28 s) past your timer.
 * Phrases are rendered ahead into audio buffers, so playback keeps going
 * smoothly even with the screen off. */
(function () {
  'use strict';

  // [id, name, style, bpm, mood, colour A, colour B, sound]
  // Each sound picks its own kit and instruments, so every station sounds like its genre.
  //   k/s/h: kick, snare and hat steps (16 per bar);  kick, snare, hat: drum sounds;  bass, chords, lead: synths;
  //   crh: chord rhythm (bar, off = offbeat stabs, eighths, gate);  b: bass steps;  swing;  half: half-time;  crackle; perc: congas; lp: overall tone
  var STATIONS = [
    ['grove-lofi', 'Back Street Lo-fi', 'Lo-fi hip hop', 82, 'Slow and cosy', '#2e9e4f', '#c9862b', { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x.....x...x.....', kick: 'soft', snare: 'rim', hat: 'closed', bass: 'sub', chords: 'rhodes', crh: 'bar', lead: 'bell', swing: 0.2, keys: 'minor', crackle: 1, lp: 3200 }],
    ['vice-house', 'Beachfront House', 'House', 122, 'Sunny and bouncy', '#ff5fae', '#2fe0d6', { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', b: '..x...x.x.x...x.', kick: 'punch', snare: 'clap', hat: 'open', bass: 'pluck', chords: 'organ', crh: 'off', lead: 'none', swing: 0, keys: 'major' }],
    ['sunset-disco', 'Sunset Disco', 'Disco', 116, 'Feel-good', '#ffb703', '#e76f51', { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', b: 'x.x.x.x.x.x.x.x.', kick: 'punch', snare: 'snare', hat: 'closed', bass: 'octave', chords: 'strings', crh: 'bar', lead: 'flute', swing: 0.04, keys: 'major' }],
    ['garage-run', 'Garage Run', 'UK garage', 132, 'Skippy and quick', '#7c3aed', '#2563eb', { k: 'x.....x...x..x..', s: '....x.......x...', h: '..x.x.x...x.x.xx', b: 'x..x..x.x..x..x.', kick: 'punch', snare: 'rim', hat: 'shaker', bass: 'reese', chords: 'stab', crh: 'off', lead: 'pluck', swing: 0.22, keys: 'minor' }],
    ['warehouse', 'Warehouse Techno', 'Techno', 130, 'Driving', '#334155', '#94a3b8', { k: 'x...x...x...x...', s: '........x.......', h: '..x...x...x...x.', b: 'xxxxxxxxxxxxxxxx', kick: 'rumble', snare: 'clap', hat: 'closed', bass: 'acid', chords: 'none', crh: 'bar', lead: 'none', swing: 0, keys: 'minor', perc: 1 }],
    ['liquid-dnb', 'Liquid Drum and Bass', 'Drum and bass', 172, 'Fast, smooth focus', '#0f7e8a', '#9db8ff', { k: 'x.........x.....', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.', b: 'x.......x.x.....', kick: 'punch', snare: 'big', hat: 'closed', bass: 'reese', chords: 'strings', crh: 'bar', lead: 'bell', swing: 0, keys: 'minor' }],
    ['synthwave', 'Night Drive Synthwave', 'Synthwave', 100, 'Neon night drive', '#ff4f9a', '#7c3aed', { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'xxxxxxxxxxxxxxxx', kick: 'boom', snare: 'gated', hat: 'closed', bass: 'octave', chords: 'supersaw', crh: 'bar', lead: 'saw', swing: 0, keys: 'minor', lp: 5000 }],
    ['boom-bap', 'Corner Boom Bap', 'Hip hop', 90, 'Head-nod', '#c9a227', '#3b2f0b', { k: 'x......xx.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x......x.x......', kick: 'boom', snare: 'crunch', hat: 'closed', bass: 'sub', chords: 'piano', crh: 'chop', lead: 'none', swing: 0.18, keys: 'minor', crackle: 1 }],
    ['afro-house', 'Afro House Sunrise', 'Afro house', 120, 'Warm and rolling', '#e9c46a', '#2a9d8f', { k: 'x...x...x...x...', s: '......x.....x.x.', h: 'x.xx.xx.x.xx.xx.', b: 'x..x..x...x..x..', kick: 'soft', snare: 'rim', hat: 'shaker', bass: 'pluck', chords: 'pad', crh: 'bar', lead: 'marimba', swing: 0.08, keys: 'minor', perc: 1 }],
    ['trance', 'Starlight Trance', 'Trance', 138, 'Big lifts', '#6a4fc4', '#ff9cc8', { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', b: '.xxx.xxx.xxx.xxx', kick: 'punch', snare: 'clap', hat: 'open', bass: 'saw', chords: 'supersaw', crh: 'gate', lead: 'pluck', swing: 0, keys: 'minor' }],
    ['dub-plates', 'Dub Plates', 'Dubstep', 140, 'Heavy, half-time', '#3a3047', '#5fd79a', { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', b: 'x.......x..x....', kick: 'boom', snare: 'big', hat: 'closed', bass: 'wobble', chords: 'pad', crh: 'bar', lead: 'none', swing: 0, keys: 'minor', half: 1 }],
    ['twisted', 'Dark Twisted Nights', 'Cinematic hip hop', 84, 'Dark, huge, dramatic', '#141414', '#b3121f', { k: 'x.....x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x.....x...x.....', kick: 'boom', snare: 'big', hat: 'closed', bass: '808', chords: 'choir', crh: 'bar', lead: 'piano', swing: 0.1, keys: 'minor' }],
    ['clean-ambient', 'Clean Air Ambient', 'Ambient', 70, 'Calm, no drums', '#a7d3e8', '#e0c3fc', { k: '................', s: '................', h: '................', b: '................', kick: 'none', snare: 'none', hat: 'none', bass: 'none', chords: 'strings', crh: 'bar', lead: 'bell', swing: 0, keys: 'major', lp: 4000 }]
  ].map(function (s) { return { id: s[0], name: s[1], style: s[2], bpm: s[3], mood: s[4], c1: s[5], c2: s[6], p: s[7] }; });

  function seeded(seed) { var x = 0; for (var i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  var SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
  var PROGS = { minor: [[0, 5, 3, 4], [0, 3, 4, 4], [0, 6, 5, 4], [0, 5, 6, 4]], major: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4]] };
  function noteHz(semi) { return 440 * Math.pow(2, (semi - 9) / 12); } // semi 0 = C4

  var RATE = 24000;
  var noise = null;
  function noiseBuf(ctx) {
    var b = ctx.createBuffer(1, RATE, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---- one phrase (8 bars) into an offline buffer ----
  function renderPhrase(st, song, section, gainFrom, gainTo) {
    var bars = 8, beat = 60 / st.bpm, bar = beat * 4, len = bars * bar + 1.5;
    var ctx = new OfflineAudioContext(1, Math.ceil(len * RATE), RATE);
    var p = st.p, step = bar / 16, scale = SCALES[p.keys], prog = song.prog, root = song.root, rnd = song.rand;
    // tone control, then a limiter so loud stations never distort
    var lim = ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
    var trim = ctx.createGain(); trim.gain.value = 0.8; lim.connect(trim); trim.connect(ctx.destination);
    var tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = p.lp || 9000; tone.connect(lim);
    var master = ctx.createGain(); master.connect(tone);
    master.gain.setValueAtTime(0.0001 + gainFrom, 0); master.gain.linearRampToValueAtTime(Math.max(0.0001, gainTo), bars * bar);
    var nb = noiseBuf(ctx);
    var drums = section !== 'break' && section !== 'intro0', hasBass = section !== 'intro0' && section !== 'intro1' && section !== 'break';
    var full = section === 'main' || section === 'build';

    function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function osc(type, f, t, d, peak, a, dest) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); env(g, t, a || 0.005, peak, d); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + (a || 0.005) + d + 0.05); return o; }
    function burst(t, type, f, q, peak, d, dest) { var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q; env(g, t, 0.002, peak, d); s.connect(fl); fl.connect(g); g.connect(dest || master); s.start(t, rnd() * 0.5); s.stop(t + d + 0.05); }
    var shaper = ctx.createWaveShaper(), curve = new Float32Array(256);
    for (var c = 0; c < 256; c++) { var x = c / 128 - 1; curve[c] = Math.tanh(x * 3); }
    shaper.curve = curve; shaper.connect(master);

    // drums
    function kick(t) {
      if (p.kick === 'soft') { var o = osc('sine', 110, t, 0.32, 0.7); o.frequency.exponentialRampToValueAtTime(48, t + 0.1); }
      else if (p.kick === 'boom') { var o2 = osc('sine', 120, t, 0.55, 0.95, 0.004, shaper); o2.frequency.exponentialRampToValueAtTime(40, t + 0.2); }
      else if (p.kick === 'rumble') { var o3 = osc('sine', 150, t, 0.3, 0.9); o3.frequency.exponentialRampToValueAtTime(44, t + 0.1); burst(t + 0.03, 'lowpass', 160, 0.8, 0.35, 0.45); }
      else { var o4 = osc('sine', 165, t, 0.26, 0.95); o4.frequency.exponentialRampToValueAtTime(46, t + 0.09); burst(t, 'highpass', 3000, 0.7, 0.18, 0.012); }
    }
    function snare(t) {
      if (p.snare === 'rim') { burst(t, 'bandpass', 3200, 2, 0.3, 0.04); osc('triangle', 820, t, 0.03, 0.18); }
      else if (p.snare === 'clap') { [0, 0.012, 0.024].forEach(function (o) { burst(t + o, 'bandpass', 1200, 1.2, 0.35, 0.05); }); burst(t + 0.03, 'bandpass', 1200, 1, 0.25, 0.18); }
      else if (p.snare === 'gated') { burst(t, 'highpass', 900, 0.6, 0.45, 0.24); osc('triangle', 190, t, 0.12, 0.3); }
      else if (p.snare === 'crunch') { burst(t, 'bandpass', 2400, 0.9, 0.6, 0.16, shaper); osc('sine', 210, t, 0.08, 0.25); }
      else if (p.snare === 'big') { burst(t, 'bandpass', 1700, 0.7, 0.55, 0.32); osc('sine', 180, t, 0.14, 0.4); }
      else { burst(t, 'bandpass', 1900, 0.8, 0.45, 0.17); osc('sine', 200, t, 0.09, 0.3); }
    }
    function hat(t, i) {
      if (p.hat === 'open') burst(t, 'highpass', 7000, 0.6, i % 4 === 2 ? 0.16 : 0.08, i % 4 === 2 ? 0.22 : 0.035);
      else if (p.hat === 'shaker') burst(t, 'bandpass', 6500, 1.5, 0.12 * (0.6 + rnd() * 0.5), 0.07);
      else burst(t, 'highpass', 8500, 0.6, 0.1 * (i % 2 ? 0.7 : 1), 0.035);
    }
    function conga(t, hi) { var o = osc('sine', hi ? 330 : 220, t, 0.18, 0.35); o.frequency.exponentialRampToValueAtTime(hi ? 260 : 170, t + 0.08); }
    function crackle(t0, dur) { for (var n = 0; n < dur * 5; n++) burst(t0 + rnd() * dur, 'highpass', 3000, 0.5, 0.05 + rnd() * 0.06, 0.004); }

    // tuned instruments
    function hz(semi) { return 440 * Math.pow(2, (semi - 9) / 12); }
    function synth(t, f, dur, kind, peak, dest) {
      var g = ctx.createGain(), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; g.connect(dest || master); fl.connect(g);
      var end = t + dur, oscs = [];
      function add(type, freq, det, lvl) { var o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = det || 0; og.gain.value = lvl || 1; o.connect(og); og.connect(fl); o.start(t); o.stop(end + 1.2); oscs.push(o); return o; }
      var a = 0.01, rel = 0.12;
      if (kind === 'rhodes') { add('sine', f); add('sine', f * 2, 0, 0.35); add('sine', f * 3, 0, 0.08); fl.frequency.value = 2500; a = 0.008; rel = 0.6; var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = 0.25 * peak; lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(end + 1); }
      else if (kind === 'organ') { add('square', f, 0, 0.4); add('sine', f * 2, 0, 0.6); add('sine', f * 4, 0, 0.2); fl.frequency.value = 3200; rel = 0.05; }
      else if (kind === 'strings') { [-12, -5, 5, 12].forEach(function (d) { add('sawtooth', f, d, 0.35); }); fl.frequency.value = 1900; a = Math.min(0.5, dur * 0.4); rel = 0.5; }
      else if (kind === 'supersaw') { [-24, -14, -6, 0, 6, 14, 24].forEach(function (d) { add('sawtooth', f, d, 0.22); }); fl.frequency.value = 4200; a = 0.02; rel = 0.2; }
      else if (kind === 'stab') { add('sawtooth', f, -7, 0.5); add('sawtooth', f, 7, 0.5); fl.frequency.setValueAtTime(3500, t); fl.frequency.exponentialRampToValueAtTime(600, t + 0.15); rel = 0.05; }
      else if (kind === 'piano') { add('triangle', f); add('sine', f * 2, 0, 0.3); fl.frequency.value = 3000; a = 0.004; rel = 0.5; }
      else if (kind === 'pad') { [-8, 0, 8].forEach(function (d) { add('sawtooth', f, d, 0.35); }); fl.frequency.value = section === 'break' ? 2200 : 1200; a = Math.min(0.6, dur * 0.4); rel = 0.8; }
      else if (kind === 'choir') { [-7, 0, 7].forEach(function (d) { var v = add('sawtooth', f, d, 0.3), vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.5 + d / 10; vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(v.frequency); vib.start(t); vib.stop(end + 1.2); }); fl.type = 'bandpass'; fl.frequency.value = 850; fl.Q.value = 1.4; a = Math.min(0.45, dur * 0.4); rel = 0.7; }
      else if (kind === 'bell') { add('sine', f); add('sine', f * 2.76, 0, 0.25); fl.frequency.value = 6000; a = 0.004; rel = 1.1; }
      else if (kind === 'marimba') { add('sine', f); add('sine', f * 4, 0, 0.15); fl.frequency.value = 5000; a = 0.003; rel = 0.25; }
      else if (kind === 'flute') { var fo = add('sine', f); add('triangle', f * 2, 0, 0.1); var vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.5; vg.gain.value = f * 0.01; vib.connect(vg); vg.connect(fo.frequency); vib.start(t); vib.stop(end + 1); fl.frequency.value = 4000; a = 0.06; rel = 0.15; }
      else if (kind === 'saw') { add('sawtooth', f, -5, 0.5); add('sawtooth', f, 5, 0.5); fl.frequency.value = 2600; rel = 0.15; }
      else { add('square', f, 0, 0.6); fl.frequency.setValueAtTime(4000, t); fl.frequency.exponentialRampToValueAtTime(900, t + 0.12); a = 0.003; rel = 0.08; }   // pluck
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, Math.max(t + a, end - 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
    }
    function bassNote(t, f, dur, i) {
      var g = ctx.createGain(), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; g.connect(master); fl.connect(g);
      function o(type, freq, det) { var x = ctx.createOscillator(); x.type = type; x.frequency.value = freq; x.detune.value = det || 0; x.connect(fl); x.start(t); x.stop(t + dur + 0.3); return x; }
      var peak = 0.3, rel = 0.06;
      if (p.bass === 'sub') { o('sine', f); fl.frequency.value = 400; peak = 0.45; rel = 0.12; }
      else if (p.bass === 'pluck') { o('square', f); fl.frequency.setValueAtTime(1600, t); fl.frequency.exponentialRampToValueAtTime(250, t + 0.12); peak = 0.28; }
      else if (p.bass === 'octave') { o('sawtooth', i % 2 ? f * 2 : f); fl.frequency.value = 900; peak = 0.25; }
      else if (p.bass === 'reese') { o('sawtooth', f, -18); o('sawtooth', f, 18); o('sine', f / 2); fl.frequency.value = 480; peak = 0.22; rel = 0.1; }
      else if (p.bass === 'acid') { o('sawtooth', f); fl.Q.value = 14; var top = 400 + 2600 * (0.5 + 0.5 * Math.sin(t * 0.7)) * (rnd() < 0.3 ? 1.3 : 1); fl.frequency.setValueAtTime(top, t); fl.frequency.exponentialRampToValueAtTime(180, t + dur * 0.9); peak = 0.18; }
      else if (p.bass === 'wobble') { o('sawtooth', f, -10); o('sawtooth', f, 10); o('sine', f / 2); fl.Q.value = 6; var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = (st.bpm / 60) * (rnd() < 0.5 ? 2 : 3); lg.gain.value = 700; fl.frequency.value = 800; lfo.connect(lg); lg.connect(fl.frequency); lfo.start(t); lfo.stop(t + dur + 0.3); peak = 0.26; }
      else if (p.bass === '808') { var x8 = o('sine', f * 1.5); x8.frequency.exponentialRampToValueAtTime(f, t + 0.08); o('triangle', f, 0); fl.frequency.value = 600; peak = 0.5; rel = 0.35; }
      else { o('sawtooth', f); fl.frequency.value = 700; peak = 0.22; }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.006); g.gain.setValueAtTime(peak, Math.max(t + 0.01, t + dur - 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    }
    function chordOf(deg) { return [0, 2, 4, 6].map(function (k) { var i = deg + k; return root + scale[i % 7] + 12 * Math.floor(i / 7); }); }

    for (var b = 0; b < bars; b++) {
      var t0 = b * bar, deg = prog[b % 4], ch = chordOf(deg), tri = ch.slice(0, 3), fill = section === 'build' && b === bars - 1;
      for (var i = 0; i < 16; i++) {
        var t = t0 + i * step + (i % 2 ? p.swing * step : 0);
        if (drums && p.kick !== 'none' && p.k[i] === 'x' && !(section === 'outro' && b >= 6)) kick(t);
        if (drums && p.snare !== 'none' && (p.s[i] === 'x' || (fill && i >= 8 && i % 2 === 0)) && section !== 'intro1') snare(t);
        if (p.hat !== 'none' && p.h[i] === 'x' && section !== 'intro0') hat(t, i);
        if (p.perc && drums && (i === 3 || i === 7 || i === 10 || i === 14)) conga(t, i % 7 === 3);
        if (hasBass && p.bass !== 'none' && p.b[i] === 'x') bassNote(t, hz(ch[0] - 24 + (p.bass === 'octave' ? 0 : 0)), step * (p.half ? 3.6 : p.bass === 'sub' ? 3 : 0.85), i);
        if (p.chords !== 'none' && full && p.crh === 'off' && (i === 2 || i === 6 || i === 10 || i === 14)) tri.forEach(function (n) { synth(t, hz(n), step * 0.8, p.chords, 0.07); });
        if (p.lead !== 'none' && (full || section === 'break') && song.motif[(b % 2) * 16 + i] && !(p.lead === 'pluck' && section === 'break')) synth(t, hz(tri[song.motif[(b % 2) * 16 + i] - 1] + 12), step * (p.lead === 'bell' ? 2 : p.lead === 'flute' ? 1.8 : 0.8), p.lead, p.lead === 'saw' ? 0.06 : 0.09);
      }
      if (p.chords !== 'none' && (p.crh === 'bar' || p.crh === 'chop' || !full || section === 'break')) {
        var vel = p.chords === 'rhodes' || p.chords === 'piano' ? 0.07 : p.chords === 'supersaw' ? 0.03 : 0.045;
        if (p.crh === 'chop' && full) [0, 6, 10].forEach(function (s) { ch.forEach(function (n) { synth(t0 + s * step, hz(n), step * 1.5, p.chords, vel); }); });
        else ch.forEach(function (n) { synth(t0, hz(n), bar * 0.98, p.chords, vel); });
      }
      if (p.chords !== 'none' && full && p.crh === 'gate') {
        // one held chord per bar, chopped into eighths by a gate (much lighter than a new chord every eighth)
        var gate = ctx.createGain(); gate.connect(master); gate.gain.setValueAtTime(0, t0);
        for (var e = 0; e < 8; e++) { gate.gain.setValueAtTime(1, t0 + e * 2 * step); gate.gain.setValueAtTime(0, t0 + e * 2 * step + step * 1.4); }
        tri.forEach(function (n) { synth(t0, hz(n), bar, p.chords, 0.05, gate); });
      }
      if (p.crackle) crackle(t0, bar);
    }
    if (section === 'outro' && p.chords !== 'none') chordOf(prog[3]).forEach(function (n) { synth(bars * bar - bar, hz(n), bar + 0.8, p.chords === 'organ' || p.chords === 'stab' ? 'pad' : p.chords, 0.05); });
    return ctx.startRendering();
  }

  // A song: key, chord progression and a two-bar melody (1-3 = chord notes, 0 = rest), new every time you press play.
  function makeSong(st, rand) {
    var motif = [], density = st.p.lead === 'bell' || st.p.lead === 'flute' ? 0.18 : st.p.lead === 'pluck' ? 0.55 : 0.35;
    for (var i = 0; i < 32; i++) motif.push(rand() < density && (i % 2 === 0 || rand() < 0.4) ? 1 + Math.floor(rand() * 3) : 0);
    return { root: [0, 2, 3, 5, 7, 9][Math.floor(rand() * 6)] - 12, prog: PROGS[st.p.keys][Math.floor(rand() * 4)], rand: rand, motif: motif };
  }

  // ---- the player ----
  var ac = null, out = null, P = null;
  function audio() {
    if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.connect(ac.destination); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function phraseSec(st) { return 8 * 4 * 60 / st.bpm; }

  /**
   * Play a station until endAt (ms, Date.now() clock); endAt() can change
   * (e.g. +5 minutes). on({type:'start'|'end'|'phrase', ...}) for the UI.
   */
  function play(id, endAt, on) {
    stop(true);
    var st = STATIONS.filter(function (s) { return s.id === id; })[0];
    if (!st) return;
    var c = audio(), rand = seeded(id + Date.now()), keys = SCALES[st.p.keys];
    var song = makeSong(st, rand);
    out.gain.cancelScheduledValues(c.currentTime); out.gain.setValueAtTime(1, c.currentTime);
    var me = P = { st: st, song: song, next: c.currentTime + 0.15, idx: 0, ended: false, sources: [], endAt: endAt, on: on || function () {}, startedAt: Date.now(), timer: null, busy: false, finishAt: 0 };
    function sectionFor(i, last) {
      if (last) return 'outro';
      if (i === 0) return 'intro0';
      if (i === 1) return 'intro1';
      return (i % 6 === 5) ? 'break' : (i % 6 === 4) ? 'build' : 'main';
    }
    function fill() {
      if (P !== me || me.ended || me.busy) return;
      if (me.next - c.currentTime > 120) return;      // two minutes ahead is plenty (and survives a sleeping screen)
      var secsLeft = (me.endAt() - Date.now()) / 1000 - (me.next - c.currentTime);
      // End on the phrase that finishes nearest your timer: a few seconds early at most, never more than a phrase late.
      var last = secsLeft <= phraseSec(st) * 1.25 || me.idx > 400;
      var section = sectionFor(me.idx, last);
      me.busy = true;
      renderPhrase(st, song, section, me.idx === 0 ? 0.0 : 0.8, last ? 0.0 : 0.8).then(function (buf) {
        me.busy = false;
        if (P !== me || me.ended) return;
        var s = c.createBufferSource(); s.buffer = buf; s.connect(out); s.start(me.next);
        me.sources.push(s);
        if (me.sources.length > 8) me.sources.shift();
        me.idx++;
        me.on({ type: 'phrase', index: me.idx, section: section });
        if (last) {
          me.ended = true;
          me.finishAt = Date.now() + (me.next - c.currentTime + phraseSec(st) + 1.2) * 1000;
          s.onended = function () { if (P === me) { P = null; clearInterval(me.timer); me.on({ type: 'end' }); } };
        }
        me.next += phraseSec(st);
        fill();
      }, function () { me.busy = false; });
    }
    me.timer = setInterval(fill, 1000);
    fill();
    me.on({ type: 'start', station: st });
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: 'Nudge', album: st.style });
        navigator.mediaSession.setActionHandler('pause', function () { stop(); });
        navigator.mediaSession.setActionHandler('stop', function () { stop(); });
      } catch (e) {}
    }
    return me;
  }

  function stop(quick) {
    if (!P) return;
    var me = P, c = ac;
    P = null; clearInterval(me.timer); me.ended = true;
    var fade = quick ? 0.05 : 2.5;
    out.gain.cancelScheduledValues(c.currentTime); out.gain.setValueAtTime(out.gain.value, c.currentTime); out.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade);
    setTimeout(function () { me.sources.forEach(function (s) { try { s.stop(); } catch (e) {} }); if (!P) { out.gain.cancelScheduledValues(0); out.gain.value = 1; } }, fade * 1000 + 100);
    me.on({ type: 'end', stopped: true });
  }

  function now() { return P ? { station: P.st, startedAt: P.startedAt, ending: P.ended, finishAt: P.finishAt } : null; }

  /** One looping bar group for the DJ game: returns a Promise of an AudioBuffer. */
  function loop(id, bpm, bars, seed) {
    var st = STATIONS.filter(function (s) { return s.id === id; })[0];
    st = Object.assign({}, st, { bpm: bpm });
    var rand = seeded(seed || id);
    var song = makeSong(st, rand);
    return renderPhrase(st, song, 'main', 0.8, 0.8).then(function (buf) {
      var c = audio(), n = Math.round((bars || 8) * 4 * 60 / bpm * buf.sampleRate), b = c.createBuffer(1, n, buf.sampleRate);
      b.getChannelData(0).set(buf.getChannelData(0).subarray(0, n));
      return b;
    });
  }

  window.LQMusic = { STATIONS: STATIONS, play: play, stop: stop, now: now, loop: loop, audio: audio, phraseSec: phraseSec };
})();
