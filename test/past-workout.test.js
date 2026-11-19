const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

const plain = x => JSON.parse(JSON.stringify(x));
function ready(iso) {
  const g = loadProject({ now: new Date(iso) });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY };
}
const at = (g, iso) => { g.state.now = new Date(iso); g.state.cache = {}; g.ctx.resetRun_(); };
const rowsOn = (g, d) => g.tab('Workout log').rows().filter(r => r[0] === d);
const set = (exercise, weight, reps, n = 1) => Array.from({ length: n }, (_, i) => ({ exercise, set: i + 1, weight, reps, rpe: 8 }));
// an Upper A on Thu 5 Nov at the weights the backfill should copy
function upperA(C, me) {
  C.saveWorkout(me, 'Upper A', [].concat(set('Bench press', 85, 6, 4), set('Incline DB press', 30, 9, 3), set('Lat pulldown', 70, 10, 3), set('Cable fly', 15, 12, 3),
    set('Seated DB shoulder press', 24, 9, 3), set('Seated cable row', 65, 11, 3), set('Rope pushdown', 25, 11, 3)), { template: 'ul-ua' });
}

test('pure: the rest at last time\'s weights, a PR in place of the heaviest set, and only what you listed when you listed it all', () => {
  const { C } = ready('2026-11-19T10:00:00Z');
  const last = { 'bench press': [{ w: 60, r: 10, t: 'W' }, { w: 85, r: 6, t: '' }, { w: 85, r: 6, t: '' }, { w: 80, r: 8, t: '' }], 'cable fly': [{ w: 15, r: 12, t: '' }] };
  const p = plain(C.pastPlan(['Bench press', 'Cable fly', 'Rope pushdown'], {}, { 'Bench press': { weight: 90, reps: 8 } }, last));
  assert.deepStrictEqual(p.exercises[0].sets.map(s => s.weight + 'x' + s.reps), ['90x8', '85x6', '80x8'], 'warm-ups out, the PR replaces the heaviest');
  assert.strictEqual(p.exercises[0].from, 'pr');
  assert.deepStrictEqual(p.exercises[1].sets.map(s => s.weight + 'x' + s.reps), ['15x12']);
  assert.deepStrictEqual(p.missing, ['Rope pushdown'], 'never made up');
  const only = plain(C.pastPlan(['Bench press', 'Cable fly'], { 'Cable fly': [{ weight: 20, reps: 10, type: '' }] }, {}, last, null, false));
  assert.deepStrictEqual(only.exercises.map(x => x.exercise), ['Cable fly']);
  assert.deepStrictEqual(only.missing, []);
});

test('Dean\'s two lost sessions: Monday 16 Nov as listed, Thursday 12 Nov at his last weights with the bench PR; once only', () => {
  const { g, C, me } = ready('2026-11-05T17:00:00Z');
  upperA(C, me);
  at(g, '2026-11-19T10:00:00Z');
  const lines = plain(C.ensurePastNov_());
  assert.strictEqual(lines.length, 2, JSON.stringify(lines));
  const mon = rowsOn(g, '2026-11-16'), thu = rowsOn(g, '2026-11-12');
  assert.deepStrictEqual(mon.filter(r => r[2] === 'Leg press').map(r => r[5] + 'x' + r[6] + (r[9] ? r[9] : '')), ['100x10W', '150x8W', '190x5W', '225x8', '225x10', '225x8']);
  assert.deepStrictEqual(mon.filter(r => r[2] === 'Hack squat').map(r => r[5] + 'x' + r[6] + r[9]), ['77x10', '97x10', '127x8', '97x8D']);
  assert.ok(!mon.some(r => r[2] === 'Cable crunch'), 'listed the whole session: nothing filled in');
  assert.ok(mon.every(r => r[12] === 'ul-la' && r[1] === 'Lower A'));
  assert.deepStrictEqual(thu.filter(r => r[2] === 'Bench press').map(r => r[5] + 'x' + r[6]), ['90x8', '85x6', '85x6', '85x6']);
  assert.deepStrictEqual(thu.filter(r => r[2] === 'Rope pushdown').map(r => r[5]), [25, 25, 25], 'the rest at last time\'s weights');
  assert.match(lines[1], /Logged Upper A on Thu 12 Nov.*New best: Bench press/);
  const gym = g.tab('Gym log').rows();
  assert.ok(gym.some(r => r[0] === '2026-11-16' && r[6] === 'Done' && r.includes('ul-la')));
  assert.ok(gym.some(r => r[0] === '2026-11-12' && r[6] === 'Done' && r.includes('ul-ua')));
  assert.ok(g.tab('XP log').rows().some(r => r[0] === '2026-11-16' && /Gym: Lower A \(logged later\)/.test(r[3])), 'the XP sits on the day it was done');
  assert.ok(g.tab('Workouts').rows().some(r => r[0] === '2026-11-16' && /Incline walk 20 min/.test(r[9])));
  assert.strictEqual(plain(C.trainState(me)).split.next.name.slice(0, 5), 'Upper', 'Lower A on Monday: upper next');
  // the app runs it once, on the next load
  const n = g.tab('Workout log').rows().length;
  C.appState(me);
  assert.strictEqual(g.tab('Workout log').rows().length, n, 'the flag was set: nothing added twice');
  assert.ok(JSON.parse(g.state.props.PAST_NOV_V1).lines.length === 2);
});

test('a session the lag logged on the wrong day or as the Pump is put right, never doubled', () => {
  // Monday's legs arrived on Tuesday, logged as the Pump
  const { g, C, me } = ready('2026-11-05T17:00:00Z');
  upperA(C, me);
  at(g, '2026-11-17T08:00:00Z');
  C.saveWorkout(me, 'Arms & Shoulders Pump', [].concat(set('Leg press', 225, 8, 3), set('Hack squat', 127, 8)), { template: 'pump' });
  // Thursday's Upper A arrived on Friday
  at(g, '2026-11-13T09:00:00Z');
  upperA(C, me);
  at(g, '2026-11-19T10:00:00Z');
  const lines = plain(C.ensurePastNov_());
  assert.ok(lines.some(l => /Took Arms & Shoulders Pump on Tue 17 Nov out of the log/.test(l)), JSON.stringify(lines));
  assert.ok(lines.some(l => /Moved Upper A from Fri 13 Nov to Thu 12 Nov/.test(l)), JSON.stringify(lines));
  assert.strictEqual(rowsOn(g, '2026-11-17').length, 0);
  assert.strictEqual(rowsOn(g, '2026-11-13').length, 0);
  assert.strictEqual(rowsOn(g, '2026-11-12').filter(r => r[2] === 'Bench press').length, 4, 'moved, not logged again');
  assert.strictEqual(rowsOn(g, '2026-11-16').filter(r => r[2] === 'Leg press').length, 6);
  const archive = g.tab('Archive').rows();
  assert.ok(archive.some(r => /Removed: 2026-11-17/.test(r[1])) && archive.some(r => /Moved to 2026-11-12/.test(r[1])), 'copies kept');
  // relabel on the day itself
  const r = plain(C.relabelPast_('2026-11-12', 'ul-ua', 'Upper B'));
  assert.match(r.line, /is now Upper B/);
  assert.ok(rowsOn(g, '2026-11-12').every(x => x[12] === 'ul-ub'));
});

test('in words: Claude\'s plan is checked and done (log, move); a future day or one too far back is refused', () => {
  const { g, C, me } = ready('2026-11-05T17:00:00Z');
  upperA(C, me);
  at(g, '2026-11-10T17:00:00Z');
  C.saveWorkout(me, 'Lower B', set('Leg press', 200, 10, 3), { template: 'ul-lb' });
  at(g, '2026-11-19T10:00:00Z');
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-test';
  const plan = [
    { action: 'log', date: '2026-11-18', to_date: '', template: 'ul-ua', from_template: '', exercises: [], prs: [], fill_rest: true, notes: '' },
    { action: 'move', date: '2026-11-10', to_date: '2026-11-09', template: 'ul-lb', from_template: '', exercises: [], prs: [], fill_rest: true, notes: '' },
    { action: 'log', date: '2026-11-25', to_date: '', template: 'ul-la', from_template: '', exercises: [], prs: [], fill_rest: true, notes: '' }
  ];
  g.state.claudeReply = { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Got it.', plan }) }] } };
  const res = plain(C.logWorkoutText(me, 'Yesterday was Upper A. The Lower B on the 10th was really the 9th.'));
  assert.strictEqual(res.reply, 'Got it.');
  assert.match(res.done[0], /Logged Upper A on Wed 18 Nov: 7 exercises, 22 sets \(7 at your last weights\)/);
  assert.match(res.done[1], /Moved Lower B from Tue 10 Nov to Mon 9 Nov/);
  assert.match(res.done[2], /hasn't happened yet/);
  assert.ok(res.state && res.state.game, 'the screen comes back with it');
  assert.throws(() => C.logWorkoutText(g.state.props.PARTNER_KEY, 'Monday did Lower A'), /Dean's/);
  assert.throws(() => C.pastDay_('2026-08-01'), /too far back/);
  const src = require('fs').readFileSync(require('path').join(__dirname, '../web/app.js'), 'utf8');
  assert.ok(/id="pastForm"/.test(src) && /call\('logWorkoutText'/.test(src) && /logWorkoutText: 1/.test(src), 'the Train tab box, straight to the server');
});
