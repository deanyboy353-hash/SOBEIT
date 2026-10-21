/*
 * Nudge \u00B7 Us: the private chat between the two of you (Firestore, real-time).
 * Only the two phones that hold the room secret can read it (enforced by the database rules, see firestore.rules).
 * Nothing here is sent to the Apps Script server except a content-free "ping" so the other phone gets a discreet
 * "New message from \u2026" notification. Messages never reach the feed, the brief, the weekly email or any AI.
 */
(function (root) {
  'use strict';
  // ---------- pure helpers (tested) ----------
  var QUICK = { tonight: ['Yes \uD83D\uDE0F', 'Maybe later', 'Not tonight'] };
  var REACTIONS = ['\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25', '\uD83D\uDC4D'];
  var DISAPPEAR = { off: 0, '24h': 864e5, '7d': 6048e5 };
  function ms(t) { return !t ? 0 : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : t.seconds ? t.seconds * 1000 : +new Date(t); }
  /** Your own message's tick: sending (still on your phone), sent, delivered, read (with the time). */
  function receipt(m, pending) {
    if (pending) return { state: 'sending', label: 'Sending' };
    if (m.readAt) return { state: 'read', label: 'Read ' + hm(ms(m.readAt)), at: ms(m.readAt) };
    if (m.deliveredAt) return { state: 'delivered', label: 'Delivered' };
    return { state: 'sent', label: 'Sent' };
  }
  function hm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  /** "online", "typing\u2026", "last seen 14:02", "last seen yesterday 22:10", or "" if never. */
  function presence(p, now) {
    if (!p) return '';
    var seen = ms(p.lastSeen), typing = ms(p.typingAt);
    if (p.online && now - seen < 75000) return typing && now - typing < 5000 ? 'typing\u2026' : 'online';
    if (!seen) return '';
    var d = new Date(seen), t = new Date(now), y = new Date(now - 864e5);
    var same = function (a, b) { return a.toDateString() === b.toDateString(); };
    return 'last seen ' + (same(d, t) ? '' : same(d, y) ? 'yesterday ' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ') + hm(seen);
  }
  function expiresAt(setting, now) { var d = DISAPPEAR[setting] || 0; return d ? new Date(now + d) : null; }
  function expired(m, now) { var e = ms(m.expiresAt); return !!e && e <= now; }
  /** What the other phone should mark: delivered as soon as it has the message, read once the chat is open. */
  function marks(msgs, me, open) {
    var d = [], r = [];
    msgs.forEach(function (m) { if (m.from === me) return; if (!m.deliveredAt) d.push(m.id); if (open && !m.readAt) r.push(m.id); });
    return { delivered: d, read: r };
  }
  function unread(msgs, me) { return msgs.filter(function (m) { return m.from !== me && !m.readAt; }).length; }

  // ---------- the live part ----------
  var A = null, db = null, room = null, me = '', other = '', msgs = [], pendingIds = {}, pres = {}, meta = { disappear: 'off' }, open = false, unsub = [], media = {}, replyTo = null, sel = null, typingT = 0, rec = null;
  var V = '10.14.1', waiting = [], conn = 'idle', connErr = '';
  function load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function fb() {
    if (root.firebase && root.firebase.firestore) return Promise.resolve();
    return (root.firebase ? Promise.resolve() : load('https://www.gstatic.com/firebasejs/' + V + '/firebase-app-compat.js')).then(function () { return load('https://www.gstatic.com/firebasejs/' + V + '/firebase-firestore-compat.js'); });
  }
  function R() { return db.collection('rooms').doc(room); }
  function ts() { return root.firebase.firestore.FieldValue.serverTimestamp(); }
  /** Start listening (in the background as soon as the app opens: receipts, the unread count, live scores). */
  function init(api) {
    A = api; var c = A.cfg(); if (!c || !c.room) return Promise.resolve(false);
    if (started) return startedP;
    started = true; room = c.room; me = c.who; other = c.other; conn = 'connecting'; connErr = ''; status();
    startedP = fb().then(function () {
      var fcfg = A.firebase(); if (!fcfg || !fcfg.projectId) throw new Error('This copy of the app has no Firebase settings.');
      if (!root.firebase.apps.length) root.firebase.initializeApp(fcfg);
      db = root.firebase.firestore();
      // Safari (iPhone) sometimes stalls on Firestore's streaming connection; let it fall back to long-polling
      try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      if (root.NUDGE_FS_EMU) db.useEmulator(root.NUDGE_FS_EMU.host, root.NUDGE_FS_EMU.port);   // tests only
      try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
      unsub.push(R().collection('msgs').orderBy('at').limitToLast(300).onSnapshot({ includeMetadataChanges: true }, function (snap) {
        var t = Date.now(), gone = [];
        msgs = []; pendingIds = {};
        snap.forEach(function (d) { var m = d.data({ serverTimestamps: 'estimate' }); m.id = d.id; if (expired(m, t)) { gone.push(d.id); return; } msgs.push(m); if (d.metadata.hasPendingWrites) pendingIds[d.id] = 1; });
        gone.forEach(function (id) { var m = snap.docs.filter(function (x) { return x.id === id; })[0]; R().collection('msgs').doc(id).delete().catch(function () {}); if (m && m.data().media) R().collection('media').doc(m.data().media).delete().catch(function () {}); });
        receipts(); draw(); A.badge(unread(msgs, me));
      }, function (e) { A.toast('Chat: ' + e.message, true); }));
      unsub.push(R().collection('presence').onSnapshot(function (s) { s.forEach(function (d) { pres[d.id] = d.data(); }); head(); draw(); }));
      unsub.push(R().collection('meta').doc('settings').onSnapshot(function (d) { meta = d.exists ? d.data() : { disappear: 'off' }; head(); }));
      unsub.push(R().collection('live').doc(other).onSnapshot(function (d) { if (d.exists) A.live(d.data()); }));
      here(true); setInterval(function () { if (!document.hidden) here(true); }, 30000);
      document.addEventListener('visibilitychange', function () { here(!document.hidden); if (!document.hidden) receipts(); });
      root.addEventListener('pagehide', function () { here(false); });
      conn = 'ok'; status();
      var q = waiting; waiting = []; q.forEach(function (m) { send(m); });   // anything tapped while connecting goes now
      return true;
    }).catch(function (e) { started = false; db = null; conn = 'error'; connErr = (e && e.message) || 'no connection'; status(); return false; });
    return startedP;
  }
  var started = false, startedP = null;
  /** A line under the header while connecting or when something's wrong (with Retry); nothing when all is well. */
  function status() {
    var b = el('chatConn'); if (!b) return;
    if (conn === 'ok') { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = conn === 'error' ? '<span class="grow small">Couldn\'t connect the chat (' + esc(connErr) + '). Your messages are kept and sent when it connects.</span><button type="button" class="btn soft sm" data-cs="retry">Retry</button>'
      : '<span class="grow small">Connecting the chat…' + (waiting.length ? ' ' + waiting.length + ' waiting to send.' : '') + '</span>';
  }
  function here(on) { if (!db) return; R().collection('presence').doc(me).set({ online: !!on, lastSeen: ts() }, { merge: true }).catch(function () {}); }
  function receipts() {
    if (!db) return;
    var mk = marks(msgs, me, open && !document.hidden), b = db.batch(), n = 0;
    mk.delivered.forEach(function (id) { b.update(R().collection('msgs').doc(id), { deliveredAt: ts() }); n++; });
    mk.read.forEach(function (id) { b.update(R().collection('msgs').doc(id), { readAt: ts() }); n++; });
    if (n) b.commit().catch(function () {});
  }
  /** Your live numbers for the other phone (score, Win the day): seen there within a second. */
  function pulse(data) { if (!db) return; R().collection('live').doc(me).set(Object.assign({ at: ts() }, data), { merge: true }).catch(function () {}); }

  // ---------- sending ----------
  function send(m) {
    if (!db) {
      // not connected yet (first open on a phone takes a few seconds): keep it and send it the moment it connects
      if (replyTo && !m.replyTo) { m.replyTo = replyTo; replyTo = null; }
      waiting.push(m); A.haptic(15); status(); drawWaiting();
      if (!started) init(A);
      return null;
    }
    var doc = R().collection('msgs').doc();
    m = Object.assign({ from: me, at: ts(), reactions: {}, deliveredAt: null, readAt: null, expiresAt: expiresAt(meta.disappear, Date.now()) }, m);
    if (replyTo) { m.replyTo = replyTo; replyTo = null; }
    doc.set(m).catch(function (e) { A.toast('Not sent: ' + e.message, true); });
    A.haptic(15);
    // a discreet notification, only if they're not looking at the app right now
    var p = pres[other]; if (!(p && p.online && Date.now() - ms(p.lastSeen) < 75000)) A.ping();
    draw(); scrollEnd();
    return doc.id;
  }
  function sendText() { var i = el('chatText'); var v = (i.value || '').trim(); if (!v) return; i.value = ''; send({ type: 'text', text: v.slice(0, 4000) }); typing(false); }
  function special(kind) {
    if (kind === 'wink') send({ type: 'wink', text: '\uD83D\uDE09' });
    else if (kind === 'tonight') send({ type: 'tonight', text: 'Tonight?' });
    else if (kind === 'dice') { var list = A.dice(), idea = list[Math.floor(Math.random() * list.length)]; send({ type: 'dice', text: idea, meta: { roll: 1 + Math.floor(Math.random() * 6) } }); }
  }
  function photo(file) {
    if (!file) return;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      var q = 0.72, data = c.toDataURL('image/jpeg', q); while (data.length > 850000 && q > 0.3) { q -= 0.12; data = c.toDataURL('image/jpeg', q); }
      var mref = R().collection('media').doc(); mref.set({ from: me, data: data, mime: 'image/jpeg', at: ts(), expiresAt: expiresAt(meta.disappear, Date.now()) });
      media[mref.id] = data; send({ type: 'photo', media: mref.id, text: '' });
    };
    img.src = url;
  }
  function voice() {
    if (rec) { rec.stop(); return; }
    if (!navigator.mediaDevices || !root.MediaRecorder) return A.toast('Voice notes need a newer browser.', true);
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ok = function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); };
      // mp4 (AAC) first: it plays on iPhone and Android alike; webm/opus where mp4 isn't offered
      var chunks = [], t0 = Date.now(), opts = ok('audio/mp4') ? { mimeType: 'audio/mp4', audioBitsPerSecond: 32000 } : ok('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 24000 } : {};
      rec = new MediaRecorder(stream, opts); rec.ondataavailable = function (e) { chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); }); var dur = Math.round((Date.now() - t0) / 1000); rec = null; drawComposer();
        var blob = new Blob(chunks, { type: chunks[0] && chunks[0].type || 'audio/webm' }), fr = new FileReader();
        fr.onload = function () { if (dur < 1) return; var mref = R().collection('media').doc(); mref.set({ from: me, data: fr.result, mime: blob.type, at: ts(), expiresAt: expiresAt(meta.disappear, Date.now()) }); media[mref.id] = fr.result; send({ type: 'voice', media: mref.id, text: '', dur: dur }); };
        fr.readAsDataURL(blob);
      };
      rec.start(); drawComposer(); setTimeout(function () { if (rec) rec.stop(); }, 60000);
    }, function () { A.toast('Allow the microphone to send voice notes.', true); });
  }
  function typing(on) {
    var t = Date.now(); if (on && t - typingT < 2500) return; typingT = on ? t : 0;
    if (db) R().collection('presence').doc(me).set({ typingAt: on ? ts() : null, online: true, lastSeen: ts() }, { merge: true }).catch(function () {});
  }
  function react(id, e) { var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m) return; var r = Object.assign({}, m.reactions || {}); if (r[me] === e) delete r[me]; else r[me] = e; R().collection('msgs').doc(id).update({ reactions: r }); A.haptic(10); }
  function del(id) { var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m || !confirm('Delete this message for both of you?')) return; R().collection('msgs').doc(id).delete(); if (m.media) R().collection('media').doc(m.media).delete().catch(function () {}); }
  function setDisappear(v) { R().collection('meta').doc('settings').set({ disappear: v }, { merge: true }); A.toast(v === 'off' ? 'Messages stay' : 'New messages disappear after ' + (v === '24h' ? '24 hours' : '7 days')); }

  // ---------- the lock (fingerprint / face / PIN on this phone) ----------
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function lockId() { try { return localStorage.getItem('lq-chatlock') || ''; } catch (e) { return ''; } }
  function setLock(on) {
    if (!on) { try { localStorage.removeItem('lq-chatlock'); } catch (e) {} A.toast('Chat lock off'); return head(); }
    if (!root.PublicKeyCredential) return A.toast('This phone can\'t lock the chat (no fingerprint or screen lock support in this browser).', true);
    navigator.credentials.create({ publicKey: { challenge: rand(32), rp: { name: 'Nudge' }, user: { id: rand(16), name: 'nudge-chat', displayName: 'Nudge chat' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } })
      .then(function (cred) { try { localStorage.setItem('lq-chatlock', b64(cred.rawId)); } catch (e) {} A.toast('Chat locked: you\'ll unlock it with your fingerprint or PIN'); head(); }, function () { A.toast('Lock not set.', true); });
  }
  function unlock() {
    var id = lockId(); if (!id) return Promise.resolve(true);
    return navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000 } }).then(function () { return true; }, function () { return false; });
  }

  // ---------- the screen ----------
  function el(id) { return document.getElementById(id); }
  function esc(s) { return A.esc(s); }
  function openChat(api) {
    if (api) A = api;
    if (!A) return;
    if (!A.cfg()) return A.toast('The chat is for the two of you; it isn\'t set up on this copy.', true);
    unlock().then(function (ok) {
      if (!ok) return A.toast('Chat stays locked.', true);
      var box = document.createElement('div'); box.id = 'chat'; box.className = 'chat'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Chat with ' + A.names().other);
      box.innerHTML = '<header class="chat-head" id="chatHead"></header><div class="chat-conn" id="chatConn" hidden></div><div class="chat-stats" id="chatStats"></div><div class="chat-list" id="chatList" aria-live="polite"></div><div class="chat-reply" id="chatReply" hidden></div><div class="chat-specials"><button type="button" class="btn soft sm" data-cs="wink">' + A.icon('heart', 's') + 'Wink</button><button type="button" class="btn soft sm" data-cs="tonight">Tonight?</button><button type="button" class="btn soft sm" data-cs="dice">' + A.icon('shuffle', 's') + 'Dice</button></div><form class="chat-comp" id="chatComp" autocomplete="off"></form>';
      document.body.appendChild(box); document.body.classList.add('chat-open'); open = true;
      head(); drawComposer(); draw(); drawWaiting(); status(); scrollEnd(); receipts(); fitKeyboard();
      if (!started) init(A).then(function () { draw(); });
    });
  }
  /** iPhone: the keyboard doesn't shrink the page, so size the chat to the visible area (the Send button stays in view). */
  function fitKeyboard() {
    var vv = root.visualViewport, c = el('chat'); if (!vv || !c) return;
    var fit = function () { var x = el('chat'); if (!x) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); return; } x.style.height = vv.height + 'px'; x.style.top = vv.offsetTop + 'px'; scrollEnd(); };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
  }
  function close() { var c = el('chat'); if (c) c.remove(); document.body.classList.remove('chat-open'); open = false; sel = null; replyTo = null; typing(false); }
  function head() {
    var h = el('chatHead'); if (!h) return;
    var p = presence(pres[other], Date.now()), n = A.names();
    h.innerHTML = '<button class="iconbtn" type="button" data-cs="close" aria-label="Back">' + A.icon('back') + '</button>' + A.avatar(other, 38) +
      '<div class="grow"><b>' + esc(n.other) + '</b><div class="tiny ' + (p === 'online' || p === 'typing\u2026' ? 'good' : 'muted') + '">' + esc(p || 'Private chat') + '</div></div>' +
      '<button class="iconbtn" type="button" data-cs="menu" aria-label="Chat settings">' + A.icon('more') + '</button>';
    var st = el('chatStats'); if (st) st.innerHTML = A.stats();
  }
  function drawComposer() {
    var f = el('chatComp'); if (!f) return;
    f.innerHTML = '<label class="iconbtn" aria-label="Send a photo">' + A.icon('camera') + '<input type="file" accept="image/*" id="chatPhoto" hidden></label>' +
      '<input type="text" id="chatText" placeholder="Message" maxlength="4000" aria-label="Message" enterkeyhint="send">' +
      '<button class="iconbtn' + (rec ? ' rec' : '') + '" type="button" data-cs="voice" aria-label="' + (rec ? 'Stop and send the voice note' : 'Record a voice note') + '">' + (rec ? '\u25A0' : A.icon('mic')) + '</button>' +
      '<button class="btn primary" type="submit" aria-label="Send">' + A.icon('send', 's') + '</button>';
  }
  function bubble(m) {
    var mine = m.from === me, t = ms(m.at), rc = mine ? receipt(m, pendingIds[m.id]) : null, h = '';
    var reply = m.replyTo ? msgs.filter(function (x) { return x.id === m.replyTo; })[0] : null;
    if (reply) h += '<div class="cq">' + esc(reply.from === me ? 'You' : A.names().other) + ': ' + esc(reply.type === 'photo' ? 'Photo' : reply.type === 'voice' ? 'Voice note' : (reply.text || '').slice(0, 80)) + '</div>';
    if (m.type === 'photo') h += '<img class="cphoto" alt="Photo" data-media="' + m.media + '" src="' + (media[m.media] || '') + '">';
    else if (m.type === 'voice') h += '<audio controls preload="none" data-media="' + m.media + '"' + (media[m.media] ? ' src="' + media[m.media] + '"' : '') + '></audio><span class="tiny muted">' + (m.dur || 0) + 's</span>';
    else if (m.type === 'wink') h += '<div class="cspecial wink" aria-label="Wink">\uD83D\uDE09</div>';
    else if (m.type === 'tonight') {
      var ans = msgs.filter(function (x) { return x.type === 'reply' && x.replyTo === m.id; })[0];
      h += '<div class="cspecial tonight"><b>Tonight?</b>' + (ans ? '<div class="small">' + esc(ans.text) + '</div>' : !mine ? '<div class="cquick">' + QUICK.tonight.map(function (q) { return '<button type="button" class="btn soft sm" data-cq="' + esc(q) + '" data-for="' + m.id + '">' + esc(q) + '</button>'; }).join('') + '</div>' : '<div class="tiny muted">Waiting for an answer\u2026</div>') + '</div>';
    }
    else if (m.type === 'dice') h += '<div class="cspecial dice"><span class="die">' + ['\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'][((m.meta && m.meta.roll) || 1) - 1] + '</span><div>' + esc(m.text) + '</div></div>';
    else h += '<div class="ctext">' + esc(m.text) + '</div>';
    var rx = Object.keys(m.reactions || {}).map(function (k) { return m.reactions[k]; });
    return '<div class="cmsg ' + (mine ? 'mine' : 'theirs') + (sel === m.id ? ' sel' : '') + ' t-' + m.type + '" data-cmid="' + m.id + '"><div class="cbub">' + h +
      '<div class="cmeta">' + (m.expiresAt ? A.icon('clock', 's') : '') + hm(t || Date.now()) + (rc ? '<span class="ctick ' + rc.state + '" title="' + esc(rc.label) + '">' + (rc.state === 'sending' ? '\u25CB' : rc.state === 'sent' ? '\u2713' : '\u2713\u2713') + '</span>' : '') + '</div></div>' +
      (rx.length ? '<div class="creact">' + rx.join('') + '</div>' : '') +
      (sel === m.id ? '<div class="cactions">' + REACTIONS.map(function (e) { return '<button type="button" data-cr="' + e + '">' + e + '</button>'; }).join('') + '<button type="button" data-ca="reply">Reply</button>' + (mine ? '<button type="button" data-ca="del">Delete</button>' : '') + '</div>' : '') +
      (mine && rc.state === 'read' && isLastMine(m) ? '<div class="tiny muted cread">' + esc(rc.label) + '</div>' : '') + '</div>';
  }
  function isLastMine(m) { for (var i = msgs.length - 1; i >= 0; i--) if (msgs[i].from === me) return msgs[i].id === m.id; return false; }
  function draw() {
    var L = el('chatList'); if (!L) return;
    var atEnd = L.scrollHeight - L.scrollTop - L.clientHeight < 80, day = '', h = '';
    if (!msgs.length) h = '<p class="empty center">Just the two of you in here. Say hi.</p>';
    msgs.filter(function (m) { return m.type !== 'reply' || !msgs.some(function (x) { return x.id === m.replyTo && x.type === 'tonight'; }); }).forEach(function (m) {
      var d = new Date(ms(m.at) || Date.now()).toDateString(); if (d !== day) { day = d; h += '<div class="cday">' + (d === new Date().toDateString() ? 'Today' : new Date(ms(m.at)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })) + '</div>'; }
      h += bubble(m);
    });
    var p = pres[other]; if (p && presence(p, Date.now()) === 'typing\u2026') h += '<div class="cmsg theirs"><div class="cbub ctyping" aria-label="typing"><i></i><i></i><i></i></div></div>';
    L.innerHTML = h;
    L.querySelectorAll('[data-media]').forEach(function (x) { var id = x.getAttribute('data-media'); if (media[id] || !db) return; R().collection('media').doc(id).get().then(function (d) { if (!d.exists) return; media[id] = d.data().data; var n = L.querySelector('[data-media="' + id + '"]'); if (n) n.src = media[id]; }); });
    if (atEnd) scrollEnd();
    var rb = el('chatReply'); if (rb) { var r = replyTo && msgs.filter(function (x) { return x.id === replyTo; })[0]; rb.hidden = !r; if (r) rb.innerHTML = '<span class="grow small">Replying to: ' + esc((r.text || r.type).slice(0, 60)) + '</span><button type="button" class="iconbtn" data-cs="noreply" aria-label="Cancel reply">' + A.icon('x', 's') + '</button>'; }
  }
  function drawWaiting() {
    var L = el('chatList'); if (!L) return;
    L.querySelectorAll('.cmsg.waiting').forEach(function (x) { x.remove(); });
    waiting.forEach(function (m) { var d = document.createElement('div'); d.className = 'cmsg mine waiting'; d.innerHTML = '<div class="cbub"><div class="ctext">' + esc(m.type === 'text' || m.type === 'reply' ? m.text : m.type === 'wink' ? '\uD83D\uDE09' : m.type === 'dice' ? 'Dice: ' + m.text : m.type === 'tonight' ? 'Tonight?' : m.type) + '</div><div class="cmeta">waiting to send \u25CB</div></div>'; L.appendChild(d); });
    scrollEnd();
  }
  function scrollEnd() { var L = el('chatList'); if (L) L.scrollTop = L.scrollHeight; }
  function menu() {
    A.sheet('<h2>Chat settings</h2><div class="eyebrow" style="margin:12px 0 6px">Disappearing messages</div><div class="seg">' + [['off', 'Off'], ['24h', '24 hours'], ['7d', '7 days']].map(function (o) { return '<button type="button" data-cdis="' + o[0] + '" aria-pressed="' + ((meta.disappear || 'off') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<p class="tiny muted" style="margin:6px 0 14px">For both of you, from now on. Earlier messages stay as they were.</p>' +
      '<div class="between"><div><b>Lock the chat</b><div class="tiny muted">Fingerprint, face or your phone PIN to open it, on this phone.</div></div><button type="button" class="btn ' + (lockId() ? 'line' : 'primary') + ' sm" data-clock="' + (lockId() ? 'off' : 'on') + '">' + (lockId() ? 'Turn off' : 'Turn on') + '</button></div>' +
      '<p class="tiny muted" style="margin:14px 0 0">Only your two phones can open this chat; the database itself refuses anyone else. Notifications only ever say who it\'s from. Nothing here goes into the feed, the brief, emails or any AI.</p>');
  }
  if (typeof document !== 'undefined') {
  document.addEventListener('click', function (ev) {
    if (!A) return;
    var t = ev.target.closest('[data-cs], [data-cr], [data-ca], [data-cq], [data-cmid], [data-cdis], [data-clock]'); if (!t) return;
    var d = t.dataset;
    if (d.cs === 'close') return close();
    if (d.cs === 'menu') return menu();
    if (d.cs === 'voice') return voice();
    if (d.cs === 'retry') { started = false; return init(A); }
    if (d.cs === 'noreply') { replyTo = null; return draw(); }
    if (d.cs) return special(d.cs);
    if (d.cdis) { setDisappear(d.cdis); return A.closeSheet(); }
    if (d.clock) { A.closeSheet(); return setLock(d.clock === 'on'); }
    if (d.cq) { replyTo = d.for; send({ type: 'reply', text: d.cq }); return; }
    if (d.cr) { react(sel, d.cr); sel = null; return draw(); }
    if (d.ca === 'reply') { replyTo = sel; sel = null; draw(); var i = el('chatText'); if (i) i.focus(); return; }
    if (d.ca === 'del') { var id = sel; sel = null; draw(); return del(id); }
    if (d.cmid && !ev.target.closest('button, audio, .cquick')) { sel = sel === d.cmid ? null : d.cmid; draw(); }
  });
  document.addEventListener('submit', function (ev) { if (ev.target.id === 'chatComp') { ev.preventDefault(); sendText(); } });
  document.addEventListener('input', function (ev) { if (ev.target.id === 'chatText') typing(!!ev.target.value); });
  document.addEventListener('change', function (ev) { if (ev.target.id === 'chatPhoto') { photo(ev.target.files[0]); ev.target.value = ''; } });
  }

  var api = { init: init, open: openChat, close: close, pulse: pulse, isOpen: function () { return open; }, unread: function () { return unread(msgs, me); },
    receipt: receipt, presence: presence, expiresAt: expiresAt, expired: expired, marks: marks, unreadOf: unread, QUICK: QUICK, REACTIONS: REACTIONS };
  root.NudgeChat = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
