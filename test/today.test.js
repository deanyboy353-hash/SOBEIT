const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready(iso) {
  const g = loadProject({ now: new Date(iso) });
  g.ctx.setup();
  return { g, key: g.state.props.WEBAPP_KEY };
}

test('Today on a training day: session, leave time, exercises; Gym done logs it and ticks the task', () => {
  const { g, key } = ready('2026-10-13T05:05:00Z'); // Tue
  let s = g.ctx.todayState(key);
  assert.strictEqual(s.gym.session, 'Push');
  assert.strictEqual(s.gym.travel, 'Bus');
  assert.strictEqual(s.gym.leaveAt, '14:59');
  assert.strictEqual(s.gym.homeBy, '17:26');
  assert.match(s.gym.plan, /bus 3 at 15:01/);
  assert.strictEqual(s.gym.exercises[0].exercise, 'Barbell bench press');
  assert.strictEqual(s.gym.done, false);
  s = g.ctx.gymDone(key);
  assert.strictEqual(s.gym.done, true);
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Done');
  assert.strictEqual(g.tasks.open().filter(t => /Gym done/.test(t.title)).length, 0, 'Gym done task ticked too');
  g.ctx.pollTasks();
  assert.strictEqual(g.tab('Gym log').getLastRow(), 2, 'not logged twice');
});

test('Today on a rest day: no gym', () => {
  const { g, key } = ready('2026-10-15T05:05:00Z'); // Thu, with fixed training days
  g.ctx.setSetting_('Train any day I can make the bus', 'FALSE'); g.state.cache = {};
  assert.strictEqual(g.ctx.todayState(key).gym, null);
});

test('weigh-in from the app logs once and ticks the task', () => {
  const { g, key } = ready('2026-10-12T07:40:00Z'); // Mon
  let s = g.ctx.todayState(key);
  assert.strictEqual(s.weighDay, true);
  assert.strictEqual(s.weighedToday, false);
  assert.throws(() => g.ctx.logWeightNow(key, 'heavy'), /Couldn't read a weight/);
  s = g.ctx.logWeightNow(key, '13st 2');
  assert.strictEqual(s.weighedToday, true);
  assert.strictEqual(s.lastWeight.kg, 83.5);
  assert.strictEqual(g.tasks.open().filter(t => /Weigh-in/.test(t.title)).length, 0);
  g.ctx.pollTasks();
  g.state.now = new Date('2026-10-13T05:05:00Z');
  g.ctx.dailyRun(); // next-morning sweep must not log it again
  assert.strictEqual(g.tab('Weight').getLastRow(), 2);
});
