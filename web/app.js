/* Nudge: the app. Runs as the installable app (talks to Apps Script over
 * HTTPS) or inside the Google page (google.script.run). Same code for both. */
(function () {
  'use strict';

  // ---------- connection ----------
  var mem = {};
  var CFG = window.LQ_CONFIG || {};
  var MODE = window.google && google.script && google.script.run ? 'gas' : 'web';
  var QS = new URLSearchParams(location.search);
  var KEY = window.LQ_KEY || QS.get('key') || load('key') || '';
  if (KEY) save('key', KEY);
  // A separate copy of the app (its own Sheet) has its own server: its link carries ?api=. A link without one means the main server.
  if (QS.get('key')) { var apiQ = QS.get('api') || ''; save('api', /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(apiQ) ? apiQ : ''); }
  if (load('api')) CFG = Object.assign({}, CFG, { api: load('api') });
  var S = window.LQ_BOOT || load('state-' + KEY.slice(0, 6)) || null;
  var ME = S ? S.who === 'me' : true;
  var offset = S && S.now ? S.now - Date.now() : 0;
  var busy = false, inflight = 0, current = 'home', updateOffered = false;

  function rpc(fn, args) {
    return new Promise(function (resolve, reject) {
      if (MODE === 'gas') {
        var r = google.script.run.withSuccessHandler(resolve).withFailureHandler(function (e) { reject(e instanceof Error ? e : new Error(e && e.message || e)); });
        r[fn].apply(r, [KEY].concat(args || []));
        return;
      }
      fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, key: KEY, args: args || [] }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.ok) resolve(j.result); else reject(new Error(j.error)); })
        .catch(function (e) { reject(e && e.message && !/fetch|network/i.test(e.message) ? e : new Error(navigator.onLine ? 'Couldn\'t reach your Sheet. Try again in a moment.' : 'You\'re offline.')); });
    });
  }
  // Saves run one after another, in the order you tapped. Nothing you tap is thrown away: a second tap
  // on the same thing while it's still saving is ignored (no double deletes), anything else waits its turn.
  var line = Promise.resolve(), saving = {}, nSaving = 0, lastTap = null, gen = 0;
  // a refresh only counts if nothing was changed while it was on its way (or it would bring back what you just deleted)
  function fresh(fn) { var g0 = gen; return function (res) { if (g0 === gen && !busy && !inflight) fn(res); }; }
  document.addEventListener('click', function (ev) { lastTap = ev.target.closest && ev.target.closest('button'); }, { capture: true });
  // feedback on touch-down, before the tap even finishes: a visible press and a tiny buzz
  document.addEventListener('pointerdown', function (ev) {
    var b = ev.target.closest && ev.target.closest('button, .check'); if (!b || b.disabled) return;
    b.classList.add('pressed'); buzz(8);
    var up = function () { setTimeout(function () { b.classList.remove('pressed'); }, 90); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }, { capture: true, passive: true });
  function send(fn, args) {
    var k = fn + JSON.stringify(args || []);
    if (saving[k]) return null;
    saving[k] = 1; nSaving++; busy = true; gen++;
    var btn = lastTap; if (btn) btn.classList.add('saving');
    var p = line.then(function () { return rpc(fn, args); });
    line = p.catch(function () {});
    var done = function () { delete saving[k]; nSaving--; busy = nSaving > 0; if (btn) btn.classList.remove('saving'); };
    return p.then(function (r) { done(); return r; }, function (e) { done(); throw e; });
  }
  // ---------- the outbox: saves never make you wait ----------
  // Reads, AI and big uploads go straight to the server; every other change is saved on the phone first and sent in batches.
  var DIRECT = { appState: 1, gamesState: 1, workState: 1, setupState: 1, previewChores: 1, healthDay: 1, backupStatus: 1, exportAll: 1, getBrief: 1, whatNow: 1, mealIdeas: 1,
    healthInsight: 1, trainState: 1, foodState: 1, choresState: 1, quickAdd: 1, quickAddPhoto: 1, ask: 1, brainDump: 1, importBackup: 1, importHealth: 1, importWorkoutCsv: 1, registerDevice: 1,
    testPush: 1, saveClaudeKey: 1, backupNow: 1, guessWord: 1, submitTarget: 1, submitRecall: 1, submitTempo: 1, submitSet: 1, undoAction: 1, undoLast: 1, addDeadline: 1, chatPing: 1 };
  var syncState = { pending: 0, failing: 0, offline: false }, syncShownAt = 0;
  var box = window.NudgeOutbox ? NudgeOutbox.create({
    key: 'outbox-' + KEY.slice(0, 6),
    send: function (items) { var t0 = Date.now(); return rpc('batch', [items]).then(function (r) { perfNote('batch×' + items.length, Date.now() - t0); return r; }); },
    onReject: function (it, err) { toast(err || 'That didn\'t save.', true); },
    onState: function (st, more) {
      if (!st || !st.game) return;
      if (more || inflight || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { pendingState = st; return; }
      var hadUndo = S && S.undo; S = st; ME = S.who === 'me'; offset = st.now - Date.now(); save('state-' + KEY.slice(0, 6), S); renderAll(); if (S.chat) startChat();
      if (st.undo && (!hadUndo || hadUndo.id !== st.undo.id) && Date.now() + offset - st.undo.at < 20000) offerUndo(st.undo);
    },
    onStatus: function (st) { syncState = st; drawSync(); }
  }) : null;
  var pendingState = null;
  /** A small pill only when saving takes a while or you're offline (your change is already on screen and on the phone). */
  function drawSync() {
    var p = el('syncPill');
    if (!p) { p = document.createElement('div'); p.id = 'syncPill'; p.className = 'syncpill'; p.setAttribute('role', 'status'); document.body.appendChild(p); }
    var s = syncState, txt = s.offline ? 'Offline: saved on this phone, will sync' : s.pending ? 'Saving…' : '';
    if (s.pending && !syncShownAt) syncShownAt = Date.now();
    if (!s.pending) syncShownAt = 0;
    p.textContent = txt;
    p.classList.toggle('on', !!txt && (s.offline || Date.now() - syncShownAt > 1500));
    if (txt && !s.offline) setTimeout(function () { if (syncState.pending) p.classList.toggle('on', Date.now() - syncShownAt > 1500); }, 1600);
  }
  var perfLog = [];
  function perfNote(what, ms) { perfLog.push([what, ms]); if (perfLog.length > 50) perfLog.shift(); window.NUDGE_PERF = perfLog; }
  /** A change: the screen already shows it; this saves it (outbox), and ok/fail run once the server has answered. */
  function call(fn, args, ok, fail) {
    if (!box || DIRECT[fn]) {
      var p = send(fn, args); if (!p) return;
      p.then(function (res) { ok && ok(res); }, function (err) { fail && fail(); toast(err.message || String(err), true); renderAll(); });
      return;
    }
    var btn = lastTap; if (btn) btn.classList.add('saving');
    var h = box.add(fn, args);
    h.done.then(function (v) {
      if (btn) btn.classList.remove('saving');
      var r = v.result;
      if (r === null || r === undefined || typeof r !== 'object') r = v.state;
      else if (r.stateDeferred) { delete r.stateDeferred; r.state = v.state; }
      ok && ok(r);
    }, function () { if (btn) btn.classList.remove('saving'); fail && fail(); renderAll(); });
  }
  /** Save in the background with no callback (the change is already on screen). */
  function later(fn, args) { if (box && !DIRECT[fn]) box.add(fn, args); else rpc(fn, args).catch(function (e) { toast(e.message, true); }); }

  // ---------- helpers ----------
  function load(k) { try { var v = localStorage.getItem('lq-' + k); return v === null ? null : JSON.parse(v); } catch (e) { return mem[k] === undefined ? null : mem[k]; } }
  function save(k, v) { mem[k] = v; try { localStorage.setItem('lq-' + k, JSON.stringify(v)); } catch (e) {} }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString('en-GB'); }
  function now() { return Date.now() + offset; }
  function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function dayLabel(ymd) {
    if (!ymd) return '';
    var d = new Date(ymd + 'T12:00:00'), t = new Date(now()); t.setHours(12, 0, 0, 0);
    var diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return diff === -1 ? 'Yesterday' : -diff + ' days ago';
    if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function restSecs(t) {
    var s = String(t || '').toLowerCase(), m = s.match(/(\d+):(\d{2})/);
    if (m) return +m[1] * 60 + +m[2];
    var n = parseFloat(s) || 0;
    return /m/.test(s) ? Math.round(n * 60) : /s/.test(s) ? Math.round(n) : (n > 10 ? n : n * 60);
  }
  function names() {
    var n = S.names || {}, f = S.fun || {};
    return { me: f.nick || (n[S.who] && n[S.who] !== 'Your partner' ? n[S.who] : ''), other: f.otherNick || n[S.who === 'me' ? 'partner' : 'me'] || 'Your partner', team: f.team || 'Together' };
  }
  // the Today brief: one per slot (morning, midday, after work, evening) and one more when the day is won
  var briefAsked = '';
  function briefSlotNow() { var d = new Date(now()); return NudgeFmt.briefSlot(d.getHours() * 60 + d.getMinutes()); }
  function maybeBrief() {
    if (!S || !S.hasClaudeKey) return;
    var won = !!(S.game && S.game.win && S.game.win.won), due = NudgeFmt.briefDue(S.brief, briefSlotNow(), won);
    if (!due) return;
    var want = due + ':' + briefSlotNow() + ':' + new Date(now()).toDateString();
    if (briefAsked === want) return;
    briefAsked = want;
    rpc('getBrief', []).then(function (b) { if (b) { S.brief = b; if (current === 'home') renderHome(); } }, function () {});
  }
  setInterval(function () { if (S && current === 'home' && !homeEditing && !document.hidden) { maybeBrief(); var u = document.querySelector('[data-briefago]'); if (u && S.brief && S.brief.ts) u.textContent = NudgeFmt.ago(S.brief.ts, now()); } }, 60000);
  function greeting() { var hr = new Date(now()).getHours(); return hr < 5 ? 'Late one' : hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening'; }

  var ICONS = {
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5', brief: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16', list: 'M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11',
    food: 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.7 1.3-2.5 3.5-2.5 6.5V13H17v8', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    flame: 'M12 3c.5 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.5 1.7-4.5.4 1.2 1 1.8 2 2.3.6-2.3.6-4.8.8-7.3z',
    sparkles: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z',
    check: 'M5 12.5l4.5 4.5L19 7.5', play: 'M8 5.5v13l10.5-6.5z', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6 6 18',
    chevron: 'M9 6l6 6-6 6', back: 'M15 6l-6 6 6 6', bell: 'M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10 20.5a2 2 0 0 0 4 0',
    send: 'M21 3 10 14M21 3l-6.5 18-3.5-8-8-3.5z', calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    drop: 'M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z', scale: 'M5 4h14l1 16H4zM9 9a3 3 0 0 1 6 0M12 9l1.5-2',
    gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10 3 8 3.5 7 7 12 7zM12 7s2-4 4-3.5 1 3.5-4 3.5', cart: 'M3 4h2l2.4 11h11l2-8H6.3M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11', flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    park: 'M7 20V4h6a4 4 0 0 1 0 8H7', heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2', bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
    word: 'M4 7V5h16v2M9 19h6M12 5v14', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    bike: 'M5.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 14.5 9 7h5l4.5 7.5M9 7l3.5 7.5h-7',
    bus: 'M5 4h14v13H5zM5 11h14M8 20v-3M16 20v-3M8 14.5h.01M16 14.5h.01', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', more: 'M5 12h.01M12 12h.01M19 12h.01', download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    pause: 'M8 5v14M16 5v14', music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    disc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 7a5 5 0 0 1 5 5', brush: 'M18 3l3 3-9.5 9.5-3-3zM8.5 12.5c-2 0-3.5 1.5-3.5 3.5 0 1.5-1 2.5-2 3 3 1 7 0 7.5-3.5',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4', car: 'M4 16h16M5.5 16l1.6-5.2A2 2 0 0 1 9 9.4h6a2 2 0 0 1 1.9 1.4L18.5 16M7.5 19.5a1.5 1.5 0 1 0 0-.01M16.5 19.5a1.5 1.5 0 1 0 0-.01M4 16v2.5M20 16v2.5', boat: 'M3 16.5l2 3.5h14l2-3.5zM12 4v12M12 4l6 9h-6', plane: 'M21 15.5l-8-4.5V5a1.5 1.5 0 0 0-3 0v6l-7 4.5V17l7-2v4l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-4l8 2z', building: 'M4 21V8l8-5 8 5v13M9 21v-5h6v5M8 11h.01M12 11h.01M16 11h.01', pulse: 'M3 12h4l2-5 4 10 2-5h6', walk: 'M13 5.5a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M8 12l3-4 4 2 2 3M11 8l-3 1-1 3', bolt: 'M13 3 5 14h6l-1 7 8-11h-6z', wave: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0'
  };
  function icon(n, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[n] || '') + '"/></svg>'; }
  var toastTimer;
  function toast(msg, isErr, action) {
    var t = el('toast');
    t.textContent = msg;
    if (action) { var b = document.createElement('button'); b.type = 'button'; b.className = 'toastbtn'; b.textContent = action.label; b.onclick = function () { t.className = ''; action.fn(); }; t.appendChild(b); }
    t.className = 'show' + (isErr ? ' err' : '') + (action ? ' act' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = isErr ? 'err' : ''; }, isErr ? 6000 : action ? 7000 : 2800);
  }
  // After anything undoable (a chore, a work block, a deadline, food), the message carries an Undo button.
  var undoSeen = '';
  function offerUndo(u, msg) {
    if (!u || u.id === undoSeen) return;
    undoSeen = u.id;
    toast(msg || 'Done: ' + u.label, false, { label: 'Undo', fn: function () {
      rpc('undoAction', []).then(function (res) { apply(res.state); if (S.food && res.state.food) S.food = res.state.food; renderAll(); toast('Undone: ' + res.undone); }, function (e) { toast(e.message, true); });
    } });
  }
  var audio;
  document.addEventListener('pointerdown', function () {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {}
  }, { capture: true });
  function chime(notes) {
    if (!audio || (S && S.fun && S.fun.prefs && S.fun.prefs.sound !== true)) return;   // sounds are opt-in
    (notes || [880]).forEach(function (f, i) {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.14;
      o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.start(t); o.stop(t + 0.3);
    });
  }
  function buzz(p) { if (navigator.vibrate && !(S && S.fun && S.fun.prefs && S.fun.prefs.haptics === false)) navigator.vibrate(p || 25); }
  function confetti(big) {
    if (S && S.fun && S.fun.prefs && (S.fun.prefs.confetti === false || S.fun.prefs.motion === false)) return;
    var c = el('confetti'), x = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    var colors = ['#f3a9c8', '#a891ef', '#fde3ee', '#e5dcff', '#ffe7a8'], ps = [];
    for (var i = 0; i < (big ? 140 : 60); i++) ps.push({ x: c.width / 2, y: c.height * 0.35, vx: (Math.random() - .5) * 13, vy: -Math.random() * 11 - 4, r: 4 + Math.random() * 5, c: colors[i % colors.length], a: Math.random() * 6 });
    var t = 0;
    (function frame() {
      x.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.vy += 0.33; p.x += p.vx; p.y += p.vy; p.a += 0.2; x.fillStyle = p.c; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); x.restore(); });
      if (++t < 85) requestAnimationFrame(frame); else x.clearRect(0, 0, c.width, c.height);
    })();
  }
  function ring(frac, size, stroke) {
    var r = 50 - stroke / 2 - 1, c = 2 * Math.PI * r, id = 'g' + Math.random().toString(36).slice(2, 7);
    return '<svg viewBox="0 0 100 100"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--ring-a)"/><stop offset="1" stop-color="var(--ring-b)"/></linearGradient></defs>' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--raised)" stroke-width="' + stroke + '"/>' +
      '<circle class="arc" cx="50" cy="50" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1) + '"/></svg>';
  }

  // ---------- sheets (bottom panels) ----------
  function openSheet(html) { el('sheet').innerHTML = '<div class="grab"></div>' + html; el('sheetbg').hidden = false; document.body.classList.add('sheetopen'); }
  function closeSheet() { el('sheetbg').hidden = true; el('sheet').innerHTML = ''; document.body.classList.remove('sheetopen'); sheetKind = ''; }
  var sheetKind = '';
  el('sheetbg').addEventListener('click', function (ev) { if (ev.target === el('sheetbg') || ev.target.closest('[data-close]')) closeSheet(); });

  // ---------- state and celebrations ----------
  function celebrate(prev, next) {
    if (!prev || !next || !prev.game || !next.game) return;
    var a = prev.game, b = next.game;
    var wonA = a.win ? a.win.won : a.streak && a.streak.todayDone, wonB = b.win ? b.win.won : b.streak && b.streak.todayDone;
    if (b.team && a.team && !a.team.todayDone && b.team.todayDone) setTimeout(function () { highFive(S.solo ? 'Day won' : 'You both won the day'); }, b.level.level > a.level.level ? 2600 : 900);
    if (b.level.level > a.level.level) {
      confetti(true); chime([660, 880, 1100, 1320]); buzz([60, 40, 60, 40, 120]); levelBurst(b.level.level);
      openSheet('<div class="center" style="padding:10px 0 4px">' + icon('star', 'l') + '<h2 style="margin:8px 0 4px">Level ' + b.level.level + '</h2><p class="muted">' + fmt(b.total) + ' XP so far. Nicely done.</p><button class="btn primary wide" type="button" data-close>Continue</button></div>');
    } else if (wonB && !wonA) {
      confetti(true); chime([660, 880, 1100]); buzz([50, 40, 120]);
      minBurst(b.streak.count);
    } else if (b.xpToday > a.xpToday) {
      confetti(false); chime([880, 1175]); buzz(25);
    }
  }
  // big moments: a full-screen burst that fades by itself and never blocks a tap
  function overlay(cls, html, ms) {
    var o = document.createElement('div'); o.className = 'burst ' + cls; o.innerHTML = html; o.setAttribute('role', 'status');
    var done = function () { if (o.parentNode) { o.classList.add('out'); setTimeout(function () { o.remove(); }, 300); } };
    document.body.appendChild(o); setTimeout(done, ms || 2400);
  }
  function minBurst(count) {
    overlay('minhit', '<div class="burst-in">' + flame(count, 56) + '<h2>Day won</h2><p>Streak ' + count + ' day' + (count === 1 ? '' : 's') + '</p></div>', 2000);
  }
  function levelBurst(level) {
    if (reducedMotion()) return;
    overlay('lvl', '<div class="rays"></div><div class="burst-in"><div class="lvl-n">' + level + '</div><h2>Level up</h2>' + (S.fun && S.fun.era ? '<p>' + esc(S.fun.era) + '</p>' : '') + '</div>', 2600);
  }
  function highFive(text) {
    buzz([30, 60, 90]);
    overlay('hi5', '<div class="burst-in"><div class="hands"><span class="hand l">' + avatarOf('me', 64) + '</span><span class="clap"><svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><path d="M20 2l4 11 11-4-7 9 9 6-11 1 1 11-7-8-7 8 1-11-11-1 9-6-7-9 11 4z" fill="#ffd36b"/></svg></span><span class="hand r">' + avatarOf('partner', 64) + '</span></div><h2>High five</h2><p>' + esc(text || '') + '</p></div>', 2200);
  }
  function apply(res, msg) {
    var prev = S;
    S = res; ME = S.who === 'me';
    if (S.chat) startChat();
    offset = res.now - Date.now();
    save('state-' + KEY.slice(0, 6), S);
    celebrate(prev, S);
    renderAll();
    if (msg) toast(msg);
    if (S.undo && prev && (!prev.undo || prev.undo.id !== S.undo.id) && Date.now() + offset - S.undo.at < 20000) offerUndo(S.undo, msg);
  }
  // Quick taps: update the screen now, save in the background, undo if it fails.
  function quick(change, fn, args, msg) {
    var t0 = performance.now();
    change();
    renderAll();
    perfNote('screen:' + fn, Math.round(performance.now() - t0));
    if (msg) toast(msg);
    gen++;
    save('state-' + KEY.slice(0, 6), S);      // the change survives closing the app before it syncs
    later(fn, args);
  }
  if (window.NudgeSetup) NudgeSetup.init({
    S: function () { return S; }, esc: esc, rpc: rpc, send: send, call: call, toast: toast, names: names, now: now, showTab: showTab,
    apply: function (res, msg) { if (res && res.game) apply(res, msg); else if (msg) toast(msg); },
    applyQuiet: function (res) { if (res && res.game && !inflight && nSaving <= 1) { S = res; save('state-' + KEY.slice(0, 6), S); renderAll(); } },
    openSheet: function (h, kind) { openSheet(h); sheetKind = kind || ''; }, closeSheet: function () { closeSheet(); },
    chars: function () { return CHARS; }, avatar: function (id, size) { return avatar(id, size); }, setChar: function (id) { savePrefs({ char: id }); },
    renderChores: function () { renderChores(); }
  });
  function addXpLocal(xp, job) {
    var prev = JSON.parse(JSON.stringify(S));
    S.game.xpToday += xp; S.game.total += xp;
    var into = S.game.level.into + xp;
    if (into >= S.game.level.need) S.game.level = { level: S.game.level.level + 1, into: into - S.game.level.need, need: S.game.level.need + 100 };
    else S.game.level.into = into;
    var w = S.game.win;
    if (w) NudgeFmt.winStep(w, { xp: xp, job: !!job });            // Win the day moves on screen straight away
    pulseLive();
    if (w ? w.won && !(prev.game.win && prev.game.win.won) : prev.game.xpToday < prev.game.goal && S.game.xpToday >= S.game.goal) { S.game.streak.count += 1; S.game.streak.todayDone = true; if (w && w.both) { S.game.team.todayDone = true; S.game.team.count += 1; } }
    celebrate(prev, S);
  }

  // ---------- HOME ----------
  function questRow(q, opts) {
    opts = opts || {};
    var meta = q.doneToday ? ['Done' + (q.doneBy ? ' by ' + (q.doneBy === S.who ? 'you' : names().other) : '')] : [q.minutes + ' min', q.xp + ' XP'];
    if (!q.doneToday && q.overdue > 0) meta.push(q.overdue <= 6 ? 'carried over from ' + new Date(now() - q.overdue * 864e5).toLocaleDateString('en-GB', { weekday: 'short' }) : 'been a little while');   // no guilt, just a note
    var theirs = q.who !== 'anyone' && q.who !== 'together' && q.who !== S.who;
    var togTag = q.who === 'together' && !q.doneToday && !S.solo ? ' <span class="tag tog">Together · 2× XP</span>' : '';
    if (theirs && !q.doneToday) meta.unshift(names().other + '\'s, cover for bonus XP');
    var claim = '';
    if (!q.doneToday && opts.claim) {
      if (q.claimedBy === S.who) claim = '<button class="btn blush sm" type="button" data-claim="' + esc(q.name) + '">Mine</button>';
      else if (q.claimedBy) claim = '<span class="chip pink">' + esc(names().other) + '</span>';
      else claim = '<button class="iconbtn" type="button" data-claim="' + esc(q.name) + '" aria-label="Claim">' + icon('flag', 's') + '</button>';
    }
    return '<div class="item' + (q.doneToday ? ' done' : '') + (q.who === 'together' ? ' tog' : '') + '"><button class="check" type="button" ' + (q.who === 'together' ? 'data-qtog' : 'data-qdone') + '="' + esc(q.name) + '"' + (q.doneToday ? ' disabled' : '') + ' aria-label="Mark done">' + icon('check') + '</button>' +
      '<div class="grow"><div class="t">' + esc(q.name) + togTag + '</div><div class="m">' + esc(meta.join(' · ')) + '</div></div>' +
      (!q.doneToday ? '<div class="row" style="gap:6px">' + claim + '<button class="iconbtn soft" type="button" data-qstart="' + esc(q.name) + '" aria-label="Start a timer">' + icon('play', 's') + '</button></div>' : '') + '</div>';
  }

  // ---------- the shared pet and the streak flame ----------
  var PET_ORDER = ['egg', 'baby', 'kid', 'teen', 'adult', 'legend', 'mythic'];
  function petSvg(pet, size) {
    var st = PET_ORDER.indexOf(pet.stage), sleepy = pet.mood === 'sleepy', happy = pet.mood === 'happy', g = 'pg' + size;
    var defs = '<defs><radialGradient id="' + g + '" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd0ea"/><stop offset=".55" stop-color="var(--pink, #ff5fb2)"/><stop offset="1" stop-color="var(--lilac, #8f6bff)"/></radialGradient></defs>';
    var body;
    if (st <= 0) {
      body = '<ellipse cx="50" cy="58" rx="24" ry="30" fill="url(#' + g + ')"/><circle cx="42" cy="50" r="4" fill="#fff" opacity=".5"/><circle cx="58" cy="66" r="5" fill="#fff" opacity=".35"/><circle cx="55" cy="42" r="3" fill="#fff" opacity=".4"/>';
    } else {
      var k = [0, .62, .74, .84, .94, 1, 1][st], rx = 30 * k, ry = 26 * k, cy = 88 - ry;
      var eyeY = cy - ry * .15, ex = rx * .38;
      var eyes = sleepy ? '<path d="M' + (50 - ex - 5) + ' ' + eyeY + 'q5 4 10 0M' + (50 + ex - 5) + ' ' + eyeY + 'q5 4 10 0" stroke="#2a1035" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
        : happy ? '<path d="M' + (50 - ex - 5) + ' ' + (eyeY + 2) + 'q5 -6 10 0M' + (50 + ex - 5) + ' ' + (eyeY + 2) + 'q5 -6 10 0" stroke="#2a1035" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
        : '<circle cx="' + (50 - ex) + '" cy="' + eyeY + '" r="4.2" fill="#2a1035"/><circle cx="' + (50 + ex) + '" cy="' + eyeY + '" r="4.2" fill="#2a1035"/><circle cx="' + (51 - ex) + '" cy="' + (eyeY - 1.5) + '" r="1.4" fill="#fff"/><circle cx="' + (51 + ex) + '" cy="' + (eyeY - 1.5) + '" r="1.4" fill="#fff"/>';
      var mouth = happy ? '<path d="M45 ' + (eyeY + 9) + 'q5 6 10 0" fill="#2a1035"/>' : sleepy ? '<ellipse cx="50" cy="' + (eyeY + 10) + '" rx="2.4" ry="1.6" fill="#2a1035"/>' : '<path d="M46 ' + (eyeY + 9) + 'q4 3 8 0" stroke="#2a1035" stroke-width="2" fill="none" stroke-linecap="round"/>';
      var ears = st >= 3 ? '<path d="M' + (50 - rx * .7) + ' ' + (cy - ry * .7) + 'l-6 -16 14 8zM' + (50 + rx * .7) + ' ' + (cy - ry * .7) + 'l6 -16 -14 8z" fill="url(#' + g + ')"/>' : '';
      var crown = st >= 5 ? '<path d="M38 ' + (cy - ry - 2) + 'l4 -12 8 8 8 -8 4 12z" fill="#ffd36b" stroke="#c79a2a" stroke-width="1"/>' : '';
      var aura = st >= 6 ? '<circle cx="50" cy="' + cy + '" r="' + (rx + 12) + '" fill="none" stroke="#ffd36b" stroke-width="1.5" opacity=".6" stroke-dasharray="3 5"/>' : '';
      var feet = '<ellipse cx="' + (50 - rx * .45) + '" cy="89" rx="6" ry="3" fill="var(--lilac, #8f6bff)"/><ellipse cx="' + (50 + rx * .45) + '" cy="89" rx="6" ry="3" fill="var(--lilac, #8f6bff)"/>';
      var blush = happy ? '<ellipse cx="' + (50 - ex - 6) + '" cy="' + (eyeY + 7) + '" rx="4" ry="2.4" fill="#ff7cc2" opacity=".6"/><ellipse cx="' + (50 + ex + 6) + '" cy="' + (eyeY + 7) + '" rx="4" ry="2.4" fill="#ff7cc2" opacity=".6"/>' : '';
      body = aura + ears + feet + '<ellipse cx="50" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + g + ')"/><ellipse cx="' + (50 - rx * .35) + '" cy="' + (cy - ry * .5) + '" rx="' + rx * .25 + '" ry="' + ry * .15 + '" fill="#fff" opacity=".35"/>' + eyes + blush + mouth + crown;
    }
    var zz = sleepy ? '<g class="pet-z" fill="var(--muted)" font-size="11" font-weight="700"><text x="72" y="30">z</text><text x="80" y="20" font-size="8">z</text></g>' : '';
    return '<svg class="pet ' + pet.mood + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' + defs + '<ellipse cx="50" cy="92" rx="26" ry="4" fill="#000" opacity=".18"/><g class="pet-b">' + body + '</g>' + zz + '</svg>';
  }
  function petCard() {
    var p = S.game && S.game.pet; if (!p) return '';
    var nx = p.next ? p.next.left + ' more day' + (p.next.left === 1 ? '' : 's') + (S.solo ? ' you win → ' : ' you both win → ') + p.next.name : 'Fully grown. Legendary.';
    return '<section class="card petcard"><div class="row" style="gap:12px">' + petSvg(p, 96) + '<div class="grow"><div class="eyebrow">' + esc(names().team) + '\'s pet</div><h3 style="margin:2px 0">' + esc(p.name) + ' · ' + p.days + ' day' + (p.days === 1 ? '' : 's') + '</h3>' +
      '<p class="small muted" style="margin:0 0 6px">' + esc(p.line) + '</p><div class="tiny muted">' + esc(nx) + '</div></div></div></section>';
  }
  /** The one daily score. Jobs (your minimum) once setup has planned the day, otherwise the XP goal. XP and streaks sit under it. */
  function winOf() {
    var g = S.game;
    return g.win || { by: 'xp', done: Math.min(g.xpToday, g.goal), need: g.goal, extra: Math.max(0, g.xpToday - g.goal), won: g.xpToday >= g.goal, partner: null, both: false };
  }
  function winCard() {
    var g = S.game, n = names(), W = winOf(), t = NudgeFmt.winText(W), P = W.partner, Q = S.quests;
    var mine = Q.planned ? Q.board : Q.board.filter(function (q) { return q.who === 'anyone' || q.who === 'together' || q.who === S.who; });
    var open = mine.filter(function (q) { return !q.doneToday; });
    if (W.lazy) return lazyCard();
    if (W.won && !open.length) {   // everything done: a small "Day won" line frees up the screen
      return '<section class="card spot win compact"><div class="row" style="gap:12px"><span class="wonbadge">' + icon('check') + '</span><div class="grow"><b>Day won</b><div class="small muted">' +
        (P ? (P.won ? 'You both won · the pet is fed' : esc(n.other) + ': ' + P.done + ' of ' + P.need) + ' · ' : '') + g.streak.count + ' day' + (g.streak.count === 1 ? '' : 's') + ' in a row · ' + g.xpToday + ' XP today</div></div>' +
        '<button class="btn ghost sm" type="button" data-goto="chores">Bonus' + icon('chevron', 's') + '</button></div></section>';
    }
    var h = '<section class="card spot today win' + (W.won ? ' won' : '') + '"><div class="between" style="margin-bottom:10px"><div class="eyebrow">Win the day</div><button class="btn ghost sm" type="button" data-goto="chores">All jobs' + icon('chevron', 's') + '</button></div>';
    h += '<div class="hero"><div class="ring" style="width:112px;height:112px">' + ring(W.need ? W.done / W.need : 1, 112, 10) +
      '<div class="t"><div><div class="num display-num" style="font-size:' + (t.big.length > 4 ? 19 : 30) + 'px">' + esc(t.big) + '</div><div class="tiny muted">' + esc(t.small) + '</div></div></div></div><div class="grow">';
    if (P) h += '<div class="stat"><span>' + esc(n.other) + '</span><b>' + (P.won ? 'Won' : P.done + ' of ' + P.need) + '</b></div>';
    h += '<div class="stat"><span class="row" style="gap:6px">' + flame(g.streak.count, 16) + 'Days won in a row</span><b>' + g.streak.count + '</b></div>' +
      (S.solo ? '' : '<div class="stat"><span class="row" style="gap:6px">' + icon('heart', 's') + 'Both won</span><b>' + g.team.count + ' day' + (g.team.count === 1 ? '' : 's') + '</b></div>') +
      '<div class="stat"><span>XP today</span><b>' + g.xpToday + '</b></div>' +
      (S.empire ? '<button class="stat cashrow" type="button" data-goto="empire"><span class="row" style="gap:6px">' + icon('gift', 's') + 'Cash</span><b>' + money(S.empire.cash) + '</b></button>' : '') +
      '<div class="bar" style="margin-top:8px"><i style="width:' + Math.round(g.level.into / g.level.need * 100) + '%"></i></div><div class="tiny muted" style="margin-top:4px">Level ' + g.level.level + ' · ' + (g.level.need - g.level.into) + ' XP to the next</div></div></div>';
    h += '<p class="small muted winhow">' + (W.won ? (W.both && P ? 'You\'ve both won today. The pet\'s fed and your joint streak grows.' : P ? 'You\'ve won today. When ' + esc(n.other) + ' wins too, the pet\'s fed.' : 'Won. Anything more is a bonus.') :
      W.by === 'jobs' ? 'Do any ' + W.need + ' job' + (W.need === 1 ? '' : 's') + ' today and the day is won.' : 'Earn ' + W.need + ' XP today to win: chores, the gym and food all count.') + '</p>';
    if (open.length) h += open.slice(0, 3).map(function (q) { return questRow(q); }).join('');
    else if (mine.length) h += '<p class="empty">All of today\'s jobs are done.</p>';
    if (!W.won) h += lazyRow();
    return h + '</section>';
  }
  /** The lazy-day button and how many are left (two a week, back on Monday). */
  function lazyRow() {
    var L = S.game.lazy; if (!L) return '';
    var late = new Date(now()).getHours() >= 20;
    return '<div class="lazyrow' + (late && L.left ? ' nudge' : '') + '"><div class="grow"><div class="small">' + (late && L.left ? 'Not happening today? A lazy day keeps the streak.' : 'Lazy days left this week: ' + L.left + ' of ' + L.perWeek) + '</div>' +
      (L.left ? '' : '<div class="tiny muted">None left. They reset on Monday.</div>') + '</div>' +
      '<button class="btn line sm" type="button" data-lazy="today"' + (L.left ? '' : ' disabled') + '>' + icon('moon', 's') + 'Take a lazy day</button></div>';
  }
  /** A lazy day: neither won nor lost. One small optional thing instead of the minimum. */
  function lazyCard() {
    var R = S.routines || {}, L = S.game.lazy, water = R.waterGoal && R.water < R.waterGoal;
    return '<section class="card spot win lazy"><div class="row" style="gap:12px;align-items:flex-start"><span class="wonbadge soft">' + icon('moon') + '</span><div class="grow"><b>Lazy day</b>' +
      '<div class="small muted">Streak on hold at ' + S.game.streak.count + '. Nothing to win, nothing to lose.</div>' +
      '<div class="small" style="margin-top:8px"><b>Optional:</b> ' + (water ? 'have a glass of water. That\'s it.' : 'get some fresh air. Or don\'t.') + '</div>' +
      '<div class="tiny muted" style="margin-top:6px">Lazy days left this week: ' + L.left + ' of ' + L.perWeek + '</div></div>' +
      '<button class="btn ghost sm" type="button" data-lazy="undo">Undo</button></div></section>';
  }
  /** The morning after a missed day: what it cost, how to get it back, and (until noon) the lazy-day way out. */
  function missedNote() {
    var L = S.game.lazy; if (!L) return '';
    var o = L.offerYesterday, m = L.missed, h = '';
    if (m && m.back) return '<div class="note">' + icon('check', 's') + 'Comeback: yesterday\'s ' + (m.xp ? m.xp + ' XP' : money(m.cash)) + ' is back.</div>';
    if (m) h += '<div class="note"><b>Missed yesterday: −' + (m.xp ? m.xp + ' XP' : money(m.cash)) + '.</b> Win today to get it back.</div>';
    if (o) h += '<section class="card quiet"><div class="between" style="gap:10px"><div class="small">Make yesterday a lazy day instead? ' + (o.streak ? 'The streak goes back to ' + o.streak + (o.xp ? ' and the ' + o.xp + ' XP comes back' : '') : o.xp ? 'The ' + o.xp + ' XP comes back' : 'It stays off the record') + '. Until noon.</div>' +
      '<button class="btn soft sm" type="button" data-lazy="yesterday">' + icon('moon', 's') + 'Use one</button></div></section>';
    return h;
  }
  /** Your characters on a little stage, with the pet at their feet. */
  function stageCard() {
    var W = S.wardrobe, p = S.game && S.game.pet, n = names(); if (!W && !p) return '';
    var h = '<section class="card stagecard"><div class="between" style="margin-bottom:6px"><div class="eyebrow">' + esc(S.solo ? 'You' : n.team) + '</div>' + (W ? '<button class="btn ghost sm" type="button" data-dress="open">' + icon('sparkles', 's') + 'Dressing room</button>' : '') + '</div>';
    if (W) h += '<div class="stagewrap' + (S.solo ? ' solo' : '') + '"><div class="av3d stage" id="av3dHome"><div class="av3d-msg small muted center">Loading your characters…</div></div>' + (p ? '<div class="stagepet">' + petSvg(p, 64) + '</div>' : '') + '</div>' +
      (S.solo ? '' : '<div class="between av-names"><span>You</span><span>' + esc(n.other) + '</span></div>') + stageLine();
    if (p) {
      var nx = p.next ? p.next.left + ' more day' + (p.next.left === 1 ? '' : 's') + (S.solo ? ' you win → ' : ' you both win → ') + p.next.name : 'Fully grown. Legendary.';
      h += '<div class="row petline" style="gap:10px">' + (W ? '' : petSvg(p, 64)) + '<div class="grow"><b>' + esc(p.name) + '</b> <span class="small muted">· ' + p.days + ' day' + (p.days === 1 ? '' : 's') + ' won together</span><div class="small muted">' + esc(p.line) + ' ' + esc(nx) + '</div></div></div>';
    }
    if (W) { var nu = nextUnlock(), left = nu ? nu.chores - W.chores : 0; if (nu) h += '<p class="tiny muted" style="margin:8px 0 0">' + left + ' more chore' + (left === 1 ? '' : 's') + ' unlocks the ' + esc(nu.name) + '</p>'; }
    return h + '</section>';
  }
  /** The routine for now: the morning one folds to a line after noon; the evening one shows from 6pm. */
  var routineOpen = {};
  function routineCards() {
    var h = '', R = S.routines;
    R.routines.forEach(function (r) {
      var ph = r.phase || (r.showNow && !r.finished ? 'open' : 'hidden');
      if (!r.steps.length || ph === 'hidden') return;
      var ic = icon(ph && /evening|night|bed/i.test(r.name) ? 'moon' : 'sun'), count = r.done.length + '/' + r.steps.length;
      if (ph === 'summary' && !routineOpen[r.name]) {
        h += '<button class="card rsummary" type="button" data-ropen="' + esc(r.name) + '" aria-expanded="false">' + ic + '<span class="grow">' + esc(r.name) + ' routine</span><span class="num">' + count + '</span>' + (r.finished ? icon('check', 's') : icon('chevron', 's')) + '</button>';
        return;
      }
      h += '<section class="card"><div class="head"><div class="row" style="gap:8px">' + ic + '<h3>' + esc(r.name) + ' routine</h3></div><span class="row" style="gap:6px"><span class="muted small num">' + count + '</span>' +
        (ph === 'summary' ? '<button class="btn ghost sm" type="button" data-ropen="' + esc(r.name) + '" aria-expanded="true">Fold</button>' : '') +
        '<button class="btn ghost sm" type="button" data-redit="' + esc(r.name) + '" aria-label="Change the ' + esc(r.name) + ' routine">' + icon('edit', 's') + 'Edit</button></span></div>' +
        r.steps.map(function (s, i) { var dn = r.done.indexOf(i) !== -1; return '<div class="item' + (dn ? ' done' : '') + '"><button class="check" type="button" data-routine="' + esc(r.name) + '" data-ri="' + i + '" aria-label="Done">' + icon('check') + '</button><div class="t grow" style="font-weight:500">' + esc(s) + '</div></div>'; }).join('') + '</section>';
    });
    if (R.evening && !R.routines.some(function (r) { return /evening|night|bed/i.test(r.name); }) && !load('noEvening')) {
      h += '<p class="addline"><button class="btn ghost sm" type="button" data-evening="add">' + icon('moon', 's') + 'Add an evening routine</button> <button class="btn ghost sm" type="button" data-evening="no">Not for me</button></p>';
    }
    return h;
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ropen], [data-evening]'); if (!t || !S) return;
    if (t.dataset.ropen) { routineOpen[t.dataset.ropen] = !routineOpen[t.dataset.ropen]; return renderHome(); }
    if (t.dataset.evening === 'no') { save('noEvening', 1); return renderHome(); }
    rEd = { old: '', name: 'Evening', time: '21:30', steps: ['Phone on charge', 'Keys and wallet by the door', 'Set out tomorrow\'s clothes', 'Teeth'] }; drawRoutineEd();
  });
  /** The streak flame grows with the streak (and goes grey at zero). */
  function flame(count, size) {
    var k = count ? Math.min(1, .55 + Math.log(1 + count) / 6) : .5, s = Math.round((size || 18) * (count ? 1 + Math.min(count, 60) / 60 : 1));
    var hot = count >= 30 ? '#7fd8ff' : count >= 7 ? '#ffd36b' : '#ff9a3c';
    return '<svg class="flame' + (count ? ' lit' : '') + '" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="' + (count ? 'var(--pink, #ff5fb2)' : 'var(--faint, #888)') + '"/>' +
      (count ? '<path d="M12 10c.5 2 3 3 3 6a3 3 0 0 1-6 0c0-1.5 1-2.5 1.5-3 .2 1 .8 1.5 1.5 1.5 0-2-.5-3 0-4.5z" fill="' + hot + '" transform="scale(' + k + ') translate(' + (12 / k - 12) + ' ' + (22 / k - 22) + ')"/>' : '') + '</svg>';
  }

  function leaveOptions(cur) {
    var o = '';
    for (var m = 540; m <= 1080; m += 30) { var t = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); o += '<option value="' + t + '"' + (t === cur ? ' selected' : '') + '>' + t + '</option>'; }
    return o;
  }
  document.addEventListener('change', function (ev) {
    var sl = ev.target.closest && ev.target.closest('[data-dayleave]'); if (!sl || !S) return;
    if (S.today.gym) { S.today.gym.leaveAround = sl.value; S.today.gym.plan = ''; }
    toast('Planning the gym around ' + sl.value + '…');
    call('setDayOffLeave', [sl.value], function (res) { apply(res, 'Gym planned around ' + sl.value); });
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-dayoff]'); if (!b || !S) return;
    var off = b.dataset.dayoff === '1'; S.work.off = off; renderAll();
    toast(off ? 'Day off. Work cards are hidden.' : 'A work day after all.');
    call('setDayOff', [off]);
  });
  /** Under the date: what today needs, in plain words. */
  function dayStatus() {
    if (S.game && (S.game.win ? S.game.win.won : S.game.streak && S.game.streak.todayDone)) return ' · <span class="good">Day won</span>';
    var q = S.quests || {}, must = (q.board || []).filter(function (x) { return x.must && !x.doneToday; }).length;
    if (q.planned && must) return ' · ' + must + ' job' + (must === 1 ? '' : 's') + ' to win the day';
    return '';
  }
  function renderHome() {
    var g = S.game, n = names(), h = '', parts = {};
    function seg(id) { parts[id] = h; h = ''; }
    var d = new Date(now());
    h += '<div class="top"><div><h1>' + greeting() + (n.me ? ', ' + esc(n.me) : '') + '</h1><div class="sub">' +
      d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + dayStatus() + '</div></div>' + meButton() + '</div>';
    if (MODE === 'gas' && S.fun && S.fun.appBase) h += '<a class="getapp" target="_top" href="' + esc(S.fun.appBase + '?key=' + KEY) + '">' + icon('download') + '<span class="grow"><b>Get the app</b><br><span class="small muted">Notifications, live games, faster</span></span>' + icon('chevron', 's') + '</a>';
    if (MODE === 'web' && S.push && S.push.configured && 'Notification' in window && 'serviceWorker' in navigator && (Notification.permission !== 'granted' || !S.push.devices || (load('pushErr') && !load('pushTok')))) {
      h += '<section class="card pushwarn"><div class="row" style="gap:10px;align-items:flex-start">' + icon('bell') + '<div class="grow"><b>Notifications are off on this ' + (/Android|iPhone|iPad/.test(navigator.userAgent) ? 'phone' : 'device') + '</b><div class="small">' +
        (Notification.permission === 'denied' ? 'They\'re blocked. Open your phone\'s Settings, then Apps, Nudge (or Chrome), Notifications, and allow them. Then come back and tap Turn on.' : 'Your reminders, deadline nags and work pings can\'t reach you until you turn them on.') +
        '</div></div></div><button class="btn primary wide" type="button" id="pushOn" style="margin-top:10px">' + icon('bell', 's') + 'Turn on notifications</button></section>';
    } else if (/iPhone|iPad/.test(navigator.userAgent) && MODE === 'web' && !standalone()) {
      h += '<section class="card pushwarn"><b>Get notifications on iPhone</b><div class="small">Tap Share, then Add to Home Screen. Open Nudge from your home screen and turn notifications on there.</div></section>';
    }
    if (S.chores.invite) h += '<div class="note">' + esc(n.other) + ' wants company for chores. Pick a job in Chores.</div>';
    h += missedNote();

    if (S.setup && !S.setup.done) h += '<section class="card tint"><b>Set up your chores</b><p class="small" style="margin:4px 0 10px">A few quick taps about you and your home, and Nudge plans each day for you: a small must-do minimum, the rest a bonus. About 5 minutes.</p><button class="btn primary wide" type="button" data-setup="run">' + (S.setup.built ? 'Finish my part of setup' : 'Start setup') + '</button></section>';
    seg('header');
    h += deadlinesCard();
    seg('deadlines');
    h += workMini();
    seg('work');
    // brief
    maybeBrief();
    if (S.brief && S.brief.brief && S.brief.part !== briefSlotNow()) S.brief = null;    // written for an earlier slot: a fresh one is on its way
    if (S.brief && S.brief.brief) h += '<section class="card tint"><div class="eyebrow" style="color:var(--lilac);display:flex;gap:6px;align-items:center">' + icon('sparkles', 's') + 'Today' + (S.brief.ts || S.brief.at ? '<span class="muted" style="font-weight:500"> · updated <span data-briefago>' + esc(S.brief.ts ? NudgeFmt.ago(S.brief.ts, now()) : 'at ' + S.brief.at) + '</span></span>' : '') + '</div><p class="brief' + (NudgeFmt.briefBehind(S.brief, S) ? ' behind' : '') + '" style="margin:8px 0 10px">' + (NudgeFmt.briefBehind(S.brief, S) && S.game.win && S.game.win.won ? 'Day won. Nice work. Updating your brief…' : esc(S.brief.brief)) + '</p>' +
      (S.brief.first && !NudgeFmt.briefBehind(S.brief, S) ? '<div class="row small"><span class="chip lilac">First move</span><span>' + esc(S.brief.first) + '</span></div>' : '') + '</section>';

    seg('brief');
    h += '<button class="askbar" type="button" id="openAsk">' + icon('sparkles') + '<span class="grow">Ask anything, or tell me what\'s on your mind</span>' + icon('chevron', 's') + '</button>';

    seg('ask');
    h += winCard();
    seg('win');
    h += stageCard();
    seg('stage');
    h += routineCards();
    seg('routine');
    if (ME && S.today.gym) {
      var gy = S.today.gym, leave = '';
      if (gy.leaveAt && !gy.done) {
        var p = gy.leaveAt.split(':'), dt = new Date(now()); dt.setHours(+p[0], +p[1], 0, 0);
        var mins = Math.round((dt.getTime() - now()) / 60000);
        if (mins > 0 && mins < 300) leave = 'Leave in ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' : '') + (mins % 60) + 'm';
      }
      h += '<section class="card blush"><div class="between"><div><div class="eyebrow" style="color:var(--pink)">Gym today</div><h2 style="margin-top:4px">' + esc(gy.session) + '</h2><div class="small muted row" style="gap:6px;margin-top:4px">' +
        (gy.dayOff && gy.noDaytime ? icon('bus', 's') + (gy.travel === 'Bike' ? 'E-bike · leave ' + esc(gy.leaveAt) : 'No daytime bus times yet') : gy.travel === 'Move' ? icon('bus', 's') + 'No bus after work' : gy.travel ? icon(gy.travel === 'Bike' ? 'bike' : 'bus', 's') + (gy.bus ? 'Bus ' + esc(gy.bus.split(' / ')[0]) : esc(gy.travel === 'Bike' ? 'E-bike' : gy.travel)) + ' · leave ' + esc(gy.leaveAt) + (gy.homeBy ? ' · home ' + esc(gy.homeBy) : '') : 'Plan arrives at 6am') + '</div>' +
        (gy.window ? '<div class="small muted" style="margin-top:2px">Gym ' + esc(gy.window) + (gy.bus ? ' · back on the ' + esc(gy.bus.split(' / ')[1] || '') : '') + '</div>' : '') +
        (leave ? '<div class="small" style="font-weight:650;margin-top:4px">' + leave + '</div>' : '') + '</div>' +
        (gy.done ? '<span class="chip good">' + icon('check', 's') + 'Done</span>' : '<div class="stack right"><button class="btn primary sm" type="button" data-goto="train">Log it</button><button class="btn ghost sm" type="button" data-goto="train" style="padding:4px 8px">Change</button></div>') + '</div>' +
        (gy.dayOff && !gy.done ? '<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><span class="tiny muted">Day off · leave around</span><select data-dayleave="1" aria-label="When to head to the gym today">' + leaveOptions(gy.leaveAround) + '</select></div>' +
          (gy.noDaytime ? '<p class="tiny muted" style="margin:6px 0 0">Your bus times only cover after work. Add the daytime times for the 3 under Transport in the Config tab and I\'ll pick the best pair for a 90-minute session.</p>' : '') : '') +
        (gy.plan && !gy.done ? '<details class="gymplan"><summary class="small">Travel plan</summary><ul class="small">' + gy.plan.split('\n').map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></details>' : '') + '</section>';
    }

    seg('gym');
    h += '<div class="grid2" style="margin-bottom:12px">';
    if (ME) {
      var t = S.today, lw = t.lastWeight;
      h += '<div class="tile"><div class="k">' + icon('scale', 's') + 'Weight</div>' + (t.weighedToday ? '<div class="v num">' + lw.kg + '<span class="small muted"> kg</span></div><div class="tiny muted">Logged today</div>' :
        '<form class="inline" id="weighForm" autocomplete="off"><input type="text" id="weighText" inputmode="decimal" placeholder="' + (lw ? lw.kg : '82.4') + '" aria-label="Your weight" style="padding:9px 10px"><button class="btn primary sm" type="submit">Log</button></form><div class="tiny muted">' + (t.weighDay ? 'Weigh-in day' : lw ? 'Last ' + lw.kg + ' kg' : 'kg, st or lb') + '</div>') + '</div>';
    } else {
      h += '<button class="tile" type="button" data-goto="play"><div class="k">' + icon('word', 's') + 'Daily word</div><div class="v">' + (S.games.word.done ? (S.games.word.won ? S.games.word.guesses.length + '/6' : 'X/6') : 'Play') + '</div><div class="tiny muted">' + (S.games.word.other ? esc(names().other) + ': ' + (S.games.word.other.done ? (S.games.word.other.won ? S.games.word.other.tries + '/6' : 'X/6') : S.games.word.other.tries + ' tries') : 'Same word for you both') + '</div></button>';
    }
    if (S.routines.waterGoal) {
      var w = S.routines.water, wg = S.routines.waterGoal, drops = '';
      for (var i = 0; i < wg; i++) drops += '<i class="' + (i < w ? 'on' : '') + '"></i>';
      h += '<div class="tile"><div class="k">' + icon('drop', 's') + 'Water</div><div class="drops">' + drops + '</div><div class="between"><span class="tiny muted num">' + w + ' of ' + wg + '</span><span class="row" style="gap:4px"><button class="iconbtn" style="width:34px;height:34px" type="button" data-water="-1" aria-label="One less">−</button><button class="iconbtn soft" style="width:34px;height:34px" type="button" data-water="1" aria-label="One more glass">' + icon('plus', 's') + '</button></span></div></div>';
    }
    h += '</div>';

    seg('tiles');
    h += usCard(); seg('us');
    h += '<section class="card"><div class="head"><h3>' + esc(n.other) + '</h3><button class="btn soft sm" type="button" id="nudge">' + icon('send', 's') + 'Nudge</button></div>';
    var feed = S.game.feed.slice(0, 6);
    h += feed.length ? feed.map(function (f) {
      var own = f.who === S.who, sent = f.hi5.indexOf(S.who) !== -1;
      return '<div class="item">' + avatarOf(f.who, 30) + '<div class="grow small"><b>' + esc(own ? 'You' : n.other) + '</b> ' + esc(f.text) + (f.hi5.length ? ' <span class="muted">· high-fived</span>' : '') + '</div>' +
        (!own ? '<button class="btn ' + (sent ? 'line' : 'blush') + ' sm" type="button" data-hi5="' + esc(f.id) + '"' + (sent ? ' disabled' : '') + '>' + icon('heart', 's') + (sent ? 'Sent' : 'High-five') + '</button>' : '') + '</div>';
    }).join('') : '<p class="empty">Nothing yet today.</p>';
    h += '</section>';
    seg('feed');
    if (S.solo) { parts.us = ''; parts.feed = ''; }
    if (homeEditing) h = parts.header + homeEditView(parts);
    else h = parts.header + homeOrder().filter(function (x) { return !x.hide; }).map(function (x) { return parts[x.id] || ''; }).join('') +
      '<p class="center" style="margin:6px 0 18px"><button class="btn line sm" type="button" id="homeEdit">' + icon('edit', 's') + 'Edit home screen</button></p>';
    el('tab-home').innerHTML = h;
    mountHome3d();
  }

  // ---------- CHORES (today, schedule, timer) ----------
  var plan = null, parking = false, halfwayShown = '', upShown = '', choresView = load('choresView') || 'today';
  function mySession() { return S.chores.people[S.who].session; }
  function personCard(p, label) {
    var s = p.session;
    var st = s ? esc(s.task) + ' · ' + (s.endsAt > now() ? Math.max(0, Math.ceil((s.endsAt - now()) / 60000)) + ' min left' : 'time\'s up') : 'Free';
    var pct = s ? Math.min(100, (now() - s.startedAt) / (s.endsAt - s.startedAt) * 100) : 0;
    return '<div class="person"><div class="small" style="font-weight:650">' + esc(label) + '</div><div class="st">' + st + '</div>' + (s ? '<div class="bar" style="margin-top:8px;height:5px"><i style="width:' + pct + '%"></i></div>' : '') +
      (p.doneToday.length ? '<div class="dn">Done: ' + esc(p.doneToday.join(', ')) + '</div>' : '') + '</div>';
  }
  function duo() { return personCard(S.chores.people[S.who], 'You') + personCard(S.chores.people[S.who === 'me' ? 'partner' : 'me'], names().other); }

  function focusView(s) {
    var up = now() >= s.endsAt, cur = s.steps[s.step];
    return (up ? '<div class="alert">Time\'s up for ' + esc(s.task) + '. ' + (s.taster ? 'You started, and that counts. Keep going?' : 'Done, or five more minutes?') + '</div>' : '') +
      '<section class="card focus"><div class="eyebrow">' + (s.taster ? 'Just five minutes' : 'Only this') + '</div><h2 style="margin:6px 0 2px">' + esc(s.task) + '</h2>' + musicBar() +
      '<div class="ring">' + ring(Math.max(0, (s.endsAt - now()) / (s.endsAt - s.startedAt)), 210, 7) + '<div class="t"><div><div class="time" id="left">' + clock(Math.abs(s.endsAt - now())) + '</div><div class="small muted">' + (up ? 'over' : 'left') + '</div></div></div></div>' +
      (s.steps.length ? (cur ? '<div class="now"><div class="eyebrow">Now</div><div style="font-size:19px;font-weight:650;margin:4px 0 10px">' + esc(cur) + '</div><button class="btn primary wide" type="button" data-step="' + s.step + '">' + icon('check') + 'Step done</button></div>' : '<div class="now"><b>All steps done.</b></div>') +
        '<ul class="steps">' + s.steps.map(function (st, i) {
          return '<li class="' + (i < s.step ? 'done' : i === s.step ? 'cur' : '') + '" data-step="' + (i < s.step ? i - 1 : i) + '"><span class="check' + (i < s.step ? ' on' : '') + '" style="width:22px;height:22px">' + icon('check', 's') + '</span>' + esc(st) + '</li>';
        }).join('') + '</ul>' : '') +
      (parking ? '<form class="inline" id="park" autocomplete="off" style="margin-bottom:10px"><input type="text" id="parkText" placeholder="What popped into your head?" aria-label="Thing to park"><button class="btn primary" type="submit">Park</button></form>' : '') +
      '<div class="grid3"><button class="btn soft" type="button" id="parkBtn">' + icon('park', 's') + 'Park it</button><button class="btn soft" type="button" data-more="' + (s.taster ? 10 : 5) + '">+' + (s.taster ? 10 : 5) + ' min</button><button class="btn primary" type="button" id="cdone">Done</button></div>' +
      '<div class="center" style="margin-top:6px"><button class="btn ghost sm" type="button" id="cstop">' + (s.taster ? 'Stop here, it still counts' : 'Stop and save the rest for later') + '</button>' +
      (now() - s.startedAt < 2 * 60000 ? '<button class="btn ghost sm" type="button" id="ccancel">Wrong job</button>' : '') + '</div>' +
      '<p class="small muted" style="margin:8px 0 0">Noticed something else that needs doing? Park it rather than switching.</p></section>';
  }
  function readyView() {
    return '<section class="card"><div class="eyebrow">Ready?</div><h2 style="margin:6px 0">' + esc(plan.name) + '</h2>' +
      '<div class="row" style="justify-content:center;gap:16px;margin:12px 0"><button class="iconbtn" type="button" data-mins="-5" aria-label="Five minutes less">−</button><span class="num" style="font-size:30px;font-weight:700;min-width:96px;text-align:center">' + plan.minutes + ' min</span><button class="iconbtn" type="button" data-mins="5" aria-label="Five minutes more">' + icon('plus', 's') + '</button></div>' +
      (plan.steps && plan.steps.length ? '<ol class="small" style="margin:0 0 14px;padding-left:20px">' + plan.steps.map(function (st) { return '<li style="margin:3px 0">' + esc(st) + '</li>'; }).join('') + '</ol>' : '') +
      '<button class="btn primary big wide" type="button" id="go">' + icon('play', 's') + 'Start, just this job</button><div class="center"><button class="btn ghost sm" type="button" id="pback">Pick something else</button></div></section>';
  }
  function laterCard() {
    if (!S.chores.later.length) return '';
    return '<section class="card"><div class="head"><h3>Saved for later</h3></div>' + S.chores.later.map(function (l) {
      return '<div class="item"><button class="check" type="button" data-clear="' + esc(l.id) + '" aria-label="Done">' + icon('check') + '</button><div class="grow small">' + esc(l.thing) + ' <span class="muted">· ' + esc(l.who === S.who ? 'you' : names().other) + '</span></div></div>';
    }).join('') + '</section>';
  }
  function renderChores() {
    var s = mySession(), q = S.quests, n = names(), h = '<div class="top"><div><h1>Chores</h1><div class="sub">One job at a time.</div></div>' + meButton() + '</div>';
    if (!S.solo) h += '<section class="card"><div class="head"><h3>Together</h3><button class="btn ghost sm" type="button" id="askJoin">' + icon('send', 's') + 'Ask ' + esc(n.other) + ' to join</button></div><div class="duo" id="duo">' + duo() + '</div></section>';
    if (s) { el('tab-chores').innerHTML = h + focusView(s); return; }
    if (plan) { el('tab-chores').innerHTML = h + readyView(); return; }
    if (S.chores.invite) h += '<div class="note">' + esc(n.other) + ' wants company. Start a job and do it together.</div>';
    h += '<div class="seg" role="tablist">' + [['today', 'Today'], ['schedule', 'Schedule'], ['plan', 'Plan']].map(function (o) { return '<button type="button" data-cview="' + o[0] + '" aria-pressed="' + (choresView === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (choresView === 'schedule') { el('tab-chores').innerHTML = h + (S.setup && S.setup.built && window.NudgeSetup ? NudgeSetup.choreList() : scheduleView()); return; }
    if (choresView === 'plan') { el('tab-chores').innerHTML = h + planView(); return; }
    if (!mySession()) h += musicBar();
    if (q.planned) {
      var mustL = q.board.filter(function (x) { return x.must; }), bonusL = q.board.filter(function (x) { return !x.must; });
      h += '<section class="card spot"><div class="head"><h3>' + (q.win ? 'Day won' : 'Win the day: ' + Math.min(q.doneCount, q.minimum) + ' of ' + q.minimum) + '</h3></div>' +
        (q.minimum ? '<div class="minbar"><i style="width:' + Math.round(Math.min(1, q.doneCount / q.minimum) * 100) + '%"></i></div><p class="small muted" style="margin:6px 0 4px">Do ' + q.minimum + ' job' + (q.minimum === 1 ? '' : 's') + ' (any of them) and the day is won. These are quick ones:</p>' : '<p class="small muted">Nothing you have to do today. A free win.</p>') +
        mustL.map(function (x) { return questRow(x, { claim: true }); }).join('') + '</section>';
      h += '<section class="card"><div class="head"><h3>Bonus</h3><span class="muted small">only if you\'ve got energy' + (q.energy ? ' (yours peaks in the ' + esc(q.energy) + ')' : '') + '</span></div>' + (bonusL.length ? bonusL.map(function (x) { return questRow(x, { claim: true }); }).join('') : '<p class="empty">No bonus jobs today.</p>') + '</section>';
    } else
    h += '<section class="card spot"><div class="head"><h3>Today</h3><span class="muted small num">' + q.board.filter(function (x) { return x.doneToday; }).length + '/' + q.board.length + '</span></div>' +
      (q.board.length ? q.board.map(function (x) { return questRow(x, { claim: true }); }).join('') : '<p class="empty">Nothing due today.</p>') + '</section>';
    if (q.more.length) h += '<section class="card"><details><summary class="small muted" style="cursor:pointer">' + (q.planned ? 'Other jobs (' + q.more.length + '): ' + esc(names().other) + '\'s, or coming up soon. Doing one counts.' : 'Also due (' + q.more.length + '), only if you feel like it') + '</summary><div style="margin-top:8px">' + q.more.map(function (x) { return questRow(x, { claim: true }); }).join('') + '</div></details></section>';
    if (q.doneExtra.length) h += '<section class="card"><div class="head"><h3>Bonus today</h3></div>' + q.doneExtra.map(function (x) { return questRow(x); }).join('') + '</section>';
    if (q.upcoming.length) h += '<section class="card"><div class="head"><h3>Coming up</h3></div>' + q.upcoming.slice(0, 8).map(function (x) {
      return '<div class="item"><div class="grow"><div class="t" style="font-weight:500">' + esc(x.name) + '</div></div><span class="small muted">' + dayLabel(x.next) + '</span></div>';
    }).join('') + '</section>';
    h += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('bulb', 's') + 'Brain dump</h3></div><textarea id="dumpText" placeholder="Everything in your head, any order. Ring the dentist, out of bin bags, the shower needs a proper clean…"></textarea>' +
      '<button class="btn primary wide" type="button" id="dumpBtn" style="margin-top:10px">Sort it for me</button></section>';
    h += '<section class="card"><details><summary class="small muted" style="cursor:pointer">Start any job with a timer</summary><div class="grid2" style="margin-top:10px">' +
      S.chores.chores.slice(0, 40).map(function (c, i) { return '<button class="preset" type="button" data-job="' + i + '">' + esc(c.name) + '<small>' + c.minutes + ' min' + (c.usual ? ' · usually ' + c.usual : '') + '</small></button>'; }).join('') +
      '</div><form class="inline" id="custom" autocomplete="off" style="margin-top:10px"><input type="text" id="customText" placeholder="Something else, e.g. paint the fence" aria-label="Another job"><button class="btn primary" type="submit">Plan</button></form></details></section>';
    el('tab-chores').innerHTML = h + laterCard();
  }

  // Schedule page: every chore on a rhythm, editable.
  var RHYTHMS = [['daily', 'Every day'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['other', 'Other']];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function scheduleView() {
    var h = '<div class="row" style="gap:8px;margin-bottom:12px"><button class="btn soft grow" type="button" id="addChore">' + icon('plus', 's') + 'Add a chore</button><button class="btn line grow" type="button" id="respread">' + icon('shuffle', 's') + 'Spread the dates</button></div>';
    RHYTHMS.forEach(function (r) {
      var list = S.schedule.filter(function (q) { return q.rhythm === r[0]; });
      if (!list.length) return;
      h += '<section class="card sched"><div class="head"><h3>' + r[1] + '</h3><span class="muted small">' + list.length + '</span></div>' + list.map(function (q) {
        return '<button class="item" type="button" data-edit="' + esc(q.name) + '" style="width:100%;text-align:left;border-radius:0"><div class="grow"><div class="t" style="font-weight:550">' + esc(q.name) + '</div><div class="m">' + esc(q.label) + ' · ' + q.minutes + ' min' + (q.who === 'together' ? ' · together, 2× XP' : q.who !== 'anyone' ? ' · ' + (q.who === S.who ? 'you' : names().other) : '') + '</div></div><div class="day">' + (q.due ? '<span class="chip pink">Due</span>' : esc(dayLabel(q.next))) + '</div>' + icon('chevron', 's') + '</button>';
      }).join('') + '</section>';
    });
    return h + '<p class="small muted center">Dates are spread so heavier jobs land on quieter days. Tap any chore to change it.</p>';
  }
  var edit = null;
  function editSheet() {
    var e = edit, h = '<h2>' + (e.original ? 'Edit chore' : 'New chore') + '</h2>';
    h += '<label class="f" for="eName">Name</label><input type="text" id="eName" value="' + esc(e.name) + '" placeholder="e.g. Water the plants">';
    h += '<label class="f">How often</label><div class="seg" style="margin:0;flex-wrap:wrap">' + RHYTHMS.slice(0, 4).map(function (r) { return '<button type="button" data-er="' + r[0] + '" aria-pressed="' + (e.rhythm === r[0]) + '">' + r[1].replace('Every 2 weeks', '2 weeks').replace('Every day', 'Daily') + '</button>'; }).join('') + '</div>';
    if (e.rhythm === 'weekly' || e.rhythm === 'biweekly') h += '<label class="f">' + (e.rhythm === 'weekly' ? 'Which days' : 'Which day') + '</label><div class="days">' + DAYS.map(function (d, i) { return '<button type="button" data-ed="' + i + '" aria-pressed="' + (e.days.indexOf(i) !== -1) + '">' + d.charAt(0) + d.slice(1, 2) + '</button>'; }).join('') + '</div>';
    if (e.rhythm === 'monthly') { h += '<label class="f">Day of the month</label><div class="dates">'; for (var d = 1; d <= 28; d++) h += '<button type="button" data-edate="' + d + '" aria-pressed="' + (e.date === d) + '">' + d + '</button>'; h += '</div>'; }
    if (e.rhythm === 'other') h += '<p class="small muted">Runs on its own timing (' + esc(e.every) + '). Pick a rhythm above to change it.</p>';
    h += '<div class="grid2"><div><label class="f" for="eMin">Minutes</label><input type="number" id="eMin" value="' + e.minutes + '" min="1" max="180"></div><div><label class="f" for="eWho">Who</label><select id="eWho"><option value="anyone"' + (e.who === 'anyone' ? ' selected' : '') + '>Either of us</option><option value="me"' + (e.who === 'me' ? ' selected' : '') + '>' + (S.who === 'me' ? 'Me' : esc(names().other)) + '</option><option value="partner"' + (e.who === 'partner' ? ' selected' : '') + '>' + (S.who === 'partner' ? 'Me' : esc(names().other)) + '</option></select></div></div>';
    h += '<label class="f">Energy it takes</label><div class="seg" style="margin:0">' + [['low', 'Low'], ['medium', 'Some'], ['high', 'Lots']].map(function (o) { return '<button type="button" data-ee="' + o[0] + '" aria-pressed="' + (e.energy === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    h += '<label class="f" for="eSteps">Steps (one per line, optional)</label><textarea id="eSteps" style="min-height:80px">' + esc(e.steps.join('\n')) + '</textarea>';
    h += '<button class="btn primary big wide" type="button" id="eSave" style="margin-top:16px">Save</button>';
    if (e.original) h += '<div class="center"><button class="btn ghost sm" type="button" id="eDel" style="color:var(--warn)">' + icon('trash', 's') + 'Delete this chore</button></div>';
    sheetKind = 'edit';
    openSheet(h);
  }
  function readEditInputs() {
    if (!el('eName')) return;
    edit.name = el('eName').value; edit.minutes = +el('eMin').value || 10; edit.who = el('eWho').value;
    edit.steps = el('eSteps').value.split('\n').map(function (s) { return s.trim(); }).filter(String);
  }

  function tickTimer() {
    var s = mySession(), b = el('dotChores');
    if (b) b.textContent = s ? (s.endsAt > now() ? clock(s.endsAt - now()) : '!') : '';
    if (!s) { document.body.classList.remove('timesup'); return; }
    var left = s.endsAt - now(), l = el('left');
    if (l) {
      l.textContent = clock(Math.abs(left));
      var arc = document.querySelector('.focus .arc');
      if (arc) { var c = +arc.getAttribute('stroke-dasharray'); arc.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, left) / (s.endsAt - s.startedAt)))); }
    }
    var d = el('duo'); if (d) d.innerHTML = duo();
    var id = s.startedAt + ':' + s.endsAt;
    if (left <= (s.endsAt - s.startedAt) / 2 && left > 0 && halfwayShown !== id && s.endsAt - s.startedAt >= 6 * 60000) { halfwayShown = id; chime([880]); toast('Halfway. Still on ' + s.task + '?'); }
    if (left <= 0) {
      if (upShown !== id) { upShown = id; renderAll(); }
      if (Math.floor(-left / 1000) % 60 === 0) { chime([880, 880, 880]); buzz([200, 100, 200, 100, 200]); }
    }
    document.body.classList.toggle('timesup', left <= 0);
  }
  var wake;
  function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) {}
  }
  function questByName(nm) { return S.quests.all.filter(function (x) { return x.name === nm; })[0]; }
  function startPlan(p, msg) { call('startChore', [p], function (res) { plan = null; closeSheet(); apply(res, msg || 'Go. Just ' + p.name + ' for ' + p.minutes + ' minutes.'); showTab('chores'); }); }

  // ---------- WHAT NOW ----------
  var wn = { energy: load('wnEnergy') || 'medium', minutes: load('wnMinutes') || 15, skip: [], pick: undefined };
  function whatNowSheet() {
    var seg = function (key, vals, labels) { return '<div class="seg">' + vals.map(function (v, i) { return '<button type="button" data-wn="' + key + '" data-v="' + v + '" aria-pressed="' + (String(wn[key]) === String(v)) + '">' + labels[i] + '</button>'; }).join('') + '</div>'; };
    var h = '<h2>What should I do now?</h2><p class="small muted" style="margin:4px 0 14px">Tell me how you feel. I\'ll pick one thing.</p><div class="eyebrow" style="margin-bottom:6px">Energy</div>' + seg('energy', ['low', 'medium', 'high'], ['Low', 'Some', 'Lots']) +
      '<div class="eyebrow" style="margin-bottom:6px">Time</div>' + seg('minutes', [5, 15, 30, 60], ['5 min', '15', '30', '60+']) + '<button class="btn primary wide" type="button" id="wnFind">Pick one for me</button>';
    if (wn.pick === null) h += '<p class="small muted center" style="margin-top:12px">Nothing fits right now. Resting is allowed. Or try more time.</p>';
    if (wn.pick) h += '<section class="card tint" style="margin:14px 0 0"><div class="eyebrow" style="color:var(--lilac)">Do this one</div><h2 style="margin:6px 0 2px">' + esc(wn.pick.name) + '</h2><p class="small muted" style="margin:0 0 12px">About ' + wn.pick.fullMinutes + ' min · ' + wn.pick.xp + ' XP' + (wn.pick.due ? ' · due' : ' · ahead of schedule') + '</p>' +
      '<button class="btn primary wide" type="button" data-wnstart="full">' + icon('play', 's') + 'Start (' + wn.pick.minutes + ' min)</button><div class="grid2" style="margin-top:8px"><button class="btn line" type="button" data-wnstart="taster">Just 5 minutes</button><button class="btn line" type="button" id="wnSkip">Something else</button></div></section>';
    sheetKind = 'whatnow';
    openSheet(h);
  }

  // ---------- ASK ----------
  var chat = load('chat-' + KEY.slice(0, 6)) || [];
  function askSheet() {
    var h = '<div class="between" style="margin-bottom:10px"><h2 class="row" style="gap:8px">' + icon('sparkles') + 'Ask</h2>' + (chat.length ? '<button class="btn ghost sm" type="button" id="askClear">Clear</button>' : '') + '</div>';
    if (!S.hasClaudeKey) h += '<p class="muted small">Ask needs your Claude API key. Add it in You, Settings.</p>';
    h += '<div class="chat" id="chatLog">' + (chat.length ? chat.map(function (m) { return '<div class="msg ' + m.r + '">' + esc(m.t) + '</div>'; }).join('') :
      '<div class="msg ai">Tell me anything. "I\'m overwhelmed", "add milk and eggs", "we need to clean the oven more often", "what should I eat tonight?"</div>') + '</div>';
    h += '<form class="inline" id="askForm" autocomplete="off"><input type="text" id="askText" placeholder="Type here" aria-label="Ask"><button class="btn primary" type="submit"' + (S.hasClaudeKey ? '' : ' disabled') + '>' + icon('send', 's') + '</button></form>';
    sheetKind = 'ask';
    openSheet(h);
    var log = el('chatLog'); if (log) log.scrollTop = log.scrollHeight;
  }

  function nudgeSheet() {
    var opts = ['Come and do chores with me', 'Proud of you', 'Drink some water', 'Have you eaten?', 'Time to wind down', 'Your turn on today\'s word'];
    var h = '<h2>Nudge ' + esc(names().other) + '</h2><p class="small muted" style="margin:4px 0 12px">Goes straight to their phone.</p><div class="stack">' +
      opts.map(function (o) { return '<button class="btn line wide" type="button" data-nudge="' + esc(o) + '" style="justify-content:flex-start">' + esc(o) + '</button>'; }).join('') + '</div>' +
      '<form class="inline" id="nudgeForm" autocomplete="off" style="margin-top:12px"><input type="text" id="nudgeText" placeholder="Or write your own" maxlength="140" aria-label="Your message"><button class="btn primary" type="submit">' + icon('send', 's') + '</button></form>';
    if (!S.push.otherDevices) h += '<p class="tiny muted" style="margin-top:10px">' + esc(names().other) + ' hasn\'t turned on notifications yet, so this goes by ' + (S.who === 'me' ? 'email' : 'calendar alert') + ' instead.</p>';
    openSheet(h);
  }

  // ---------- PLAY ----------
  var playView = load('playView') || 'word', typed = '', target = { expr: '' }, recallGame = null, lastWordPoll = 0;
  var KB = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  function allowed(w) {
    if (typeof ALLOWED_WORDS === 'undefined') return true;
    var lo = 0, hi = ALLOWED_WORDS.length / 5 - 1;
    while (lo <= hi) { var mid = (lo + hi) >> 1, x = ALLOWED_WORDS.substr(mid * 5, 5); if (x === w) return true; if (x < w) lo = mid + 1; else hi = mid - 1; }
    return false;
  }
  function wordBoard(wd) {
    var h = '<div class="board" id="board">';
    for (var r = 0; r < 6; r++) {
      var g = wd.guesses[r], col = wd.colours[r], cur = !wd.done && r === wd.guesses.length;
      h += '<div class="r' + (cur ? ' cur' : '') + '">';
      for (var c = 0; c < 5; c++) {
        var ch = g ? g[c] : cur ? (typed[c] || '') : '';
        h += '<div class="c' + (col ? ' ' + col[c] : ch ? ' full' : '') + '">' + esc(ch) + '</div>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  function mini(colours) {
    var h = '<div class="mini">';
    for (var r = 0; r < 6; r++) { h += '<div class="r">'; for (var c = 0; c < 5; c++) h += '<div class="c' + (colours[r] ? ' ' + colours[r][c] : '') + '"></div>'; h += '</div>'; }
    return h + '</div>';
  }
  function keyColours(wd) {
    var k = {};
    wd.guesses.forEach(function (g, r) { for (var i = 0; i < 5; i++) { var cl = wd.colours[r][i], ch = g[i]; if (k[ch] === 'g') continue; if (cl === 'g' || (cl === 'y' && k[ch] !== 'g') || !k[ch]) k[ch] = cl; } });
    return k;
  }
  function renderPlay() {
    var G = S.games, n = names(), h = '<div class="top"><div><h1>Play</h1><div class="sub">Same puzzles for you both. Live scores.</div></div>' + meButton() + '</div>';
    h += '<section class="card spot"><div class="vs"><div>' + avatarOf(S.who, 40) + '<div class="small muted">You</div><div class="num" style="font-size:28px;font-weight:700">' + G.stats.you + '</div></div><div class="center small muted">head to head<br><span class="tiny">' + G.stats.draws + ' draws</span></div><div class="right">' + avatarOf(S.who === 'me' ? 'partner' : 'me', 40, true) + '<div class="small muted">' + esc(n.other) + '</div><div class="num" style="font-size:28px;font-weight:700">' + G.stats.them + '</div></div></div></section>';
    h += '<div class="seg six">' + [['word', 'Word'], ['target', 'Numbers'], ['recall', 'Recall'], ['tempo', 'Tempo'], ['mix', 'Booth'], ['stats', 'Stats']].map(function (o) { return '<button type="button" data-pview="' + o[0] + '" aria-pressed="' + (playView === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (playView === 'word') h += wordView(G.word, n);
    else if (playView === 'target') h += targetView(G.target, n);
    else if (playView === 'recall') h += recallView(G.recall, n);
    else if (playView === 'tempo') h += tempoView(G.tempo, n);
    else if (playView === 'mix') h += setCard(G.set, n);
    else h += statsView(G.stats);
    el('tab-play').innerHTML = h;
  }
  function wordView(wd, n) {
    var o = wd.other, h = '';
    h += '<section class="card"><div class="between"><div class="row">' + (o ? mini(o.colours) : mini([])) + '<div><div class="small" style="font-weight:650">' + esc(n.other) + '</div><div class="small muted">' +
      (!o ? 'Hasn\'t started' : o.done ? (o.won ? 'Got it in ' + o.tries : 'Didn\'t get it') : 'On guess ' + (o.tries + 1) + (o.tries ? '' : '')) + '</div></div></div>' +
      (wd.done ? '<div class="right"><div class="small" style="font-weight:650">You</div><div class="small muted">' + (wd.won ? wd.guesses.length + '/6' : 'X/6') + '</div></div>' : '<span class="chip lilac">Live</span>') + '</div></section>';
    h += stakeCard(S.games, n);
    h += wordBoard(wd);
    if (wd.done) {
      h += '<section class="card center"><div class="eyebrow">Today\'s word</div><div style="font-size:26px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:6px 0">' + esc(wd.answer) + '</div><p class="small muted" style="margin:0">' +
        (o && o.done ? (o.guesses.length ? esc(n.other) + ' guessed: ' + esc(o.guesses.join(', ').toUpperCase()) : '') : 'Waiting for ' + esc(n.other) + '. You\'ll get a notification.') + '</p></section>';
    } else {
      var kc = keyColours(wd);
      h += '<div class="keys">' + KB.map(function (row, i) {
        return '<div class="kr">' + (i === 2 ? '<button class="wide" type="button" data-key="enter">Enter</button>' : '') + row.split('').map(function (ch) { return '<button type="button" data-key="' + ch + '" class="' + (kc[ch] || '') + '">' + ch + '</button>'; }).join('') + (i === 2 ? '<button class="wide" type="button" data-key="back" aria-label="Delete">' + icon('undo', 's') + '</button>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return h;
  }
  function targetView(t, n) {
    var m = t.mine || { best: null, points: 0, expr: '', final: false, tries: 0 }, o = t.other;
    var used = (target.expr.match(/\d+/g) || []).map(Number), pool = t.numbers.slice();
    used.forEach(function (u) { var i = pool.indexOf(u); if (i !== -1) pool.splice(i, 1); });
    var h = '<section class="card"><div class="between"><div><div class="eyebrow">Target</div><div class="num" style="font-size:40px;font-weight:700;letter-spacing:-.02em">' + t.target + '</div></div><div class="right small">' +
      '<div><b>You</b> ' + (m.best !== null ? m.best + ' <span class="muted">(' + (Math.abs(m.best - t.target) ? Math.abs(m.best - t.target) + ' away' : 'exact') + ')</span>' : '<span class="muted">no answer yet</span>') + '</div>' +
      '<div style="margin-top:4px"><b>' + esc(n.other) + '</b> ' + (o && o.best !== null && o.best !== undefined ? (Math.abs(o.best - t.target) ? Math.abs(o.best - t.target) + ' away' : 'exact') : '<span class="muted">not yet</span>') + '</div></div></div>';
    if (m.final) {
      h += '<div class="divider"></div><p class="small" style="margin:0">Locked in: <b>' + esc(m.expr) + ' = ' + m.best + '</b> · ' + m.points + ' points' + (o && o.expr ? '<br>' + esc(n.other) + ': ' + esc(o.expr) + ' = ' + o.best : '') + '</p></section>';
      return h;
    }
    h += '<div class="nums" style="margin-top:14px">' + t.numbers.map(function (x, i) {
      var left = pool.indexOf(x) !== -1; if (left) pool.splice(pool.indexOf(x), 1);
      return '<button type="button" data-num="' + x + '" class="' + (left ? '' : 'used') + '"' + (left ? '' : ' disabled') + '>' + x + '</button>';
    }).join('') + '</div><div class="expr" id="expr">' + (esc(target.expr) || '<span class="muted" style="font-weight:400;font-size:16px">Tap numbers and signs</span>') + '</div>' +
      '<div class="ops">' + ['+', '−', '×', '÷', '(', ')'].map(function (op) { return '<button type="button" data-op="' + op + '">' + op + '</button>'; }).join('') + '</div>' +
      '<div class="grid3" style="margin-top:8px"><button class="btn line" type="button" id="tClear">Clear</button><button class="btn soft" type="button" id="tCheck">Check</button><button class="btn primary" type="button" id="tLock"' + (m.best === null ? ' disabled' : '') + '>Lock in</button></div>' +
      '<p class="tiny muted" style="margin:10px 0 0">Use each number once at most. Exact scores 10, within 5 scores 7, within 10 scores 5. Check as often as you like, then lock in your best.</p></section>';
    return h;
  }
  function recallView(r, n) {
    var m = r.mine, o = r.other, playing = recallGame && recallGame.on;
    var h = '<section class="card"><div class="between"><div><div class="eyebrow">Best today</div><div class="num" style="font-size:28px;font-weight:700">' + (m ? m.best : 0) + '</div></div><div class="right"><div class="small muted">' + esc(n.other) + '</div><div class="num" style="font-size:28px;font-weight:700">' + (o ? o.best : 0) + '</div></div></div>' +
      '<div class="pads" id="pads">' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return '<button type="button" data-pad="' + i + '" aria-label="Pad ' + (i + 1) + '"></button>'; }).join('') + '</div>' +
      '<p class="center small muted" id="recallMsg">' + (playing ? recallGame.msg : 'Watch the pads light up, then tap them in the same order. It gets one longer each round.') + '</p>' +
      (playing ? '' : '<button class="btn primary wide" type="button" id="recallStart">' + (m && m.plays ? 'Play again' : 'Start') + '</button>') + '</section>';
    return h;
  }
  function statsView(st) {
    var w = st.word, max = Math.max.apply(null, w.dist.concat([1]));
    return '<section class="card"><div class="head"><h3>Daily word</h3></div><div class="grid3 center" style="margin-bottom:12px"><div><div class="num" style="font-size:22px;font-weight:700">' + w.played + '</div><div class="tiny muted">played</div></div><div><div class="num" style="font-size:22px;font-weight:700">' + (w.played ? Math.round(w.won / w.played * 100) : 0) + '%</div><div class="tiny muted">won</div></div><div><div class="num" style="font-size:22px;font-weight:700">' + w.streak + '</div><div class="tiny muted">streak</div></div></div>' +
      '<div class="dist">' + w.dist.map(function (c, i) { return '<div class="r"><span class="num">' + (i + 1) + '</span><i style="width:' + Math.max(6, c / max * 100) + '%">' + c + '</i></div>'; }).join('') + '</div>' +
      (w.avg ? '<p class="small muted" style="margin:10px 0 0">Average ' + w.avg + ' guesses when you get it.</p>' : '') + '</section>' +
      '<p class="small muted center">Games give XP too: the fewer guesses, the more you earn.</p>';
  }
  function recallRound() {
    var g = recallGame;
    g.seq.push(Math.floor(Math.random() * 9));
    g.pos = 0; g.input = false; g.msg = 'Watch… (' + g.seq.length + ')';
    renderPlay();
    var i = 0;
    (function flash() {
      var pads = document.querySelectorAll('[data-pad]');
      if (i > 0 && pads[g.seq[i - 1]]) pads[g.seq[i - 1]].classList.remove('lit');
      if (i >= g.seq.length) { g.input = true; g.msg = 'Your turn: ' + g.seq.length + ' to repeat'; var m = el('recallMsg'); if (m) m.textContent = g.msg; return; }
      setTimeout(function () { var p = document.querySelectorAll('[data-pad]')[g.seq[i]]; if (p) { p.classList.add('lit'); chime([440 + g.seq[i] * 60]); } i++; setTimeout(flash, 420); }, 220);
    })();
  }

  // ---------- TRAIN ----------
  // Your plan, plus your own tweaks: swap an exercise, add or drop sets, add exercises.
  // Tweaks are kept for every time you do that session (or just today, if you untick "Keep").
  var EX_LIB = {
    Chest: ['Barbell bench press', 'Incline barbell bench press', 'DB bench press', 'Incline DB press', 'Machine chest press', 'Cable fly', 'Pec deck', 'Dips', 'Push-up'],
    Back: ['Deadlift', 'Trap-bar deadlift', 'Barbell row', 'DB row', 'Chest-supported row', 'Seated cable row', 'T-bar row', 'Lat pulldown', 'Pull-up (or assisted)', 'Chin-up', 'Straight-arm pulldown', 'Face pull', 'Back extension'],
    Shoulders: ['Overhead press', 'Seated DB shoulder press', 'Machine shoulder press', 'Arnold press', 'Cable lateral raise', 'DB lateral raise', 'Rear delt fly', 'Upright row', 'Shrug'],
    Arms: ['EZ-bar curl', 'Barbell curl', 'DB curl', 'Incline DB curl', 'Hammer curl', 'Preacher curl', 'Cable curl', 'Triceps pushdown', 'Overhead cable triceps extension', 'Skull crusher', 'Close-grip bench press', 'Dips (triceps)'],
    Legs: ['Back squat', 'Front squat', 'Goblet squat', 'Hack squat', 'Leg press', 'Bulgarian split squat', 'Walking lunge', 'Romanian deadlift', 'Hip thrust', 'Leg extension', 'Lying leg curl', 'Seated leg curl', 'Standing calf raise', 'Seated calf raise'],
    Core: ['Plank', 'Hanging knee raise', 'Cable crunch', 'Ab wheel', 'Russian twist', 'Pallof press']
  };
  var tsel = null, rest = load('rest'), exTarget = null, tmOpen = {};
  function draftKey() { return 'wk-' + (S.today ? S.today.date : '') + '-' + tsel; }
  function draft() { return load(draftKey()) || {}; }
  function saveDraft(d) { save(draftKey(), d); }
  function blankCust() { return { swap: {}, extra: {}, drop: [], add: [] }; }
  function custKeys(s) { return ['tcust-' + s, 'tcust-' + (S.today ? S.today.date : '') + '-' + s]; }
  function custOf(s) {
    var c = blankCust();
    custKeys(s).forEach(function (k) {
      var x = load(k); if (!x) return;
      Object.keys(x.swap || {}).forEach(function (n) { c.swap[n] = x.swap[n]; });
      Object.keys(x.extra || {}).forEach(function (n) { c.extra[n] = (c.extra[n] || 0) + x.extra[n]; });
      (x.drop || []).forEach(function (n) { if (c.drop.indexOf(n) === -1) c.drop.push(n); });
      (x.add || []).forEach(function (a) { c.add.push(a); });
    });
    return c;
  }
  function editCust(keep, fn) { var k = custKeys(tsel)[keep ? 0 : 1], c = load(k) || blankCust(); fn(c); save(k, c); }
  function prevOf(name) { return ((S.train.prev || {})[String(name).toLowerCase()] || []).filter(function (x) { return x.t !== 'W'; }); }
  function prevText(name, i) { var p = prevOf(name), x = p[i] || p[p.length - 1]; return x ? 'Last ' + x.w + ' × ' + x.r : ''; }
  // Everything on screen for the chosen session, after your tweaks. Keys stay on the planned name so a swap keeps your ticks.
  function trainModel() {
    var p = S.train.plans[tsel] || { main: [], accessories: [] }, c = custOf(tsel), out = [];
    function count(base, id) { return Math.max(1, base + (c.extra[id] || 0)); }
    p.main.forEach(function (m) {
      var id = m.tier + '|' + m.exercise; if (c.drop.indexOf(id) !== -1) return;
      var name = c.swap[id] || m.exercise, swapped = name !== m.exercise, base = m.tm ? m.sets.length : 3, rows = [];
      for (var i = 0; i < count(base, id); i++) {
        var s = m.tm ? m.sets[Math.min(i, m.sets.length - 1)] : null, extra = m.tm && i >= m.sets.length;
        var amrap = s && s.amrap && !extra && !swapped;
        rows.push({ key: id + '|' + i, weight: s && !swapped ? s.weight : '', reps: s ? s.reps : 5, target: s ? s.reps + (amrap ? '+' : '') : '',
          sub: s && !swapped && !extra ? '× ' + s.reps + (amrap ? '+' : '') + ' · ' + s.pct + '%' : prevText(name, i), amrap: amrap });
      }
      out.push({ id: id, name: name, swapped: swapped, tier: swapped ? 'Acc' : m.tier, eyebrow: m.tier === 'T1' ? 'Main lift' : 'Second lift', rest: m.rest, m: m, rows: rows });
    });
    p.accessories.forEach(function (a) { out.push(accModel('Acc|' + a.exercise, a.exercise, a.sets, a.reps, a.rest, a.rpe, a.suggest, a, c)); });
    c.add.forEach(function (a) { out.push(accModel('Add|' + a.exercise, a.exercise, a.sets, a.reps, a.rest, '', null, null, c)); });
    return out.filter(function (x) { return x && c.drop.indexOf(x.id) === -1; });
  }
  function accModel(id, planned, sets, reps, rst, rpe, suggest, a, c) {
    var name = c.swap[id] || planned, swapped = name !== planned, low = +((String(reps).match(/\d+/) || [8])[0]), n = Math.max(1, +sets + (c.extra[id] || 0)), rows = [];
    for (var i = 0; i < n; i++) {
      var pv = prevOf(name), x = pv[i] || pv[pv.length - 1];
      rows.push({ key: id + '|' + i, weight: !swapped && suggest !== null && suggest !== undefined ? suggest : x ? x.w : '', reps: low, target: reps, sub: prevText(name, i) });
    }
    return { id: id, name: name, swapped: swapped, tier: 'Acc', eyebrow: n + ' × ' + reps + (rpe ? ' · RPE ' + rpe : '') + ' · rest ' + rst, rest: rst, a: swapped ? null : a, rows: rows };
  }
  function setRow(r, n, d, rst) {
    var x = d[r.key] || {}, done = !!x.done, reps = x.reps !== undefined ? x.reps : r.reps, w = x.weight !== undefined && x.weight !== null ? x.weight : r.weight;
    return '<div class="set' + (done ? ' done' : '') + '" data-key="' + esc(r.key) + '"><span class="n">' + n + '</span>' +
      '<div class="setw"><span class="wkg"><input type="number" inputmode="decimal" step="0.5" min="0" value="' + esc(w) + '" placeholder="–" data-sw aria-label="Weight in kg"><span class="u">kg</span></span>' + (r.sub ? '<span class="tiny ' + (r.amrap ? 'amrap' : 'muted') + '">' + esc(r.sub) + '</span>' : '') + '</div>' +
      '<div class="stepper"><button type="button" data-rd="-1" aria-label="One rep fewer">−</button><input type="number" inputmode="numeric" min="0" value="' + esc(reps) + '" data-sr aria-label="Reps"><button type="button" data-rd="1" aria-label="One rep more">+</button></div>' +
      '<button class="check' + (done ? ' on' : '') + '" type="button" data-set="' + esc(r.key) + '" data-rest="' + esc(rst) + '" aria-label="Set done">' + icon('check') + '</button></div>';
  }
  function spark(vals) {
    if (vals.length < 2) return '';
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * 300).toFixed(1) + ',' + (40 - (mx === mn ? .5 : (v - mn) / (mx - mn)) * 34).toFixed(1); }).join(' ');
    return '<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="var(--ring-b)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function doneCount() { var d = draft(); return Object.keys(d).filter(function (k) { return d[k].done; }).length; }
  function drawFinish() { var b = el('finishWk'), n = doneCount(); if (b) { b.disabled = !n; b.textContent = 'Finish workout · ' + n + ' set' + (n === 1 ? '' : 's'); } }
  function drawRest() {
    var r = el('restSlot'); if (!r) return;
    r.innerHTML = rest ? '<div class="rest"><span>Rest <b id="restLeft">' + clock(rest.until - now()) + '</b></span><span class="row" style="gap:6px"><button type="button" data-restadd="-15">−15s</button><button type="button" data-restadd="15">+15s</button><button type="button" id="restSkip">Skip</button></span></div>' : '';
  }
  function armRest() {
    if (!rest) return later('clearTimer', ['rest']);
    var secs = Math.round((rest.until - now()) / 1000);
    if (secs >= 5) later('setTimer', ['rest', secs, 'Rest over', 'Next set: you\'ve got this.', 'train']);
  }
  function startRest(secs) { if (!(secs > 0)) return; rest = { until: now() + secs * 1000 }; save('rest', rest); drawRest(); armRest(); }
  function endRest() { rest = null; save('rest', null); drawRest(); }
  var trainLater = false;
  function renderTrain() {
    if (!ME) return;
    // don't redraw under your thumb: a background refresh waits until you leave the box
    var ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT' && ae.closest('#tab-train') && !ae.closest('form')) { trainLater = true; return; }
    trainLater = false;
    var t = S.train;
    if (!tsel || !t.plans[tsel]) tsel = load('tsel-' + S.today.date) || t.today || t.sessions[0];
    if (!t.plans[tsel]) tsel = t.sessions[0];
    var d = draft(), h = '<div class="top"><div><h1>Train</h1><div class="sub">' + (t.today ? 'Today: ' + esc(t.today) : 'Rest day. Next up: ' + esc(t.rotationNext || '') + '. Train any session you like.') + '</div></div>' + meButton() + '</div>';
    // one rotation indicator: the three sessions in order, the one you're on lit up; any other session from the picker
    if (t.rotation) h += '<section class="card spot trainhero"><div class="eyebrow" style="margin-bottom:8px">' + (t.today ? 'Today' : 'Rotation') + '</div><div class="rotstrip" aria-label="Your training rotation">' + t.rotation.map(function (r) { var cur = r === tsel; return '<button type="button" class="rot' + (cur ? ' on' : '') + (r === (t.today || t.rotationNext) ? ' next' : '') + '" data-tsel="' + esc(r) + '" aria-pressed="' + cur + '">' + esc(r) + '</button>'; }).join('<span class="rotarr" aria-hidden="true">›</span>') + '</div>' +
      '<div class="rotmeta"><span class="tiny muted">Next is the one you\'ve gone longest without. Logging any session moves it on.</span>' +
      (t.sessions.filter(function (s) { return t.rotation.indexOf(s) === -1; }).length ? '<label class="tiny rotpick">Other session <select data-tselect="1" aria-label="Pick a different session"><option value="">Choose…</option>' + t.sessions.filter(function (s) { return t.rotation.indexOf(s) === -1; }).map(function (s) { return '<option value="' + esc(s) + '"' + (s === tsel ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' : '') + '</div>' + '</section>';
    h += '<div id="restSlot"></div>';
    if (t.doneToday) h += '<div class="note">Today\'s workout is logged. Great work. You can log another below.</div>';
    else {
      if (tsel !== t.today) h += '<div class="swap"><div class="grow"><b>Doing ' + esc(tsel) + ' today?</b><div class="tiny muted">' + (t.today ? 'Planned: ' + esc(t.today) : 'Today is a rest day') + '. Switching moves your calendar and gym task too.</div></div><button class="btn primary sm" type="button" data-setsession="' + esc(tsel) + '">Switch</button></div>';
      else if (t.changed) h += '<div class="swap"><div class="grow small">Changed from ' + (t.planned ? esc(t.planned) : 'a rest day') + '.</div><button class="btn line sm" type="button" data-setsession="' + esc(t.planned) + '" data-undo="1">Undo</button></div>';
      var hints = [];
      if (t.rotationNext && t.rotationNext !== tsel && !t.today) hints.push('<button class="chip lilac" type="button" data-tsel="' + esc(t.rotationNext) + '">Next in the rotation: ' + esc(t.rotationNext) + '</button>');
      if (t.today) hints.push('<button class="chip" type="button" data-setsession="" data-rest="1">Make today a rest day</button>');
      if (S.health && S.health.readiness) hints.unshift('<span class="chip ' + (S.health.readiness.score >= 80 ? 'good' : S.health.readiness.score >= 60 ? 'lilac' : 'pink') + '">' + icon('bolt', 's') + 'Readiness ' + S.health.readiness.score + '</span>');
      if (hints.length) h += '<div class="chips" style="margin:-4px 0 14px">' + hints.join('') + '</div>';
    }
    trainModel().forEach(function (x) {
      var m = x.m, a = x.a;
      h += '<section class="card"><div class="head"><div><div class="eyebrow">' + esc(x.eyebrow) + (x.swapped ? ' · swapped' : '') + '</div><h2 style="margin-top:2px;font-size:19px">' + esc(x.name) + '</h2></div><span class="row" style="gap:6px">' + (m && m.tm && !x.swapped ? '<button class="chip pink" type="button" data-tmedit="' + esc(m.basedOn) + '" aria-label="Change training max">TM ' + m.tm + ' kg ' + icon('edit', 's') + '</button>' : '') +
        '<button class="iconbtn" style="width:34px;height:34px" type="button" data-exmenu="' + esc(x.id) + '" aria-label="Change ' + esc(x.name) + '">' + icon('more', 's') + '</button></span></div>';
      if (m && !x.swapped && (!m.tm || tmOpen[m.basedOn])) h += '<p class="small muted" style="margin:0 0 10px">' + (m.tm ? 'Weights too light or heavy? Enter a recent hard set of ' + esc(m.basedOn) + ' (e.g. 80 kg × 10) and every set is recalculated.' : 'Set a training max for ' + esc(m.basedOn) + ' to get planned weights: enter a set you did recently with good form. Or just log below.') + '</p><form class="inline" data-tm="' + esc(m.basedOn) + '" style="margin-bottom:8px"><input type="number" inputmode="decimal" placeholder="kg" aria-label="Weight"><input type="number" inputmode="numeric" placeholder="reps" aria-label="Reps"><button class="btn primary" type="submit">Update TM</button></form>';
      if (a && a.bumped) h += '<p class="small" style="margin:0 0 6px;color:var(--good)">Top of the range last time: try ' + a.suggest + ' kg</p>';
      h += x.rows.map(function (r, i) { return setRow(r, i + 1, d, x.rest); }).join('');
      h += '<div class="row" style="gap:8px;margin-top:8px"><button class="btn line sm" type="button" data-exset="1" data-ex="' + esc(x.id) + '">' + icon('plus', 's') + 'Add set</button>' + (x.rows.length > 1 ? '<button class="btn line sm" type="button" data-exset="-1" data-ex="' + esc(x.id) + '">Remove set</button>' : '') + '</div>';
      if (m && m.tier === 'T1' && m.tm && !x.swapped) h += '<p class="tiny muted" style="margin:8px 0 0">Sets marked <span class="amrap">+</span>: as many good reps as you can. The heavy one sets next week\'s training max.</p>';
      h += '</section>';
    });
    h += '<button class="btn line wide" type="button" id="addEx" style="margin-bottom:12px">' + icon('plus', 's') + 'Add an exercise</button>';
    var count = doneCount();
    h += '<button class="btn primary big wide" type="button" id="finishWk"' + (count ? '' : ' disabled') + '>Finish workout · ' + count + ' set' + (count === 1 ? '' : 's') + '</button>';
    if (load(custKeys(tsel)[0]) || load(custKeys(tsel)[1])) h += '<p class="center" style="margin:10px 0 0"><button class="linkbtn small muted" type="button" id="resetCust">Undo my changes to ' + esc(tsel) + '</button></p>';
    var pr = t.progress;
    h += '<section class="card" style="margin-top:14px"><div class="head"><h3>Progress</h3><span class="small muted">' + pr.workouts + ' workout' + (pr.workouts === 1 ? '' : 's') + '</span></div>' + pr.lifts.map(function (l) {
      var last = l.tmHistory.filter(function (x) { return x.reps; }).slice(-1)[0];
      return '<div class="item" style="display:block"><div class="between"><div><div class="t">' + esc(l.lift) + '</div><div class="m">' + (l.best ? 'Best est. 1RM ' + Math.round(l.best) + ' kg' : 'No sets yet') + (last ? ' · last heavy set ' + last.reps + ' reps' : '') + '</div></div><div class="num" style="font-size:20px;font-weight:700">' + (l.tm ? l.tm + '<span class="tiny muted"> kg</span>' : '–') + '</div></div>' + spark(l.tmHistory.map(function (x) { return x.tm; })) + '</div>';
    }).join('');
    if (pr.weeks.length) { var mx = Math.max.apply(null, pr.weeks.map(function (w) { return w.volume; })) || 1; h += '<div class="eyebrow" style="margin-top:12px">Weekly volume</div><div class="vol">' + pr.weeks.map(function (w) { return '<div title="' + esc(w.week) + '" style="height:' + Math.max(4, w.volume / mx * 100) + '%"></div>'; }).join('') + '</div>'; }
    h += '</section>';
    var tt = el('tab-train'), y = window.scrollY;
    h += '<section class="card quiet"><div class="between"><div><b>Bring in your history</b><div class="tiny muted">A workout export from Strong or Liftoff (.csv). Each workout is logged on its own day, with its XP. Safe to import twice.</div></div><label class="btn soft sm">Import<input type="file" accept=".csv,text/csv" id="wkImport" hidden></label></div></section>';
    tt.innerHTML = h;
    drawRest();
    if (tt.offsetParent) window.scrollTo(0, y);
  }
  var exNames = [].concat.apply([], Object.keys(EX_LIB).map(function (g) { return EX_LIB[g]; }));
  function exList() { return '<datalist id="exAll">' + exNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'; }
  var keepBox = function () { return '<label class="row small" style="gap:8px;margin:12px 0"><input type="checkbox" id="exKeep" checked style="width:20px;height:20px"> Keep this for every ' + esc(tsel) + '</label>'; };
  function exMenu(id) {
    var x = trainModel().filter(function (e) { return e.id === id; })[0]; if (!x) return;
    exTarget = id;
    openSheet('<h2 style="margin:0 0 4px">' + esc(x.name) + '</h2><p class="small muted" style="margin:0 0 12px">Machine taken? Fancy something else? Swap it, or take it out.</p>' +
      '<form id="exSwap" class="inline" autocomplete="off"><input type="text" list="exAll" id="exSwapName" placeholder="Swap for…" aria-label="Swap for"><button class="btn primary" type="submit">Swap</button></form>' + exList() +
      keepBox() +
      (x.swapped ? '<button class="btn line wide" type="button" data-exback="1" style="margin-bottom:8px">Back to ' + esc(id.split('|')[1]) + '</button>' : '') +
      '<button class="btn line wide" type="button" data-exdrop="1" style="color:var(--bad, #c0392b)">Remove from this workout</button>');
  }
  function addExSheet() {
    openSheet('<h2 style="margin:0 0 12px">Add an exercise</h2><form id="exAdd" autocomplete="off"><input type="text" list="exAll" id="exAddName" placeholder="Exercise, e.g. Cable lateral raise" aria-label="Exercise" required style="width:100%;margin-bottom:8px">' + exList() +
      '<div class="grid2" style="gap:8px"><label class="small muted">Sets<input type="number" inputmode="numeric" id="exAddSets" value="3" min="1" max="10"></label><label class="small muted">Reps<input type="text" id="exAddReps" value="8-12"></label></div>' +
      '<label class="small muted" style="display:block;margin-top:8px">Rest<input type="text" id="exAddRest" value="90s"></label>' + keepBox() +
      '<button class="btn primary wide" type="submit">Add</button></form>');
  }
  function finishWorkout() {
    var d = draft(), sets = [];
    trainModel().forEach(function (x) {
      x.rows.forEach(function (r, i) {
        var s = d[r.key]; if (!s || !s.done) return;
        var w = s.weight !== undefined && s.weight !== null ? s.weight : r.weight;
        sets.push({ exercise: x.name, tier: x.tier, set: i + 1, weight: +w || 0, reps: +s.reps || 0, target: String(r.target) });
      });
    });
    if (!sets.length) return toast('Tick at least one set first.', true);
    var bad = sets.filter(function (s) { return !s.reps; }).length;
    if (bad && !confirm(bad + ' ticked set' + (bad === 1 ? ' has' : 's have') + ' 0 reps and won\'t be saved. Finish anyway?')) return;
    el('finishWk').disabled = true; el('finishWk').textContent = 'Saving…';
    call('saveWorkout', [tsel, sets, { started: load('wkstart-' + draftKey()) || 0 }], function (res) {
      save(draftKey(), null); save('wkstart-' + draftKey(), null); endRest(); armRest();
      apply(res.state);
      confetti(true); chime([660, 880, 1100, 1320]); buzz([60, 40, 60, 40, 150]);
      var h = '<div class="center">' + icon('trophy', 'l') + '<h2 style="margin:8px 0">Workout logged</h2>' + (res.volume ? '<p class="muted" style="margin:0 0 10px">' + res.sets + ' sets · ' + fmt(res.volume) + ' kg lifted' + (res.minutes ? ' · ' + res.minutes + ' min' : '') + '</p>' : '') + '</div>';
      (res.changes || []).forEach(function (c) { h += '<section class="card tint">' + '<b>' + esc(c.lift) + '</b>: ' + c.reps + ' reps on the heavy set<br>' + (c.change ? 'Training max ' + c.from + ' → <b>' + c.to + ' kg</b>' : 'Training max stays at ' + c.from + ' kg. Go again next week.') + '</section>'; });
      (res.prs || []).slice(0, 3).forEach(function (r) { h += '<section class="card blush"><b>New record.</b> ' + esc(r.exercise) + ' ' + r.weight + ' kg × ' + r.reps + (r.e1rm ? ' (est. 1RM ' + Math.round(r.e1rm) + ' kg)' : '') + '</section>'; });
      openSheet(h + '<button class="btn primary wide" type="button" data-close>Done</button>');
    }, function () { drawFinish(); });
  }
  document.addEventListener('focusout', function (ev) { if (trainLater && ev.target.closest && ev.target.closest('#tab-train')) setTimeout(function () { var ae = document.activeElement; if (trainLater && !(ae && ae.tagName === 'INPUT' && ae.closest('#tab-train'))) renderTrain(); }, 0); });
  // typing a weight or reps saves straight away, so nothing is lost when the page refreshes
  document.addEventListener('input', function (ev) {
    var row = ev.target.closest && ev.target.closest('.set[data-key]'); if (!row) return;
    var d = draft(), k = row.getAttribute('data-key'); d[k] = d[k] || {};
    if (ev.target.hasAttribute('data-sw')) d[k].weight = ev.target.value === '' ? null : +ev.target.value;
    if (ev.target.hasAttribute('data-sr')) d[k].reps = ev.target.value === '' ? 0 : Math.max(0, Math.round(+ev.target.value));
    saveDraft(d);
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.id === 'exSwap') {
      ev.preventDefault();
      var nm = el('exSwapName').value.trim(), id = exTarget; if (!nm || !id) return;
      editCust(el('exKeep').checked, function (c) { c.swap[id] = nm.slice(0, 60); });
      closeSheet(); renderTrain(); toast('Swapped to ' + nm + '.');
    }
    if (f.id === 'exAdd') {
      ev.preventDefault();
      var an = el('exAddName').value.trim(); if (!an) return;
      var item = { exercise: an.slice(0, 60), sets: Math.max(1, Math.min(10, +el('exAddSets').value || 3)), reps: el('exAddReps').value.trim() || '8-12', rest: el('exAddRest').value.trim() || '90s' };
      editCust(el('exKeep').checked, function (c) { c.add = c.add.filter(function (a) { return a.exercise !== item.exercise; }); c.add.push(item); });
      closeSheet(); renderTrain(); toast(an + ' added.');
    }
  });

  // ---------- FOOD ----------
  var pending = [], ideas = null;
  function itemsText(items) { return items.map(function (i) { return i.name; }).join(', ') + ' (+' + fmt(items.reduce(function (s, i) { return s + i.kcal; }, 0)) + ' kcal, ' + fmt(items.reduce(function (s, i) { return s + i.protein; }, 0)) + 'g)'; }
  function renderFood() {
    if (!ME) return;
    var F = S.food, t = F.targets, kcal = F.totals.kcal, prot = F.totals.protein;
    pending.forEach(function (p) { kcal += p.kcal; prot += p.protein; });
    var kl = t.kcal - kcal, pl = t.proteinMin - prot, scale = t.proteinMax * 1.15;
    var h = '<div class="top"><div><h1>Food</h1><div class="sub">' + fmt(kcal) + ' kcal · ' + fmt(prot) + 'g protein so far</div></div>' + meButton() + '</div>';
    h += '<section class="card spot"><div class="eyebrow">Calories</div><div class="between" style="align-items:baseline"><div><span class="big">' + fmt(kcal) + '</span> <span class="of">/ ' + fmt(t.kcal) + '</span></div><div class="left ' + (kl >= 0 ? 'good' : 'warn') + '">' + (kl >= 0 ? fmt(kl) + ' left' : fmt(-kl) + ' over') + '</div></div>' +
      '<div class="bar' + (kl < 0 ? ' over' : '') + '" style="margin:8px 0 16px"><i style="width:' + Math.min(100, kcal / t.kcal * 100) + '%"></i></div>' +
      '<div class="eyebrow">Protein</div><div class="between" style="align-items:baseline"><div><span class="big">' + fmt(prot) + 'g</span> <span class="of">/ ' + t.proteinMin + '–' + t.proteinMax + 'g</span></div><div class="left ' + (pl > 0 ? '' : 'good') + '">' + (pl > 0 ? fmt(pl) + 'g to go' : prot > t.proteinMax ? 'Above range' : 'In range') + '</div></div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + Math.min(100, prot / scale * 100) + '%"></i><span class="zone" style="left:' + (t.proteinMin / scale * 100) + '%;width:' + ((t.proteinMax - t.proteinMin) / scale * 100) + '%"></span></div></section>';
    h += '<section class="card"><form class="inline" id="quick" autocomplete="off"><input type="text" id="quickText" placeholder="2 protein weetabix and 200ml milk" aria-label="What did you eat?"' + (F.hasClaudeKey ? '' : ' disabled') + '><button class="btn primary" id="quickBtn" type="submit"' + (F.hasClaudeKey ? '' : ' disabled') + '>Add</button></form>' +
      '<p class="small muted" style="margin:8px 0 0" id="quickNote">' + (F.hasClaudeKey ? 'Describe it, Claude works out the numbers.' : 'Add your Claude API key in You, Settings to describe food in words.') + '</p>' +
      (F.hasClaudeKey ? '<label class="btn soft wide" style="margin-top:10px">' + icon('camera', 's') + 'Snap or share a photo<input type="file" accept="image/*" capture="environment" id="foodPhoto" hidden></label>' : '') +
      (F.hasClaudeKey ? '<button class="btn soft wide" type="button" id="ideas" style="margin-top:10px">' + icon('sparkles', 's') + 'What could I eat?</button>' : '') + '</section>';
    if (ideas) h += '<section class="card tint"><div class="head"><h3>Ideas that fit today</h3><button class="iconbtn" type="button" id="ideasClose" aria-label="Close ideas">' + icon('x', 's') + '</button></div>' + ideas.map(function (i, k) {
      return '<div class="item"><div class="grow"><div class="t">' + esc(i.name) + '</div><div class="m">' + i.kcal + ' kcal · ' + i.protein + 'g · ' + esc(i.why) + '</div></div><button class="btn primary sm" type="button" data-idea="' + k + '">Log</button></div>';
    }).join('') + '</section>';
    h += '<div class="grid2" id="presets" style="margin-bottom:12px">' + F.presets.map(function (p, i) { return '<button class="preset" type="button" data-preset="' + i + '">' + esc(p.name) + '<small>' + fmt(p.kcal) + ' kcal · ' + fmt(p.protein) + 'g</small></button>'; }).join('') + '</div>';
    var rows = pending.map(function (p) { return { time: '…', item: p.name, kcal: p.kcal, protein: p.protein, pending: true }; }).concat(F.entries.slice().reverse());
    h += '<section class="card entries"><div class="head"><h3>Today</h3><button class="btn ghost sm" type="button" id="undo"' + (F.entries.length ? '' : ' disabled') + '>' + icon('undo', 's') + 'Undo last</button></div>' +
      (rows.length ? rows.map(function (e) { return e.pending ? '<div class="item pending"><span class="tm">' + esc(e.time) + '</span><span class="grow">' + esc(e.item) + '</span><span class="v">' + fmt(e.kcal) + ' · ' + fmt(e.protein) + 'g</span></div>' :
        '<div class="item fooditem"><button type="button" class="foodrow" data-fedit="' + esc(e.entry) + '" data-fitem="' + esc(e.item) + '"><span class="tm">' + esc(e.time) + '</span><span class="grow">' + esc(e.item) + '</span><span class="v">' + fmt(e.kcal) + ' · ' + fmt(e.protein) + 'g</span></button>' +
        '<button type="button" class="iconbtn sm" data-fdel="' + esc(e.entry) + '" data-fitem="' + esc(e.item) + '" aria-label="Remove ' + esc(e.item) + '">' + icon('x', 's') + '</button></div>'; }).join('') + '<p class="tiny muted" style="margin:8px 0 0">Tap an item to change it, or the cross to remove it.</p>' : '<p class="empty">Nothing yet today.</p>') + '</section>';
    h += '<p class="small muted center">Edit the quick-add buttons and targets in your Sheet.</p>';
    el('tab-food').innerHTML = h;
  }

  // ---------- YOU (profile, lists, settings) ----------
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; var ni = el('navInstall'); if (ni) ni.hidden = false; if (current === 'you') renderYou(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; var ni = el('navInstall'); if (ni) ni.hidden = true; toast('Installed. Open Nudge from your apps.'); });
  function standalone() { return window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function renderYou() {
    var g = S.game, n = names(), th = document.documentElement.getAttribute('data-theme'), h = '';
    h += '<div class="top"><div class="row"><button class="iconbtn" type="button" data-goto="home" aria-label="Back">' + icon('back') + '</button><h1>You</h1></div></div>';
    h += charCard();
    if (S.wardrobe) h += '<section class="card spot av-card"><div class="av3d tall" id="av3dYou"><div class="av3d-msg small muted center">Loading…</div></div><button class="btn primary wide" type="button" data-dress="open">' + icon('sparkles', 's') + 'Dressing room</button></section>';
    h += '<div class="grid2" style="margin-bottom:12px"><button class="btn soft" type="button" data-goto="empire">' + icon('building', 's') + 'Your empire</button><button class="btn soft" type="button" data-goto="custom">' + icon('sparkles', 's') + 'Customise</button></div>';
    h += '<section class="card tint"><div class="between"><div><div class="eyebrow" style="color:var(--lilac)">Level ' + g.level.level + (S.fun && S.fun.era ? ' · ' + esc(S.fun.era) : '') + '</div><div class="num" style="font-size:28px;font-weight:700">' + fmt(g.total) + ' XP</div></div></div>' +
      '<div class="bar" style="margin-top:10px;background:var(--surface)"><i style="width:' + Math.round(g.level.into / g.level.need * 100) + '%"></i></div><div class="tiny muted" style="margin-top:6px">' + (g.level.need - g.level.into) + ' XP to level ' + (g.level.level + 1) + ' · best streak ' + g.streak.best + (g.streak.best === 1 ? ' day' : ' days') + '</div>' + (S.fun && S.fun.nextEra && S.fun.nextEra !== S.fun.era ? '<div class="tiny muted" style="margin-top:2px">Next era: ' + esc(S.fun.nextEra) + '</div>' : '') + '</section>';
    var wk = g.week, mo = g.month, me = S.who, ot = S.who === 'me' ? 'partner' : 'me', mxw = Math.max(wk.me, wk.partner, 1), tot = Math.max(1, mo.me + mo.partner);
    h += '<section class="card"><div class="head"><h3>This week</h3></div>' +
      '<div class="score"><span>You</span><span class="bar"><i style="width:' + (wk[me] / mxw * 100) + '%"></i></span><b class="num right">' + wk[me] + '</b></div>' +
      '<div class="score"><span>' + esc(n.other) + '</span><span class="bar"><i style="width:' + (wk[ot] / mxw * 100) + '%"></i></span><b class="num right">' + wk[ot] + '</b></div>' +
      '<p class="small muted" style="margin:8px 0 0">This month you\'ve done ' + Math.round(mo[me] / tot * 100) + '% of the shared XP.</p></section>';
    h += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('cart', 's') + 'Shopping</h3></div><form class="inline" id="shopForm" autocomplete="off"><input type="text" id="shopText" placeholder="Eggs, bin bags…" aria-label="Add to the list"><button class="btn primary" type="submit">Add</button></form>' +
      (ME && S.food && S.food.totals.protein < S.food.targets.proteinMin ? '<div class="chips" style="margin-top:10px">' + ['Greek yogurt', 'Chicken breast', 'Eggs', 'Tinned tuna', 'Cottage cheese'].map(function (x) { return '<button class="chip pink" type="button" data-addshop="' + x + '">' + icon('plus', 's') + x + '</button>'; }).join('') + '</div>' : '') +
      '<div style="margin-top:6px">' + (S.shopping.length ? S.shopping.map(function (it) { return '<div class="item' + (it.got ? ' done' : '') + '"><button class="check' + (it.got ? ' on' : '') + '" type="button" data-shop="' + esc(it.id) + '" aria-label="Got it">' + icon('check') + '</button><div class="t grow" style="font-weight:500">' + esc(it.item) + '</div><button class="iconbtn sm" type="button" data-shopdel="' + esc(it.id) + '" aria-label="Remove ' + esc(it.item) + '">' + icon('x', 's') + '</button></div>'; }).join('') : '<p class="empty">The list is empty.</p>') + '</div></section>';
    h += laterCard();
    // settings
    if (window.NudgeSetup) h += NudgeSetup.settingsCard();
    h += '<section class="card"><div class="head"><h3>Settings</h3></div>';
    h += '<div class="eyebrow" style="margin-bottom:6px">Your look</div>' + lookPicker();
    h += '<div class="eyebrow" style="margin:6px 0">Notifications</div>';
    if (MODE === 'gas') h += '<p class="small muted" style="margin:0 0 12px">Push notifications work in the installed app. Open your new app link from the Config tab of your Sheet.</p>';
    else if (!('Notification' in window) || !('serviceWorker' in navigator)) h += '<p class="small muted" style="margin:0 0 12px">' + (/iPhone|iPad/.test(navigator.userAgent) && !standalone() ? 'On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there.' : 'This browser can\'t show notifications.') + '</p>';
    else if (!S.push.configured) h += '<p class="small muted" style="margin:0 0 12px">Notifications aren\'t set up on the server yet.</p>';
    else h += '<div class="between" style="margin-bottom:12px"><span class="small">' + (Notification.permission === 'granted' && S.push.devices ? 'On for this phone' : Notification.permission === 'denied' ? 'Blocked in your phone settings' : 'Off') + '</span><button class="btn ' + (Notification.permission === 'granted' && S.push.devices ? 'line' : 'primary') + ' sm" type="button" id="pushOn">' + icon('bell', 's') + (Notification.permission === 'granted' && S.push.devices ? 'Test' : 'Turn on') + '</button></div>';
    if (MODE !== 'gas' && S.push && S.push.configured) h += pushDetails();
    if (MODE === 'web' && !standalone()) h += '<div class="between" style="margin-bottom:12px"><span class="small">Install as an app</span>' + (deferredInstall ? '<button class="btn primary sm" type="button" id="install">' + icon('download', 's') + 'Install</button>' : '<span class="tiny muted right">' + (/iPhone|iPad/.test(navigator.userAgent) ? 'Share, then Add to Home Screen' : 'Menu, then Install app') + '</span>') + '</div>';
    if (ME) h += '<div class="eyebrow" style="margin:6px 0">Claude API key</div><form class="inline" id="keyForm" autocomplete="off"><input type="password" id="keyText" placeholder="' + (S.hasClaudeKey ? 'Saved. Paste a new one to replace it' : 'sk-ant-…') + '" aria-label="Claude API key"><button class="btn primary" type="submit">Save</button></form><p class="tiny muted" style="margin:6px 0 0">Powers Ask, the morning brief, meal ideas and food quick-add. Get one at console.anthropic.com.</p>';
    h += '</section><p class="small muted center">Chores, routines, lifts and targets can all be changed in your Google Sheet.</p>';
    el('tab-you').innerHTML = h;
    mountYou3d();
  }

  // ---------- FUN: Us, stakes, Tempo, intro ----------
  var usOpen = false, diceIdea = '';
  var DICE = ['Candles on, phones in a drawer', 'Ten-minute massage each, then see what happens', 'Shower together', 'Slow dance in the kitchen: one song each',
    'Make tonight\'s playlist together', 'Recreate your first date', 'Lights on', 'Somewhere other than the bedroom', 'Blindfold taste test',
    'Loser of today\'s word is in charge', 'Dress up like it\'s a night out, then stay in', 'Start with a kiss that lasts a whole song',
    'Late Registration, start to finish, as background music', 'Lights low, a DJ set on the speakers', 'Truth or dare, house rules', 'Breakfast in bed, but at night'];
  var chatUnread = 0;
  /** Us: opens the private chat. Only a count shows here, never what was said. */
  function usCard() {
    var u = S.fun && S.fun.us;
    if (!u || S.solo) return '';
    var n = names();
    return '<button class="card us usopen" type="button" data-fun="chat"><span class="row" style="gap:10px">' + avatarOf(S.who === 'me' ? 'partner' : 'me', 40) +
      '<span class="grow" style="text-align:left"><b>Us</b> <span class="chip">' + icon('lock', 's') + 'Private</span><br><span class="small muted">' + (chatUnread ? chatUnread + ' new message' + (chatUnread === 1 ? '' : 's') + ' from ' + esc(n.other) : 'Chat with ' + esc(n.other) + ' · ' + u.week + ' this week') + '</span></span>' +
      (chatUnread ? '<span class="badge">' + chatUnread + '</span>' : icon('chevron', 's')) + '</span></button>';
  }
  /** The Us stats and badges, shown at the top of the chat. */
  function usStats() {
    var u = S.fun && S.fun.us; if (!u) return '';
    var got = u.badges.filter(function (b) { return b.earned; }).length;
    return '<div class="row us-line"><span class="small"><b>' + u.week + '</b> this week · <b>' + u.month + '</b> this month · <b>' + u.heat + '</b> wk' + (u.heat === 1 ? '' : 's') + ' running</span>' +
      '<button class="btn soft sm" type="button" data-fun="usLog">' + icon('flame', 's') + '+20 XP</button></div>' +
      '<details class="us-badges"><summary class="tiny muted">Badges · ' + got + ' of ' + u.badges.length + '</summary><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">' + u.badges.map(function (b) { return '<span class="chip' + (b.earned ? ' pink' : '') + '" title="' + esc(b.desc) + '">' + esc(b.name) + '</span>'; }).join('') + '</div></details>';
  }
  var chatApi = {
    cfg: function () { return S && S.chat; }, firebase: function () { return CFG.firebase; }, esc: esc, icon: icon, names: names, toast: toast,
    avatar: function (who, size) { return avatarOf(who, size); }, stats: usStats, dice: function () { return DICE; }, haptic: buzz,
    sheet: function (h) { openSheet(h); }, closeSheet: closeSheet,
    ping: function () { rpc('chatPing', []).catch(function () {}); },
    badge: function (n) { if (n !== chatUnread) { chatUnread = n; if (current === 'home' && !homeEditing) renderHome(); } },
    live: function (d) { livePartner(d); }
  };
  function startChat() { if (window.NudgeChat && S && S.chat && !S.solo) NudgeChat.init(chatApi); }
  /** Your partner did something: their numbers change here within a second (the server catches up in the background). */
  var liveT = 0;
  function livePartner(d) {
    if (!S || !S.game || !d) return;
    if (typeof d.xpToday === 'number') S.game.otherXpToday = d.xpToday;
    var w = S.game.win; if (w && d.win && w.partner) { w.partner = Object.assign({}, w.partner, d.win); w.both = w.won && w.partner.won; }
    if (current === 'home' && !homeEditing) renderHome();
    if (Date.now() - liveT > 15000) { liveT = Date.now(); setTimeout(refreshQuiet, 1500); }
  }
  var pulseT = null;
  function pulseLive() {
    if (!window.NudgeChat || !S || !S.game) return;
    clearTimeout(pulseT);
    pulseT = setTimeout(function () { var w = S.game.win || {}; NudgeChat.pulse({ xpToday: S.game.xpToday, win: { done: w.done || 0, need: w.need || 0, won: !!w.won, by: w.by || 'jobs' } }); }, 250);
  }

  // ---- word stakes ----
  var STAKES = ['Loser makes the tea', 'Loser does the dishes', 'Winner picks the film', 'Winner picks the takeaway', 'Loser gives a 10-minute massage',
    'Winner picks tonight\'s playlist', 'Loser does the next bin run', 'Loser plays the winner\'s favourite album, start to finish'];
  function stakeCard(G, n) {
    var st = G.stake, wd = G.word, o = wd.other;
    if (st) {
      var res = st.result === 'draw' ? 'A draw. You both owe each other.' : st.result === 'you' ? 'You win. ' + n.other + ' owes you.' : st.result === 'them' ? n.other + ' wins. You owe them.' : 'Set by ' + (st.by === 'you' ? 'you' : n.other);
      return '<div class="stake">' + icon('trophy', 's') + '<div class="grow"><div class="tiny muted">Today\'s stakes</div><b>' + esc(st.text) + '</b><div class="small' + (st.result ? '' : ' muted') + '">' + esc(res) + '</div></div></div>';
    }
    if (wd.done || (o && o.done)) return '';
    return '<div class="stake">' + icon('trophy', 's') + '<div class="grow small">Play for something?</div><button class="btn soft sm" type="button" data-fun="stakes">Set stakes</button></div>';
  }
  function stakeSheet() {
    openSheet('<h2>Today\'s stakes</h2><p class="small muted" style="margin:4px 0 12px">Fewest guesses wins. ' + esc(names().other) + ' gets a notification.</p><div class="stack">' +
      STAKES.map(function (x) { return '<button class="btn line wide" type="button" data-stake="' + esc(x) + '" style="justify-content:flex-start">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<form class="inline" id="stakeForm" autocomplete="off" style="margin-top:12px"><input type="text" id="stakeText" placeholder="Or make your own" maxlength="60" aria-label="Your stakes"><button class="btn primary" type="submit">Set</button></form>');
  }

  // ---- Tempo: hear the beat, keep it going ----
  var tempo = null;
  function tempoView(t, n) {
    var m = t.mine || { points: 0, tries: 0, final: false, bpm: null }, o = t.other, h = '';
    h += '<section class="card"><div class="between"><div><div class="eyebrow">Best today</div><div class="num" style="font-size:28px;font-weight:700">' + (m.tries ? m.points : 0) + '<span class="small muted"> pts</span></div></div><div class="right"><div class="small muted">' + esc(n.other) + '</div><div class="num" style="font-size:28px;font-weight:700">' + (o && o.tries ? o.points : 0) + '<span class="small muted"> pts</span></div><div class="tiny muted">' + (!o ? 'not yet' : o.scored ? o.tries + ' plays' : 'playing') + '</div></div></div>';
    if (m.scored && !tempo) {
      h += '<div class="divider"></div><div class="center"><div class="eyebrow">Today\'s beat</div><div class="num" style="font-size:44px;font-weight:700;letter-spacing:-.02em">' + t.bpm + '<span class="small muted"> BPM</span></div><div class="small" style="font-weight:600">' + esc(t.style) + '</div>' +
        '<p class="small muted" style="margin:8px 0 0">Your best: ' + m.bpm + ' BPM.' + (o && o.scored && o.bpm ? ' ' + esc(n.other) + '\'s best: ' + o.bpm + '.' : '') + '</p></div><div class="divider"></div>';
    }
    var phase = tempo ? tempo.phase : '';
    h += '<button class="tpad' + (phase === 'tap' ? ' live' : '') + '" type="button" data-fun="tap" id="tpad"><span id="tpadTxt">' + (phase === 'listen' ? 'Listen' : phase === 'tap' ? 'Tap' : phase === 'send' ? '…' : 'Tempo') + '</span></button>' +
      '<p class="center small muted" id="tmsg">' + (tempo ? tempo.msg : 'Hear eight beats, then keep the beat going on your own: tap eight times. Closest BPM wins.') + '</p>' +
      (tempo ? '' : '<button class="btn primary wide" type="button" data-fun="tempoGo">' + icon('play', 's') + (m.tries ? 'Play again' : 'Play the beat') + '</button>') +
      '<p class="tiny muted center" style="margin:8px 0 0">Within 1 BPM scores 10. Play as often as you like: your best counts, and XP comes the first time you score each day. Sound on.</p></section>';
    return h;
  }
  function kick(at) {
    if (!audio) return;
    var o = audio.createOscillator(), g = audio.createGain();
    o.connect(g); g.connect(audio.destination);
    o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.13);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.9, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    o.start(at); o.stop(at + 0.32);
  }
  function pulse() { var p = el('tpad'); if (p) { p.classList.remove('beat'); void p.offsetWidth; p.classList.add('beat'); } }
  function tempoMsg(m) { tempo.msg = m; var x = el('tmsg'); if (x) x.textContent = m; var tt = el('tpadTxt'); if (tt) tt.textContent = tempo.phase === 'listen' ? 'Listen' : tempo.phase === 'tap' ? 'Tap' : '…'; var p = el('tpad'); if (p) p.classList.toggle('live', tempo.phase === 'tap'); }
  function tempoGo() {
    var bpm = S.games.tempo.bpm, iv = 60 / bpm;
    tempo = { phase: 'listen', taps: [], msg: 'Listen…' };
    renderPlay();
    var t0 = audio ? audio.currentTime + 0.25 : 0;
    for (var i = 0; i < 8; i++) {
      kick(t0 + i * iv);
      setTimeout(pulse, 250 + i * iv * 1000);
    }
    setTimeout(function () { if (!tempo) return; tempo.phase = 'tap'; tempoMsg('Now you: keep it going. Tap 8 times.'); }, 250 + 8 * iv * 1000 - iv * 500);
  }
  function tempoTap() {
    if (!tempo || tempo.phase !== 'tap') { if (!tempo) toast('Tap Play the beat first'); else if (tempo.phase === 'listen') toast('Listen first, then keep it going'); return; }
    pulse(); buzz(10);
    tempo.taps.push(performance.now());
    var left = 9 - tempo.taps.length;
    if (left > 0) return tempoMsg(left === 8 ? 'Keep going…' : left + ' more');
    var gaps = [];
    for (var i = 1; i < tempo.taps.length; i++) gaps.push(tempo.taps[i] - tempo.taps[i - 1]);
    gaps.sort(function (a, b) { return a - b; });
    var bpm = Math.round(600000 / gaps[Math.floor(gaps.length / 2)]) / 10;
    tempo.phase = 'send'; tempoMsg('You tapped ' + bpm + ' BPM');
    rpc('submitTempo', [bpm]).then(function (g) {
      tempo = null; S.games = g; renderPlay();
      var l = g.last || { points: 0 }, m = g.tempo.mine;
      if (l.points >= 8) { confetti(l.points === 10); chime([659, 880, 1100]); }
      toast(bpm + ' BPM: ' + (l.points === 10 ? 'perfect timing' : l.points ? l.points + ' points' : 'too far off for points') + (l.firstXp ? '. +' + l.firstXp + ' XP' : '') + (m.points > l.points ? '. Best today: ' + m.points : ''));
      if (l.firstXp) refreshQuiet();
    }, function (err) { tempo = null; renderPlay(); toast(err.message, true); });
  }

  // ---- the daily intro (first open each day) ----
  function intro() {
    if (!S || !S.fun || current !== 'home') return;
    var dn = new Date(now()), day = dn.getFullYear() + '-' + ('0' + (dn.getMonth() + 1)).slice(-2) + '-' + ('0' + dn.getDate()).slice(-2);
    if (load('intro-' + S.who) === day) return;
    save('intro-' + S.who, day);
    var f = S.fun, g = S.game, n = names();
    var bars = ''; for (var i = 0; i < 24; i++) bars += '<i style="animation-delay:' + (-i * 0.13).toFixed(2) + 's"></i>';
    var h = '<div class="intro" id="intro" role="dialog" aria-label="Welcome"><div class="in">' +
      '<div class="eq">' + bars + '</div>' +
      '<div class="eyebrow l1">Day ' + f.day + ' of ' + esc(f.team) + '</div>' +
      '<h1 class="l2">' + greeting() + ',<br>' + esc(n.me || 'you') + '</h1>' +
      (f.era ? '<div class="era l3">Level ' + g.level.level + ' · ' + esc(f.era) + '</div>' : '') +
      '<div class="istats l4"><div><b class="num">' + g.streak.count + '</b><span>day streak</span></div><div><b class="num">' + g.team.count + '</b><span>together</span></div><div><b class="num">' + (g.xpToday >= g.goal ? g.xpToday : g.goal - g.xpToday) + '</b><span>' + (g.xpToday >= g.goal ? 'XP today' : 'XP to go') + '</span></div></div>' +
      (S.brief ? '<p class="l6 small">' + esc(S.brief.first ? 'First move: ' + S.brief.first : S.brief.brief) + '</p>' : '') +
      '<button class="btn primary big wide l7" type="button" data-fun="introGo">Let\'s go</button></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
    chime([523, 659, 784]);
  }

  // ---- taps for all of the above ----
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-fun], [data-stake]');
    if (!t || !S) return;
    var f = t.dataset.fun, v = t.dataset.v;
    if (t.dataset.stake) return call('setStake', [t.dataset.stake], function (g) { closeSheet(); S.games = g; renderPlay(); toast('Stakes set. ' + names().other + ' knows.'); });
    if (f === 'introGo') { var x = el('intro'); if (x) { x.classList.add('out'); setTimeout(function () { x.remove(); }, 350); } return; }
    if (f === 'chat') return window.NudgeChat ? NudgeChat.open(chatApi) : toast('The chat didn\'t load. Check your connection.', true);
    if (f === 'usToggle') { usOpen = !usOpen; return renderHome(); }
    if (f === 'dice') { var d; do { d = DICE[Math.floor(Math.random() * DICE.length)]; } while (d === diceIdea && DICE.length > 1); diceIdea = d; buzz(15); return renderHome(); }
    if (f === 'tap') return tempoTap();
    if (f === 'usLog') return call('logUs', [], function (res) { confetti(true); chime([523, 784, 1047]); apply(res, 'Logged. +20 XP each.'); });
    if (f === 'wink') return call('sendWink', ['wink'], function (res) { apply(res, 'Wink sent'); });
    if (f === 'tonight') return call('sendWink', ['tonight'], function (res) { apply(res, 'Asked. Waiting for ' + names().other + '…'); });
    if (f === 'tonightYes' || f === 'tonightNo') return call('answerTonight', [f === 'tonightYes'], function (res) { apply(res, f === 'tonightYes' ? 'Said yes' : 'Rain check sent'); });
    if (f === 'stakes') return stakeSheet();
    if (f === 'tempoGo') return tempoGo();
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'foodEdit') return;
    ev.preventDefault();
    var f = ev.target;
    call('editFood', [f.dataset.entry, f.dataset.item, { item: el('feItem').value, kcal: +el('feKcal').value, protein: +el('feProt').value }], function (res) { closeSheet(); S.food = res.state; renderFood(); toast('Saved'); });
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'stakeForm') return;
    var v = el('stakeText').value.trim();
    if (v) call('setStake', [v], function (g) { closeSheet(); S.games = g; renderPlay(); toast('Stakes set.'); });
  });

  // The word list is only needed for the word game: fetch it when Play opens.
  var wordsLoading = false;
  function loadWords() {
    if (MODE !== 'web' || wordsLoading || typeof ALLOWED_WORDS !== 'undefined') return;
    wordsLoading = true;
    loadScript('words.js').catch(function () { wordsLoading = false; });
  }

  // ---------- HEALTH (sleep, readiness, activity, heart) ----------
  var hview = null; // another day being browsed
  var STAGE = [['awake', 'Awake'], ['rem', 'REM'], ['light', 'Light'], ['deep', 'Deep']];
  // Typical share of the night for adults (what Fitbit and the sleep research quote)
  var TYPICAL = { awake: [5, 15], rem: [20, 25], light: [45, 60], deep: [13, 23] };
  function hm(min) { min = Math.round(min || 0); return Math.floor(min / 60) + 'h ' + ('0' + min % 60).slice(-2) + 'm'; }
  function hmShort(min) { min = Math.round(min || 0); return min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + min % 60 + 'm' : '') : min + 'm'; }
  function clockOf(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dayShort(ymd) { return new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' }); }
  function signed(n, unit) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n) + (unit || ''); }
  function H() { return hview || S.health; }

  function hypnogram(sl) {
    var W = 340, rowH = 30, gap = 14, top = 6, total = (sl.end - sl.start) / 60000, x = function (m) { return 6 + m / total * (W - 12); };
    var rows = { 0: 0, 1: 1, 2: 2, 3: 3 }, svg = '', links = '';
    sl.stages.forEach(function (g, i) {
      var y = top + rows[g[0]] * (rowH + gap), x0 = x(g[1]), w = Math.max(2, x(g[1] + g[2]) - x0 - 1);
      svg += '<rect class="st' + g[0] + '" x="' + x0.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + rowH + '" rx="4" data-tip="' + STAGE[g[0]][1] + ' · ' + clockOf(sl.start + g[1] * 60000) + '–' + clockOf(sl.start + (g[1] + g[2]) * 60000) + ' · ' + hmShort(g[2]) + '"/>';
      var n = sl.stages[i + 1];
      if (n) { var xx = x(n[1]).toFixed(1), y1 = top + rows[g[0]] * (rowH + gap) + rowH / 2, y2 = top + rows[n[0]] * (rowH + gap) + rowH / 2; links += '<line x1="' + xx + '" x2="' + xx + '" y1="' + y1 + '" y2="' + y2 + '"/>'; }
    });
    var tracks = '';
    for (var r = 0; r < 4; r++) tracks += '<rect class="track" x="0" y="' + (top + r * (rowH + gap)) + '" width="' + W + '" height="' + rowH + '" rx="8"/>';
    var H2 = top + 4 * (rowH + gap) - gap + 4;
    var mid = sl.start + (sl.end - sl.start) / 2;
    return '<div class="hyp"><div class="hl">' + STAGE.map(function (s, i) {
      var mins = sl[s[0]];
      return '<div style="height:' + (rowH + gap) + 'px"><b>' + s[1] + '</b><span>' + hmShort(mins) + '</span></div>';
    }).join('') + '</div><div class="hc"><svg viewBox="0 0 ' + W + ' ' + H2 + '" preserveAspectRatio="none" class="hypsvg">' + tracks + '<g class="links">' + links + '</g>' + svg + '</svg>' +
      '<div class="axis"><span>' + clockOf(sl.start) + '</span><span>' + clockOf(mid) + '</span><span>' + clockOf(sl.end) + '</span></div></div></div>';
  }

  // Bars with a goal line. vals: [{v, label, tip, dim}], one series, so no legend.
  function barChart(vals, goal, opts) {
    opts = opts || {};
    var W = 340, Hh = opts.h || 110, n = vals.length, bw = (W - (n - 1) * 3) / n, max = Math.max(goal || 0, Math.max.apply(null, vals.map(function (d) { return d.v || 0; }))) * 1.08 || 1;
    var y = function (v) { return Hh - v / max * Hh; };
    var bars = vals.map(function (d, i) {
      var x = i * (bw + 3), h = Math.max(d.v ? 3 : 0, Hh - y(d.v || 0));
      return '<g data-tip="' + esc(d.tip) + '"><rect class="hit" x="' + x.toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + Hh + '"/>' +
        (h ? '<path class="bar' + (d.on ? ' on' : '') + (d.dim ? ' dim' : '') + '" d="M' + x.toFixed(1) + ',' + Hh + 'V' + (Hh - h + Math.min(4, h)).toFixed(1) + 'q0,-' + Math.min(4, h) + ' ' + Math.min(4, bw / 2) + ',-' + Math.min(4, h) + 'H' + (x + bw - Math.min(4, bw / 2)).toFixed(1) + 'q' + Math.min(4, bw / 2) + ',0 ' + Math.min(4, bw / 2) + ',' + Math.min(4, h) + 'V' + Hh + 'z"/>' : '') + '</g>';
    }).join('');
    var g = goal ? '<line class="goal" x1="0" x2="' + W + '" y1="' + y(goal).toFixed(1) + '" y2="' + y(goal).toFixed(1) + '"/>' : '';
    var labels = opts.labels ? '<div class="xl" style="grid-template-columns:repeat(' + n + ',1fr)">' + vals.map(function (d) { return '<span>' + esc(d.label || '') + '</span>'; }).join('') + '</div>' : '';
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none">' + g + bars + '</svg>' + labels + '</div>';
  }

  // One line over two weeks (one measure per chart: never two axes).
  function lineChart(vals, opts) {
    opts = opts || {};
    var pts = vals.map(function (d, i) { return { i: i, v: d.v, tip: d.tip }; }).filter(function (p) { return p.v !== null && p.v !== undefined; });
    if (pts.length < 2) return '<p class="tiny muted" style="margin:6px 0 0">A trend appears after a few days of data.</p>';
    var W = 340, Hh = opts.h || 70, mn = Math.min.apply(null, pts.map(function (p) { return p.v; })), mx = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    if (mx === mn) { mx += 1; mn -= 1; }
    var X = function (i) { return 6 + i / (vals.length - 1) * (W - 12); }, Y = function (v) { return 8 + (1 - (v - mn) / (mx - mn)) * (Hh - 16); };
    var path = pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p.i).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    var hits = vals.map(function (d, i) { return '<rect class="hit" data-tip="' + esc(d.tip) + '" x="' + (X(i) - W / vals.length / 2).toFixed(1) + '" y="0" width="' + (W / vals.length).toFixed(1) + '" height="' + Hh + '"/>'; }).join('');
    var base = opts.base ? '<line class="goal" x1="0" x2="' + W + '" y1="' + Y(Math.max(mn, Math.min(mx, opts.base))).toFixed(1) + '" y2="' + Y(Math.max(mn, Math.min(mx, opts.base))).toFixed(1) + '"/>' : '';
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none">' + base + '<path class="line" d="' + path + '"/>' +
      '<circle class="dot" cx="' + X(last.i).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '" r="4.5"/>' + hits + '</svg></div>';
  }

  function hrChart(byHour) {
    var W = 340, Hh = 110, have = byHour.filter(Boolean);
    if (!have.length) return '';
    var mn = Math.min.apply(null, have.map(function (x) { return x[1]; })) - 5, mx = Math.max.apply(null, have.map(function (x) { return x[2]; })) + 5;
    var Y = function (v) { return 6 + (1 - (v - mn) / (mx - mn)) * (Hh - 12); }, bw = W / 24;
    var out = byHour.map(function (x, h) {
      var cx = (h + 0.5) * bw, tip = x ? (('0' + h).slice(-2) + ':00 · avg ' + x[0] + ' bpm · ' + x[1] + '–' + x[2]) : ('0' + h).slice(-2) + ':00 · no data';
      return '<g data-tip="' + tip + '"><rect class="hit" x="' + (h * bw).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + Hh + '"/>' +
        (x ? '<line class="rng" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + Y(x[2]).toFixed(1) + '" y2="' + Y(x[1]).toFixed(1) + '"/><circle class="dot" cx="' + cx.toFixed(1) + '" cy="' + Y(x[0]).toFixed(1) + '" r="3.2"/>' : '') + '</g>';
    }).join('');
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none">' + out + '</svg><div class="axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>';
  }

  function stageBreakdown(sl) {
    return STAGE.map(function (s, i) {
      var pct = sl.asleep + sl.awake ? Math.round(sl[s[0]] / (sl.asleep + sl.awake) * 100) : 0, t = TYPICAL[s[0]];
      var inRange = pct >= t[0] && pct <= t[1] || (s[0] === 'awake' && pct < t[0]);
      return '<div class="sb"><span class="sw st' + i + '"></span><div class="grow"><div class="between"><b>' + s[1] + '</b><span class="small"><b class="num">' + hmShort(sl[s[0]]) + '</b> <span class="muted">· ' + pct + '%</span></span></div>' +
        '<div class="range"><i class="band" style="left:' + t[0] * 1.6 + '%;width:' + (t[1] - t[0]) * 1.6 + '%"></i><i class="mark st' + i + '" style="left:' + Math.min(100, pct * 1.6) + '%"></i></div>' +
        '<div class="tiny muted">Typical ' + t[0] + '–' + t[1] + '%' + (s[0] === 'awake' && pct < t[0] ? ' · less than most, nice' : inRange ? ' · right in range' : pct < t[0] ? ' · a bit low' : ' · a bit high') + '</div></div></div>';
    }).join('');
  }

  var healthHowOpen = false;
  function readinessAdvice(r) {
    var gym = ME && S.today && S.today.gym && !S.today.gym.done ? S.today.gym.session : '';
    if (r.score >= 80) return gym ? 'Good day to push hard on ' + gym + ': go for the top of the rep ranges.' : 'Plenty in the tank today.';
    if (r.score >= 60) return gym ? 'Train ' + gym + ' as planned, at the RPEs written.' : 'A normal day. Move, eat well, sleep on time.';
    return gym ? 'Your body is asking for an easier one. Lighter ' + gym + ', or swap to rest in Train.' : 'Take it easy: an early night will help most.';
  }

  function setupCard(h) {
    return '<section class="card tint"><div class="eyebrow" style="color:var(--lilac)">Connect your phone</div><h2 style="margin:6px 0 8px">See your sleep, steps and heart here</h2>' +
      '<ol class="small setup"><li>Install <b>HC Webhook</b> from the ' + (/iPhone|iPad/.test(navigator.userAgent) ? 'App Store' : 'Play Store') + '.</li>' +
      '<li>Open it and allow ' + (/iPhone|iPad/.test(navigator.userAgent) ? 'Apple Health' : 'Health Connect') + ' access: tick Steps, Sleep, Heart rate, Resting heart rate, HRV, Oxygen saturation, Respiratory rate, Distance, Active calories, Exercise, Weight.</li>' +
      '<li>Add a webhook and paste this address:</li></ol>' +
      '<div class="hook"><code id="hookUrl">' + esc(h.webhook) + '</code><button class="btn primary sm" type="button" data-fun="copyHook">Copy</button></div>' +
      '<ol class="small setup" start="4"><li>Make sure the format is <b>JSON</b> (not gRPC). Set it to sync every 15 minutes, then tap <b>Sync now</b>.</li></ol>' +
      '<p class="tiny muted" style="margin:8px 0 0">The address has your private key in it, so don\'t share it. Your Fitbit or Pixel Watch already saves to ' + (/iPhone|iPad/.test(navigator.userAgent) ? 'Apple Health' : 'Health Connect') + '; this just forwards it.</p></section>';
  }

  function renderHealth() {
    var h = H();
    if (!h) return;
    var isToday = h.date === h.today, d = new Date(h.date + 'T12:00:00'), out = '';
    out += '<div class="top"><div><h1>Health</h1><div class="sub">' + (h.hasData && h.synced ? (new Date(h.synced).toDateString() === new Date(now()).toDateString() ? 'Synced at ' + clockOf(h.synced) : 'Last data ' + new Date(h.synced).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + clockOf(h.synced)) : h.connected ? 'Waiting for data' : 'Not connected yet') + '</div></div>' + meButton() + '</div>';
    out += '<div class="daynav"><button class="iconbtn" type="button" data-hday="-1" aria-label="Day before">' + icon('back', 's') + '</button><b>' + (isToday ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })) + '</b><button class="iconbtn" type="button" data-hday="1" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>' + icon('chevron', 's') + '</button></div>';
    if (!h.connected) { el('tab-health').innerHTML = out + setupCard(h); return; }
    if (!h.hasData && h.status) {
      // nothing for this day: say why and what to do, instead of a screen of zeros
      out += '<section class="card pushwarn"><b>' + esc(h.status.text) + '</b><p class="small" style="margin:6px 0 10px">' + esc(h.status.fix) + '</p>' +
        (h.synced ? '<p class="tiny muted" style="margin:0 0 10px">Last data arrived ' + new Date(h.synced).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '.</p>' : '') +
        '<div class="grid2"><button class="btn primary" type="button" data-fun="healthRetry">Check again</button><button class="btn soft" type="button" data-fun="healthHow">Show me the setup</button></div></section>';
      if (healthHowOpen) out += setupCard(h);
      el('tab-health').innerHTML = out; return;
    }
    var sl = h.sleep, rd = h.readiness, hr = h.heart;

    // hero: steps ring + three tiles
    out += '<section class="card spot"><div class="hhero"><div class="ring" style="width:132px;height:132px">' + ring(h.steps / h.goals.steps, 132, 12) +
      '<div class="t"><div><div class="tiny muted">Steps</div><div class="num" style="font-size:28px;font-weight:700">' + fmt(h.steps) + '</div><div class="tiny muted">of ' + fmt(h.goals.steps) + '</div></div></div></div><div class="grow stack">' +
      '<div class="htile ready"><span>Readiness</span><b class="num">' + (rd ? rd.score : '–') + '</b><em>' + (rd ? esc(rd.label) : 'needs sleep data') + '</em></div>' +
      '<div class="htile sleep"><span>Sleep</span><b class="num">' + (sl ? hm(sl.asleep) : '–') + '</b><em>' + (sl ? sl.score + ' · ' + esc(sl.label) : 'none recorded') + '</em></div>' +
      '<div class="htile heart"><span>Resting HR</span><b class="num">' + (hr.rhr || '–') + '<small> bpm</small></b><em>' + (hr.rhr && hr.rhrBase ? signed(hr.rhr - hr.rhrBase) + ' vs usual' : 'heart') + '</em></div></div></div></section>';

    // Claude explains it
    if (h.insight) out += '<section class="card tint"><div class="eyebrow" style="color:var(--lilac);display:flex;gap:6px;align-items:center">' + icon('sparkles', 's') + 'Your day, explained</div><h3 style="margin:8px 0 4px">' + esc(h.insight.headline) + '</h3><p class="small" style="margin:0 0 8px">' + esc(h.insight.insight) + '</p><div class="row small"><span class="chip lilac">Today</span><span>' + esc(h.insight.tip) + '</span></div></section>';
    else if (S.hasClaudeKey) out += '<button class="askbar" type="button" data-fun="healthAI">' + icon('sparkles') + '<span class="grow">Explain my sleep and readiness</span>' + icon('chevron', 's') + '</button>';

    // sleep
    if (sl) {
      out += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('moon', 's') + 'Sleep</h3><span class="chip ' + (sl.score >= 80 ? 'good' : sl.score >= 60 ? 'lilac' : 'pink') + '">' + sl.score + ' · ' + esc(sl.label) + '</span></div>' +
        '<div class="between" style="align-items:flex-end;margin-bottom:12px"><div><div class="num" style="font-size:34px;font-weight:700;letter-spacing:-.02em">' + hm(sl.asleep) + '</div><div class="small muted">' + sl.bedtime + ' – ' + sl.wake + ' · ' + hm(sl.inBed) + ' in bed</div></div>' +
        (sl.asleep >= h.goals.sleepMin - 30 ? '<span class="chip good">' + icon('check', 's') + 'Goal met</span>' : '<span class="chip">' + hmShort(h.goals.sleepMin - sl.asleep) + ' short</span>') + '</div>' +
        (sl.stages.length ? hypnogram(sl) + '<div class="readout small muted" data-readout>Tap the chart for details</div>' : '<p class="small muted">No sleep stages in this record.</p>') +
        '<div class="divider"></div>' + (sl.stages.length ? stageBreakdown(sl) + '<div class="divider"></div>' : '') +
        '<div class="hstats"><div><b class="num">' + sl.wakeups + '</b><span>wake-ups</span></div><div><b class="num">' + hmShort(sl.awake) + '</b><span>awake</span></div>' +
        '<div><b class="num">' + (h.week.spread === null ? '–' : '±' + h.week.spread + 'm') + '</b><span>bedtime spread</span></div><div><b class="num">' + hmShort(h.week.debt) + '</b><span>7-day debt</span></div></div>' +
        '<div class="eyebrow" style="margin:14px 0 6px">Last 7 nights' + (h.week.avgSleep ? ' · average ' + hm(h.week.avgSleep) : '') + '</div>' +
        barChart(h.trend.slice(-7).map(function (t) { return { v: t.sleep / 60, on: t.date === h.date, dim: !t.sleep, label: dayShort(t.date), tip: dayLabel(t.date) + ' · ' + (t.sleep ? hm(t.sleep) + (t.score ? ' · score ' + t.score : '') + (t.bed ? ' · ' + t.bed + '–' + t.wake : '') : 'no data') }; }), h.goals.sleepMin / 60, { labels: true }) +
        '<div class="readout small muted" data-readout>Line: your ' + Math.round(h.goals.sleepMin / 60 * 10) / 10 + 'h goal</div></section>';
    }

    // readiness
    if (rd) {
      out += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('bolt', 's') + 'Readiness</h3><span class="chip ' + (rd.score >= 80 ? 'good' : rd.score >= 60 ? 'lilac' : 'pink') + '">' + esc(rd.label) + '</span></div>' +
        '<div class="hero" style="margin-bottom:12px"><div class="ring" style="width:96px;height:96px">' + ring(rd.score / 100, 96, 9) + '<div class="t"><div class="num" style="font-size:26px;font-weight:700">' + rd.score + '</div></div></div><p class="grow small" style="margin:0">' + esc(readinessAdvice(rd)) + '</p></div>' +
        '<div class="item"><div class="grow"><b>Sleep</b><div class="tiny muted">Last night\'s score</div></div><b class="num">' + (rd.sleep === null ? '–' : rd.sleep) + '</b></div>' +
        '<div class="item"><div class="grow"><b>Heart rate variability</b><div class="tiny muted">Higher than usual is good</div></div><b class="num">' + (rd.hrv === null ? '–' : signed(rd.hrv, '%')) + '</b></div>' +
        '<div class="item"><div class="grow"><b>Resting heart rate</b><div class="tiny muted">Lower than usual is good</div></div><b class="num">' + (rd.rhr === null ? '–' : signed(rd.rhr, ' bpm')) + '</b></div>' +
        '<div class="eyebrow" style="margin:14px 0 6px">Two weeks</div>' + lineChart(h.trend.map(function (t) { return { v: t.ready, tip: dayLabel(t.date) + ' · readiness ' + (t.ready || '–') }; })) +
        (ME ? '<button class="btn soft wide" type="button" data-goto="train" style="margin-top:10px">' + icon('dumbbell', 's') + 'Adjust today\'s workout</button>' : '') + '</section>';
    }

    // activity
    out += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('walk', 's') + 'Activity</h3><span class="small muted num">' + Math.round(h.steps / h.goals.steps * 100) + '% of goal</span></div>' +
      '<div class="hstats"><div><b class="num">' + fmt(h.steps) + '</b><span>steps</span></div><div><b class="num">' + (h.km || 0) + '</b><span>km</span></div><div><b class="num">' + fmt(h.active) + '</b><span>active kcal</span></div><div><b class="num">' + h.exercise.reduce(function (s, e) { return s + e.min; }, 0) + '</b><span>exercise min</span></div></div>' +
      (h.steps ? '' : '') + '<div class="eyebrow" style="margin:14px 0 6px">Steps by hour</div>' + (!h.steps ? '<p class="small muted" style="margin:0">No steps yet ' + (h.date === h.today ? 'today' : 'that day') + '.</p>' : '') + barChart(h.stepsByHour.map(function (v, i) { return { v: v, tip: ('0' + i).slice(-2) + ':00 · ' + fmt(v) + ' steps' }; }), 0, { h: 80 }) +
      '<div class="axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><div class="readout small muted" data-readout>Tap a bar</div>' +
      (h.exercise.length ? '<div class="eyebrow" style="margin:14px 0 2px">Workouts</div>' + h.exercise.map(function (e) { return '<div class="item"><span class="sw" style="background:var(--pink)"></span><div class="grow"><b>' + esc(e.type.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); })) + '</b><div class="tiny muted">' + e.at + (e.km ? ' · ' + e.km + ' km' : '') + '</div></div><b class="num">' + hmShort(e.min) + '</b></div>'; }).join('') : '') +
      '<div class="eyebrow" style="margin:14px 0 6px">Two weeks · average ' + fmt(h.week.avgSteps) + ' a day this week</div>' +
      barChart(h.trend.map(function (t) { return { v: t.steps, on: t.date === h.date, dim: !t.steps, label: dayShort(t.date), tip: dayLabel(t.date) + ' · ' + fmt(t.steps) + ' steps' }; }), h.goals.steps, { labels: true, h: 90 }) +
      '<div class="readout small muted" data-readout>Line: ' + fmt(h.goals.steps) + ' step goal</div></section>';

    // heart
    out += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('pulse', 's') + 'Heart and breathing</h3></div>' +
      '<div class="hstats"><div><b class="num">' + (hr.rhr || '–') + '</b><span>resting bpm' + (hr.rhrBase ? ' · usual ' + hr.rhrBase : '') + '</span></div><div><b class="num">' + (hr.hrv ? Math.round(hr.hrv) : '–') + '</b><span>HRV ms' + (hr.hrvBase ? ' · usual ' + hr.hrvBase : '') + '</span></div>' +
      '<div><b class="num">' + (hr.o2 ? hr.o2 + '%' : '–') + '</b><span>blood oxygen</span></div><div><b class="num">' + (hr.rr || '–') + '</b><span>breaths / min</span></div></div>' +
      (hr.skin !== null && hr.skin !== undefined ? '<p class="small" style="margin:10px 0 0">Skin temperature ' + signed(Math.round(hr.skin * 10) / 10, '°C') + ' from your usual.</p>' : '') +
      (hr.byHour.some(Boolean) ? '<div class="eyebrow" style="margin:14px 0 6px">Heart rate today · range and average each hour</div>' + hrChart(hr.byHour) + '<div class="readout small muted" data-readout>Tap an hour</div>' : '') +
      '<div class="eyebrow" style="margin:14px 0 6px">Resting heart rate · two weeks</div>' + lineChart(h.trend.map(function (t) { return { v: t.rhr, tip: dayLabel(t.date) + ' · ' + (t.rhr || '–') + ' bpm' }; }), { base: hr.rhrBase }) +
      '<div class="eyebrow" style="margin:14px 0 6px">HRV · two weeks</div>' + lineChart(h.trend.map(function (t) { return { v: t.hrv, tip: dayLabel(t.date) + ' · ' + (t.hrv || '–') + ' ms' }; }), { base: hr.hrvBase }) +
      '<div class="readout small muted" data-readout>Dashed line: your two-week usual</div></section>';

    if (h.weight || h.vo2) out += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('scale', 's') + 'Body</h3></div><div class="hstats">' +
      (h.weight ? '<div><b class="num">' + h.weight.kg + '</b><span>kg · ' + esc(dayLabel(h.weight.date)) + '</span></div>' : '') + (h.vo2 ? '<div><b class="num">' + h.vo2 + '</b><span>VO2 max</span></div>' : '') + '</div></section>';

    out += '<button class="btn soft wide" type="button" data-fun="importHealth" style="margin-bottom:12px">' + icon('download', 's') + 'Import your history from the watch</button>';
    out += '<p class="tiny muted center">Sleep score and readiness are this app\'s own estimates from your phone\'s data, so they can differ a little from Fitbit\'s. Not medical advice.</p>';
    el('tab-health').innerHTML = out;
  }

  // ---- history import: read HC Webhook's local server on this phone, upload a few days at a time ----
  function importSheet() {
    openSheet('<h2>Import your history</h2><p class="small muted" style="margin:4px 0 12px">Pulls past days from your watch through HC Webhook on this phone.</p>' +
      '<ol class="small setup"><li>In <b>HC Webhook</b>, turn on <b>Local HTTP server</b> (port 8787).</li><li>Come back here and pick how far back:</li></ol>' +
      '<div class="grid3" style="margin:10px 0"><button class="btn soft" type="button" data-days="30">30 days</button><button class="btn soft" type="button" data-days="90">90 days</button><button class="btn soft" type="button" data-days="365">1 year</button></div>' +
      '<label class="small muted">Port <input type="text" id="hcPort" inputmode="numeric" value="' + esc(load('hcPort') || '8787') + '" style="width:90px;padding:6px 8px;margin-left:6px"></label>' +
      '<p class="tiny muted" style="margin:10px 0 0">Chrome may ask to let this app see devices on your network: allow it. Keep the app open until it finishes.</p><div class="readout small" id="importMsg"></div>' +
      '<div class="divider"></div><b class="small">If that doesn\'t work: use a file</b><ol class="small setup"><li>With the Local HTTP server on, open <b>127.0.0.1:8787/?days=365</b> in Chrome (tap to copy: <button class="chip" type="button" data-fun="copyLocal">copy address</button>). You\'ll see a page of text.</li>' +
      '<li>Tap <b>⋮</b> then the <b>download</b> arrow to save it.</li><li>Come back here and choose that file:</li></ol>' +
      '<label class="btn primary wide" style="cursor:pointer">' + icon('download', 's') + 'Choose the downloaded file<input type="file" id="hcFile" accept=".json,.txt,application/json,text/plain" hidden></label>');
  }
  function dayOfIso(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function importHistory(n) {
    var port = (el('hcPort') && el('hcPort').value.trim()) || '8787', msg = function (m) { var x = el('importMsg'); if (x) x.textContent = m; };
    save('hcPort', port);
    msg('Reading ' + n + ' days from your watch…');
    fetch('http://127.0.0.1:' + port + '/?days=' + n, { targetAddressSpace: 'loopback' }).then(function (r) { if (!r.ok) throw new Error('HC Webhook said ' + r.status); return r.json(); }).then(uploadHealth).catch(function () {
      msg('Chrome stopped the app talking to HC Webhook\'s server on this phone (a security rule for web apps reaching the phone itself). Use the file way below instead: it always works.');
    });
  }
  function uploadHealth(p) {
    var msg = function (m) { var x = el('importMsg'); if (x) x.textContent = m; };
    (function () {
      var byDay = {};
      Object.keys(p).forEach(function (type) {
        if (!Array.isArray(p[type])) return;
        p[type].forEach(function (rec) {
          var ymd = dayOfIso(rec.session_end_time || rec.start_time || rec.time);
          if (!ymd) return;
          delete rec.metadata;
          ((byDay[ymd] = byDay[ymd] || {})[type] = byDay[ymd][type] || []).push(rec);
        });
      });
      var dates = Object.keys(byDay).sort(), done = 0;
      if (!dates.length) { msg('Nothing found. Check HC Webhook has Health Connect permissions.'); return; }
      (function next() {
        if (!dates.length) { msg('Imported ' + done + ' days.'); toast('History imported'); return refreshQuiet(); }
        var batch = dates.splice(0, 4), payload = {};
        batch.forEach(function (d) { Object.keys(byDay[d]).forEach(function (t) { payload[t] = (payload[t] || []).concat(byDay[d][t]); }); });
        msg('Uploading… ' + done + ' of ' + (done + batch.length + dates.length) + ' days');
        rpc('importHealth', [JSON.stringify(payload)]).then(function () { done += batch.length; next(); }, function (e) { msg('Stopped: ' + e.message + '. Tap again to retry.'); });
      })();
    })();
  }
  document.addEventListener('change', function (ev) {
    if (ev.target.id !== 'hcFile' || !ev.target.files[0]) return;
    var msg = function (m) { var x = el('importMsg'); if (x) x.textContent = m; };
    msg('Reading the file…');
    ev.target.files[0].text().then(function (txt) {
      var p;
      try { p = JSON.parse(txt.slice(txt.indexOf('{'))); } catch (e) { return msg('That file isn\'t the health data. Open the 127.0.0.1 address again and download that page.'); }
      uploadHealth(p);
    });
  });
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-fun="copyLocal"]')) return;
    var u = 'http://127.0.0.1:' + ((el('hcPort') && el('hcPort').value.trim()) || '8787') + '/?days=365';
    if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Copied. Paste it into Chrome\'s address bar.'); });
  });

  // tap any chart mark: its details show in the card's readout line
  document.addEventListener('click', function (ev) {
    var m = ev.target.closest('[data-tip]');
    if (!m || !ev.target.closest('#tab-health')) return;
    var card = m.closest('.card'), slot = null;
    var outs = card ? card.querySelectorAll('[data-readout]') : [];
    for (var i = 0; i < outs.length; i++) { if (m.compareDocumentPosition(outs[i]) & Node.DOCUMENT_POSITION_FOLLOWING) { slot = outs[i]; break; } }
    slot = slot || outs[outs.length - 1];
    card.querySelectorAll('.sel').forEach(function (x) { x.classList.remove('sel'); });
    m.classList.add('sel');
    if (slot) { slot.textContent = m.getAttribute('data-tip'); slot.classList.remove('muted'); }
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-hday], [data-fun="healthAI"], [data-fun="copyHook"], [data-fun="importHealth"], [data-days], [data-fun="healthRetry"], [data-fun="healthHow"]');
    if (!t || !S) return;
    if (t.dataset.fun === 'healthHow') { healthHowOpen = !healthHowOpen; return renderHealth(); }
    if (t.dataset.fun === 'healthRetry') {
      t.disabled = true; t.textContent = 'Checking…';
      return rpc('healthDay', [H().date]).then(function (x) { if (x.date === S.health.today) { S.health = x; hview = null; } else hview = x; renderHealth(); toast(x.hasData ? 'Got it: your data is in.' : 'Still nothing. ' + (x.status ? x.status.fix : '')); }, function (e) { toast(e.message, true); renderHealth(); });
    }
    if (t.dataset.fun === 'copyHook') {
      var u = H().webhook;
      if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Copied. Paste it into HC Webhook.'); }, function () { toast('Press and hold the address to copy it.'); });
      else toast('Press and hold the address to copy it.');
      return;
    }
    if (t.dataset.fun === 'importHealth') return importSheet();
    if (t.dataset.days) return importHistory(+t.dataset.days);
    if (t.dataset.fun === 'healthAI') { toast('Reading your numbers…'); return call('healthInsight', [H().date], function (x) { H().insight = x; renderHealth(); }); }
    var cur = H().date, dt = new Date(cur + 'T12:00:00');
    dt.setDate(dt.getDate() + Number(t.dataset.hday));
    var ymd = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
    if (ymd > S.health.today) return;
    if (ymd === S.health.today) { hview = null; return renderHealth(); }
    call('healthDay', [ymd], function (h) { hview = h; renderHealth(); window.scrollTo(0, 0); });
  });

  // ---------- CHARACTERS and CUSTOMISE ----------
  // Original portraits (colours and initials), not game artwork.
  var CHARS = [];   // the old game-inspired characters are retired: everyone is their own character now
  function charById(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i][0] === id) return CHARS[i]; return null; }
  function charOf(who) { return S && S.fun && S.fun.chars ? S.fun.chars[who] : ''; }
  function lookOf(who) { return (S && S.fun && S.fun.looks && S.fun.looks[who]) || null; }
  // your real look (the same as your character on Home), reacting to the day
  function avatarOf(who, size, right) {
    var w = S && S.wardrobe, look = w ? (who === S.who ? w.look : w.other) : null;
    if (!look || !window.NudgeFace) return avatar(charOf(who), size, right, lookOf(who));
    var f = faceState(who);
    return '<span class="av real" style="width:' + size + 'px;height:' + size + 'px' + (right ? ';margin-left:auto' : '') + '" title="' + esc(who === S.who ? 'You' : names().other) + '">' + NudgeFace.svg(look, size, f) + '</span>';
  }
  function faceState(who) {
    var hr = new Date(now()).getHours(), o = { mood: '', wear: '' };
    if (hr < 5) o.mood = 'sleepy';
    else if (S.game && S.game.team && S.game.team.todayDone) { o.mood = 'happy'; o.bounce = !reducedMotion(); }
    if (who === 'me' && S.today && S.today.gym && !o.mood) o.wear = 'gym';
    var wx = S.today && S.today.gym && S.today.gym.weather, rain = wx && /rain chance up to (\d+)%/.exec(wx);
    if (rain && +rain[1] >= 60) o.wear = 'rain';
    if (who === S.who) { try { var bs = JSON.parse(localStorage.getItem('booth-stats') || 'null'), k = ymdOf(new Date(now())); if (bs && bs.secs && bs.secs[k] >= 60) o.wear = o.wear || 'dj'; } catch (e) {} }
    return o;
  }
  function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches || (S && S.fun && S.fun.prefs && S.fun.prefs.motion === false); }
  function ymdOf(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function avatar(id, size, right, look) {
    var c = charById(id), s = size || 36;
    if (c && window.LQPortrait && LQPortrait.has(id)) return '<span class="av" style="width:' + s + 'px;height:' + s + 'px' + (right ? ';margin-left:auto' : '') + '" title="' + esc(c[2]) + '"><svg viewBox="0 0 100 100" aria-hidden="true">' + LQPortrait.draw(id, c[4], c[5], 'p' + id.replace(/\W/g, '') + s + Math.random().toString(36).slice(2, 6), look) + '</svg></span>';
    if (!c) return '<span class="av none" style="width:' + s + 'px;height:' + s + 'px">' + icon('user', 's') + '</span>';
    var vc = id.slice(0, 2) === 'vc', g = 'a' + id.replace(/\W/g, '') + s;
    var pattern = vc
      ? '<rect y="62" width="100" height="8" fill="#fff" opacity=".18"/><rect y="76" width="100" height="6" fill="#fff" opacity=".14"/><rect y="88" width="100" height="4" fill="#fff" opacity=".1"/>'
      : '<path d="M-10 70 L40 20 L52 20 L2 70z M20 100 L90 30 L102 30 L32 100z" fill="#fff" opacity=".12"/>';
    return '<span class="av" style="width:' + s + 'px;height:' + s + 'px' + (right ? ';margin-left:auto' : '') + '" title="' + esc(c[2]) + '"><svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c[4] + '"/><stop offset="1" stop-color="' + c[5] + '"/></linearGradient></defs>' +
      '<rect width="100" height="100" rx="26" fill="url(#' + g + ')"/>' + pattern +
      '<text x="50" y="58" text-anchor="middle" font-size="' + (c[1].length > 2 ? 30 : 38) + '" font-weight="800" fill="#fff" font-family="Inter, system-ui, sans-serif" letter-spacing="-1">' + c[1] + '</text>' +
      '<text x="50" y="86" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" opacity=".75" font-family="Inter, system-ui, sans-serif" letter-spacing="2">' + (vc ? 'VICE' : 'S.A.') + '</text></svg></span>';
  }
  function meButton() {
    var c = charOf(S.who);
    return c ? '<button class="avbtn" type="button" data-goto="you" aria-label="You and settings">' + avatarOf(S.who, 40) + '</button>'
      : '<button class="iconbtn" type="button" data-goto="you" aria-label="You and settings">' + icon('user') + '</button>';
  }
  function wanted(streak) {
    var tiers = [1, 3, 7, 14, 30, 60], n = tiers.filter(function (t) { return streak >= t; }).length, out = '';
    for (var i = 0; i < 6; i++) out += '<i class="' + (i < n ? 'on' : '') + '">' + icon('star', 's') + '</i>';
    return '<span class="wanted" title="Streak stars: 1, 3, 7, 14, 30 and 60 days">' + out + '</span>';
  }
  function charCard() {
    // your look is your 3D character (the dressing room): the same face everywhere in the app
    var g = S.game;
    return '<button class="charcard" type="button" data-dress="open">' + avatarOf(S.who, 64) + '<span class="grow"><span class="tiny">Your look</span><b>' + esc(names().me || 'You') + '</b>' +
      '<span class="small">Level ' + g.level.level + (S.empire ? ' · worth ' + money(S.empire.worth + S.empire.cash) : '') + '</span>' +
      (S.empire && (S.empire.rideName || S.empire.homeName) ? '<span class="tiny" style="opacity:.9">' + [S.empire.rideName ? 'Rides a ' + esc(S.empire.rideName) : '', S.empire.homeName ? 'Lives at ' + esc(S.empire.homeName) : ''].filter(Boolean).join(' · ') + '</span>' : '') +
      wanted(g.streak.count) + '</span>' + icon('chevron', 's') + '</button>';
  }


  // ---------- editing Home in place: order, hide, routines, water ----------
  var homeEditing = false, rEd = null;
  var upSvg = '<svg class="i s" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>', downSvg = '<svg class="i s" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  function homeEditView(parts) {
    var list = homeOrder(), shown = list.filter(function (x) { return !x.hide; }), hidden = list.filter(function (x) { return x.hide; });
    var h = '<section class="card hedit-top"><div class="between"><div><b>Editing your home screen</b><div class="small muted">Move cards, hide what you don\'t use, change your routines.</div></div><button class="btn primary" type="button" id="homeDone">Done</button></div></section>';
    h += '<section class="card"><div class="head"><h3>Routines</h3><button class="btn soft sm" type="button" data-redit="">' + icon('plus', 's') + 'New routine</button></div>' +
      (S.routines.routines.length ? S.routines.routines.map(function (r) { return '<div class="item"><div class="grow"><div class="t">' + esc(r.name) + '</div><div class="m">' + (r.time ? 'From ' + esc(r.time) + ' · ' : 'All day · ') + r.steps.length + ' step' + (r.steps.length === 1 ? '' : 's') + '</div></div><button class="btn line sm" type="button" data-redit="' + esc(r.name) + '">' + icon('edit', 's') + 'Edit</button></div>'; }).join('') : '<p class="empty">No routines yet.</p>') +
      '<div class="between" style="margin-top:10px"><span class="small"><b>Water goal</b> · ' + (S.routines.waterGoal ? S.routines.waterGoal + ' glasses a day' : 'off') + '</span><span class="row" style="gap:6px"><button class="iconbtn" type="button" data-wgoal="-1" aria-label="One glass fewer">−</button><button class="iconbtn" type="button" data-wgoal="1" aria-label="One glass more">+</button></span></div></section>';
    shown.forEach(function (x, i) {
      h += '<div class="hedit"><div class="hedit-bar"><b class="grow">' + esc(HOME_NAMES[x.id]) + '</b>' +
        '<button class="iconbtn" type="button" data-hm="' + x.id + '" data-dir="-1" aria-label="Move ' + esc(HOME_NAMES[x.id]) + ' up"' + (i ? '' : ' disabled') + '>' + upSvg + '</button>' +
        '<button class="iconbtn" type="button" data-hm="' + x.id + '" data-dir="1" aria-label="Move ' + esc(HOME_NAMES[x.id]) + ' down"' + (i < shown.length - 1 ? '' : ' disabled') + '>' + downSvg + '</button>' +
        '<button class="btn line sm" type="button" data-hh="' + x.id + '">Hide</button></div>' +
        '<div class="hedit-body">' + (parts[x.id] || '<p class="small muted" style="margin:4px 2px 12px">Nothing to show here right now.</p>') + '</div></div>';
    });
    if (hidden.length) h += '<section class="card"><div class="head"><h3>Hidden</h3></div>' + hidden.map(function (x) { return '<div class="item"><div class="grow t">' + esc(HOME_NAMES[x.id]) + '</div><button class="btn soft sm" type="button" data-hh="' + x.id + '">' + icon('plus', 's') + 'Show</button></div>'; }).join('') + '</section>';
    h += '<p class="center" style="margin:6px 0 18px"><button class="btn ghost sm" type="button" data-homereset="1">Put everything back to the start</button> <button class="btn primary" type="button" id="homeDone2">Done</button></p>';
    return h;
  }
  function routineEditor(name) {
    var r = S.routines.routines.filter(function (x) { return x.name === name; })[0];
    rEd = r ? { old: r.name, name: r.name, time: r.time || '', steps: r.steps.slice() } : { old: '', name: '', time: '', steps: [] };
    drawRoutineEd();
  }
  function drawRoutineEd(focusLast) {
    var r = rEd;
    openSheet('<h2 style="margin:0 0 12px">' + (r.old ? 'Edit ' + esc(r.old) + ' routine' : 'New routine') + '</h2>' +
      '<div class="grid2" style="gap:8px;margin-bottom:12px"><label class="small muted">Name<input type="text" id="rName" value="' + esc(r.name) + '" placeholder="Morning" maxlength="40"></label>' +
      '<label class="small muted">Shows from<input type="time" id="rTime" value="' + esc(r.time) + '"></label></div>' +
      '<div class="eyebrow" style="margin-bottom:6px">Steps</div><div id="rSteps">' + r.steps.map(function (s, i) {
        return '<div class="rstep"><input type="text" value="' + esc(s) + '" data-rstep="' + i + '" aria-label="Step ' + (i + 1) + '" maxlength="80">' +
          '<button class="iconbtn" type="button" data-rmove="' + i + '" data-dir="-1" aria-label="Move step up"' + (i ? '' : ' disabled') + '>' + upSvg + '</button>' +
          '<button class="iconbtn" type="button" data-rmove="' + i + '" data-dir="1" aria-label="Move step down"' + (i < r.steps.length - 1 ? '' : ' disabled') + '>' + downSvg + '</button>' +
          '<button class="iconbtn" type="button" data-rdel="' + i + '" aria-label="Remove step">' + icon('trash', 's') + '</button></div>';
      }).join('') + '</div>' +
      '<form class="inline" id="rAdd" autocomplete="off" style="margin:8px 0 14px"><input type="text" id="rAddText" placeholder="Add a step, e.g. Stretch 5 min" maxlength="80"><button class="btn soft" type="submit">' + icon('plus', 's') + 'Add</button></form>' +
      '<button class="btn primary wide" type="button" id="rSave">Save routine</button>' +
      (r.old ? '<button class="btn ghost wide" type="button" id="rDelete" style="margin-top:8px">Delete this routine</button>' : '') +
      '<p class="tiny muted center" style="margin:10px 0 0">Leave "Shows from" empty to show it all day. It appears on Home an hour before its time.</p>');
    var f = focusLast ? el('rAddText') : null; if (f) f.focus();
  }
  function syncRoutineEd() { if (!rEd || !el('rName')) return; rEd.name = el('rName').value; rEd.time = el('rTime').value; document.querySelectorAll('[data-rstep]').forEach(function (x) { rEd.steps[+x.getAttribute('data-rstep')] = x.value; }); }
  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'rAdd') return;
    ev.preventDefault(); syncRoutineEd();
    var v = el('rAddText').value.trim(); if (!v) return el('rAddText').focus();
    rEd.steps.push(v); drawRoutineEd(true);
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t || !S) return;
    var d = t.dataset;
    if (t.id === 'homeEdit') { homeEditing = true; document.body.classList.add('homeedit'); renderHome(); window.scrollTo(0, 0); return; }
    if (t.id === 'homeDone' || t.id === 'homeDone2') { homeEditing = false; document.body.classList.remove('homeedit'); renderHome(); toast('Home screen saved'); return; }
    if (d.redit !== undefined) return routineEditor(d.redit);
    if (d.hm) {
      var list = homeOrder(), shown = list.filter(function (x) { return !x.hide; }), i = shown.map(function (x) { return x.id; }).indexOf(d.hm), j = i + Number(d.dir);
      if (j < 0 || j >= shown.length) return;
      var a1 = list.indexOf(shown[i]), b1 = list.indexOf(shown[j]), tmp = list[a1]; list[a1] = list[b1]; list[b1] = tmp;
      return savePrefs({ home: list });
    }
    if (d.hh) { var l2 = homeOrder(); l2.forEach(function (x) { if (x.id === d.hh) x.hide = !x.hide; }); return savePrefs({ home: l2 }); }
    if (d.wgoal) { var g = Math.max(0, Math.min(20, (S.routines.waterGoal || 0) + +d.wgoal)); S.routines.waterGoal = g; return savePrefs({ waterGoal: g }, g ? 'Water goal: ' + g + ' glasses' : 'Water tracking off'); }
    if (!rEd || !el('rName')) return;
    if (d.rmove !== undefined) { syncRoutineEd(); var k = +d.rmove, k2 = k + +d.dir, s = rEd.steps; if (k2 < 0 || k2 >= s.length) return; var x = s[k]; s[k] = s[k2]; s[k2] = x; return drawRoutineEd(); }
    if (d.rdel !== undefined) { syncRoutineEd(); rEd.steps.splice(+d.rdel, 1); return drawRoutineEd(); }
    if (t.id === 'rSave') {
      syncRoutineEd();
      var extra = el('rAddText').value.trim(); if (extra) rEd.steps.push(extra);
      var r = { name: rEd.name.trim(), time: rEd.time, steps: rEd.steps.map(function (z) { return z.trim(); }).filter(Boolean) };
      if (!r.name) { toast('Give it a name, like Morning', true); return el('rName').focus(); }
      if (!r.steps.length) { toast('Add at least one step', true); return el('rAddText').focus(); }
      t.disabled = true; t.textContent = 'Saving…';
      return rpc('saveRoutine', [rEd.old, r]).then(function (res) { closeSheet(); rEd = null; apply(res, r.name + ' routine saved'); }, function (e) { t.disabled = false; t.textContent = 'Save routine'; toast(e.message, true); });
    }
    if (t.id === 'rDelete') {
      if (!confirm('Delete the ' + rEd.old + ' routine?')) return;
      return rpc('deleteRoutine', [rEd.old]).then(function (res) { var nm = rEd.old; closeSheet(); rEd = null; apply(res, nm + ' routine deleted'); }, function (e) { toast(e.message, true); });
    }
  });

  var HOME_NAMES = { brief: 'Today brief', win: 'Win the day', deadlines: 'Next deadline', routine: 'Routine for now', tiles: 'Water and weight', stage: 'Characters and pet', ask: 'Ask anything', gym: 'Gym today', work: 'Work: now and next', us: 'Us', feed: 'Partner feed' };
  function homeOrder() { return NudgeFmt.homeOrder(S.fun && S.fun.prefs && S.fun.prefs.home); }
  function prefs() { return (S && S.fun && S.fun.prefs) || {}; }
  // ---------- the look: After Dark or Glam, light or dark (follows the phone unless overridden) ----------
  var darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function skinOf() { var p = prefs(); return p.skin === 'glam' || p.skin === 'afterdark' ? p.skin : (S && S.who === 'partner' ? 'glam' : 'afterdark'); }
  function modeOf() { var m = prefs().mode; return m === 'light' || m === 'dark' ? m : 'auto'; }
  function themeName() { var m = modeOf(), dark = m === 'dark' || (m === 'auto' && (!darkMQ || darkMQ.matches)); return (skinOf() === 'glam' ? 'glam' : 'ad') + '-' + (dark ? 'dark' : 'light'); }
  function applyTheme() {
    var t = themeName(), root = document.documentElement;
    if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    save('skin', skinOf()); save('mode', modeOf());
    var mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#07050c');
  }
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', function () { if (S) applyTheme(); });
  function lookPicker() {
    var sk = skinOf(), m = modeOf();
    return '<div class="lookpick">' + [['afterdark', 'lp-ad', 'After Dark', 'Underground rave'], ['glam', 'lp-glam', 'Glam', 'Spotlight and sparkle']].map(function (o) {
      return '<button type="button" class="' + o[1] + '" data-skin="' + o[0] + '" aria-pressed="' + (sk === o[0]) + '"><b>' + o[2] + '</b><small>' + o[3] + '</small></button>';
    }).join('') + '</div><div class="eyebrow" style="margin:14px 0 6px">Light or dark</div><div class="seg">' + [['auto', 'Match my phone'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-mode="' + o[0] + '" aria-pressed="' + (m === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function applyPrefs() {
    var p = prefs(), root = document.documentElement;
    root.classList.toggle('solo', !!(S && S.solo));
    applyTheme();
    if (p.accent) root.setAttribute('data-accent', p.accent); else root.removeAttribute('data-accent');
    root.setAttribute('data-text', p.text === 'large' ? 'large' : 'normal');
    root.classList.toggle('calm', p.motion === false);
    save('accent', p.accent || '');
    var st = {};
    ['bg', 'cards', 'font', 'corners'].forEach(function (k) { var v = p[k] && STYLE_OPTS[k][0][0] !== p[k] ? p[k] : ''; if (v) { root.setAttribute('data-' + k, v); st[k] = v; } else root.removeAttribute('data-' + k); });
    save('style', st);
    setTod();
  }
  // the style studio (labels; the server keeps the same lists)
  var STYLE_OPTS = {
    bg: [['live', 'Live', 'Drifts with the time of day'], ['lasers', 'Lasers', 'Slow sweeping beams'], ['grid', 'Grid', 'Synthwave floor'], ['stars', 'Stars', 'Quiet twinkle'], ['plain', 'Plain', 'Nothing moving']],
    cards: [['soft', 'Soft', 'The usual'], ['glass', 'Glass', 'Frosted, see-through'], ['neon', 'Neon', 'Glowing edges'], ['outline', 'Outline', 'Just the lines'], ['flat', 'Flat', 'No borders']],
    font: [['default', 'Clean', 'System font'], ['rounded', 'Rounded', 'Soft and friendly'], ['mono', 'Mono', 'Typewriter'], ['serif', 'Serif', 'Bookish'], ['condensed', 'Poster', 'Tall and tight']],
    corners: [['round', 'Round', ''], ['sharp', 'Sharp', ''], ['pill', 'Pill', '']]
  };
  function setTod() {
    var h = new Date(now()).getHours(), t = h < 5 || h >= 21 ? 'night' : h < 9 ? 'dawn' : h < 17 ? 'day' : 'dusk';
    if (document.documentElement.getAttribute('data-tod') !== t) document.documentElement.setAttribute('data-tod', t);
  }
  setInterval(setTod, 5 * 60 * 1000);
  function styleStudio(p) {
    var lab = { bg: 'Background', cards: 'Cards', font: 'Font', corners: 'Corners' };
    return '<section class="card"><div class="head"><h3>Style studio</h3><button class="btn ghost sm" type="button" data-stylereset="1">Reset</button></div><p class="small muted" style="margin:0 0 4px">Make it yours. Everything follows you to any phone.</p>' +
      Object.keys(STYLE_OPTS).map(function (k) {
        var cur = p[k] || STYLE_OPTS[k][0][0];
        return '<div class="eyebrow" style="margin:12px 0 6px">' + lab[k] + '</div><div class="stylepick">' + STYLE_OPTS[k].map(function (o) {
          return '<button type="button" data-style="' + k + ':' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + (o[2] ? '<small>' + o[2] + '</small>' : '') + '</button>';
        }).join('') + '</div>';
      }).join('') + '</section>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-style], [data-stylereset]'); if (!b || !S) return;
    if (b.dataset.stylereset) return savePrefs({ bg: 'live', cards: 'soft', font: 'default', corners: 'round' }, 'Back to the default style');
    var kv = b.dataset.style.split(':'), ch = {}; ch[kv[0]] = kv[1]; buzz(10); savePrefs(ch);
  });
  function savePrefs(change, msg) {
    S.fun.prefs = Object.assign({}, prefs(), change);
    if (change.char !== undefined) S.fun.chars[S.who] = change.char;
    applyPrefs(); renderAll();
    if (msg) toast(msg);
    save('state-' + KEY.slice(0, 6), S); later('setPrefs', [change]);
  }

  var charGame = 'sa';
  function renderCustom() {
    loadBackupInfo();
    var p = prefs(), th = document.documentElement.getAttribute('data-theme'), cur = charOf(S.who), n = names(), h = '';
    h += '<div class="top"><div class="row"><button class="iconbtn" type="button" data-goto="you" aria-label="Back">' + icon('back') + '</button><h1>Customise</h1></div></div>';
    // character
    h += '<section class="card"><div class="head"><h3>Your look</h3></div><div class="row" style="gap:14px">' + avatarOf(S.who, 72) + '<p class="small muted grow" style="margin:0">Your face everywhere in the app comes from your character in the dressing room: skin, hair, clothes and extras.</p></div><button class="btn primary wide" type="button" data-dress="open" style="margin-top:12px">' + icon('sparkles', 's') + 'Open the dressing room</button></section>';
    // look
    h += '<section class="card spot"><div class="head"><h3>Look</h3></div>' + lookPicker() +
      '<div class="eyebrow" style="margin:14px 0 6px">Accent colour</div><div class="swatches">' + [['', 'Lilac'], ['pink', 'Pink'], ['green', 'Green'], ['teal', 'Teal'], ['orange', 'Orange'], ['blue', 'Blue'], ['lime', 'Lime'], ['red', 'Red'], ['gold', 'Gold']].map(function (o) {
        return '<button type="button" class="sw-' + (o[0] || 'lilac') + '" data-accent="' + o[0] + '" aria-pressed="' + ((p.accent || '') === o[0]) + '" aria-label="' + o[1] + '"></button>';
      }).join('') + '</div>' +
      '<div class="eyebrow" style="margin:14px 0 6px">Text size</div><div class="seg">' + [['normal', 'Normal'], ['large', 'Larger']].map(function (o) { return '<button type="button" data-textsize="' + o[0] + '" aria-pressed="' + ((p.text || 'normal') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></section>';
    h += styleStudio(p);
    // names and titles
    h += '<section class="card"><div class="head"><h3>Names</h3></div><form class="stack" id="namesForm" autocomplete="off">' +
      '<label class="small muted">What the app calls you<input type="text" id="nickText" value="' + esc(n.me) + '" maxlength="24"></label>' +
      '<label class="small muted">The two of you<input type="text" id="teamText" value="' + esc(n.team) + '" maxlength="40"></label>' +
      '<button class="btn primary" type="submit">Save names</button></form>' +
      '<div class="eyebrow" style="margin:14px 0 6px">Level titles</div><div class="seg">' + [['dj', 'DJ'], ['glam', 'Glam'], ['city', 'City'], ['none', 'Plain']].map(function (o) {
        return '<button type="button" data-titles="' + o[0] + '" aria-pressed="' + (String(S.fun.titles || 'none').toLowerCase() === o[0] || (o[0] === 'none' && !/^(dj|glam|city)$/i.test(S.fun.titles || ''))) + '">' + o[1] + '</button>';
      }).join('') + '</div><p class="tiny muted" style="margin:0">' + (S.fun.era ? 'Now: ' + esc(S.fun.era) + (S.fun.nextEra ? ' · next: ' + esc(S.fun.nextEra) : '') : 'Just "Level ' + S.game.level.level + '"') + '</p></section>';
    // home layout
    h += '<section class="card"><div class="head"><h3>Home screen</h3><button class="btn ghost sm" type="button" data-homereset="1">Reset</button></div><p class="small muted" style="margin:0 0 6px">Move things up or down, or hide them.</p>' +
      homeOrder().map(function (x, i, all) {
        return '<div class="item' + (x.hide ? ' done' : '') + '"><button class="check' + (x.hide ? '' : ' on') + '" type="button" data-homehide="' + x.id + '" aria-label="Show or hide">' + icon('check') + '</button><div class="grow t" style="font-weight:550">' + HOME_NAMES[x.id] + '</div>' +
          '<button class="iconbtn" type="button" data-homemove="' + x.id + '" data-dir="-1" aria-label="Move up"' + (i ? '' : ' disabled') + '><svg class="i s" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>' +
          '<button class="iconbtn" type="button" data-homemove="' + x.id + '" data-dir="1" aria-label="Move down"' + (i < all.length - 1 ? '' : ' disabled') + '><svg class="i s" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div>';
      }).join('') + '</section>';
    // feel
    var nag = p.nag || (S.who === 'me' ? 'aggressive' : 'normal');
    h += '<section class="card"><div class="head"><h3>Reminders</h3></div><p class="small muted" style="margin:0 0 8px">How hard the app pushes about deadlines and your streak.</p><div class="seg">' + [['gentle', 'Gentle'], ['normal', 'Normal'], ['aggressive', 'Duolingo']].map(function (o) { return '<button type="button" data-nag="' + o[0] + '" aria-pressed="' + (nag === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<p class="tiny muted" style="margin:0">' + ({ gentle: 'One reminder before a deadline, then hourly once it\'s late.', normal: 'Reminders 30 and 10 minutes before, then every 15 minutes once it\'s late.', aggressive: 'Reminders from an hour before, then every 5 minutes once it\'s late, plus a streak nag every half hour from 6pm. Quiet from 10:30pm to 8am.' })[nag] + '</p></section>';
    h += '<section class="card"><div class="head"><h3>Feel</h3></div>' + [['sound', 'Sounds', 'Chimes for done, levels and timers'], ['haptics', 'Vibration', 'A little buzz when you tick things'], ['confetti', 'Confetti', 'Celebrations when you earn XP'], ['motion', 'Animations', 'Turn off for a calmer app']].map(function (o) {
      var on = p[o[0]] !== false;
      return '<div class="item"><div class="grow"><b>' + o[1] + '</b><div class="tiny muted">' + o[2] + '</div></div><button class="toggle' + (on ? ' on' : '') + '" type="button" data-pref="' + o[0] + '" aria-pressed="' + on + '" aria-label="' + o[1] + '"><i></i></button></div>';
    }).join('') + '</section>';
    if (ME) h += '<section class="card" id="backupCard"><div class="head"><h3>Backups</h3></div><p class="small muted" style="margin:0 0 8px">Every morning a copy of everything goes to a separate "Nudge backups" sheet in your Drive (the last ' + (backupInfo ? backupInfo.keep : 14) + ' days are kept). ' +
      (backupInfo ? (backupInfo.last ? 'Last backup: ' + esc(backupInfo.last) + '.' : 'No backup yet.') + (backupInfo.url ? ' <a href="' + esc(backupInfo.url) + '" target="_blank" rel="noopener">Open backups</a>' : '') : '') + '</p>' +
      '<div class="grid2"><button class="btn soft" type="button" data-backup="export">' + icon('undo', 's') + 'Export everything</button><label class="btn soft">Import backup<input type="file" accept=".json,application/json" id="backupFile" hidden></label></div>' +
      '<button class="btn ghost wide" type="button" data-backup="now" style="margin-top:8px">Back up now</button>' +
      '<p class="tiny muted" style="margin:8px 0 0">Importing never touches your live data: it rebuilds the backup as a new sheet so you can check it first.</p></section>';
    h += '<p class="small muted center">Your choices follow you to any phone you open the app on.' + (S.solo ? '' : ' ' + esc(n.other) + ' has their own.') + '</p>';
    el('tab-custom').innerHTML = h;
  }

  // ---------- backups (Dean's link: the backup holds both of you) ----------
  var backupInfo = null;
  function loadBackupInfo() { if (!ME || backupInfo) return; rpc('backupStatus', []).then(function (b) { backupInfo = b; if (el('backupCard')) renderCustom(); }, function () {}); }
  function downloadText(name, text) {
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-backup]'); if (!b) return;
    if (b.dataset.backup === 'export') { toast('Gathering everything…'); return rpc('exportAll', []).then(function (json) { downloadText('nudge-backup-' + new Date().toISOString().slice(0, 10) + '.json', json); toast('Saved to your downloads'); }, function (e) { toast(e.message, true); }); }
    if (b.dataset.backup === 'now') { toast('Backing up…'); return rpc('backupNow', []).then(function (r) { backupInfo = r; renderCustom(); toast(r.msg); }, function (e) { toast(e.message, true); }); }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id !== 'backupFile' || !ev.target.files.length) return;
    var f = ev.target.files[0]; ev.target.value = '';
    f.text().then(function (text) {
      toast('Rebuilding the backup as a new sheet…');
      return rpc('importBackup', [text]).then(function (r) {
        openSheet('<h2>Backup rebuilt</h2><p class="muted">' + r.tabs + ' tabs restored into a new sheet, "' + esc(r.name) + '". Your live data hasn\'t changed. Check it over; to switch back to it, copy the tabs you need across.</p><a class="btn primary wide" href="' + esc(r.url) + '" target="_blank" rel="noopener">Open it</a><button class="btn ghost wide" type="button" data-close="1" style="margin-top:8px">Done</button>');
      });
    }).catch(function (e) { toast(e.message, true); });
  });

  function lookEditor(id) {
    var O = LQPortrait.OPTIONS, L = lookOf(S.who) || {}, base = LQPortrait.look(id), h = '<section class="card"><div class="head"><h3>Your look</h3>' + (Object.keys(L).length ? '<button class="btn ghost sm" type="button" data-lookreset="1">Reset</button>' : '') + '</div>';
    h += '<div class="lookprev">' + avatarOf(S.who, 112) + '<p class="small muted" style="margin:0">Change anything. "Theirs" keeps ' + esc(charById(id)[2]) + '\'s own style.</p></div>';
    function chips(key, label) {
      return '<div class="eyebrow" style="margin:12px 0 6px">' + label + '</div><div class="chips">' + O[key].map(function (o) {
        var on = (L[key] || '') === o[0];
        return '<button class="chip" type="button" data-look="' + key + '" data-v="' + o[0] + '" aria-pressed="' + on + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    function swatches(key, label) {
      return '<div class="eyebrow" style="margin:12px 0 6px">' + label + '</div><div class="swatches small">' + O[key].map(function (c) {
        return '<button type="button" data-look="' + key + '" data-v="' + c + '" aria-pressed="' + (L[key] === c) + '" aria-label="' + c + '" style="background:' + c + '"></button>';
      }).join('') + '</div>';
    }
    h += chips('hair', 'Hair') + swatches('hc', 'Hair colour') + chips('top', 'Clothes') + swatches('tc', 'Clothes colour') + chips('head', 'On your head') + chips('eyes', 'Glasses') + chips('face', 'Facial hair') + chips('ear', 'Earrings');
    h += '<div class="eyebrow" style="margin:12px 0 6px">Skin</div><div class="swatches small">' + O.skin.map(function (o) {
      return o[0] ? '<button type="button" data-look="skin" data-v="' + o[0] + '" aria-pressed="' + (L.skin === o[0]) + '" aria-label="Skin tone" style="background:' + LQPortrait.SKIN[o[0]] + '"></button>' : '<button type="button" data-look="skin" data-v="" aria-pressed="' + !L.skin + '" aria-label="Theirs" style="background:' + LQPortrait.SKIN[base.skin] + ';outline:2px dashed var(--line)"></button>';
    }).join('') + '</div></section>';
    return h;
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-look], [data-lookreset]');
    if (!t || !S || !ev.target.closest('#tab-custom')) return;
    var L = Object.assign({}, lookOf(S.who) || {});
    if (t.dataset.lookreset) L = {};
    else if (t.dataset.v) L[t.dataset.look] = t.dataset.v; else delete L[t.dataset.look];
    S.fun.looks = S.fun.looks || {}; S.fun.looks[S.who] = L;
    buzz(10);
    savePrefs({ look: L });
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-char], [data-cgame], [data-accent], [data-textsize], [data-titles], [data-homehide], [data-homemove], [data-homereset], [data-pref], [data-nag]');
    if (!t || !S || !ev.target.closest('#tab-custom')) return;
    var d = t.dataset;
    if (d.cgame) { charGame = d.cgame; return renderCustom(); }
    if (d.char !== undefined) { var c = charById(d.char); buzz(20); return savePrefs({ char: d.char }, c ? 'You\'re ' + c[2] + ' now.' : 'Character removed'); }
    if (d.accent !== undefined) return savePrefs({ accent: d.accent });
    if (d.textsize) return savePrefs({ text: d.textsize });
    if (d.nag) return savePrefs({ nag: d.nag }, d.nag === 'aggressive' ? 'Duolingo mode. You asked for this.' : 'Reminders changed');
    if (d.titles) return savePrefs({ titles: d.titles }, 'Level titles changed');
    if (d.pref) { var ch = {}; ch[d.pref] = prefs()[d.pref] === false; return savePrefs(ch); }
    if (d.homereset) return savePrefs({ home: [] }, 'Home screen reset');
    var list = homeOrder();
    if (d.homehide) { list.forEach(function (x) { if (x.id === d.homehide) x.hide = !x.hide; }); return savePrefs({ home: list }); }
    if (d.homemove) {
      var i = list.map(function (x) { return x.id; }).indexOf(d.homemove), j = i + Number(d.dir);
      if (j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      return savePrefs({ home: list });
    }
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'namesForm') return;
    ev.preventDefault();
    savePrefs({ nick: el('nickText').value, team: el('teamText').value }, 'Names saved');
  });

  // ---------- DEADLINES (they nag until done) ----------
  function money(n) { return (n < 0 ? '−£' : '£') + Math.abs(Math.round(n)).toLocaleString('en-GB'); }
  function dueLabel(due) {
    var mins = Math.round((due - now()) / 60000), a = Math.abs(mins), span = a >= 60 ? Math.floor(a / 60) + 'h ' + (a % 60) + 'm' : a + ' min';
    return mins >= 0 ? span + ' left' : span + ' late';
  }
  var dlAdd = false, dlAll = false;
  /** Home's deadline slot: the next one (more on a tap), or just a small "+ Add deadline" link when there are none. */
  function deadlinesCard() {
    var list = (S.deadlines || []).slice().sort(function (x, y) { return x.due - y.due; });
    if (!list.length && !dlAdd) return '<p class="addline"><button class="btn ghost sm" type="button" data-dladd="1">' + icon('plus', 's') + 'Add deadline</button></p>';
    var show = dlAll ? list : list.slice(0, 1);
    var h = '<section class="card dl"><div class="head"><h3 class="row" style="gap:8px">' + icon('clock', 's') + (list.length ? 'Next deadline' : 'New deadline') + '</h3>' +
      (list.length && !dlAdd ? '<button class="btn ghost sm" type="button" data-dladd="1" aria-label="Add a deadline">' + icon('plus', 's') + 'Add</button>' : '') + '</div>';
    h += show.map(function (d) {
      var late = d.due < now();
      return '<div class="dlrow' + (late ? ' late' : '') + '"><div class="grow"><b>' + esc(d.task) + '</b><div class="small"><span>by ' + esc(d.dueText.slice(-5)) + (d.dueText.slice(0, 10) !== (S.today ? S.today.date : d.dueText.slice(0, 10)) ? ' ' + esc(dayLabel(d.dueText.slice(0, 10)).toLowerCase()) : '') + '</span> · <span data-due="' + d.due + '">' + dueLabel(d.due) + '</span></div></div>' +
        '<div class="dlbtns"><button class="btn primary sm" type="button" data-dl="' + esc(d.id) + '" data-act="done">' + icon('check', 's') + 'Done</button><button class="btn soft sm" type="button" data-dl="' + esc(d.id) + '" data-act="extend">+30m</button><button class="btn ghost sm" type="button" data-dl="' + esc(d.id) + '" data-act="park">Park</button></div></div>';
    }).join('');
    if (list.length > 1) h += '<button class="btn ghost sm" type="button" data-dlall="1" style="margin-top:4px">' + (dlAll ? 'Show just the next' : list.length - 1 + ' more') + '</button>';
    if (dlAdd || !list.length) h += '<form class="inline" id="dlForm" autocomplete="off" style="margin-top:' + (list.length ? 10 : 0) + 'px"><input type="text" id="dlText" placeholder="Send the invoice by 3pm" aria-label="Something with a deadline" maxlength="140"><button class="btn primary" type="submit">Add</button></form>' +
      '<p class="tiny muted" style="margin:6px 0 0">Add a time ("by 3pm", "in 2 hours", "tonight") and it nags until it\'s done. Park costs 10 XP, +30m costs 3.</p>';
    return h + '</section>';
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-dladd], [data-dlall]'); if (!t || !S) return;
    if (t.dataset.dladd) { dlAdd = true; renderHome(); var i = el('dlText'); if (i) i.focus(); } else { dlAll = !dlAll; renderHome(); }
  });
  function deadlineAct(id, act, fromNote) {
    if (act === 'park' && !fromNote && !confirm('Park it? That costs 10 XP. It goes to Saved for later.')) return;
    // on screen now; the XP lands when the server confirms
    var d0 = (S.deadlines || []).filter(function (x) { return x.id === id; })[0];
    if (act === 'done' || act === 'park') S.deadlines = (S.deadlines || []).filter(function (x) { return x.id !== id; });
    else if (d0) { d0.due += 30 * 60000; d0.dueText = d0.dueText.slice(0, 11) + new Date(d0.due).toTimeString().slice(0, 5); }
    if (act === 'done') { addXpLocal(d0 && d0.due >= now() ? 15 : 5); buzz([20, 30, 20]); }
    renderAll(); save('state-' + KEY.slice(0, 6), S);
    toast(act === 'done' ? 'Done. Nice.' : act === 'park' ? 'Parked. −10 XP' : 'Thirty more minutes. −3 XP');
    call('deadlineAction', [id, act]);
  }
  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'dlForm' || !S) return;
    var v = el('dlText').value.trim();
    if (!v) { toast('Type a job with a time, like "Send the invoice by 3pm"'); el('dlText').focus(); return; }
    call('addDeadline', [v], function (r) { el('dlText').value = ''; dlAdd = false; apply(r.state, r.added.task + ': due ' + (r.added.inMin < 60 ? 'in ' + r.added.inMin + ' min' : 'at ' + r.added.dueText.slice(-5) + (r.added.inMin > 1440 - 60 * new Date(now()).getHours() ? ' tomorrow' : '')) + '. I\'ll keep reminding you.'); });
  });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-dl]');
    if (t && S) deadlineAct(t.dataset.dl, t.dataset.act);
  });
  // Buttons on a notification arrive here (open app) or in the address (app was closed).
  function handleNoteAction(id, act) { if (S && id && ['done', 'park', 'extend'].indexOf(act) !== -1) deadlineAct(id, act, true); }

  // ---------- EMPIRE (cash, property, vehicles) ----------
  var TYPE_ICON = { home: 'home', business: 'building', car: 'car', bike: 'bike', boat: 'boat', air: 'plane' };
  var TYPE_NAME = { home: 'Home', business: 'Business', car: 'Car', bike: 'Bike', boat: 'Boat', air: 'Aircraft' };
  var empView = load('empView') || 'owned', empGame = load('empGame') || 'all';
  function itemArt(it, size) {
    return '<span class="art ' + it.game + '" style="width:' + size + 'px;height:' + size + 'px">' + icon(TYPE_ICON[it.type] || 'star') + '</span>';
  }
  function renderEmpire() {
    var e = S.empire, n = names(), h = '';
    if (!e) return;
    h += '<div class="top"><div class="row"><button class="iconbtn" type="button" data-goto="you" aria-label="Back">' + icon('back') + '</button><h1>Empire</h1></div></div>';
    h += '<section class="card spot bank"><div class="eyebrow">Cash</div><div class="num big">' + money(e.cash) + '</div>' +
      '<div class="small">' + (e.income ? '+' + money(e.income) + ' a day from your businesses · ' : '') + 'worth ' + money(e.worth) + '</div>' +
      '<div class="tiny" style="margin-top:8px;opacity:.85">Every XP you earn pays ' + money(10) + '. Businesses pay every morning.</div></section>';
    var bd = e.breakdown;
    if (bd) h += '<section class="card"><div class="head"><h3>How your cash adds up</h3></div>' + [
      ['From XP (' + money(bd.perXp) + ' each)', bd.fromXp], ['Starting payout for XP before cash existed', bd.start], ['Business income', bd.income], ['Sold', bd.sold], ['Spent', -bd.spent]
    ].filter(function (r) { return r[1]; }).map(function (r) { return '<div class="stat"><span>' + esc(r[0]) + '</span><b class="num">' + (r[1] < 0 ? '−' + money(-r[1]) : money(r[1])) + '</b></div>'; }).join('') +
      '<div class="stat" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span><b>Cash now</b></span><b class="num">' + money(bd.total) + '</b></div></section>';
    h += '<div class="small muted" style="margin:-4px 0 12px">' + esc(n.other) + ': worth ' + money(e.other.worth) + (e.other.rideName ? ' · rides a ' + esc(e.other.rideName) : '') + (e.other.homeName ? ' · lives at ' + esc(e.other.homeName) : '') + '</div>';
    h += '<div class="seg">' + [['owned', 'Yours'], ['property', 'Property'], ['vehicles', 'Vehicles']].map(function (o) { return '<button type="button" data-empview="' + o[0] + '" aria-pressed="' + (empView === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (empView === 'owned') {
      if (!e.owned.length) h += '<section class="card center"><p class="muted" style="margin:0 0 12px">You don\'t own anything yet. A corner terrace house is ' + money(5000) + ', a BMX is ' + money(500) + '.</p><button class="btn primary" type="button" data-empview="property">Go shopping</button></section>';
      e.owned.forEach(function (o) {
        var fav = o.id === e.ride || o.id === e.home, isPlace = o.type === 'home' || o.type === 'business';
        h += '<section class="card owned"><div class="row" style="gap:12px;align-items:flex-start">' + itemArt(o, 52) + '<div class="grow"><b>' + esc(o.name) + '</b><div class="small muted">' + esc(o.area) + '</div>' +
          '<div class="small" style="margin-top:4px">' + (o.income ? '<b>+' + money(o.income) + '</b> a day · ' : '') + 'worth ' + money(o.worth) + '</div></div>' +
          (fav ? '<span class="chip good">' + (isPlace ? 'Home' : 'Your ride') + '</span>' : '<button class="btn soft sm" type="button" data-fav="' + o.id + '">' + (isPlace ? 'Call it home' : 'Ride it') + '</button>') + '</div>' +
          (o.upgrades.length ? '<div class="chips" style="margin-top:10px">' + o.upgrades.map(function (u) { return '<span class="chip lilac">' + icon('check', 's') + esc(upName(u)) + '</span>'; }).join('') + '</div>' : '') +
          (o.next.length ? '<div class="eyebrow" style="margin:12px 0 2px">Upgrades</div>' + o.next.map(function (u) {
            var ok = e.cash >= u.cost;
            return '<div class="item"><div class="grow"><b style="font-weight:550">' + esc(u.name) + '</b>' + (u.boost ? '<div class="tiny muted">+' + money(u.boost) + ' a day</div>' : '') + '</div><button class="btn ' + (ok ? 'primary' : 'line') + ' sm" type="button" data-upg="' + o.id + '" data-u="' + u.id + '"' + (ok ? '' : ' disabled') + '>' + money(u.cost) + '</button></div>';
          }).join('') : '') +
          '<div class="right" style="margin-top:8px"><button class="btn ghost sm" type="button" data-sell="' + o.id + '">Sell for ' + money(o.worth * 0.6) + '</button></div></section>';
      });
    } else {
      h += '<div class="chips" style="margin:-4px 0 12px">' + [['all', 'All'], ['sa', 'Sunset Coast'], ['vc', 'Neon City']].map(function (o) { return '<button class="chip" type="button" data-empgame="' + o[0] + '" aria-pressed="' + (empGame === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
      var have = {};
      e.owned.forEach(function (o) { have[o.id] = 1; });
      var items = S.catalog.filter(function (it) { return (empView === 'property' ? (it.type === 'home' || it.type === 'business') : !(it.type === 'home' || it.type === 'business')) && (empGame === 'all' || it.game === empGame); });
      h += '<section class="card">' + items.map(function (it) {
        var ok = e.cash >= it.price;
        return '<div class="item shop">' + itemArt(it, 46) + '<div class="grow"><b>' + esc(it.name) + '</b><div class="tiny muted">' + esc(it.area) + ' · ' + TYPE_NAME[it.type] + '</div>' + (it.income ? '<div class="tiny" style="color:var(--good);font-weight:650">+' + money(it.income) + ' a day</div>' : '') + '</div>' +
          (have[it.id] ? '<span class="chip good">Owned</span>' : '<button class="btn ' + (ok ? 'primary' : 'line') + ' sm" type="button" data-buy="' + it.id + '"' + (ok ? '' : ' disabled') + '>' + money(it.price) + '</button>') + '</div>';
      }).join('') + '</section>';
      if (items.length && !items.some(function (it) { return e.cash >= it.price && !have[it.id]; })) h += '<p class="small muted center">Keep earning XP: every 1 XP is $10.</p>';
    }
    el('tab-empire').innerHTML = h;
  }
  var UPG_NAMES = { paint: 'Fresh paint and furniture', studio: 'Music studio and DJ booth', gallery: 'Art wall and gallery lights', garage: 'Garage with a workshop', pool: 'Rooftop pool', respray: 'Respray', rims: 'New wheels', nitro: 'Nitro', hydraulics: 'Hydraulics', sound: 'Big sound system' };
  function upName(id) { return UPG_NAMES[id] || id; }
  function catItem(id) { for (var i = 0; i < S.catalog.length; i++) if (S.catalog[i].id === id) return S.catalog[i]; return null; }
  function theName(nm) { return /^The /.test(nm) ? nm : 'the ' + nm; }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-empview], [data-empgame], [data-buy], [data-upg], [data-sell], [data-fav]');
    if (!t || !S || !ev.target.closest('#tab-empire')) return;
    var d = t.dataset;
    if (d.empview) { empView = d.empview; save('empView', empView); return renderEmpire(); }
    if (d.empgame) { empGame = d.empgame; save('empGame', empGame); return renderEmpire(); }
    if (d.buy) { var it = catItem(d.buy); if (!confirm('Buy ' + theName(it.name) + ' for ' + money(it.price) + '?')) return; return call('buyItem', [d.buy], function (res) { confetti(true); chime([523, 659, 784, 1047]); buzz([40, 30, 80]); apply(res, 'It\'s yours: ' + it.name); }); }
    if (d.upg) return call('upgradeItem', [d.upg, d.u], function (res) { confetti(false); chime([659, 880]); apply(res, upName(d.u) + ': done'); });
    if (d.sell) { var o = catItem(d.sell); if (!confirm('Sell ' + theName(o.name) + '? You get 60% of what you put in.')) return; return call('sellItem', [d.sell], function (res) { apply(res, 'Sold ' + theName(o.name)); }); }
    if (d.fav) return call('setFavourite', [d.fav], function (res) { apply(res, 'Done'); });
  });

  // ---------- PLAN THE WEEK (pair jobs with people, Duolingo style) ----------
  var planDraft = null, planPick = '';
  function planWho() { var n = names(); return [['me', S.who === 'me' ? n.me || 'You' : n.other], ['partner', S.who === 'partner' ? n.me || 'You' : n.other], ['together', 'Together'], ['rotate', 'Take turns'], ['anyone', 'Either']]; }
  function planView() {
    var list = S.plan || [];
    if (!planDraft) { planDraft = {}; list.forEach(function (q) { planDraft[q.name] = q.who; }); }
    var whos = planWho(), count = { me: 0, partner: 0, together: 0, rotate: 0, anyone: 0 }, mins = { me: 0, partner: 0 };
    list.forEach(function (q) { var w = planDraft[q.name]; count[w]++; if (w === 'me' || w === 'partner') mins[w] += q.minutes * (q.rhythm === 'daily' ? 7 : q.rhythm === 'weekly' ? 1 : 0.5); });
    var changed = list.some(function (q) { return planDraft[q.name] !== q.who; });
    var h = '<section class="card tint"><b>Plan your week</b><p class="small" style="margin:4px 0 0">Tap a job, then tap who does it. <b>Together</b> jobs earn you <b>both double XP</b>.</p></section>';
    h += '<div class="pairs">';
    h += '<div class="pcol">' + list.map(function (q) {
      var w = planDraft[q.name];
      return '<button type="button" class="pjob w-' + w + (planPick === q.name ? ' pick' : '') + '" data-pjob="' + esc(q.name) + '"><b>' + esc(q.name) + '</b><span>' + esc(q.label) + ' · ' + q.minutes + ' min</span>' +
        '<em>' + (w === 'together' ? '2× XP together' : w === 'anyone' ? 'Either of you' : w === 'rotate' ? 'Take turns' : esc((whos.filter(function (x) { return x[0] === w; })[0] || ['', 'Either of you'])[1])) + '</em></button>';
    }).join('') + '</div>';
    h += '<div class="pwho">' + whos.map(function (x) {
      return '<button type="button" class="ppl w-' + x[0] + (planPick ? ' ready' : '') + '" data-pwho="' + x[0] + '">' + (x[0] === 'together' ? icon('heart', 's') : x[0] === 'anyone' || x[0] === 'rotate' ? icon('shuffle', 's') : avatarOf(x[0], 26)) + '<b>' + esc(x[1]) + '</b><span>' + count[x[0]] + ' job' + (count[x[0]] === 1 ? '' : 's') + (x[0] === 'together' ? ' · 2× XP' : '') + '</span></button>';
    }).join('') + '</div></div>';
    var n = names();
    h += '<p class="small muted center">About ' + Math.round(mins[S.who] / 60 * 10) / 10 + 'h of solo jobs for you this week, ' + Math.round(mins[S.who === 'me' ? 'partner' : 'me'] / 60 * 10) / 10 + 'h for ' + esc(n.other) + '.</p>';
    h += '<button class="btn primary big wide" type="button" id="planSave"' + (changed ? '' : ' disabled') + '>' + (changed ? 'Save the week' : 'Saved') + '</button>';
    return h;
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-pjob], [data-pwho], #planSave, [data-together]');
    if (!t || !S) return;
    if (t.dataset.pjob) { planPick = planPick === t.dataset.pjob ? '' : t.dataset.pjob; buzz(10); return renderChores(); }
    if (t.dataset.pwho) {
      if (!planPick) { toast('Tap a job first, then who does it.'); return; }
      planDraft[planPick] = t.dataset.pwho; chime([660, 880]); buzz(15);
      var list = S.plan.map(function (q) { return q.name; }), i = list.indexOf(planPick);
      planPick = list.slice(i + 1).concat(list.slice(0, i)).filter(function (nm) { return planDraft[nm] === 'anyone'; })[0] || '';
      return renderChores();
    }
    if (t.id === 'planSave') { return call('saveWeekPlan', [planDraft], function (res) { planDraft = null; planPick = ''; confetti(false); apply(res, 'Week planned. ' + names().other + ' can see it.'); }); }
    if (t.dataset.together !== undefined) {
      var nm = t.dataset.name, q = questByName(nm), both = t.dataset.together === '1';
      closeSheet();
      return quick(function () {
        [S.quests.board, S.quests.more, S.quests.all].forEach(function (l) { l.forEach(function (x) { if (x.name === nm) { x.doneToday = true; x.doneBy = S.who; } }); });
        if (q) addXpLocal(both ? q.xp * 2 : q.xp);
      }, 'questDone', [nm, both], both ? nm + ': done together. Double XP for you both' : nm + ': done');
    }
  });
  function togetherSheet(q) {
    openSheet('<h2>' + esc(q.name) + '</h2><p class="small muted" style="margin:4px 0 14px">This is a together job. Did you do it with ' + esc(names().other) + '?</p>' +
      '<button class="btn primary big wide" type="button" data-together="1" data-name="' + esc(q.name) + '" style="margin-bottom:8px">' + icon('heart', 's') + 'Together: +' + q.xp * 2 + ' XP each</button>' +
      '<button class="btn line wide" type="button" data-together="0" data-name="' + esc(q.name) + '">Just me: +' + q.xp + ' XP</button>');
  }

  // ---------- MUSIC (mixes that last as long as the job) ----------
  var musicMins = 20, musicNow = null;
  function M() { return window.LQMusic; }
  // Your own songs (files on this phone): played in order until the timer, then faded out. Nothing is uploaded.
  var own = null;
  function ownEndAt() { var cur = mySession(); return cur ? cur.endsAt - offset : own.fixedEnd; }
  function playOwn(files) {
    stopOwn(); stopWeb(); if (M() && M().now()) M().stop(true);
    own = { files: files, idx: 0, audio: new Audio(), fixedEnd: Date.now() + musicMins * 60000, timer: 0, fading: false };
    own.audio.onended = function () { if (!own) return; own.idx++; if (own.idx >= own.files.length || Date.now() >= ownEndAt()) return stopOwn(); loadOwn(); };
    own.timer = setInterval(function () {
      if (!own) return;
      var left = ownEndAt() - Date.now();
      if (left <= 6000 && !own.fading) { own.fading = true; var v = 1, f = setInterval(function () { if (!own) return clearInterval(f); v -= 0.05; own.audio.volume = Math.max(0, v); if (v <= 0) { clearInterval(f); stopOwn(); chime([523, 659]); } }, 300); }
    }, 1000);
    loadOwn(); closeSheet(); renderChores();
    toast('Playing your ' + files.length + ' song' + (files.length === 1 ? '' : 's') + '. It fades out when the timer ends.');
  }
  function loadOwn() { var f = own.files[own.idx]; own.name = f.name.replace(/\.[^.]+$/, ''); own.audio.src = URL.createObjectURL(f); own.audio.play().catch(function () {}); renderChores();
    if ('mediaSession' in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title: own.name, artist: 'Your music' }); } catch (e) {} }
  function stopOwn() { if (!own) return; clearInterval(own.timer); try { own.audio.pause(); } catch (e) {} own = null; renderChores(); }
  function musicBar() {
    if (web) return '<div class="musicbtn playing" style="--c1:' + (web.kind === 'sc' ? '#ff5500' : '#e11d48') + ';--c2:#1f1f1f"><span class="eqi"><i></i><i></i><i></i></span><span class="grow"><b>' + (web.kind === 'sc' ? 'SoundCloud' : 'YouTube') + '</b><br><span class="tiny">Fades out with your timer</span></span><button class="btn ghost sm" type="button" data-fun="webStop">Stop</button></div>';
    if (own) return '<div class="musicbtn playing" style="--c1:#141414;--c2:#b3121f"><span class="eqi"><i></i><i></i><i></i></span><span class="grow"><b>' + esc(own.name || 'Your music') + '</b><br><span class="tiny">Song ' + (own.idx + 1) + ' of ' + own.files.length + ' · fades out with your timer</span></span><button class="btn ghost sm" type="button" data-fun="ownStop">Stop</button></div>';
    var m = M() && M().now();
    if (!m) return '<button class="musicbtn" type="button" data-fun="music">' + icon('music', 's') + '<span class="grow"><b>' + (mySession() ? 'Music for this job' : 'Music library') + '</b><br><span class="tiny muted">' + (mySession() ? 'A mix that lasts your timer and ends on time' : '12 stations. Pick how long and it ends right on time.') + '</span></span>' + icon('chevron', 's') + '</button>';
    return '<div class="musicbtn playing" style="--c1:' + m.station.c1 + ';--c2:' + m.station.c2 + '"><span class="eqi"><i></i><i></i><i></i></span><span class="grow"><b>' + esc(m.station.name) + '</b><br><span class="tiny">' + (m.ending ? 'Last phrase: fading out' : 'Lasts your timer, then fades out') + '</span></span><button class="btn ghost sm" type="button" data-fun="musicStop">Stop</button></div>';
  }
  function musicSheet() {
    var s = mySession(), left = s ? Math.max(1, Math.round((s.endsAt - now()) / 60000)) : 0;
    var h = '<h2>Music</h2><p class="small muted" style="margin:4px 0 12px">' + (s ? 'Plays for your ' + left + ' minute' + (left === 1 ? '' : 's') + ' left on ' + esc(s.task) + ', then finishes on a proper outro.' : 'Pick how long, then a station. It always finishes on a proper outro.') + '</p>';
    if (!s) h += '<div class="seg">' + [10, 20, 30, 45, 60].map(function (x) { return '<button type="button" data-mmins="' + x + '" aria-pressed="' + (musicMins === x) + '">' + x + 'm</button>'; }).join('') + '</div>';
    h += '<div class="stations">' + M().STATIONS.map(function (st) {
      return '<button type="button" class="station" data-station="' + st.id + '" style="--c1:' + st.c1 + ';--c2:' + st.c2 + '"><span class="sart">' + icon(st.p.k.indexOf('x') === -1 ? 'sparkles' : 'disc') + '</span><b>' + esc(st.name) + '</b><span>' + esc(st.style) + ' · ' + st.bpm + ' BPM</span><em>' + esc(st.mood) + '</em></button>';
    }).join('') + '</div><p class="tiny muted" style="margin:10px 0 0">Original music made by the app as it plays, so it\'s never the same twice. If your timer moves, the mix follows.</p>' +
      onlineSection() + '<div class="divider"></div><b>Your own music</b><p class="small muted" style="margin:4px 0 8px">Pick songs saved on this phone. They play in order and fade out when the timer ends. Nothing is uploaded.</p>' +
      '<label class="btn soft wide" style="cursor:pointer">' + icon('music', 's') + 'Choose songs<input type="file" id="ownFiles" accept="audio/*" multiple hidden></label>' +
      '<div class="divider"></div><b>Open in Spotify</b><p class="small muted" style="margin:4px 0 8px">Spotify can\'t follow the timer, but it\'s one tap away.</p>' +
      '<div class="chips" style="margin-bottom:8px">' + ['Lo-fi beats', 'House music', 'Drum and bass', 'Disco classics'].map(function (q) { return '<button class="chip" type="button" data-spotify="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form class="inline" id="spotForm" autocomplete="off"><input type="text" id="spotText" placeholder="Album, artist or playlist" aria-label="Search Spotify"><button class="btn primary" type="submit">Open</button></form>';
    openSheet(h);
  }
  function startMusic(id) {
    var s = mySession(), fixedEnd = Date.now() + musicMins * 60000;
    var endAt = function () { var cur = mySession(); return cur ? cur.endsAt - offset : fixedEnd; };
    if (!s && !musicMins) return;
    M().play(id, endAt, function (e) {
      if (e.type === 'end') { musicNow = null; renderChores(); renderHome(); if (!e.stopped) chime([523, 659]); }
      if (e.type === 'start' || (e.type === 'phrase' && M().now() && M().now().ending)) { musicNow = id; renderChores(); }
    });
    closeSheet();
    toast('Playing ' + M().STATIONS.filter(function (x) { return x.id === id; })[0].name);
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-fun="music"], [data-fun="musicStop"], [data-fun="ownStop"], [data-station], [data-mmins], [data-spotify]');
    if (!t || !S || !M()) return;
    if (t.dataset.fun === 'ownStop') return stopOwn();
    if (t.dataset.spotify) return openSpotify(t.dataset.spotify);
    if (t.dataset.fun === 'music') return musicSheet();
    if (t.dataset.fun === 'musicStop') { M().stop(); return; }
    if (t.dataset.mmins) { musicMins = +t.dataset.mmins; return musicSheet(); }
    if (t.dataset.station) { stopOwn(); stopWeb(); return startMusic(t.dataset.station); }
  });
  function openSpotify(q) { window.open('https://open.spotify.com/search/' + encodeURIComponent(q), '_blank'); }
  // Food photo -> shrink on the phone (fast upload) -> Claude estimates it -> logged with undo.
  function shrinkPhoto(blob, done) {
    var url = URL.createObjectURL(blob), img = new Image();
    img.onload = function () {
      var k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      done(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('Couldn\'t open that photo', true); };
    img.src = url;
  }
  function photoFood(blob, note) {
    if (!S.food || !S.food.hasClaudeKey) { toast('Add your Claude API key in You, Settings first', true); return; }
    toast('Looking at your photo…');
    shrinkPhoto(blob, function (b64) {
      call('quickAddPhoto', [b64, 'image/jpeg', note || ''], function (res) { S.food = res.state; renderFood(); buzz(20); offerUndo(res.undo, 'Logged ' + itemsText(res.added)); });
    });
  }
  /** Something shared to Nudge from another app (the service worker parked it in a cache). */
  function takeShare() {
    if (!window.caches) return;
    caches.open('nudge-share').then(function (c) {
      return Promise.all([c.match('share-text'), c.match('share-photo')]).then(function (r) {
        var tp = r[0] ? r[0].text() : Promise.resolve(''), pp = r[1] ? r[1].blob() : Promise.resolve(null);
        return Promise.all([tp, pp]).then(function (v) {
          c.delete('share-text'); c.delete('share-photo');
          var text = String(v[0] || '').trim(), photo = v[1];
          showTab('food');
          if (photo && photo.size) photoFood(photo, text);
          else if (text) { var q = el('quickText'); if (q) { q.value = text.slice(0, 200); q.focus(); } toast('Check it, then tap Add'); }
        });
      });
    }).catch(function () {});
  }
  document.addEventListener('change', function (ev) { if (ev.target.dataset && ev.target.dataset.tselect && ev.target.value) { tsel = ev.target.value; save('tsel-' + S.today.date, tsel); renderTrain(); } });
  document.addEventListener('change', function (ev) {
    if (ev.target.id !== 'wkImport' || !ev.target.files.length) return;
    var f = ev.target.files[0]; ev.target.value = '';
    toast('Reading ' + f.name + '…');
    f.text().then(function (text) { return rpc('importWorkoutCsv', [text]); }).then(function (r) {
      apply(r.state); renderTrain();
      toast(r.added ? 'Imported ' + r.added + ' workout' + (r.added === 1 ? '' : 's') + ' (' + r.sets + ' sets, ' + r.prs + ' PRs)' + (r.skipped ? '. ' + r.skipped + ' were already in.' : '') : 'All ' + r.skipped + ' workouts were already in.');
    }).catch(function (e) { toast(e.message, true); });
  });
  document.addEventListener('change', function (ev) { if (ev.target.id === 'foodPhoto' && ev.target.files.length) { photoFood(ev.target.files[0]); ev.target.value = ''; } });
  document.addEventListener('change', function (ev) { if (ev.target.id === 'ownFiles' && ev.target.files.length) playOwn([].slice.call(ev.target.files)); });
  document.addEventListener('submit', function (ev) { if (ev.target.id !== 'spotForm') return; ev.preventDefault(); var q = el('spotText').value.trim(); if (q) openSpotify(q); else toast('Type an album, artist or playlist'); });

  // ---------- BOOTH (the DJ game lives in booth.html; the old Mix game is retired) ----------
  function boothUrl(screen) { var base = MODE === 'gas' && S.fun && S.fun.appBase ? S.fun.appBase.replace(/[?#].*$/, '').replace(/\/?$/, '/') : ''; return base + 'booth.html' + (MODE === 'gas' && KEY ? '?key=' + encodeURIComponent(KEY) : '') + '#' + screen; }
  function setCard(set, n) {
    var bo = S.games && S.games.booth, m = bo && bo.mine, o = bo && bo.other;
    var line = function (x) { return x && x.tries ? '<b>' + esc(x.grade || '-') + '</b> ' + x.score : '<span class="muted">not yet</span>'; };
    return '<section class="card djset-card"><div class="between"><div><div class="eyebrow">The mixing game · today\'s challenge</div><h3 style="margin:2px 0 0">Afterhours: Booth</h3></div>' +
      '<div class="right small">You ' + line(m) + '<br>' + esc(n.other) + ' ' + line(o) + '</div></div>' +
      '<p class="small muted" style="margin:8px 0 10px">Tutorials, transition drills, manual beatmatching, a ghost-line rhythm game and set mode, scored on bass clashes, volume, timing and smoothness. Best on your PC with the Inpulse 500.' + (m && m.title ? ' Today: ' + esc(m.title) + '.' : '') + '</p>' +
      '<a class="btn primary wide" target="_top" href="' + boothUrl('menu') + '">' + icon('disc', 's') + 'Open Booth</a>' +
      '<div class="grid2" style="margin-top:8px"><a class="btn line" target="_top" href="' + boothUrl('daily') + '">Today\'s challenge</a><button class="btn line" type="button" data-mix="set">First version</button></div></section>';
  }
  function openSet() {
    if (!window.LQDJ || !M()) return toast('The DJ game isn\'t available here.', true);
    if (M().now()) M().stop(true);
    stopWeb(); stopOwn();
    LQDJ.open({
      otherName: names().other, toast: toast,
      best: function () { var s = S.games && S.games.set; return s ? { mine: s.mine, other: s.other } : null; },
      submit: function (r) { return rpc('submitSet', [r.acc, r.score, r.mixes, r.grade]).then(function (g) { S.games = g; renderPlay(); if (g.last && g.last.firstXp) refreshQuiet(); return g.last; }); },
      onClose: function () { renderPlay(); }
    });
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-mix]');
    if (t && S && t.dataset.mix === 'set') openSet();
  });

  // ---------- SOUNDCLOUD and YOUTUBE (official players, faded out with your timer) ----------
  var web = null;   // { kind, url, title, endAt, frame, widget/player, timer, fading }
  function parseLink(u) {
    u = String(u || '').trim();
    if (/^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\//i.test(u) || /^https?:\/\/snd\.sc\//i.test(u)) return { kind: 'sc', url: u.split('?')[0] };
    var m = u.match(/[?&]list=([\w-]+)/), v = u.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/);
    if (/youtu\.?be|youtube\.com/i.test(u) && (m || v)) return { kind: 'yt', list: m ? m[1] : '', video: v ? v[1] : '', url: u };
    return null;
  }
  function savedLinks() { return load('links') || []; }
  function rememberLink(l, title) {
    var list = savedLinks().filter(function (x) { return x.url !== l.url; });
    list.unshift({ url: l.url, title: title || l.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), kind: l.kind });
    save('links', list.slice(0, 8));
  }
  function loadScriptOnce(src, ready) {
    return new Promise(function (res, rej) {
      if (ready()) return res();
      var s = document.createElement('script'); s.src = src; s.onload = function () { var n = 0, w = setInterval(function () { if (ready() || ++n > 100) { clearInterval(w); ready() ? res() : rej(new Error('Player didn\'t load')); } }, 100); }; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function webBox() {
    var box = el('webplayer');
    if (!box) { document.body.insertAdjacentHTML('beforeend', '<div id="webplayer" class="webplayer" hidden><div class="between"><b class="small" id="wpTitle">Your music</b><span class="row" style="gap:6px"><span class="tiny" id="wpLeft"></span><button class="iconbtn" type="button" data-fun="webStop" aria-label="Stop">' + icon('x', 's') + '</button></span></div><div id="wpFrame"></div></div>'); box = el('webplayer'); }
    return box;
  }
  function webVolume(v) { try { if (!web) return; if (web.kind === 'sc') web.widget.setVolume(Math.round(v * 100)); else web.player.setVolume(Math.round(v * 100)); } catch (e) {} }
  function stopWeb() {
    if (!web) return;
    clearInterval(web.timer);
    try { if (web.kind === 'sc') web.widget.pause(); else web.player.stopVideo(); } catch (e) {}
    el('wpFrame').innerHTML = ''; webBox().hidden = true; web = null; renderChores();
  }
  function playWeb(link) {
    var l = parseLink(link);
    if (!l) return toast('That link isn\'t SoundCloud or YouTube. Copy the share link from the app.', true);
    stopWeb(); stopOwn(); if (M() && M().now()) M().stop(true);
    var box = webBox(), fixedEnd = Date.now() + musicMins * 60000;
    box.hidden = false; el('wpTitle').textContent = l.kind === 'sc' ? 'SoundCloud' : 'YouTube';
    web = { kind: l.kind, url: l.url, endAt: function () { var cur = mySession(); return cur ? cur.endsAt - offset : fixedEnd; }, fading: false };
    var started = function (title) {
      if (title) el('wpTitle').textContent = title;
      rememberLink(l, title);
      web.timer = setInterval(function () {
        if (!web) return;
        var left = web.endAt() - Date.now(), lt = el('wpLeft');
        if (lt) lt.textContent = left > 0 ? clock(left) + ' left' : '';
        if (left <= 10000 && !web.fading) {              // ten-second fade, then stop: no sudden cut
          web.fading = true; var v = 1;
          var f = setInterval(function () { v -= 0.05; webVolume(Math.max(0, v)); if (v <= 0 || !web) { clearInterval(f); if (web) { stopWeb(); chime([523, 659]); toast('Time\'s up. Music faded out.'); } } }, 500);
        }
      }, 1000);
      closeSheet(); renderChores();
    };
    if (l.kind === 'sc') {
      el('wpFrame').innerHTML = '<iframe id="scFrame" allow="autoplay" width="100%" height="120" frameborder="no" src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(l.url) + '&auto_play=true&visual=false&show_comments=false&hide_related=true&show_teaser=false"></iframe>';
      loadScriptOnce('https://w.soundcloud.com/player/api.js', function () { return window.SC && SC.Widget; }).then(function () {
        if (!web) return;
        web.widget = SC.Widget(el('scFrame'));
        web.widget.bind(SC.Widget.Events.READY, function () { web.widget.setVolume(100); web.widget.play(); web.widget.getCurrentSound(function (s) { started(s && s.title); }); });
        web.widget.bind(SC.Widget.Events.PLAY, function () { if (web) web.widget.getCurrentSound(function (s) { if (s && s.title && el('wpTitle')) el('wpTitle').textContent = s.title; }); });
      }, function () { toast('Couldn\'t load SoundCloud.', true); stopWeb(); });
    } else {
      el('wpFrame').innerHTML = '<div id="ytFrame"></div>';
      loadScriptOnce('https://www.youtube.com/iframe_api', function () { return window.YT && YT.Player; }).then(function () {
        if (!web) return;
        var vars = { autoplay: 1, playsinline: 1, rel: 0 };
        if (l.list) { vars.listType = 'playlist'; vars.list = l.list; }
        web.player = new YT.Player('ytFrame', { width: '100%', height: '160', videoId: l.video || undefined, playerVars: vars,
          events: {
            onReady: function (e) { e.target.setVolume(100); e.target.playVideo(); var d = e.target.getVideoData && e.target.getVideoData(); started(d && d.title); },
            onError: function () { toast('YouTube won\'t play that one here. Try another link or a playlist.', true); }
          } });
      }, function () { toast('Couldn\'t load YouTube.', true); stopWeb(); });
    }
  }
  function onlineSection() {
    var list = savedLinks();
    return '<div class="divider"></div><b>SoundCloud or YouTube Music</b><p class="small muted" style="margin:4px 0 8px">Paste a track or playlist link (Share, then Copy link). It plays here and fades out over the last ten seconds of your timer. Keep the app open.</p>' +
      (list.length ? '<div class="chips" style="margin-bottom:8px">' + list.map(function (x) { return '<button class="chip" type="button" data-weblink="' + esc(x.url) + '">' + icon(x.kind === 'sc' ? 'wave' : 'play', 's') + esc(x.title.slice(0, 28)) + '</button>'; }).join('') + '</div>' : '') +
      '<form class="inline" id="webForm" autocomplete="off"><input type="url" id="webText" placeholder="https://soundcloud.com/… or music.youtube.com/…" aria-label="SoundCloud or YouTube link"><button class="btn primary" type="submit">Play</button></form>';
  }
  document.addEventListener('submit', function (ev) { if (ev.target.id !== 'webForm') return; ev.preventDefault(); var v = el('webText').value.trim(); if (!v) return toast('Paste a SoundCloud or YouTube link first'); playWeb(v); });
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-weblink], [data-fun="webStop"]');
    if (!t) return;
    if (t.dataset.fun === 'webStop') return stopWeb();
    playWeb(t.dataset.weblink);
  });

  // ---------- rendering + tabs ----------
  function renderAll() {
    if (!S) return;
    var keep = {}, focused = document.activeElement && document.activeElement.id;
    document.querySelectorAll('main input[id], main textarea[id]').forEach(function (i) { if (i.type !== 'password') keep[i.id] = i.value; });
    renderHome(); renderChores(); renderWork(); renderPlay(); renderYou(); renderHealth(); renderCustom(); renderEmpire(); applyPrefs();
    if (ME) { renderTrain(); renderFood(); }
    Object.keys(keep).forEach(function (id) { var i = el(id); if (i && keep[id]) i.value = keep[id]; });
    if (focused && el(focused)) el(focused).focus();
    keepAwake(!!mySession());
    tickTimer();
    applyTheme();
  }
  // one big thumb-reach button per screen, bottom right on phones, for the thing you came to do
  var FAB = {
    home: ['sparkles', 'What now?', function () { wn.skip = []; wn.pick = undefined; whatNowSheet(); return true; }],
    chores: ['play', 'Start a job', function () { var vis = function (q) { return [].slice.call(document.querySelectorAll(q)).filter(function (x) { return x.offsetParent && !x.disabled; })[0]; }; var b = vis('#tab-chores .btn.primary.big') || vis('#tab-chores [data-qstart]') || vis('#tab-chores .btn.primary'); if (b) b.click(); return !!b; }],
    food: ['food', 'Log food', function () { var q = el('quickText'); if (q && !q.disabled) { q.scrollIntoView({ block: 'center' }); q.focus(); return true; } var ph = el('foodPhoto'); if (ph) { ph.click(); return true; } return false; }],
    train: ['check', 'Next set', function () { var b = [].slice.call(document.querySelectorAll('#tab-train button.check:not(.on), #tab-train [data-set]:not(.done)')).filter(function (x) { return x.offsetParent; })[0]; if (b) { b.scrollIntoView({ block: 'center' }); b.focus(); } return !!b; }],
    work: ['plus', 'Add a block', function () { var w = el('wkText'); if (w) { w.scrollIntoView({ block: 'center' }); w.focus(); } return !!w; }]
  };
  // slides away while you scroll down, back when you scroll up or reach the end
  var lastY = 0;
  window.addEventListener('scroll', function () {
    var f = el('fab'); if (!f) return;
    var y = window.scrollY, end = y + innerHeight >= document.documentElement.scrollHeight - 4;
    if (y > lastY + 4 && y > 60 && !end) f.classList.add('away'); else if (y < lastY - 4 || end || y <= 60) f.classList.remove('away');
    lastY = y;
  }, { passive: true });
  function navHeight() { var n = el('nav'); if (n) document.documentElement.style.setProperty('--navh', n.getBoundingClientRect().height + 'px'); }
  window.addEventListener('resize', navHeight);
  function updateFab() {
    var f = el('fab'), cfg = FAB[current];
    if (!f) { f = document.createElement('button'); f.id = 'fab'; f.type = 'button'; f.className = 'fab'; document.body.appendChild(f); f.addEventListener('click', function () { var c = FAB[current]; buzz(10); if (c && !c[2]()) toast('Nothing to do here right now'); }); }
    if (!cfg || !S || (current === 'food' && !ME)) { f.hidden = true; return; }
    f.hidden = false; f.classList.remove('away'); f.innerHTML = icon(cfg[0], 's') + '<span>' + cfg[1] + '</span>'; f.setAttribute('aria-label', cfg[1]); navHeight();
  }
  function showTab(name) {
    if (!ME && (name === 'train' || name === 'food')) name = 'home';
    if (name !== 'home' && homeEditing) { homeEditing = false; document.body.classList.remove('homeedit'); renderHome(); }
    current = name;
    document.querySelectorAll('section.tab').forEach(function (s) { s.hidden = s.id !== 'tab-' + name; });
    el('nav').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false'); });
    var mb = el('navMore'); if (mb) mb.setAttribute('aria-current', S && (PRIMARY[S.who] || PRIMARY.partner).indexOf(name) === -1 ? 'page' : 'false');
    if (['you', 'custom', 'empire'].indexOf(name) === -1) save('tab', name);
    window.scrollTo(0, 0);
    if (name === 'play') { loadWords(); pollGames(); }
    updateFab();
  }

  // ---------- WORK (time blocking) ----------
  var wkDay = 'today', wkOther = null, wkDrag = null;
  var KIND_NAME = { focus: 'Deep work', admin: 'Admin', meet: 'Meeting', learn: 'Learning', break: 'Break' };
  function W() { return wkDay === 'today' || !wkOther ? S.work : wkOther; }
  function hm(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + min % 60).slice(-2); }
  function dur(mins) { return mins >= 60 ? Math.floor(mins / 60) + 'h' + (mins % 60 ? ' ' + mins % 60 + 'm' : '') : mins + ' min'; }
  function nowMin() { var d = new Date(now()); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function wide() { return window.matchMedia && matchMedia('(min-width: 960px)').matches; }
  function ppm() { return wide() ? 1.5 : 1.15; }
  function curBlock(w) {
    if (!w || !w.today) return null;
    var n = nowMin(), live = w.blocks.filter(function (b) { return b.status !== 'done' && b.status !== 'skipped'; });
    return live.filter(function (b) { return b.status === 'active'; })[0] || live.filter(function (b) { return b.start <= n && b.start + b.mins > n; })[0] || null;
  }
  function nextBlock(w) {
    if (!w || !w.today) return null;
    var n = nowMin();
    return w.blocks.filter(function (b) { return b.status === 'planned' && b.start > n; })[0] || null;
  }
  function wkApply(res, msg) {
    if (res.work && !res.work.today) wkOther = res.work;
    apply(res.state, msg);
  }
  function wkCall(fn, args, ok) {
    var p = send(fn, args); if (!p) return;
    p.then(function (res) { wkApply(res); if (ok) ok(res); }, function (err) { toast(err.message || String(err), true); renderWork(); });
  }
  // Instant: change the plan on screen now, save in the background, put it back if the save fails.
  function wkQuick(change, fn, args, msg, ok) {
    var w = W(), before = JSON.stringify(w), mine = w === S.work;
    change(w); closeSheet(); renderWork(); if (msg) toast(msg);
    var p = send(fn, args); if (!p) return;
    p.then(function (res) { if (!busy) wkApply(res); else if (res.work && !res.work.today) wkOther = res.work; if (ok) ok(res); },
      function (err) { var back = JSON.parse(before); if (mine) S.work = back; else wkOther = back; renderWork(); toast((err.message || String(err)) + ' Put it back as it was.', true); });
  }
  function blockOf(w, id) { return w.blocks.filter(function (x) { return x.id === id; })[0] || {}; }
  function wkDate() { return wkDay === 'today' ? '' : ymdLocal(new Date(now() + 864e5)); }
  function ymdLocal(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function wkNowCard() {
    var w = S.work, c = curBlock(w), nx = nextBlock(w), n = nowMin(), h = '<section class="card wk-now" id="wkNow">';
    if (c) {
      var left = Math.max(0, c.start + c.mins - n), frac = Math.min(1, Math.max(0, (n - c.start) / c.mins)), ontime = c.status === 'planned' && Math.abs(n - c.start) <= 5;
      h += '<div class="eyebrow k-' + c.kind + '-t">' + (c.status === 'active' ? 'In progress' : 'Now') + ' · ' + KIND_NAME[c.kind] + '</div>' +
        '<div class="wk-nowt">' + esc(c.task) + '</div>' +
        '<div class="small muted">' + hm(c.start) + '–' + hm(c.start + c.mins) + ' · ' + (left > 0 ? Math.ceil(left) + ' min left' : 'over time') + '</div>' +
        '<div class="bar" style="margin:10px 0"><i style="width:' + Math.round(frac * 100) + '%"></i></div>' + (c.target ? wkCounter(c) : '') + '<div class="wk-btns">' +
        (c.status === 'planned' ? '<button class="btn primary" type="button" data-wk="start" data-id="' + c.id + '">' + icon('play', 's') + 'Start' + (ontime ? ' (+3 on time)' : '') + '</button>' : '') +
        '<button class="btn ' + (c.status === 'active' ? 'primary' : 'soft') + '" type="button" data-wk="done" data-id="' + c.id + '">' + icon('check', 's') + 'Done</button>' +
        '<button class="btn soft" type="button" data-wk="late" data-v="15">+15 min</button>' +
        '<button class="btn soft" type="button" data-wk="music" data-id="' + c.id + '">' + icon('music', 's') + 'Music</button></div>';
    } else if (nx) {
      var inMin = Math.round(nx.start - n);
      h += '<div class="eyebrow">Up next · ' + hm(nx.start) + '</div><div class="wk-nowt">' + esc(nx.task) + '</div>' +
        '<div class="small muted">' + dur(nx.mins) + ' · ' + KIND_NAME[nx.kind] + ' · starts in ' + (inMin >= 60 ? dur(inMin) : inMin + ' min') + '</div>' +
        '<div class="wk-btns" style="margin-top:10px"><button class="btn soft" type="button" data-wk="start" data-id="' + nx.id + '">' + icon('play', 's') + 'Start it now</button></div>';
    } else if (w && w.blocks.length) {
      h += '<div class="eyebrow">Work</div><div class="wk-nowt">' + (w.done === w.total && w.total ? 'All done. Go home.' : 'Nothing planned right now') + '</div><div class="small muted">' + w.done + ' of ' + w.total + ' blocks done today.</div>';
    } else {
      h += '<div class="eyebrow">Work</div><div class="wk-nowt">Plan your day in blocks</div><div class="small muted">Give every hour a job. Start each block on time for bonus XP, clear them all for a clean sheet.</div>';
    }
    return h + '</section>';
  }
  function wkCounter(b) {
    var pct = Math.min(100, Math.round(b.count / b.target * 100));
    return '<div class="wk-count"><div class="wk-count-n"><b class="num">' + b.count + '</b><span>/ ' + b.target + ' ' + esc(b.unit) + '</span></div>' +
      '<div class="bar wk-count-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="wk-count-btns">' + [[-1, '−1'], [1, '+1'], [5, '+5'], [10, '+10']].map(function (x) { return '<button class="btn ' + (x[0] > 0 ? 'soft' : 'line') + ' sm" type="button" data-wkc="' + x[0] + '" data-id="' + b.id + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
  }
  function wkTimeline(w) {
    var P = ppm(), hrs = w.hours, from = hrs.start, to = hrs.end;
    w.blocks.forEach(function (b) { from = Math.min(from, b.start); to = Math.max(to, b.start + b.mins); });
    var dl = w.today ? (S.deadlines || []).filter(function (d) { return d.dueText.slice(0, 10) === ymdLocal(new Date(now())); }) : [];
    dl.forEach(function (d) { var m = parseInt(d.dueText.slice(11, 13), 10) * 60 + parseInt(d.dueText.slice(14, 16), 10); from = Math.min(from, m); to = Math.max(to, m + 15); });
    from = Math.floor(from / 60) * 60; to = Math.min(1440, Math.ceil(to / 60) * 60);
    var h = '<div class="wk-tl" id="wkTl" data-from="' + from + '" style="height:' + Math.round((to - from) * P) + 'px">';
    for (var m = from; m < to; m += 60) h += '<div class="wk-hr' + (m < hrs.start || m >= hrs.end ? ' off' : '') + '" style="top:' + Math.round((m - from) * P) + 'px;height:' + Math.round(60 * P) + 'px"><span>' + hm(m) + '</span></div>';
    // lanes for blocks that overlap
    var vis = w.blocks.filter(function (b) { return b.status !== 'skipped' || true; }), lanes = [], cluster = [], clusterEnd = -1;
    function flush() { var n = cluster.reduce(function (x, c) { return Math.max(x, c.lane + 1); }, 1); cluster.forEach(function (c) { c.n = n; }); cluster = []; }
    var placed = vis.map(function (b) {
      if (b.start >= clusterEnd) { flush(); lanes = []; }
      var lane = 0; while (lanes[lane] > b.start) lane++;
      lanes[lane] = b.start + b.mins; clusterEnd = Math.max(clusterEnd, b.start + b.mins);
      var o = { b: b, lane: lane }; cluster.push(o); return o;
    });
    flush();
    var cur = curBlock(w), n = nowMin();
    placed.forEach(function (o) {
      var b = o.b, top = Math.round((b.start - from) * P), ht = Math.max(24, Math.round(b.mins * P) - 3);
      var late = w.today && b.status === 'planned' && n > b.start + b.mins;
      var cls = 'wk-b k-' + b.kind + ' s-' + b.status + (cur && cur.id === b.id ? ' cur' : '') + (late ? ' late' : '') + (ht < 44 ? ' short' : '');
      h += '<div class="' + cls + '" data-blk="' + b.id + '" style="top:' + top + 'px;height:' + ht + 'px;left:calc(52px + (100% - 56px) * ' + (o.lane / o.n).toFixed(4) + ');width:calc((100% - 56px) / ' + o.n + ' - 4px)">' +
        '<div class="wk-bt">' + (b.status === 'done' ? icon('check', 's') : '') + esc(b.task) + '</div>' +
        '<div class="wk-bm">' + hm(b.start) + '–' + hm(b.start + b.mins) + ' · ' + dur(b.mins) + (b.target ? ' · ' + b.count + '/' + b.target : '') + (b.status === 'done' ? ' · +' + b.xp + ' XP' : b.status === 'skipped' ? ' · skipped' : '') + '</div>' +
        (b.target ? '<i class="wk-bp" style="width:' + Math.min(100, Math.round(b.count / b.target * 100)) + '%"></i>' : '') +
        (b.status !== 'done' && b.status !== 'skipped' && w.today && b.start <= n + 15 ? '<button class="wk-tick" type="button" data-wk="done" data-id="' + b.id + '" aria-label="Done">' + icon('check', 's') + '</button>' : '') +
        (b.status !== 'done' ? '<div class="wk-rs" data-rs="' + b.id + '" aria-hidden="true"></div>' : '') + '</div>';
    });
    dl.forEach(function (d) { var m = parseInt(d.dueText.slice(11, 13), 10) * 60 + parseInt(d.dueText.slice(14, 16), 10); h += '<div class="wk-dl" style="top:' + Math.round((m - from) * P) + 'px"><span>Due ' + hm(m) + ' · ' + esc(d.task) + '</span></div>'; });
    if (w.today && n >= from && n <= to) h += '<div class="wk-nowl" id="wkNowl" style="top:' + Math.round((n - from) * P) + 'px"><span>' + hm(n) + '</span></div>';
    return h + '</div>';
  }
  function renderWork() {
    var sec = el('tab-work'); if (!sec || !S || !S.work) return;
    var w = W(), n = names(), sw = S.work, h = '';
    h += '<div class="top"><div><h1>Work</h1><div class="sub">' + (sw.total ? sw.done + ' of ' + sw.total + ' blocks done · ' + dur(sw.doneMins) + ' of ' + dur(sw.planned) : 'Time-block your day, get paid for sticking to it') + '</div></div>' + meButton() + '</div>';
    h += '<div class="between dayoff' + (sw.off ? ' on' : '') + '"><span class="small">' + (sw.off ? '<b>Day off today.</b> Work cards are hidden on Home.' : 'A work day.') + '</span><button class="btn ' + (sw.off ? 'soft' : 'line') + ' sm" type="button" data-dayoff="' + (sw.off ? '0' : '1') + '">' + (sw.off ? 'It\'s a work day' : 'Mark today off') + '</button></div>';
    h += '<div class="wk-grid"><div class="wk-a">' + wkNowCard();
    h += '<section class="card"><form class="inline" id="wkForm" autocomplete="off"><input type="text" id="wkText" placeholder="Write the report 10-11:30, Emails 30m…" aria-label="Add a block"><button class="btn primary" type="submit">Add</button></form>' +
      '<p class="tiny muted" style="margin:8px 0 0">Give it a time ("10-11:30", "at 3pm") and a length ("45m", "2h"), or a number to hit ("Queue 40 emails", "Edit 3 videos"). No time and it goes in the next free slot.</p></section>' + wkKitCard() + '</div>';
    h += '<section class="card spot wk-tlcard"><div class="between" style="margin-bottom:10px"><div class="seg" style="margin:0;flex:1">' + [['today', 'Today'], ['tomorrow', 'Tomorrow']].map(function (o) { return '<button type="button" data-wkday="' + o[0] + '" aria-pressed="' + (wkDay === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    if (wkDay !== 'today' && !wkOther) h += '<p class="empty">Loading…</p>';
    else h += (w.blocks.length ? '' : '<p class="small muted center" style="margin:0 0 8px">Nothing planned yet. Type above, tap an empty time, or ' + (wkDay === 'today' ? 'copy your last plan.' : 'plan tomorrow tonight.') + '</p>') + wkTimeline(w);
    h += '<p class="tiny muted" style="margin:8px 0 0">' + (wide() ? 'Drag a block to move it, drag its bottom edge to change its length, click it for more. Click an empty time to add one there.' : 'Tap a block to change it. Tap an empty time to add one there.') + '</p></section>';
    // stats and rewards
    h += '<div class="wk-c"><section class="card"><div class="head"><h3>Today\'s pay</h3><span class="small muted">' + (sw.streak ? sw.streak + ' day work streak' : 'No work streak yet') + '</span></div>' +
      '<div class="wk-stats"><div><b class="num">' + sw.done + '/' + sw.total + '</b><span>blocks</span></div><div><b class="num">' + dur(sw.doneMins) + '</b><span>done</span></div><div><b class="num">+' + sw.xp + '</b><span>XP from work</span></div></div>' +
      '<div class="bar" style="margin:10px 0 6px"><i style="width:' + (sw.total ? Math.round(sw.done / sw.total * 100) : 0) + '%"></i></div>' +
      '<p class="small" style="margin:0">' + (sw.clean ? '<b class="good">Clean sheet.</b> Every block done, +' + sw.cleanXp + ' XP banked.' : sw.total >= 3 ? 'Clean sheet: ' + (sw.total - sw.done) + ' more block' + (sw.total - sw.done === 1 ? '' : 's') + ' for <b>+' + sw.cleanXp + ' XP</b>.' : 'Plan at least 3 work blocks to play for a clean sheet (+' + sw.cleanXp + ' XP).') + '</p>' +
      wkWeekLine(sw.week) +
      '<details class="wk-how"><summary class="small">How blocks pay</summary><ul class="small muted"><li>About 2 XP per 10 minutes (4 to 24). Deep work pays 1.5x, meetings half, a proper break 2.</li><li>+3 for starting within five minutes of its time.</li><li>+1 for each block already done today, up to +5.</li><li>Every work block done (3 or more): +' + sw.cleanXp + ' XP and your work streak goes up.</li><li>Every XP is cash for your empire too.</li></ul></details></section>';
    var unblocked = (S.deadlines || []).filter(function (d) { return !sw.blocks.some(function (b) { return b.task.toLowerCase() === d.task.toLowerCase(); }); });
    if (unblocked.length) h += '<section class="card"><div class="head"><h3>Deadlines without a block</h3></div>' + unblocked.slice(0, 5).map(function (d) {
      return '<div class="item"><div class="grow"><div class="t" style="font-weight:550">' + esc(d.task) + '</div><div class="tiny muted">due ' + esc(d.dueText.slice(-5)) + '</div></div><button class="btn soft sm" type="button" data-wkdl="' + esc(d.task) + '">Block 30m</button></div>';
    }).join('') + '</section>';
    h += '<section class="card"><div class="head"><h3>Plan faster</h3></div>' +
      '<textarea id="wkPlan" rows="4" placeholder="One per line:&#10;Write the report 2h&#10;Emails 30m&#10;Call Sam at 3pm 30m"></textarea>' +
      '<button class="btn primary wide" type="button" data-wk="plan" style="margin-top:8px">Fill my ' + (wkDay === 'today' ? 'day' : 'tomorrow') + '</button>' +
      (wkDay === 'today' && S.hasClaudeKey ? '<button class="btn soft wide" type="button" id="openAsk" style="margin-top:8px">' + icon('sparkles', 's') + 'Change it by asking ("move lunch to 1:30", "clear my afternoon")</button>' : '') +
      '<div class="grid2" style="margin-top:8px"><button class="btn soft" type="button" data-wk="copy">Copy last plan</button><button class="btn soft" type="button" data-wk="late" data-v="15">Running late +15</button></div>' +
      '<div class="divider"></div><div class="between wk-hours"><span class="small">Work day</span><span class="row" style="gap:6px;flex-wrap:wrap"><input type="time" id="wkHs" value="' + hm(sw.hours.start) + '" aria-label="Start"><span class="muted">to</span><input type="time" id="wkHe" value="' + hm(sw.hours.end) + '" aria-label="End"><button class="btn soft sm" type="button" data-wk="hours">Save</button></span></div></section></div>';
    sec.innerHTML = h + '</div>';
  }
  var wkKitEdit = false;
  function wkWeekLine(wk) {
    if (!wk) return '';
    var bits = Object.keys(wk.units).sort(function (a, b) { return wk.units[b] - wk.units[a]; }).map(function (u) { return '<b>' + fmt(wk.units[u]) + '</b> ' + esc(u); });
    var mins = Object.keys(wk.kinds).reduce(function (a, k) { return a + (k === 'break' ? 0 : wk.kinds[k]); }, 0);
    if (mins) bits.push('<b>' + dur(mins) + '</b> of work blocks');
    return bits.length ? '<p class="small" style="margin:8px 0 0">This week: ' + bits.join(' · ') + '</p>' : '';
  }
  function wkKitCard() {
    var kit = S.work.kit || [];
    var h = '<section class="card"><div class="head"><h3>Your job kit</h3><button class="btn line sm" type="button" data-wk="kitedit">' + (wkKitEdit ? 'Done' : 'Edit') + '</button></div>';
    h += '<p class="tiny muted" style="margin:-4px 0 8px">' + (wkKitEdit ? 'Remove what you don\'t do, add what you do. Counts and times work: "Queue 40 emails", "Edit 2h".' : 'The things your job is made of. Tap one to drop it into your next free slot.') + '</p>';
    h += '<div class="chips">' + kit.map(function (x, i) { return wkKitEdit ? '<button class="chip" type="button" data-wkkitdel="' + i + '">' + esc(x) + ' ' + icon('x', 's') + '</button>' : '<button class="chip lilac" type="button" data-wkkit="' + esc(x) + '">' + icon('plus', 's') + esc(x) + '</button>'; }).join('') + '</div>';
    if (wkKitEdit) h += '<form class="inline" id="wkKitForm" autocomplete="off" style="margin-top:10px"><input type="text" id="wkKitText" placeholder="Edit 3 videos, Queue 40 emails…" aria-label="Add to your kit" maxlength="60"><button class="btn primary" type="submit">Add</button></form>';
    return h + '</section>';
  }
  function blockSheet(id) {
    var w = W(), b = w.blocks.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    sheetKind = 'block';
    var done = b.status === 'done';
    var h = '<h3 style="margin:0 0 4px">' + esc(b.task) + '</h3><p class="small muted" style="margin:0 0 12px">' + hm(b.start) + '–' + hm(b.start + b.mins) + ' · ' + KIND_NAME[b.kind] + (done ? ' · done, +' + b.xp + ' XP' : b.status === 'active' ? ' · in progress' : b.status === 'skipped' ? ' · skipped' : '') + '</p>';
    if (!done) {
      h += '<input type="text" id="bkTask" value="' + esc(b.task) + '" aria-label="Name">' +
        '<div class="between" style="margin:10px 0"><span class="small">Starts</span><input type="time" id="bkStart" value="' + hm(b.start) + '" step="300"></div>' +
        '<div class="eyebrow" style="margin:6px 0">Length</div><div class="chips">' + [15, 30, 45, 60, 90, 120, 180].map(function (m) { return '<button class="chip' + (b.mins === m ? ' lilac' : '') + '" type="button" data-bkmins="' + m + '" aria-pressed="' + (b.mins === m) + '">' + dur(m) + '</button>'; }).join('') + '</div>' +
        '<div class="eyebrow" style="margin:10px 0 6px">Kind</div><div class="chips">' + Object.keys(KIND_NAME).map(function (k) { return '<button class="chip k-' + k + '-c" type="button" data-bkkind="' + k + '" aria-pressed="' + (b.kind === k) + '">' + KIND_NAME[k] + '</button>'; }).join('') + '</div>' +
        '<button class="btn primary wide" type="button" data-bk="save" data-id="' + b.id + '" style="margin-top:14px">Save changes</button>';
      h += '<div class="grid2" style="margin-top:8px">' + (w.today && b.status !== 'active' ? '<button class="btn soft" type="button" data-wk="start" data-id="' + b.id + '">' + icon('play', 's') + 'Start</button>' : '') +
        (w.today ? '<button class="btn soft" type="button" data-wk="done" data-id="' + b.id + '">' + icon('check', 's') + 'Done</button>' : '') +
        (b.status === 'skipped' ? '<button class="btn soft" type="button" data-wk="reopen" data-id="' + b.id + '">Bring it back</button>' : '<button class="btn soft" type="button" data-wk="skip" data-id="' + b.id + '">Skip it</button>') +
        '<button class="btn line" type="button" data-wk="delete" data-id="' + b.id + '">' + icon('trash', 's') + 'Delete</button></div>';
      h += '<p class="tiny muted" style="margin:10px 0 0">Skipping costs nothing, but it breaks today\'s clean sheet.</p>';
    }
    openSheet(h);
    bkEdit = { id: b.id, mins: b.mins, kind: b.kind };
  }
  var bkEdit = null;
  function addAtSheet(min) {
    sheetKind = 'addblock';
    openSheet('<h3 style="margin:0 0 4px">New block at ' + hm(min) + '</h3><p class="small muted" style="margin:0 0 12px">' + (wkDay === 'today' ? 'Today' : 'Tomorrow') + '. Add a length if it isn\'t an hour ("30m").</p>' +
      '<form class="inline" id="wkAtForm" data-min="' + min + '" autocomplete="off"><input type="text" id="wkAtText" placeholder="What are you doing?" aria-label="Block"><button class="btn primary" type="submit">Add</button></form>');
    setTimeout(function () { var i = el('wkAtText'); if (i) i.focus(); }, 50);
  }
  function wkDone(id) {
    var w = W(), b = w.blocks.filter(function (x) { return x.id === id; })[0];
    wkCall('blockAction', [id, 'done'], function (res) {
      closeSheet();
      if (!res.xp) return;
      chime([659, 784, 1047]);
      toast('+' + res.xp + ' XP' + (res.onTime ? ' · started on time' : '') + (res.combo ? ' · ' + (res.combo + 1) + ' in a row' : '') + (res.clean ? '. Clean sheet! +' + res.clean + ' XP' : ''));
      if (res.clean) confetti(true); else if (b && b.kind !== 'break') confetti(false);
    });
  }
  document.addEventListener('submit', function (ev) {
    if (ev.target.id === 'wkForm') {
      ev.preventDefault(); var v = el('wkText').value.trim(); if (!v) return toast('Type a block first, like "Emails 30m"');
      wkCall('addBlock', [v, wkDate()], function (res) { el('wkText') && (el('wkText').value = ''); var a = res.added; toast(a.task + ': ' + hm(a.start) + '–' + hm(a.start + a.mins) + (a.placed ? ' (next free slot)' : '')); });
    } else if (ev.target.id === 'wkKitForm') {
      ev.preventDefault(); var kv = el('wkKitText').value.trim(); if (!kv) return toast('Type something your job involves, like "Edit 2h"');
      call('setPrefs', [{ workKit: (S.work.kit || []).concat([kv]) }], function (res) { apply(res, 'Added to your kit'); });
    } else if (ev.target.id === 'wkAtForm') {
      ev.preventDefault(); var t = el('wkAtText').value.trim(); if (!t) return toast('Type what the block is for');
      wkCall('addBlock', [t, wkDate(), +ev.target.dataset.min], function () { closeSheet(); });
    }
  });
  document.addEventListener('click', function (ev) {
    if (!S) return;
    var t = ev.target.closest('[data-wk], [data-wkday], [data-wkex], [data-wkdl], [data-bk], [data-bkmins], [data-bkkind], [data-wkc], [data-wkkit], [data-wkkitdel]');
    if (!t) {
      var tl = ev.target.closest('#wkTl');
      if (tl && !ev.target.closest('.wk-b') && !wkDrag) {
        var r = tl.getBoundingClientRect(), min = +tl.dataset.from + (ev.clientY - r.top) / ppm();
        addAtSheet(Math.max(0, Math.min(1425, Math.floor(min / 15) * 15)));
      }
      return;
    }
    var d = t.dataset;
    if (d.wkday) { wkDay = d.wkday; if (wkDay !== 'today') { wkOther = null; rpc('workState', [wkDate()]).then(function (w) { wkOther = w; renderWork(); }, function (e) { toast(e.message, true); }); } return renderWork(); }
    if (d.wkex) { var i = el('wkText'); if (i) { i.value = d.wkex; i.focus(); } return; }
    if (d.wkc) {
      var cb = W().blocks.filter(function (x) { return x.id === d.id; })[0];
      if (cb) { cb.count = Math.max(0, cb.count + +d.wkc); if (cb.status === 'planned') cb.status = 'active'; renderWork(); }
      return wkCall('countBlock', [d.id, +d.wkc], function (res) { if (res.hit) { chime([659, 784, 1047]); confetti(!!res.clean); toast('Target hit. +' + res.xp + ' XP' + (res.clean ? '. Clean sheet! +' + res.clean : '')); } });
    }
    if (d.wkkit) return wkCall('addBlock', [d.wkkit, wkDate()], function (res) { var a = res.added; toast(a.task + ': ' + hm(a.start) + '–' + hm(a.start + a.mins)); });
    if (d.wkkitdel !== undefined) { var kit = S.work.kit.slice(); kit.splice(+d.wkkitdel, 1); return call('setPrefs', [{ workKit: kit }], function (res) { apply(res); }); }
    if (d.wkdl) return wkCall('addBlock', [d.wkdl + ' 30m', ''], function (res) { toast('Blocked ' + hm(res.added.start) + '–' + hm(res.added.start + 30) + ' for ' + res.added.task); });
    if (d.bkmins) { bkEdit.mins = +d.bkmins; document.querySelectorAll('[data-bkmins]').forEach(function (b) { b.setAttribute('aria-pressed', b === t); b.classList.toggle('lilac', b === t); }); return; }
    if (d.bkkind) { bkEdit.kind = d.bkkind; document.querySelectorAll('[data-bkkind]').forEach(function (b) { b.setAttribute('aria-pressed', b === t); }); return; }
    if (d.bk === 'save') {
      var st = el('bkStart').value.split(':'), ch = { task: el('bkTask').value, mins: bkEdit.mins, kind: bkEdit.kind };
      if (st.length === 2) ch.start = +st[0] * 60 + +st[1];
      return wkQuick(function (w) { var b = blockOf(w, d.id); if (ch.task) b.task = ch.task; b.mins = ch.mins; b.kind = ch.kind; if (ch.start !== undefined) b.start = ch.start; }, 'updateBlock', [d.id, ch], 'Saved');
    }
    var a = d.wk;
    if (a === 'done') return wkDone(d.id);
    if (a === 'start') { chime([523, 784]); return wkQuick(function (w) { var b = blockOf(w, d.id); b.status = 'active'; b.startedAt = now(); }, 'blockAction', [d.id, 'start'], 'Go. Phone face down.'); }
    if (a === 'skip') return wkQuick(function (w) { blockOf(w, d.id).status = 'skipped'; }, 'blockAction', [d.id, a], 'Skipped');
    if (a === 'reopen') return wkQuick(function (w) { blockOf(w, d.id).status = 'planned'; }, 'blockAction', [d.id, a], 'Back on the plan');
    if (a === 'delete') return wkQuick(function (w) { w.blocks = w.blocks.filter(function (x) { return x.id !== d.id; }); }, 'blockAction', [d.id, a], null, function (res) { offerUndo(res.state && res.state.undo, 'Deleted'); });
    if (a === 'kitedit') { wkKitEdit = !wkKitEdit; return renderWork(); }
    if (a === 'late') return wkCall('shiftBlocks', [+d.v], function (res) { toast(res.moved ? 'Pushed the rest of your day back ' + d.v + ' minutes' : 'Nothing left to move today'); });
    if (a === 'copy') return wkCall('copyPlan', [wkDate()], function (res) { toast(res.added ? 'Copied ' + res.added + ' block' + (res.added === 1 ? '' : 's') : 'Already there'); });
    if (a === 'plan') { var v = (el('wkPlan') || {}).value || ''; if (!v.trim()) return toast('Add one task per line first'); return wkCall('planDay', [v, wkDate()], function (res) { el('wkPlan').value = ''; toast('Planned ' + res.added + ' block' + (res.added === 1 ? '' : 's')); }); }
    if (a === 'hours') { var hs = el('wkHs').value.split(':'), he = el('wkHe').value.split(':'); return call('setPrefs', [{ workStart: +hs[0] * 60 + +hs[1], workEnd: +he[0] * 60 + +he[1] }], function (res) { apply(res, 'Work day saved'); }); }
    if (a === 'music') {
      var c = curBlock(S.work); musicMins = c ? Math.max(5, Math.ceil(c.start + c.mins - nowMin())) : 30;
      return musicSheet();
    }
  });
  // drag to move (and resize by the bottom edge) with a mouse or pen; taps open the block
  document.addEventListener('pointerdown', function (ev) {
    var blk = ev.target.closest && ev.target.closest('.wk-b');
    if (!blk || ev.target.closest('button') || ev.button) return;
    var w = W(), b = w.blocks.filter(function (x) { return x.id === blk.dataset.blk; })[0]; if (!b) return;
    wkDrag = { el: blk, b: b, y0: ev.clientY, top0: blk.offsetTop, h0: blk.offsetHeight, resize: !!ev.target.closest('.wk-rs'), moved: false, mouse: ev.pointerType !== 'touch' && b.status !== 'done', v: null };
  });
  document.addEventListener('pointermove', function (ev) {
    var g = wkDrag; if (!g || !g.mouse) return;
    var dy = ev.clientY - g.y0; if (!g.moved && Math.abs(dy) < 5) return;
    g.moved = true; ev.preventDefault();
    var steps = Math.round(dy / ppm() / 5) * 5;
    if (g.resize) { g.v = Math.max(5, g.b.mins + steps); g.el.style.height = Math.max(24, Math.round(g.v * ppm()) - 3) + 'px'; g.el.querySelector('.wk-bm').textContent = hm(g.b.start) + '–' + hm(g.b.start + g.v) + ' · ' + dur(g.v); }
    else { g.v = Math.max(0, Math.min(1435, g.b.start + steps)); g.el.style.top = (g.top0 + (g.v - g.b.start) * ppm()) + 'px'; g.el.querySelector('.wk-bm').textContent = hm(g.v) + '–' + hm(g.v + g.b.mins) + ' · ' + dur(g.b.mins); }
    g.el.classList.add('drag');
  });
  document.addEventListener('pointercancel', function () { if (wkDrag) { if (wkDrag.moved) renderWork(); wkDrag = null; } });   // the phone took over (a scroll): not a tap, not a drag
  document.addEventListener('pointerup', function (ev) {
    var g = wkDrag; if (!g) return;
    setTimeout(function () { wkDrag = null; }, 0);
    if (!g.moved) { if (ev.target.closest && ev.target.closest('.wk-b') === g.el) blockSheet(g.b.id); return; }
    if (g.v === null || g.v === (g.resize ? g.b.mins : g.b.start)) return renderWork();
    var ch = g.resize ? { mins: g.v } : { start: g.v };
    g.b[g.resize ? 'mins' : 'start'] = g.v;
    renderWork();
    wkCall('updateBlock', [g.b.id, ch]);
  });
  setInterval(function () { if (S && S.work && current === 'work' && !wkDrag) { var nw = el('wkNow'); if (nw) nw.outerHTML = wkNowCard(); var w = W(), nl = el('wkNowl'), tl = el('wkTl'); if (nl && tl) { var m = nowMin(); nl.style.top = Math.round((m - +tl.dataset.from) * ppm()) + 'px'; nl.querySelector('span').textContent = hm(m); } } }, 20000);
  function workMini() {
    var w = S.work; if (!w || w.off) return '';          // days off: no work cards at all
    var c = curBlock(w), nx = nextBlock(w), d = new Date(now()), wd = d.getDay() > 0 && d.getDay() < 6, n = nowMin();
    if (!c && !nx && !w.blocks.length && !(wd && n < w.hours.end)) return '';
    var h = '<section class="card wk-mini"><div class="between"><div class="grow"><div class="eyebrow">Work' + (w.total ? ' · ' + w.done + ' of ' + w.total + ' blocks' : '') + '</div>';
    if (c) h += '<b>' + esc(c.task) + '</b><div class="small muted">' + Math.max(0, Math.ceil(c.start + c.mins - n)) + ' min left</div></div><button class="btn primary sm" type="button" data-wk="' + (c.status === 'active' ? 'done' : 'start') + '" data-id="' + c.id + '">' + (c.status === 'active' ? 'Done' : 'Start') + '</button>';
    else if (nx) h += '<b>Next: ' + esc(nx.task) + '</b><div class="small muted">' + hm(nx.start) + ' · ' + dur(nx.mins) + '</div></div><button class="btn soft sm" type="button" data-goto="work">Open</button>';
    else if (w.blocks.length) h += '<b>' + (w.clean ? 'Clean sheet today' : 'No more blocks today') + '</b></div><button class="btn soft sm" type="button" data-goto="work">Open</button>';
    else h += '<b>Plan your work day</b><div class="small muted">Blocks pay XP, a clean sheet pays +' + w.cleanXp + '</div></div><button class="btn primary sm" type="button" data-goto="work">Plan</button>';
    return h + '</div></section>';
  }

  // ---------- 3D characters: home card, You card and the dressing room ----------
  var stages3d = {}, dress = null;
  var STYLE_TAG = { sa: 'Street', vc: 'Neon', drag: 'Glam', basic: 'Basic', ach: 'Earned' };
  var SWATCH = ['#111111', '#f4f1ea', '#ffffff', '#e63946', '#ff5fae', '#ffb703', '#2e9e4f', '#2fe0d6', '#1f4fd1', '#7c5cff', '#8d5a3b', '#c9a227'];
  var SKINS = ['#f3cfb3', '#e0a982', '#c68a62', '#a8714d', '#8d5a3b', '#6b4226', '#4a2c1a'];
  var HAIRC = ['#1c1410', '#3b2416', '#6b4423', '#b5793f', '#e8c37a', '#f2f0e6', '#c1121f', '#ff5fae', '#7c5cff', '#2fe0d6'];
  var LIPS = ['#9c4a52', '#c2185b', '#e63946', '#ff5fae', '#6a1b4d', '#d4a373', '#111111', '#7c5cff'];
  var DRESS_TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['top', 'Tops'], ['bottom', 'Bottoms'], ['shoes', 'Shoes'], ['acc', 'Accessories'], ['details', 'Details']];
  function threeUrl() {
    if (MODE !== 'gas') return 'three.min.js';
    var base = S && S.fun && S.fun.appBase ? S.fun.appBase.replace(/[?#].*$/, '').replace(/\/?$/, '/') : '';
    return base ? base + 'three.min.js' : 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
  }
  // 2D illustrated characters for now (the character creator's 3D ones replace these later; the 3D code below is kept)
  function mount3d(id, looks, opts) {
    var host0 = el(id); if (!host0) return;
    opts = opts || {};
    if (window.NudgeFigure) {
      host0.innerHTML = '<div class="figs">' + looks.map(function (L, i) { return '<div class="fig">' + NudgeFigure.svg(L, opts.h || 230, (opts.states || [])[i] || {}) + '</div>'; }).join('') + '</div>';
      host0.classList.add('ready', 'flat');
      return;
    }
    if (!window.LQ3D) return;
    window.LQ_THREE_URL = threeUrl();
    LQ3D.load().then(function () {
      var host = el(id); if (!host) return;
      var key = JSON.stringify(looks), s = stages3d[id];
      try {
        if (!s) { s = stages3d[id] = LQ3D.stage(host, Object.assign({ looks: looks }, opts || {})); s.key = key; }
        else { s.attach(host); if (s.key !== key) { s.set(looks); s.key = key; } }
        host.classList.add('ready');
      } catch (e) { host.innerHTML = '<p class="small muted center av3d-msg">3D isn\'t available on this device.</p>'; }
    }, function (e) { var host = el(id); if (host) host.innerHTML = '<p class="small muted center av3d-msg">' + esc(e.message) + '</p>'; });
  }
  function nextUnlock() {
    var W = S.wardrobe; if (!W) return null;
    return W.catalog.filter(function (w) { return w.chores > W.chores && W.owned.indexOf(w.id) === -1; }).sort(function (a, b) { return a.chores - b.chores || b.price - a.price; })[0] || null;
  }
  /** The characters on the Today hero: the 3D stage, a line that reacts to the day, and the next unlock. */
  function todayStage() {
    var W = S.wardrobe, n = names(); if (!W) return '';
    var nu = nextUnlock(), left = nu ? nu.chores - W.chores : 0;
    return '<div class="av3d stage" id="av3dHome"><div class="av3d-msg small muted center">Loading your characters…</div></div>' +
      (S.solo ? '' : '<div class="between av-names"><span>You</span><span>' + esc(n.other) + '</span></div>') + stageLine() +
      (nu ? '<p class="tiny muted center" style="margin:4px 0 12px">' + left + ' more chore' + (left === 1 ? '' : 's') + ' unlocks the ' + esc(nu.name) + '</p>' : '<div style="height:10px"></div>');
  }
  function wardrobeCard() {
    var W = S.wardrobe, n = names(); if (!W) return '';
    var nu = nextUnlock(), left = nu ? nu.chores - W.chores : 0;
    return '<section class="card av-card"><div class="head"><h3>' + esc(n.team) + '</h3><span class="small muted">' + (wide() ? 'Drag to spin' : 'Swipe to spin') + '</span></div>' +
      '<div class="av3d" id="av3dHome"><div class="av3d-msg small muted center">Loading your characters…</div></div>' +
      (S.solo ? '' : '<div class="between av-names"><span>You</span><span>' + esc(n.other) + '</span></div>') + stageLine() +
      (nu ? '<p class="small center" style="margin:8px 0 10px"><b>' + left + ' more chore' + (left === 1 ? '' : 's') + '</b> unlocks the ' + esc(nu.name) + (nu.style === 'drag' ? ' (runway)' : '') + '</p>' : '<p class="small center" style="margin:8px 0 10px">Everything in the wardrobe is unlocked. Legendary.</p>') +
      '<button class="btn primary wide" type="button" data-dress="open">' + icon('sparkles', 's') + 'Dressing room</button></section>';
  }
  /** One line under the stage that reacts to the real day. */
  function stageLine() {
    var f = faceState(S.who), hr = new Date(now()).getHours(), t = '';
    if (f.mood === 'sleepy') t = 'It\'s ' + (hr === 0 ? 'past midnight' : hr + 'am') + '. Time for bed.';
    else if (f.mood === 'happy') t = S.solo ? 'Day won. Look at you go.' : 'You both won the day. Look at them go.';
    else if (f.wear === 'rain') t = 'Rain later. Jackets on.';
    else if (f.wear === 'gym') t = 'Gym kit on: ' + esc(S.today.gym.session) + ' today.';
    else if (f.wear === 'dj') t = 'Headphones on after Booth.';
    return t ? '<p class="small center stage-line" style="margin:6px 0 0">' + t + '</p>' : '';
  }
  function mountHome3d() { var o = S && S.who === 'me' ? 'partner' : 'me'; if (S && S.wardrobe && el('av3dHome')) mount3d('av3dHome', S.solo ? [S.wardrobe.look] : [S.wardrobe.look, S.wardrobe.other], { theme: 'vice', h: 200, states: [faceState(S.who), faceState(o)] }); }
  function mountYou3d() { if (S && S.wardrobe && el('av3dYou')) mount3d('av3dYou', [S.wardrobe.look], { h: 300, states: [faceState(S.who)], theme: (charOf(S.who) || '').slice(0, 2) === 'sa' ? 'grove' : 'vice' }); }
  function owns(id) { return S.wardrobe.owned.indexOf(id) !== -1; }
  function wearing(L, it) {
    if (it.slot === 'acc') return (L.acc || []).indexOf(it.id) !== -1;
    if (it.slot === 'pattern') return L[dress.patFor === 'top' ? 'topPat' : 'botPat'] === it.id;
    if (it.slot === 'glam') return owns('glam');
    return L[it.slot] === it.id;
  }
  function unowned(L) {
    var W = S.wardrobe, list = [];
    ['hair', 'top', 'bottom', 'shoes', 'topPat', 'botPat'].forEach(function (k) { if (!owns(L[k])) list.push(L[k]); });
    (L.acc || []).forEach(function (id) { if (!owns(id)) list.push(id); });
    return list.map(function (id) { return W.catalog.filter(function (w) { return w.id === id; })[0]; }).filter(Boolean);
  }
  function swatches(key, list, cur) {
    return '<div class="swatches">' + list.map(function (c) { return '<button type="button" class="sw' + (cur === c ? ' on' : '') + '" data-dcol="' + key + '" data-v="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join('') +
      '<label class="sw custom" title="Any colour"><input type="color" data-dcolor="' + key + '" value="' + cur + '" aria-label="Pick any colour"></label></div>';
  }
  function dressPanel() {
    var W = S.wardrobe, L = dress.look, tab = dress.tab, h = '';
    if (tab === 'body') {
      var opt = function (key, label, list, def) {
        var cur = L[key] === undefined ? def : L[key];
        return '<div class="eyebrow">' + label + '</div><div class="seg" style="margin:6px 0 12px">' + list.map(function (o) { return '<button type="button" data-dopt="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>';
      };
      h += '<div class="eyebrow">Frame</div><div class="seg" style="margin:6px 0 12px">' + [['m', 'Straight'], ['f', 'Curvy']].map(function (o) { return '<button type="button" data-dbody="' + o[0] + '" aria-pressed="' + (L.body === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        opt('build', 'Build', [['slim', 'Slim'], ['avg', 'Average'], ['broad', 'Broad'], ['big', 'Big']], 'avg') +
        opt('height', 'Height', [['short', 'Shorter'], ['avg', 'Average'], ['tall', 'Taller']], 'avg') +
        '<div class="eyebrow">Skin</div>' + swatches('skin', SKINS, L.skin);
      return h;
    }
    if (tab === 'face') {
      var fopt = function (key, label, list, def) {
        var cur = L[key] === undefined ? def : L[key];
        return '<div class="eyebrow">' + label + '</div><div class="seg" style="margin:6px 0 12px">' + list.map(function (o) { return '<button type="button" data-dopt="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>';
      };
      h += '<div class="eyebrow">Eyes</div>' + swatches('eyeC', NudgeLook.PALETTES.eyes, L.eyeC || '#4a2f1d') + '<div style="margin-top:12px"></div>' +
        fopt('beard', 'Facial hair', [['none', 'None'], ['stubble', 'Stubble'], ['goatee', 'Goatee'], ['full', 'Full beard']], L.body === 'f' ? 'none' : 'stubble') +
        fopt('freckles', 'Freckles', [['', 'No'], ['1', 'Yes']], L.freckles ? '1' : '');
      if (!owns('glam')) { var gk = W.catalog.filter(function (w) { return w.id === 'glam'; })[0]; return h + '<div class="eyebrow">Glam</div><p class="small muted" style="margin:4px 0 8px">Lipstick and eyeshadow, any colour. Unlock the Glam kit to paint your face for the runway.</p>' + itemCard(gk); }
      return h + '<div class="eyebrow">Lipstick</div>' + swatches('lips', LIPS, L.lips) + '<div class="eyebrow" style="margin-top:12px">Eyeshadow</div>' + swatches('shadow', SWATCH.concat(['#ffd166']), L.shadow);
    }
    if (tab === 'details') { tab = 'pattern'; h += '<p class="small muted" style="margin:0 0 8px">Patterns and prints. Pick where they go, then a pattern.</p><div class="seg" style="margin:0 0 10px">' + [['top', 'On your top'], ['bottom', 'On your bottoms']].map(function (o) { return '<button type="button" data-dpat="' + o[0] + '" aria-pressed="' + (dress.patFor === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
    var colKey = { hair: 'hairC', top: 'topC', bottom: 'botC', shoes: 'shoeC' }[tab];
    if (colKey) h += '<div class="eyebrow">Colour</div>' + swatches(colKey, tab === 'hair' ? HAIRC : SWATCH, L[colKey]) + '<div class="eyebrow" style="margin-top:12px">' + (tab === 'acc' ? 'Up to four' : 'Styles') + '</div>';
    if (tab === 'acc') h += '<p class="tiny muted" style="margin:0 0 8px">Wear up to four at once.</p>';
    var items = W.catalog.filter(function (w) { return w.slot === tab; }).sort(function (a, b) { return (owns(b.id) - owns(a.id)) || a.chores - b.chores || a.price - b.price; });
    return h + '<div class="dress-items">' + items.map(itemCard).join('') + '</div>';
  }
  function itemCard(it) {
    var W = S.wardrobe, L = dress.look, own = owns(it.id), locked = W.chores < it.chores || (it.ach && !own), on = wearing(L, it);
    var state = own ? (on ? 'Wearing' : 'Owned') : it.ach ? it.req : locked ? (it.chores - W.chores) + ' more chore' + (it.chores - W.chores === 1 ? '' : 's') : money(it.price);
    return '<div class="ditem' + (on ? ' on' : '') + (locked ? ' locked' : '') + ' st-' + it.style + '"><button type="button" class="ditem-main" data-dtry="' + it.id + '">' +
      '<span class="ditem-tag">' + STYLE_TAG[it.style] + '</span><b>' + esc(it.name) + '</b><span class="small' + (own ? '' : ' muted') + '">' + (locked ? icon('lock', 's') : '') + state + '</span></button>' +
      (!own && !locked ? '<button type="button" class="btn ' + (S.empire && S.empire.cash >= it.price ? 'primary' : 'line') + ' sm" data-dbuy="' + it.id + '">Buy</button>' : '') + '</div>';
  }
  function renderDress() {
    if (!dress) return;
    var W = S.wardrobe, un = unowned(dress.look);
    var sv = W.saved || [];
    el('dressTools').innerHTML = '<div class="row wrap" style="gap:6px"><button class="btn soft sm" type="button" data-dress="random">' + icon('shuffle', 's') + 'Randomise</button>' +
      '<button class="btn ghost sm" type="button" data-dress="undo"' + (dress.hist.canUndo() ? '' : ' disabled') + '>' + icon('undo', 's') + 'Undo</button>' +
      '<button class="btn ghost sm" type="button" data-dress="redo"' + (dress.hist.canRedo() ? '' : ' disabled') + '>Redo<span class="flipx">' + icon('undo', 's') + '</span></button></div>' +
      '<div class="eyebrow" style="margin:10px 0 6px">Saved looks</div><div class="lookslots">' + [0, 1, 2].map(function (i) {
        var x = sv[i];
        return '<div class="lookslot' + (x ? '' : ' empty') + '">' + (x ? '<button type="button" class="ls-wear" data-dslot="' + i + '" data-act="wear">' + NudgeFigure.svg(x.look, 46, {}) + '<span>' + esc(x.name) + '</span></button>' : '<span class="tiny muted">Empty</span>') +
          '<button type="button" class="btn ghost sm" data-dslot="' + i + '" data-act="save">' + (x ? 'Replace' : 'Save here') + '</button></div>';
      }).join('') + '</div>';
    el('dressTabs').innerHTML = DRESS_TABS.map(function (t) { return '<button type="button" data-dtab="' + t[0] + '" aria-pressed="' + (dress.tab === t[0]) + '">' + t[1] + '</button>'; }).join('');
    el('dressPanel').innerHTML = dressPanel();
    el('dressCash').innerHTML = money(S.empire ? S.empire.cash : 0) + ' to spend · ' + W.chores + ' chore' + (W.chores === 1 ? '' : 's') + ' done';
    el('dressNote').innerHTML = un.length ? 'Trying on: ' + un.map(function (x) { return esc(x.name); }).join(', ') + '. Buy ' + (un.length === 1 ? 'it' : 'them') + ' to keep the look.' : '';
    el('dressSave').disabled = !!un.length;
  }
  function preview(spin) {
    if (window.NudgeFigure) {
      mount3d('av3dDress', [dress.look], { h: 330, states: [dress.pose === 'happy' ? { mood: 'happy', bounce: !reducedMotion() } : {}] });
      var host = el('av3dDress'); if (host) { host.classList.toggle('runway', dress.pose === 'runway' && !reducedMotion()); host.style.setProperty('--zoom', dress.zoom); }
      return;
    }
    var s = stages3d.av3dDress; if (!s) return;
    s.set([dress.look]); s.key = JSON.stringify([dress.look]);
    if (spin) s.sashay(0);
  }
  function openDress() {
    if (!S.wardrobe) return;
    dress = { look: JSON.parse(JSON.stringify(S.wardrobe.look)), tab: 'body', patFor: 'top', pose: 'stand', zoom: 1 };
    dress.hist = NudgeLook.history(dress.look);
    var box = document.createElement('div');
    box.id = 'dress'; box.className = 'dress'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Dressing room');
    box.innerHTML = '<div class="dress-in"><div class="dress-stage"><div class="av3d" id="av3dDress"><div class="av3d-msg small center">Loading…</div></div><div class="dress-ctl"><div class="seg" role="group" aria-label="Pose">' + [['stand', 'Stand'], ['runway', 'Runway'], ['happy', 'Happy']].map(function (o) { return '<button type="button" data-dpose="' + o[0] + '" aria-pressed="' + (o[0] === 'stand') + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<span class="row" style="gap:4px"><button class="iconbtn" type="button" data-dzoom="-1" aria-label="Zoom out">−</button><button class="iconbtn" type="button" data-dzoom="1" aria-label="Zoom in">+</button></span></div></div>' +
      '<div class="dress-side"><div class="between"><div><div class="eyebrow">Wardrobe</div><h2 style="margin:2px 0 0">Dressing room</h2></div><button class="iconbtn" type="button" data-dress="close" aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="small muted" id="dressCash" style="margin:4px 0 10px"></div><div id="dressTools" class="dress-tools"></div><div class="dress-tabs" id="dressTabs"></div><div id="dressPanel" class="dress-panel"></div>' +
      '<div class="dress-foot"><p class="tiny" id="dressNote"></p><div class="grid2"><button class="btn line" type="button" data-dress="close">Cancel</button><button class="btn primary" type="button" id="dressSave" data-dress="save">Save look</button></div></div></div></div>';
    document.body.appendChild(box); document.body.classList.add('dress-open');
    renderDress();
    if (stages3d.av3dDress) { stages3d.av3dDress.dispose(); delete stages3d.av3dDress; }
    if (window.NudgeFigure) preview(false); else mount3d('av3dDress', [dress.look], { theme: 'vice', spin: false, yaw: 0.2 });
  }
  function closeDress() {
    if (stages3d.av3dDress) { stages3d.av3dDress.dispose(); delete stages3d.av3dDress; }
    var d = el('dress'); if (d) d.remove();
    document.body.classList.remove('dress-open'); dress = null;
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-dress], [data-dtab], [data-dtry], [data-dbuy], [data-dcol], [data-dbody], [data-dpat], [data-dopt], [data-dpose], [data-dzoom], [data-dslot]');
    if (!t || !S) return;
    var d = t.dataset, L = dress && dress.look;
    if (d.dress === 'open') return openDress();
    if (!dress) return;
    if (d.dress === 'close') return closeDress();
    if (d.dress === 'spin') { var s = stages3d.av3dDress; if (s) s.sashay(0); return; }
    var changed = function (spin) { dress.hist.push(dress.look); preview(spin); renderDress(); };
    if (d.dress === 'random') { dress.look = NudgeLook.randomise(S.wardrobe.catalog, S.wardrobe.owned, Math.random, dress.look); buzz(10); return changed(true); }
    if (d.dress === 'undo' || d.dress === 'redo') { var back = dress.hist[d.dress](); if (back) { dress.look = back; preview(false); renderDress(); } return; }
    if (d.dpose) { dress.pose = d.dpose; document.querySelectorAll('[data-dpose]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.dpose === dress.pose); }); return preview(false); }
    if (d.dzoom) { dress.zoom = Math.max(0.8, Math.min(1.8, dress.zoom + (+d.dzoom) * 0.2)); return preview(false); }
    if (d.dslot !== undefined && d.act) {
      var slot = +d.dslot;
      if (d.act === 'wear') return rpc('wearLookSlot', [slot]).then(function (res) { apply(res); dress.look = JSON.parse(JSON.stringify(S.wardrobe.look)); changed(true); toast('Wearing ' + S.wardrobe.saved[slot].name); }, function (e) { toast(e.message, true); });
      if (unowned(L).length) return toast('Buy the pieces you\'re trying on first, then save the look.', true);
      var nm = prompt('Name this look', (S.wardrobe.saved[slot] && S.wardrobe.saved[slot].name) || ['Everyday', 'Night out', 'Gym'][slot]); if (nm === null) return;
      return rpc('saveLookSlot', [slot, nm, L]).then(function (res) { apply(res); renderDress(); toast('Saved as ' + (S.wardrobe.saved[slot] || {}).name); }, function (e) { toast(e.message, true); });
    }
    if (d.dress === 'save') {
      S.wardrobe.look = JSON.parse(JSON.stringify(L)); closeDress(); renderAll(); toast('Looking good. Saved.'); chime([523, 659, 784]);
      save('state-' + KEY.slice(0, 6), S); return later('setLook3d', [S.wardrobe.look]);
    }
    if (d.dtab) { dress.tab = d.dtab; return renderDress(); }
    if (d.dpat) { dress.patFor = d.dpat; return renderDress(); }
    if (d.dbody) { L.body = d.dbody; return changed(true); }
    if (d.dopt) { L[d.dopt] = d.dopt === 'freckles' ? !!d.v : d.v; return changed(true); }
    if (d.dcol) { L[d.dcol] = d.v; return changed(false); }
    if (d.dtry) {
      var it = S.wardrobe.catalog.filter(function (w) { return w.id === d.dtry; })[0]; if (!it) return;
      if (it.slot === 'acc') { var a = L.acc || (L.acc = []), i = a.indexOf(it.id); if (i !== -1) a.splice(i, 1); else { if (a.length >= 4) return toast('Four extras at most. Take one off first.'); a.push(it.id); } }
      else if (it.slot === 'pattern') L[dress.patFor === 'top' ? 'topPat' : 'botPat'] = it.id;
      else if (it.slot === 'glam') return;
      else L[it.slot] = it.id;
      return changed(true);
    }
    if (d.dbuy) {
      var item = S.wardrobe.catalog.filter(function (w) { return w.id === d.dbuy; })[0], cash = S.empire ? S.empire.cash : 0;
      // checked here first, so a "no" is instant too; the server checks again
      if (S.wardrobe.chores < item.chores) return toast('Do ' + (item.chores - S.wardrobe.chores) + ' more chores to unlock the ' + item.name + '.', true);
      if (cash < item.price) return toast('You need ' + money(item.price - cash) + ' more.', true);
      S.wardrobe.owned.push(item.id); if (S.empire) S.empire.cash -= item.price;
      renderDress(); buzz([20, 30, 40]);
      if (item.style === 'drag') { confetti(true); toast('The ' + item.name + ' is yours. Work it.'); } else { confetti(false); toast('Bought the ' + item.name); }
      chime([659, 784, 1047]);
      save('state-' + KEY.slice(0, 6), S);
      return call('buyWear', [d.dbuy], null, function () { if (dress) renderDress(); });
    }
  });
  document.addEventListener('input', function (ev) {
    var k = ev.target.dataset && ev.target.dataset.dcolor; if (!k || !dress) return;
    dress.look[k] = ev.target.value; preview(false);
  });
  document.addEventListener('change', function (ev) { if (ev.target.dataset && ev.target.dataset.dcolor && dress) { dress.hist.push(dress.look); renderDress(); } });

  // ---------- taps ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, li[data-step]');
    if (!t || !S) return;
    var ds = t.dataset;
    if (ds.tab) { t.blur(); return showTab(ds.tab); }
    if (ds.goto) return showTab(ds.goto);
    if (ds.lazy) return call('lazyDay', [ds.lazy], function (res) { apply(res, ds.lazy === 'undo' ? 'Lazy day cancelled.' : ds.lazy === 'yesterday' ? 'Yesterday\'s a lazy day now. Streak back.' : 'Lazy day. Streak\'s safe.'); });
    // quick, optimistic taps
    if (ds.qtog) { var tq = questByName(ds.qtog); if (tq) togetherSheet(tq); return; }
    if (ds.qdone) return quick(function () {
      var q = questByName(ds.qdone);
      [S.quests.board, S.quests.more, S.quests.all].forEach(function (l) { l.forEach(function (x) { if (x.name === ds.qdone) { x.doneToday = true; x.doneBy = S.who; } }); });
      if (q) addXpLocal(q.xp + (q.who !== 'anyone' && q.who !== 'together' && q.who !== S.who ? Math.round(q.xp / 2) : 0), true);
      buzz([20, 30, 20]);
    }, 'questDone', [ds.qdone], ds.qdone + ': done');
    if (ds.claim) return quick(function () { S.quests.board.concat(S.quests.more).forEach(function (x) { if (x.name === ds.claim) x.claimedBy = x.claimedBy === S.who ? '' : S.who; }); }, 'claimQuest', [ds.claim]);
    if (ds.hi5) { highFive('Sent to ' + names().other); }
    if (ds.hi5) return quick(function () { S.game.feed.forEach(function (f) { if (f.id === ds.hi5 && f.hi5.indexOf(S.who) === -1) f.hi5.push(S.who); }); }, 'highFive', [ds.hi5], 'High-five sent');
    if (ds.routine !== undefined && ds.ri !== undefined) return quick(function () {
      S.routines.routines.forEach(function (r) { if (r.name !== ds.routine) return; var i = r.done.indexOf(+ds.ri); if (i === -1) r.done.push(+ds.ri); else r.done.splice(i, 1); if (!r.finished && r.done.length >= r.steps.length) { r.finished = true; addXpLocal(10); } });
      buzz(15);
    }, 'routineStep', [ds.routine, +ds.ri]);
    if (ds.water) return quick(function () { var b = S.routines.water; S.routines.water = Math.max(0, b + +ds.water); if (S.routines.waterGoal && b < S.routines.waterGoal && S.routines.water >= S.routines.waterGoal) addXpLocal(5); buzz(15); }, 'addWater', [+ds.water]);
    if (ds.shop) return quick(function () { S.shopping.forEach(function (it) { if (it.id === ds.shop) it.got = !it.got; }); }, 'toggleShopping', [ds.shop]);
    if (ds.clear) return quick(function () { S.chores.later = S.chores.later.filter(function (l) { return l.id !== ds.clear; }); }, 'clearLater', [ds.clear]);
    if (ds.skin) { buzz(10); savePrefs({ skin: ds.skin }); return; }
    if (ds.mode) { savePrefs({ mode: ds.mode }); return; }
    if (ds.theme) { S.theme = ds.theme; save('theme', ds.theme); document.documentElement.setAttribute('data-theme', ds.theme); renderYou(); renderCustom(); later('setTheme', [ds.theme]); return; }
    // home
    if (ds.wn) { wn[ds.wn] = ds.wn === 'minutes' ? +ds.v : ds.v; save(ds.wn === 'minutes' ? 'wnMinutes' : 'wnEnergy', wn[ds.wn]); wn.skip = []; return whatNowSheet(); }
    if (t.id === 'wnFind' || t.id === 'wnSkip') {
      if (t.id === 'wnSkip' && wn.pick) wn.skip.push(wn.pick.name);
      return call('whatNow', [wn.energy, wn.minutes === 60 ? 999 : wn.minutes, wn.skip], function (p) { wn.pick = p || null; whatNowSheet(); });
    }
    if (ds.wnstart) { var pk = wn.pick; return startPlan(ds.wnstart === 'taster' ? { name: pk.name, minutes: 5, steps: pk.steps, taster: true } : { name: pk.name, minutes: pk.minutes, steps: pk.steps }, ds.wnstart === 'taster' ? 'Just five minutes. Stop whenever, it still counts.' : null); }
    if (t.id === 'openAsk') return askSheet();
    if (t.id === 'askClear') { chat = []; save('chat-' + KEY.slice(0, 6), chat); rpc('clearAsk', []).catch(function () {}); return askSheet(); }
    if (t.id === 'nudge') return nudgeSheet();
    if (ds.nudge) return call('sendNudge', [ds.nudge], function (r) { closeSheet(); toast(r.delivered ? 'Sent to ' + names().other : 'Couldn\'t reach ' + names().other + ' right now'); });
    // chores
    if (ds.cview) { choresView = ds.cview; save('choresView', choresView); return renderChores(); }
    if (ds.qstart) { var q = questByName(ds.qstart); plan = { name: q.name, minutes: q.minutes, steps: q.steps.slice() }; renderAll(); return showTab('chores'); }
    if (ds.job) { var c = S.chores.chores[+ds.job]; plan = { name: c.name, minutes: c.minutes, steps: c.steps.slice() }; return renderAll(); }
    if (ds.mins) { plan.minutes = Math.max(5, Math.min(180, plan.minutes + +ds.mins)); return renderChores(); }
    if (t.id === 'pback') { plan = null; return renderAll(); }
    if (t.id === 'go') return startPlan(plan);
    if (ds.step !== undefined) return call('stepDone', [+ds.step], function (res) { apply(res); });
    if (t.id === 'parkBtn') { parking = !parking; renderChores(); if (parking) el('parkText').focus(); return; }
    if (ds.more) return call('extendChore', [+ds.more], function (res) { upShown = ''; apply(res, '+' + ds.more + ' minutes. Finish it off.'); });
    if (t.id === 'cdone') { var task = mySession().task; return call('finishChore', ['Done'], function (res) { parking = false; if (M() && M().now()) M().stop(); stopOwn(); stopWeb(); apply(res, task + ': done. Nice.'); }); }
    if (t.id === 'cstop') return call('finishChore', ['Stopped'], function (res) { parking = false; if (M() && M().now()) M().stop(); stopOwn(); stopWeb(); apply(res, 'Stopped. Starting was the hard part.'); });
    if (t.id === 'ccancel') return call('finishChore', ['Cancelled'], function (res) { parking = false; if (M() && M().now()) M().stop(); stopOwn(); stopWeb(); apply(res, 'Cancelled.'); });
    if (t.id === 'askJoin') return call('askToJoin', [], function (r) { apply(r.state, r.sent ? 'Asked ' + names().other + ' to join' : 'Added to the feed'); });
    if (t.id === 'dumpBtn') { var txt = el('dumpText').value.trim(); if (!txt) return; toast(S.hasClaudeKey ? 'Sorting it out…' : 'Splitting it up…'); return call('brainDump', [txt], dumpReview); }
    if (t.id === 'dumpSave') {
      var items = (wn.dump || []).map(function (it, i) { var k = document.querySelector('[data-dk="' + i + '"]'); return { text: it.text, kind: k ? k.value : it.kind, every: it.every, minutes: it.minutes }; }).filter(function (it) { return it.kind !== 'skip'; });
      return call('saveBrainDump', [items], function (res) { closeSheet(); if (el('dumpText')) el('dumpText').value = ''; apply(res, 'Sorted ' + items.length + ' things.'); });
    }
    if (t.id === 'respread') return call('respreadSchedule', [], function (res) { apply(res, 'Dates spread out again.'); });
    if (t.id === 'addChore') { edit = { original: '', name: '', rhythm: 'weekly', days: [new Date(now()).getDay()], date: 15, minutes: 10, who: 'anyone', energy: 'medium', steps: [], every: '' }; return editSheet(); }
    if (ds.edit) {
      var sq = S.schedule.filter(function (x) { return x.name === ds.edit; })[0], ev = String(sq.every || '');
      var days = []; DAYS.forEach(function (d, i) { if (new RegExp('\\b' + d + '\\b', 'i').test(ev.replace(/^(weekly|2 weeks)/, ''))) days.push(i); });
      edit = { original: sq.name, name: sq.name, rhythm: sq.rhythm, days: days.length ? days : [new Date(now()).getDay()], date: +(ev.match(/monthly (\d+)/) || [])[1] || 15, minutes: sq.minutes, who: sq.who, energy: sq.energy, steps: sq.steps || [], every: ev };
      return editSheet();
    }
    if (ds.er) { readEditInputs(); edit.rhythm = ds.er; if (ds.er === 'biweekly') edit.days = edit.days.slice(0, 1); return editSheet(); }
    if (ds.ed !== undefined) { readEditInputs(); var di = +ds.ed; if (edit.rhythm === 'biweekly') edit.days = [di]; else { var at = edit.days.indexOf(di); if (at === -1) edit.days.push(di); else if (edit.days.length > 1) edit.days.splice(at, 1); } return editSheet(); }
    if (ds.edate) { readEditInputs(); edit.date = +ds.edate; return editSheet(); }
    if (ds.ee) { readEditInputs(); edit.energy = ds.ee; return editSheet(); }
    if (t.id === 'eSave') { readEditInputs(); var e = edit; return call('saveQuest', [{ name: e.original, newName: e.name, rhythm: e.rhythm, days: e.days, date: e.date, every: e.every, minutes: e.minutes, who: e.who, energy: e.energy, steps: e.steps }], function (res) { closeSheet(); apply(res, 'Saved'); }); }
    if (t.id === 'eDel') { if (!confirm('Delete "' + edit.original + '"?')) return; return call('deleteQuest', [edit.original], function (res) { closeSheet(); apply(res, 'Deleted'); }); }
    // play
    if (ds.pview) { playView = ds.pview; save('playView', playView); renderPlay(); return pollGames(); }
    if (ds.key) return wordKey(ds.key);
    if (ds.num) { target.expr += (target.expr && /\d$/.test(target.expr) ? ' ' : '') + ds.num; return renderPlay(); }
    if (ds.op) { target.expr += ' ' + ds.op + ' '; target.expr = target.expr.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')'); return renderPlay(); }
    if (t.id === 'tClear') { target.expr = ''; return renderPlay(); }
    if (t.id === 'tCheck') { if (!target.expr.trim()) { toast('Tap some numbers and signs first'); return; } return call('submitTarget', [target.expr, false], function (g) { var before = S.games.target.mine; S.games = g; renderPlay(); var m = g.target.mine; toast(m && m.final ? 'Bang on. Locked in.' : 'Best so far: ' + m.best + ' (' + Math.abs(m.best - g.target.target) + ' away)'); if (m && m.final) { confetti(true); refreshQuiet(); } }); }
    if (t.id === 'tLock') return call('submitTarget', ['', true], function (g) { S.games = g; renderPlay(); toast('Locked in.'); refreshQuiet(); });
    if (t.id === 'recallStart') { recallGame = { on: true, seq: [], pos: 0, input: false, msg: '' }; return recallRound(); }
    if (ds.pad !== undefined && recallGame && recallGame.on && recallGame.input) {
      var g2 = recallGame, pi = +ds.pad;
      t.classList.add('lit'); setTimeout(function () { t.classList.remove('lit'); }, 160); chime([440 + pi * 60]);
      if (pi !== g2.seq[g2.pos]) {
        var level = g2.seq.length - 1; recallGame = null; buzz([80, 40, 80]);
        return call('submitRecall', [level], function (g) { S.games = g; renderPlay(); toast('You remembered ' + level + ' in a row'); refreshQuiet(); });
      }
      g2.pos++;
      if (g2.pos >= g2.seq.length) { g2.input = false; g2.msg = 'Nice. Next round…'; var m2 = el('recallMsg'); if (m2) m2.textContent = g2.msg; setTimeout(recallRound, 700); }
      return;
    }
    if (ds.pad !== undefined && !(recallGame && recallGame.on && recallGame.input)) { toast(recallGame && recallGame.on ? 'Watch first, then copy it' : 'Tap Start, then copy the pattern'); return; }
    // train
    if (ds.tsel) { tsel = ds.tsel; save('tsel-' + S.today.date, tsel); return renderTrain(); }
    if (ds.setsession !== undefined) {
      var ns = ds.setsession;
      if (ds.rest && !confirm('Make today a rest day? Your gym event and task are removed.')) return;
      return call('setTodaySession', [ns], function (res) { if (ns) { tsel = ns; save('tsel-' + S.today.date, tsel); } apply(res, ns ? 'Today is now ' + ns + '.' : 'Rest day. Recover well.'); });
    }
    if (ds.rd) { var ri = t.parentNode.querySelector('[data-sr]'); ri.value = Math.max(0, (+ri.value || 0) + +ds.rd); ri.dispatchEvent(new Event('input', { bubbles: true })); return; }
    if (ds.set) {
      var row = t.closest('.set'), dd = draft(), k = ds.set;
      dd[k] = dd[k] || {}; dd[k].done = !dd[k].done;
      var wi = row.querySelector('[data-sw]'), rin = row.querySelector('[data-sr]');
      dd[k].weight = wi.value === '' ? null : +wi.value; dd[k].reps = Math.max(0, Math.round(+rin.value || 0));
      if (!load('wkstart-' + draftKey())) save('wkstart-' + draftKey(), now());
      saveDraft(dd);
      row.classList.toggle('done', dd[k].done); t.classList.toggle('on', dd[k].done);
      if (dd[k].done) { buzz(20); startRest(restSecs(ds.rest)); }
      return drawFinish();
    }
    if (ds.restadd) { if (rest) { rest.until = Math.max(now() + 5000, rest.until + +ds.restadd * 1000); save('rest', rest); drawRest(); armRest(); } return; }
    if (t.id === 'restSkip') { endRest(); armRest(); return; }
    if (t.id === 'finishWk') return finishWorkout();
    if (ds.exmenu) return exMenu(ds.exmenu);
    if (ds.tmedit) { tmOpen[ds.tmedit] = !tmOpen[ds.tmedit]; renderTrain(); var tf = document.querySelector('form[data-tm="' + ds.tmedit + '"] input'); if (tf) tf.focus(); return; }
    if (t.id === 'addEx') return addExSheet();
    if (ds.exset) { var eid = ds.ex, dir = +ds.exset; editCust(true, function (c) { c.extra[eid] = (c.extra[eid] || 0) + dir; }); return renderTrain(); }
    if (ds.exdrop && exTarget) { var did = exTarget, keep = el('exKeep') && el('exKeep').checked; editCust(keep, function (c) { if (did.indexOf('Add|') === 0) c.add = c.add.filter(function (x) { return 'Add|' + x.exercise !== did; }); else if (c.drop.indexOf(did) === -1) c.drop.push(did); }); if (did.indexOf('Add|') === 0) editCust(!keep, function (c) { c.add = c.add.filter(function (x) { return 'Add|' + x.exercise !== did; }); }); closeSheet(); return renderTrain(); }
    if (ds.exback && exTarget) { var bid = exTarget; custKeys(tsel).forEach(function (ck) { var c = load(ck); if (c && c.swap) { delete c.swap[bid]; save(ck, c); } }); closeSheet(); return renderTrain(); }
    if (t.id === 'resetCust') { if (!confirm('Put ' + tsel + ' back to the plan? Your logged sets today stay ticked.')) return; custKeys(tsel).forEach(function (ck) { save(ck, null); }); return renderTrain(); }
    // food
    if (ds.preset !== undefined) {
      var p = S.food.presets[+ds.preset], mine = { name: p.name, kcal: p.kcal, protein: p.protein };
      pending.push(mine); renderFood(); buzz(15);
      var drop = function () { pending.splice(pending.indexOf(mine), 1); };
      rpc('logPreset', [p.name]).then(function (res) { drop(); S.food = res.state; renderFood(); offerUndo(res.undo, 'Logged ' + itemsText(res.added)); }, function (err) { drop(); renderFood(); toast(err.message, true); });
      return;
    }
    if (t.id === 'undo') return call('undoLast', [], function (res) { S.food = res.state; renderFood(); toast('Removed ' + res.removed.join(', ')); });
    if (ds.shopdel) return quick(function () { S.shopping = S.shopping.filter(function (x) { return x.id !== ds.shopdel; }); }, 'removeShopping', [ds.shopdel], 'Removed');
    if (ds.fdel) return call('removeFood', [ds.fdel, ds.fitem], function (res) { closeSheet(); S.food = res.state; renderFood(); toast('Removed ' + ds.fitem); });
    if (ds.fedit) {
      var fe = S.food.entries.filter(function (x) { return x.entry === ds.fedit && x.item === ds.fitem; })[0]; if (!fe) return;
      sheetKind = 'food';
      openSheet('<h3 style="margin:0 0 10px">Change this</h3><form id="foodEdit" data-entry="' + esc(fe.entry) + '" data-item="' + esc(fe.item) + '" autocomplete="off">' +
        '<label class="small">What<input type="text" id="feItem" value="' + esc(fe.item) + '"></label>' +
        '<div class="grid2" style="margin-top:8px"><label class="small">kcal<input type="number" inputmode="numeric" id="feKcal" value="' + fe.kcal + '" min="0"></label><label class="small">Protein (g)<input type="number" inputmode="decimal" step="0.5" id="feProt" value="' + fe.protein + '" min="0"></label></div>' +
        '<div class="grid2" style="margin-top:12px"><button class="btn line" type="button" data-fdel="' + esc(fe.entry) + '" data-fitem="' + esc(fe.item) + '">' + icon('trash', 's') + 'Remove</button><button class="btn primary" type="submit">Save</button></div></form>');
      return;
    }
    if (t.id === 'ideas') { toast('Thinking of ideas…'); return call('mealIdeas', [], function (list) { ideas = list; renderFood(); }); }
    if (t.id === 'ideasClose') { ideas = null; return renderFood(); }
    if (ds.idea !== undefined) { var idea = ideas[+ds.idea]; return call('logIdea', [idea], function (res) { S.food = res.state; ideas = null; renderFood(); offerUndo(res.undo, 'Logged ' + idea.name); }); }
    // you
    if (ds.addshop) return call('addShopping', [ds.addshop], function (res) { apply(res, 'Added ' + ds.addshop); });
    if (t.id === 'pushOn') return Notification.permission === 'granted' && S.push.devices && load('pushTok') ? testPush() : enablePush();
    if ((t.id === 'install' || t.id === 'navInstall') && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; var ni = el('navInstall'); if (ni) ni.hidden = true; return; }
  });

  function wordKey(k) {
    var wd = S.games.word;
    if (wd.done) return;
    if (k === 'back') typed = typed.slice(0, -1);
    else if (k === 'enter') {
      if (typed.length < 5) return shakeRow('Not enough letters');
      if (!allowed(typed)) return shakeRow('Not in the word list');
      var guess = typed;
      wd.guesses.push(guess); wd.colours.push(''); typed = ''; renderPlay();
      rpc('guessWord', [guess]).then(function (g) {
        S.games = g; renderPlay();
        var w = g.word;
        if (w.done) { if (w.won) { confetti(true); chime([660, 880, 1100]); toast(['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'][w.guesses.length - 1]); } else toast('The word was ' + w.answer.toUpperCase()); refreshQuiet(); }
      }, function (err) { wd.guesses.pop(); wd.colours.pop(); typed = guess; renderPlay(); shakeRow(err.message); });
      return;
    } else if (typed.length < 5 && /^[a-z]$/.test(k)) typed += k;
    renderPlay();
  }
  function shakeRow(msg) {
    toast(msg);
    var r = document.querySelector('.board .r.cur');
    if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); }
  }
  document.addEventListener('keydown', function (e) {
    if (current !== 'play' || playView !== 'word' || !S || e.target.closest('input, textarea')) return;
    if (e.key === 'Enter') wordKey('enter');
    else if (e.key === 'Backspace') wordKey('back');
    else if (/^[a-zA-Z]$/.test(e.key)) wordKey(e.key.toLowerCase());
  });

  function dumpReview(items) {
    wn.dump = items;
    var kinds = [['task', 'To do'], ['recurring', 'Repeating chore'], ['shopping', 'Shopping'], ['park', 'Save for later'], ['skip', 'Skip']];
    openSheet('<h2>Here\'s what I heard</h2><p class="small muted" style="margin:4px 0 12px">Change anything, then save.</p>' + items.map(function (it, i) {
      return '<div class="item" style="flex-wrap:wrap"><div class="grow" style="min-width:55%">' + esc(it.text) + (it.kind === 'recurring' && it.every ? ' <span class="muted small">· ' + esc(it.every) + '</span>' : '') + '</div>' +
        '<select data-dk="' + i + '" aria-label="What is it" style="width:auto;padding:8px 10px">' + kinds.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === it.kind ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>';
    }).join('') + '<button class="btn primary big wide" type="button" id="dumpSave" style="margin-top:14px">Save</button>');
  }

  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target;
    if (!S) return;
    if (f.id === 'custom') { var tx = el('customText').value.trim(); if (!tx) { toast('Type the job first'); return; } toast(S.hasClaudeKey ? 'Working out how long that takes…' : 'Set the time, then start.'); return call('planChore', [tx], function (p) { plan = p; renderAll(); }); }
    if (f.id === 'park') { var v = el('parkText').value.trim(); if (!v) { toast('Type what popped into your head'); return; } var task = mySession().task; return call('parkThing', [v], function (res) { parking = false; apply(res, 'Saved for later. Back to ' + task + '.'); }); }
    if (f.id === 'weighForm') { var wv = el('weighText').value.trim(); if (!wv) { toast('Type your weight first, like 82.4'); el('weighText').focus(); return; } return call('logWeightNow', [wv], function (t) { S.today = t; addXpLocal(10); renderAll(); toast('Logged ' + t.lastWeight.kg + ' kg'); refreshQuiet(); }); }
    if (f.id === 'shopForm') { var it = el('shopText').value.trim(); if (!it) { toast('Type what you need first'); el('shopText').focus(); return; } el('shopText').value = ''; return call('addShopping', [it], function (res) { apply(res, 'Added'); }); }
    if (f.dataset.tm) { var ins = f.querySelectorAll('input'); return call('setTrainingMax', [f.dataset.tm, +ins[0].value, +ins[1].value], function (t) { tmOpen = {}; S.train = t; renderTrain(); var c = t.tmSet; if (t.undo) { undoSeen = ''; offerUndo(t.undo, c ? c.lift + ' training max ' + (c.from ? c.from + ' → ' : '') + c.to + ' kg. Weights updated.' : 'Training max set.'); } else toast('Training max set.'); }); }
    if (f.id === 'quick') {
      var text = el('quickText').value.trim(); if (!text) { toast('Type what you ate, like "2 eggs on toast"'); return; }
      el('quickBtn').disabled = true; el('quickNote').textContent = 'Working it out…';
      return call('quickAdd', [text], function (res) { el('quickText').value = ''; S.food = res.state; renderFood(); offerUndo(res.undo, 'Logged ' + itemsText(res.added)); }, function () { renderFood(); });
    }
    if (f.id === 'keyForm') { var val = el('keyText').value.trim(); if (!val) { toast('Paste your Claude key first'); return; } return call('saveClaudeKey', [val], function (s) { el('keyText').value = ''; S.food = s; S.hasClaudeKey = true; renderAll(); toast('Claude key saved.'); }); }
    if (f.id === 'nudgeForm') { var nt = el('nudgeText').value.trim(); if (!nt) { toast('Type a message, or tap one above'); return; } return call('sendNudge', [nt], function (r) { closeSheet(); toast(r.delivered ? 'Sent' : 'Couldn\'t reach them right now'); }); }
    if (f.id === 'askForm') {
      var q = el('askText').value.trim(); if (!q) { toast('Type something to ask'); return; }
      chat.push({ r: 'me', t: q }); chat.push({ r: 'ai', t: '…' }); askSheet();
      return call('ask', [q], function (res) {
        chat.pop(); chat.push({ r: 'ai', t: res.reply });
        res.done.forEach(function (d) { chat.push({ r: 'done', t: d }); });
        chat = chat.slice(-20); save('chat-' + KEY.slice(0, 6), chat);
        apply(res.state);
        if (res.startJob) { chat.push({ r: 'done', t: 'Ready to start: ' + res.startJob.name }); plan = res.startJob; closeSheet(); renderAll(); showTab('chores'); return; }
        askSheet();
      }, function () { chat.pop(); askSheet(); });
    }
  });

  // ---------- timers, refresh, live games ----------
  setInterval(function () {
    if (!S) return;
    tickTimer();
    if (rest) {
      var left = rest.until - now();
      if (el('restLeft')) el('restLeft').textContent = clock(left);
      if (left <= 0) { endRest(); chime([880, 1175, 1568]); buzz([120, 60, 120]); toast('Rest over. Next set.'); if (document.hidden && swReg && swReg.showNotification) swReg.showNotification('Rest over', { body: 'Next set: you\'ve got this.', tag: 'timer-rest', renotify: true, vibrate: [200, 100, 200] }).catch(function () {}); }
    }
    var tb = el('dotTrain'); if (tb) tb.textContent = rest ? clock(rest.until - now()) : '';
    document.querySelectorAll('[data-due]').forEach(function (x) { x.textContent = dueLabel(+x.getAttribute('data-due')); });
  }, 1000);
  function refresh() {
    if (!S || busy || inflight || parking || !el('sheetbg').hidden || document.visibilityState !== 'visible' || (box && box.pending().length)) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (current === 'train' || current === 'food' || (current === 'play' && (recallGame || tempo))) return;
    rpc('appState', []).then(fresh(apply), function () {});
  }
  function refreshQuiet() { rpc('appState', []).then(fresh(apply), function () {}); }
  setInterval(refresh, 30000);
  // While you're on the word game and your partner is mid-game, watch them live.
  function pollGames() {
    if (current !== 'play' || document.visibilityState !== 'visible' || !S) return;
    var o = S.games.word.other;
    if (playView === 'word' && (!o || !o.done) && Date.now() - lastWordPoll > 4000 && !inflight && !busy) {
      lastWordPoll = Date.now();
      rpc('gamesState', []).then(function (g) { if (current === 'play' && !typed && !recallGame) { S.games = g; renderPlay(); } }, function () {});
    }
  }
  setInterval(pollGames, 5000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });

  // ---------- push notifications (installed app) ----------
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  var swReg = null;
  function enablePush(silent) {
    if (!CFG.firebase || !('serviceWorker' in navigator)) return;
    var V = '10.14.1';
    return Promise.all([loadScript('https://www.gstatic.com/firebasejs/' + V + '/firebase-app-compat.js')]).then(function () {
      return loadScript('https://www.gstatic.com/firebasejs/' + V + '/firebase-messaging-compat.js');
    }).then(function () {
      if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
      return silent ? Notification.permission : Notification.requestPermission();
    }).then(function (perm) {
      if (perm !== 'granted') { if (!silent) toast('Notifications are off. You can turn them on in your phone settings.', true); throw null; }
      return (swReg ? Promise.resolve(swReg) : navigator.serviceWorker.ready).then(function (reg) { swReg = reg; return firebase.messaging().getToken({ serviceWorkerRegistration: reg, vapidKey: CFG.vapidKey || undefined }); });
    }).then(function (token) {
      if (!token) throw new Error('Google gave this phone no push address');
      save('pushTok', String(token).slice(0, 12));
      return rpc('registerDevice', [token, navigator.userAgent.slice(0, 60)]);
    }).then(function () {
      S.push.devices = Math.max(1, S.push.devices || 0); save('pushReg', now()); save('pushErr', null);
      if (!silent) { renderAll(); testPush(); }
      firebase.messaging().onMessage(function (p) { var n = p.notification || p.data || {}; toast((n.title || '') + (n.body ? ': ' + n.body : '')); chime([880, 1175]); refreshQuiet(); });
    }).catch(function (e) {
      if (!e) return;
      var why = (e.code ? e.code + ': ' : '') + (e.message || e);
      save('pushErr', { at: now(), why: String(why).slice(0, 200) });
      if (!silent) toast('Couldn\'t turn on notifications: ' + why, true);
    });
  }
  function pushDetails() {
    var p = S.push, t = function (ms) { var d = new Date(ms); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
    return '<div class="pushinfo small">' +
      '<div>' + (p.devices ? p.devices + ' phone' + (p.devices === 1 ? '' : 's') + ' registered' : '<b class="bad">No phone registered yet</b>') + (p.phones && p.phones.length ? ' · ' + p.phones.map(function (x) { return esc(/iPhone|iPad/.test(x.label) ? 'iPhone' : /Android/.test(x.label) ? 'Android' : /Windows|Macintosh|CrOS/.test(x.label) ? 'Computer' : 'Phone'); }).join(', ') : '') + '</div>' +
      thisPhoneLine(p) +
      (p.lastOk ? '<div>Last delivered: ' + t(p.lastOk) + '</div>' : '<div class="muted">Nothing delivered yet</div>') +
      (p.lastError ? '<div class="bad">Last problem (' + t(p.lastError.at) + '): ' + esc(p.lastError.error) + '</div>' : '') +
      '<div class="muted">On a Pixel: install the app (Chrome menu, Install app), open it from the home screen, tap Turn on. Then in Android Settings, Apps, Nudge, Notifications, make sure they\'re allowed.</div></div>';
  }
  // Is THIS phone one of the registered ones? (Your computer counts as a device too, so "1 registered" can mean the wrong one.)
  function thisPhoneLine(p) {
    var mine = load('pushTok'), err = load('pushErr'), on = mine && (p.phones || []).some(function (x) { return x.tok === mine; });
    if (!('Notification' in window)) return '';
    if (Notification.permission === 'denied') return '<div class="bad">This phone: notifications are blocked in settings</div>';
    if (on) return '<div style="color:var(--good)">This phone: registered</div>';
    return '<div class="bad">This phone: not registered' + (err && err.why ? ' (' + esc(err.why) + ')' : Notification.permission === 'granted' ? '' : '. Tap Turn on') + '</div>';
  }
  function testPush() {
    toast('Sending a test to this phone…');
    rpc('testPush', []).then(function (r) {
      S.push = r.status; renderAll();
      if (r.sent) toast('Sent to ' + r.sent + ' phone' + (r.sent === 1 ? '' : 's') + '. It should pop up in a few seconds (close the app to see it as a notification).');
      else if (!r.status.configured) toast('Notifications aren\'t set up on the server.', true);
      else if (!r.status.devices) toast('This phone isn\'t registered. Tap Turn on.', true);
      else toast('Google didn\'t deliver it: ' + ((r.results[0] && r.results[0].error) || 'no reason given'), true);
    }, function (e) { toast(e.message, true); });
  }

  // ---------- start ----------
  if (MODE === 'web' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; if (window.Notification && Notification.permission === 'granted' && KEY) enablePush(true); }).catch(function () {});
  }
  if (MODE === 'web' && 'serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.updated) { if (!updateOffered) { updateOffered = true; setTimeout(function () { toast('A new version of Nudge is ready.', false, { label: 'Reload', fn: function () { location.reload(); } }); }, 1500); } return; } if (e.data && e.data.tab === 'us' && S && window.NudgeChat) { showTab('home'); if (!NudgeChat.isOpen()) NudgeChat.open(chatApi); return; } if (e.data && e.data.tab && S) { showTab(e.data.tab); if (e.data.deadline && e.data.act) handleNoteAction(e.data.deadline, e.data.act); else refreshQuiet(); } });
  if (!ME) el('nav').querySelectorAll('[data-me]').forEach(function (b) { b.remove(); });
  // the phone tab bar: four main tabs and More (the rest), the same on every screen; computers keep the full sidebar
  var PRIMARY = { me: ['home', 'chores', 'train', 'food'], partner: ['home', 'chores', 'play', 'work'] };
  function setupNav() {
    var nav = el('nav'), prim = PRIMARY[S.who] || PRIMARY.partner;
    nav.querySelectorAll('button[data-tab]').forEach(function (b) { b.classList.toggle('moreonly', prim.indexOf(b.dataset.tab) === -1 && !b.classList.contains('desk')); });
    if (!el('navMore')) {
      var m = document.createElement('button'); m.type = 'button'; m.id = 'navMore'; m.className = 'phone'; m.setAttribute('aria-haspopup', 'dialog');
      m.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>More';
      var sep = nav.querySelector('.navsep'); nav.insertBefore(m, sep || null);
    }
  }
  function moreSheet() {
    var prim = PRIMARY[S.who] || PRIMARY.partner, items = [];
    el('nav').querySelectorAll('button[data-tab]').forEach(function (b) { if (prim.indexOf(b.dataset.tab) === -1) items.push('<button class="moreitem' + (current === b.dataset.tab ? ' on' : '') + '" type="button" data-moretab="' + b.dataset.tab + '">' + b.innerHTML.replace(/<span class="dot"[^>]*>.*?<\/span>/, '') + '</button>'); });
    items.push('<a class="moreitem" href="' + esc(boothUrl('menu')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>Booth (DJ)</a>');
    openSheet('<h2 style="margin:0 0 12px">More</h2><div class="moregrid">' + items.join('') + '</div>');
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('#navMore, [data-moretab]'); if (!t || !S) return;
    if (t.id === 'navMore') return moreSheet();
    closeSheet(); showTab(t.dataset.moretab);
  });
  /** Home-screen shortcuts and share-to-Nudge land here: #food:log, #food:share, #home:weigh, #train:start. */
  function shortcut(tab, what) {
    if (what === 'share') return takeShare();
    if (what === 'log') { var q = el('quickText'); if (q && !q.disabled) q.focus(); else toast('Add your Claude API key in You, Settings to describe food'); return; }
    if (what === 'weigh') { var w = el('weighText'); if (w) { w.scrollIntoView({ block: 'center' }); w.focus(); } else toast('Weight is already in for today'); return; }
    if (what === 'start') { var st = document.querySelector('#tab-train [data-wk="start"], #tab-train .btn.primary'); if (st) st.scrollIntoView({ block: 'center' }); }
  }
  window.addEventListener('hashchange', function () {
    var m = location.hash.match(/^#(\w+):(\w+)$/); if (!m || !S) return;
    history.replaceState(null, '', location.pathname + location.search + '#' + m[1]);
    showTab(m[1]); setTimeout(function () { shortcut(m[1], m[2]); }, 200);
  });
  function boot() {
    if (!S) return;
    ME = S.who === 'me';
    if (!ME) el('nav').querySelectorAll('[data-me]').forEach(function (b) { b.remove(); });
    setupNav();
    renderAll();
    setTimeout(startChat, 1200);   // receipts, the unread count and live scores, in the background
    var hash = location.hash.replace('#', ''), sub = '';
    if (hash.indexOf(':') > 0) { sub = hash.split(':')[1]; hash = hash.split(':')[0]; history.replaceState(null, '', location.pathname + location.search + '#' + hash); }
    if (!ME && /^(food|train)$/.test(hash)) hash = 'home';
    showTab(['home', 'chores', 'work', 'play', 'train', 'food', 'health', 'you', 'custom', 'empire'].indexOf(hash) !== -1 ? hash : (window.LQ_TAB || load('tab') || 'home'));
    if (hash === 'djset') {   // straight to the first-version DJ game
      playView = 'mix'; save('playView', 'mix'); showTab('play');
      history.replaceState(null, '', location.pathname + location.search + '#play');
      setTimeout(openSet, 300);
    }
    var na = location.hash.match(/dl=(\w+):(\w+)/);
    if (na) { history.replaceState(null, '', location.pathname + location.search + '#home'); setTimeout(function () { handleNoteAction(na[1], na[2]); }, 400); }
    // setup comes first: anyone who hasn't finished it gets the wizard before anything else
    var needSetup = S.setup && !S.setup.done && window.NudgeSetup;
    if (needSetup) setTimeout(function () { if (!NudgeSetup.isOpen()) NudgeSetup.open({ required: true }); }, 200);
    else if (hash === 'us') setTimeout(function () { if (window.NudgeChat) NudgeChat.open(chatApi); }, 600);
    else if (sub) setTimeout(function () { shortcut(hash, sub); }, 350);
    else if (hash !== 'djset') setTimeout(intro, 250);
    maybeBrief();
    try { if (JSON.parse(localStorage.getItem('booth-mastered') || '""') && S.wardrobe && !(S.wardrobe.ach || {}).booth1) rpc('unlockAch', ['booth1']).then(function (res) { apply(res); toast('Unlocked: Gold DJ headphones'); }, function () {}); } catch (e) {}
  }
  if (!KEY) {
    el('tab-home').innerHTML = '<div class="loading"><h2>Open your app link</h2><p class="muted">Paste your link from the Config tab of your Google Sheet (Your app link, or Partner app link). It has your private key in it.</p>' +
      '<form class="inline" id="linkForm" autocomplete="off" style="margin-top:16px"><input type="text" id="linkText" placeholder="Paste your link" aria-label="Your app link"><button class="btn primary" type="submit">Open</button></form></div>';
    el('tab-home').hidden = false;
    el('nav').hidden = true;
    el('linkForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = el('linkText').value.trim(), m = v.match(/key=([A-Za-z0-9]+)/) || v.match(/^([A-Za-z0-9]{20,})$/);
      if (!m) { toast('That doesn\'t look like your link. It ends in ?key= and a long code.', true); return; }
      save('key', m[1]); location.href = location.pathname + '?key=' + m[1];
    });
  } else if (S) {
    boot();
    if (MODE === 'web') refreshQuiet();
  } else {
    el('tab-home').innerHTML = '<div class="skel" aria-label="Loading"><div class="sk h"></div><div class="sk c1"></div><div class="sk c2"></div><div class="sk c3"></div></div>';
    el('tab-home').hidden = false;
    rpc('appState', []).then(function (res) { S = res; offset = res.now - Date.now(); save('state-' + KEY.slice(0, 6), S); boot(); }, function (e) {
      el('tab-home').innerHTML = '<div class="loading"><h2>Couldn\'t load</h2><p class="muted">' + esc(e.message) + '</p><button class="btn primary" type="button" onclick="location.reload()">Try again</button></div>';
    });
  }
})();
