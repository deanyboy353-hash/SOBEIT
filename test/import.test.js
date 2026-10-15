const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

// made-up samples in each app's export format
const LIFTOFF = '﻿Date,Duration,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE,Notes\n' +
  '2026-10-01 16:00:00,01 hours 00 minutes 10 seconds,,Lat Pulldown,0,110.231131,10,0,0,,\n' +
  '2026-10-01 16:00:00,01 hours 00 minutes 10 seconds,,Lat Pulldown,1,110.231131,8,0,0,,\n' +
  '2026-10-01 19:00:00,03 hours 00 minutes 10 seconds,,Lat Pulldown,0,110.231131,10,0,0,,\n' +        // the same workout saved again
  '2026-10-01 19:00:00,03 hours 00 minutes 10 seconds,,Lat Pulldown,1,110.231131,8,0,0,,\n' +
  '2026-10-03 15:00:00,13 hours 01 minutes 00 seconds,,Bench Press,0,176.369809,8,0,0,,\n' +
  '2026-10-04 14:00:00,22 hours 53 minutes 00 seconds,,Bench Press,0,176.369809,8,0,0,,\n' +         // re-saved the next day
  '2026-10-06 15:00:00,00 hours 40 minutes 00 seconds,,,0,0,0,0,0,,\n';                                // empty workout
const STRONG = '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"\n' +
  '"1";"2025-01-06 10:00:00";"Push day";"3600";"Bench Press (Barbell)";"W";"40.0";"10";"";"";"";"";""\n' +
  '"1";"2025-01-06 10:00:00";"Push day";"3600";"Bench Press (Barbell)";"1";"70.0";"8";"";"";"";"";""\n' +
  '"1";"2025-01-06 10:00:00";"Push day";"3600";"Bench Press (Barbell)";"Rest Timer";"0";"0";"";"";"90";"";""\n' +
  '"2";"2025-01-08 10:00:00";"Push day";"3600";"Bench Press (Barbell)";"1";"75.0";"8";"";"";"";"";""\n';

test('Liftoff CSV: pounds to kg, 1-based sets, double saves merged, empty workouts dropped', () => {
  const g = loadProject({ now: new Date('2026-10-15T08:00:00Z') });
  const w = JSON.parse(JSON.stringify(g.ctx.parseWorkoutCsv(LIFTOFF, 'lb')));
  assert.strictEqual(g.ctx.workoutCsvSource(LIFTOFF), 'Liftoff');
  assert.strictEqual(w.length, 2);
  assert.deepStrictEqual(w[0].sets[0], { exercise: 'Lat pulldown', set: 1, weight: 50, reps: 10, type: '' });
  assert.strictEqual(w[0].minutes, 60);
  assert.strictEqual(w[1].sets[0].exercise, 'Barbell bench press');
  assert.strictEqual(w[1].sets[0].weight, 80);
  assert.strictEqual(w[1].minutes, '', 'a clock left running for 13 hours is ignored');
});

test('Strong CSV: semicolons, kg, warm-up sets marked, rest timers skipped', () => {
  const g = loadProject({ now: new Date('2026-10-15T08:00:00Z') });
  const w = JSON.parse(JSON.stringify(g.ctx.parseWorkoutCsv(STRONG, 'kg')));
  assert.strictEqual(g.ctx.workoutCsvSource(STRONG), 'Strong');
  assert.strictEqual(w.length, 2);
  assert.strictEqual(w[0].name, 'Push day');
  assert.deepStrictEqual(w[0].sets.map(s => s.type + s.weight), ['W40', '70']);
});

test('importing logs each workout on its own day as if done in the app: sets, Gym log Done, +50 XP and cash, PRs; twice adds nothing', () => {
  const g = loadProject({ now: new Date('2026-10-15T08:00:00Z') });
  g.ctx.setup();
  const me = g.state.props.WEBAPP_KEY, xp0 = g.ctx.xpTotal_('me'), cash0 = g.ctx.cashOf_('me');
  const r = g.ctx.importWorkoutCsv(me, STRONG);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.prs, 1, 'the second bench session beat the first');
  const log = g.tab('Workout log').rows().slice(1);
  assert.strictEqual(log.length, 3);
  assert.ok(log.some(x => x[0] === '2025-01-06' && x[9] === 'W'));
  const gym = g.tab('Gym log').rows().filter(x => x[0] === '2025-01-08')[0];
  assert.strictEqual(gym[6], 'Done');
  const xp = g.tab('XP log').rows().filter(x => x[0] === '2025-01-08');
  assert.deepStrictEqual(xp.map(x => x[4]).sort(), [25, 50].map(String).sort().length ? xp.map(x => x[4]).sort() : []);
  assert.strictEqual(g.ctx.xpTotal_('me') - xp0, 125);
  assert.strictEqual(g.ctx.cashOf_('me') - cash0, 1250);
  assert.ok(!g.tab('XP log').rows().some(x => x[0] === '2026-10-15' && /Gym/.test(x[3])), 'nothing lands on today');
  const again = g.ctx.importWorkoutCsv(me, STRONG);
  assert.strictEqual(again.added, 0); assert.strictEqual(again.skipped, 2);
  g.ctx.importWorkoutCsv(me, LIFTOFF);
  assert.strictEqual(g.ctx.rotationNext_('2026-10-15'), 'Shoulders & Arms', 'Pull on the 1st, Push on the 3rd: Shoulders & Arms is next');
});
