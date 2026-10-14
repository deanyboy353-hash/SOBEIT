/*
 * Afterhours: Booth · audio engine (Web Audio).
 * Per deck: source -> TRIM -> 3-band isolator EQ (LOW/MID/HIGH, full kill at minimum)
 *           -> bipolar FILTER (left low-pass, right high-pass, centre off) -> channel fader
 *           -> crossfader -> master -> limiter -> output.
 * PFL (headphone cue) taps each deck before its fader.
 *
 * Tempo is "vinyl style": the pitch fader changes speed and pitch together.
 * Why: it adds zero latency, never glitches or smears kicks, and keeps the beat
 * grid sample-exact, which matters for learning to beatmatch by ear. Techno
 * mixes rarely move more than 2-3%, which is under half a semitone.
 */
(function (root) {
  'use strict';
  var XO_LOW = 200, XO_HIGH = 2500;

  function Engine() {
    var AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    var c = this.ctx;
    this.master = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.out = c.createGain();
    this.master.connect(this.limiter); this.limiter.connect(this.out);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0;
    this.out.connect(this.analyser);
    this.cueBus = c.createGain();
    this.xfLocked = true; this.xf = 0.5; this.cueMode = 'master'; this.cueEl = null;
    this.decks = { A: new Deck(this, 'A'), B: new Deck(this, 'B') };
    this.route('master');
    this.buf = new Float32Array(this.analyser.fftSize);
  }
  Engine.prototype.resume = function () { if (this.ctx.state !== 'running') return this.ctx.resume(); return Promise.resolve(); };
  Engine.prototype.now = function () { return this.ctx.currentTime; };
  Engine.prototype.other = function (d) { return this.decks[d.id === 'A' ? 'B' : 'A']; };
  /** Where your headphones get their sound from.
   *  'master': no separate cue (headphones hear the master).
   *  'split' : master on outputs 1-2, cue on outputs 3-4 of a 4-channel device (the Inpulse 500, if Windows exposes 4 channels).
   *  'device': cue to a second sound device (e.g. your PC's headphone jack). */
  Engine.prototype.route = function (mode, deviceId) {
    var c = this.ctx, self = this;
    try { this.out.disconnect(); } catch (e) {} try { this.cueBus.disconnect(); } catch (e) {}
    this.out.connect(this.analyser);
    if (this.cueEl) { this.cueEl.pause(); this.cueEl = null; }
    if (mode === 'split' && c.destination.maxChannelCount >= 4) {
      c.destination.channelCount = 4; c.destination.channelCountMode = 'explicit'; c.destination.channelInterpretation = 'discrete';
      var m = c.createChannelMerger(4), s1 = c.createChannelSplitter(2), s2 = c.createChannelSplitter(2);
      this.out.connect(s1); s1.connect(m, 0, 0); s1.connect(m, 1, 1);
      this.cueBus.connect(s2); s2.connect(m, 0, 2); s2.connect(m, 1, 3);
      m.connect(c.destination);
      this.cueMode = 'split';
    } else if (mode === 'device' && deviceId && c.createMediaStreamDestination) {
      this.out.connect(c.destination);
      var dest = c.createMediaStreamDestination(); this.cueBus.connect(dest);
      var a = new Audio(); a.srcObject = dest.stream;
      (a.setSinkId ? a.setSinkId(deviceId) : Promise.resolve()).then(function () { a.play(); }, function () {});
      this.cueEl = a; this.cueMode = 'device';
    } else {
      try { c.destination.channelCount = 2; } catch (e) {}
      this.out.connect(c.destination); this.cueMode = 'master';
    }
    return this.cueMode;
  };
  Engine.prototype.setOutput = function (deviceId) { var c = this.ctx; return c.setSinkId ? c.setSinkId(deviceId || '') : Promise.reject(new Error('This Chrome can\'t pick an output device. Update Chrome.')); };
  Engine.prototype.setXfader = function (v) {
    this.xf = v;
    var a = 1, b = 1;
    if (!this.xfLocked) { a = Math.cos(v * Math.PI / 2) * Math.SQRT2; b = Math.sin(v * Math.PI / 2) * Math.SQRT2; a = Math.min(1, a); b = Math.min(1, b); }
    var t = this.now();
    this.decks.A.xg.gain.setTargetAtTime(a, t, 0.005); this.decks.B.xg.gain.setTargetAtTime(b, t, 0.005);
  };
  /** Master loudness right now, in dBFS (RMS over the last ~46 ms). */
  Engine.prototype.masterDb = function () {
    this.analyser.getFloatTimeDomainData(this.buf);
    var s = 0; for (var i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    var r = Math.sqrt(s / this.buf.length); return r > 1e-6 ? 20 * Math.log10(r) : -120;
  };
  /** Keep synced decks locked and decay jog nudges. Call every animation frame. */
  Engine.prototype.tick = function () {
    var t = this.now(), self = this;
    ['A', 'B'].forEach(function (k) { self.decks[k].tick(t); });
  };

  // ---------- a deck ----------
  function bq(c, type, f, q) { var n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q === undefined ? Math.SQRT1_2 : q; return n; }
  function Deck(engine, id) {
    var c = engine.ctx;
    this.e = engine; this.id = id; this.c = c;
    this.track = null; this.src = null; this.playing = false; this.pos = 0; this.lastT = 0;
    this.pitch = 0; this.pitchRange = 0.08; this.faderPitch = null; this.picked = true;
    this.nudge = 0; this.jogVel = 0; this.touching = false; this.curRate = 1; this.loop = null; this.loopIn = null; this.loopSize = 4; this.shadow = null;
    this.sync = true; this.cuePos = 0; this.hot = []; this.startedAt = 0; this.ended = false;
    this.vals = { trim: 0.5, eqLow: 0.5, eqMid: 0.5, eqHigh: 0.5, filter: 0.5, volume: 0, pfl: 0 };
    this.trim = c.createGain();
    // 3-band isolator: Linkwitz-Riley style splits (two 2nd-order filters per edge), one gain per band.
    this.lo1 = bq(c, 'lowpass', XO_LOW); this.lo2 = bq(c, 'lowpass', XO_LOW);
    this.mi1 = bq(c, 'highpass', XO_LOW); this.mi2 = bq(c, 'highpass', XO_LOW); this.mi3 = bq(c, 'lowpass', XO_HIGH); this.mi4 = bq(c, 'lowpass', XO_HIGH);
    this.hi1 = bq(c, 'highpass', XO_HIGH); this.hi2 = bq(c, 'highpass', XO_HIGH);
    this.gLow = c.createGain(); this.gMid = c.createGain(); this.gHigh = c.createGain(); this.sum = c.createGain();
    this.trim.connect(this.lo1); this.lo1.connect(this.lo2); this.lo2.connect(this.gLow); this.gLow.connect(this.sum);
    this.trim.connect(this.mi1); this.mi1.connect(this.mi2); this.mi2.connect(this.mi3); this.mi3.connect(this.mi4); this.mi4.connect(this.gMid); this.gMid.connect(this.sum);
    this.trim.connect(this.hi1); this.hi1.connect(this.hi2); this.hi2.connect(this.gHigh); this.gHigh.connect(this.sum);
    this.mi1.Q.value = this.mi2.Q.value = this.mi3.Q.value = this.mi4.Q.value = Math.SQRT1_2;
    this.lp = bq(c, 'lowpass', 22000, 0.9); this.hp = bq(c, 'highpass', 10, 0.9);
    this.sum.connect(this.lp); this.lp.connect(this.hp);
    this.fader = c.createGain(); this.xg = c.createGain(); this.pflG = c.createGain();
    this.hp.connect(this.fader); this.fader.connect(this.xg); this.xg.connect(engine.master);
    this.hp.connect(this.pflG); this.pflG.connect(engine.cueBus);
    this.meter = c.createAnalyser(); this.meter.fftSize = 512; this.fader.connect(this.meter); this.mbuf = new Float32Array(512);
    this.fader.gain.value = 0; this.pflG.gain.value = 0;
  }
  var D = Deck.prototype;
  D.set = function (name, v) {
    this.vals[name] = v;
    var t = this.c.currentTime, g;
    if (name === 'trim') this.trim.gain.setTargetAtTime(Math.pow(10, (v - 0.5) * 24 / 20), t, 0.01);   // -12..+12 dB, centre 0
    else if (name === 'eqLow' || name === 'eqMid' || name === 'eqHigh') { g = eqGain(v); this[name === 'eqLow' ? 'gLow' : name === 'eqMid' ? 'gMid' : 'gHigh'].gain.setTargetAtTime(g, t, 0.008); }
    else if (name === 'filter') {
      var dz = 0.035, lpF = 22000, hpF = 10;
      if (v < 0.5 - dz) lpF = 20000 * Math.pow(2, -((0.5 - dz - v) / (0.5 - dz)) * 6.6);
      if (v > 0.5 + dz) hpF = 20 * Math.pow(2, ((v - 0.5 - dz) / (0.5 - dz)) * 8.6);
      this.lp.frequency.setTargetAtTime(lpF, t, 0.01); this.hp.frequency.setTargetAtTime(hpF, t, 0.01);
    }
    else if (name === 'volume') this.fader.gain.setTargetAtTime(faderGain(v), t, 0.006);
    else if (name === 'pfl') this.pflG.gain.setTargetAtTime(v ? 1 : 0, t, 0.01);
  };
  /** EQ knob 0..1 -> linear gain: 0 = full kill, 0.5 = unity, 1 = +6 dB. */
  function eqGain(v) { return v <= 0.5 ? Math.pow(v / 0.5, 2) : 1 + (v - 0.5) * 2; }
  function faderGain(v) { return v <= 0 ? 0 : Math.pow(v, 2); }
  D.eqGainOf = function (name) { return eqGain(this.vals[name]); };
  D.faderGain = function () { return faderGain(this.vals.volume); };

  D.load = function (track, buffer) {
    this.stop(); this.track = track; this.buffer = buffer;
    this.hot = (track.hot || []).slice(); this.cuePos = track.first || 0; this.pos = this.cuePos; this.nudge = 0; this.jogVel = 0; this.ended = false;
    this.loop = null; this.loopIn = null; this.shadow = null; this.loopSize = 4;
    // a new track starts at the tempo the pitch fader shows
    this.pitchOffset = 0; this.pitch = this.faderRaw || 0; this.picked = true;
  };
  D.baseRate = function () {
    var o = this.e.other(this);
    if (this.sync && o.track && o.playing && !(o.sync && o.startedAt > this.startedAt && this.playing)) return Math.max(0.84, Math.min(1.16, o.bpm() / this.track.bpm));
    return 1 + this.pitch;
  };
  D.rate = function () { return this.baseRate() * (1 + this.nudge); };
  D.bpm = function () { return this.track ? this.track.bpm * this.baseRate() : 0; };
  D.time = function (t) {
    t = t === undefined ? this.c.currentTime : t;
    var raw = this.playing ? this.pos + (t - this.lastT) * this.curRate : this.pos, L = this.loop;
    if (L && this.playing && raw >= L.end) return L.start + (raw - L.start) % (L.end - L.start);
    return raw;
  };
  D.beatPos = function (t) { return this.track ? (this.time(t) - this.track.first) * this.track.bpm / 60 : 0; };
  D.mark = function (t) { this.pos = this.time(t); this.lastT = t; };
  D.applyRate = function () {
    var t = this.c.currentTime, r = this.rate();
    if (!this.playing) { this.curRate = r; return; }
    if (Math.abs(r - this.curRate) < 1e-7) return;
    this.mark(t); this.curRate = r;
    if (this.src) this.src.playbackRate.setValueAtTime(r, t);
  };
  D.play = function () {
    if (!this.track || this.playing) return;
    this.e.resume();
    var o = this.e.other(this), t = this.c.currentTime + 0.01;
    this.startedAt = t; this.curRate = this.rate();
    // SYNC: line our beats up with the other deck as we start.
    if (this.sync && o.playing && o.track) {
      var ob = o.beatPos(t), mine = (this.pos - this.track.first) * this.track.bpm / 60, d = (ob - Math.floor(ob)) - (mine - Math.floor(mine));
      if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
      this.pos += d * 60 / this.track.bpm;
    }
    this.startAt(t, this.pos);
  };
  D.startAt = function (t, pos) {
    var s = this.c.createBufferSource(), self = this, dur = this.buffer.duration;
    s.buffer = this.buffer; s.playbackRate.value = this.curRate; s.connect(this.trim);
    if (this.loop) { s.loop = true; s.loopStart = Math.max(0, this.loop.start); s.loopEnd = Math.min(dur, this.loop.end); if (pos >= this.loop.end) pos = this.loop.start + (pos - this.loop.start) % (this.loop.end - this.loop.start); }
    if (pos < 0) s.start(t + (-pos) / this.curRate, 0); else s.start(t, Math.min(pos, dur - 0.005));
    s.onended = function () { if (self.src === s) { self.mark(self.c.currentTime); self.playing = false; self.src = null; self.ended = true; } };
    if (this.src) { try { this.src.stop(t); } catch (e) {} }
    this.src = s; this.pos = pos; this.lastT = t; this.playing = true; this.ended = false;
  };
  D.stop = function () {
    if (!this.playing) return;
    this.mark(this.c.currentTime); this.playing = false;
    var s = this.src; this.src = null; if (s) { try { s.stop(); } catch (e) {} }
  };
  D.seek = function (pos) {
    if (!this.track) return;
    pos = Math.max(-2, Math.min(this.buffer.duration - 0.05, pos));
    if (this.loop && (pos < this.loop.start - 0.001 || pos >= this.loop.end)) this.loop = null;   // jumping out of a loop ends it
    if (this.playing) this.startAt(this.c.currentTime + 0.005, pos); else this.pos = pos;
  };
  D.snap = function (pos) { if (!this.track) return pos; var b = 60 / this.track.bpm, k = Math.round((pos - this.track.first) / b); return this.track.first + k * b; };
  /** CDJ-style CUE: paused -> set cue here (snapped to the beat); playing -> back to cue and stop. Held while paused -> preview. */
  D.cueDown = function () {
    if (!this.track) return;
    if (this.playing) { this.stop(); this.pos = this.cuePos; return 'back'; }
    if (Math.abs(this.pos - this.cuePos) > 0.02) { this.cuePos = this.snap(this.pos); this.pos = this.cuePos; return 'set'; }
    this.previewing = true; this.play(); return 'preview';
  };
  D.cueUp = function () { if (this.previewing) { this.previewing = false; this.stop(); this.pos = this.cuePos; } };
  // ---------- loops ----------
  D.beatSec = function () { return 60 / this.track.bpm; };
  /** Change the loop and restart playback seamlessly from where we are (wrapped into the new loop). */
  D.setLoop = function (L) {
    var t = this.c.currentTime + 0.005, p = this.time(t);
    this.loop = L;
    if (L && p >= L.end) p = L.start + (p - L.start) % (L.end - L.start);
    if (this.playing) this.startAt(t, p); else this.pos = p;
  };
  D.loopLen = function () { return this.loop ? (this.loop.end - this.loop.start) / this.beatSec() : 0; };
  /** LOOP IN: mark the start (on the beat). While looping, it exits the loop. */
  D.loopInBtn = function () {
    if (!this.track) return '';
    if (this.loop) { this.setLoop(null); return 'exit'; }
    this.loopIn = this.snap(this.time()); return 'in';
  };
  /** LOOP OUT: close the loop from LOOP IN to here (whole beats). While looping, it exits. */
  D.loopOutBtn = function () {
    if (!this.track) return '';
    if (this.loop) { this.setLoop(null); return 'exit'; }
    if (this.loopIn === null || this.loopIn === undefined) return 'noin';
    var b = this.beatSec(), now = this.time(), beats = Math.max(1, Math.round((now - this.loopIn) / b));
    if (now <= this.loopIn) return 'noin';
    this.setLoop({ start: this.loopIn, end: this.loopIn + beats * b }); return beats;
  };
  /** An auto loop of n beats from the current beat (fractions start on the matching fraction). Same size again turns it off. */
  D.beatLoop = function (beats, keep) {
    if (!this.track) return '';
    var b = this.beatSec(), len = beats * b;
    if (this.loop && !keep && Math.abs(this.loopLen() - beats) < 1e-6) { this.setLoop(null); return 'exit'; }
    var q = beats >= 1 ? b : len, now = this.time(), start = this.track.first + Math.floor((now - this.track.first) / q + 1e-9) * q;
    this.loopSize = beats; this.setLoop({ start: start, end: start + len }); return beats;
  };
  D.loopHalve = function () { if (this.loop) { var len = (this.loop.end - this.loop.start) / 2; if (len / this.beatSec() >= 1 / 32) this.setLoop({ start: this.loop.start, end: this.loop.start + len }); } else this.loopSize = Math.max(1 / 8, this.loopSize / 2); return this.loop ? this.loopLen() : this.loopSize; };
  D.loopDouble = function () { if (this.loop) { var len = (this.loop.end - this.loop.start) * 2; if (len / this.beatSec() <= 64) this.setLoop({ start: this.loop.start, end: this.loop.start + len }); } else this.loopSize = Math.min(64, this.loopSize * 2); return this.loop ? this.loopLen() : this.loopSize; };
  /** Momentary loops (roll, slicer): the track keeps running underneath, and you land where it would have been. */
  D.slipStart = function () { if (!this.shadow) this.shadow = { pos: this.time(), t: this.c.currentTime, loop: this.loop }; };
  D.slipEnd = function () {
    var s = this.shadow; if (!s) return; this.shadow = null;
    var t = this.c.currentTime + 0.005, pos = s.pos + (t - s.t) * this.curRate;
    if (s.loop && pos >= s.loop.end) pos = s.loop.start + (pos - s.loop.start) % (s.loop.end - s.loop.start);
    this.loop = s.loop || null;
    if (this.playing) this.startAt(t, pos); else this.pos = pos;
  };
  D.roll = function (beats, down) { if (!this.track || !this.playing) return; if (down) { this.slipStart(); this.beatLoop(beats, true); } else this.slipEnd(); };
  /** Slicer: the 8 beats you're in are cut into 8 slices; a pad plays its slice (looped while held). */
  D.slice = function (n, down) {
    if (!this.track || !this.playing) return;
    if (!down) return this.slipEnd();
    var b = this.beatSec(), bp = Math.floor(this.beatPos()), dom = bp - ((bp % 8) + 8) % 8, at = this.track.first + (dom + n) * b;
    this.slipStart(); this.loop = { start: at, end: at + b }; this.startAt(this.c.currentTime + 0.005, at);
  };
  D.sliceIndex = function () { if (!this.track) return -1; var bp = Math.floor(this.beatPos()); return ((bp % 8) + 8) % 8; };
  /** Beat jump: move forward or back by whole beats (the loop moves too). */
  D.beatJump = function (beats) {
    if (!this.track) return;
    var d = beats * this.beatSec();
    if (this.loop) { this.loop = { start: this.loop.start + d, end: this.loop.end + d }; }
    var t = this.c.currentTime + 0.005, p = this.time(t) + d;
    if (this.playing) this.startAt(t, p); else this.pos = p;
  };

  D.hotcue = function (n, del) {
    if (!this.track) return '';
    if (del) { this.hot[n] = null; return 'deleted'; }
    if (this.hot[n] === null || this.hot[n] === undefined) { this.hot[n] = this.snap(this.time()); return 'set'; }
    this.seek(this.hot[n]); return 'jump';
  };
  /** Pitch fader 0..1 (top = slower, bottom = faster, like the hardware arrows). Soft takeover after SYNC is turned off. */
  D.pitchFader = function (v) {
    this.faderRaw = (v - 0.5) * 2 * this.pitchRange;
    var p = this.faderRaw + (this.pitchOffset || 0);
    this.faderPitch = p;
    if (this.sync) return;
    if (!this.picked) { if (Math.abs(p - this.pitch) < 0.0015) this.picked = true; else return; }
    this.pitch = p; this.applyRate();
  };
  /** Beatmatching drills: start at a given tempo change, and let the fader move it from wherever it sits now. */
  D.startAtPitch = function (p) {
    this.sync = false; this.pitchOffset = p - (this.faderRaw || 0); this.pitch = p; this.faderPitch = p; this.picked = true; this.applyRate();
  };
  D.clearOffset = function () { if (this.pitchOffset) { this.pitchOffset = 0; this.pitch = this.faderRaw || 0; this.picked = true; this.applyRate(); } };
  /** SYNC off: keep the tempo it had, and let the pitch fader move it from wherever the fader sits (no jump, no pick-up needed). */
  D.setSync = function (on) {
    if (!on && this.sync) { this.pitch = this.baseRate() - 1; this.pitchOffset = this.pitch - (this.faderRaw || 0); this.picked = true; }
    this.sync = on; this.applyRate();
  };
  /** Jog: turning the wheel while playing bends the tempo briefly (a nudge); while stopped it moves the playhead. 720 ticks a turn. */
  D.jog = function (ticks) {
    if (!this.track) return;
    if (!this.playing) { this.seek(this.pos + ticks / 720 * 1.8); return; }
    this.jogVel = Math.max(-40, Math.min(40, this.jogVel + ticks));
  };
  D.tick = function (t) {
    if (!this.track) return;
    // nudge from the jog wheel, easing back to zero
    var target = Math.max(-0.08, Math.min(0.08, this.jogVel * 0.004));
    this.jogVel *= 0.82; if (Math.abs(this.jogVel) < 0.05) this.jogVel = 0;
    // SYNC keeps phase locked too: a gentle correction when not being nudged
    var o = this.e.other(this), corr = 0;
    if (this.sync && this.playing && o.playing && o.track && !this.jogVel && !(o.sync && o.startedAt > this.startedAt)) {
      var d = this.phaseTo(o, t); if (Math.abs(d) > 0.002) corr = Math.max(-0.01, Math.min(0.01, -d * 0.6));
    }
    this.nudge = target + corr;
    this.applyRate();
  };
  /** Phase difference to the other deck, in beats (-0.5..0.5). Positive = we're ahead. */
  D.phaseTo = function (o, t) {
    var a = this.beatPos(t), b = o.beatPos(t), d = (a - Math.floor(a)) - (b - Math.floor(b));
    if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return d;
  };
  D.level = function () { this.meter.getFloatTimeDomainData(this.mbuf); var m = 0; for (var i = 0; i < this.mbuf.length; i++) m = Math.max(m, Math.abs(this.mbuf[i])); return m; };
  D.left = function () { return this.track ? Math.max(0, this.buffer.duration - this.time()) / this.curRateOr1() : 0; };
  D.curRateOr1 = function () { return this.curRate || 1; };

  var api = { Engine: Engine, eqGain: eqGain, faderGain: faderGain };
  root.BoothAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
