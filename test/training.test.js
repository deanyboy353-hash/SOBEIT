const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

const plain = x => JSON.parse(JSON.stringify(x));
function ready(iso = '2026-10-12T17:00:00Z') {   // Mon
  const g = loadProject({ now: new Date(iso) });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY };
}
const at = (g, iso) => { g.state.now = new Date(iso); g.state.cache = {}; g.ctx.resetRun_(); };
const doSession = (C, me, tpl, name) => C.saveWorkout(me, name, [{ exercise: 'Leg press', set: 1, weight: 100, reps: 10, rpe: 8 }], { template: tpl });
const next = (C, me) => plain(C.trainState(me)).split.next.name;

test('Rotation order: Upper/Lower goes Upper A, Lower A, Upper B, Lower B and round again; skipped days move nothing', () => {
  const { g, C, me } = ready();
  C.setSplit(me, 'ul');
  assert.strictEqual(next(C, me), 'Upper A');
  doSession(C, me, 'ul-ua', 'Upper A');
  at(g, '2026-10-13T17:00:00Z'); assert.strictEqual(next(C, me), 'Lower A');
  at(g, '2026-10-16T17:00:00Z'); assert.strictEqual(next(C, me), 'Lower A', 'three days off: still waiting');
  doSession(C, me, 'ul-la', 'Lower A');
  at(g, '2026-10-17T17:00:00Z'); assert.strictEqual(next(C, me), 'Upper B');
  doSession(C, me, 'ul-ub', 'Upper B');
  at(g, '2026-10-18T17:00:00Z'); doSession(C, me, 'ul-lb', 'Lower B');
  at(g, '2026-10-19T17:00:00Z'); assert.strictEqual(next(C, me), 'Upper A', 'a full lap starts again');
  // the home card shows it on any day, even a rest day
  C.setSetting_('Train any day I can make the bus', 'FALSE'); g.state.cache = {};
  at(g, '2026-10-22T17:00:00Z');                                  // Thu: not a training day
  const t = plain(C.todayState(me));
  assert.strictEqual(t.gym, null);
  assert.strictEqual(t.train.next.name, 'Upper A');
});

test('Switching splits keeps every logged set and starts the new split at its first session', () => {
  const { g, C, me } = ready();
  assert.strictEqual(next(C, me), 'Push', 'the default is your current split');
  doSession(C, me, 'ppsa-push', 'Push');
  at(g, '2026-10-13T17:00:00Z');
  assert.strictEqual(next(C, me), 'Pull');
  const rows = g.tab('Workout log').rows().length;
  C.setSplit(me, 'ppl');
  assert.strictEqual(next(C, me), 'Push', 'PPL starts at Push, not after the Push you did on Monday');
  doSession(C, me, 'ppl-push', 'Push');
  at(g, '2026-10-14T17:00:00Z');
  assert.strictEqual(next(C, me), 'Pull');
  C.setSplit(me, 'ppsa');
  assert.strictEqual(next(C, me), 'Push', 'switching back starts again at the first session');
  assert.strictEqual(g.tab('Workout log').rows().length, rows + 1, 'nothing removed');
  assert.ok(g.tab('Workout log').rows().some(r => r.includes('ppsa-push')));
  assert.throws(() => C.setSplit(me, 'bro-split'), /No split/);
  // a same-day switch after a session doesn't count that session for the new split
  C.setSplit(me, 'ul'); doSession(C, me, 'ul-ua', 'Upper A'); C.setSplit(me, 'ppl'); C.setSplit(me, 'ul');
  assert.strictEqual(next(C, me), 'Upper A');
});

test('The Pump never moves the rotation, never counts towards the week, and gives bonus XP once a day', () => {
  const { g, C, me } = ready();
  doSession(C, me, 'ppsa-push', 'Push');
  at(g, '2026-10-13T17:00:00Z');
  const xpBefore = C.xpOn_('me', '2026-10-13');
  const r = C.saveWorkout(me, 'Arms & Shoulders Pump', [{ exercise: 'Cable curl', set: 1, weight: 20, reps: 15, rpe: 9 }], { template: 'pump' });
  assert.strictEqual(r.extra, true); assert.strictEqual(r.bonus, 20);
  assert.strictEqual(C.xpOn_('me', '2026-10-13') - xpBefore, 20, 'bonus XP, not the 50 for a main session');
  C.saveWorkout(me, 'Arms & Shoulders Pump', [{ exercise: 'Cable curl', set: 1, weight: 20, reps: 15 }], { template: 'pump' });
  assert.strictEqual(C.xpOn_('me', '2026-10-13') - xpBefore, 20, 'bonus once a day');
  const s = plain(C.trainState(me)).split;
  assert.strictEqual(s.next.name, 'Pull', 'still Pull');
  assert.deepStrictEqual([s.week.done, s.week.target], [1, 4], 'only Monday\'s Push counts');
  assert.strictEqual(s.pump.doneToday, true);
  assert.ok(!g.tab('Gym log').rows().some(r => r[0] === '2026-10-13' && r[6] === 'Done'), 'today\'s gym session is still open');
  assert.throws(() => C.setTodaySession(me, 'Arms & Shoulders Pump'), /extra/);
  // a main session the same day still counts
  doSession(C, me, 'ppsa-pull', 'Pull');
  at(g, '2026-10-14T17:00:00Z');
  assert.strictEqual(next(C, me), 'Shoulders & Arms');
});

test('Progression hint: top of the range at or below the target RPE on every set; 2.5 kg, or 1–2 kg on small lifts', () => {
  const { C } = ready();
  const hint = (ex, reps, rpe, sets) => C.progressionHint(ex, reps, rpe, sets.map(([w, r, p]) => ({ w, r, rpe: p })));
  assert.strictEqual(hint('Bench press', '6-8', 8, [[80, 8, 8], [80, 8, 7.5]]).weight, 82.5);
  assert.strictEqual(hint('Bench press', '6-8', 8, [[80, 8, 8], [80, 7, 8]]), null, 'one set short');
  assert.strictEqual(hint('Bench press', '6-8', 8, [[80, 8, 8], [80, 8, 9]]), null, 'too hard: RPE 9 against a target of 8');
  const lat = hint('Cable lateral raise', '12-15', 9, [[10, 15, 9], [10, 15, 8]]);
  assert.deepStrictEqual([lat.add, lat.weight], [1, 11]); assert.match(lat.text, /1–2 kg/);
  assert.strictEqual(hint('Hack squat', '8-10', 8, [[120, 10, ''], [120, 10, '']]).weight, 122.5, 'old sets without an RPE count by reps');
  assert.strictEqual(hint('Bench press', '6-8', 8, []), null);
});

test('Before anything changes the gym data is backed up, old rows are kept, and history carries over to the new names', () => {
  const { g, C, me } = ready();
  // history from before the splits: the old names (and an import)
  delete g.state.props.TRAIN_V3;
  const old = [['2026-10-05', 'Push', 'Barbell bench press', 80, 8], ['2026-10-05', 'Push', 'Triceps pushdown', 30, 12], ['2026-10-07', 'Shoulders & Arms', 'Rear delt fly (machine)', 40, 15], ['2026-10-07', 'Shoulders & Arms', 'Seated calf raise', 60, 15]];
  old.forEach(([d, s, e, w, r]) => C.appendRow_('workoutLog', { Date: d, Session: s, Exercise: e, Tier: 'Acc', Set: 1, 'Weight (kg)': w, Reps: r, e1RM: C.e1rm(w, r), Workout: 'w' + d }));
  const before = g.tab('Workout log').rows().length;
  const res = plain(C.ensureSplits_());
  assert.ok(res.backup.rows >= before, 'every gym row is in the backup');
  const book = g.state.spreadsheets.find(x => x.getSheetByName('Gym before splits'));
  assert.ok(book && book.getSheetByName('Gym before splits').rows().length >= 2, 'backup sheet written');
  assert.strictEqual(g.tab('Workout log').rows().length, before, 'nothing deleted');
  assert.strictEqual(res.renamed['Barbell bench press'], 'Bench press');
  assert.strictEqual(res.renamed['Triceps pushdown'], 'Rope pushdown');
  assert.ok(res.other.includes('Seated calf raise'), 'a lift the templates dropped is kept as it was');
  assert.strictEqual(C.ensureSplits_().at, res.at, 'runs once');
  // last time and the hint come through under the new names
  const tpl = plain(C.trainState(me)).tpl;
  assert.deepStrictEqual(tpl['ppsa-push'].ex.find(x => x.exercise === 'Bench press').last.map(s => [s.w, s.r]), [[80, 8]]);
  assert.deepStrictEqual(tpl['ppsa-sa'].ex.find(x => x.exercise === 'Reverse pec deck').last.map(s => [s.w, s.r]), [[40, 15]]);
  // the main-lift chart has the whole history
  const lifts = plain(C.trainState(me)).lifts;
  assert.deepStrictEqual(lifts.find(l => l.lift === 'Bench press').points[0].slice(0, 2), ['2026-10-05', 101.3]);
});

test('Swaps follow the rules and are remembered; templates can be edited and reset to default', () => {
  const { C, me } = ready();
  let t = plain(C.trainState(me)).tpl['ppsa-pull'];
  const pd = t.ex.find(x => x.exercise === 'Lat pulldown');
  assert.ok(pd.options.includes('Close-grip pulldown'));
  Object.values(plain(C.trainState(me)).tpl).forEach(tp => tp.ex.forEach(x => x.options.forEach(o => assert.ok(!/dead|rdl|romanian|good morning|back squat|calf/i.test(o), o))));
  C.swapExercise(me, 'ppsa-pull', 'Lat pulldown', 'Close-grip pulldown');
  t = plain(C.trainState(me)).tpl['ppsa-pull'];
  assert.deepStrictEqual([t.ex[0].exercise, t.ex[0].base, t.ex[0].swapped], ['Close-grip pulldown', 'Lat pulldown', true]);
  assert.throws(() => C.swapExercise(me, 'ppsa-pull', 'Lat pulldown', 'Romanian deadlift'), /breaks the rules/);
  assert.throws(() => C.swapExercise(me, 'ppsa-push', 'Hack squat', 'Seated calf raise'), /breaks the rules/);
  C.swapExercise(me, 'ppsa-pull', 'Lat pulldown', '');
  assert.strictEqual(plain(C.trainState(me)).tpl['ppsa-pull'].ex[0].exercise, 'Lat pulldown', 'changed back');
  C.editTemplate(me, 'ppsa-push', [{ exercise: 'Bench press', sets: 5, reps: '5', rpe: 8, rest: '3 min' }, { exercise: 'Leg press', sets: 4, reps: '10-12', rpe: 8, rest: '2 min' }]);
  t = plain(C.trainState(me)).tpl['ppsa-push'];
  assert.deepStrictEqual(t.ex.map(x => [x.exercise, x.sets, x.reps, x.restSec]), [['Bench press', 5, '5', 180], ['Leg press', 4, '10-12', 120]]);
  assert.strictEqual(t.edited, true);
  assert.throws(() => C.editTemplate(me, 'ppsa-push', [{ exercise: 'Deadlift', sets: 3 }]), /breaks the rules/);
  C.resetTemplate(me, 'ppsa-push');
  t = plain(C.trainState(me)).tpl['ppsa-push'];
  assert.strictEqual(t.ex.length, 5); assert.strictEqual(t.edited, false);
});

test('Every split: no hip hinges or calves, more back than chest sets, supersets in pairs, 4 to 8 exercises', () => {
  const { C } = ready();
  const T = plain(C.TEMPLATES), back = /pulldown|row|pull-up|face pull|reverse pec/i, chest = /bench|chest press|incline db press|fly/i;
  Object.entries(T).forEach(([id, t]) => {
    assert.ok(t.ex.length >= 4 && t.ex.length <= 8, id);
    t.ex.forEach(r => { assert.ok(!/dead|rdl|romanian|good morning|back squat|calf/i.test(r[0]), id + ' ' + r[0]); assert.ok(r[1] && r[2] && r[3], id + ' ' + r[0]); });
    const groups = {}; t.ex.forEach(r => { if (r[5]) groups[r[5]] = (groups[r[5]] || 0) + 1; });
    Object.values(groups).forEach(n => assert.strictEqual(n, 2, id + ': supersets come in pairs'));
  });
  Object.entries(C.SPLITS).forEach(([s, sp]) => {
    const sets = re => sp.order.reduce((a, id) => a + T[id].ex.filter(r => re.test(r[0])).reduce((b, r) => b + r[1], 0), 0);
    assert.ok(sets(back) > sets(chest), s + ': back ' + sets(back) + ' sets vs chest ' + sets(chest));
  });
});
