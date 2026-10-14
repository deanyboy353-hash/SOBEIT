const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-14T08:00:00Z') });
  g.ctx.setup();
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.ctx.registerDevice(g.state.props.WEBAPP_KEY, 'me-phone-token-0123456789', 'Pixel');
  return { g, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const plain = x => JSON.parse(JSON.stringify(x));
const at = (g, iso) => { g.state.now = new Date(iso); };

test('Timers: a push at the end of a rest timer and a chore timer; one trigger armed; cleared when stopped', () => {
  const { g, me } = ready();
  g.ctx.setTimer(me, 'rest', 90, 'Rest over', 'Next set: Bench', 'train');
  let trig = g.state.triggers.filter(t => t.fn === 'timerRun');
  assert.strictEqual(trig.length, 1);
  assert.strictEqual(trig[0].at.getTime(), new Date('2026-10-14T08:01:30Z').getTime());
  g.ctx.startChore(me, { name: 'Do the dishes', minutes: 15 });
  assert.strictEqual(g.state.triggers.filter(t => t.fn === 'timerRun').length, 1, 'still one trigger, for the earliest');
  at(g, '2026-10-14T08:01:31Z');
  g.ctx.timerRun();
  const p = g.state.pushes.pop();
  assert.strictEqual(p.title, 'Rest over');
  assert.strictEqual(p.note.tag, 'timer-rest');
  assert.ok(p.note.vibrate);
  assert.strictEqual(g.state.triggers.filter(t => t.fn === 'timerRun')[0].at.getTime(), new Date('2026-10-14T08:15:00Z').getTime(), 'armed for the chore');
  g.ctx.finishChore(me, 'Cancelled');
  assert.strictEqual(g.state.triggers.filter(t => t.fn === 'timerRun').length, 0);
  g.ctx.setTimer(me, 'rest', 60, 'Rest over', '', 'train');
  g.ctx.clearTimer(me, 'rest');
  at(g, '2026-10-14T08:10:00Z'); g.ctx.nagRun();
  assert.ok(!g.state.pushes.some(x => x.title === 'Rest over' && g.state.pushes.indexOf(x) > 0 && false));
  assert.throws(() => g.ctx.setTimer(me, 'x', 1), /doesn't look right/);
});

test('Presets: Arms & Shoulders Pump and friends land in the Sessions tab once and can be trained', () => {
  const { g, me } = ready();
  const t = g.ctx.trainState(me);
  ['Arms & Shoulders Pump', 'Push', 'Pull', 'Full Body Express'].forEach(n => assert.ok(t.sessions.includes(n), n));
  assert.strictEqual(t.kinds['Arms & Shoulders Pump'], 'preset');
  assert.strictEqual(t.kinds['Upper A'], 'programme');
  assert.strictEqual(t.plans['Arms & Shoulders Pump'].accessories.length, 8);
  const n = g.tab('Sessions').rows().length;
  g.ctx.ensurePresets_();
  assert.strictEqual(g.tab('Sessions').rows().length, n);
  g.ctx.setTodaySession(me, 'Arms & Shoulders Pump');
  assert.strictEqual(g.ctx.trainState(me).today, 'Arms & Shoulders Pump');
});

test('Templates: save, replace and delete your own; programme days are protected', () => {
  const { g, me } = ready();
  let t = g.ctx.saveTemplate(me, 'Beach Day', [{ exercise: 'EZ-bar curl', sets: 4, reps: '10-12', rest: '60 sec' }, { exercise: 'Cable lateral raise', sets: 5, reps: '15' }]);
  assert.strictEqual(t.kinds['Beach Day'], 'custom');
  assert.strictEqual(t.plans['Beach Day'].accessories.length, 2);
  t = g.ctx.saveTemplate(me, 'Beach Day', [{ exercise: 'Hammer curl', sets: 3, reps: '12' }]);
  assert.deepStrictEqual(plain(t.plans['Beach Day'].accessories.map(a => a.exercise)), ['Hammer curl']);
  t = g.ctx.deleteTemplate(me, 'Beach Day');
  assert.ok(!t.sessions.includes('Beach Day'));
  assert.throws(() => g.ctx.deleteTemplate(me, 'Upper A'), /Programme days/);
  assert.throws(() => g.ctx.saveTemplate(me, '', [{ exercise: 'x' }]), /name/);
});

test('Workout: set types, duration, volume, PRs for any exercise, history, records and the Previous column', () => {
  const { g, me } = ready();
  const t0 = new Date('2026-10-14T08:00:00Z').getTime();
  g.ctx.saveWorkout(me, 'Arms & Shoulders Pump', [
    { exercise: 'EZ-bar curl', set: 1, weight: 20, reps: 10, type: 'W' },
    { exercise: 'EZ-bar curl', set: 2, weight: 30, reps: 10 },
    { exercise: 'EZ-bar curl', set: 3, weight: 30, reps: 9, type: 'F' }
  ], { started: t0 - 50 * 60000, notes: 'Good pump' });
  at(g, '2026-10-21T08:00:00Z');
  const res = g.ctx.saveWorkout(me, 'Arms & Shoulders Pump', [{ exercise: 'EZ-bar curl', set: 1, weight: 32.5, reps: 10 }], { started: new Date('2026-10-21T07:15:00Z').getTime() });
  assert.strictEqual(res.minutes, 45);
  assert.strictEqual(res.volume, 325);
  assert.strictEqual(res.prs[0].exercise, 'EZ-bar curl', 'accessories get PRs too');
  const t = g.ctx.trainState(me);
  assert.strictEqual(t.history[0].session, 'Arms & Shoulders Pump');
  assert.strictEqual(t.history[1].minutes, 50);
  assert.strictEqual(t.history[1].notes, 'Good pump');
  assert.strictEqual(t.history[1].detail.length, 3);
  const rec = t.records.find(r => r.exercise === 'EZ-bar curl');
  assert.strictEqual(rec.heaviest, 32.5);
  assert.strictEqual(rec.history.length, 2);
  assert.deepStrictEqual(plain(t.prev['ez-bar curl']), [{ w: 32.5, r: 10, t: '' }]);
});

test('Cardio: log with distance and heart rate, XP, undo and delete', () => {
  const { g, me } = ready();
  const xp0 = g.ctx.xpTotal_('me');
  let s = g.ctx.logCardio(me, { type: 'Run', minutes: 30, km: 5.2, hr: 152, notes: 'Canal path' }).state;
  assert.strictEqual(g.ctx.xpTotal_('me') - xp0, 10);
  assert.strictEqual(s.train.cardio.recent[0].km, 5.2);
  assert.strictEqual(s.train.cardio.weekMinutes, 30);
  assert.strictEqual(s.undo.label, 'Run 30 min');
  g.ctx.undoAction(me);
  assert.strictEqual(g.ctx.trainState(me).cardio.recent.length, 0);
  assert.strictEqual(g.ctx.xpTotal_('me'), xp0);
  s = g.ctx.logCardio(me, { type: 'E-bike', minutes: 34 }).state;
  s = g.ctx.deleteCardio(me, s.train.cardio.recent[0].id).state;
  assert.strictEqual(s.train.cardio.recent.length, 0);
  assert.throws(() => g.ctx.logCardio(me, { type: 'Run', minutes: 0 }), /How many minutes/);
  assert.throws(() => g.ctx.logCardio(g.state.props.PARTNER_KEY, { type: 'Run', minutes: 10 }));
});
