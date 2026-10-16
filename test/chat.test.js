const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { loadProject } = require('./fakes');
const Chat = require('../web/chat.js');
const plain = x => JSON.parse(JSON.stringify(x));

function ready(opts) {
  const g = loadProject({ now: new Date('2026-10-16T09:00:00Z') });
  g.ctx.setup();
  g.state.props.FCM_SA = JSON.stringify({ project_id: 'demo-nudge', client_email: 'x@demo', private_key: 'k' });
  g.ctx.resetRun_(); g.state.cache = {};
  const me = g.state.props.WEBAPP_KEY, partner = g.state.props.PARTNER_KEY;
  g.ctx.registerDevice(me, 'tok-me-' + 'x'.repeat(140), 't'); g.ctx.registerDevice(partner, 'tok-yaz-' + 'y'.repeat(140), 't');
  return { g, C: g.ctx, me, partner };
}

test('Read receipts: sending → sent → delivered → read (with the time read)', () => {
  assert.strictEqual(Chat.receipt({}, true).state, 'sending');
  assert.strictEqual(Chat.receipt({ deliveredAt: null, readAt: null }).state, 'sent');
  assert.strictEqual(Chat.receipt({ deliveredAt: 1 }).state, 'delivered');
  const at = new Date(2026, 9, 16, 21, 4).getTime();
  assert.deepStrictEqual(Chat.receipt({ deliveredAt: 1, readAt: at }), { state: 'read', label: 'Read 21:04', at });
  // the other phone marks delivered as soon as it has a message, and read only while the chat is open
  const msgs = [{ id: 'a', from: 'me' }, { id: 'b', from: 'partner' }, { id: 'c', from: 'partner', deliveredAt: 1 }, { id: 'd', from: 'partner', deliveredAt: 1, readAt: 2 }];
  assert.deepStrictEqual(Chat.marks(msgs, 'me', false), { delivered: ['b'], read: [] });
  assert.deepStrictEqual(Chat.marks(msgs, 'me', true), { delivered: ['b'], read: ['b', 'c'] });
  assert.strictEqual(Chat.unreadOf(msgs, 'me'), 2);
});

test('Online, typing and last seen', () => {
  const now = new Date(2026, 9, 16, 15, 0).getTime();
  assert.strictEqual(Chat.presence({ online: true, lastSeen: now - 10000 }, now), 'online');
  assert.strictEqual(Chat.presence({ online: true, lastSeen: now - 10000, typingAt: now - 1000 }, now), 'typing…');
  assert.strictEqual(Chat.presence({ online: true, lastSeen: now - 10000, typingAt: now - 9000 }, now), 'online', 'typing fades after 5 s');
  assert.strictEqual(Chat.presence({ online: false, lastSeen: new Date(2026, 9, 16, 14, 2).getTime() }, now), 'last seen 14:02');
  assert.strictEqual(Chat.presence({ online: true, lastSeen: new Date(2026, 9, 15, 22, 10).getTime() }, now), 'last seen yesterday 22:10', 'a phone that went quiet isn\'t "online"');
  assert.strictEqual(Chat.presence(null, now), '');
});

test('Disappearing messages: off, 24 hours or 7 days, and expired ones are gone', () => {
  const now = Date.UTC(2026, 9, 16);
  assert.strictEqual(Chat.expiresAt('off', now), null);
  assert.strictEqual(+Chat.expiresAt('24h', now), now + 864e5);
  assert.strictEqual(+Chat.expiresAt('7d', now), now + 7 * 864e5);
  assert.strictEqual(Chat.expired({ expiresAt: now - 1 }, now), true);
  assert.strictEqual(Chat.expired({ expiresAt: null }, now), false);
  assert.deepStrictEqual(Chat.QUICK.tonight, ['Yes \u{1F60F}', 'Maybe later', 'Not tonight']);
});

test('Discreet notifications: only "New message from …", never what was said, and a burst is one buzz', () => {
  const { g, C, me, partner } = ready();
  C.chatPing(me, 'this text must never be sent anywhere');
  const p = g.state.pushes.filter(x => /tok-yaz/.test(x.token));
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].title, 'New message from Deany');
  assert.strictEqual(p[0].body, '', 'no message content on the lock screen');
  assert.ok(!JSON.stringify(g.state.pushes).includes('must never'), 'the content went nowhere');
  C.chatPing(me); C.chatPing(me);
  assert.strictEqual(g.state.pushes.filter(x => /tok-yaz/.test(x.token)).length, 1, 'quiet for 20 s after a ping');
  g.state.now = new Date('2026-10-16T09:00:30Z'); C.chatPing(me);
  assert.strictEqual(g.state.pushes.filter(x => /tok-yaz/.test(x.token)).length, 2);
  C.chatPing(partner);
  assert.strictEqual(g.state.pushes.filter(x => /tok-me/.test(x.token)).pop().title, 'New message from Yazzy');
});

test('Chat privacy on the server: the same room for the two of you only, none for solo copies, never stored anywhere else', () => {
  const { g, C, me, partner } = ready();
  const a = plain(C.appState(me)).chat, b = plain(C.appState(partner)).chat;
  assert.ok(a && /^[0-9a-f]{64}$/.test(a.room), 'a long random room secret');
  assert.strictEqual(a.room, b.room); assert.strictEqual(a.who, 'me'); assert.strictEqual(b.who, 'partner');
  const fsCalls = g.state.firestore || [];
  assert.strictEqual(fsCalls.length, 1, 'the secret is written to Firestore once');
  assert.match(fsCalls[0].url, /documents\/secrets\/chat$/);
  assert.throws(() => C.appState('wrong-key'), /out of date|key/i, 'no key, no room');
  // the room never goes into backups, the feed, emails or the AI
  const backup = JSON.stringify(plain(C.exportAll(me)));
  assert.ok(!backup.includes(a.room), 'not in backups');
  g.state.props.SOLO = '1'; C.resetRun_();
  assert.strictEqual(plain(C.appState(me)).chat, null, 'solo copies have no chat');
});

test('Chat content never touches the server code: no message reading anywhere in Apps Script or the AI', () => {
  const dir = path.join(__dirname, '../src');
  fs.readdirSync(dir).filter(f => /\.gs$/.test(f) && !/^(Secrets|ImportData|Instance)\.gs$/.test(f)).forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/rooms\/|\/msgs|collection\(['"]msgs/.test(src), f + ' must not read chat messages');
  });
  const ai = fs.readFileSync(path.join(dir, 'AI.gs'), 'utf8');
  assert.ok(!/chat/i.test(ai.replace(/clearAsk|askChat|chat history of the assistant/gi, '')) || !/NudgeChat|msgs/.test(ai));
  assert.ok(!/text|message/i.test(fs.readFileSync(path.join(dir, 'Chat.gs'), 'utf8').match(/function chatPing\(([^)]*)\)/)[1]), 'chatPing takes no message');
});
