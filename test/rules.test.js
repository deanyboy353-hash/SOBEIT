// The chat's privacy, checked against Google's own Firestore emulator with the real rules file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } = require('firebase/firestore');

const ROOM = 'a'.repeat(32) + 'b'.repeat(32), WRONG = 'c'.repeat(64), PORT = 8089;
let env, emu;
function jar() { const d = path.join(os.homedir(), '.cache/firebase/emulators'); try { const f = fs.readdirSync(d).filter(x => /^cloud-firestore-emulator.*\.jar$/.test(x)).sort().pop(); return f ? path.join(d, f) : null; } catch (e) { return null; } }
async function up() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const j = jar(); if (!j) return false;
    emu = spawn('java', ['-jar', j, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { await fetch('http://127.0.0.1:' + PORT); break; } catch (e) { await new Promise(r => setTimeout(r, 500)); } }
  }
  env = await initializeTestEnvironment({ projectId: 'demo-nudge', firestore: { host: '127.0.0.1', port: PORT, rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'secrets/chat'), { room: ROOM }); });
  return true;
}
let ready;
test.before(async () => { ready = await up(); });
test.after(async () => { if (env) await env.cleanup(); if (emu) emu.kill(); });
const phone = () => env.unauthenticatedContext().firestore();
const msg = (from, extra) => Object.assign({ from, type: 'text', text: 'hi', at: serverTimestamp(), reactions: {}, deliveredAt: null, readAt: null, expiresAt: null }, extra || {});

test('Chat privacy: only a phone with the room secret can read or write; nobody can read the secret or list rooms', { skip: false }, async t => {
  if (!ready) return t.skip('Firestore emulator not installed');
  const db = phone();
  await assertSucceeds(setDoc(doc(db, 'rooms', ROOM, 'msgs', 'm1'), msg('me')));
  await assertSucceeds(getDoc(doc(db, 'rooms', ROOM, 'msgs', 'm1')));
  await assertFails(getDoc(doc(db, 'rooms', WRONG, 'msgs', 'm1')), 'a guessed room is refused');
  await assertFails(setDoc(doc(db, 'rooms', WRONG, 'msgs', 'x'), msg('me')));
  await assertFails(getDoc(doc(db, 'secrets/chat')), 'the secret itself can never be read');
  await assertFails(getDocs(collection(db, 'rooms')), 'rooms can\'t be listed');
  await assertFails(getDocs(collection(db, 'secrets')));
  await assertFails(getDoc(doc(db, 'anything/else')), 'nothing else in the database is open');
});

test('Chat rules: messages must be from one of you; afterwards only receipts and reactions change; delete for both works', async t => {
  if (!ready) return t.skip('Firestore emulator not installed');
  const db = phone(), m = doc(db, 'rooms', ROOM, 'msgs', 'm2');
  await assertFails(setDoc(doc(db, 'rooms', ROOM, 'msgs', 'bad'), msg('stranger')));
  await assertFails(setDoc(doc(db, 'rooms', ROOM, 'msgs', 'big'), msg('me', { text: 'x'.repeat(4001) })));
  await assertFails(setDoc(doc(db, 'rooms', ROOM, 'msgs', 'odd'), msg('me', { type: 'script' })));
  await assertSucceeds(setDoc(m, msg('partner')));
  await assertSucceeds(updateDoc(m, { deliveredAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(m, { readAt: serverTimestamp(), reactions: { me: '❤️' } }));
  await assertFails(updateDoc(m, { text: 'edited after sending' }), 'no rewriting what was said');
  await assertFails(updateDoc(m, { from: 'me' }));
  await assertSucceeds(deleteDoc(m));
});

test('Chat rules: presence and live scores only for the two of you; media size is capped', async t => {
  if (!ready) return t.skip('Firestore emulator not installed');
  const db = phone();
  await assertSucceeds(setDoc(doc(db, 'rooms', ROOM, 'presence', 'me'), { online: true }));
  await assertFails(setDoc(doc(db, 'rooms', ROOM, 'presence', 'someone'), { online: true }));
  await assertSucceeds(setDoc(doc(db, 'rooms', ROOM, 'live', 'partner'), { xpToday: 20 }));
  await assertSucceeds(setDoc(doc(db, 'rooms', ROOM, 'media', 'p1'), { from: 'me', data: 'x'.repeat(1000) }));
  await assertFails(setDoc(doc(db, 'rooms', ROOM, 'media', 'p2'), { from: 'me', data: 'x'.repeat(900001) }));
  await assertFails(getDoc(doc(db, 'rooms', WRONG, 'presence', 'me')));
});
