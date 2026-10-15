const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready() {
  const g = loadProject({ now: new Date('2026-10-13T15:30:00Z') }); // Tue, Upper A
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY };
}

const HINGE = /dead ?lift|\brdl\b|romanian|good ?morning|back squat|front squat|^squat$|hip thrust|kettlebell swing|trap.?bar/i;
const plain = x => JSON.parse(JSON.stringify(x));

test('Training split: Push / Pull / Shoulders & Arms, no hip hinges, every exercise with sets, reps, RPE and rest', () => {
  const { g, C, me } = ready();
  const t = plain(C.trainState(me));
  assert.deepStrictEqual(t.rotation, ['Push', 'Pull', 'Shoulders & Arms']);
  assert.deepStrictEqual(t.sessions.slice(0, 3), ['Push', 'Pull', 'Shoulders & Arms']);
  ['Push', 'Pull', 'Shoulders & Arms'].forEach(s => {
    const p = t.plans[s];
    assert.strictEqual(p.main.length, 0, s + ': no training-max sets');
    assert.ok(p.accessories.length >= 7, s);
    p.accessories.forEach(x => { assert.ok(!HINGE.test(x.exercise), s + ' has a hinge: ' + x.exercise); assert.ok(x.sets && x.reps && x.rpe && x.rest, s + ' ' + x.exercise); });
  });
  const push = t.plans.Push.accessories.map(x => x.exercise), pull = t.plans.Pull.accessories.map(x => x.exercise);
  assert.ok(push.includes('Hack squat') && push.includes('Leg press') && push.includes('Barbell bench press'));
  assert.ok(pull.includes('Seated leg curl') && pull.filter(x => /row|pulldown|pullover/i.test(x)).length >= 4, 'extra back volume');
  // the old Upper/Lower programme is kept in the Sheet, out of the way
  assert.ok(g.tab('Sessions').rows().some(r => r[0] === 'Old: Lower A'));
  assert.ok(!t.sessions.some(x => /Upper|Lower/.test(x)));
  assert.ok(!t.sessions.some(x => (t.plans[x].accessories || []).some(e => HINGE.test(e.exercise))), 'no hinge in any session the app offers');
});

test('The rotation only moves on when a session is done', () => {
  const { g, C, me } = ready();                                   // Tue 13 Oct: a training day
  assert.strictEqual(C.trainState(me).today, 'Push');
  C.saveWorkout(me, 'Push', [{ exercise: 'Hack squat', set: 1, weight: 100, reps: 10, target: '8-10' }]);
  assert.strictEqual(C.trainState(me).today, 'Push', 'still Push today, done');
  g.state.now = new Date('2026-10-14T15:30:00Z');                 // Wed: training day
  assert.strictEqual(C.trainState(me).today, 'Pull');
  g.state.now = new Date('2026-10-15T15:30:00Z');                 // Thu: rest
  assert.strictEqual(C.trainState(me).today, '');
  g.state.now = new Date('2026-10-16T15:30:00Z');                 // Fri: Pull was skipped on Wednesday, so it's still Pull
  assert.strictEqual(C.trainState(me).today, 'Pull');
  C.gymDone(me);                                                  // ticking "Gym done" counts too
  g.state.now = new Date('2026-10-17T15:30:00Z');                 // Sat
  assert.strictEqual(C.trainState(me).today, 'Shoulders & Arms');
  C.saveWorkout(me, 'Shoulders & Arms', [{ exercise: 'Cable lateral raise', set: 1, weight: 10, reps: 15, target: '12-15' }]);
  g.state.now = new Date('2026-10-20T15:30:00Z');                 // next Tue: round again
  assert.strictEqual(C.trainState(me).today, 'Push');
});

test('saving a workout: logs sets, suggests heavier next time when every set hit the top of the range, spots PRs', () => {
  const { g, C, me } = ready();
  const res = C.saveWorkout(me, 'Push', [{ exercise: 'Barbell bench press', set: 1, weight: 80, reps: 10, target: '6-10' }, { exercise: 'Barbell bench press', set: 2, weight: 80, reps: 10, target: '6-10' }]);
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Done');
  assert.ok(res.state.game.xpToday >= 50);
  g.state.now = new Date('2026-10-20T15:30:00Z');
  C.saveWorkout(me, 'Pull', [{ exercise: 'Lat pulldown', set: 1, weight: 60, reps: 8, target: '8-10' }]);
  C.saveWorkout(me, 'Shoulders & Arms', [{ exercise: 'EZ-bar curl', set: 1, weight: 30, reps: 10, target: '10-12' }]);
  const bench = C.trainState(me).plans.Push.accessories.find(x => x.exercise === 'Barbell bench press');
  assert.strictEqual(bench.lastWeight, 80); assert.strictEqual(bench.suggest, 82.5); assert.strictEqual(bench.bumped, true);
  const r2 = C.saveWorkout(me, 'Push', [{ exercise: 'Barbell bench press', set: 1, weight: 82.5, reps: 9, target: '6-10' }]);
  assert.strictEqual(r2.prs[0].exercise, 'Barbell bench press');
});

test('Old "Gym: Upper A" labels in the feed and XP log become the session those exercises really were', () => {
  const { g, C, me } = ready();
  C.saveWorkout(me, 'Upper A', [{ exercise: 'Barbell bench press', set: 1, weight: 80, reps: 5 }, { exercise: 'Incline DB press', set: 1, weight: 30, reps: 8 }]);
  C.gymDone(me);
  const xp = g.tab('XP log'), wc = xp.rows()[0].indexOf('What');
  xp.rows().forEach((r, i) => { if (/^Gym: /.test(r[wc])) xp.getRange(i + 1, wc + 1).setValue('Gym: Upper A'); });
  const f = JSON.parse(g.state.props.FEED); f.forEach(e => { if (/^Gym: /.test(e.text)) e.text = e.text.replace(/^Gym: [^·]+/, 'Gym: Upper A '); }); g.state.props.FEED = JSON.stringify(f);
  delete g.state.props.TRAIN_V2;
  C.appState(me);
  assert.ok(xp.rows().some(r => r[wc] === 'Gym: Push'), JSON.stringify(xp.rows().map(r => r[wc])));
  assert.ok(!xp.rows().some(r => /Upper A/.test(r[wc])));
  assert.ok(JSON.parse(g.state.props.FEED).some(e => /^Gym: Push/.test(e.text)));
  assert.strictEqual(C.classifySession(['Lat pulldown', 'Seated leg curl']), 'Pull');
  assert.strictEqual(C.classifySession(['Cable lateral raise', 'EZ-bar curl']), 'Shoulders & Arms');
});

test('gym calendar event lists the session\'s exercises', () => {
  const { g, C, me } = ready();
  g.state.now = new Date('2026-10-13T05:05:00Z');
  C.dailyRun();
  const ev = g.calendar.live().find(e => e.tags.sobeit === 'gym');
  assert.match(ev.title, /^Push/);
  assert.match(ev.opts.description, /Hack squat/);
});
