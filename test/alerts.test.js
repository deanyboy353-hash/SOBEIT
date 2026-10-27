const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

const g0 = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
const due = c => JSON.parse(JSON.stringify(g0.ctx.dueAlerts(Object.assign({ bins: {} }, c)).map(a => a.who + ':' + a.id)));
const food = (o) => Object.assign({ entries: 0, kcal: 0, protein: 0, kcalTarget: 2200, proteinMin: 140 }, o);

test('leave-by fires 15 minutes before you need to go, once the gym is not done', () => {
  const gym = { session: 'Push', done: false, travel: 'Bus', bus: '201', leaveAt: 17 * 60 + 30 };
  assert.deepStrictEqual(due({ m: 17 * 60 + 15, gym }), ['me:leave']);
  assert.deepStrictEqual(due({ m: 17 * 60 + 10, gym }), []);
  assert.deepStrictEqual(due({ m: 17 * 60 + 40, gym }), [], 'not after the window');
  assert.deepStrictEqual(due({ m: 17 * 60 + 15, gym: Object.assign({}, gym, { done: true }) }), []);
});

test('weigh-in at wake time on weigh days only, and not once weighed', () => {
  assert.deepStrictEqual(due({ m: 510, wake: 510, weighDay: true, weighed: false }), ['me:weigh']);
  assert.deepStrictEqual(due({ m: 510, wake: 510, weighDay: false }), []);
  assert.deepStrictEqual(due({ m: 515, wake: 510, weighDay: true, weighed: true }), []);
});

test('meal nudges at 10–11, 2–3pm and 7–8pm, only if nothing has been logged for that meal; evening food check reports what is left', () => {
  assert.deepStrictEqual(due({ m: 600, food: food() }), ['me:meal1']);
  assert.deepStrictEqual(due({ m: 650, food: food({ entries: 1, lastAt: 540 }) }), [], 'breakfast logged at 9');
  assert.deepStrictEqual(due({ m: 720, food: food() }), [], 'nothing at noon now');
  assert.deepStrictEqual(due({ m: 14 * 60 + 10, food: food({ entries: 1, lastAt: 540 }) }), ['me:meal2'], 'breakfast only: lunch nudge');
  assert.deepStrictEqual(due({ m: 14 * 60 + 10, food: food({ entries: 2, lastAt: 13 * 60 }) }), [], 'lunch logged');
  assert.deepStrictEqual(due({ m: 19 * 60 + 40, food: food({ entries: 2, lastAt: 13 * 60 }) }), ['me:meal3']);
  assert.deepStrictEqual(due({ m: 20 * 60 + 5, food: food({ entries: 2, lastAt: 13 * 60 }) }), [], 'the hour is over');
  const m = g0.ctx.dueAlerts({ m: 600, food: food(), bins: {} })[0];
  assert.match(m.title + ' ' + m.body, /Breakfast\?.*protein/);
  const a = g0.ctx.dueAlerts({ m: 1380, foodAt: 1380, food: food({ entries: 3, kcal: 1900, protein: 110 }), bins: {} });
  assert.strictEqual(a[0].id, 'foodcheck');
  assert.strictEqual(a[0].title, '30g protein to go · 300 kcal left');
  const b = g0.ctx.dueAlerts({ m: 1385, foodAt: 1380, food: food({ entries: 3, kcal: 2500, protein: 150 }), bins: {} });
  assert.strictEqual(b[0].title, 'Protein done · 300 kcal over');
});

test('bins the evening before, to whoever has the job', () => {
  const a = g0.ctx.dueAlerts({ m: 19 * 60 + 5, bins: { me: [], partner: ['Bins out: Blue bin'] } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.map(x => x.who + ':' + x.id))), ['partner:bins']);
  assert.strictEqual(a[0].body, 'Blue bin collected tomorrow.');
});

test('heartbeat sends each alert once a day, even at 11pm after the old reminder cut-off', () => {
  const g = loadProject({ now: new Date('2026-10-13T22:00:00Z') });   // 23:00 BST
  g.ctx.setup();
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.ctx.registerDevice(g.state.props.WEBAPP_KEY, 'me-phone-token-0123456789', 'Pixel');
  g.ctx.heartbeat_();
  g.ctx.heartbeat_();
  const sent = g.state.pushes.filter(p => p.token === 'me-phone-token-0123456789');
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].title, /Fancy logging today\?/);
  assert.strictEqual(sent[0].tab, 'food');
});
