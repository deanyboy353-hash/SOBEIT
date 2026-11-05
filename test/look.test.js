const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const Look = require('../web/look.js');
const plain = x => JSON.parse(JSON.stringify(x));

function ready() {
  const g = loadProject({ now: new Date('2026-10-14T08:00:00Z') });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
// a seeded random, so results repeat
const seeded = n => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };

test('Characters: save what you wear, reload the app, it is still there; each of you has your own', () => {
  const { g, C, me, partner } = ready();
  C.setLook3d(me, { hair: 'afro', hairC: '#e8c37a', top: 'hoodie', topC: '#7c5cff', bottom: 'baggy', shoes: 'boots', acc: ['cap', 'hoops'], beard: 'goatee', build: 'broad', height: 'tall', eyeC: '#3f7cc0', freckles: true });
  // a fresh load of the project from the same stored data, as when the app opens again
  const again = plain(C.appState(me)).wardrobe.look;
  assert.strictEqual(again.hair, 'afro'); assert.strictEqual(again.hairC, '#e8c37a'); assert.strictEqual(again.top, 'hoodie');
  assert.deepStrictEqual(again.acc, ['cap', 'hoops']); assert.strictEqual(again.beard, 'goatee'); assert.strictEqual(again.build, 'broad');
  assert.strictEqual(again.height, 'tall'); assert.strictEqual(again.eyeC, '#3f7cc0'); assert.strictEqual(again.freckles, true);
  assert.notStrictEqual(plain(C.appState(partner)).wardrobe.look.hair, 'afro', 'Yaz keeps her own look');
  assert.strictEqual(plain(C.appState(partner)).wardrobe.other.hair, 'afro', 'and sees yours');
});

test('Saved looks: three slots each; save, wear, replace, delete; things you don\'t own can\'t be saved', () => {
  const { C, me, partner } = ready();
  let s = plain(C.appState(me)).wardrobe;
  assert.deepStrictEqual(s.saved, [null, null, null]);
  C.setLook3d(me, { hair: 'cornrows', top: 'tracktop', bottom: 'trackpants', topC: '#2e9e4f' });
  s = plain(C.saveLookSlot(me, 0, 'Gym')).wardrobe;
  assert.strictEqual(s.saved[0].name, 'Gym'); assert.strictEqual(s.saved[0].look.top, 'tracktop');
  s = plain(C.saveLookSlot(me, 1, '  Night   out ', { hair: 'afro', top: 'bomber', topC: '#111111' })).wardrobe;
  assert.strictEqual(s.saved[1].name, 'Night out'); assert.strictEqual(s.saved[1].look.top, 'bomber');
  assert.strictEqual(s.look.top, 'tracktop', 'saving a slot doesn\'t change what you wear');
  s = plain(C.wearLookSlot(me, 1)).wardrobe;
  assert.strictEqual(s.look.top, 'bomber'); assert.strictEqual(s.look.hair, 'afro'); assert.strictEqual(s.look.topC, '#111111');
  s = plain(C.wearLookSlot(me, 0)).wardrobe;
  assert.strictEqual(s.look.top, 'tracktop');
  assert.throws(() => C.saveLookSlot(me, 2, 'Gala', { top: 'bodice' }), /don't own/);
  assert.throws(() => C.saveLookSlot(me, 3, 'Four'), /three slots/);
  assert.throws(() => C.wearLookSlot(me, 2), /Nothing saved/);
  s = plain(C.saveLookSlot(me, 0, 'Gym v2')).wardrobe;
  assert.strictEqual(s.saved[0].name, 'Gym v2');
  s = plain(C.deleteLookSlot(me, 1)).wardrobe;
  assert.strictEqual(s.saved[1], null);
  assert.deepStrictEqual(plain(C.appState(partner)).wardrobe.saved, [null, null, null], 'slots are per person');
});

test('Randomise: only things you own, never your body or skin; undo and redo walk back and forward', () => {
  const { C, me } = ready();
  const W = plain(C.appState(me)).wardrobe;
  const base = W.look;
  for (let n = 1; n < 40; n++) {
    const L = Look.randomise(W.catalog, W.owned, seeded(n * 7919), base);
    ['hair', 'top', 'bottom', 'shoes'].forEach(k => assert.ok(W.owned.includes(L[k]), k + ' ' + L[k] + ' is owned'));
    (L.acc || []).forEach(a => assert.ok(W.owned.includes(a)));
    assert.ok(L.acc.length <= 4);
    assert.strictEqual(L.body, base.body); assert.strictEqual(L.skin, base.skin);
    assert.notStrictEqual(L.topC, L.botC, 'top and bottoms never the same colour');
    C.setLook3d(me, L);            // anything randomise makes can be saved
  }
  const h = Look.history({ top: 'tee' });
  assert.strictEqual(h.canUndo(), false);
  h.push({ top: 'hoodie' }); h.push({ top: 'bomber' }); h.push({ top: 'bomber' });
  assert.deepStrictEqual(h.undo(), { top: 'hoodie' });
  assert.deepStrictEqual(h.undo(), { top: 'tee' });
  assert.strictEqual(h.undo(), null);
  assert.deepStrictEqual(h.redo(), { top: 'hoodie' });
  h.push({ top: 'crop' });
  assert.strictEqual(h.canRedo(), false, 'a new change clears redo');
});

test('Unlocks: the Jheri curl still needs 3 chores; earned outfits come from achievements', () => {
  const { C, me } = ready();
  let W = plain(C.appState(me)).wardrobe;
  const jheri = W.catalog.find(x => x.id === 'jheri');
  assert.strictEqual(jheri.chores, 3);
  assert.ok(!W.owned.includes('jheri'));
  assert.ok(W.catalog.filter(x => x.ach).length >= 4);
  assert.ok(W.owned.length >= 30, 'a big starter set: ' + W.owned.length);
});
