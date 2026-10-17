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

test('Tuesday: setup builds the sheet and plans the bus 3 (e-bike offered when dry)', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') }); // Tue 06:05 BST
  g.ctx.setup();
  ['Config', 'Sessions', 'Gym log', 'Weight', 'Health', 'Food', 'Inbox', 'Log'].forEach(n => assert.ok(g.tab(n), n));
  assert.strictEqual(g.tab('Sheet1'), null);
  assert.deepStrictEqual(g.state.triggers.map(t => t.fn).sort(), ['dailyRun', 'foodCheck', 'nagRun', 'weeklySummary']);
  assert.ok(g.state.props.WEBAPP_KEY);

  const ev = gymEvents(g);
  assert.strictEqual(ev.length, 1, 'one event (gym, no weigh-in on Tue)');
  assert.strictEqual(ev[0].title, 'Upper A · Bus 3 15:01 · leave 14:59');
  assert.match(ev[0].opts.description, /Leave by 14:59 → bus 3 at 15:01 from Whitelaw Avenue/);
  assert.match(ev[0].opts.description, /Gym 15:14–17:01, 107 min/);
  assert.match(ev[0].opts.description, /Back: bus 3 at 17:15 from Coatbridge Bus Stance \(westbound\) → home by 17:26/);
  assert.match(ev[0].opts.description, /Miss the 15:01\? Next: bus 3 at 16:01 \(leave 15:59\), gym 16:14–18:16, back on the 3 at 18:30, home by 18:44/);
  assert.match(ev[0].opts.description, /It's dry, so the e-bike works too: leave 15:05, 17 min each way/);
  assert.match(ev[0].opts.description, /1\. Bench press: 4 × 5-6 @ RPE 8 · rest 3 min/);
  assert.match(ev[0].opts.description, /2\. Incline DB press: 3 × 8-10 @ RPE 8 · rest 2 min/);
  assert.doesNotMatch(ev[0].opts.description, /Machine shoulder press|deadlift|Romanian/i);
  assert.strictEqual(ev[0].opts.location, 'JD Gym Coatbridge');
  assert.deepStrictEqual(ev[0].reminders, [14, 0]); // 14:45 alert, then "time to go"
  assert.strictEqual(g.ctx.Utilities.formatDate(ev[0].start, 'Europe/London', 'HH:mm'), '14:59');
  assert.strictEqual(g.ctx.Utilities.formatDate(ev[0].end, 'Europe/London', 'HH:mm'), '17:26');

  assert.strictEqual(gymTasks(g).length, 0, 'no Google Tasks');
  const log = g.tab('Gym log').rows();
  assert.deepStrictEqual(log[1].slice(0, 7), ['2026-10-13', 'Tue', 'Upper A', 'Bus', '14:59', log[1][5], 'Planned']);
  assert.strictEqual(g.state.mails.length, 0, JSON.stringify(g.tab('Log').rows()));
});

test('rain: the bus plan without the e-bike option', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.state.rainy = true;
  g.ctx.setup();
  const ev = gymEvents(g)[0];
  assert.match(ev.title, /Bus 3 15:01 · leave 14:59/);
  assert.doesNotMatch(ev.opts.description, /e-bike/);
  assert.match(ev.opts.description, /Weather: .*80%/);
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
  assert.strictEqual(g.tab('Gym log').getLastRow(), 2);
});

test('Gym done in the app logs it once; re-planning afterwards keeps it done', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  at(g.state, '2026-10-13T16:40:00Z');
  g.ctx.gymDone(g.state.props.WEBAPP_KEY);
  g.ctx.gymDone(g.state.props.WEBAPP_KEY);
  const row = g.tab('Gym log').rows()[1];
  assert.strictEqual(row[6], 'Done');
  assert.strictEqual(row[7], '17:40');
  assert.strictEqual(g.tab('XP log').rows().filter(r => r[5] === 'gym').length, 1);
  g.ctx.dailyRun();
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Done');
});

test('Wednesday: weigh-in alert; yesterday\'s missed gym is marked; the weight is logged in the app', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  at(g.state, '2026-10-14T05:05:00Z'); // Wed
  g.ctx.dailyRun();
  assert.strictEqual(g.tab('Gym log').rows()[1][6], 'Not done');
  const titles = g.calendar.live().map(e => e.title);
  assert.ok(titles.some(t => /^Upper A/.test(t)), 'Tuesday\'s Upper A wasn\'t done, so it\'s still Upper A');
  const weigh = g.calendar.live().find(e => e.title === 'Weigh in');
  assert.strictEqual(g.ctx.Utilities.formatDate(weigh.start, 'Europe/London', 'HH:mm'), '08:30');
  assert.deepStrictEqual(weigh.reminders, [0]);
  assert.match(weigh.opts.description, /Log it on Home in Nudge/);
  assert.strictEqual(g.tasks.open().length, 0);
  at(g.state, '2026-10-14T07:35:00Z');
  g.ctx.logWeightNow(g.state.props.WEBAPP_KEY, '13st 2');
  assert.strictEqual(g.tab('Weight').rows()[1][2], 83.5);
});

test('rest days: nothing created (Thursday, fixed training days)', () => {
  const g = loadProject({ now: new Date('2026-10-15T05:05:00Z') });
  g.ctx.setup();
  g.ctx.setSetting_('Train any day I can make the bus', 'FALSE'); g.state.cache = {};
  g.ctx.planGymDay_('2026-10-15', g.ctx.readConfig_());
  assert.strictEqual(gymEvents(g).length, 0);
});

test('editing the Config tab changes the plan', () => {
  const g = loadProject({ now: new Date('2026-10-13T05:05:00Z') });
  g.ctx.setup();
  const cfg = g.tab('Config');
  const rows = cfg.rows();
  const set = (label, col, v) => { const r = rows.findIndex(x => x[0] === label); cfg.getRange(r + 1, col).setValue(v); };
  set('Tue', 4, '16:00');
  set('Tue', 3, 'Full Body Express');                          // a fixed custom session on a day still works
  g.ctx.dailyRun();
  const ev = gymEvents(g);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].title, 'Full Body Express · Bus 3 16:01 · leave 15:59');
  assert.match(ev[0].opts.description, /Gym 16:14–18:16, 122 min/);
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

test('Transport: Config tab gets a TRANSPORT section, old bus settings go, edits change the plan', () => {
  const g = loadProject({ now: new Date('2026-10-14T05:05:00Z') }); // Wed
  g.ctx.setup();
  const rows = g.tab('Config').rows().map(r => String(r[0]));
  ['Bus: door to gym (min)', 'Bus: gym to stop (min)', 'Last bus home'].forEach(n => assert.ok(!rows.includes(n), n + ' removed'));
  ['TRANSPORT', 'Transport setting', 'Thursday early finish', 'Bus'].forEach(n => assert.ok(rows.includes(n), n));
  const cfg = g.ctx.readConfig_();
  assert.strictEqual(cfg.timetable.length, 9);
  assert.deepStrictEqual(Array.from(cfg.timetable[0].times), [901, 961]);
  assert.deepStrictEqual(Array.from(cfg.timetable[0].days), [1, 2, 3, 4, 5]);
  // an old sheet with the old rows gets migrated, and only once
  g.ctx.ensureTransport_();
  assert.strictEqual(g.tab('Config').rows().filter(r => r[0] === 'TRANSPORT').length, 1);
});

test('Transport: Thursday plan with and without the early finish; wet vs dry; Friday day off', () => {
  const g = loadProject({ now: new Date('2026-10-14T05:05:00Z') });
  g.ctx.setup();
  const lines = (early, rainy) => { g.state.rainy = !!rainy; g.ctx.resetRun_(); return g.ctx.previewTransport_('2026-10-15', early).lines.join('\n'); };
  let t = lines(true);
  assert.match(t, /Leave by 14:59 → bus 3 at 15:01/);
  assert.match(t, /home by 17:26/);
  t = lines(false);
  assert.match(t, /The 16:01 \(3\) means leaving at 15:59, before you finish at 16:00, so it isn't realistic/);
  assert.match(t, /E-BIKE today \(dry\): leave 16:05, 17 min each way/);
  assert.match(t, /Gym 16:22–17:52, 90 min/);
  assert.match(t, /Late option: bus 132 at 18:18/);
  t = lines(false, true);
  assert.match(t, /It's wet, so move this session to Friday/);
  const fri = g.ctx.previewTransport_('2026-10-16');
  assert.strictEqual(fri.dayOff, true);
  const fl = fri.lines.join('\n');
  assert.match(fl, /only cover after work, so there's no bus near 12:00/, 'a day off never quietly plans the after-work bus');
  assert.ok(!/^Leave by 14:59/m.test(fl), fl);
});

test('Day off: with daytime buses, the best pair for a ~90 minute session around midday (or your time)', () => {
  const g = { ctx: P };
  const tt = [{ route: '3', way: 'out', days: [5], times: [541, 601, 661, 721, 781, 841, 901, 961], door: 13 },
    { route: '3', way: 'back', days: [5], times: [585, 645, 705, 765, 825, 885, 945, 1005, 1035], door: 14 }];
  const base = { dow: 5, dayOff: true, tt, walkToStop: 2, gymToStance: 4, buffer: 3, minGym: 60, maxGym: 120, preferred: '3', sessionMins: 90, bikeMins: 17 };
  let p = g.ctx.planTransport(Object.assign({ free: 720 }, base));
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.out.dep, 721, 'the 12:01, nearest to 12:00');
  assert.ok(p.gymMins >= 75 && p.gymMins <= 120, 'about 90 minutes in the gym, never a long wait over your maximum: ' + p.gymMins);
  assert.ok(!p.noDaytime);
  p = g.ctx.planTransport(Object.assign({ free: 600 }, base));
  assert.strictEqual(p.out.dep, 601, 'your own time (10:00) moves it');
});

test('Weekend buses: old weekend rows archived and replaced once; Saturday plans the 15:01 and the 16:41 home, with a warning about the gap', () => {
  const { loadProject } = require('./fakes');
  const g = loadProject({ now: new Date('2026-10-17T08:00:00Z') });   // Sat
  g.ctx.setup();
  // a sheet from before: its own weekend rows, which the update must keep a copy of
  const cfg = g.tab('Config'), rows = cfg.rows(), at = rows.findIndex(r => r[1] === 'Out' && r[2] === 'Sat-Sun');
  cfg.getRange(at + 1, 1, 1, 6).setValues([['3', 'Out', 'Sat', '10:01, 11:01', '13', 'old']]);
  delete g.state.props.BUS_WKND_V1; g.ctx.resetRun_();
  const weekday = cfg.rows().filter(r => r[2] === 'Mon-Fri').length;
  g.ctx.ensureWeekendBus_();
  const after = g.tab('Config').rows();
  assert.strictEqual(after.filter(r => r[2] === 'Mon-Fri').length, weekday, 'weekday rows untouched');
  assert.deepStrictEqual(after.filter(r => r[2] === 'Sat-Sun').map(r => r[0] + ' ' + r[1] + ' ' + r[3]), ['3 Out 15:01, 16:01', '132 Out 18:18, 19:18', '3 Back 16:41, 18:30', '132 Back 18:30, 19:30, 20:30']);
  assert.ok(!after.some(r => r[2] === 'Sat'), 'the old Saturday row is gone from the timetable');
  assert.ok(g.tab('Archive').rows().some(r => /Weekend bus times/.test(r[1]) && /10:01, 11:01/.test(r[2])), 'and kept in the Archive tab');
  g.ctx.ensureWeekendBus_();
  assert.strictEqual(g.tab('Config').rows().filter(r => r[2] === 'Sat-Sun').length, 4, 'runs once');
  const t = JSON.parse(JSON.stringify(g.ctx.previewTransport_('2026-10-17'))).plan;
  assert.deepStrictEqual([t.out.dep, t.back.dep, t.homeBy], [901, 1001, 1015], '15:01 out, 16:41 back, home 16:55');
  assert.ok(t.notes.some(n => /Don't miss the 16:41: the next bus home is the 3 at 18:30/.test(n)));
  const sun = JSON.parse(JSON.stringify(g.ctx.previewTransport_('2026-10-18'))).plan;
  assert.strictEqual(sun.back.dep, 1001, 'Sunday the same until its own times go in');
});
