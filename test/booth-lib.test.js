const test = require('node:test');
const assert = require('node:assert');
require('fake-indexeddb/auto');
require('../web/booth-dsp.js');

// a fresh copy of the library code, as if the page had been reloaded (the stored data stays)
function reload() { delete require.cache[require.resolve('../web/booth-lib.js')]; require('../web/booth-lib.js'); const L = globalThis.BoothLibrary; L._setWait(600); return L; }
// a stand-in for Chrome's decoder: WAV and MP3 headers decode, anything else fails like Chrome does
const ctx = { sampleRate: 44100, decodeAudioData(ab, ok, bad) { const s = Buffer.from(ab.slice(0, 4)).toString('latin1'); if (s === 'RIFF' || s.startsWith('ID3')) ok({ duration: 1 }); else bad(new Error('EncodingError: Unable to decode audio data')); } };
const wav = name => new File([Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(200)])], name, { type: 'audio/wav' });
function wipe(name) { return new Promise(r => { const q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = () => r(); }); }
const own = items => items.filter(x => x.own).map(x => x.name).sort();

test('Library: upload tracks, reload, they are still there; loops are always present', async () => {
  await wipe('lq-dj'); await wipe('booth');
  let L = reload(), lib = new L(ctx);
  assert.strictEqual(lib.items.filter(x => x.loop).length, 6, 'loops before storage is even read');
  const r = await lib.addFiles([wav('Acid One.wav'), wav('Hard Two.wav')]);
  assert.deepStrictEqual(r.added.sort(), ['Acid One.wav', 'Hard Two.wav']); assert.deepStrictEqual(r.failed, []);
  assert.deepStrictEqual(own(lib.items), ['Acid One', 'Hard Two']);
  L = reload(); lib = new L(ctx); await lib.list();
  assert.deepStrictEqual(own(lib.items), ['Acid One', 'Hard Two'], 'still there after a reload');
  assert.strictEqual(lib.items.filter(x => x.loop).length, 6);
});

test('Library: a failed upload says what went wrong', async () => {
  const L = reload(), lib = new L(ctx);
  const r = await lib.addFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' }), new File([Buffer.from('OggS....')], 'broken.mp3', { type: 'audio/mpeg' }), new File([], 'empty.wav', { type: 'audio/wav' })]);
  assert.strictEqual(r.added.length, 0);
  assert.match(r.failed[0].reason, /isn't an audio file/);
  assert.match(r.failed[1].reason, /Chrome can't read the audio/);
  assert.match(r.failed[2].reason, /empty/);
  assert.match(L.friendly(Object.assign(new Error('x'), { name: 'QuotaExceededError' })), /enough storage space/);
});

test('Library: upgrading the analysis database keeps every track and its analysis', async () => {
  await wipe('lq-dj'); await wipe('booth');
  // the old layout: tracks in lq-dj v1, analysis in booth v1 (no recordings store)
  await new Promise(r => { const q = indexedDB.open('lq-dj', 1); q.onupgradeneeded = () => q.result.createObjectStore('tracks', { keyPath: 'id' }); q.onsuccess = () => { const t = q.result.transaction('tracks', 'readwrite'); t.objectStore('tracks').put({ id: 'old1', name: 'Old favourite', blob: new Blob(['RIFF']), bpm: 130, first: 0.2, added: 1 }); t.oncomplete = () => { q.result.close(); r(); }; }; });
  await new Promise(r => { const q = indexedDB.open('booth', 1); q.onupgradeneeded = () => q.result.createObjectStore('analysis', { keyPath: 'id' }); q.onsuccess = () => { const t = q.result.transaction('analysis', 'readwrite'); t.objectStore('analysis').put({ id: 'old1', v: 2, bpm: 130.02, first: 0.21, key: 'Am', camelot: '8A', waves: { rate: 100, low: new Uint8Array([1, 2]), mid: new Uint8Array([3]), high: new Uint8Array([4]) }, genre: 'Acid', hot: [1.5], edited: true }); t.oncomplete = () => { q.result.close(); r(); }; }; });
  const L = reload(), lib = new L(ctx); await lib.list();
  const t = lib.items.find(x => x.id === 'old1');
  assert.ok(t && t.analysed && t.bpm === 130.02 && t.camelot === '8A' && t.genre === 'Acid' && t.edited && t.hot[0] === 1.5, JSON.stringify(t));
  const d = await lib.diagnose();
  assert.strictEqual(d.tracks, 1); assert.strictEqual(d.analysis, 1); assert.strictEqual(d.mixes, 0, 'the new recordings store was added alongside');
});

test('Library: an older Booth tab holding the database open no longer hides anything (the bug)', async () => {
  await wipe('lq-dj'); await wipe('booth');
  let L = reload(), lib = new L(ctx); await lib.addFiles([wav('Mine.wav')]);
  await wipe('booth');
  // an "old tab": opens booth at version 1 and never lets go
  const old = await new Promise(r => { const q = indexedDB.open('booth', 1); q.onupgradeneeded = () => q.result.createObjectStore('analysis', { keyPath: 'id' }); q.onsuccess = () => r(q.result); });
  L = reload(); lib = new L(ctx);
  const t0 = Date.now(); await lib.list();
  assert.ok(Date.now() - t0 < 3000, 'did not hang');
  assert.deepStrictEqual(own(lib.items), ['Mine'], 'your tracks still show');
  assert.strictEqual(lib.items.filter(x => x.loop).length, 6, 'loops still show');
  assert.strictEqual(lib.problem, 'blocked');
  old.close();
  await new Promise(r => setTimeout(r, 200));
  await lib.list();
  assert.strictEqual(lib.problem, '');
});

test('Library: loops are there even with no storage at all', async () => {
  const saved = globalThis.indexedDB; delete globalThis.indexedDB;
  try { const L = reload(), lib = new L(ctx); await lib.list(); assert.strictEqual(lib.items.filter(x => x.loop).length, 6); assert.ok(lib.problem); }
  finally { globalThis.indexedDB = saved; }
});

test('Library: export a backup and import it into an empty library', async () => {
  await wipe('lq-dj'); await wipe('booth');
  let L = reload(), lib = new L(ctx); await lib.addFiles([wav('Keep Me.wav')]);
  const id = lib.items.find(x => x.own).id;
  await lib.update(lib.get(id), { genre: 'Techno', hot: [2.5] });
  const blob = await lib.exportBackup();
  await wipe('lq-dj'); await wipe('booth');
  L = reload(); lib = new L(ctx); await lib.list(); assert.deepStrictEqual(own(lib.items), []);
  const r = await lib.importBackup(new File([blob], 'b.boothlib'));
  assert.strictEqual(r.tracks, 1);
  const t = lib.items.find(x => x.own);
  assert.strictEqual(t.name, 'Keep Me'); assert.strictEqual(t.genre, 'Techno'); assert.deepStrictEqual(t.hot, [2.5]);
  const again = await lib.importBackup(new File([blob], 'b.boothlib'));
  assert.strictEqual(again.tracks, 0); assert.strictEqual(again.skipped, 1, 'importing twice never duplicates or overwrites');
  await assert.rejects(lib.importBackup(new File(['nope'], 'x.boothlib')), /isn't a Booth library backup/);
});
