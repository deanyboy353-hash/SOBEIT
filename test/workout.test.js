const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready() {
  const g = loadProject({ now: new Date('2026-10-13T15:30:00Z') }); // Tue, Upper A
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY };
}

test('Sessions tab upgraded to accessories; Lifts and Programme tabs seeded', () => {
  const { g } = ready();
  assert.strictEqual(g.tab('Sessions').rows()[1][1], 'Barbell row');
  assert.deepStrictEqual(g.tab('Lifts').rows().slice(1).map(r => r[0]), ['Bench press', 'Overhead press', 'Squat', 'Deadlift']);
  assert.strictEqual(g.tab('Programme').rows()[1][1], 'Bench press');
});

test('set a training max from a recent set; plan shows nSuns weights', () => {
  const { C, me } = ready();
  let t = C.trainState(me);
  assert.strictEqual(t.today, 'Upper A');
  assert.strictEqual(t.plans['Upper A'].main[0].tm, null);
  t = C.setTrainingMax(me, 'Bench press', 80, 5);        // e1RM 93.3 → TM 84 → 85 (2.5 steps)
  const t1 = t.plans['Upper A'].main[0];
  assert.strictEqual(t1.tm, 85);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t1.sets.slice(0, 3).map(s => [s.weight, s.reps, s.amrap]))), [[65, 5, false], [72.5, 3, false], [80, 1, true]]);
  assert.strictEqual(t1.sets.length, 9);
  assert.throws(() => C.setTrainingMax(me, 'Bench press', 80, 40), /1–15 reps/);
});

test('saving a workout: logs sets, progresses TM from the 1+ set, spots PRs, logs the gym session', () => {
  const { g, C, me } = ready();
  C.setTrainingMax(me, 'Bench press', 80, 5);
  C.setTrainingMax(me, 'Overhead press', 50, 5);
  const plan = C.trainState(me).plans['Upper A'];
  const sets = [];
  plan.main.forEach(m => m.sets.forEach((s, i) => sets.push({ exercise: m.exercise, tier: m.tier, set: i + 1, weight: s.weight, reps: s.amrap && m.tier === 'T1' && i === 2 ? 5 : s.reps, target: s.reps + (s.amrap ? '+' : '') })));
  sets.push({ exercise: 'Barbell row', tier: 'Acc', set: 1, weight: 60, reps: 8, target: '6-8' });
  const res = C.saveWorkout(me, 'Upper A', sets);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(res.changes.map(c => [c.lift, c.from, c.to, c.reps]))), [['Bench press', 85, 87.5, 5]]);
  assert.strictEqual(g.tab('Lifts').rows()[1][1], 87.5);
  assert.strictEqual(g.tab('Workout log').getLastRow(), 1 + 9 + 8 + 1);
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Done');
  assert.ok(res.state.game.xpToday >= 50);
  assert.strictEqual(res.prs.length, 0, 'first ever workout: nothing to beat yet');

  // a week later: heavier, PR on bench, and the accessory suggests +2.5 because 8/8 hit the top of 6-8
  g.state.now = new Date('2026-10-20T15:30:00Z');
  const p2 = C.trainState(me).plans['Upper A'];
  assert.strictEqual(p2.main[0].sets[2].weight, 82.5);
  assert.strictEqual(p2.accessories[0].suggest, 62.5);
  assert.strictEqual(p2.accessories[0].bumped, true);
  const r2 = C.saveWorkout(me, 'Upper A', [{ exercise: 'Bench press', tier: 'T1', set: 3, weight: 82.5, reps: 7, target: '1+' }]);
  assert.strictEqual(r2.changes[0].change, 5, '6+ reps on upper = +5');
  assert.strictEqual(r2.prs[0].exercise, 'Bench press');
  const prog = C.trainState(me).progress;
  assert.strictEqual(prog.lifts.find(l => l.lift === 'Bench press').tm, 92.5);
  assert.ok(prog.lifts.find(l => l.lift === 'Bench press').best > 100);
  assert.strictEqual(prog.workouts, 2);
});

test('gym calendar event lists the main lifts with weights', () => {
  const { g, C, me } = ready();
  C.setTrainingMax(me, 'Bench press', 80, 5);
  g.state.now = new Date('2026-10-13T05:05:00Z');
  C.dailyRun();
  const ev = g.calendar.live().find(e => e.tags.sobeit === 'gym');
  assert.match(ev.opts.description, /Bench press \(T1\): 65×5, 72\.5×3, 80×1\+/);
});
