/* Life Quest: the app. Runs as the installable app (talks to Apps Script over
 * HTTPS) or inside the Google page (google.script.run). Same code for both. */
(function () {
  'use strict';

  // ---------- connection ----------
  var mem = {};
  var CFG = window.LQ_CONFIG || {};
  var MODE = window.google && google.script && google.script.run ? 'gas' : 'web';
  var KEY = window.LQ_KEY || new URLSearchParams(location.search).get('key') || load('key') || '';
  if (KEY) save('key', KEY);
  var S = window.LQ_BOOT || load('state-' + KEY.slice(0, 6)) || null;
  var ME = S ? S.who === 'me' : true;
  var offset = S && S.now ? S.now - Date.now() : 0;
  var busy = false, inflight = 0, current = 'home';

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
  function call(fn, args, ok, fail) {
    busy = true;
    rpc(fn, args).then(function (res) { busy = false; ok && ok(res); }, function (err) { busy = false; fail && fail(); toast(err.message || String(err), true); renderAll(); });
  }

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
  function greeting() { var hr = new Date(now()).getHours(); return hr < 5 ? 'Late one' : hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening'; }

  var ICONS = {
    home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5', list: 'M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17',
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
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4', pulse: 'M3 12h4l2-5 4 10 2-5h6', walk: 'M13 5.5a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M8 12l3-4 4 2 2 3M11 8l-3 1-1 3', bolt: 'M13 3 5 14h6l-1 7 8-11h-6z', wave: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0'
  };
  function icon(n, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[n] || '') + '"/></svg>'; }
  var BADGE_ICON = { 'first-quest': 'check', 'quests-25': 'home', 'quests-100': 'home', 'streak-3': 'flame', 'streak-7': 'flame', 'streak-30': 'flame', 'streak-100': 'flame',
    'gym-1': 'dumbbell', 'gym-10': 'dumbbell', 'gym-50': 'dumbbell', pr: 'trophy', 'weigh-8': 'scale', 'routine-7': 'sun', 'protein-7': 'food', 'cover-5': 'heart', 'hi5-10': 'heart', brain: 'bulb', 'level-5': 'star', 'level-10': 'star', 'create-1': 'music', 'create-20': 'disc', 'chest-7': 'gift', boost: 'bolt' };

  var toastTimer;
  function toast(msg, isErr) {
    var t = el('toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = isErr ? 'err' : ''; }, isErr ? 6000 : 2800);
  }
  var audio;
  document.addEventListener('pointerdown', function () {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {}
  }, { capture: true });
  function chime(notes) {
    if (!audio || (S && S.fun && S.fun.prefs && S.fun.prefs.sound === false)) return;
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
    if (b.level.level > a.level.level) {
      confetti(true); chime([660, 880, 1100, 1320]); buzz([60, 40, 60, 40, 120]);
      openSheet('<div class="center" style="padding:10px 0 4px">' + icon('star', 'l') + '<h2 style="margin:8px 0 4px">Level ' + b.level.level + '</h2><p class="muted">' + fmt(b.total) + ' XP so far. Nicely done.</p><button class="btn primary wide" type="button" data-close>Continue</button></div>');
    } else if (a.xpToday < a.goal && b.xpToday >= b.goal) {
      confetti(true); chime([660, 880, 1100]); buzz([50, 40, 120]);
      toast('Daily goal reached. Streak: ' + b.streak.count + ' day' + (b.streak.count === 1 ? '' : 's'));
    } else if (b.xpToday > a.xpToday) {
      confetti(false); chime([880, 1175]); buzz(25);
    }
    var seen = load('badges-' + S.who);
    var list = seen || [];
    b.badges.forEach(function (bd) { if (bd.earned && list.indexOf(bd.id) === -1) { list.push(bd.id); if (seen) toast('New badge: ' + bd.name); } });
    save('badges-' + S.who, list);
  }
  function apply(res, msg) {
    var prev = S;
    S = res; ME = S.who === 'me';
    offset = res.now - Date.now();
    save('state-' + KEY.slice(0, 6), S);
    celebrate(prev, S);
    renderAll();
    if (msg) toast(msg);
  }
  // Quick taps: update the screen now, save in the background, undo if it fails.
  function quick(change, fn, args, msg) {
    var before = JSON.stringify(S);
    change();
    renderAll();
    if (msg) toast(msg);
    inflight++;
    rpc(fn, args).then(function (res) {
      inflight--;
      if (!inflight && !busy && res && res.game) { S = res; offset = res.now - Date.now(); save('state-' + KEY.slice(0, 6), S); renderAll(); }
    }, function (err) { inflight--; S = JSON.parse(before); renderAll(); toast(err.message || String(err), true); });
  }
  function addXpLocal(xp) {
    if (boostLeft()) xp *= 2;
    var prev = JSON.parse(JSON.stringify(S));
    S.game.xpToday += xp; S.game.total += xp; S.game.balance += xp;
    var into = S.game.level.into + xp;
    if (into >= S.game.level.need) S.game.level = { level: S.game.level.level + 1, into: into - S.game.level.need, need: S.game.level.need + 100 };
    else S.game.level.into = into;
    if (prev.game.xpToday < prev.game.goal && S.game.xpToday >= S.game.goal) S.game.streak.count += 1;
    celebrate(prev, S);
  }

  // ---------- HOME ----------
  function questRow(q, opts) {
    opts = opts || {};
    var meta = q.doneToday ? ['Done' + (q.doneBy ? ' by ' + (q.doneBy === S.who ? 'you' : names().other) : '')] : [q.minutes + ' min', q.xp + ' XP'];
    if (!q.doneToday && q.overdue > 0) meta.push(q.overdue + (q.overdue === 1 ? ' day' : ' days') + ' over');
    var theirs = q.who !== 'anyone' && q.who !== S.who;
    if (theirs && !q.doneToday) meta.unshift(names().other + '\'s, cover for bonus XP');
    var claim = '';
    if (!q.doneToday && opts.claim) {
      if (q.claimedBy === S.who) claim = '<button class="btn blush sm" type="button" data-claim="' + esc(q.name) + '">Mine</button>';
      else if (q.claimedBy) claim = '<span class="chip pink">' + esc(names().other) + '</span>';
      else claim = '<button class="iconbtn" type="button" data-claim="' + esc(q.name) + '" aria-label="Claim">' + icon('flag', 's') + '</button>';
    }
    return '<div class="item' + (q.doneToday ? ' done' : '') + '"><button class="check" type="button" data-qdone="' + esc(q.name) + '"' + (q.doneToday ? ' disabled' : '') + ' aria-label="Mark done">' + icon('check') + '</button>' +
      '<div class="grow"><div class="t">' + esc(q.name) + '</div><div class="m">' + esc(meta.join(' · ')) + '</div></div>' +
      (!q.doneToday ? '<div class="row" style="gap:6px">' + claim + '<button class="iconbtn soft" type="button" data-qstart="' + esc(q.name) + '" aria-label="Start a timer">' + icon('play', 's') + '</button></div>' : '') + '</div>';
  }

  function renderHome() {
    var g = S.game, n = names(), h = '', parts = {};
    function seg(id) { parts[id] = h; h = ''; }
    var d = new Date(now());
    h += '<div class="top"><div><h1>' + greeting() + (n.me ? ', ' + esc(n.me) : '') + '</h1><div class="sub">' +
      d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + (S.fun && S.fun.era ? ' · ' + esc(S.fun.era) : '') + '</div></div>' + meButton() + '</div>';
    if (MODE === 'gas' && S.fun && S.fun.appBase) h += '<a class="getapp" target="_top" href="' + esc(S.fun.appBase + '?key=' + KEY) + '">' + icon('download') + '<span class="grow"><b>Get the app</b><br><span class="small muted">Notifications, live games, faster</span></span>' + icon('chevron', 's') + '</a>';
    h += boostBanner() + wrappedCard();
    if (S.chores.invite) h += '<div class="note">' + esc(n.other) + ' wants company for chores. Pick a job in Chores.</div>';
    if (g.streak.frozeYesterday) h += '<div class="note">A streak freeze covered yesterday. Your streak is safe.</div>';

    seg('header');
    // brief
    if (S.brief && S.brief.brief) h += '<section class="card tint"><div class="eyebrow" style="color:var(--lilac);display:flex;gap:6px;align-items:center">' + icon('sparkles', 's') + 'Today</div><p class="brief" style="margin:8px 0 10px">' + esc(S.brief.brief) + '</p>' +
      (S.brief.first ? '<div class="row small"><span class="chip lilac">First move</span><span>' + esc(S.brief.first) + '</span></div>' : '') + '</section>';

    seg('brief');
    h += '<button class="askbar" type="button" id="openAsk">' + icon('sparkles') + '<span class="grow">Ask anything, or tell me what\'s on your mind</span>' + icon('chevron', 's') + '</button>';

    seg('ask');
    h += '<section class="card"><div class="hero"><div class="ring" style="width:104px;height:104px">' + ring(g.xpToday / g.goal, 104, 10) +
      '<div class="t"><div><div class="num" style="font-size:24px;font-weight:700">' + g.xpToday + '</div><div class="tiny muted">of ' + g.goal + ' XP</div></div></div></div><div class="grow">' +
      '<div class="stat"><span class="row" style="gap:6px">' + icon('flame', 's') + 'Streak</span><b>' + g.streak.count + ' day' + (g.streak.count === 1 ? '' : 's') + (g.streak.freezes ? ' · ' + g.streak.freezes + ' freeze' + (g.streak.freezes > 1 ? 's' : '') : '') + '</b></div>' +
      '<div class="stat"><span class="row" style="gap:6px">' + icon('heart', 's') + esc(n.team) + '</span><b>' + g.team.count + ' day' + (g.team.count === 1 ? '' : 's') + '</b></div>' +
      '<div class="stat"><span>' + esc(n.other) + ' today</span><b>' + g.otherXpToday + ' XP</b></div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + Math.round(g.level.into / g.level.need * 100) + '%"></i></div><div class="tiny muted" style="margin-top:4px">Level ' + g.level.level + ' · ' + (g.level.need - g.level.into) + ' XP to the next</div>' +
      '</div></div></section>';
    seg('ring');
    h += challengesCard();
    seg('challenges');

    h += '<button class="btn primary big wide" type="button" id="whatNow" style="margin-bottom:12px">' + icon('sparkles') + 'What should I do now?</button>';

    seg('whatnow');
    S.routines.routines.filter(function (r) { return r.showNow && !r.finished && r.steps.length; }).forEach(function (r) {
      h += '<section class="card"><div class="head"><div class="row" style="gap:8px">' + icon(r.name === 'Evening' ? 'moon' : 'sun') + '<h3>' + esc(r.name) + ' routine</h3></div><span class="muted small num">' + r.done.length + '/' + r.steps.length + '</span></div>' +
        r.steps.map(function (s, i) { var dn = r.done.indexOf(i) !== -1; return '<div class="item' + (dn ? ' done' : '') + '"><button class="check" type="button" data-routine="' + esc(r.name) + '" data-ri="' + i + '" aria-label="Done">' + icon('check') + '</button><div class="t grow" style="font-weight:500">' + esc(s) + '</div></div>'; }).join('') + '</section>';
    });

    seg('routine');
    if (ME && S.today.gym) {
      var gy = S.today.gym, leave = '';
      if (gy.leaveAt && !gy.done) {
        var p = gy.leaveAt.split(':'), dt = new Date(now()); dt.setHours(+p[0], +p[1], 0, 0);
        var mins = Math.round((dt.getTime() - now()) / 60000);
        if (mins > 0 && mins < 300) leave = 'Leave in ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' : '') + (mins % 60) + 'm';
      }
      h += '<section class="card blush"><div class="between"><div><div class="eyebrow" style="color:var(--pink)">Gym today</div><h2 style="margin-top:4px">' + esc(gy.session) + '</h2><div class="small muted row" style="gap:6px;margin-top:4px">' +
        (gy.travel ? icon(gy.travel === 'Bike' ? 'bike' : 'bus', 's') + esc(gy.travel) + ' · leave ' + esc(gy.leaveAt) : 'Plan arrives at 6am') + '</div>' + (leave ? '<div class="small" style="font-weight:650;margin-top:4px">' + leave + '</div>' : '') + '</div>' +
        (gy.done ? '<span class="chip good">' + icon('check', 's') + 'Done</span>' : '<div class="stack right"><button class="btn primary sm" type="button" data-goto="train">Log it</button><button class="btn ghost sm" type="button" data-goto="train" style="padding:4px 8px">Change</button></div>') + '</div></section>';
    }

    seg('gym');
    var mine = S.quests.board.filter(function (q) { return q.who === 'anyone' || q.who === S.who; });
    var open = mine.filter(function (q) { return !q.doneToday; });
    h += '<section class="card"><div class="head"><h3>Today\'s chores <span class="muted num" style="font-weight:500">' + (mine.length - open.length) + '/' + mine.length + '</span></h3><button class="btn ghost sm" type="button" data-goto="chores">All' + icon('chevron', 's') + '</button></div>' +
      (open.length ? open.slice(0, 4).map(function (q) { return questRow(q); }).join('') : '<p class="empty">All done. Anything more is a bonus.</p>') + '</section>';

    seg('chores');
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
    h += creativeCard(); seg('make');
    h += usCard(); seg('us');
    h += '<section class="card"><div class="head"><h3>' + esc(n.other) + '</h3><button class="btn soft sm" type="button" id="nudge">' + icon('send', 's') + 'Nudge</button></div>';
    var feed = S.game.feed.slice(0, 6);
    h += feed.length ? feed.map(function (f) {
      var own = f.who === S.who, sent = f.hi5.indexOf(S.who) !== -1;
      return '<div class="item">' + avatar(charOf(f.who), 30) + '<div class="grow small"><b>' + esc(own ? 'You' : n.other) + '</b> ' + esc(f.text) + (f.hi5.length ? ' <span class="muted">· high-fived</span>' : '') + '</div>' +
        (!own ? '<button class="btn ' + (sent ? 'line' : 'blush') + ' sm" type="button" data-hi5="' + esc(f.id) + '"' + (sent ? ' disabled' : '') + '>' + icon('heart', 's') + (sent ? 'Sent' : 'High-five') + '</button>' : '') + '</div>';
    }).join('') : '<p class="empty">Nothing yet today.</p>';
    h += '</section>';
    seg('feed');
    h = parts.header + homeOrder().filter(function (x) { return !x.hide; }).map(function (x) { return parts[x.id] || ''; }).join('');
    el('tab-home').innerHTML = h;
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
      '<section class="card focus"><div class="eyebrow">' + (s.taster ? 'Just five minutes' : 'Only this') + '</div><h2 style="margin:6px 0 2px">' + esc(s.task) + '</h2>' +
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
  function planView() {
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
    h += '<section class="card"><div class="head"><h3>Together</h3><button class="btn ghost sm" type="button" id="askJoin">' + icon('send', 's') + 'Ask ' + esc(n.other) + ' to join</button></div><div class="duo" id="duo">' + duo() + '</div></section>';
    if (s) { el('tab-chores').innerHTML = h + focusView(s); return; }
    if (plan) { el('tab-chores').innerHTML = h + planView(); return; }
    if (S.chores.invite) h += '<div class="note">' + esc(n.other) + ' wants company. Start a job and do it together.</div>';
    h += '<div class="seg" role="tablist">' + [['today', 'Today'], ['schedule', 'Schedule']].map(function (o) { return '<button type="button" data-cview="' + o[0] + '" aria-pressed="' + (choresView === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (choresView === 'schedule') { el('tab-chores').innerHTML = h + scheduleView(); return; }
    h += '<section class="card"><div class="head"><h3>Today</h3><span class="muted small num">' + q.board.filter(function (x) { return x.doneToday; }).length + '/' + q.board.length + '</span></div>' +
      (q.board.length ? q.board.map(function (x) { return questRow(x, { claim: true }); }).join('') : '<p class="empty">Nothing due today.</p>') + '</section>';
    if (q.more.length) h += '<section class="card"><details><summary class="small muted" style="cursor:pointer">Also due (' + q.more.length + '), only if you feel like it</summary><div style="margin-top:8px">' + q.more.map(function (x) { return questRow(x, { claim: true }); }).join('') + '</div></details></section>';
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
        return '<button class="item" type="button" data-edit="' + esc(q.name) + '" style="width:100%;text-align:left;border-radius:0"><div class="grow"><div class="t" style="font-weight:550">' + esc(q.name) + '</div><div class="m">' + esc(q.label) + ' · ' + q.minutes + ' min' + (q.who !== 'anyone' ? ' · ' + (q.who === S.who ? 'you' : names().other) : '') + '</div></div><div class="day">' + (q.due ? '<span class="chip pink">Due</span>' : esc(dayLabel(q.next))) + '</div>' + icon('chevron', 's') + '</button>';
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
    h += '<section class="card"><div class="vs"><div>' + avatar(charOf(S.who), 40) + '<div class="small muted">You</div><div class="num" style="font-size:28px;font-weight:700">' + G.stats.you + '</div></div><div class="center small muted">head to head<br><span class="tiny">' + G.stats.draws + ' draws</span></div><div class="right">' + avatar(charOf(S.who === 'me' ? 'partner' : 'me'), 40, true) + '<div class="small muted">' + esc(n.other) + '</div><div class="num" style="font-size:28px;font-weight:700">' + G.stats.them + '</div></div></div></section>';
    h += '<div class="seg">' + [['word', 'Word'], ['target', 'Numbers'], ['recall', 'Recall'], ['tempo', 'Tempo'], ['stats', 'Stats']].map(function (o) { return '<button type="button" data-pview="' + o[0] + '" aria-pressed="' + (playView === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (playView === 'word') h += wordView(G.word, n);
    else if (playView === 'target') h += targetView(G.target, n);
    else if (playView === 'recall') h += recallView(G.recall, n);
    else if (playView === 'tempo') h += tempoView(G.tempo, n);
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
  var tsel = null, rest = null;
  function draftKey() { return 'wk-' + (S.today ? S.today.date : '') + '-' + tsel; }
  function draft() { return load(draftKey()) || {}; }
  function saveDraft(d) { save(draftKey(), d); }
  function setRow(key, label, sub, d, o) {
    var done = d[key] && d[key].done;
    var reps = d[key] && d[key].reps !== undefined ? d[key].reps : o.reps;
    var weight = d[key] && d[key].weight !== undefined ? d[key].weight : o.weight;
    return '<div class="set' + (done ? ' done' : '') + '"><span class="n">' + o.n + '</span>' +
      (o.editWeight ? '<input type="number" inputmode="decimal" step="0.5" value="' + (weight === null || weight === undefined ? '' : weight) + '" placeholder="kg" data-w="' + key + '" aria-label="Weight">' : '<span class="w">' + label + (sub ? ' <span class="' + (o.amrap ? 'amrap' : 'muted') + '" style="font-weight:500">' + sub + '</span>' : '') + '</span>') +
      '<div class="stepper"><button type="button" data-r="' + key + '" data-d="-1" aria-label="One rep fewer">−</button><span>' + reps + '</span><button type="button" data-r="' + key + '" data-d="1" aria-label="One rep more">+</button></div>' +
      '<button class="check' + (done ? ' on' : '') + '" type="button" data-set="' + key + '" data-rest="' + esc(o.rest) + '" aria-label="Set done">' + icon('check') + '</button></div>';
  }
  function spark(vals) {
    if (vals.length < 2) return '';
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * 300).toFixed(1) + ',' + (40 - (mx === mn ? .5 : (v - mn) / (mx - mn)) * 34).toFixed(1); }).join(' ');
    return '<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="var(--ring-b)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function renderTrain() {
    if (!ME) return;
    var t = S.train;
    if (!tsel || !t.plans[tsel]) tsel = load('tsel-' + S.today.date) || t.today || t.sessions[0];
    var p = t.plans[tsel], d = draft(), h = '<div class="top"><div><h1>Train</h1><div class="sub">' + (t.today ? 'Today: ' + esc(t.today) : 'Rest day. Train any session you like.') + '</div></div>' + meButton() + '</div>';
    if (rest) h += '<div class="rest"><span>Rest <b id="restLeft">' + clock(rest.until - now()) + '</b></span><button type="button" id="restSkip">Skip</button></div>';
    h += '<div class="chips" style="margin-bottom:14px">' + t.sessions.map(function (s) { return '<button class="chip" type="button" data-tsel="' + esc(s) + '" aria-pressed="' + (s === tsel) + '" style="padding:8px 14px;font-size:14px">' + esc(s) + '</button>'; }).join('') + '</div>';
    if (t.doneToday) h += '<div class="note">Today\'s workout is logged. Great work.</div>';
    else {
      if (tsel !== t.today) h += '<div class="swap"><div class="grow"><b>Doing ' + esc(tsel) + ' today?</b><div class="tiny muted">' + (t.today ? 'Planned: ' + esc(t.today) : 'Today is a rest day') + '. Switching moves your calendar and gym task too.</div></div><button class="btn primary sm" type="button" data-setsession="' + esc(tsel) + '">Switch</button></div>';
      else if (t.changed) h += '<div class="swap"><div class="grow small">Changed from ' + (t.planned ? esc(t.planned) : 'a rest day') + '.</div><button class="btn line sm" type="button" data-setsession="' + esc(t.planned) + '" data-undo="1">Undo</button></div>';
      var hints = [];
      if (t.next && t.next !== tsel) hints.push('<button class="chip lilac" type="button" data-tsel="' + esc(t.next) + '">Next in order: ' + esc(t.next) + '</button>');
      if (t.today) hints.push('<button class="chip" type="button" data-setsession="" data-rest="1">Make today a rest day</button>');
      if (S.health && S.health.readiness) hints.unshift('<span class="chip ' + (S.health.readiness.score >= 80 ? 'good' : S.health.readiness.score >= 60 ? 'lilac' : 'pink') + '">' + icon('bolt', 's') + 'Readiness ' + S.health.readiness.score + '</span>');
      if (hints.length) h += '<div class="chips" style="margin:-4px 0 14px">' + hints.join('') + '</div>';
    }
    p.main.forEach(function (m) {
      h += '<section class="card"><div class="head"><div><div class="eyebrow">' + (m.tier === 'T1' ? 'Main lift' : 'Second lift') + '</div><h2 style="margin-top:2px">' + esc(m.exercise) + '</h2></div>' + (m.tm ? '<span class="chip pink">TM ' + m.tm + ' kg</span>' : '') + '</div>';
      if (!m.tm) {
        h += '<p class="small muted" style="margin:0 0 10px">Set a training max for ' + esc(m.basedOn) + ': enter a set you did recently with good form.</p><form class="inline" data-tm="' + esc(m.basedOn) + '"><input type="number" inputmode="decimal" placeholder="kg" aria-label="Weight"><input type="number" inputmode="numeric" placeholder="reps" aria-label="Reps"><button class="btn primary" type="submit">Set</button></form>';
      } else {
        h += m.sets.map(function (s, i) { return setRow(m.tier + '|' + m.exercise + '|' + i, s.weight + ' kg', '× ' + s.reps + (s.amrap ? '+' : '') + ' · ' + s.pct + '%', d, { n: i + 1, reps: s.reps, rest: m.rest, amrap: s.amrap }); }).join('') +
          (m.tier === 'T1' ? '<p class="tiny muted" style="margin:8px 0 0">Sets marked <span class="amrap">+</span>: as many good reps as you can. The heavy one sets next week\'s training max.</p>' : '');
      }
      h += '</section>';
    });
    p.accessories.forEach(function (a) {
      var low = (String(a.reps).match(/\d+/) || [8])[0];
      h += '<section class="card"><div class="head"><div><div class="eyebrow">' + esc(a.sets) + ' × ' + esc(a.reps) + (a.rpe ? ' · RPE ' + esc(a.rpe) : '') + ' · rest ' + esc(a.rest) + '</div><h3 style="margin-top:2px">' + esc(a.exercise) + '</h3></div></div>' +
        (a.bumped ? '<p class="small" style="margin:0 0 6px;color:var(--good)">Top of the range last time: try ' + a.suggest + ' kg</p>' : a.lastWeight ? '<p class="small muted" style="margin:0 0 6px">Last time ' + a.lastWeight + ' kg × ' + a.lastReps.join(', ') + '</p>' : '') +
        Array.apply(null, Array(a.sets)).map(function (_, i) { return setRow('Acc|' + a.exercise + '|' + i, '', '', d, { n: i + 1, reps: +low, rest: a.rest, editWeight: true, weight: a.suggest }); }).join('') + '</section>';
    });
    var count = Object.keys(d).filter(function (k) { return d[k].done; }).length;
    h += '<button class="btn primary big wide" type="button" id="finishWk"' + (count ? '' : ' disabled') + '>Finish workout · ' + count + ' set' + (count === 1 ? '' : 's') + '</button>';
    var pr = t.progress;
    h += '<section class="card" style="margin-top:14px"><div class="head"><h3>Progress</h3><span class="small muted">' + pr.workouts + ' workout' + (pr.workouts === 1 ? '' : 's') + '</span></div>' + pr.lifts.map(function (l) {
      var last = l.tmHistory.filter(function (x) { return x.reps; }).slice(-1)[0];
      return '<div class="item" style="display:block"><div class="between"><div><div class="t">' + esc(l.lift) + '</div><div class="m">' + (l.best ? 'Best est. 1RM ' + Math.round(l.best) + ' kg' : 'No sets yet') + (last ? ' · last heavy set ' + last.reps + ' reps' : '') + '</div></div><div class="num" style="font-size:20px;font-weight:700">' + (l.tm ? l.tm + '<span class="tiny muted"> kg</span>' : '–') + '</div></div>' + spark(l.tmHistory.map(function (x) { return x.tm; })) + '</div>';
    }).join('');
    if (pr.weeks.length) { var mx = Math.max.apply(null, pr.weeks.map(function (w) { return w.volume; })) || 1; h += '<div class="eyebrow" style="margin-top:12px">Weekly volume</div><div class="vol">' + pr.weeks.map(function (w) { return '<div title="' + esc(w.week) + '" style="height:' + Math.max(4, w.volume / mx * 100) + '%"></div>'; }).join('') + '</div>'; }
    h += '</section>';
    el('tab-train').innerHTML = h;
  }
  function finishWorkout() {
    var d = draft(), p = S.train.plans[tsel], sets = [];
    p.main.forEach(function (m) { m.sets.forEach(function (s, i) { var k = m.tier + '|' + m.exercise + '|' + i; if (d[k] && d[k].done) sets.push({ exercise: m.exercise, tier: m.tier, set: i + 1, weight: s.weight, reps: d[k].reps, target: s.reps + (s.amrap ? '+' : '') }); }); });
    p.accessories.forEach(function (a) { for (var i = 0; i < a.sets; i++) { var k = 'Acc|' + a.exercise + '|' + i; if (d[k] && d[k].done) sets.push({ exercise: a.exercise, tier: 'Acc', set: i + 1, weight: d[k].weight === null || d[k].weight === undefined ? (a.suggest || 0) : d[k].weight, reps: d[k].reps, target: a.reps }); } });
    call('saveWorkout', [tsel, sets], function (res) {
      save(draftKey(), null); rest = null;
      apply(res.state);
      confetti(true); chime([660, 880, 1100, 1320]); buzz([60, 40, 60, 40, 150]);
      var h = '<div class="center">' + icon('trophy', 'l') + '<h2 style="margin:8px 0">Workout logged</h2></div>';
      res.changes.forEach(function (c) { h += '<section class="card tint">' + '<b>' + esc(c.lift) + '</b>: ' + c.reps + ' reps on the heavy set<br>' + (c.change ? 'Training max ' + c.from + ' → <b>' + c.to + ' kg</b>' : 'Training max stays at ' + c.from + ' kg. Go again next week.') + '</section>'; });
      res.prs.slice(0, 3).forEach(function (r) { h += '<section class="card blush"><b>New record.</b> ' + esc(r.exercise) + ' ' + r.weight + ' kg × ' + r.reps + ' (est. 1RM ' + Math.round(r.e1rm) + ' kg)</section>'; });
      openSheet(h + '<button class="btn primary wide" type="button" data-close>Done</button>');
    });
  }

  // ---------- FOOD ----------
  var pending = [], ideas = null;
  function itemsText(items) { return items.map(function (i) { return i.name; }).join(', ') + ' (+' + fmt(items.reduce(function (s, i) { return s + i.kcal; }, 0)) + ' kcal, ' + fmt(items.reduce(function (s, i) { return s + i.protein; }, 0)) + 'g)'; }
  function renderFood() {
    if (!ME) return;
    var F = S.food, t = F.targets, kcal = F.totals.kcal, prot = F.totals.protein;
    pending.forEach(function (p) { kcal += p.kcal; prot += p.protein; });
    var kl = t.kcal - kcal, pl = t.proteinMin - prot, scale = t.proteinMax * 1.15;
    var h = '<div class="top"><div><h1>Food</h1><div class="sub">' + fmt(kcal) + ' kcal · ' + fmt(prot) + 'g protein so far</div></div>' + meButton() + '</div>';
    h += '<section class="card"><div class="eyebrow">Calories</div><div class="between" style="align-items:baseline"><div><span class="big">' + fmt(kcal) + '</span> <span class="of">/ ' + fmt(t.kcal) + '</span></div><div class="left ' + (kl >= 0 ? 'good' : 'warn') + '">' + (kl >= 0 ? fmt(kl) + ' left' : fmt(-kl) + ' over') + '</div></div>' +
      '<div class="bar' + (kl < 0 ? ' over' : '') + '" style="margin:8px 0 16px"><i style="width:' + Math.min(100, kcal / t.kcal * 100) + '%"></i></div>' +
      '<div class="eyebrow">Protein</div><div class="between" style="align-items:baseline"><div><span class="big">' + fmt(prot) + 'g</span> <span class="of">/ ' + t.proteinMin + '–' + t.proteinMax + 'g</span></div><div class="left ' + (pl > 0 ? '' : 'good') + '">' + (pl > 0 ? fmt(pl) + 'g to go' : prot > t.proteinMax ? 'Above range' : 'In range') + '</div></div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + Math.min(100, prot / scale * 100) + '%"></i><span class="zone" style="left:' + (t.proteinMin / scale * 100) + '%;width:' + ((t.proteinMax - t.proteinMin) / scale * 100) + '%"></span></div></section>';
    h += '<section class="card"><form class="inline" id="quick" autocomplete="off"><input type="text" id="quickText" placeholder="2 protein weetabix and 200ml milk" aria-label="What did you eat?"' + (F.hasClaudeKey ? '' : ' disabled') + '><button class="btn primary" id="quickBtn" type="submit"' + (F.hasClaudeKey ? '' : ' disabled') + '>Add</button></form>' +
      '<p class="small muted" style="margin:8px 0 0" id="quickNote">' + (F.hasClaudeKey ? 'Describe it, Claude works out the numbers.' : 'Add your Claude API key in You, Settings to describe food in words.') + '</p>' +
      (F.hasClaudeKey ? '<button class="btn soft wide" type="button" id="ideas" style="margin-top:10px">' + icon('sparkles', 's') + 'What could I eat?</button>' : '') + '</section>';
    if (ideas) h += '<section class="card tint"><div class="head"><h3>Ideas that fit today</h3><button class="iconbtn" type="button" id="ideasClose" aria-label="Close ideas">' + icon('x', 's') + '</button></div>' + ideas.map(function (i, k) {
      return '<div class="item"><div class="grow"><div class="t">' + esc(i.name) + '</div><div class="m">' + i.kcal + ' kcal · ' + i.protein + 'g · ' + esc(i.why) + '</div></div><button class="btn primary sm" type="button" data-idea="' + k + '">Log</button></div>';
    }).join('') + '</section>';
    h += '<div class="grid2" id="presets" style="margin-bottom:12px">' + F.presets.map(function (p, i) { return '<button class="preset" type="button" data-preset="' + i + '">' + esc(p.name) + '<small>' + fmt(p.kcal) + ' kcal · ' + fmt(p.protein) + 'g</small></button>'; }).join('') + '</div>';
    var rows = pending.map(function (p) { return { time: '…', item: p.name, kcal: p.kcal, protein: p.protein, pending: true }; }).concat(F.entries.slice().reverse());
    h += '<section class="card entries"><div class="head"><h3>Today</h3><button class="btn ghost sm" type="button" id="undo"' + (F.entries.length ? '' : ' disabled') + '>' + icon('undo', 's') + 'Undo last</button></div>' +
      (rows.length ? rows.map(function (e) { return '<div class="item' + (e.pending ? ' pending' : '') + '"><span class="tm">' + esc(e.time) + '</span><span class="grow">' + esc(e.item) + '</span><span class="v">' + fmt(e.kcal) + ' · ' + fmt(e.protein) + 'g</span></div>'; }).join('') : '<p class="empty">Nothing yet today.</p>') + '</section>';
    h += '<p class="small muted center">Edit the quick-add buttons and targets in your Sheet.</p>';
    el('tab-food').innerHTML = h;
  }

  // ---------- YOU (profile, lists, rewards, settings) ----------
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (current === 'you') renderYou(); });
  function standalone() { return window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function renderYou() {
    var g = S.game, n = names(), th = document.documentElement.getAttribute('data-theme'), h = '';
    h += '<div class="top"><div class="row"><button class="iconbtn" type="button" data-goto="home" aria-label="Back">' + icon('back') + '</button><h1>You</h1></div></div>';
    h += charCard();
    h += '<button class="btn soft wide" type="button" data-goto="custom" style="margin-bottom:12px">' + icon('sparkles', 's') + 'Customise the app</button>';
    h += '<section class="card tint"><div class="between"><div><div class="eyebrow" style="color:var(--lilac)">Level ' + g.level.level + (S.fun && S.fun.era ? ' · ' + esc(S.fun.era) : '') + '</div><div class="num" style="font-size:28px;font-weight:700">' + fmt(g.total) + ' XP</div></div><div class="right"><div class="eyebrow">To spend</div><div class="num" style="font-size:22px;font-weight:700">' + fmt(g.balance) + '</div></div></div>' +
      '<div class="bar" style="margin-top:10px;background:var(--surface)"><i style="width:' + Math.round(g.level.into / g.level.need * 100) + '%"></i></div><div class="tiny muted" style="margin-top:6px">' + (g.level.need - g.level.into) + ' XP to level ' + (g.level.level + 1) + ' · best streak ' + g.streak.best + (g.streak.best === 1 ? ' day' : ' days') + '</div>' + (S.fun && S.fun.nextEra && S.fun.nextEra !== S.fun.era ? '<div class="tiny muted" style="margin-top:2px">Next era: ' + esc(S.fun.nextEra) + '</div>' : '') + '</section>';
    h += '<button class="wrapped-btn" type="button" data-fun="wrapped">' + icon('wave') + '<span class="grow"><b>Your week, wrapped</b><br><span class="small">The last seven days of ' + esc(n.team) + '</span></span>' + icon('chevron', 's') + '</button>';
    var wk = g.week, mo = g.month, me = S.who, ot = S.who === 'me' ? 'partner' : 'me', mxw = Math.max(wk.me, wk.partner, 1), tot = Math.max(1, mo.me + mo.partner);
    h += '<section class="card"><div class="head"><h3>This week</h3></div>' +
      '<div class="score"><span>You</span><span class="bar"><i style="width:' + (wk[me] / mxw * 100) + '%"></i></span><b class="num right">' + wk[me] + '</b></div>' +
      '<div class="score"><span>' + esc(n.other) + '</span><span class="bar"><i style="width:' + (wk[ot] / mxw * 100) + '%"></i></span><b class="num right">' + wk[ot] + '</b></div>' +
      '<p class="small muted" style="margin:8px 0 0">This month you\'ve done ' + Math.round(mo[me] / tot * 100) + '% of the shared XP.</p></section>';
    h += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('cart', 's') + 'Shopping</h3></div><form class="inline" id="shopForm" autocomplete="off"><input type="text" id="shopText" placeholder="Eggs, bin bags…" aria-label="Add to the list"><button class="btn primary" type="submit">Add</button></form>' +
      (ME && S.food && S.food.totals.protein < S.food.targets.proteinMin ? '<div class="chips" style="margin-top:10px">' + ['Greek yogurt', 'Chicken breast', 'Eggs', 'Tinned tuna', 'Cottage cheese'].map(function (x) { return '<button class="chip pink" type="button" data-addshop="' + x + '">' + icon('plus', 's') + x + '</button>'; }).join('') + '</div>' : '') +
      '<div style="margin-top:6px">' + (S.shopping.length ? S.shopping.map(function (it) { return '<div class="item' + (it.got ? ' done' : '') + '"><button class="check' + (it.got ? ' on' : '') + '" type="button" data-shop="' + esc(it.id) + '" aria-label="Got it">' + icon('check') + '</button><div class="t grow" style="font-weight:500">' + esc(it.item) + '</div></div>'; }).join('') : '<p class="empty">The list is empty.</p>') + '</div></section>';
    h += '<section class="card"><div class="head"><h3 class="row" style="gap:8px">' + icon('gift', 's') + 'Rewards</h3></div>' + g.rewards.map(function (r) {
      return '<div class="item"><div class="grow t" style="font-weight:500">' + esc(r.name) + '</div><button class="btn ' + (g.balance >= r.cost ? 'primary' : 'line') + ' sm" type="button" data-reward="' + esc(r.name) + '"' + (g.balance >= r.cost ? '' : ' disabled') + '>' + r.cost + ' XP</button></div>';
    }).join('') + '<p class="tiny muted" style="margin:8px 0 0">Add your own treats in the Rewards tab of your Sheet. Spending never lowers your level.</p></section>';
    h += '<section class="card"><div class="head"><h3>Badges</h3><span class="small muted">' + g.badges.filter(function (b) { return b.earned; }).length + ' of ' + g.badges.length + '</span></div><div class="badges">' + g.badges.map(function (b) {
      return '<div class="badge' + (b.earned ? '' : ' locked') + '" title="' + esc(b.desc) + '">' + icon(BADGE_ICON[b.id] || 'star', 'l') + esc(b.name) + '</div>';
    }).join('') + '</div></section>';
    h += laterCard();
    // settings
    h += '<section class="card"><div class="head"><h3>Settings</h3></div>';
    h += '<div class="eyebrow" style="margin-bottom:6px">Appearance</div><div class="seg">' + [['light', 'Light'], ['dark', 'Dark'], ['rave', 'Rave'], ['auto', 'Auto']].map(function (o) { return '<button type="button" data-theme="' + o[0] + '" aria-pressed="' + (th === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="eyebrow" style="margin:6px 0">Notifications</div>';
    if (MODE === 'gas') h += '<p class="small muted" style="margin:0 0 12px">Push notifications work in the installed app. Open your new app link from the Config tab of your Sheet.</p>';
    else if (!('Notification' in window) || !('serviceWorker' in navigator)) h += '<p class="small muted" style="margin:0 0 12px">' + (/iPhone|iPad/.test(navigator.userAgent) && !standalone() ? 'On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there.' : 'This browser can\'t show notifications.') + '</p>';
    else if (!S.push.configured) h += '<p class="small muted" style="margin:0 0 12px">Notifications aren\'t set up on the server yet.</p>';
    else h += '<div class="between" style="margin-bottom:12px"><span class="small">' + (Notification.permission === 'granted' && S.push.devices ? 'On for this phone' : Notification.permission === 'denied' ? 'Blocked in your phone settings' : 'Off') + '</span><button class="btn ' + (Notification.permission === 'granted' && S.push.devices ? 'line' : 'primary') + ' sm" type="button" id="pushOn">' + icon('bell', 's') + (Notification.permission === 'granted' && S.push.devices ? 'Test' : 'Turn on') + '</button></div>';
    if (MODE === 'web' && !standalone()) h += '<div class="between" style="margin-bottom:12px"><span class="small">Install as an app</span>' + (deferredInstall ? '<button class="btn primary sm" type="button" id="install">' + icon('download', 's') + 'Install</button>' : '<span class="tiny muted right">' + (/iPhone|iPad/.test(navigator.userAgent) ? 'Share, then Add to Home Screen' : 'Menu, then Install app') + '</span>') + '</div>';
    if (ME) h += '<div class="eyebrow" style="margin:6px 0">Claude API key</div><form class="inline" id="keyForm" autocomplete="off"><input type="password" id="keyText" placeholder="' + (S.hasClaudeKey ? 'Saved. Paste a new one to replace it' : 'sk-ant-…') + '" aria-label="Claude API key"><button class="btn primary" type="submit">Save</button></form><p class="tiny muted" style="margin:6px 0 0">Powers Ask, the morning brief, meal ideas and food quick-add. Get one at console.anthropic.com.</p>';
    h += '</section><p class="small muted center">Chores, routines, rewards, lifts and targets can all be changed in your Google Sheet.</p>';
    el('tab-you').innerHTML = h;
  }

  // ---------- FUN: boost, challenges, making things, Us, stakes, Tempo, intro, Wrapped ----------
  function boostLeft() {
    var b = S && S.fun && S.fun.boost, t = now();
    return b && t >= b.startsAt && t < b.endsAt ? Math.max(1, Math.ceil((b.endsAt - t) / 60000)) : 0;
  }
  function boostBanner() {
    var left = boostLeft();
    return left ? '<div class="boost">' + icon('bolt', 's') + '<b>Double XP</b><span class="grow">Everything counts twice</span><span class="num" id="boostLeft">' + left + ' min</span></div>' : '';
  }
  function challengesCard() {
    var c = S.fun && S.fun.challenges;
    if (!c) return '';
    var done = c.list.filter(function (x) { return x.done; }).length;
    return '<section class="card"><div class="head"><h3>Daily challenges</h3><span class="small muted num">' + done + '/3</span></div>' +
      c.list.map(function (x) {
        return '<div class="item' + (x.done ? ' done' : '') + '"><span class="check' + (x.done ? ' on' : '') + '">' + icon('check') + '</span><div class="grow t" style="font-weight:500">' + esc(x.text) + '</div><span class="chip ' + (x.done ? 'good' : 'lilac') + '">+' + x.xp + ' XP</span></div>';
      }).join('') +
      '<div class="chest' + (c.chest ? ' open' : '') + '">' + icon('gift', 's') + '<span>' + (c.chest ? 'Chest opened: +' + c.chestXp + ' XP' : 'Finish all three to open today\'s chest: +' + c.chestXp + ' XP') + '</span></div></section>';
  }

  var CREATE = [
    ['music', 'Make a beat', 20, 'music', ['Open a project or start fresh', 'Make a loop you like', 'Add one more layer', 'Save or bounce it']],
    ['mix', 'Mix practice', 30, 'disc', ['Pick five tracks', 'Beatmatch two of them by ear', 'Practise one transition until it\'s smooth', 'Record a short mix']],
    ['art', 'Draw or paint', 25, 'brush', ['Set up your space', 'Warm up: five minutes of anything', 'Pick one idea', 'Keep going until the timer ends']]
  ];
  function creativeCard() {
    if (mySession()) return '';
    return '<section class="card"><div class="head"><h3>Make something</h3><span class="small muted">Studio time counts</span></div><div class="grid3">' + CREATE.map(function (c, i) {
      return '<button class="tile make" type="button" data-fun="create" data-v="' + i + '">' + icon(c[3]) + '<div class="small" style="font-weight:650">' + c[1] + '</div><div class="tiny muted">' + c[2] + ' min</div></button>';
    }).join('') + '</div></section>';
  }

  var usOpen = false, diceIdea = '';
  var DICE = ['Candles on, phones in a drawer', 'Ten-minute massage each, then see what happens', 'Shower together', 'Slow dance in the kitchen: one song each',
    'Make tonight\'s playlist together', 'Recreate your first date', 'Lights on', 'Somewhere other than the bedroom', 'Blindfold taste test',
    'Loser of today\'s word is in charge', 'Dress up like it\'s a night out, then stay in', 'Start with a kiss that lasts a whole song',
    'Late Registration, start to finish, as background music', 'Lights low, a DJ set on the speakers', 'Truth or dare, house rules', 'Breakfast in bed, but at night'];
  function usCard() {
    var u = S.fun && S.fun.us;
    if (!u) return '';
    var n = names(), ask = u.ask, h = '<section class="card us">';
    h += '<button class="between ushead" type="button" data-fun="usToggle"><span class="row" style="gap:8px">' + icon('flame', 's') + '<b>Us</b><span class="chip">' + icon('lock', 's') + 'Private</span></span>' + icon(usOpen ? 'x' : 'chevron', 's') + '</button>';
    if (ask && ask.from !== S.who && !ask.answer) {
      h += '<div class="ask"><b>' + esc(n.other) + ': tonight?</b><div class="row" style="gap:8px"><button class="btn primary sm" type="button" data-fun="tonightYes">Yes</button><button class="btn line sm" type="button" data-fun="tonightNo">Rain check</button></div></div>';
    } else if (ask && ask.from === S.who) {
      h += '<p class="small muted" style="margin:10px 0 0">' + (ask.answer ? esc(n.other) + (ask.answer === 'yes' ? ' said yes.' : ': rain check.') : 'Asked ' + esc(n.other) + '. Waiting…') + '</p>';
    }
    if (usOpen) {
      h += '<div class="grid3 center us-stats"><div><div class="num big">' + u.week + '</div><div class="tiny muted">this week</div></div><div><div class="num big">' + u.month + '</div><div class="tiny muted">this month</div></div><div><div class="num big">' + u.heat + '</div><div class="tiny muted">week' + (u.heat === 1 ? '' : 's') + ' running</div></div></div>' +
        '<button class="btn primary wide" type="button" data-fun="usLog">' + icon('flame', 's') + 'Log it · +20 XP each</button>' +
        '<div class="grid3" style="margin-top:8px"><button class="btn soft" type="button" data-fun="wink">Wink</button><button class="btn soft" type="button" data-fun="tonight">Tonight?</button><button class="btn soft" type="button" data-fun="dice">' + icon('shuffle', 's') + 'Dice</button></div>' +
        (diceIdea ? '<div class="dice">' + esc(diceIdea) + '</div>' : '') +
        '<div class="chips" style="margin-top:12px">' + u.badges.map(function (b) { return '<span class="chip' + (b.earned ? ' pink' : '') + '" title="' + esc(b.desc) + '">' + esc(b.name) + '</span>'; }).join('') + '</div>' +
        '<p class="tiny muted" style="margin:10px 0 0">Only the two of you see this. It never appears in the feed or the weekly email.</p>';
    }
    return h + '</section>';
  }
  function wrappedCard() {
    var d = new Date(now()), day = d.getDay();
    if (!(day === 0 && d.getHours() >= 12) && day !== 1) return '';
    return '<button class="wrapped-btn" type="button" data-fun="wrapped">' + icon('wave') + '<span class="grow"><b>Your week, wrapped</b><br><span class="small">' + esc(names().team) + ', the last seven days</span></span>' + icon('play', 's') + '</button>';
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
    h += '<section class="card"><div class="between"><div><div class="eyebrow">Best today</div><div class="num" style="font-size:28px;font-weight:700">' + (m.tries ? m.points : 0) + '<span class="small muted"> pts</span></div></div><div class="right"><div class="small muted">' + esc(n.other) + '</div><div class="num" style="font-size:28px;font-weight:700">' + (o && o.tries ? o.points : 0) + '<span class="small muted"> pts</span></div><div class="tiny muted">' + (!o ? 'not yet' : o.final ? 'locked in' : 'playing') + '</div></div></div>';
    if (m.final) {
      h += '<div class="divider"></div><div class="center"><div class="eyebrow">Today\'s beat</div><div class="num" style="font-size:44px;font-weight:700;letter-spacing:-.02em">' + t.bpm + '<span class="small muted"> BPM</span></div><div class="small" style="font-weight:600">' + esc(t.style) + '</div>' +
        '<p class="small muted" style="margin:8px 0 0">You tapped ' + m.bpm + '.' + (o && o.final && o.bpm ? ' ' + esc(n.other) + ' tapped ' + o.bpm + '.' : '') + '</p></div></section>';
      return h;
    }
    var phase = tempo ? tempo.phase : '';
    h += '<button class="tpad' + (phase === 'tap' ? ' live' : '') + '" type="button" data-fun="tap" id="tpad"><span id="tpadTxt">' + (phase === 'listen' ? 'Listen' : phase === 'tap' ? 'Tap' : phase === 'send' ? '…' : 'Tempo') + '</span></button>' +
      '<p class="center small muted" id="tmsg">' + (tempo ? tempo.msg : 'Hear eight beats, then keep the beat going on your own: tap eight times. Closest BPM wins.') + '</p>' +
      (tempo ? '' : '<button class="btn primary wide" type="button" data-fun="tempoGo">' + icon('play', 's') + (m.tries ? 'Try ' + (m.tries + 1) + ' of 3' : 'Play the beat') + '</button>') +
      '<p class="tiny muted center" style="margin:8px 0 0">Within 1 BPM scores 10. Three tries, best one counts. Sound on.</p></section>';
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
    if (!tempo || tempo.phase !== 'tap') return;
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
      var m = g.tempo.mine;
      if (m.final) { confetti(m.points >= 8); toast(m.points === 10 ? 'Perfect timing. ' + g.tempo.bpm + ' BPM.' : 'Locked in: ' + m.points + ' points'); refreshQuiet(); }
      else toast(bpm + ' BPM: ' + (m.points >= 8 ? 'so close' : 'try again') + '. ' + (3 - m.tries) + ' left.');
    }, function (err) { tempo = null; renderPlay(); toast(err.message, true); });
  }

  // ---- the daily intro (first open each day) ----
  function intro() {
    if (!S || !S.fun || current !== 'home') return;
    var day = S.today ? S.today.date : new Date(now()).toDateString();
    if (load('intro-' + S.who) === day) return;
    save('intro-' + S.who, day);
    var f = S.fun, g = S.game, n = names(), c = f.challenges;
    var bars = ''; for (var i = 0; i < 24; i++) bars += '<i style="animation-delay:' + (-i * 0.13).toFixed(2) + 's"></i>';
    var h = '<div class="intro" id="intro" role="dialog" aria-label="Welcome"><div class="in">' +
      '<div class="eq">' + bars + '</div>' +
      '<div class="eyebrow l1">Day ' + f.day + ' of ' + esc(f.team) + '</div>' +
      '<h1 class="l2">' + greeting() + ',<br>' + esc(n.me || 'you') + '</h1>' +
      (f.era ? '<div class="era l3">Level ' + g.level.level + ' · ' + esc(f.era) + '</div>' : '') +
      '<div class="istats l4"><div><b class="num">' + g.streak.count + '</b><span>day streak</span></div><div><b class="num">' + g.team.count + '</b><span>together</span></div><div><b class="num">' + (g.xpToday >= g.goal ? g.xpToday : g.goal - g.xpToday) + '</b><span>' + (g.xpToday >= g.goal ? 'XP today' : 'XP to go') + '</span></div></div>' +
      (c ? '<div class="ich l5"><div class="eyebrow">Today\'s challenges</div>' + c.list.map(function (x) { return '<div>' + icon(x.done ? 'check' : 'star', 's') + esc(x.text) + '</div>'; }).join('') + '</div>' : '') +
      (f.boost ? '<p class="l6 small">Double XP is hiding somewhere between noon and 9pm. Keep notifications on.</p>' : '') +
      (S.brief ? '<p class="l6 small">' + esc(S.brief.first ? 'First move: ' + S.brief.first : S.brief.brief) + '</p>' : '') +
      '<button class="btn primary big wide l7" type="button" data-fun="introGo">Let\'s go</button></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
    chime([523, 659, 784]);
  }

  // ---- Wrapped: your week as a story ----
  var story = null;
  function wrappedSlides(w) {
    var y = w.you, t = w.them, out = [];
    var dayName = function (ymd) { return ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : ''; };
    var fmtD = function (ymd) { return new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    out.push(['a', '<div class="eyebrow">' + fmtD(w.from) + ' to ' + fmtD(w.to) + '</div><h1>' + esc(w.team.name) + '</h1><p>Your week, wrapped.</p>']);
    var lead = y.xp === t.xp ? 'Dead even.' : (y.xp > t.xp ? 'You' : esc(t.name)) + ' took the week.';
    out.push(['b', '<div class="eyebrow">XP earned</div><div class="huge num">' + fmt(y.xp) + '</div><p>' + esc(t.name) + ': ' + fmt(t.xp) + '. ' + lead + '</p>']);
    out.push(['c', '<div class="eyebrow">Chores done between you</div><div class="huge num">' + (y.chores + t.chores) + '</div>' + (y.top ? '<p>Your most played track: <b>' + esc(y.top) + '</b>, ' + y.topCount + ' time' + (y.topCount === 1 ? '' : 's') + '.</p>' : '<p>Next week\'s set is wide open.</p>')]);
    if (y.bestDay) out.push(['a', '<div class="eyebrow">Your peak-time set</div><h1>' + dayName(y.bestDay) + '</h1><p>' + y.bestDayXp + ' XP in one day.</p>']);
    out.push(['b', '<div class="eyebrow">Head to head</div><div class="huge num">' + w.games.you + '<span class="dim"> to </span>' + w.games.them + '</div><p>' + (w.games.bestWord ? 'Your best word: ' + w.games.bestWord + '/6. ' : '') + (w.games.theirBestWord ? esc(t.name) + '\'s: ' + w.games.theirBestWord + '/6.' : '') + '</p>']);
    var extra = [];
    if (y.gym) extra.push(y.gym + ' gym session' + (y.gym === 1 ? '' : 's') + (y.prs ? ', ' + y.prs + ' PR' + (y.prs === 1 ? '' : 's') : ''));
    if (y.create + t.create) extra.push((y.create + t.create) + ' studio session' + (y.create + t.create === 1 ? '' : 's'));
    if (y.challenges) extra.push(y.challenges + ' challenge' + (y.challenges === 1 ? '' : 's') + ' beaten');
    if (extra.length) out.push(['c', '<div class="eyebrow">Also</div>' + extra.map(function (x) { return '<h2>' + esc(x) + '</h2>'; }).join('')]);
    if (w.team.us) out.push(['a', '<div class="eyebrow">And</div><div class="huge num">' + w.team.us + '</div><p>time' + (w.team.us === 1 ? '' : 's') + ' you made time for each other.</p>']);
    out.push(['b', '<div class="eyebrow">' + esc(w.team.name) + '</div><h1>' + w.team.streak + '-day team streak.</h1><p>Same time next week?</p><button class="btn primary big wide" type="button" data-fun="storyClose" style="margin-top:18px">Done</button>']);
    return out;
  }
  function showStory(i) {
    if (!story) return;
    story.i = Math.max(0, Math.min(story.slides.length - 1, i));
    var s = story.slides[story.i];
    el('story').className = 'story g' + s[0];
    el('storyBars').innerHTML = story.slides.map(function (x, j) { return '<i class="' + (j < story.i ? 'done' : j === story.i ? 'on' : '') + '"></i>'; }).join('');
    el('storyBody').innerHTML = '<div class="slide">' + s[1] + '</div>';
    clearTimeout(story.timer);
    if (story.i < story.slides.length - 1) story.timer = setTimeout(function () { showStory(story.i + 1); }, 5000);
  }
  function openWrapped() {
    toast('Wrapping your week…');
    call('getWrapped', [], function (w) {
      story = { slides: wrappedSlides(w), i: 0 };
      document.body.insertAdjacentHTML('beforeend', '<div class="story" id="story"><div class="bars" id="storyBars"></div><button class="iconbtn sx" type="button" data-fun="storyClose" aria-label="Close">' + icon('x') + '</button><div id="storyBody"></div></div>');
      el('story').addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        showStory(story.i + (e.clientX < innerWidth / 3 ? -1 : 1));
      });
      showStory(0);
      chime([523, 659, 784, 1047]);
    });
  }

  // ---- taps for all of the above ----
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-fun], [data-stake]');
    if (!t || !S) return;
    var f = t.dataset.fun, v = t.dataset.v;
    if (t.dataset.stake) return call('setStake', [t.dataset.stake], function (g) { closeSheet(); S.games = g; renderPlay(); toast('Stakes set. ' + names().other + ' knows.'); });
    if (f === 'introGo') { var x = el('intro'); if (x) { x.classList.add('out'); setTimeout(function () { x.remove(); }, 350); } return; }
    if (f === 'storyClose') { if (story) clearTimeout(story.timer); story = null; var st = el('story'); if (st) st.remove(); return; }
    if (f === 'wrapped') return openWrapped();
    if (f === 'usToggle') { usOpen = !usOpen; return renderHome(); }
    if (f === 'dice') { var d; do { d = DICE[Math.floor(Math.random() * DICE.length)]; } while (d === diceIdea && DICE.length > 1); diceIdea = d; buzz(15); return renderHome(); }
    if (f === 'tap') return tempoTap();
    if (busy) return;
    if (f === 'create') { var c = CREATE[+v]; return startPlan({ name: c[1], minutes: c[2], steps: c[4].slice(), creative: c[0] }, c[1] + ' for ' + c[2] + ' minutes. Make something.'); }
    if (f === 'usLog') return call('logUs', [], function (res) { confetti(true); chime([523, 784, 1047]); apply(res, 'Logged. +20 XP each.'); });
    if (f === 'wink') return call('sendWink', ['wink'], function (res) { apply(res, 'Wink sent'); });
    if (f === 'tonight') return call('sendWink', ['tonight'], function (res) { apply(res, 'Asked. Waiting for ' + names().other + '…'); });
    if (f === 'tonightYes' || f === 'tonightNo') return call('answerTonight', [f === 'tonightYes'], function (res) { apply(res, f === 'tonightYes' ? 'Said yes' : 'Rain check sent'); });
    if (f === 'stakes') return stakeSheet();
    if (f === 'tempoGo') return tempoGo();
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

  function readinessAdvice(r) {
    var gym = ME && S.today && S.today.gym && !S.today.gym.done ? S.today.gym.session : '';
    if (r.score >= 80) return gym ? 'Good day to push the 1+ set on ' + gym + '.' : 'Plenty in the tank today.';
    if (r.score >= 60) return gym ? 'Train as planned. Keep the 1+ set honest.' : 'A normal day. Move, eat well, sleep on time.';
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
    out += '<div class="top"><div><h1>Health</h1><div class="sub">' + (h.synced ? (new Date(h.synced).toDateString() === new Date(now()).toDateString() ? 'Synced at ' + clockOf(h.synced) : 'Synced ' + new Date(h.synced).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + clockOf(h.synced)) : 'Not connected yet') + '</div></div>' + meButton() + '</div>';
    out += '<div class="daynav"><button class="iconbtn" type="button" data-hday="-1" aria-label="Day before">' + icon('back', 's') + '</button><b>' + (isToday ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })) + '</b><button class="iconbtn" type="button" data-hday="1" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>' + icon('chevron', 's') + '</button></div>';
    if (!h.connected) { el('tab-health').innerHTML = out + setupCard(h); return; }
    var sl = h.sleep, rd = h.readiness, hr = h.heart;

    // hero: steps ring + three tiles
    out += '<section class="card"><div class="hhero"><div class="ring" style="width:132px;height:132px">' + ring(h.steps / h.goals.steps, 132, 12) +
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
      msg('Couldn\'t reach HC Webhook from the app (Chrome blocks it on some phones). Use the file way below instead.');
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
    var t = ev.target.closest('[data-hday], [data-fun="healthAI"], [data-fun="copyHook"], [data-fun="importHealth"], [data-days]');
    if (!t || !S) return;
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
  var CHARS = [
    ['sa-cj', 'CJ', 'Carl Johnson', 'Back home to put the family first', '#2e9e4f', '#0d3b1e'],
    ['sa-smoke', 'BS', 'Big Smoke', 'Big appetite, bigger plans', '#3f8f3f', '#1b2a1b'],
    ['sa-sweet', 'SW', 'Sweet', 'Holds the hood together', '#2f8a46', '#e9e2c8'],
    ['sa-ryder', 'RY', 'Ryder', 'Short fuse, sharp hat', '#4a9b3a', '#2a2a2a'],
    ['sa-kendl', 'KJ', 'Kendl', 'Smartest one in the family', '#2e9e4f', '#e0a33d'],
    ['sa-cesar', 'CV', 'Cesar', 'Lowriders and loyalty', '#c46a2b', '#3a1f0f'],
    ['sa-catalina', 'CA', 'Catalina', 'Chaos with a plan', '#b3402a', '#2a0f0a'],
    ['sa-woozie', 'WZ', 'Woozie', 'Calm, lucky, unstoppable', '#b0202f', '#d9a441'],
    ['sa-truth', 'TT', 'The Truth', 'Has all the answers, allegedly', '#7a9a2a', '#c9a35a'],
    ['sa-toreno', 'MT', 'Mike Toreno', 'Every job is a secret', '#4b5563', '#111827'],
    ['sa-maddogg', 'MD', 'Madd Dogg', 'Comeback king', '#7c3aed', '#1e1b4b'],
    ['sa-ogloc', 'OG', 'OG Loc', 'Rhymes in progress', '#c9a227', '#3b2f0b'],
    ['sa-zero', 'ZR', 'Zero', 'Small shop, big ideas', '#2563eb', '#0b1d4a'],
    ['sa-tenpenny', 'FT', 'Tenpenny', 'Badge, attitude, no rules', '#334155', '#0f172a'],
    ['vc-tommy', 'TV', 'Tommy Vercetti', 'Building an empire in the sun', '#14b8a6', '#f472b6'],
    ['vc-lance', 'LV', 'Lance Vance', 'Style first, plans later', '#f9a8d4', '#1e3a8a'],
    ['vc-ken', 'KR', 'Ken Rosenberg', 'Nervous lawyer, big heart', '#e9c46a', '#264653'],
    ['vc-mercedes', 'MC', 'Mercedes', 'Owns every party', '#ff4f9a', '#7c3aed'],
    ['vc-umberto', 'UR', 'Umberto', 'Pride and strong coffee', '#2a9d8f', '#e76f51'],
    ['vc-phil', 'PC', 'Phil Cassidy', 'Fearless, even short-handed', '#6b705c', '#ddbe8a'],
    ['vc-kent', 'KP', 'Kent Paul', 'Knows everyone, does nothing', '#ffb703', '#023047'],
    ['vc-diaz', 'RD', 'Ricardo Diaz', 'Loud, rich, paranoid', '#c1121f', '#fdf0d5'],
    ['vc-avery', 'AC', 'Avery Carrington', 'Buys the skyline', '#b5838d', '#3d1f2b'],
    ['vc-sonny', 'SF', 'Sonny Forelli', 'Wants his money back', '#3d3d3d', '#a3a3a3']
  ];
  function charById(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i][0] === id) return CHARS[i]; return null; }
  function charOf(who) { return S && S.fun && S.fun.chars ? S.fun.chars[who] : ''; }
  function avatar(id, size, right) {
    var c = charById(id), s = size || 36;
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
    return c ? '<button class="avbtn" type="button" data-goto="you" aria-label="You and settings">' + avatar(c, 40) + '</button>'
      : '<button class="iconbtn" type="button" data-goto="you" aria-label="You and settings">' + icon('user') + '</button>';
  }
  function wanted(streak) {
    var tiers = [1, 3, 7, 14, 30, 60], n = tiers.filter(function (t) { return streak >= t; }).length, out = '';
    for (var i = 0; i < 6; i++) out += '<i class="' + (i < n ? 'on' : '') + '">' + icon('star', 's') + '</i>';
    return '<span class="wanted" title="Streak stars: 1, 3, 7, 14, 30 and 60 days">' + out + '</span>';
  }
  function charCard() {
    var id = charOf(S.who), c = charById(id), g = S.game;
    if (!c) return '<button class="charcard empty" type="button" data-goto="custom">' + avatar('', 56) + '<span class="grow"><b>Pick your character</b><br><span class="small muted">San Andreas or Vice City</span></span>' + icon('chevron', 's') + '</button>';
    return '<button class="charcard" type="button" data-goto="custom" style="--c1:' + c[4] + ';--c2:' + c[5] + '">' + avatar(id, 64) + '<span class="grow"><span class="tiny">' + (id.slice(0, 2) === 'vc' ? 'Vice City' : 'San Andreas') + '</span><b>' + esc(c[2]) + '</b>' +
      '<span class="small">Respect: level ' + g.level.level + '</span>' + wanted(g.streak.count) + '</span></button>';
  }

  var HOME_NAMES = { brief: 'Morning brief', ask: 'Ask anything', ring: 'XP and streaks', challenges: 'Daily challenges', whatnow: 'What should I do now?', routine: 'Routines', gym: 'Gym today', chores: 'Today\'s chores', tiles: 'Weight and water', make: 'Make something', us: 'Us', feed: 'Partner feed' };
  var HOME_DEFAULT = ['brief', 'ask', 'ring', 'challenges', 'whatnow', 'routine', 'gym', 'chores', 'tiles', 'make', 'us', 'feed'];
  function homeOrder() {
    var saved = (S.fun && S.fun.prefs && S.fun.prefs.home) || [], seen = {}, out = [];
    saved.forEach(function (x) { if (HOME_NAMES[x.id] && !seen[x.id]) { seen[x.id] = 1; out.push({ id: x.id, hide: !!x.hide }); } });
    HOME_DEFAULT.forEach(function (id) { if (!seen[id]) out.push({ id: id, hide: false }); });
    return out;
  }
  function prefs() { return (S && S.fun && S.fun.prefs) || {}; }
  function applyPrefs() {
    var p = prefs(), root = document.documentElement;
    if (p.accent) root.setAttribute('data-accent', p.accent); else root.removeAttribute('data-accent');
    root.setAttribute('data-text', p.text === 'large' ? 'large' : 'normal');
    root.classList.toggle('calm', p.motion === false);
    save('accent', p.accent || '');
  }
  function savePrefs(change, msg) {
    S.fun.prefs = Object.assign({}, prefs(), change);
    if (change.char !== undefined) S.fun.chars[S.who] = change.char;
    applyPrefs(); renderAll();
    rpc('setPrefs', [change]).then(function (res) { if (!inflight && !busy) apply(res, msg); }, function (e) { toast(e.message, true); });
  }

  var charGame = 'sa';
  function renderCustom() {
    var p = prefs(), th = document.documentElement.getAttribute('data-theme'), cur = charOf(S.who), n = names(), h = '';
    h += '<div class="top"><div class="row"><button class="iconbtn" type="button" data-goto="you" aria-label="Back">' + icon('back') + '</button><h1>Customise</h1></div></div>';
    // character
    h += '<section class="card"><div class="head"><h3>Your character</h3>' + (cur ? '<button class="btn ghost sm" type="button" data-char="">Remove</button>' : '') + '</div>' +
      '<p class="small muted" style="margin:0 0 10px">Shows on your Home screen, in Play and in ' + esc(n.other) + '\'s feed.</p>' +
      '<div class="seg">' + [['sa', 'San Andreas'], ['vc', 'Vice City']].map(function (o) { return '<button type="button" data-cgame="' + o[0] + '" aria-pressed="' + (charGame === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<div class="chars">' + CHARS.filter(function (c) { return c[0].slice(0, 2) === charGame; }).map(function (c) {
        return '<button class="ch' + (c[0] === cur ? ' on' : '') + '" type="button" data-char="' + c[0] + '">' + avatar(c[0], 58) + '<b>' + esc(c[2]) + '</b><span>' + esc(c[3]) + '</span></button>';
      }).join('') + '</div></section>';
    // look
    h += '<section class="card"><div class="head"><h3>Look</h3></div><div class="eyebrow" style="margin-bottom:6px">Theme</div>' +
      '<div class="themes">' + [['light', 'Light'], ['dark', 'Dark'], ['rave', 'Rave'], ['grove', 'Grove'], ['vice', 'Vice'], ['auto', 'Auto']].map(function (o) {
        return '<button type="button" class="th th-' + o[0] + '" data-theme="' + o[0] + '" aria-pressed="' + (th === o[0]) + '"><i></i>' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="eyebrow" style="margin:14px 0 6px">Accent colour</div><div class="swatches">' + [['', 'Lilac'], ['pink', 'Pink'], ['green', 'Green'], ['teal', 'Teal'], ['orange', 'Orange'], ['blue', 'Blue']].map(function (o) {
        return '<button type="button" class="sw-' + (o[0] || 'lilac') + '" data-accent="' + o[0] + '" aria-pressed="' + ((p.accent || '') === o[0]) + '" aria-label="' + o[1] + '"></button>';
      }).join('') + '</div>' +
      '<div class="eyebrow" style="margin:14px 0 6px">Text size</div><div class="seg">' + [['normal', 'Normal'], ['large', 'Larger']].map(function (o) { return '<button type="button" data-textsize="' + o[0] + '" aria-pressed="' + ((p.text || 'normal') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></section>';
    // names and titles
    h += '<section class="card"><div class="head"><h3>Names</h3></div><form class="stack" id="namesForm" autocomplete="off">' +
      '<label class="small muted">What the app calls you<input type="text" id="nickText" value="' + esc(n.me) + '" maxlength="24"></label>' +
      '<label class="small muted">The two of you<input type="text" id="teamText" value="' + esc(n.team) + '" maxlength="40"></label>' +
      '<button class="btn primary" type="submit">Save names</button></form>' +
      '<div class="eyebrow" style="margin:14px 0 6px">Level titles</div><div class="seg">' + [['dj', 'DJ'], ['ye', 'Ye'], ['gta', 'GTA'], ['none', 'Plain']].map(function (o) {
        return '<button type="button" data-titles="' + o[0] + '" aria-pressed="' + (String(S.fun.titles || 'none').toLowerCase() === o[0] || (o[0] === 'none' && !/^(dj|ye|gta)$/i.test(S.fun.titles || ''))) + '">' + o[1] + '</button>';
      }).join('') + '</div><p class="tiny muted" style="margin:0">' + (S.fun.era ? 'Now: ' + esc(S.fun.era) + (S.fun.nextEra ? ' · next: ' + esc(S.fun.nextEra) : '') : 'Just "Level ' + S.game.level.level + '"') + '</p></section>';
    // home layout
    h += '<section class="card"><div class="head"><h3>Home screen</h3><button class="btn ghost sm" type="button" data-homereset="1">Reset</button></div><p class="small muted" style="margin:0 0 6px">Move things up or down, or hide them.</p>' +
      homeOrder().map(function (x, i, all) {
        return '<div class="item' + (x.hide ? ' done' : '') + '"><button class="check' + (x.hide ? '' : ' on') + '" type="button" data-homehide="' + x.id + '" aria-label="Show or hide">' + icon('check') + '</button><div class="grow t" style="font-weight:550">' + HOME_NAMES[x.id] + '</div>' +
          '<button class="iconbtn" type="button" data-homemove="' + x.id + '" data-dir="-1" aria-label="Move up"' + (i ? '' : ' disabled') + '><svg class="i s" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>' +
          '<button class="iconbtn" type="button" data-homemove="' + x.id + '" data-dir="1" aria-label="Move down"' + (i < all.length - 1 ? '' : ' disabled') + '><svg class="i s" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div>';
      }).join('') + '</section>';
    // feel
    h += '<section class="card"><div class="head"><h3>Feel</h3></div>' + [['sound', 'Sounds', 'Chimes for done, levels and timers'], ['haptics', 'Vibration', 'A little buzz when you tick things'], ['confetti', 'Confetti', 'Celebrations when you earn XP'], ['motion', 'Animations', 'Turn off for a calmer app']].map(function (o) {
      var on = p[o[0]] !== false;
      return '<div class="item"><div class="grow"><b>' + o[1] + '</b><div class="tiny muted">' + o[2] + '</div></div><button class="toggle' + (on ? ' on' : '') + '" type="button" data-pref="' + o[0] + '" aria-pressed="' + on + '" aria-label="' + o[1] + '"><i></i></button></div>';
    }).join('') + '</section>';
    h += '<p class="small muted center">Your choices follow you to any phone you open the app on. ' + esc(n.other) + ' has their own.</p>';
    el('tab-custom').innerHTML = h;
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-char], [data-cgame], [data-accent], [data-textsize], [data-titles], [data-homehide], [data-homemove], [data-homereset], [data-pref]');
    if (!t || !S || !ev.target.closest('#tab-custom')) return;
    var d = t.dataset;
    if (d.cgame) { charGame = d.cgame; return renderCustom(); }
    if (d.char !== undefined) { var c = charById(d.char); buzz(20); return savePrefs({ char: d.char }, c ? 'You\'re ' + c[2] + ' now.' : 'Character removed'); }
    if (d.accent !== undefined) return savePrefs({ accent: d.accent });
    if (d.textsize) return savePrefs({ text: d.textsize });
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

  // ---------- rendering + tabs ----------
  function renderAll() {
    if (!S) return;
    var keep = {}, focused = document.activeElement && document.activeElement.id;
    document.querySelectorAll('main input[id], main textarea[id]').forEach(function (i) { if (i.type !== 'password') keep[i.id] = i.value; });
    renderHome(); renderChores(); renderPlay(); renderYou(); renderHealth(); renderCustom(); applyPrefs();
    if (ME) { renderTrain(); renderFood(); }
    Object.keys(keep).forEach(function (id) { var i = el(id); if (i && keep[id]) i.value = keep[id]; });
    if (focused && el(focused)) el(focused).focus();
    keepAwake(!!mySession());
    tickTimer();
    document.documentElement.setAttribute('data-theme', S.theme || 'light');
  }
  function showTab(name) {
    if (!ME && (name === 'train' || name === 'food')) name = 'home';
    current = name;
    document.querySelectorAll('section.tab').forEach(function (s) { s.hidden = s.id !== 'tab-' + name; });
    el('nav').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false'); });
    if (name !== 'you' && name !== 'custom') save('tab', name);
    window.scrollTo(0, 0);
    if (name === 'play') { loadWords(); pollGames(); }
  }

  // ---------- taps ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, li[data-step]');
    if (!t || !S) return;
    var ds = t.dataset;
    if (ds.tab) { t.blur(); return showTab(ds.tab); }
    if (ds.goto) return showTab(ds.goto);
    // quick, optimistic taps
    if (ds.qdone) return quick(function () {
      var q = questByName(ds.qdone);
      [S.quests.board, S.quests.more, S.quests.all].forEach(function (l) { l.forEach(function (x) { if (x.name === ds.qdone) { x.doneToday = true; x.doneBy = S.who; } }); });
      if (q) addXpLocal(q.xp + (q.who !== 'anyone' && q.who !== S.who ? Math.round(q.xp / 2) : 0));
    }, 'questDone', [ds.qdone], ds.qdone + ': done');
    if (ds.claim) return quick(function () { S.quests.board.concat(S.quests.more).forEach(function (x) { if (x.name === ds.claim) x.claimedBy = x.claimedBy === S.who ? '' : S.who; }); }, 'claimQuest', [ds.claim]);
    if (ds.hi5) return quick(function () { S.game.feed.forEach(function (f) { if (f.id === ds.hi5 && f.hi5.indexOf(S.who) === -1) f.hi5.push(S.who); }); }, 'highFive', [ds.hi5], 'High-five sent');
    if (ds.routine !== undefined && ds.ri !== undefined) return quick(function () {
      S.routines.routines.forEach(function (r) { if (r.name !== ds.routine) return; var i = r.done.indexOf(+ds.ri); if (i === -1) r.done.push(+ds.ri); else r.done.splice(i, 1); if (!r.finished && r.done.length >= r.steps.length) { r.finished = true; addXpLocal(10); } });
      buzz(15);
    }, 'routineStep', [ds.routine, +ds.ri]);
    if (ds.water) return quick(function () { var b = S.routines.water; S.routines.water = Math.max(0, b + +ds.water); if (S.routines.waterGoal && b < S.routines.waterGoal && S.routines.water >= S.routines.waterGoal) addXpLocal(5); buzz(15); }, 'addWater', [+ds.water]);
    if (ds.shop) return quick(function () { S.shopping.forEach(function (it) { if (it.id === ds.shop) it.got = !it.got; }); }, 'toggleShopping', [ds.shop]);
    if (ds.clear) return quick(function () { S.chores.later = S.chores.later.filter(function (l) { return l.id !== ds.clear; }); }, 'clearLater', [ds.clear]);
    if (ds.theme) { S.theme = ds.theme; save('theme', ds.theme); document.documentElement.setAttribute('data-theme', ds.theme); renderYou(); renderCustom(); rpc('setTheme', [ds.theme]).catch(function () {}); return; }
    if (busy) return;
    // home
    if (t.id === 'whatNow') { wn.skip = []; wn.pick = undefined; return whatNowSheet(); }
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
    if (t.id === 'cdone') { var task = mySession().task; return call('finishChore', ['Done'], function (res) { parking = false; apply(res, task + ': done. Nice.'); }); }
    if (t.id === 'cstop') return call('finishChore', ['Stopped'], function (res) { parking = false; apply(res, 'Stopped. Starting was the hard part.'); });
    if (t.id === 'ccancel') return call('finishChore', ['Cancelled'], function (res) { parking = false; apply(res, 'Cancelled.'); });
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
    if (t.id === 'tCheck') { if (!target.expr.trim()) return; return call('submitTarget', [target.expr, false], function (g) { var before = S.games.target.mine; S.games = g; renderPlay(); var m = g.target.mine; toast(m && m.final ? 'Bang on. Locked in.' : 'Best so far: ' + m.best + ' (' + Math.abs(m.best - g.target.target) + ' away)'); if (m && m.final) { confetti(true); refreshQuiet(); } }); }
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
    // train
    if (ds.tsel) { tsel = ds.tsel; save('tsel-' + S.today.date, tsel); return renderTrain(); }
    if (ds.setsession !== undefined) {
      var ns = ds.setsession;
      if (ds.rest && !confirm('Make today a rest day? Your gym event and task are removed.')) return;
      return call('setTodaySession', [ns], function (res) { if (ns) { tsel = ns; save('tsel-' + S.today.date, tsel); } apply(res, ns ? 'Today is now ' + ns + '.' : 'Rest day. Recover well.'); });
    }
    if (ds.r) { var d = draft(); d[ds.r] = d[ds.r] || {}; var cur = d[ds.r].reps; if (cur === undefined) cur = +t.parentNode.querySelector('span').textContent; d[ds.r].reps = Math.max(0, cur + +ds.d); saveDraft(d); return renderTrain(); }
    if (ds.set) {
      var dd = draft(), k = ds.set;
      dd[k] = dd[k] || {}; dd[k].done = !dd[k].done;
      if (dd[k].reps === undefined) dd[k].reps = +t.parentNode.querySelector('.stepper span').textContent;
      var wi = t.parentNode.querySelector('input[data-w]'); if (wi) dd[k].weight = wi.value === '' ? null : +wi.value;
      saveDraft(dd);
      if (dd[k].done) { buzz(20); rest = { until: now() + restSecs(ds.rest) * 1000 }; }
      return renderTrain();
    }
    if (t.id === 'restSkip') { rest = null; return renderTrain(); }
    if (t.id === 'finishWk') return finishWorkout();
    // food
    if (ds.preset !== undefined) {
      var p = S.food.presets[+ds.preset], mine = { name: p.name, kcal: p.kcal, protein: p.protein };
      pending.push(mine); renderFood(); buzz(15);
      var drop = function () { pending.splice(pending.indexOf(mine), 1); };
      rpc('logPreset', [p.name]).then(function (res) { drop(); S.food = res.state; renderFood(); toast('Logged ' + itemsText(res.added)); }, function (err) { drop(); renderFood(); toast(err.message, true); });
      return;
    }
    if (t.id === 'undo') return call('undoLast', [], function (res) { S.food = res.state; renderFood(); toast('Removed ' + res.removed.join(', ')); });
    if (t.id === 'ideas') { toast('Thinking of ideas…'); return call('mealIdeas', [], function (list) { ideas = list; renderFood(); }); }
    if (t.id === 'ideasClose') { ideas = null; return renderFood(); }
    if (ds.idea !== undefined) { var idea = ideas[+ds.idea]; return call('logIdea', [idea], function (res) { S.food = res.state; ideas = null; renderFood(); toast('Logged ' + idea.name); }); }
    // you
    if (ds.reward) return call('redeemReward', [ds.reward], function (res) { confetti(true); apply(res, 'Enjoy: ' + ds.reward); });
    if (ds.addshop) return call('addShopping', [ds.addshop], function (res) { apply(res, 'Added ' + ds.addshop); });
    if (t.id === 'pushOn') return enablePush();
    if (t.id === 'install' && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; return; }
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

  document.addEventListener('change', function (ev) {
    var w = ev.target.closest('input[data-w]');
    if (w) { var d = draft(); d[w.dataset.w] = d[w.dataset.w] || {}; d[w.dataset.w].weight = w.value === '' ? null : +w.value; saveDraft(d); }
  });
  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target;
    if (busy || !S) return;
    if (f.id === 'custom') { var tx = el('customText').value.trim(); if (!tx) return; toast(S.hasClaudeKey ? 'Working out how long that takes…' : 'Set the time, then start.'); return call('planChore', [tx], function (p) { plan = p; renderAll(); }); }
    if (f.id === 'park') { var v = el('parkText').value.trim(); if (!v) return; var task = mySession().task; return call('parkThing', [v], function (res) { parking = false; apply(res, 'Saved for later. Back to ' + task + '.'); }); }
    if (f.id === 'weighForm') { var wv = el('weighText').value.trim(); if (!wv) return; return call('logWeightNow', [wv], function (t) { S.today = t; addXpLocal(10); renderAll(); toast('Logged ' + t.lastWeight.kg + ' kg'); refreshQuiet(); }); }
    if (f.id === 'shopForm') { var it = el('shopText').value.trim(); if (!it) return; el('shopText').value = ''; return call('addShopping', [it], function (res) { apply(res, 'Added'); }); }
    if (f.dataset.tm) { var ins = f.querySelectorAll('input'); return call('setTrainingMax', [f.dataset.tm, +ins[0].value, +ins[1].value], function (t) { S.train = t; renderTrain(); toast('Training max set.'); }); }
    if (f.id === 'quick') {
      var text = el('quickText').value.trim(); if (!text) return;
      el('quickBtn').disabled = true; el('quickNote').textContent = 'Working it out…';
      return call('quickAdd', [text], function (res) { el('quickText').value = ''; S.food = res.state; renderFood(); toast('Logged ' + itemsText(res.added)); }, function () { renderFood(); });
    }
    if (f.id === 'keyForm') { var val = el('keyText').value.trim(); if (!val) return; return call('saveClaudeKey', [val], function (s) { el('keyText').value = ''; S.food = s; S.hasClaudeKey = true; renderAll(); toast('Claude key saved.'); }); }
    if (f.id === 'nudgeForm') { var nt = el('nudgeText').value.trim(); if (!nt) return; return call('sendNudge', [nt], function (r) { closeSheet(); toast(r.delivered ? 'Sent' : 'Couldn\'t reach them right now'); }); }
    if (f.id === 'askForm') {
      var q = el('askText').value.trim(); if (!q) return;
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
    if (rest && el('restLeft')) {
      var left = rest.until - now();
      el('restLeft').textContent = clock(left);
      if (left <= 0) { rest = null; chime([880, 1175, 1568]); buzz([120, 60, 120]); toast('Rest over. Next set.'); renderTrain(); }
    }
    var tb = el('dotTrain'); if (tb) tb.textContent = rest ? clock(rest.until - now()) : '';
    var bl = boostLeft(), be = el('boostLeft');
    if (be) be.textContent = bl + ' min';
    if (!!bl !== lastBoost) { lastBoost = !!bl; renderHome(); }
  }, 1000);
  var lastBoost = false;
  function refresh() {
    if (!S || busy || inflight || parking || !el('sheetbg').hidden || document.visibilityState !== 'visible') return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (current === 'train' || current === 'food' || (current === 'play' && recallGame)) return;
    rpc('appState', []).then(function (res) { if (!busy && !inflight) apply(res); }, function () {});
  }
  function refreshQuiet() { rpc('appState', []).then(function (res) { if (!busy && !inflight) apply(res); }, function () {}); }
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
      return firebase.messaging().getToken({ serviceWorkerRegistration: swReg, vapidKey: CFG.vapidKey || undefined });
    }).then(function (token) {
      return rpc('registerDevice', [token, navigator.userAgent.slice(0, 60)]);
    }).then(function () {
      if (!silent) { S.push.devices = Math.max(1, S.push.devices); renderYou(); toast('Notifications are on.'); rpc('sendNudge', ['Test from your own phone: notifications work.']).catch(function () {}); }
      firebase.messaging().onMessage(function (p) { var n = p.notification || p.data || {}; toast((n.title || '') + (n.body ? ': ' + n.body : '')); chime([880, 1175]); refreshQuiet(); });
    }).catch(function (e) { if (e && !silent) toast(e.message || 'Couldn\'t turn on notifications.', true); });
  }

  // ---------- start ----------
  if (MODE === 'web' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; if (window.Notification && Notification.permission === 'granted' && KEY) enablePush(true); }).catch(function () {});
  }
  if (MODE === 'web' && 'serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.tab && S) { showTab(e.data.tab); refreshQuiet(); } });
  if (!ME) el('nav').querySelectorAll('[data-me]').forEach(function (b) { b.remove(); });
  function boot() {
    if (!S) return;
    ME = S.who === 'me';
    if (!ME) el('nav').querySelectorAll('[data-me]').forEach(function (b) { b.remove(); });
    if (!load('badges-' + S.who)) save('badges-' + S.who, S.game.badges.filter(function (b) { return b.earned; }).map(function (b) { return b.id; }));
    renderAll();
    var hash = location.hash.replace('#', '');
    showTab(['home', 'chores', 'play', 'train', 'food', 'health', 'you', 'custom'].indexOf(hash) !== -1 ? hash : (window.LQ_TAB || load('tab') || 'home'));
    lastBoost = !!boostLeft();
    setTimeout(intro, 250);
    if (!S.brief && S.hasClaudeKey) rpc('getBrief', []).then(function (b) { if (b) { S.brief = b; renderHome(); } }, function () {});
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
    el('tab-home').innerHTML = '<div class="loading">Loading…</div>';
    el('tab-home').hidden = false;
    rpc('appState', []).then(function (res) { S = res; offset = res.now - Date.now(); save('state-' + KEY.slice(0, 6), S); boot(); }, function (e) {
      el('tab-home').innerHTML = '<div class="loading"><h2>Couldn\'t load</h2><p class="muted">' + esc(e.message) + '</p><button class="btn primary" type="button" onclick="location.reload()">Try again</button></div>';
    });
  }
})();
