const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { loadProject } = require('./fakes');
const Outbox = require('../web/outbox.js');

// ---------- the outbox (optimistic saves) ----------
function harness(sendImpl) {
  const timers = [];
  const T = { set: (f, ms) => { const h = { f, ms }; timers.push(h); return h; }, clear: h => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } };
  const store = Outbox.memStore(), log = { results: [], rejects: [], states: [], status: [] };
  const box = Outbox.create({ store, timers: T, delay: 200, send: sendImpl,
    onResult: (it, r) => log.results.push(it.fn), onReject: (it, e) => log.rejects.push(it.fn + ': ' + e),
    onState: (s, more) => log.states.push({ s, more }), onStatus: st => log.status.push(st) });
  const tick = async () => { const h = timers.shift(); if (h) { h.f(); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); } return h; };
  return { box, store, log, timers, tick };
}

test('Outbox: a change is saved on the phone before anything is sent, and several taps go in one request', async () => {
  const sent = [];
  const h = harness(items => { sent.push(items.map(i => i.fn)); return Promise.resolve({ results: items.map(i => ({ id: i.id, ok: true, result: null })), state: { v: 1 } }); });
  await h.box.ready;
  h.box.add('addWater', [1]); h.box.add('routineStep', ['Morning', 0]); h.box.add('setPrefs', [{ accent: 'pink' }]);
  assert.strictEqual(h.store._m.outbox.length, 3, 'all three are stored before sending');
  assert.strictEqual(sent.length, 0, 'nothing sent yet: taps are gathered for a moment');
  await h.tick();
  assert.deepStrictEqual(sent, [['addWater', 'routineStep', 'setPrefs']], 'one request for all three');
  assert.strictEqual(h.store._m.outbox.length, 0, 'forgotten only once the server has them');
  assert.deepStrictEqual(h.log.results, ['addWater', 'routineStep', 'setPrefs']);
  assert.strictEqual(h.log.states.length, 1, 'the screen is refreshed once, not after every tap');
});

test('Outbox: when the server can\'t be reached it keeps the change and retries quietly with back-off; nothing is lost', async () => {
  let up = false, calls = 0;
  const h = harness(items => { calls++; return up ? Promise.resolve({ results: items.map(i => ({ id: i.id, ok: true })), state: {} }) : Promise.reject(new Error('offline')); });
  await h.box.ready;
  h.box.add('questDone', ['Do the dishes']);
  await h.tick();                                              // first try fails
  assert.strictEqual(h.box.pending().length, 1); assert.strictEqual(h.log.rejects.length, 0, 'no error shown for a network blip');
  assert.strictEqual(h.timers[0].ms, 1000, 'retry after 1 s');
  await h.tick(); assert.strictEqual(h.timers[0].ms, 3000);
  await h.tick(); assert.strictEqual(h.timers[0].ms, 8000);
  assert.ok(h.log.status.some(s => s.offline), 'after 3 failures the phone says it\'s offline (and saved)');
  // the app is closed and reopened while offline: the change is still there
  const again = Outbox.create({ store: h.store, timers: { set: () => 0, clear: () => {} }, send: () => Promise.reject(new Error('x')) });
  await again.ready;
  assert.deepStrictEqual(again.pending().map(i => i.fn), ['questDone'], 'survives a restart');
  up = true; await h.tick();
  assert.strictEqual(h.box.pending().length, 0); assert.deepStrictEqual(h.log.results, ['questDone']);
  assert.ok(calls >= 4);
});

test('Outbox: only the server saying no undoes a change (with its reason), and the others still save', async () => {
  const h = harness(items => Promise.resolve({ results: items.map(i => i.fn === 'buyWear' ? { id: i.id, ok: false, error: 'You need £550 more.' } : { id: i.id, ok: true }), state: { cash: 0 } }));
  await h.box.ready;
  const a = h.box.add('buyWear', ['tiara']), b = h.box.add('addWater', [1]);
  let rejected = null; a.done.catch(e => { rejected = e.message; });
  await h.tick(); await new Promise(r => setImmediate(r));
  assert.deepStrictEqual(h.log.rejects, ['buyWear: You need £550 more.']);
  assert.strictEqual(rejected, 'You need £550 more.');
  assert.deepStrictEqual(h.log.results, ['addWater']);
  assert.strictEqual(h.log.states[0].s.cash, 0, 'the server\'s truth comes back to put the screen right');
});

test('Outbox: a change made while a batch is on its way is never overwritten by that batch\'s (older) screen', async () => {
  let release;
  const h = harness(items => new Promise(r => { release = () => r({ results: items.map(i => ({ id: i.id, ok: true })), state: { old: true } }); }));
  await h.box.ready;
  h.box.add('addWater', [1]); await h.tick();
  h.box.add('addWater', [1]);                                   // tapped again while the first is saving
  release(); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  assert.strictEqual(h.log.states[0].more, true, 'the app is told more is pending, so it keeps what is on screen');
});

// ---------- the server: a batch builds the screen once ----------
function counting() {
  const g = loadProject({ now: new Date('2026-10-14T07:00:00Z') });
  const C = g.ctx; C.setup(); C.dailyRun();
  const me = g.state.props.WEBAPP_KEY; C.saveSetup(me, 'profile', { done: true });
  g.state.now = new Date('2026-10-14T09:20:00Z');
  const n = { read: 0, cache: 0, props: 0 };
  const R = Object.getPrototypeOf(C.SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getRange(1, 1));
  const gv = R.getValues; R.getValues = function () { n.read++; return gv.apply(this, arguments); };
  const P = C.PropertiesService.getScriptProperties; C.PropertiesService.getScriptProperties = () => { const p = P(); return { getProperty: k => (n.props++, p.getProperty(k)), getProperties: () => (n.props++, p.getProperties()), setProperty: (k, v) => (n.props++, p.setProperty(k, v)), deleteProperty: k => (n.props++, p.deleteProperty(k)) }; };
  const Cc = C.CacheService.getScriptCache; C.CacheService.getScriptCache = () => { const c = Cc(); const w = {}; Object.keys(c).forEach(k => { w[k] = (...a) => (n.cache++, c[k](...a)); }); return w; };
  const post = (fn, args) => { vm.runInContext('resetRun_(); ss_ = null;', C); return JSON.parse(C.doPost({ parameter: {}, postData: { contents: JSON.stringify({ fn, key: me, args }) } }).text); };
  // Apps Script costs per call (typical): sheet read 60 ms, property 25 ms, cache 20 ms, plus ~900 ms to start a request
  const cost = () => 900 + n.read * 60 + n.props * 25 + n.cache * 20;
  const reset = () => { n.read = n.cache = n.props = 0; };
  return { g, C, me, post, cost, reset, n };
}

test('Performance budget: five taps in one batch cost less than two separate saves, and the screen is built once', () => {
  const h = counting();
  h.post('appState', []);
  const items = [['addWater', [1]], ['addWater', [1]], ['routineStep', ['Morning', 0]], ['setPrefs', [{ accent: 'pink' }]], ['routineStep', ['Morning', 1]]];
  h.reset(); items.forEach(([fn, a]) => h.post(fn, a)); const separate = h.cost() + 900 * (items.length - 1);
  h.reset(); const r = h.post('batch', [items.map(([fn, args], i) => ({ id: 'x' + i, fn, args }))]); const batched = h.cost();
  assert.ok(r.ok, r.error); assert.strictEqual(r.result.results.length, 5); assert.ok(r.result.results.every(x => x.ok));
  assert.ok(r.result.state && r.result.state.game, 'one full screen at the end');
  assert.ok(r.result.results.every(x => x.result === null), 'each action skips building the screen');
  assert.ok(batched * 2.5 < separate, 'batched ~' + batched + ' ms vs separate ~' + separate + ' ms');
  assert.ok(batched < 2500, 'a batch of five stays under ~2.5 s of server time (~' + batched + ' ms)');
});

test('Performance budget: a warm refresh is cheap, and one failing action in a batch doesn\'t stop the rest', () => {
  const h = counting();
  h.post('appState', []); h.reset(); h.post('appState', []);
  assert.ok(h.cost() < 1300, 'a warm refresh ~' + h.cost() + ' ms');
  const r = h.post('batch', [[{ id: 'a', fn: 'buyWear', args: ['crown'] }, { id: 'b', fn: 'addWater', args: [1] }, { id: 'c', fn: 'nope', args: [] }]]);
  assert.deepStrictEqual(r.result.results.map(x => x.ok), [false, true, false]);
  assert.match(r.result.results[0].error, /chores|more/);
  assert.strictEqual(r.result.state.routines.water, 1);
});
