/* Life Quest music: original, generated mixes that last as long as your chore.
 * Each station is a style (tempo, drum pattern, bass, chords). A mix is built
 * phrase by phrase (8 bars at a time) and always ends on a proper outro, so it
 * never stops mid-beat: at most one phrase (~15-28 s) past your timer.
 * Phrases are rendered ahead into audio buffers, so playback keeps going
 * smoothly even with the screen off. */
(function () {
  'use strict';

  // [id, name, style, bpm, mood, colour A, colour B, pattern]
  // pattern: k = kick, s = snare/clap, h = hats (16 steps each, x = hit), bass rhythm, swing, half time
  var STATIONS = [
    ['grove-lofi', 'Grove Street Lo-fi', 'Lo-fi hip hop', 84, 'Slow and cosy', '#2e9e4f', '#c9862b', { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x.....x...x.....', swing: 0.18, keys: 'minor', pad: 1, arp: 0, lead: 1 }],
    ['vice-house', 'Vice Beach House', 'House', 122, 'Sunny and bouncy', '#ff5fae', '#2fe0d6', { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', b: '..x...x.x.x...x.', swing: 0, keys: 'major', pad: 1, arp: 1, lead: 0 }],
    ['sunset-disco', 'Sunset Disco', 'Disco', 116, 'Feel-good', '#ffb703', '#e76f51', { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', b: 'x.x.x.x.x.x.x.x.', swing: 0.05, keys: 'major', pad: 1, arp: 1, lead: 0 }],
    ['garage-run', 'Garage Run', 'UK garage', 132, 'Skippy and quick', '#7c3aed', '#2563eb', { k: 'x.....x...x..x..', s: '....x.......x...', h: '..x...x...x...xx', b: 'x..x..x.x..x..x.', swing: 0.22, keys: 'minor', pad: 1, arp: 0, lead: 1 }],
    ['warehouse', 'Warehouse Techno', 'Techno', 130, 'Driving', '#334155', '#94a3b8', { k: 'x...x...x...x...', s: '........x.......', h: '..x...x...x...x.', b: 'xxxxxxxxxxxxxxxx', swing: 0, keys: 'minor', pad: 0, arp: 1, lead: 0 }],
    ['liquid-dnb', 'Liquid Drum and Bass', 'Drum and bass', 172, 'Fast, smooth focus', '#0f7e8a', '#9db8ff', { k: 'x.........x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x.......x.x.....', swing: 0, keys: 'minor', pad: 1, arp: 1, lead: 0 }],
    ['synthwave', 'Ocean Drive Synthwave', 'Synthwave', 100, 'Neon night drive', '#ff4f9a', '#7c3aed', { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'xxxxxxxxxxxxxxxx', swing: 0, keys: 'minor', pad: 1, arp: 1, lead: 1 }],
    ['boom-bap', 'Ganton Boom Bap', 'Hip hop', 90, 'Head-nod', '#c9a227', '#3b2f0b', { k: 'x......xx.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x......x.x......', swing: 0.2, keys: 'minor', pad: 0, arp: 0, lead: 1 }],
    ['afro-house', 'Afro House Sunrise', 'Afro house', 120, 'Warm and rolling', '#e9c46a', '#2a9d8f', { k: 'x...x...x...x...', s: '......x.....x.x.', h: 'x.xx.xx.x.xx.xx.', b: 'x..x..x...x..x..', swing: 0.08, keys: 'minor', pad: 1, arp: 1, lead: 0 }],
    ['trance', 'Starfish Trance', 'Trance', 138, 'Big lifts', '#6a4fc4', '#ff9cc8', { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', b: '.xxx.xxx.xxx.xxx', swing: 0, keys: 'minor', pad: 1, arp: 1, lead: 1 }],
    ['dub-plates', 'Dub Plates', 'Dubstep', 140, 'Heavy, half-time', '#3a3047', '#5fd79a', { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', b: 'x.......x..x....', swing: 0, keys: 'minor', pad: 1, arp: 0, lead: 0, half: 1 }],
    ['clean-ambient', 'Clean Air Ambient', 'Ambient', 70, 'Calm, no drums', '#a7d3e8', '#e0c3fc', { k: '................', s: '................', h: '................', b: 'x...............', swing: 0, keys: 'major', pad: 1, arp: 1, lead: 0 }]
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
    var master = ctx.createGain(); master.connect(ctx.destination);
    master.gain.setValueAtTime(0.0001 + gainFrom, 0); master.gain.linearRampToValueAtTime(Math.max(0.0001, gainTo), bars * bar);
    var nb = noiseBuf(ctx), p = st.p, step = bar / 16, scale = SCALES[p.keys], prog = song.prog, root = song.root;
    var drums = section !== 'break' && section !== 'intro0', bass = section !== 'intro0' && section !== 'intro1';
    function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function kick(t) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 0.004, 0.9, 0.28); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35); }
    function hit(t, f, q, peak, d, type) { var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q; env(g, t, 0.002, peak, d); s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05); }
    function tone(t, hz, dur, type, peak, cutoff, a) {
      var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = type; o.frequency.value = hz; fl.type = 'lowpass'; fl.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (a || 0.01)); g.gain.setValueAtTime(peak, t + Math.max(a || 0.01, dur - 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      o.connect(fl); fl.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.1);
    }
    function chord(deg) { return [0, 2, 4].map(function (k) { var i = deg + k, oct = Math.floor(i / 7); return root + scale[i % 7] + 12 * oct; }); }
    for (var b = 0; b < bars; b++) {
      var t0 = b * bar, deg = prog[b % 4], ch = chord(deg);
      for (var i = 0; i < 16; i++) {
        var t = t0 + i * step + (i % 2 ? p.swing * step : 0);
        if (drums && p.k[i] === 'x' && !(section === 'outro' && b >= 6)) kick(t);
        if (drums && p.s[i] === 'x' && section !== 'intro1') hit(t, 1800, 0.8, 0.45, 0.16, 'bandpass');
        if (p.h[i] === 'x' && section !== 'intro0') hit(t, 8000, 0.5, section === 'break' ? 0.07 : 0.14, 0.04, 'highpass');
        if (bass && p.b[i] === 'x' && section !== 'break') tone(t, noteHz(ch[0] - 24), step * (p.half ? 3 : 0.9), p.keys === 'minor' ? 'sawtooth' : 'square', 0.22, 420, 0.005);
        if (p.arp && (i % 2 === 0) && section !== 'intro0' && section !== 'outro') tone(t, noteHz(ch[(i / 2) % 3] + 12), step * 0.8, 'triangle', 0.07, 3000, 0.005);
      }
      if (p.pad) ch.forEach(function (n, k) { [-6, 0, 6].forEach(function (cents) { tone(t0, noteHz(n) * Math.pow(2, cents / 1200), bar, 'sawtooth', 0.025, section === 'break' ? 2400 : 1300, 0.25); }); });
      if (p.lead && section === 'main' && b % 2 === 1) {
        var r = song.rand;
        for (var m = 0; m < 4; m++) tone(t0 + m * beat, noteHz(ch[Math.floor(r() * 3)] + 12 + (r() < 0.3 ? 12 : 0)), beat * 0.7, 'triangle', 0.08, 2600, 0.01);
      }
    }
    if (section === 'outro') ch.forEach(function (n) { tone(bars * bar - bar, noteHz(n), bar + 1.2, 'triangle', 0.06, 2000, 0.3); });
    return ctx.startRendering();
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
    var song = { root: [0, 2, 3, 5, 7, 9][Math.floor(rand() * 6)] - 12, prog: PROGS[st.p.keys][Math.floor(rand() * 4)], rand: rand };
    out.gain.cancelScheduledValues(c.currentTime); out.gain.setValueAtTime(1, c.currentTime);
    var me = P = { st: st, song: song, next: c.currentTime + 0.15, idx: 0, ended: false, sources: [], endAt: endAt, on: on || function () {}, startedAt: Date.now(), timer: null, busy: false, finishAt: 0 };
    function sectionFor(i, last) {
      if (last) return 'outro';
      if (i === 0) return 'intro0';
      if (i === 1) return 'intro1';
      return (i % 6 === 5) ? 'break' : 'main';
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
        navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: 'Life Quest', album: st.style });
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
    var song = { root: [0, 2, 3, 5, 7, 9][Math.floor(rand() * 6)] - 12, prog: PROGS[st.p.keys][Math.floor(rand() * 4)], rand: rand };
    return renderPhrase(st, song, 'main', 0.8, 0.8).then(function (buf) {
      var c = audio(), n = Math.round((bars || 8) * 4 * 60 / bpm * buf.sampleRate), b = c.createBuffer(1, n, buf.sampleRate);
      b.getChannelData(0).set(buf.getChannelData(0).subarray(0, n));
      return b;
    });
  }

  window.LQMusic = { STATIONS: STATIONS, play: play, stop: stop, now: now, loop: loop, audio: audio, phraseSec: phraseSec };
})();
