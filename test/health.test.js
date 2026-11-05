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

test('today\'s workout can change: the plan and calendar event follow', () => {
  const g = loadProject({ now: new Date('2026-10-14T05:05:00Z') }); // Wed 06:05
  g.ctx.setup();
  g.ctx.dailyRun();
  const me = g.state.props.WEBAPP_KEY;
  let s = g.ctx.appState(me);
  const planned = s.today.gym.session;
  assert.strictEqual(planned, 'Upper A');         // the rotation starts at Upper A
  s = g.ctx.setTodaySession(me, 'Pull');
  assert.strictEqual(s.today.gym.session, 'Pull');
  assert.strictEqual(s.train.today, 'Pull');
  assert.strictEqual(s.train.planned, planned);
  assert.ok(s.train.changed);
  const gymEvents = g.calendar.events.filter(e => !e.deleted && e.tags && e.tags.sobeit === 'gym');
  assert.strictEqual(gymEvents.length, 1);
  assert.match(gymEvents[0].title, /^Pull/);
  assert.strictEqual(Object.keys(g.tasks.store).length, 0, 'no Google Tasks');
  // a rest day instead
  s = g.ctx.setTodaySession(me, '');
  assert.strictEqual(s.today.gym, null);
  assert.strictEqual(g.calendar.events.filter(e => !e.deleted && e.tags && e.tags.sobeit === 'gym').length, 0);
  assert.throws(() => g.ctx.setTodaySession(me, 'Arms forever'), /No session/);
  assert.throws(() => g.ctx.setTodaySession(g.state.props.PARTNER_KEY, 'Pull'), /out of date/);
  // logging a different session switches today to it
  g.ctx.setTodaySession(me, 'Pull');
  s = g.ctx.saveWorkout(me, 'Shoulders & Arms', [{ exercise: 'Cable lateral raise', set: 1, weight: 10, reps: 15, target: '12-15' }, { exercise: 'EZ-bar curl', set: 1, weight: 30, reps: 10, target: '10-12' }]).state;
  assert.strictEqual(s.today.gym.session, 'Shoulders & Arms');
  assert.ok(s.today.gym.done);
  assert.throws(() => g.ctx.setTodaySession(me, 'Push'), /already logged/);
  assert.strictEqual(g.ctx.trainState(me).rotationNext, 'Lower A', 'shoulders and arms today: lower body next');
});

test('HC Webhook test syncs are ignored, and a history import rebuilds whole days', () => {
  const { g, me } = ready();
  const fake = data.day('2026-10-13'); fake.test = true; fake.steps = [{ count: 8432, start_time: '2026-10-13T00:00:00Z' }];
  post(g, me, fake);
  assert.ok(!healthRow(g, '2026-10-13', 'me'), 'test data never saved');
  post(g, me, { steps: [{ count: 99999, start_time: '2026-10-12T09:00:00Z' }] });   // junk from before the fix
  const res = g.ctx.importHealth(me, JSON.stringify(data.day('2026-10-12')));
  assert.strictEqual(res.days, 1);
  const row = healthRow(g, '2026-10-12', 'me');
  assert.ok(Number(row['Steps']) < 20000, 'junk replaced: ' + row['Steps']);
  assert.ok(Number(row['Sleep (min)']) > 400);
});

test('Health status: no "Synced at" with zeros; says why there is no data and what to do', () => {
  const { g, me } = ready();
  const st = () => JSON.parse(JSON.stringify(g.ctx.appState(me).health));
  let h = st();
  assert.strictEqual(h.hasData, false); assert.strictEqual(h.connected, false);
  assert.match(h.status.fix, /add the webhook address/);
  // the Test button: ignored, and said so
  post(g, me, { test: true, steps: [{ count: 9999, start_time: '2026-10-13T08:00:00Z' }] });
  h = st();
  assert.strictEqual(h.hasData, false); assert.strictEqual(h.synced, 0);
  assert.match(h.status.text, /test message/);
  // HC Webhook got in touch with nothing for today
  post(g, me, {});
  h = st();
  assert.match(h.status.text, /sent nothing for today/); assert.match(h.status.fix, /Health Connect permissions/);
  // the wrong format
  g.ctx.doPost({ parameter: { key: me, source: 'health' }, postData: { contents: 'not json' } });
  assert.match(st().status.fix, /JSON \(not gRPC\)/);
  // real data: now it's synced, with a time
  post(g, me, data.day(g.ctx.todayYmd_()));
  h = st();
  assert.strictEqual(h.hasData, true); assert.ok(h.synced > 0); assert.strictEqual(h.status.ok, true);
  // days later, with nothing new: today says there's nothing yet (not "Synced at" over zeros)
  g.state.now = new Date(g.state.now.getTime() + 3 * 864e5);
  h = plain(g.ctx.healthDay(me, g.ctx.todayYmd_()));
  assert.strictEqual(h.hasData, false); assert.ok(h.synced > 0);
  assert.match(h.status.text, /No data from your watch for today yet/);
});
