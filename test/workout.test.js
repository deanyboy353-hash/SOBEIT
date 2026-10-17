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

test('Training split: Upper / Lower A/B, with PPL, Full Body and the Pump as presets, no hip hinges or calf raises, every exercise with sets, reps, RPE and rest', () => {
  const { g, C, me } = ready();
  const t = plain(C.trainState(me));
  assert.deepStrictEqual(t.rotation, ['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  assert.strictEqual(t.split.split, 'ul');
  ['ul-ua', 'ul-la', 'ul-ub', 'ul-lb', 'ppl-push', 'ppl-pull', 'ppl-legs', 'full', 'pump'].forEach(id => {
    const p = t.tpl[id];
    assert.ok(p.ex.length >= 4 && p.ex.length <= 8, id);
    p.ex.forEach(x => { assert.ok(!HINGE.test(x.exercise) && !/calf/i.test(x.exercise), id + ': ' + x.exercise); assert.ok(x.sets && x.reps && x.rpe && (x.rest || /drop set/.test(x.exercise)), id + ' ' + x.exercise); });
  });
  const ua = t.tpl['ul-ua'].ex.map(x => x.exercise), la = t.tpl['ul-la'].ex.map(x => x.exercise);
  assert.deepStrictEqual(ua, ['Bench press', 'Lat pulldown', 'Seated DB shoulder press', 'Chest-supported row', 'EZ-bar curl', 'Rope pushdown']);
  assert.ok(la.includes('Seated leg curl'));
  // the old Upper/Lower programme and the old rotation rows are kept in the Sheet, out of the way
  assert.ok(g.tab('Sessions').rows().some(r => r[0] === 'Old: Lower A'));
  assert.ok(g.tab('Sessions').rows().some(r => r[0] === 'Old: Push'));
  assert.ok(!t.sessions.some(x => /^(Upper|Lower) [AB]$|^Old: /.test(x)));
  assert.ok(!t.sessions.some(x => (t.plans[x].accessories || []).some(e => HINGE.test(e.exercise))), 'no hinge in any session the app offers');
});

test('The rotation only moves on when a session is done', () => {
  const { g, C, me } = ready();                                   // Tue 13 Oct: a training day
  assert.strictEqual(C.trainState(me).today, 'Upper A');
  C.saveWorkout(me, 'Upper A', [{ exercise: 'Bench press', set: 1, weight: 100, reps: 10, target: '8-10' }]);
  assert.strictEqual(C.trainState(me).today, 'Upper A', 'still Upper A today, done');
  g.state.now = new Date('2026-10-14T15:30:00Z');                 // Wed: training day
  assert.strictEqual(C.trainState(me).today, 'Lower A');
  g.state.now = new Date('2026-10-15T15:30:00Z');                 // Thu: not ticked, but any day the bus works can be a gym day
  assert.strictEqual(C.trainState(me).today, 'Lower A');
  C.setSetting_('Train any day I can make the bus', 'FALSE');      // fixed days only: Thursday is a rest day
  assert.strictEqual(C.trainState(me).today, '');
  C.setSetting_('Train any day I can make the bus', 'TRUE');
  g.state.now = new Date('2026-10-16T15:30:00Z');                 // Fri: Lower A was skipped on Wednesday, so it's still Lower A
  assert.strictEqual(C.trainState(me).today, 'Lower A');
  C.gymDone(me);                                                  // ticking "Gym done" counts too
  g.state.now = new Date('2026-10-17T15:30:00Z');                 // Sat
  assert.strictEqual(C.trainState(me).today, 'Upper B');
  C.saveWorkout(me, 'Upper B', [{ exercise: 'Incline DB press', set: 1, weight: 30, reps: 10, target: '8-10' }]);
  g.state.now = new Date('2026-10-20T15:30:00Z');                 // next Tue: on to Lower B
  assert.strictEqual(C.trainState(me).today, 'Lower B');
});

test('saving a workout: logs sets with RPE, suggests heavier next time when every set hit the top of the range, spots PRs', () => {
  const { g, C, me } = ready();
  const res = C.saveWorkout(me, 'Upper A', [{ exercise: 'Bench press', set: 1, weight: 80, reps: 6, rpe: 8, target: '5-6' }, { exercise: 'Bench press', set: 2, weight: 80, reps: 6, rpe: 7.5, target: '5-6' }], { template: 'ul-ua' });
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Done');
  assert.ok(res.state.game.xpToday >= 50);
  const log = g.tab('Workout log').rows(), h = log[0];
  assert.deepStrictEqual([log[1][h.indexOf('RPE')], log[1][h.indexOf('Template')]], [8, 'ul-ua']);
  g.state.now = new Date('2026-10-20T15:30:00Z');
  const bench = plain(C.trainState(me)).tpl['ul-ua'].ex.find(x => x.exercise === 'Bench press');
  assert.deepStrictEqual(bench.last.map(s => [s.w, s.r, s.rpe]), [[80, 6, 8], [80, 6, 7.5]]);
  assert.strictEqual(bench.hint.weight, 82.5);
  const r2 = C.saveWorkout(me, 'Upper A', [{ exercise: 'Bench press', set: 1, weight: 82.5, reps: 6, rpe: 8, target: '5-6' }], { template: 'ul-ua' });
  assert.strictEqual(r2.prs[0].exercise, 'Bench press');
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
  assert.match(ev.title, /^Upper A/);
  assert.match(ev.opts.description, /Bench press/);
});

test('rotation: strict order, the session after the last one you did; a full lap starts again', () => {
  const { loadProject } = require('./fakes');
  const g = loadProject({ now: new Date('2026-10-15T07:00:00Z') });
  const after = d => g.ctx.rotationAfter(['ppsa-push', 'ppsa-pull', 'ppsa-sa'], d);
  assert.strictEqual(after([]), 'ppsa-push');
  assert.strictEqual(after(['ppsa-push']), 'ppsa-pull');
  assert.strictEqual(after(['ppsa-pull', 'ppsa-push']), 'ppsa-pull', 'Pull Mon, Push Wed: Pull next (the order, not the gaps)');
  assert.strictEqual(after(['ppsa-push', 'ppsa-pull', 'ppsa-sa']), 'ppsa-push', 'a full lap starts again at Push');
  assert.strictEqual(after(['ppsa-sa', 'ul-ua']), 'ppsa-push', 'sessions from other splits are ignored');
});

test('rotation end to end: a saved Monday Upper A and Wednesday Lower A make Thursday Upper B, on any day the bus works', () => {
  const { loadProject } = require('./fakes');
  const g = loadProject({ now: new Date('2026-10-12T17:00:00Z') });   // Mon
  g.ctx.setup();
  const me = g.state.props.WEBAPP_KEY;
  const log = (iso, session) => { g.state.now = new Date(iso); g.ctx.saveWorkout(me, session, [{ exercise: 'Lat pulldown', set: 1, weight: 50, reps: 10, target: '8-10' }]); };
  log('2026-10-12T17:00:00Z', 'Upper A');
  log('2026-10-14T17:00:00Z', 'Lower A');
  g.state.now = new Date('2026-10-15T05:37:00Z');   // Thu 06:37: a day with no ticked training
  g.state.cache = {};
  assert.strictEqual(g.ctx.rotationNext_('2026-10-15'), 'Upper B');
  assert.strictEqual(g.ctx.todaySession_('2026-10-15'), 'Upper B', 'not a rest day: any day can be a gym day');
  assert.strictEqual(g.ctx.trainState(me).rotationNext, 'Upper B');
});
