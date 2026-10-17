const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

const plain = x => JSON.parse(JSON.stringify(x));
function ready(iso = '2026-10-20T08:00:00Z') {   // Tue
  const g = loadProject({ now: new Date(iso) });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY };
}
const week = (C, mon, logged = {}) => [0, 1, 2, 3, 4, 5, 6].map(i => { const ymd = C.addDays_(mon, i); return { ymd, dow: C.dayOfWeek_(ymd), logged: logged[ymd] === undefined ? null : logged[ymd] }; });

test('Trend: each weigh-in moves it a tenth of the way; gaps carry the last value', () => {
  const { C } = ready();
  const t = plain(C.trendSeries([['2026-10-01', 90], ['2026-10-03', 80]], '2026-10-04'));
  assert.deepStrictEqual(t, [['2026-10-01', 90], ['2026-10-02', 90], ['2026-10-03', 89], ['2026-10-04', 89]]);
  assert.deepStrictEqual(plain(C.trendSeries([], '2026-10-04')), []);
});

test('Burn: the starting guess until 10 days are logged, then learned from food against the trend', () => {
  const { C } = ready();
  const flat = n => Array.from({ length: n }, (_, i) => ({ kcal: i < 5 ? 2000 : null, trend: 90 }));
  assert.strictEqual(C.burnEstimate(2880, flat(20)).kcal, 2880, 'too few logged days: the guess');
  // 21 days at 2,200 while the trend drops 0.5 kg a week: 2,200 + 550 = 2,750
  const days = Array.from({ length: 21 }, (_, i) => ({ kcal: 2200, trend: 90 - i * (0.5 / 7) }));
  const b = C.burnEstimate(2880, days);
  assert.strictEqual(b.learned, 100);
  assert.ok(Math.abs(b.kcal - 2750) <= 10, b.kcal);
  assert.ok(C.burnEstimate(2880, Array.from({ length: 21 }, () => ({ kcal: 1000, trend: 90 }))).kcal >= 2880 - 700, 'never far from the guess');
});

test('The week: social day at maintenance, more on gym days than rest days, the weekly sum holds the deficit, floor and steps', () => {
  const { C } = ready();
  const p = plain(C.goalDayPlan({ burn: 2700, rate: 0.6, social: 6, gym: [1, 2, 4, 5], today: '2026-10-20', week: week(C, '2026-10-19') }));
  const by = t => p.days.filter(d => d.type === t);
  assert.strictEqual(by('social').length, 1); assert.strictEqual(by('social')[0].planned, 2700);
  assert.ok(by('gym')[0].planned > by('rest')[0].planned, 'gym days eat a little more');
  const sum = p.days.reduce((a, d) => a + d.planned, 0);
  assert.ok(Math.abs(sum - (7 * 2700 - 0.6 * 7700)) <= 40, 'the week adds up to the deficit: ' + sum);
  assert.strictEqual(p.type, 'gym'); assert.strictEqual(p.steps, 7500);
  // a small burn: never below 1,700; steps make up the rest
  const low = plain(C.goalDayPlan({ burn: 2300, rate: 0.6, social: 6, gym: [1, 2, 4, 5], today: '2026-10-21', week: week(C, '2026-10-19') }));
  assert.ok(low.days.every(d => d.planned >= 1700), 'social day included');
  assert.ok(low.days.find(d => d.type === 'rest').steps > 10000, 'more steps instead of less food');
});

test('Over on a day spreads across the rest of the week (at most 250 a day); the social day is never cut', () => {
  const { C } = ready();
  const base = plain(C.goalDayPlan({ burn: 2700, rate: 0.6, social: 6, gym: [1, 2, 4, 5], today: '2026-10-21', week: week(C, '2026-10-19') }));
  const over = plain(C.goalDayPlan({ burn: 2700, rate: 0.6, social: 6, gym: [1, 2, 4, 5], today: '2026-10-22', week: week(C, '2026-10-19', { '2026-10-19': base.days[0].planned + 500, '2026-10-20': base.days[1].planned + 100 }) }));
  assert.strictEqual(over.over, 600);
  assert.strictEqual(over.type, 'gym');
  assert.strictEqual(over.adjust, -150, '600 over across the 4 days left');
  const big = plain(C.goalDayPlan({ burn: 2700, rate: 0.6, social: 6, gym: [1, 2, 4, 5], today: '2026-10-22', week: week(C, '2026-10-19', { '2026-10-19': 6000 }) }));
  assert.strictEqual(big.adjust, -250, 'never more than 250 a day');
  const sat = plain(C.goalDayPlan({ burn: 2700, rate: 0.6, social: 6, gym: [1, 2, 4, 5], today: '2026-10-24', week: week(C, '2026-10-19', { '2026-10-19': 4000 }) }));
  assert.strictEqual(sat.type, 'social'); assert.strictEqual(sat.adjust, 0);
});

test('Goal state: starts from the trend on 17 Oct, Christmas and March targets at 0.5 kg a week, food targets follow the plan', () => {
  const { g, C, me } = ready();
  for (let i = 0; i < 29; i++) {
    const d = C.addDays_('2026-09-21', i);
    C.appendRow_('weight', { Date: d, Time: '08:00', 'Weight (kg)': 92 - i * 0.06 });
    [600, 800, 900].forEach((k, j) => C.appendRow_('food', { Date: d, Time: '1' + j + ':00', Entry: 'e' + i + j, Item: 'x', kcal: k, 'Protein (g)': 40, Source: 't' }));
  }
  C.resetRun_(); g.state.cache = {};
  const s = plain(C.appState(me)), G = s.goal;
  assert.ok(G.startKg > 90 && G.startKg < 92, 'trend at the start: ' + G.startKg);
  assert.strictEqual(G.milestone.kg, Math.round((G.startKg - 0.5 * (69 / 7)) * 10) / 10, 'Christmas: 0.5 kg a week');
  assert.ok(G.end.kg < G.milestone.kg);
  assert.ok(G.burn.learned > 0, 'learned from the logs');
  assert.strictEqual(s.food.targets.kcal, G.today.kcal, 'the Food tab uses the plan');
  assert.strictEqual(s.food.targets.dayType, G.today.type);
  assert.ok(G.chart.trend.length && G.chart.weights.length);
  // change the social day, the reason and the pace
  const s2 = plain(C.setGoal(me, { social: 5, why: 'Christmas photos', rate: 0.7 }));
  assert.deepStrictEqual([s2.goal.social, s2.goal.why, s2.goal.rate], [5, 'Christmas photos', 0.7]);
  assert.throws(() => C.setGoal(me, { rate: 0.3 }), /0.5 to 1/);
  assert.throws(() => C.setGoal(g.state.props.PARTNER_KEY, { rate: 0.6 }), /Dean/);
});

test('Reminders: weigh-in, social day, back on plan, meals, over, steps and every half hour from 8pm until three things are logged', () => {
  const { C } = ready();
  const t = { type: 'rest', kcal: 1800, steps: 10000 };
  const c = o => Object.assign({ m: 0, dow: 2, wake: 510, weighed: false, weighDay: false, entries: 0, kcal: 0, protein: 0, t, steps: null, proteinMin: 130, socialYesterday: false, why: 'Christmas photos', goalLine: '86.3 kg by Christmas', weekLine: 'Week line', behindLine: '' }, o);
  const ids = o => plain(C.goalAlerts(c(o))).map(a => a.id);
  assert.ok(ids({ m: 535 }).includes('gweigh'));
  assert.ok(!ids({ m: 535, weighed: true }).includes('gweigh'));
  assert.ok(ids({ m: 545, t: Object.assign({}, t, { type: 'social' }) }).includes('gsocial'));
  assert.ok(ids({ m: 545, socialYesterday: true }).includes('gback'));
  assert.ok(ids({ m: 630 }).includes('gbreak'));
  assert.ok(ids({ m: 840, entries: 1 }).includes('glunch'));
  assert.ok(ids({ m: 900, entries: 2, kcal: 2000 }).includes('gover'));
  assert.ok(ids({ m: 1085, steps: 3000 }).includes('gsteps'));
  assert.ok(!ids({ m: 1085, steps: 9000 }).includes('gsteps'));
  assert.deepStrictEqual(ids({ m: 1205, entries: 1 }).filter(x => /^geve/.test(x)), ['geve-40']);
  assert.deepStrictEqual(ids({ m: 1240, entries: 1 }).filter(x => /^geve/.test(x)), ['geve-41'], 'every half hour');
  assert.deepStrictEqual(ids({ m: 1240, entries: 3 }).filter(x => /^geve/.test(x)), [], 'stops at three things logged');
  const eve = plain(C.goalAlerts(c({ m: 1205, entries: 1, kcal: 900 })))[0];
  assert.match(eve.body, /900 kcal left today|Christmas photos|86.3 kg/);
  assert.ok(ids({ m: 570, dow: 1 }).includes('gweek'));
  assert.ok(ids({ m: 725, dow: 4, behindLine: 'behind' }).includes('gbehind'));
});
