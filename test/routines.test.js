const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const plain = x => JSON.parse(JSON.stringify(x));

function ready() {
  const g = loadProject({ now: new Date('2026-10-14T08:00:00Z') });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}

test('Routines: edit steps from the app; ticks follow their step; rename, add, delete', () => {
  const { C, me } = ready();
  C.routineStep(me, 'Morning', 1);            // Glass of water
  C.routineStep(me, 'Morning', 2);            // Teeth
  let s = plain(C.saveRoutine(me, 'Morning', { name: 'Wake up', time: '07:45', steps: ['Teeth', 'Glass of water', 'Stretch 5 min'] }));
  let r = s.routines.routines.find(x => x.name === 'Wake up');
  assert.deepStrictEqual(r.steps, ['Teeth', 'Glass of water', 'Stretch 5 min']);
  assert.strictEqual(r.time, '07:45');
  assert.deepStrictEqual(r.done.sort(), [0, 1], 'ticks moved with their steps');
  assert.ok(!s.routines.routines.find(x => x.name === 'Morning'));
  s = plain(C.saveRoutine(me, '', { name: 'Gym bag', time: '', steps: ['Shoes', 'Towel'] }));
  assert.ok(s.routines.routines.find(x => x.name === 'Gym bag'));
  assert.throws(() => C.saveRoutine(me, '', { name: 'Gym bag', steps: ['x'] }), /already have/);
  assert.throws(() => C.saveRoutine(me, '', { name: 'Empty', steps: [] }), /at least one step/);
  s = plain(C.deleteRoutine(me, 'Gym bag'));
  assert.ok(!s.routines.routines.find(x => x.name === 'Gym bag'));
});

test('Routines: partner gets their own; water goal per person, 0 hides it', () => {
  const { C, me, partner } = ready();
  const s = plain(C.saveRoutine(partner, '', { name: 'Morning', time: '09:00', steps: ['Skincare'] }));
  assert.deepStrictEqual(s.routines.routines.map(r => r.name), ['Morning']);
  assert.ok(plain(C.appState(me)).routines.routines.find(r => r.name === 'Morning').steps.length > 1, 'mine untouched');
  C.setPrefs(me, { waterGoal: 10 });
  assert.strictEqual(plain(C.appState(me)).routines.waterGoal, 10);
  C.setPrefs(partner, { waterGoal: 0 });
  assert.strictEqual(plain(C.appState(partner)).routines.waterGoal, 0);
});
