/**
 * Chat.gs: the private couple chat lives in Firestore, not here. This file only:
 *  - makes the room secret (once) and hands it to your two phones (never to anyone else, never in solo copies);
 *  - sends the discreet "New message from …" notification, which never contains what was said.
 * The chat's words, photos and voice notes never pass through this script, so they can't reach the feed, the brief,
 * the weekly email, backups or any AI feature.
 */
var FIRESTORE_ = 'https://firestore.googleapis.com/v1/projects/';

function chatProject_() { var sa = fcmServiceAccount_(); return sa && sa.project_id ? sa.project_id : ''; }

/** The room secret: 64 random hex characters, stored here and in Firestore's unreadable /secrets/chat. */
function chatRoom_() {
  var room = prop_('CHAT_ROOM');
  if (room) return room;
  var sa = fcmServiceAccount_(); if (!sa) return '';
  room = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  var url = FIRESTORE_ + sa.project_id + '/databases/(default)/documents/secrets/chat';
  var res = UrlFetchApp.fetch(url, { method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + fcmAccessToken_(sa, 'https://www.googleapis.com/auth/datastore') },
    payload: JSON.stringify({ fields: { room: { stringValue: room } } }) });
  if (res.getResponseCode() >= 300) { log_('WARN', 'Chat room: ' + res.getContentText().slice(0, 200)); return ''; }
  setProp_('CHAT_ROOM', room);
  return room;
}

/** What a phone needs to join the chat: only for the couple, never for solo copies. */
function chatConfig_(who) {
  if (solo_() || instance_()) return null;
  try { var room = chatRoom_(); return room ? { room: room, who: who, other: who === 'me' ? 'partner' : 'me', project: chatProject_() } : null; }
  catch (e) { log_('WARN', 'Chat config: ' + e); return null; }
}

/**
 * A message was sent: tell the other phone, discreetly. Takes no message text on purpose: the lock screen only ever
 * says who it's from. At most one notification every 20 seconds (a burst of messages is one buzz).
 */
function chatPing(key) {
  var who = who_(key), other = who === 'me' ? 'partner' : 'me';
  if (solo_()) return { sent: 0 };
  var last = Number(prop_('CHAT_PING_' + other) || 0), t = new Date().getTime();
  if (t - last < 20000) return { sent: 0, quiet: true };
  setProp_('CHAT_PING_' + other, String(t));
  return { sent: push_(other, chatNoteTitle_(who), '', 'us', true, { kind: 'chat' }) };
}
function chatNoteTitle_(who) { return 'New message from ' + (nicks_()[who] || (who === 'me' ? 'Deany' : 'Yazzy')); }
