const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

const g = loadProject({ now: new Date('2026-10-14T08:00:00Z') });
const C = g.ctx;
const plain = x => JSON.parse(JSON.stringify(x));
// 2026-10-12 is a Monday
const MON = '2026-10-12', TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16', SAT = '2026-10-17', SUN = '2026-10-18';
const dean = { work: { 1: [540, 900], 2: [540, 900], 3: [540, 900], 4: [540, 960] }, gym: [2, 3, 5, 6], manageable: '3-4', minimum: 2, hates: [] };
const yaz = { work: { 1: [540, 1050], 2: [540, 1050], 3: [540, 1050], 4: [540, 1050], 5: [540, 1050] }, manageable: '3-4', minimum: 2, hates: [] };
const house = {
  floors: ['downstairs', 'upstairs'],
  rooms: [{ name: 'Kitchen', floor: 'downstairs' }, { name: 'Living room', floor: 'downstairs' }, { name: 'Hallway', floor: 'downstairs' }, { name: 'Toilet', floor: 'downstairs' },
    { name: 'Bedroom', floor: 'upstairs' }, { name: 'Study', floor: 'upstairs' }, { name: 'Bathroom', floor: 'upstairs' }, { name: 'Stairs', floor: 'upstairs' }],
  bins: [{ name: 'General', day: 2 }, { name: 'Recycling', day: 4, weeks: 2, anchor: '2026-10-15' }],
  laundryDay: 6, pets: false,
  chores: { hoover_down: { now: 'monthly', goal: 'weekly', who: 'shared' }, hoover_up: { now: 'monthly', goal: 'biweekly', who: 'whoever' }, dishes: { now: 'daily', goal: 'daily', who: 'shared' }, laundry: { now: 'weekly', goal: 'weekly', who: 'yaz' }, bins: { who: 'me' }, shop: { now: 'weekly', goal: 'weekly', who: 'together' } },
  extras: [{ name: 'Water the plants', now: 'weekly', goal: 'weekly', who: 'me', minutes: 5 }],
  people: { me: dean, partner: yaz }
};
const job = (o) => Object.assign({ id: o.name, key: '', minutes: 10, assign: 'me', archived: false, tod: 'any' }, o);

test('Chore list from setup answers: split by floor and room, with sensible times', () => {
  const list = plain(C.cpBuildChores(house, WED)), names = list.map(c => c.name);
  for (const n of ['Hoover downstairs', 'Hoover upstairs', 'Dishes / dishwasher', 'Laundry: wash and hang', 'Laundry: put it away', 'Change bedsheets', 'Clean toilet', 'Clean bathroom', 'Kitchen surfaces and hob', 'Bins out: General', 'Bins out: Recycling', 'Food shop', 'Dust downstairs', 'Dust upstairs', 'Water the plants'])
    assert.ok(names.includes(n), n + ' missing from ' + names.join(', '));
  assert.ok(names.some(n => /^Mop downstairs \(kitchen, hallway, toilet\)$/.test(n)), names.join(', '));
  const hd = list.find(c => c.name === 'Hoover downstairs');
  assert.strictEqual(hd.minutes, 17);                    // 5 + 3 per room
  assert.strictEqual(hd.assign, 'rotate'); assert.strictEqual(hd.now, 30); assert.strictEqual(hd.goal, 7);
  assert.strictEqual(list.find(c => c.name === 'Hoover upstairs').assign, 'anyone');
  assert.strictEqual(list.find(c => c.name === 'Food shop').assign, 'together');
  // bins go out the evening before collection (Tue collection -> Monday evening)
  const gen = list.find(c => c.name === 'Bins out: General');
  assert.deepStrictEqual(gen.days, [1]); assert.strictEqual(gen.tod, 'evening'); assert.strictEqual(gen.assign, 'me');
  // laundry on laundry day, put away the day after it's washed
  assert.deepStrictEqual(list.find(c => c.name === 'Laundry: wash and hang').days, [6]);
  assert.ok(list.find(c => c.name === 'Laundry: put it away').after);
  // every job has a first due date or fixed days, and XP
  list.forEach(c => { assert.ok(c.due || c.days || c.after, c.name); assert.ok(c.xp >= 5, c.name); });
});

test('Bins every other week only on the right weeks', () => {
  const list = plain(C.cpBuildChores(house, WED)), rec = list.find(c => c.name === 'Bins out: Recycling');
  assert.deepStrictEqual(rec.days, [3]);                 // Thursday collection -> Wednesday evening
  assert.strictEqual(C.cpOnDay(rec, WED), true);
  assert.strictEqual(C.cpOnDay(rec, '2026-10-21'), false);
  assert.strictEqual(C.cpOnDay(rec, '2026-10-28'), true);
});

test('Frequency ramps from "now" towards the goal over about 3 weeks, never jumping straight there', () => {
  const c = { now: 30, goal: 7, rampFrom: MON };
  const at = d => C.cpEvery(c, d);
  assert.strictEqual(at(MON), 14);                       // halfway (in steps) from monthly to weekly
  assert.ok(at('2026-10-19') < 14 && at('2026-10-19') > 7, String(at('2026-10-19')));
  assert.strictEqual(at('2026-11-02'), 7);               // three weeks in: the goal
  assert.strictEqual(at('2026-12-01'), 7);
  // wanting to do it LESS often: straight to the goal
  assert.strictEqual(C.cpEvery({ now: 7, goal: 14, rampFrom: MON }, MON), 14);
  // a chore you edited by hand (now = goal) doesn't ramp
  assert.strictEqual(C.cpEvery({ now: 2.5, goal: 2.5, rampFrom: MON }, MON), 2.5);
  assert.strictEqual(C.cpEveryText(14), 'Every 2 weeks');
});

test('Daily minimum: short must-do jobs first, bonus after; the day is a win at the minimum', () => {
  const chores = [job({ name: 'Dishes', due: SAT, minutes: 10 }), job({ name: 'Wipe hob', due: SAT, minutes: 5 }), job({ name: 'Bathroom', due: SAT, minutes: 20 }), job({ name: 'Plants', due: SAT, minutes: 5 })];
  const p = plain(C.cpPlanDay({ chores, people: { me: Object.assign({}, dean, { minimum: 2 }), partner: yaz } }, SAT));
  assert.strictEqual(p.me.minimum, 2);
  assert.ok(p.me.must.every(j => j.minutes <= 10), JSON.stringify(p.me.must));
  assert.ok(p.me.bonus.some(j => j.name === 'Bathroom'));
  assert.strictEqual(C.cpIsWin(1, 2), false); assert.strictEqual(C.cpIsWin(2, 2), true); assert.strictEqual(C.cpIsWin(3, 2), true);
  // a minimum of 3 on a quiet day: pull a short job forward from the next few days
  const quiet = [job({ name: 'Dishes', due: SAT, minutes: 10 }), job({ name: 'Plants', due: SUN, minutes: 5 }), job({ name: 'Windows', due: '2026-10-30', minutes: 5 })];
  const q = plain(C.cpPlanDay({ chores: quiet, people: { me: Object.assign({}, dean, { minimum: 3 }), partner: yaz } }, SAT));
  assert.deepStrictEqual(q.me.must.map(j => j.name).sort(), ['Dishes', 'Plants']);
  assert.ok(q.me.must.find(j => j.name === 'Plants').early);
  assert.strictEqual(q.me.minimum, 2);                   // only 2 things to do: 2 makes it a win
  // nothing at all to do: the minimum is 0, a free win
  const none = plain(C.cpPlanDay({ chores: [], people: { me: dean, partner: yaz } }, SAT));
  assert.strictEqual(none.me.minimum, 0); assert.strictEqual(C.cpIsWin(0, none.me.minimum), true);
});

test('Missed jobs roll over without piling up: carry cap, push to the next free day, daily jobs never stack', () => {
  const chores = ['Dust', 'Mop', 'Windows', 'Fridge', 'Oven'].map((n, i) => job({ name: n, due: MON, every: 7, goal: 7, now: 7, minutes: 15 + i }));
  chores.push(job({ name: 'Dishes', due: MON, goal: 1, now: 1, minutes: 10 }));
  const state = { chores, people: { me: dean, partner: yaz } };
  const p = plain(C.cpPlanDay(state, FRI));               // all four days late
  const late = p.me.must.concat(p.me.bonus).filter(j => j.overdue > 0);
  assert.ok(late.length <= 2, 'carried ' + late.length);
  assert.ok(p.me.later.length >= 3, JSON.stringify(p.me.later.map(j => j.name)));
  assert.strictEqual(p.me.must.concat(p.me.bonus).find(j => j.name === 'Dishes').overdue, 0);   // just today's dishes, not four days' worth
  const moves = plain(C.cpRollover(state, FRI));
  assert.ok(moves.length >= 3);
  moves.forEach(m => assert.ok(m.to > FRI, JSON.stringify(m)));
  const perDay = {}; moves.forEach(m => perDay[m.to] = (perDay[m.to] || 0) + 1);
  assert.ok(Object.values(perDay).every(n => n <= 2), JSON.stringify(perDay));   // spread out, not dumped on one day
  // a missed bin day isn't carried: the next one comes round
  const bins = job({ name: 'Bins', days: [1], minutes: 5 });
  assert.strictEqual(C.cpDueOn(bins, TUE, { chores: [bins] }), null);
});

test('Fair split: shared jobs go to the lighter week, rotation alternates, hated jobs steer away', () => {
  const people = { me: dean, partner: yaz };
  // rotate: the other person from last time
  assert.strictEqual(C.cpWho({ assign: 'rotate', lastBy: 'me' }, people, { me: 0, partner: 0 }), 'partner');
  assert.strictEqual(C.cpWho({ assign: 'rotate', lastBy: 'partner' }, people, { me: 0, partner: 0 }), 'me');
  // ...unless it's their turn and they hate it (and the other doesn't)
  const hates = { me: dean, partner: Object.assign({}, yaz, { hates: ['bathroom'] }) };
  assert.strictEqual(C.cpWho({ assign: 'rotate', key: 'bathroom', lastBy: 'me' }, hates, { me: 0, partner: 0 }), 'me');
  // ...or their week is much heavier
  assert.strictEqual(C.cpWho({ assign: 'rotate', lastBy: 'me' }, people, { me: 0.2, partner: 0.9 }), 'me');
  // anyone: the lighter week, away from a hated job
  assert.strictEqual(C.cpWho({ assign: 'anyone' }, people, { me: 0.6, partner: 0.3 }), 'partner');
  assert.strictEqual(C.cpWho({ assign: 'anyone', key: 'bathroom' }, hates, { me: 0.6, partner: 0.3 }), 'me');
  // over a whole week, shared work comes out roughly even (by each person's capacity)
  const chores = []; for (let i = 0; i < 12; i++) chores.push(job({ name: 'Job ' + i, assign: i % 2 ? 'anyone' : 'rotate', minutes: 10 + (i % 4) * 5, due: C.cpAdd(MON, i % 7), now: 7, goal: 7, order: i }));
  const state = { chores, people };
  const loads = plain(C.cpAssignWeek(state, MON));
  const mins = { me: 0, partner: 0 }; chores.forEach(c => mins[c.whoToday] += c.minutes);
  assert.ok(mins.me > 0 && mins.partner > 0, JSON.stringify(mins));
  assert.ok(Math.abs(loads.me - loads.partner) < 0.35, JSON.stringify(loads));
});

test('Spreading: lighter on work and gym days, big jobs on days off, nothing heavy late at night', () => {
  // Dean: Fri-Sun off; Thursday a work day; gym Fri
  assert.ok(C.cpCapacity(dean, MON) < C.cpCapacity(dean, SUN));
  assert.ok(C.cpCapacity(dean, FRI) < C.cpCapacity(dean, SUN));   // day off but a gym day: a bit lighter than Sunday
  const big = { name: 'Clean the oven', minutes: 45, now: 7, goal: 7, assign: 'me' };
  const next = C.cpNextDue(big, '2026-10-08', { me: dean, partner: yaz }, null, 'me');   // done Thu: due Thu, may move to Fri/Sat
  assert.ok([FRI, SAT, SUN].includes(next) || C.cpDow(next) === 0, next);
  assert.ok(!dean.work[C.cpDow(next)], 'big job landed on a work day: ' + next);
  // heavy jobs never sit in the evening
  assert.strictEqual(C.cpTod({ tod: 'evening', minutes: 30 }), 'afternoon');
  assert.strictEqual(C.cpTod({ tod: 'evening', minutes: 5 }), 'evening');
});

test('Editing a job changes the days ahead', () => {
  const c = job({ name: 'Mop', assign: 'me', now: 14, goal: 14, minutes: 20, due: SAT });
  const state = { chores: [c], people: { me: dean, partner: yaz } };
  assert.ok(C.cpPlanDay(state, SAT).me.bonus.concat(C.cpPlanDay(state, SAT).me.must).some(j => j.name === 'Mop'));
  c.assign = 'partner';                                    // give it to Yaz
  const p = plain(C.cpPlanDay(state, SAT));
  assert.ok(!p.me.must.concat(p.me.bonus).some(j => j.name === 'Mop'));
  assert.ok(p.partner.must.concat(p.partner.bonus).some(j => j.name === 'Mop'));
  c.now = c.goal = 7; C.cpComplete(state, c, SAT, 'partner');        // now weekly
  assert.ok(C.cpDiff(c.due, SAT) >= 6 && C.cpDiff(c.due, SAT) <= 9, c.due);
  c.archived = true;
  assert.strictEqual(C.cpPlanDay(state, c.due).partner.must.length + C.cpPlanDay(state, c.due).partner.bonus.length, 0);
});

test('Together jobs land on both lists; laundry put-away follows the wash', () => {
  const wash = job({ id: 'w', name: 'Wash', days: [6], assign: 'partner', minutes: 15 }), away = job({ id: 'a', name: 'Put away', after: 'w', assign: 'partner' });
  const shop = job({ name: 'Shop', assign: 'together', minutes: 60, due: SAT });
  const state = { chores: [wash, away, shop], people: { me: dean, partner: yaz } };
  let p = plain(C.cpPlanDay(state, SAT));
  assert.ok(p.me.bonus.concat(p.me.must).some(j => j.name === 'Shop') && p.partner.bonus.concat(p.partner.must).some(j => j.name === 'Shop'));
  assert.ok(!p.partner.must.concat(p.partner.bonus).some(j => j.name === 'Put away'));
  C.cpComplete(state, wash, SAT, 'partner');
  p = plain(C.cpPlanDay(state, SUN));
  assert.ok(p.partner.must.concat(p.partner.bonus).some(j => j.name === 'Put away'));
});

test('Must-dos are everyday house jobs, not a yearly admin job that happens to be short', () => {
  const chores = [job({ name: 'Book the boiler service', due: SAT, now: 365, goal: 365, minutes: 5 }), job({ name: 'Make the bed', due: SAT, now: 1, goal: 1, minutes: 3 }), job({ name: 'Wipe hob', due: SUN, now: 2.5, goal: 2.5, minutes: 10 })];
  const p = plain(C.cpPlanDay({ chores, people: { me: dean, partner: yaz } }, SAT));
  assert.deepStrictEqual(p.me.must.map(j => j.name), ['Make the bed', 'Wipe hob']);
  assert.ok(p.me.bonus.some(j => j.name === 'Book the boiler service'));
});

test('bins every 3 weeks: on the right Fridays only, and named that way', () => {
  const { loadProject } = require('./fakes');
  const g = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  const c = { days: [4], weeks: 3, anchor: '2026-10-15' };   // the Thursday evening before a Friday collection
  const on = [];
  for (let i = 0; i < 60; i++) { const d = g.ctx.cpAdd('2026-10-13', i); if (g.ctx.cpOnDay(c, d)) on.push(d); }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(on)), ['2026-10-15', '2026-11-05', '2026-11-26']);
  assert.strictEqual(g.ctx.parseEvery('3 weeks Thu').weeks, 3);
  assert.strictEqual(g.ctx.nextAfterDone('3 weeks Thu', '2026-10-15', '2026-10-15'), '2026-11-05');
  assert.match(g.ctx.rhythmLabel('3 weeks Thu'), /Every 3 weeks on Thursday/);
});

test("Dean and Yaz's bin calendar is filled in once: 3-weekly general waste, fortnightly food and garden; old bin jobs archived not deleted", () => {
  const { loadProject } = require('./fakes');
  const g = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  g.ctx.setup();
  const before = g.tab('Chores').rows().length;
  const s = g.ctx.appState(g.state.props.WEBAPP_KEY);
  const rows = g.tab('Chores').rows(), head = rows[0], col = n => head.indexOf(n);
  const get = name => rows.find(r => r[0] === name);
  const gw = get('Bins out: General waste');
  assert.ok(gw, 'general waste job');
  assert.strictEqual(gw[col('Every')], '3 weeks Thu');
  assert.strictEqual(gw[col('Next due')], '2026-10-15');
  assert.strictEqual(get('Bins out: Food and garden')[col('Every')], '2 weeks Thu');
  assert.strictEqual(get('Bins out: Food and garden')[col('Next due')], '2026-10-22');
  assert.strictEqual(get('Bins out: Blue-lidded recycling')[col('Next due')], '2026-10-29');
  const old = get('Take the bins out');
  assert.ok(old, 'old job kept');
  assert.strictEqual(old[col('Archived')], 'yes');
  assert.ok(rows.length >= before, 'nothing deleted');
  assert.strictEqual(JSON.parse(g.state.props.HOUSE).bins.length, 4);
  assert.ok(s.quests);
});
