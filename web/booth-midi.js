/*
 * Afterhours: Booth · MIDI layer.
 * Decoder (pure: bytes in, named events out; tested in Node) plus the Web MIDI
 * connection (Chrome on your PC). Fixes you make on the Controller Test screen
 * are layered over booth-map.js as "overrides" ({id: {msg:[status,data1], lsb:[..]|null}}).
 */
(function (root) {
  function Decoder(map, overrides) {
    this.map = map;
    this.setOverrides(overrides || {});
  }
  Decoder.prototype.setOverrides = function (ov) {
    this.overrides = ov || {};
    this.byKey = {}; this.lsbKey = {}; this.msb = {}; this.byId = {};
    var self = this;
    this.map.controls.forEach(function (c0) {
      var c = Object.assign({}, c0, self.overrides[c0.id] || {});
      self.byId[c.id] = c;
      if (!c.msg) return;
      self.byKey[key(c.msg[0], c.msg[1])] = c;
      if (c.lsb) self.lsbKey[key(c.lsb[0], c.lsb[1])] = c;
    });
  };
  function key(s, d) { return (s & 0xFF) * 256 + (d & 0x7F); }
  // A centre-detented knob: put the hardware's middle value exactly on 0.5.
  function centre(raw, max) { var mid = (max + 1) / 2; return raw <= mid ? raw / (2 * mid) : 0.5 + (raw - mid) / (2 * (max - mid)); }
  function absValue(c, raw, max) { return c.kind === 'center' ? centre(raw, max) : raw / max; }
  /** bytes -> {id, kind, value|down|delta, raw:[..]}; id is null for anything not in the map. */
  Decoder.prototype.decode = function (bytes) {
    var s = bytes[0], d1 = bytes[1] & 0x7F, d2 = (bytes[2] || 0) & 0x7F;
    if ((s & 0xF0) === 0x80) { s = 0x90 | (s & 0x0F); d2 = 0; }   // note off = note on with velocity 0
    var raw = [bytes[0], bytes[1], bytes[2]], k = key(s, d1), c = this.lsbKey[k];
    if (c) {
      var m = this.msb[c.id]; if (m === undefined) return { id: c.id, kind: c.kind, partial: true, raw: raw };
      var v14 = m * 128 + d2;
      return { id: c.id, kind: c.kind, value: absValue(c, v14, 16383), raw: raw, bits: 14 };
    }
    c = this.byKey[k];
    if (!c) return { id: null, raw: raw };
    if (c.kind === 'button') return { id: c.id, kind: 'button', down: d2 > 0, raw: raw };
    if (c.kind === 'relative') return { id: c.id, kind: 'relative', delta: d2 < 64 ? d2 : d2 - 128, raw: raw };
    if (c.lsb) { this.msb[c.id] = d2; return { id: c.id, kind: c.kind, value: absValue(c, d2 * 128, 16383), raw: raw, bits: 7, coarse: true }; }
    return { id: c.id, kind: c.kind, value: absValue(c, d2, 127), raw: raw, bits: 7 };
  };
  /** The control a raw message would become if you "learn" it (for the test screen). */
  Decoder.prototype.learnFrom = function (bytes, pairLsb) {
    var s = bytes[0]; if ((s & 0xF0) === 0x80) s = 0x90 | (s & 0x0F);
    var o = { msg: [s, bytes[1] & 0x7F] };
    if (pairLsb) o.lsb = [s, (bytes[1] & 0x7F) + 0x20];
    return o;
  };
  Decoder.prototype.control = function (id) { return this.byId[id]; };
  function hex(b) { return b.map(function (x) { return ('0' + (x & 0xFF).toString(16).toUpperCase()).slice(-2); }).join(' '); }
  function describe(bytes) {
    var t = bytes[0] & 0xF0, ch = (bytes[0] & 0x0F) + 1;
    var kind = t === 0x90 ? (bytes[2] ? 'Note on' : 'Note off') : t === 0x80 ? 'Note off' : t === 0xB0 ? 'Control change' : t === 0xE0 ? 'Pitch bend' : 'Other';
    return kind + ' · channel ' + ch + ' · number ' + (bytes[1] & 0x7F) + ' · value ' + ((bytes[2] || 0) & 0x7F);
  }

  // ---------- Web MIDI (browser only) ----------
  function Connection(map) {
    this.map = map; this.access = null; this.input = null; this.output = null; this.listeners = []; this.status = { state: 'idle', message: '' }; this.seen = [];
  }
  Connection.prototype.on = function (fn) { this.listeners.push(fn); };
  Connection.prototype.emit = function (type, data) { this.listeners.forEach(function (f) { try { f(type, data); } catch (e) { console.error(e); } }); };
  Connection.prototype.setStatus = function (state, message) { this.status = { state: state, message: message || '' }; this.emit('status', this.status); };
  Connection.prototype.isInpulse = function (port) { var n = (port.name || '') + ' ' + (port.manufacturer || ''); return this.map.match.some(function (r) { return r.test(n); }); };
  Connection.prototype.connect = function () {
    var self = this;
    if (!navigator.requestMIDIAccess) { this.setStatus('unsupported', 'This browser can\'t talk to MIDI controllers. Open Booth in Chrome or Edge on your PC.'); return Promise.resolve(false); }
    this.setStatus('connecting', 'Looking for your Inpulse 500…');
    return navigator.requestMIDIAccess({ sysex: false }).then(function (access) {
      self.access = access;
      access.onstatechange = function () { self.scan(); };
      return self.scan();
    }, function (e) {
      self.setStatus('denied', 'Chrome wasn\'t allowed to use MIDI. Click the icon at the right of the address bar, allow MIDI devices, then press Connect again.');
      return false;
    });
  };
  Connection.prototype.scan = function () {
    var self = this, ins = [], outs = [];
    this.access.inputs.forEach(function (p) { ins.push(p); });
    this.access.outputs.forEach(function (p) { outs.push(p); });
    this.seen = ins.map(function (p) { return p.name; });
    var inp = ins.filter(function (p) { return self.isInpulse(p); })[0], out = outs.filter(function (p) { return self.isInpulse(p); })[0];
    if (!inp) {
      if (this.input) { this.input.onmidimessage = null; this.input = null; this.output = null; }
      this.setStatus('missing', 'Inpulse 500 not found. Close DJUCED and Serato, then unplug and replug the controller.' + (ins.length ? ' (I can see: ' + this.seen.join(', ') + '.)' : ''));
      return Promise.resolve(false);
    }
    if (this.input === inp && this.status.state === 'ready') return Promise.resolve(true);
    if (this.input && this.input !== inp) this.input.onmidimessage = null;
    this.input = inp; this.output = out || null;
    return Promise.all([inp.open(), out ? out.open() : null]).then(function () {
      inp.onmidimessage = function (e) { self.emit('midi', Array.prototype.slice.call(e.data)); };
      self.setStatus('ready', 'Connected: ' + inp.name + (out ? '' : ' (no light control found)'));
      self.requestDump();
      return true;
    }, function () {
      self.input = null;
      self.setStatus('busy', 'The Inpulse 500 is in use by another app. Close DJUCED and Serato, then unplug and replug the controller.');
      return false;
    });
  };
  Connection.prototype.send = function (bytes) { if (this.output) try { this.output.send(bytes); return true; } catch (e) {} return false; };
  Connection.prototype.requestDump = function () { var d = this.map.lights.dumpRequest; if (d) this.send(d); };

  var api = { Decoder: Decoder, Connection: Connection, hex: hex, describe: describe };
  root.BoothMIDI = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
