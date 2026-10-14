const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const P = loadProject().ctx;

// --- pure logic ---

test('clock parsing', () => {
  assert.strictEqual(P.parseClock('15:00'), 900);
  assert.strictEqual(P.parseClock('3pm'), 900);
  assert.strictEqual(P.parseClock('8.30'), 510);
  assert.strictEqual(P.parseClock('1815'), 1095);
  assert.strictEqual(P.parseClock(0.5), 720);
  assert.strictEqual(P.parseClock('nonsense'), null);
  assert.strictEqual(P.formatClock(905), '15:05');
});

test('rest periods', () => {
  assert.strictEqual(P.parseRestSeconds('3 min'), 180);
  assert.strictEqual(P.parseRestSeconds('2.5 min'), 150);
  assert.strictEqual(P.parseRestSeconds('2:30'), 150);
  assert.strictEqual(P.parseRestSeconds('90 sec'), 90);
  assert.strictEqual(P.parseRestSeconds('90s'), 90);
  assert.strictEqual(P.parseRestSeconds('90'), 90);
  assert.strictEqual(P.parseRestSeconds('2'), 120);
});

test('day lists', () => {
  assert.deepStrictEqual([...P.parseDays('Mon, Wed')], [1, 3]);
  assert.deepStrictEqual([...P.parseDays('tuesday and saturday')], [2, 6]);
});

test('weights in any unit', () => {
  assert.strictEqual(P.parseWeight('82.4', 'kg').kg, 82.4);
  assert.strictEqual(P.parseWeight('82,4kg', 'kg').kg, 82.4);
  assert.strictEqual(P.parseWeight('13st 2', 'kg').kg, 83.5);
  assert.strictEqual(P.parseWeight('13 stone 2lb', 'kg').kg, 83.5);
  assert.strictEqual(P.parseWeight('185 lb', 'kg').kg, 83.9);
  assert.strictEqual(P.parseWeight('185', 'lb').kg, 83.9);
  assert.strictEqual(P.parseWeight('', 'kg'), null);
  assert.strictEqual(P.parseWeight('5', 'kg'), null);
});

test('bus trip works back from last bus', () => {
  const t = P.planTrip({ mode: 'bus', freeFrom: 900, prep: 15, sessionMinutes: 70, bikeMinutes: 17, busMinutes: 30, walkToStop: 5, lastBus: 1095 });
  assert.strictEqual(P.formatClock(t.leaveAt), '15:15');
  assert.strictEqual(P.formatClock(t.latestLeave), '16:30'); // 18:15 - 5 - 70 - 30
  assert.strictEqual(t.tight, false);
  const late = P.planTrip({ mode: 'bus', freeFrom: 960, prep: 15, sessionMinutes: 95, bikeMinutes: 17, busMinutes: 30, walkToStop: 5, lastBus: 1095 });
  assert.strictEqual(late.tight, true);
  assert.strictEqual(late.shortBy, 10); // leave 16:15, latest 16:05
});

test('bike only when every hour of the trip is fine', () => {
  const dry = [15, 16, 17].map(h => ({ hour: h, temp: 12, rainProb: 10, rainMm: 0, gust: 20 }));
  const rules = { maxRainProb: 30, maxRainMm: 0.3, minTemp: 3, maxGust: 45 };
  assert.strictEqual(P.chooseTravel(dry, 915, 1080, rules).mode, 'bike');
  dry[2].rainProb = 70;
  const wet = P.chooseTravel(dry, 915, 1080, rules);
  assert.strictEqual(wet.mode, 'bus');
  assert.match(wet.reasons.join(), /70% chance of rain/);
  assert.strictEqual(P.chooseTravel([], 915, 1080, rules).mode, 'bus');
});

// --- whole days, with fake Google services ---

const gymEvents = g => g.calendar.live().filter(e => e.tags.sobeit === 'gym');
const gymTasks = g => g.tasks.open().filter(t => /Gym done/.test(t.title));

function at(state, iso) { state.now = new Date(iso); }

test('Tuesday: setup builds the sheet and plans a dry-day bike session', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') }); // Tue 06:05 BST
  g.ctx.setup();
  ['Config', 'Sessions', 'Gym log', 'Weight', 'Health', 'Food', 'Inbox', 'Log'].forEach(n => assert.ok(g.tab(n), n));
  assert.strictEqual(g.tab('Sheet1'), null);
  assert.deepStrictEqual(g.state.triggers.map(t => t.fn).sort(), ['dailyRun', 'foodCheck', 'pollTasks', 'weeklySummary']);
  assert.ok(g.state.props.WEBAPP_KEY);

  const ev = gymEvents(g);
  assert.strictEqual(ev.length, 1, 'one event (gym, no weigh-in on Tue)');
  assert.match(ev[0].title, /Upper A · Bike · leave 15:15/);
  assert.match(ev[0].opts.description, /1\. Bench press \(T1\): set a training max/);
  assert.match(ev[0].opts.description, /3\. Barbell row: 4 × 6-8 @ RPE 8 · rest 2 min/);
  assert.strictEqual(ev[0].opts.location, 'JD Gym Coatbridge');
  assert.deepStrictEqual(ev[0].reminders, [30, 0]); // 14:45 alert, then "time to go"
  assert.strictEqual(g.ctx.Utilities.formatDate(ev[0].start, 'Europe/London', 'HH:mm'), '15:15');

  const open = gymTasks(g);
  assert.strictEqual(open.length, 1);
  assert.match(open[0].title, /Gym done: Upper A/);
  const log = g.tab('Gym log').rows();
  assert.deepStrictEqual(log[1].slice(0, 7), ['2026-10-13', 'Tue', 'Upper A', 'Bike', '15:15', log[1][5], 'Planned']);
  assert.strictEqual(g.state.mails.length, 0, JSON.stringify(g.tab('Log').rows()));
});

test('rain means bus, with a latest-leave time from the last bus', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.state.rainy = true;
  g.ctx.setup();
  const ev = gymEvents(g)[0];
  assert.match(ev.title, /Bus · leave 15:15/);
  assert.match(ev.opts.description, /Latest you can leave: \d\d:\d\d \(and still make the last bus at 18:15\)/);
  assert.match(ev.opts.description, /80% chance of rain/);
});

test('weather service down → bus, no crash', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.state.weatherDown = true;
  g.ctx.setup();
  assert.match(gymEvents(g)[0].title, /Bus/);
  assert.strictEqual(g.state.mails.length, 0);
});

test('running again the same day replaces, never duplicates', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  g.ctx.dailyRun();
  g.ctx.dailyRun();
  assert.strictEqual(gymEvents(g).length, 1);
  assert.strictEqual(Object.values(g.tasks.store).filter(t => /Gym done/.test(t.title)).length, 1);
  assert.strictEqual(g.tab('Gym log').getLastRow(), 2);
});

test('ticking Gym done logs it; re-planning afterwards does not bring the task back', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  const id = Object.values(g.tasks.store).find(t => /Gym done/.test(t.title)).id;
  g.tasks.tick(id, '2026-10-13T16:40:00.000Z');
  at(g.state, '2026-10-13T16:45:00Z');
  g.ctx.pollTasks();
  const row = g.tab('Gym log').rows()[1];
  assert.strictEqual(row[6], 'Done');
  assert.strictEqual(row[7], '2026-10-13 17:40');
  g.ctx.dailyRun();
  assert.strictEqual(gymTasks(g).length, 0);
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Done');
});

test('Wednesday: weigh-in alert + task; typed weight is logged when ticked', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  at(g.state, '2026-10-14T05:05:00Z'); // Wed
  g.ctx.dailyRun();

  // Tuesday's unticked gym task was tidied away and marked
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Not ticked');
  const titles = g.calendar.live().map(e => e.title);
  assert.ok(titles.some(t => /Lower A/.test(t)));
  const weigh = g.calendar.live().find(e => e.title === 'Weigh in');
  assert.strictEqual(g.ctx.Utilities.formatDate(weigh.start, 'Europe/London', 'HH:mm'), '08:30');
  assert.deepStrictEqual(weigh.reminders, [0]);

  const task = g.tasks.open().find(t => /Weigh-in/.test(t.title));
  g.tasks.store[task.id].title = task.title + ' 13st 2';
  g.tasks.tick(task.id, '2026-10-14T07:35:00.000Z');
  g.ctx.pollTasks();
  const w = g.tab('Weight').rows();
  assert.deepStrictEqual(w[1], ['2026-10-14', '08:35', 83.5, '13st 2', '']);
});

test('weigh-in ticked with no number is reopened and asks again', () => {
  const g = loadProject({ now: new Date('2026-10-14T05:05:00Z') });
  g.ctx.setup();
  const task = g.tasks.open().find(t => /Weigh-in/.test(t.title));
  g.tasks.tick(task.id, '2026-10-14T07:35:00.000Z');
  g.ctx.pollTasks();
  assert.strictEqual(g.tab('Weight').getLastRow(), 1);
  const again = g.tasks.store[task.id];
  assert.strictEqual(again.status, 'needsAction');
  assert.match(again.title, /Didn't catch a number/);
  again.title = '82.0';
  g.tasks.tick(task.id, '2026-10-14T07:40:00.000Z');
  g.ctx.pollTasks();
  assert.strictEqual(g.tab('Weight').rows()[1][2], 82);
});

test('weight typed but never ticked is still logged next morning', () => {
  const g = loadProject({ now: new Date('2026-10-12T05:05:00Z') }); // Mon
  g.ctx.setup();
  const task = g.tasks.open().find(t => /Weigh-in/.test(t.title));
  g.tasks.store[task.id].notes = '82.6';
  at(g.state, '2026-10-13T05:05:00Z');
  g.ctx.dailyRun();
  assert.strictEqual(g.tab('Weight').rows()[1][2], 82.6);
  assert.ok(!g.tasks.store[task.id], 'old task removed');
});

test('rest days: nothing created (Thursday)', () => {
  const g = loadProject({ now: new Date('2026-10-15T05:05:00Z') });
  g.ctx.setup();
  assert.strictEqual(gymEvents(g).length, 0);
  assert.strictEqual(gymTasks(g).length, 0);
});

test('editing the Config tab changes the plan', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  const cfg = g.tab('Config');
  const rows = cfg.rows();
  const set = (label, col, v) => { const r = rows.findIndex(x => x[0] === label); cfg.getRange(r + 1, col).setValue(v); };
  set('Tue', 4, '16:00');
  set('Tue', 3, 'Lower B');
  set('Session length (min)', 2, '60');
  g.ctx.dailyRun();
  const ev = gymEvents(g);
  assert.strictEqual(ev.length, 1);
  assert.match(ev[0].title, /Lower B · .* · leave 16:15/);
  assert.match(ev[0].opts.description, /about 60 min/);
});

test('web app: rejects a wrong key, stores a good request in Inbox', () => {
  const g = loadProject();
  g.ctx.setup();
  const bad = JSON.parse(g.ctx.doPost({ parameter: { key: 'nope' }, postData: { contents: '{}' } }).text);
  assert.strictEqual(bad.ok, false);
  const key = g.state.props.WEBAPP_KEY;
  const good = JSON.parse(g.ctx.doPost({ parameter: { key, source: 'geofence' }, postData: { contents: '{"steps":1234}' } }).text);
  assert.strictEqual(good.ok, true);
  const inbox = g.tab('Inbox').rows();
  assert.deepStrictEqual(inbox[1].slice(1), ['geofence', '{"steps":1234}']);
  const cfg = g.tab('Config').rows();
  assert.strictEqual(cfg.find(r => r[0] === 'Web app key')[1], key);
});

test('a broken job emails you instead of failing silently', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  g.ctx.CalendarApp.getDefaultCalendar = () => { throw new Error('Calendar unavailable'); };
  g.ctx.dailyRun();
  assert.strictEqual(g.state.mails.length, 1);
  assert.match(g.state.mails[0].body, /Calendar unavailable/);
});
