/*
 * Afterhours: Booth · app shell and the Controller Test screen.
 * Separate page (booth.html) from the main Nudge app; same site, so it shares
 * your login (the saved key) and backend.
 */
(function () {
  'use strict';
  var MAP = window.BOOTH_MAP, BM = window.BoothMIDI;
  function load(k, d) { try { var v = localStorage.getItem('booth-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem('booth-' + k, JSON.stringify(v)); } catch (e) {} }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT = 0;
  function toast(msg) { var t = el('btoast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  // ---------- controller state (shared by every screen) ----------
  var overrides = load('overrides', {}), verified = load('verified', {}), ledOk = load('leds', {});
  var dec = new BM.Decoder(MAP, overrides), conn = new BM.Connection(MAP);
  var values = {}, spins = {}, log = [], learning = null, screen = '';
  function control(id) { return dec.control(id); }
  function required(c) { return c.kind !== 'analog' && !(c.bank && c.bank !== 'hotcue'); }

  conn.on(function (type, data, ts) {
    if (type === 'status') return drawConn();
    if (type === 'midi') onMidi(data, ts);
  });
  function drawConn() {
    var s = conn.status, c = el('conn');
    c.className = 'conn ' + s.state;
    el('connText').textContent = s.state === 'idle' ? 'Controller not connected' : s.message;
    el('connect').hidden = s.state === 'ready';
    el('connect').textContent = s.state === 'idle' ? 'Connect controller' : 'Try again';
    if (screen === 'test') drawTestAlert();
  }

  function onMidi(bytes, ts) {
    if (learning) return learnFrom(bytes);
    var e = dec.decode(bytes);
    e.ts = ts || performance.now();
    if (e.partial) return;
    if (e.id) {
      if (e.value !== undefined) values[e.id] = e.value;
      if (e.kind === 'button') values[e.id] = e.down ? 1 : 0;
      if (e.kind === 'relative') spins[e.id] = (spins[e.id] || 0) + e.delta;
      if (!verified[e.id] && (e.kind !== 'button' || e.down)) { verified[e.id] = true; save('verified', verified); if (screen === 'test') drawChecklist(); }
      if (screen === 'test') { echoLight(e); if (window.BoothAcademy && e.down) BoothAcademy.padSeen(e.id); }
      else if (window.BoothPlay) BoothPlay.control(e);
    }
    // Fine (LSB) halves of a 14-bit move aren't worth a log line each.
    if (!(e.bits === 14)) addLog(bytes, e);
    if (screen === 'test') { hit(e); }
  }
  function addLog(bytes, e) {
    log.unshift({ hex: BM.hex(bytes), desc: BM.describe(bytes), id: e.id, at: Date.now() });
    if (log.length > 60) log.length = 60;
    if (screen === 'test') drawLog();
  }
  // Light the hardware button you just pressed, so you can see the light works too.
  function echoLight(e) {
    var c = control(e.id); if (!c || !c.led || e.kind !== 'button') return;
    if (/\.play$|\.cue$|\.sync$/.test(c.id) && !e.down) return;   // these toggle
    var on = /\.play$|\.cue$|\.sync$/.test(c.id) ? !(values[c.id + ':lit']) : e.down;
    if (/\.play$|\.cue$|\.sync$/.test(c.id)) values[c.id + ':lit'] = on;
    conn.send([c.led[0], c.led[1], on ? (c.pad ? MAP.lights.colours.cyan : 0x7F) : 0]);
  }

  // ---------- learning (fix a control that doesn't respond) ----------
  function startLearn(id) {
    learning = id; drawLearn();
    var c = control(id);
    toast('Now move ' + c.label + (c.kind === 'button' ? ' (press it)' : ''));
  }
  function learnFrom(bytes) {
    var t = bytes[0] & 0xF0; if (t !== 0x90 && t !== 0xB0 && t !== 0x80) return;
    if (t === 0x80 || (t === 0x90 && !bytes[2])) return;              // wait for the press, not the release
    var c = control(learning), o = dec.learnFrom(bytes, !!c.lsb && t === 0xB0 && (bytes[1] & 0x7F) < 0x20);
    if (c.kind === 'button' && t !== 0x90) { toast('That was a knob or fader. Press the ' + c.label + '.'); return; }
    // Anything else on that message now needs checking again.
    MAP.controls.forEach(function (x) {
      var cx = control(x.id);
      if (x.id !== c.id && cx.msg && cx.msg[0] === o.msg[0] && cx.msg[1] === o.msg[1]) { overrides[x.id] = { msg: null, lsb: null }; delete verified[x.id]; toast(cx.label + ' was using that message; check it again.'); }
    });
    overrides[c.id] = o; verified[c.id] = true;
    save('overrides', overrides); save('verified', verified);
    dec.setOverrides(overrides);
    var done = learning; learning = null;
    toast(c.label + ' saved: ' + BM.describe(bytes).replace(/ · value.*/, ''));
    if (screen === 'test') { drawLearn(); drawChecklist(); hit({ id: done }); }
  }

  // ---------- keyboard fallback ----------
  var keyFor = {};
  Object.keys(MAP.keys).forEach(function (a) { keyFor[MAP.keys[a].toLowerCase()] = a; });
  document.addEventListener('keydown', function (ev) {
    if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
    if (ev.key === 'Escape' && learning) { learning = null; drawLearn(); return; }
    var action = keyFor[ev.key.toLowerCase()]; if (!action) return;
    ev.preventDefault();
    var id = action.replace(/[+-]$/, ''), dir = /\+$/.test(action) ? 1 : /-$/.test(action) ? -1 : 0, c = control(id) || {};
    if (screen !== 'test' && window.BoothPlay) { if (!ev.repeat || dir) BoothPlay.key(id, dir, values[id], ev.timeStamp); return; }
    if (dir && (c.kind === 'fader' || c.kind === 'knob' || c.kind === 'center')) values[id] = Math.max(0, Math.min(1, (values[id] === undefined ? (c.kind === 'center' ? .5 : 0) : values[id]) + dir * .05));
    if (/nudge/.test(id)) { id = id.replace('nudge', 'jogEdge'); spins[id] = (spins[id] || 0) + dir * 8; }
    addLog([0, 0, 0].slice(0, 0), { id: id });
    log[0].hex = 'KEY'; log[0].desc = 'Keyboard: ' + ev.key + ' · ' + action;
    if (screen === 'test') { drawLog(); hit({ id: id }); }
  });

  // ---------- routing ----------
  var SCREENS = { menu: drawMenu, test: drawTest }, NAV = [['menu', 'Menu'], ['lessons', 'Tutorials'], ['academy', 'Academy'], ['free', 'Free mix'], ['library', 'Library'], ['stats', 'Stats'], ['test', 'Controller test'], ['settings', 'Sound settings']];
  var shell = { conn: conn, dec: dec, map: MAP, values: values, toast: toast, el: el, esc: esc, load: load, save: save, screen: function () { return screen; },
    diagram: function () { return '<svg class="diagram mini" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Inpulse 500: the control to use is highlighted">' + deckSvg('A', 20) + mixerSvg() + deckSvg('B', 860) + '</svg>'; } };
  [window.BoothPlay, window.BoothGame, window.BoothAcademy].forEach(function (mod) {
    if (!mod) return;
    mod.init(shell);
    Object.keys(mod.screens).forEach(function (k) { SCREENS[k] = mod.screens[k]; });
  });
  function go() {
    var h = (location.hash || '#menu').slice(1), parts = h.split('/');
    screen = SCREENS[parts[0]] ? parts[0] : 'menu';
    if (window.BoothPlay) BoothPlay.leave(screen);
    if (window.BoothGame) BoothGame.leave(screen);
    if (window.BoothAcademy) BoothAcademy.leave(screen);
    el('bnav').innerHTML = NAV.filter(function (x) { return SCREENS[x[0]]; }).map(function (x) { return '<a href="#' + x[0] + '"' + (screen === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('') + '<a href="index.html#play">Back to Nudge</a>';
    SCREENS[screen](parts.slice(1));
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', go);

  // ---------- menu ----------
  function drawMenu() {
    var n = MAP.controls.filter(required).length, v = MAP.controls.filter(function (c) { return required(c) && verified[c.id]; }).length;
    var modes = [
      ['test', 'Controller test', 'Check every knob, fader, button and light on your Inpulse 500.', v + ' of ' + n + ' checked', v >= n],
      ['lessons', 'Tutorials', 'Step by step, with the exact control lit up: loops, EQs, beatmatching and every transition.', 'Start here', true],
      ['drills', 'Transition drills', 'Pick one technique and repeat it: bass swap, EQ blend, filter fade, volume fade, 32-bar blend, quick cut.', 'Practice'],
      ['academy', 'Advanced Academy', 'Loops, filters, fast EQ, FX exits, hot cues, tempo and key, beatmatching by ear. Explain, demo, practice, test.', 'Level up', true],
      ['beatmatch', 'Manual beatmatching', 'Sync off. The incoming track starts at a random tempo and phase. Match it by hand.', 'Core skill', true],
      ['ghost', 'Ghost line', 'Follow the target fader and EQ curves as they scroll with the music.', 'Rhythm game'],
      ['set', 'Set mode', 'Pick 3 or 4 tracks in order and get scored on the whole run.', 'Perform'],
      ['free', 'Free mix', 'No scoring, just play.', 'Play'],
      ['daily', 'Daily challenge', 'Same challenge for you and Yaz today, head to head in Nudge.', 'Today'],
      ['stats', 'Stats', 'Practice time, transitions, average scores, streak and beatmatching over time.', 'Progress'],
      ['recordings', 'Recordings', 'Mixes you recorded. Play them back or download them.', 'Listen'],
      ['library', 'Library', 'BPM, Camelot key, waveforms, genres, what mixes with what. Fix beat grids.', 'Tracks']
    ];
    el('screen').innerHTML = '<h1>Afterhours: Booth</h1><p class="sub">Learn transitions and manual beatmatching on your Hercules DJControl Inpulse 500.</p>' +
      '<div class="modes">' + modes.map(function (m) {
        return '<button type="button" class="mode' + (m[4] ? ' star' : '') + '"' + (m[0] ? ' data-go="' + m[0] + '"' : ' disabled') + '><span class="tag' + (m[4] ? ' ok' : '') + '">' + m[3] + '</span><b>' + m[1] + '</b><span class="small muted">' + m[2] + '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  // ---------- controller test ----------
  var W = 1400, H = 650;
  function knob(id, x, y, r, label) { return '<g class="c" data-id="' + id + '" transform="translate(' + x + ' ' + y + ')"><circle class="shape" r="' + r + '"/><line class="ind" x1="0" y1="0" x2="0" y2="' + (-r + 4) + '"/><text y="' + (r + 13) + '" text-anchor="middle">' + label + '</text></g>'; }
  function button(id, x, y, w, h, label, rx) { return '<g class="c" data-id="' + id + '" transform="translate(' + x + ' ' + y + ')"><rect class="shape" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + (rx === undefined ? 7 : rx) + '"/><text y="4" text-anchor="middle">' + label + '</text></g>'; }
  function vfader(id, x, y1, y2, label) { return '<g class="c" data-id="' + id + '" data-vf="' + y1 + ',' + y2 + '" transform="translate(' + x + ' 0)"><rect class="shape" x="-5" y="' + y1 + '" width="10" height="' + (y2 - y1) + '" rx="5"/><rect class="cap" x="-17" y="' + ((/pitch/.test(id) ? (y1 + y2) / 2 : y2) - 9) + '" width="34" height="18" rx="4"/><text y="' + (y2 + 22) + '" text-anchor="middle">' + label + '</text></g>'; }
  function hfader(id, x1, x2, y, label) { return '<g class="c" data-id="' + id + '" data-hf="' + x1 + ',' + x2 + '"><rect class="shape" x="' + x1 + '" y="' + (y - 5) + '" width="' + (x2 - x1) + '" height="10" rx="5"/><rect class="cap" x="' + ((x1 + x2) / 2 - 9) + '" y="' + (y - 16) + '" width="18" height="32" rx="4"/><text x="' + ((x1 + x2) / 2) + '" y="' + (y + 32) + '" text-anchor="middle">' + label + '</text></g>'; }
  function tri(cls, x, y, dir) { var p = dir === 'up' ? '0,-7 7,6 -7,6' : dir === 'down' ? '0,7 7,-6 -7,-6' : dir === 'left' ? '-7,0 6,-7 6,7' : '7,0 -6,-7 -6,7'; return '<polygon class="glight" data-glight="' + cls + '" transform="translate(' + x + ' ' + y + ')" points="' + p + '"/>'; }
  function deckSvg(d, x0) {
    var A = d === 'A', jx = x0 + (A ? 300 : 220), px = x0 + (A ? 40 : 480), tx = x0 + (A ? 70 : 450), padX = x0 + (A ? 150 : 40);
    var s = '<g class="deck' + d + '"><text class="big" x="' + (x0 + 260) + '" y="28" text-anchor="middle">DECK ' + d + '</text>';
    // top row: loop section and modes
    s += knob(d + '.loopKnob', x0 + (A ? 120 : 400), 70, 17, 'LOOP');
    s += button(d + '.loopIn', x0 + (A ? 175 : 345), 70, 50, 26, 'IN') + button(d + '.loopOut', x0 + (A ? 230 : 290), 70, 50, 26, 'OUT');
    s += button(d + '.vinyl', x0 + (A ? 330 : 190), 60, 54, 22, 'VINYL') + button(d + '.slip', x0 + (A ? 390 : 130), 60, 50, 22, 'SLIP') + button(d + '.quant', x0 + (A ? 445 : 75), 60, 40, 22, 'Q');
    // pitch fader + Beatmatch Guide tempo arrows
    s += vfader(d + '.pitch', px, 120, 380, 'PITCH');
    s += tri(d + '.tempoUp', px, 92, 'up') + '<circle class="glight" data-glight="' + d + '.tempoOk" cx="' + px + '" cy="72" r="5"/>' + tri(d + '.tempoDown', px, 52, 'down');
    // jog wheel: outer edge ring and touch top; phase arrows above
    s += '<g class="c" data-id="' + d + '.jogEdge" transform="translate(' + jx + ' 245)"><circle class="shape" r="130"/><line class="ind spin" x1="0" y1="-118" x2="0" y2="-130"/></g>';
    s += '<g class="c" data-id="' + d + '.jogTop" data-also="' + d + '.jogTouch" transform="translate(' + jx + ' 245)"><circle class="shape" r="96"/><line class="ind spin" x1="0" y1="-50" x2="0" y2="-92"/><text y="5" text-anchor="middle">JOG</text></g>';
    s += tri(d + '.phaseLeft', jx - 26, 102, 'left') + '<circle class="glight" data-glight="' + d + '.phaseOk" cx="' + jx + '" cy="102" r="5"/>' + tri(d + '.phaseRight', jx + 26, 102, 'right');
    // transport
    s += button(d + '.shift', tx, 420, 64, 30, 'SHIFT') + button(d + '.sync', tx, 462, 64, 30, 'SYNC') + button(d + '.cue', tx, 504, 64, 30, 'CUE') + button(d + '.play', tx, 546, 64, 30, 'PLAY ▶');
    // pad modes and pads
    for (var i = 0; i < 4; i++) s += button(d + '.mode' + (i + 1), padX + 45 + i * 90, 418, 78, 22, MAP.padModes[i].toUpperCase(), 11);
    for (var p = 0; p < 8; p++) s += '<g class="c pad" data-id="' + d + '.pad.hotcue.' + (p + 1) + '" data-pad="' + d + '.' + (p + 1) + '" transform="translate(' + (padX + 45 + (p % 4) * 90) + ' ' + (p < 4 ? 470 : 540) + ')"><rect class="shape" x="-38" y="-28" width="76" height="56" rx="8"/><text y="4" text-anchor="middle">PAD ' + (p + 1) + '</text></g>';
    return s + '</g>';
  }
  function mixerSvg() {
    var s = '<g class="mixer"><text class="big" x="700" y="28" text-anchor="middle">MIXER</text>';
    s += button('A.load', 640, 62, 50, 24, 'LOAD A') + knob('browse', 700, 62, 18, 'BROWSE') + button('B.load', 760, 62, 50, 24, 'LOAD B');
    s += knob('master', 640, 118, 12, 'MASTER') + knob('cueMix', 700, 118, 12, 'CUE MIX') + knob('headphone', 760, 118, 12, 'PHONES');
    [['A', 640], ['B', 760]].forEach(function (c) {
      var d = c[0], x = c[1];
      s += knob(d + '.trim', x, 172, 15, 'TRIM') + knob(d + '.eqHigh', x, 224, 15, 'HIGH') + knob(d + '.eqMid', x, 276, 15, 'MID') + knob(d + '.eqLow', x, 328, 15, 'LOW') + knob(d + '.filter', x, 384, 17, 'FILTER');
      s += button(d + '.pfl', x, 432, 46, 22, '🎧 CUE') + vfader(d + '.volume', x, 458, 570, 'VOLUME ' + d);
    });
    s += hfader('xfader', 630, 770, 610, 'CROSSFADER');
    s += '<g class="c" data-id="browsePush" transform="translate(700 62)"><circle class="shape" r="7" style="opacity:.6"/></g>';
    return s + '</g>';
  }
  function testHtml() {
    return '<div class="ctl-head"><div class="grow"><h1>Controller test</h1><p class="sub" style="margin:0">Move every control on your Inpulse 500 once. Each one lights up here, shows its raw MIDI message and ticks off. If one doesn\'t respond, press <b>Fix</b> next to it in the list.</p></div>' +
      '<div class="progress"><div class="row"><b id="prog" class="grow"></b><button type="button" class="bbtn sm ghost" data-act="resetChecks">Clear ticks</button></div><div class="bar"><i id="progBar"></i></div></div></div>' +
      '<div id="testAlert"></div><div id="learnSlot"></div>' +
      '<svg class="diagram" id="diagram" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Hercules DJControl Inpulse 500">' + deckSvg('A', 20) + mixerSvg() + deckSvg('B', 860) + '</svg>' +
      '<div class="ctl-grid"><div style="display:grid;gap:16px">' +
      '<section class="panel"><div class="row"><h3 class="grow">Live MIDI messages</h3><button type="button" class="bbtn sm ghost" data-act="dump">Ask the controller for every knob and fader position</button></div><div class="log mono" id="log"></div></section>' +
      '<section class="panel leds"><div class="row"><h3 class="grow">Lights check</h3><button type="button" class="bbtn sm" data-act="allOn">Turn every light on</button><button type="button" class="bbtn sm ghost" data-act="allOff">Turn every light off</button></div><p class="small muted" style="margin:0 0 8px">Press <b>Flash</b>, look at the controller, then tell me whether the right light came on.</p><div id="ledList"></div></section>' +
      '<details class="panel"><summary>Keyboard and mouse fallback</summary><p class="small muted">No controller? These keys do the same jobs (they also light up the diagram, so you can test them here).</p><div class="keys" id="keys"></div></details>' +
      '<section class="panel"><h3>Your mapping file</h3><p class="small muted" style="margin:0 0 10px">Every fix you make is saved on this computer, on top of booth-map.js. Download it and send it to Claude to make it the default.</p><div class="row" style="flex-wrap:wrap"><button type="button" class="bbtn primary" data-act="export">Download mapping file</button><button type="button" class="bbtn" data-act="copy">Copy mapping to clipboard</button><button type="button" class="bbtn ghost" data-act="resetFixes">Undo all my fixes</button></div></section>' +
      '</div><section class="panel"><h3>Checklist</h3><div class="checklist" id="checklist"></div></section></div>';
  }
  function drawTest() {
    el('screen').innerHTML = testHtml() + (window.BoothAcademy ? BoothAcademy.padCheckHtml() : '');
    drawTestAlert(); drawChecklist(); drawLog(); drawLeds(); drawLearn();
    el('keys').innerHTML = Object.keys(MAP.keys).map(function (a) { var c = control(a.replace(/[+-]$/, '').replace('nudge', 'jogEdge')); return '<div><kbd>' + esc(MAP.keys[a]) + '</kbd> ' + esc((c ? c.label : a) + (/\+$/.test(a) ? (/nudge/.test(a) ? ' nudge forward' : ' up') : /-$/.test(a) ? (/nudge/.test(a) ? ' nudge back' : ' down') : '')) + '</div>'; }).join('');
    MAP.controls.forEach(function (c) { if (values[c.id] !== undefined || spins[c.id]) paint(c.id); });
    paintChecks();
  }
  function drawTestAlert() {
    var s = conn.status, a = el('testAlert'); if (!a) return;
    a.innerHTML = s.state === 'ready' ? '' :
      s.state === 'idle' ? '<div class="alert">Plug in the Inpulse 500 by USB, then press <b>Connect controller</b> at the top right. Chrome will ask to use MIDI devices: press Allow.</div>' :
      s.state === 'connecting' ? '' : '<div class="alert"><b>' + esc(s.message) + '</b>' + (s.state === 'missing' || s.state === 'busy' ? '<br><span class="small">Windows only lets one app use the controller at a time. Then press Try again.</span>' : '') + '</div>';
  }
  function drawLearn() {
    var l = el('learnSlot'); if (!l) return;
    l.innerHTML = learning ? '<div class="learnbar"><span class="grow">Waiting for you to ' + (control(learning).kind === 'button' ? 'press' : 'move') + ' <u>' + esc(control(learning).label) + '</u>…</span><button type="button" class="bbtn sm" data-act="cancelLearn">Cancel</button></div>' : '';
    document.querySelectorAll('#diagram .c').forEach(function (g) { g.classList.toggle('focus', g.getAttribute('data-id') === learning); });
  }
  var GROUPS = [['mixer', 'Mixer'], ['deck', 'Decks'], ['pads', 'Pads and pad modes']];
  function drawChecklist() {
    var box = el('checklist'); if (!box) return;
    var h = '';
    GROUPS.forEach(function (g) {
      h += '<div class="grp">' + g[1] + '</div>';
      MAP.controls.filter(function (c) { return c.part === g[0] && (required(c) || c.kind === 'analog'); }).forEach(function (c0) {
        var c = control(c0.id), ok = verified[c.id], an = c.kind === 'analog';
        h += '<div class="it' + (ok ? ' ok' : '') + (an ? ' analog' : '') + '" data-row="' + c.id + '"><span class="st">' + (ok ? '✓' : '') + '</span><span class="grow">' + esc(c.label) + (an ? ' <span class="tiny muted">· on the hardware only, no MIDI</span>' : !c.msg ? ' <span class="tag warn">not mapped</span>' : '') + '</span><span class="val mono" data-val="' + c.id + '"></span>' +
          (an ? '' : '<button type="button" class="bbtn sm ghost" data-learn="' + c.id + '" aria-label="Fix ' + esc(c.label) + '">Fix</button>') + '</div>';
      });
    });
    var extra = MAP.controls.filter(function (c) { return c.bank && c.bank !== 'hotcue'; }), seen = extra.filter(function (c) { return verified[c.id]; }).length;
    h += '<div class="grp">Other pad modes (optional)</div><p class="small muted" style="margin:0">' + seen + ' of ' + extra.length + ' pad buttons seen in Roll, Slicer, Sampler, Toneplay, Slicer loop, FX and Beatmatch modes. Not needed for Booth.</p>';
    box.innerHTML = h;
    paintChecks();
    MAP.controls.forEach(function (c) { showVal(c.id); });
  }
  function paintChecks() {
    var all = MAP.controls.filter(required), n = all.filter(function (c) { return verified[c.id]; }).length;
    if (el('prog')) { el('prog').textContent = n + ' of ' + all.length + ' controls checked'; el('progBar').style.width = (n / all.length * 100) + '%'; }
    document.querySelectorAll('#diagram .c').forEach(function (g) { var id = g.getAttribute('data-id'), c = control(id); g.classList.toggle('ok', !!verified[id]); g.classList.toggle('analog', !!(c && c.kind === 'analog')); });
  }
  function showVal(id) {
    var v = document.querySelector('[data-val="' + id + '"]'); if (!v) return;
    var c = control(id); if (!c) return;
    v.textContent = c.kind === 'relative' ? (spins[id] ? (spins[id] > 0 ? '+' : '') + spins[id] : '') : c.kind === 'button' ? (values[id] ? 'down' : '') : values[id] === undefined ? '' : c.kind === 'center' ? (values[id] < .5 ? '◀ ' : values[id] > .5 ? '▶ ' : '') + Math.round(Math.abs(values[id] - .5) * 200) + '%' : Math.round(values[id] * 100) + '%';
  }
  function drawLog() {
    var l = el('log'); if (!l) return;
    l.innerHTML = log.length ? log.map(function (x) { var c = x.id && control(x.id); return '<div><span class="hx">' + esc(x.hex) + '</span><span class="grow">' + (c ? '<span class="nm">' + esc(c.label) + '</span>' : x.hex === 'KEY' ? '' : '<span class="unk">Not in the map</span>') + '<br><span class="muted">' + esc(x.desc) + '</span></span></div>'; }).join('') : '<p class="muted">Nothing yet. Move a knob or press a button on the controller.</p>';
  }
  var hitT = {};
  function hit(e) {
    if (!e || !e.id) return;
    var id = e.id, c = control(id) || {};
    var sel = c.pad ? '[data-pad="' + c.deck + '.' + c.pad + '"]' : '[data-id="' + id + '"], [data-also="' + id + '"]';
    document.querySelectorAll('#diagram ' + sel).forEach(function (g) {
      g.classList.add('hit'); clearTimeout(hitT[id]);
      hitT[id] = setTimeout(function () { g.classList.remove('hit'); }, 450);
    });
    paint(id); showVal(id); paintChecks();
    var row = document.querySelector('[data-row="' + id + '"]'); if (row) row.classList.toggle('ok', !!verified[id]);
  }
  function paint(id) {
    var g = document.querySelector('#diagram [data-id="' + id + '"]'); if (!g) return;
    var c = control(id), v = values[id];
    if (c.kind === 'relative') { var a = (spins[id] || 0) * (/jog/.test(id) ? 0.5 : 15); g.querySelectorAll('.spin, .ind').forEach(function (l) { l.setAttribute('transform', 'rotate(' + a + ')'); }); return; }
    if (v === undefined) return;
    if (c.kind === 'knob' || c.kind === 'center') { var ind = g.querySelector('.ind'); if (ind) ind.setAttribute('transform', 'rotate(' + (-135 + v * 270) + ')'); }
    var vf = g.getAttribute('data-vf'), hf = g.getAttribute('data-hf');
    if (vf) { var y = vf.split(',').map(Number), cap = g.querySelector('.cap'); cap.setAttribute('y', y[1] - (y[1] - y[0]) * (id.indexOf('pitch') !== -1 ? 1 - v : v) - 9); }
    if (hf) { var x = hf.split(',').map(Number), cp = g.querySelector('.cap'); cp.setAttribute('x', x[0] + (x[1] - x[0]) * v - 9); }
  }

  // ---------- lights ----------
  function ledItems() {
    var out = [];
    ['A', 'B'].forEach(function (d) {
      ['play', 'cue', 'sync', 'pfl'].forEach(function (n) { var c = control(d + '.' + n); out.push({ id: c.id, label: c.label, bytes: c.led }); });
      var G = MAP.lights.guide[d];
      [['tempoUp', 'Beatmatch Guide: tempo arrow (top, pointing up)'], ['tempoDown', 'Beatmatch Guide: tempo arrow (pointing down)'], ['tempoOk', 'Beatmatch Guide: tempo matched light'], ['phaseLeft', 'Beatmatch Guide: phase arrow pointing left'], ['phaseRight', 'Beatmatch Guide: phase arrow pointing right'], ['phaseOk', 'Beatmatch Guide: phase matched light']].forEach(function (x) {
        out.push({ id: 'guide.' + d + '.' + x[0], label: 'Deck ' + d + ' ' + x[1], bytes: G[x[0]], glight: d + '.' + x[0] });
      });
      out.push({ id: 'pads.' + d, label: 'Deck ' + d + ' pads in colour (hot cue mode)', pads: d });
    });
    return out;
  }
  function drawLeds() {
    var box = el('ledList'); if (!box) return;
    box.innerHTML = (conn.output ? '' : '<p class="small muted">Connect the controller to test its lights.</p>') + ledItems().map(function (x) {
      var st = ledOk[x.id];
      return '<div class="it"><span class="grow">' + esc(x.label) + (x.bytes ? ' <span class="tiny muted mono">' + BM.hex(x.bytes) + '</span>' : '') + '</span>' + (st ? '<span class="tag ' + (st === 'ok' ? 'ok' : 'bad') + '">' + (st === 'ok' ? 'Works' : 'Wrong') + '</span>' : '') +
        '<button type="button" class="bbtn sm" data-flash="' + x.id + '"' + (conn.output ? '' : ' disabled') + '>Flash</button><button type="button" class="bbtn sm ghost" data-ledok="' + x.id + '">Right light</button><button type="button" class="bbtn sm ghost" data-ledno="' + x.id + '">Wrong or none</button></div>';
    }).join('');
  }
  var RAINBOW = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'pink'];
  function flash(item, on) {
    var C = MAP.lights.colours;
    if (item.pads) { for (var p = 0; p < 8; p++) conn.send([MAP.decks[item.pads].pads, MAP.padBanks[0].base + p, on ? C[RAINBOW[p]] : 0]); }
    else conn.send([item.bytes[0], item.bytes[1], on ? 0x7F : 0]);
    if (item.glight) { var g = document.querySelector('[data-glight="' + item.glight + '"]'); if (g) g.classList.toggle('on', on); }
  }

  // ---------- clicks ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, [data-id]'); if (!t) return;
    var d = t.dataset;
    if (t.id === 'connect') return conn.connect().then(function () { drawConn(); if (screen === 'test') drawLeds(); });
    if (d.go) { location.hash = d.go; return; }
    if (d.learn) return startLearn(d.learn);
    if (d.id && t.tagName !== 'BUTTON' && screen === 'test') { var c = control(d.id); if (c && c.kind !== 'analog') startLearn(d.id); return; }
    if (d.act === 'cancelLearn') { learning = null; return drawLearn(); }
    if (d.act === 'dump') { conn.requestDump(); return toast(conn.output ? 'Asked. Every knob and fader should report in now.' : 'Connect the controller first.'); }
    if (d.act === 'resetChecks') { if (!confirm('Clear all the ticks and check every control again?')) return; verified = {}; save('verified', verified); return drawTest(); }
    if (d.act === 'resetFixes') { if (!confirm('Undo every fix you made and go back to the standard Inpulse 500 map?')) return; overrides = {}; save('overrides', overrides); dec.setOverrides(overrides); toast('Back to the standard map'); return drawTest(); }
    if (d.act === 'export' || d.act === 'copy') {
      var data = JSON.stringify({ controller: MAP.name, mapVersion: MAP.version, exported: new Date().toISOString(), fixes: overrides, checked: Object.keys(verified).sort(), lights: ledOk }, null, 2);
      if (d.act === 'copy') return navigator.clipboard.writeText(data).then(function () { toast('Mapping copied'); }, function () { toast('Couldn\'t copy. Use Download instead.'); });
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'booth-inpulse500-mapping.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      return toast('Saved booth-inpulse500-mapping.json');
    }
    var items = ledItems();
    if (d.flash) { var it = items.filter(function (x) { return x.id === d.flash; })[0]; flash(it, true); setTimeout(function () { flash(it, false); }, 1500); return; }
    if (d.ledok || d.ledno) { ledOk[d.ledok || d.ledno] = d.ledok ? 'ok' : 'no'; save('leds', ledOk); return drawLeds(); }
    if (d.act === 'allOn' || d.act === 'allOff') { items.forEach(function (x) { flash(x, d.act === 'allOn'); }); return; }
  });

  // Reconnect quietly if Chrome already allowed MIDI before.
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'midi' }).then(function (p) { if (p.state === 'granted') conn.connect(); }, function () {});
  drawConn();
  go();
})();
