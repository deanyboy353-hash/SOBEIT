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

test('Presets: Push, Pull, Legs and Full Body count as the gym session but never move the rotation; an old split choice moves to Upper / Lower', () => {
  const { g, C, me } = ready();
  assert.strictEqual(next(C, me), 'Upper A', 'Upper / Lower is the split');
  const sp = plain(C.trainState(me)).split;
  assert.deepStrictEqual(sp.splits.map(x => x.id), ['ul']);
  assert.deepStrictEqual(sp.presets.map(x => x.name), ['Push', 'Pull', 'Legs', 'Full Body', 'Arms & Shoulders Pump']);
  doSession(C, me, 'ul-ua', 'Upper A');
  at(g, '2026-10-13T17:00:00Z');
  const xp0 = C.xpOn_('me', '2026-10-13');
  const r = doSession(C, me, 'ppl-legs', 'Legs');
  assert.strictEqual(r.extra, false);
  assert.strictEqual(C.xpOn_('me', '2026-10-13') - xp0, 50, 'a preset is a gym session: 50 XP');
  assert.ok(g.tab('Gym log').rows().some(x => x[0] === '2026-10-13' && x[6] === 'Done' && x.includes('ppl-legs')), 'logged under the PPL Legs template');
  at(g, '2026-10-14T17:00:00Z');
  doSession(C, me, 'full', 'Full Body');
  at(g, '2026-10-15T17:00:00Z');
  const s2 = plain(C.trainState(me)).split;
  assert.strictEqual(s2.next.name, 'Lower A', 'the rotation waits on Lower A');
  assert.strictEqual(s2.week.done, 3, 'all three count towards the week');
  assert.strictEqual(C.templateByName_('Push'), 'ppl-push', 'Push now means the PPL preset');
  assert.throws(() => C.setSplit(me, 'ppsa'), /No split/);
  // someone still on the old Push / Pull / Shoulders & Arms split moves to Upper / Lower from today, at Upper A, history kept
  const rows = g.tab('Workout log').rows().length;
  g.state.props.TRAIN_SPLIT = JSON.stringify({ split: 'ppsa', since: '2026-10-01', skip: 0 }); g.state.cache = {};
  assert.strictEqual(next(C, me), 'Upper A');
  assert.deepStrictEqual(JSON.parse(g.state.props.TRAIN_SPLIT), { split: 'ul', since: '2026-10-15', skip: 0, from: 'ppsa' });
  assert.strictEqual(g.tab('Workout log').rows().length, rows, 'nothing removed');
});

test('The Pump never moves the rotation, never counts towards the week, and gives bonus XP once a day', () => {
  const { g, C, me } = ready();
  doSession(C, me, 'ul-ua', 'Upper A');
  at(g, '2026-10-13T17:00:00Z');
  const xpBefore = C.xpOn_('me', '2026-10-13');
  const r = C.saveWorkout(me, 'Arms & Shoulders Pump', [{ exercise: 'Cable curl', set: 1, weight: 20, reps: 15, rpe: 9 }], { template: 'pump' });
  assert.strictEqual(r.extra, true); assert.strictEqual(r.bonus, 20);
  assert.strictEqual(C.xpOn_('me', '2026-10-13') - xpBefore, 20, 'bonus XP, not the 50 for a main session');
  C.saveWorkout(me, 'Arms & Shoulders Pump', [{ exercise: 'Cable curl', set: 1, weight: 20, reps: 15 }], { template: 'pump' });
  assert.strictEqual(C.xpOn_('me', '2026-10-13') - xpBefore, 20, 'bonus once a day');
  const s = plain(C.trainState(me)).split;
  assert.strictEqual(s.next.name, 'Lower A', 'still Lower A');
  assert.deepStrictEqual([s.week.done, s.week.target], [1, 4], 'only Monday\'s Upper A counts');
  assert.strictEqual(s.pump.doneToday, true);
  assert.ok(!g.tab('Gym log').rows().some(r => r[0] === '2026-10-13' && r[6] === 'Done'), 'today\'s gym session is still open');
  assert.throws(() => C.setTodaySession(me, 'Arms & Shoulders Pump'), /extra/);
  // a main session the same day still counts
  doSession(C, me, 'ul-la', 'Lower A');
  at(g, '2026-10-14T17:00:00Z');
  assert.strictEqual(next(C, me), 'Upper B');
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
  assert.deepStrictEqual(tpl['ul-ua'].ex.find(x => x.exercise === 'Bench press').last.map(s => [s.w, s.r]), [[80, 8]]);
  assert.deepStrictEqual(tpl['pump'].ex.find(x => x.exercise === 'Reverse pec deck').last.map(s => [s.w, s.r]), [[40, 15]]);
  // the main-lift chart has the whole history
  const lifts = plain(C.trainState(me)).lifts;
  assert.deepStrictEqual(lifts.find(l => l.lift === 'Bench press').points[0].slice(0, 2), ['2026-10-05', 101.3]);
});

test('Swaps follow the rules and are remembered; templates can be edited and reset to default', () => {
  const { C, me } = ready();
  let t = plain(C.trainState(me)).tpl['ul-ua'];
  const pd = t.ex.find(x => x.exercise === 'Lat pulldown');
  assert.ok(pd.options.includes('Close-grip pulldown'));
  Object.values(plain(C.trainState(me)).tpl).forEach(tp => tp.ex.forEach(x => x.options.forEach(o => assert.ok(!/dead|rdl|romanian|good morning|back squat|calf/i.test(o), o))));
  C.swapExercise(me, 'ul-ua', 'Lat pulldown', 'Close-grip pulldown');
  t = plain(C.trainState(me)).tpl['ul-ua'];
  assert.deepStrictEqual([t.ex[2].exercise, t.ex[2].base, t.ex[2].swapped], ['Close-grip pulldown', 'Lat pulldown', true]);
  assert.throws(() => C.swapExercise(me, 'ul-ua', 'Lat pulldown', 'Romanian deadlift'), /breaks the rules/);
  assert.throws(() => C.swapExercise(me, 'ul-la', 'Hack squat', 'Seated calf raise'), /breaks the rules/);
  C.swapExercise(me, 'ul-ua', 'Lat pulldown', '');
  assert.strictEqual(plain(C.trainState(me)).tpl['ul-ua'].ex[2].exercise, 'Lat pulldown', 'changed back');
  C.editTemplate(me, 'ul-ua', [{ exercise: 'Bench press', sets: 5, reps: '5', rpe: 8, rest: '3 min' }, { exercise: 'Leg press', sets: 4, reps: '10-12', rpe: 8, rest: '2 min' }]);
  t = plain(C.trainState(me)).tpl['ul-ua'];
  assert.deepStrictEqual(t.ex.map(x => [x.exercise, x.sets, x.reps, x.restSec]), [['Bench press', 5, '5', 180], ['Leg press', 4, '10-12', 120]]);
  assert.strictEqual(t.edited, true);
  assert.throws(() => C.editTemplate(me, 'ul-ua', [{ exercise: 'Deadlift', sets: 3 }]), /breaks the rules/);
  C.resetTemplate(me, 'ul-ua');
  t = plain(C.trainState(me)).tpl['ul-ua'];
  assert.strictEqual(t.ex.length, 7); assert.strictEqual(t.edited, false);
});

test('Every split and preset: no hip hinges or calves, more back than chest sets, supersets in pairs, 4 to 8 exercises', () => {
  const { C } = ready();
  const T = plain(C.TEMPLATES), back = /pulldown|row|pull-up|face pull|reverse pec/i, chest = /bench|chest press|incline db press|fly/i;
  Object.entries(T).forEach(([id, t]) => {
    assert.ok(t.ex.length >= 4 && t.ex.length <= 8, id);
    t.ex.forEach(r => { assert.ok(!/dead|rdl|romanian|good morning|back squat|calf/i.test(r[0]), id + ' ' + r[0]); assert.ok(r[1] && r[2] && r[3], id + ' ' + r[0]); });
    const groups = {}; t.ex.forEach(r => { if (r[5]) groups[r[5]] = (groups[r[5]] || 0) + 1; });
    Object.values(groups).forEach(n => assert.strictEqual(n, 2, id + ': supersets come in pairs'));
  });
  const groups = Object.entries(C.SPLITS).map(([s, sp]) => [s, sp.order]).concat([['PPL', ['ppl-push', 'ppl-pull', 'ppl-legs']], ['Full Body', ['full']]]);
  groups.forEach(([s, order]) => {
    const sets = re => order.reduce((a, id) => a + T[id].ex.filter(r => re.test(r[0])).reduce((b, r) => b + r[1], 0), 0);
    assert.ok(sets(back) > sets(chest), s + ': back ' + sets(back) + ' sets vs chest ' + sets(chest));
  });
});

test('Upper A leads with chest, Upper B with back, and both are upper body only', () => {
  const { C } = ready();
  const T = plain(C.TEMPLATES), back = /pulldown|row|pull-up|face pull|reverse pec/i, chest = /bench|chest press|incline db press|fly/i, legs = /squat|leg |lunge|hack|calf/i;
  const sets = (id, re) => T[id].ex.filter(r => re.test(r[0])).reduce((a, r) => a + r[1], 0);
  ['ul-ua', 'ul-ub'].forEach(id => T[id].ex.forEach(r => assert.ok(!legs.test(r[0]), id + ' is upper body: ' + r[0])));
  assert.ok(sets('ul-ua', chest) > sets('ul-ua', back), 'Upper A: more chest');
  assert.ok(sets('ul-ub', back) > sets('ul-ub', chest), 'Upper B: more back');
  assert.match(T['ul-ua'].ex[0][0], /Bench/); assert.match(T['ul-ub'].ex[0][0], /pulldown/i);
});

test('Your own workouts: save from a session, they sit with the presets, count as the gym session, can be edited and deleted (archived)', () => {
  const { g, C, me } = ready();
  const rows = [{ exercise: 'Bench press', sets: 4, reps: '5-6', rpe: 8, rest: '3 min' }, { exercise: 'Hammer curl', sets: 3, reps: '10-12', rpe: 9, rest: '90s' }];
  const s = plain(C.saveMyWorkout(me, 'Upper A + arms', rows));
  const id = s.savedWorkout;
  assert.match(id, /^my-/);
  const sp = s.train.split;
  assert.deepStrictEqual(sp.presets.map(x => x.name), ['Push', 'Pull', 'Legs', 'Full Body', 'Upper A + arms', 'Arms & Shoulders Pump'], 'yours before the Pump');
  assert.strictEqual(s.train.tpl[id].ex[1].exercise, 'Hammer curl');
  assert.strictEqual(s.train.tpl[id].mine, true);
  assert.throws(() => C.saveMyWorkout(me, 'upper a', rows), /already a workout called/);
  assert.throws(() => C.saveMyWorkout(me, 'Bad', [{ exercise: 'Romanian deadlift' }]), /breaks the rules/);
  assert.throws(() => C.saveMyWorkout(me, '', rows), /name/);
  // logging it: a gym session (50 XP), the rotation stays on Upper A
  const xp0 = C.xpOn_('me', '2026-10-12');
  const r = C.saveWorkout(me, 'Upper A + arms', [{ exercise: 'Hammer curl', set: 1, weight: 16, reps: 12, rpe: 9 }], { template: id });
  assert.strictEqual(r.extra, false);
  assert.strictEqual(C.xpOn_('me', '2026-10-12') - xp0, 50);
  assert.ok(g.tab('Workout log').rows().some(x => x.includes(id)));
  at(g, '2026-10-13T17:00:00Z');
  assert.strictEqual(next(C, me), 'Upper A');
  // edit like any template, rename by saving again, then delete: the definition goes to the Archive tab, history stays
  C.editTemplate(me, id, rows.concat([{ exercise: 'Rope pushdown', sets: 3, reps: '12', rpe: 9, rest: '60s' }]));
  assert.strictEqual(plain(C.trainState(me)).tpl[id].ex.length, 3);
  assert.strictEqual(plain(C.saveMyWorkout(me, 'Push day plus', rows, id)).train.tpl[id].name, 'Push day plus');
  const logged = g.tab('Workout log').rows().length;
  C.deleteMyWorkout(me, id);
  assert.ok(!plain(C.trainState(me)).tpl[id]);
  assert.strictEqual(g.tab('Workout log').rows().length, logged, 'history kept');
  assert.ok(g.tab('Archive').rows().some(x => /Your workout deleted: Push day plus/.test(x.join(' '))));
  assert.doesNotThrow(() => C.trainState(me), 'history logged with a deleted workout still reads');
});
