const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const data = require('./healthdata');

function ready(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-14T21:00:00Z') }); // Wed 22:00
  g.ctx.setup();
  return { g, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const post = (g, key, payload) => JSON.parse(g.ctx.doPost({ parameter: { key, source: 'health' }, postData: { contents: JSON.stringify(payload) } }).text);
const healthRow = (g, ymd, who) => { const rows = g.tab('Health').rows(); const h = rows[0]; const r = rows.find(x => x[0] === ymd && x[1] === who); return r && Object.fromEntries(h.map((k, i) => [k, r[i]])); };
const plain = x => JSON.parse(JSON.stringify(x));

test('health sync: a night with stages and a day of steps become the Health page', () => {
  const { g, me } = ready();
  const res = post(g, me, data.day('2026-10-14', { gym: true }));
  assert.ok(res.ok, JSON.stringify(res));
  const row = healthRow(g, '2026-10-14', 'me');
  assert.ok(row, 'a Health row for today');
  assert.strictEqual(row['Bedtime'], '01:29');
  assert.strictEqual(row['Wake'], '10:24');
  const asleep = Number(row['Sleep (min)']);
  assert.ok(asleep > 480 && asleep < 535, 'asleep ' + asleep);
  assert.strictEqual(asleep, Number(row['Deep (min)']) + Number(row['Light (min)']) + Number(row['REM (min)']));
  assert.ok(Number(row['Awake (min)']) >= 8);
  assert.ok(Number(row['Sleep score']) >= 80, 'score ' + row['Sleep score']);
  assert.ok(Number(row['Steps']) > 5000);
  assert.strictEqual(Number(row['Resting HR']), 58);
  const h = g.ctx.appState(me).health;
  assert.ok(h.connected);
  assert.ok(['Good', 'Excellent'].includes(h.sleep.label), h.sleep.label + ' ' + h.sleep.score);
  assert.strictEqual(h.stepsByHour.length, 24);
  assert.strictEqual(h.stepsByHour[3], 0);
  assert.ok(h.heart.byHour[16][2] > 100, 'gym shows in the heart rate');
  assert.strictEqual(h.exercise[0].type, 'strength_training');
  assert.ok(h.sleep.stages.length > 10);
  assert.match(h.webhook, /source=health$/);
  // XP once for steps and sleep
  const xp = () => g.tab('XP log').rows().filter(r => r[5] === 'steps' || r[5] === 'sleep').length;
  assert.strictEqual(xp(), Number(row['Steps']) >= 7000 ? 2 : 1);
  // the same batch again changes nothing
  const before = JSON.stringify(row);
  post(g, me, data.day('2026-10-14', { gym: true }));
  const again = healthRow(g, '2026-10-14', 'me');
  delete again.Updated;
  const was = JSON.parse(before); delete was.Updated;
  assert.deepStrictEqual(again, was);
  assert.strictEqual(xp(), Number(row['Steps']) >= 7000 ? 2 : 1);
});

test('health sync: Yaz has her own page; wrong keys are refused; nothing lands in the Inbox', () => {
  const { g, me, partner } = ready();
  post(g, partner, data.day('2026-10-14', { seed: 11, rhr: 63, steps: 2 }));
  assert.ok(healthRow(g, '2026-10-14', 'partner'));
  assert.ok(!healthRow(g, '2026-10-14', 'me'));
  assert.strictEqual(g.ctx.appState(me).health.connected, false);
  assert.strictEqual(g.ctx.appState(partner).health.heart.rhr, 63);
  assert.deepStrictEqual(post(g, 'nope', data.day('2026-10-14')), { ok: false, error: 'bad key' });
  assert.strictEqual(g.tab('Inbox').rows().length, 1);
});

test('sleep stages: Health Connect numbers and Apple Health names both work', () => {
  const { g } = ready();
  const s = g.ctx.stageOf_;
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 0].map(s), ['awake', 'light', 'awake', 'light', 'deep', 'rem', 'awake', 'light']);
  assert.deepStrictEqual(['STAGE_TYPE_DEEP', 'asleepCore', 'asleepREM', 'asleepDeep', 'awake', 'inBed', 'awake_in_bed'].map(s), ['deep', 'light', 'rem', 'deep', 'awake', null, 'awake']);
});

test('readiness: compares HRV and resting heart rate with your own two weeks', () => {
  const { g, me } = ready();
  for (let i = 6; i >= 1; i--) {
    const ymd = new Date(Date.UTC(2026, 9, 14 - i)).toISOString().slice(0, 10);
    post(g, me, data.day(ymd, { seed: i, rhr: 58, hrv: 48 }));
  }
  post(g, me, data.day('2026-10-14', { rhr: 66, hrv: 34, shorter: 150 }));
  const h = g.ctx.appState(me).health;
  assert.strictEqual(h.heart.rhrBase, 58);
  assert.ok(h.readiness.rhr === 8);
  assert.ok(h.readiness.hrv < -20);
  assert.ok(h.readiness.score < 60, 'readiness ' + h.readiness.score);
  assert.strictEqual(h.readiness.label, 'Take it easy');
  assert.ok(h.week.debt >= 100, 'sleep debt ' + h.week.debt);
  assert.strictEqual(h.trend.length, 14);
  assert.ok(h.trend.filter(t => t.sleep).length === 7);
  // browse back a day
  const y = g.ctx.healthDay(me, '2026-10-13');
  assert.strictEqual(y.date, '2026-10-13');
  assert.ok(y.readiness.score > h.readiness.score);
});

test('health insight: Claude explains the day', () => {
  const { g, me } = ready();
  post(g, me, data.day('2026-10-14'));
  assert.throws(() => g.ctx.healthInsight(me), /Claude API key/);
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-test';
  g.state.claudeReply = { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ headline: 'A long, solid night', insight: 'Plenty of deep sleep.', tip: 'Push the top set today.' }) }] } };
  const out = g.ctx.healthInsight(me);
  assert.strictEqual(out.headline, 'A long, solid night');
  assert.match(g.state.claudeRequests.at(-1).body.messages[0].content, /Deep \d+ min/);
  assert.strictEqual(g.ctx.appState(me).health.insight.tip, 'Push the top set today.');
});

test('today\'s workout can change: the plan, calendar event and gym task follow', () => {
  const g = loadProject({ now: new Date('2026-10-14T05:05:00Z') }); // Wed 06:05
  g.ctx.setup();
  g.ctx.dailyRun();
  const me = g.state.props.WEBAPP_KEY;
  let s = g.ctx.appState(me);
  const planned = s.today.gym.session;
  assert.match(planned, /Lower/);
  s = g.ctx.setTodaySession(me, 'Upper A');
  assert.strictEqual(s.today.gym.session, 'Upper A');
  assert.strictEqual(s.train.today, 'Upper A');
  assert.strictEqual(s.train.planned, planned);
  assert.ok(s.train.changed);
  const gymEvents = g.calendar.events.filter(e => !e.deleted && e.tags && e.tags.sobeit === 'gym');
  assert.strictEqual(gymEvents.length, 1);
  assert.match(gymEvents[0].title, /^Upper A/);
  assert.ok(Object.values(g.tasks.store).some(t => t.title === 'Gym done: Upper A'));
  assert.ok(!Object.values(g.tasks.store).some(t => t.title === 'Gym done: ' + planned));
  // a rest day instead
  s = g.ctx.setTodaySession(me, '');
  assert.strictEqual(s.today.gym, null);
  assert.strictEqual(g.calendar.events.filter(e => !e.deleted && e.tags && e.tags.sobeit === 'gym').length, 0);
  assert.throws(() => g.ctx.setTodaySession(me, 'Arms forever'), /No session/);
  assert.throws(() => g.ctx.setTodaySession(g.state.props.PARTNER_KEY, 'Upper A'), /out of date/);
  // logging a different session switches today to it
  g.ctx.setTodaySession(me, 'Upper A');
  const plan = g.ctx.trainState(me).plans['Upper B'];
  const sets = plan.main[0].sets.slice(0, 2).map((x, i) => ({ exercise: plan.main[0].exercise, tier: plan.main[0].tier, set: i + 1, weight: x.weight || 40, reps: 5, target: x.reps }));
  s = g.ctx.saveWorkout(me, 'Upper B', sets).state;
  assert.strictEqual(s.today.gym.session, 'Upper B');
  assert.ok(s.today.gym.done);
  assert.throws(() => g.ctx.setTodaySession(me, 'Lower B'), /already logged/);
  assert.strictEqual(g.ctx.trainState(me).next, '');
});
