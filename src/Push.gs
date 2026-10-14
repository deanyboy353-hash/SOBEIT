/**
 * Push.gs: real push notifications to your phones through Firebase Cloud
 * Messaging (free). Each phone registers itself from the app; messages are
 * sent here with the Firebase service account.
 *
 * The service account key lives in Script Properties (FCM_SA) or in the
 * private Secrets.gs file that is pushed to Apps Script but never to GitHub.
 * Without it, nudges fall back to email (partner) or a calendar alert (you).
 */

function fcmServiceAccount_() {
  var raw = prop_('FCM_SA') || (typeof FCM_SERVICE_ACCOUNT !== 'undefined' ? FCM_SERVICE_ACCOUNT : '');
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function appBaseUrl_() {
  return prop_('APP_URL') || (typeof APP_BASE_URL !== 'undefined' ? APP_BASE_URL : '');
}

function b64url_(bytesOrString) {
  return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, '');
}

/** OAuth token for FCM from the service account (signed JWT), reused for 50 minutes. */
function fcmAccessToken_(sa) {
  var cached = JSON.parse(prop_('FCM_TOKEN') || 'null');
  var now = Math.floor(new Date().getTime() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;
  var header = b64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claims = b64url_(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  var sig = b64url_(Utilities.computeRsaSha256Signature(header + '.' + claims, sa.private_key));
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + claims + '.' + sig }
  });
  if (res.getResponseCode() !== 200) throw new Error('Push sign-in failed: ' + res.getContentText().slice(0, 200));
  var tok = JSON.parse(res.getContentText());
  setProp_('FCM_TOKEN', JSON.stringify({ token: tok.access_token, exp: now + (tok.expires_in || 3600) - 600 }));
  return tok.access_token;
}

function devices_() {
  return JSON.parse(prop_('DEVICES') || '{"me":[],"partner":[]}');
}

/**
 * Send a notification to one person's phones. Returns how many got it.
 * tab: which app tab opens when it's tapped. urgent: fall back to email or a
 * calendar alert if push isn't set up (used for nudges and time's up).
 */
function push_(who, title, body, tab, urgent, extra) {
  var sent = 0;
  try {
    var sa = fcmServiceAccount_();
    var list = devices_()[who] || [];
    if (sa && list.length) {
      var token = fcmAccessToken_(sa);
      var link = appBaseUrl_() ? appBaseUrl_() + '#' + (tab || 'home') : '';
      var dead = [];
      list.forEach(function (d) {
        var data = { tab: tab || 'home', title: title, body: body || '' };
        var note = { title: title, body: body || '', icon: link ? appBaseUrl_() + 'icon-192.png' : undefined, tag: tab || 'home' };
        if (extra && extra.persist) {
          // Stays on the screen until you deal with it, and buzzes again each time.
          note.tag = extra.tag || tab || 'home';
          note.renotify = true;
          note.requireInteraction = true;
          note.vibrate = [200, 100, 200, 100, 400];
          data.persist = '1';
        }
        if (extra && extra.deadline) {
          // One notification per deadline that buzzes again each time, with buttons right on it.
          data.deadline = extra.deadline;
          note.tag = 'deadline-' + extra.deadline;
          note.renotify = true;
          note.requireInteraction = true;
          note.data = { deadline: extra.deadline, tab: 'home' };
          note.vibrate = [200, 100, 200, 100, 400];
          note.actions = [{ action: 'done', title: 'Done' }, { action: 'extend', title: '+30 min' }, { action: 'park', title: 'Park it' }];
        }
        var msg = { message: { token: d.token, data: data,
          webpush: { notification: note, fcm_options: link ? { link: link } : undefined } } };
        var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(msg)
        });
        var code = res.getResponseCode(), text = res.getContentText();
        // Only forget a phone when Google says its token no longer exists; anything else is logged and kept.
        if (code === 200) { sent++; pushNote_(who, title, d.label, 200, ''); }
        else {
          var gone = code === 404 || /UNREGISTERED|registration-token-not-registered|Requested entity was not found/i.test(text);
          if (gone) dead.push(d.token);
          pushNote_(who, title, d.label, code, (gone ? 'Phone not registered any more: ' : '') + pushError_(text));
          log_('WARN', 'Push ' + code + ' to ' + who + ': ' + text.slice(0, 300));
        }
      });
      if (dead.length) {
        var all = devices_();
        all[who] = (all[who] || []).filter(function (d) { return dead.indexOf(d.token) === -1; });
        setProp_('DEVICES', JSON.stringify(all));
      }
    }
  } catch (e) {
    log_('WARN', 'Push: ' + e);
    pushNote_(who, title, '', 0, String(e && e.message || e).slice(0, 200));
  }
  if (!sent && urgent) {
    if (who === 'partner') { if (emailPartner_(title, (body ? body + '\n\n' : '') + partnerUrl_())) sent = 1; }
    else {
      var at = new Date(Math.ceil((new Date().getTime() + 60000) / 60000) * 60000);
      var ev = CalendarApp.getDefaultCalendar().createEvent(title, at, new Date(at.getTime() + 60000), { description: (body || '') + '\n\n' + appUrl_() });
      ev.setTag(EVENT_TAG, 'nudge'); ev.removeAllReminders(); ev.addPopupReminder(0);
      sent = 1;
    }
  }
  return sent;
}

// ---- called from the app ----

/** A phone saying "send my notifications here". */
function registerDevice(key, token, label) {
  var who = who_(key);
  token = String(token || '');
  if (token.length < 20) throw new Error('That device token looks wrong.');
  return withLock_(function () {
    var all = devices_();
    var list = (all[who] || []).filter(function (d) { return d.token !== token; });
    list.unshift({ token: token, label: String(label || '').slice(0, 60), at: new Date().getTime() });
    all[who] = list.slice(0, 5);
    setProp_('DEVICES', JSON.stringify(all));
    return { devices: all[who].length };
  });
}

/** Send your partner a nudge: one of the quick ones or your own words. */
function sendNudge(key, text) {
  var who = who_(key);
  text = String(text || '').trim().slice(0, 140);
  if (!text) throw new Error('Type a message.');
  var from = names_()[who];
  var n = push_(who === 'me' ? 'partner' : 'me', from, text, 'home', true);
  addFeed_(who, 'Sent a nudge: "' + text + '"', 'nudge');
  return { delivered: n > 0 };
}

function pushStatus_(who) {
  var log = pushLog_().filter(function (x) { return x.who === who; });
  var ok = log.filter(function (x) { return x.code === 200; })[0], bad = log.filter(function (x) { return x.code !== 200; })[0];
  return { configured: !!fcmServiceAccount_(), devices: (devices_()[who] || []).length, otherDevices: (devices_()[who === 'me' ? 'partner' : 'me'] || []).length,
    lastOk: ok ? ok.at : 0, lastError: bad && (!ok || bad.at > ok.at) ? { at: bad.at, error: bad.error } : null,
    phones: (devices_()[who] || []).map(function (d) { return { label: d.label, at: d.at }; }) };
}

/** The last 30 sends (both of you), for the Notifications check in the app. */
function pushLog_() { return JSON.parse(prop_('PUSH_LOG') || '[]'); }
function pushNote_(who, title, label, code, error) {
  var log = pushLog_();
  log.unshift({ at: new Date().getTime(), who: who, title: String(title).slice(0, 60), phone: String(label || '').slice(0, 40), code: code, error: error || '' });
  setProp_('PUSH_LOG', JSON.stringify(log.slice(0, 30)));
}
function pushError_(text) {
  try { var j = JSON.parse(text); return String(j.error && (j.error.message || j.error.status) || text).slice(0, 200); } catch (e) { return String(text).slice(0, 200); }
}

/** "Send me a test": straight to your own phones, with what happened. */
function testPush(key) {
  var who = who_(key);
  return withLock_(function () {
    var before = pushLog_().length ? pushLog_()[0].at : 0;
    var sent = push_(who, 'Life Quest test', 'If you can read this, notifications work on this phone.', 'you', false);
    var results = pushLog_().filter(function (x) { return x.who === who && x.at >= before && x.title === 'Life Quest test'; });
    return { sent: sent, status: pushStatus_(who), results: results };
  });
}
