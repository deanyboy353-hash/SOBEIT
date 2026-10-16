// The move from Nudge's old Booth address to Afters, end to end in a real browser:
// two sites (each with its own storage), the backup download, the copy, and both sides' counts.
// Needs Chromium (Playwright) and the afters project next to this one; skipped otherwise.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const AFTERS = path.join(__dirname, '../../afters/web'), DIST = path.join(__dirname, '../dist');
let chromium = null;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e) { try { ({ chromium } = require('playwright')); } catch (e2) {} }
const skip = !chromium ? 'Playwright not installed' : !fs.existsSync(AFTERS) ? 'afters project not found next to this one' : !fs.existsSync(path.join(DIST, 'booth.html')) ? 'run the build first' : false;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve(ctx, origin, dir, extra) {
  return ctx.route(origin + '/**', r => {
    let p = new URL(r.request().url()).pathname; if (p === '/') p = '/index.html';
    if (extra && extra[p]) return r.fulfill({ contentType: 'text/html', body: extra[p] });
    const f = path.join(dir, p);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
}
// what the game left in the old site's browser storage
const SEED = `<!doctype html><script>
(async function () {
  const open = (n, v, up) => new Promise(r => { const q = indexedDB.open(n, v); q.onupgradeneeded = () => up(q.result); q.onsuccess = () => r(q.result); });
  const put = (d, s, v) => new Promise(r => { const t = d.transaction(s, 'readwrite'); t.objectStore(s).put(v); t.oncomplete = r; });
  const t = await open('lq-dj', 1, d => d.createObjectStore('tracks', { keyPath: 'id' }));
  for (let i = 1; i <= 4; i++) await put(t, 'tracks', { id: 'up' + i, name: 'Track ' + i + '.mp3', bpm: 120 + i, blob: new Blob([new Uint8Array(200000 * i).fill(i)], { type: 'audio/mpeg' }) });
  const b = await open('booth', 2, d => { d.createObjectStore('analysis', { keyPath: 'id' }); d.createObjectStore('mixes', { keyPath: 'id' }); });
  for (let i = 1; i <= 4; i++) await put(b, 'analysis', { id: 'up' + i, bpm: 120 + i, grid: { first: 0.02 * i, edited: i === 3 }, camelot: i + 'A', hot: [i, 8 + i], waves: { rate: 100, low: new Uint8Array([i, 2, 3]), high: new Float32Array([0.25 * i]) } });
  await put(b, 'mixes', { id: 'rec1', at: 1760000000000, name: 'Saturday', blob: new Blob([new Uint8Array(300000).fill(9)], { type: 'audio/webm' }) });
  const ls = { 'booth-overrides': '{"B.play":[145,7]}', 'booth-verified': '{"B.play":true}', 'booth-latency': '{"ms":18,"sig":"default|2"}', 'booth-afterCal': '{"ms":12}',
    'booth-academy': '{"drift":[{"total":84}]}', 'booth-mastered': '"drift"', 'booth-stats': '{"secs":{"2026-10-15":1800},"trans":[1,2,3]}', 'booth-padModes': '{"A":"loop"}', 'lq-djset': '{"keys":{"a":"KeyF"}}', 'lq-key': '"abcdefgh1234"' };
  Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v));
  document.title = 'seeded';
})();
</script>`;

test('Moving to Afters: backup file first, everything copied, both sides agree, nothing lost, old copy kept', { skip }, async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true });
  await serve(ctx, 'https://life-quest-5c52d.web.app', DIST, { '/seed.html': SEED });
  await serve(ctx, 'https://afters-dj.web.app', AFTERS);
  const errs = []; ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));
  const old = await ctx.newPage(); old.on('pageerror', e => errs.push('old ' + e.message));
  await old.goto('https://life-quest-5c52d.web.app/seed.html'); await old.waitForFunction(() => document.title === 'seeded');
  await old.goto('https://life-quest-5c52d.web.app/booth.html');
  await old.waitForSelector('#go');
  assert.match(await old.textContent('#state'), /4 tracks \(1\.9 MB\), 4 analysed.*1 recordings.*9 settings/);
  const [download, popup] = await Promise.all([old.waitForEvent('download'), ctx.waitForEvent('page'), old.click('#go')]);
  assert.match(download.suggestedFilename(), /^afters-from-nudge-\d{4}-\d\d-\d\d\.aftersbackup$/);
  const file = await download.path();
  assert.ok(fs.statSync(file).size > 2000000, 'the backup holds the audio');
  await old.waitForFunction(() => /Moved and checked|Not everything/.test(document.body.innerText), null, { timeout: 30000 });
  const msg = await old.textContent('#state');
  assert.match(msg, /Moved and checked\..*4 tracks.*Nothing lost/s, msg);
  // Afters has it all, in its own storage
  await popup.waitForFunction(() => /Everything is here/.test(document.body.innerText));
  const there = await popup.evaluate(async () => {
    const s = AftersBundle.summary(await AftersBundle.collect(['lq-dj', 'booth'], k => /^booth-|^lq-djset$/.test(k)));
    return { s, link: JSON.parse(localStorage.getItem('afters-link') || 'null'), lat: localStorage.getItem('booth-latency'), origin: location.origin };
  });
  assert.strictEqual(there.origin, 'https://afters-dj.web.app');
  assert.deepStrictEqual([there.s.stores['lq-dj/tracks'].count, there.s.stores['lq-dj/tracks'].bytes, there.s.stores['booth/analysis'].count, there.s.stores['booth/mixes'].count, there.s.ls], [4, 2000000, 4, 1, 9]);
  assert.strictEqual(there.lat, '{"ms":18,"sig":"default|2"}');
  assert.strictEqual(there.link.key, 'abcdefgh1234', 'Afters is linked to Nudge for practice XP');
  // the old copy is untouched, and next time the old address goes straight to Afters
  const still = await old.evaluate(async () => AftersBundle.summary(await AftersBundle.collect(['lq-dj', 'booth'], k => /^booth-|^lq-djset$/.test(k))).stores['lq-dj/tracks'].count);
  assert.strictEqual(still, 4);
  await old.goto('https://life-quest-5c52d.web.app/booth.html');
  await old.waitForURL(/afters-dj\.web\.app/);
  // the backup file restores into a fresh browser too
  const ctx2 = await b.newContext();
  await serve(ctx2, 'https://afters-dj.web.app', AFTERS);
  const fresh = await ctx2.newPage();
  await fresh.goto('https://afters-dj.web.app/#backup'); await fresh.waitForSelector('#mvFile', { state: 'attached' });
  await fresh.setInputFiles('#mvFile', file);
  await fresh.waitForFunction(() => /Everything is here|didn't come across/.test(document.body.innerText), null, { timeout: 30000 });
  assert.match(await fresh.textContent('#mvOut'), /Everything is here\. 4 tracks \(1\.9 MB\), 4 analysed.*1 recordings/);
  assert.deepStrictEqual(errs, []);
  await b.close();
});
