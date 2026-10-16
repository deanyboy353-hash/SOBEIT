const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const F = require('../web/fmt.js');
const plain = x => JSON.parse(JSON.stringify(x));
const at = (g, iso) => { g.state.now = new Date(iso); };

function ready(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-14T08:00:00Z') });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
function built() {
  const r = ready();
  const HOUSE = { floors: ['downstairs'], rooms: [{ name: 'Kitchen', floor: 'downstairs' }, { name: 'Living room', floor: 'downstairs' }, { name: 'Bathroom', floor: 'downstairs' }],
    bins: [], laundryDay: 6, pets: false, chores: { dishes: { now: 'daily', goal: 'daily', who: 'whoever' }, bathroom: { now: 'monthly', goal: 'weekly', who: 'whoever' } }, extras: [] };
  r.C.saveSetup(r.me, 'profile', { done: true, minimum: 2, manageable: '3-4', hates: [] });
  r.C.saveSetup(r.partner, 'profile', { done: true, minimum: 2 });
  r.C.saveSetup(r.me, 'house', HOUSE);
  r.C.buildChores(r.me);
  return r;
}

// ---------- Win the day ----------

test('Win the day: one score from your minimum; the partner\'s win and "both" come with it', () => {
  const { C, me, partner } = built();
  let w = plain(C.appState(me)).game.win;
  assert.strictEqual(w.by, 'jobs'); assert.strictEqual(w.need, 2); assert.strictEqual(w.done, 0); assert.strictEqual(w.won, false);
  assert.strictEqual(w.partner.won, false); assert.strictEqual(w.both, false);
  const jobs = plain(C.appState(me)).quests.board.filter(q => q.must).map(q => q.name);
  C.questDone(me, jobs[0]);
  w = plain(C.appState(me)).game.win;
  assert.strictEqual(w.done, 1); assert.strictEqual(w.won, false);
  assert.strictEqual(F.winText(w).label, 'Win the day: 1 of 2');
  C.questDone(me, jobs[1]);
  const s = plain(C.appState(me));
  assert.strictEqual(s.game.win.won, true);
  assert.strictEqual(s.game.win.won, s.game.streak.todayDone, 'the score and the streak agree');
  assert.strictEqual(s.game.win.both, false, 'Yaz hasn\'t won yet');
  assert.strictEqual(s.game.pet.mood === 'happy', false, 'the pet waits for you both');
  // Yaz wins hers: both won, the couple streak and the pet move
  plain(C.appState(partner)).quests.board.filter(q => q.must).forEach(q => { try { C.questDone(partner, q.name); } catch (e) {} });
  const y = plain(C.appState(partner)).game;
  if (y.win.won) {
    const d = plain(C.appState(me)).game;
    assert.strictEqual(d.win.partner.won, true); assert.strictEqual(d.win.both, true);
    assert.strictEqual(d.team.todayDone, true); assert.strictEqual(d.pet.mood, 'happy');
  }
});

test('Win the day before setup: the XP goal, and no "Goal hit" wording when the day isn\'t won', () => {
  const { C, me } = ready();
  const w = plain(C.appState(me)).game.win;
  assert.strictEqual(w.by, 'xp'); assert.strictEqual(w.won, false);
  const t = F.winText(w);
  assert.ok(!/goal hit|won/i.test(t.big + t.small + t.label), JSON.stringify(t));
  assert.deepStrictEqual(F.winText({ by: 'xp', done: 12, need: 30, won: false }), { big: '12/30', small: '18 XP to go', label: 'Win the day: 12 of 30' });
  assert.strictEqual(F.winText({ by: 'jobs', done: 1, need: 2, won: false }).small, '1 job to go');
  assert.strictEqual(F.winText({ by: 'jobs', done: 2, need: 2, extra: 1, won: true }).label, 'Day won');
  assert.strictEqual(F.winText({ by: 'jobs', done: 0, need: 0, won: true }).big, 'Free win');
});

// ---------- Home order ----------

test('Home order: brief, win, deadline, routine, water/weight, characters and pet, then the rest', () => {
  assert.deepStrictEqual(F.homeOrder([]).slice(0, 6).map(x => x.id), ['brief', 'win', 'deadlines', 'routine', 'tiles', 'stage']);
  // an old saved order is replaced, but hidden cards stay hidden
  const old = [{ id: 'feed', hide: false }, { id: 'us', hide: true }, { id: 'challenges', hide: true }, { id: 'deadlines', hide: false }, { id: 'pet', hide: true }];
  const o = F.homeOrder(old);
  assert.deepStrictEqual(o.slice(0, 3).map(x => x.id), ['brief', 'win', 'deadlines']);
  assert.strictEqual(o.find(x => x.id === 'us').hide, true);
  ['challenges', 'whatnow', 'next', 'make'].forEach(id => assert.ok(!o.some(x => x.id === id), 'retired card ' + id + ' is dropped'));
  assert.strictEqual(o.find(x => x.id === 'feed').hide, false);
  assert.strictEqual(o.find(x => x.id === 'stage').hide, false, 'merged cards show');
  // a new order is kept as saved (every card can move)
  const mine = [{ id: 'stage' }, { id: 'win' }, { id: 'brief', hide: true }];
  assert.deepStrictEqual(F.homeOrder(mine).slice(0, 3).map(x => x.id + (x.hide ? '-' : '')), ['stage', 'win', 'brief-']);
  assert.strictEqual(F.homeOrder(mine).length, F.HOME_DEFAULT.length);
});

test('Home order: the server accepts the new cards in Edit home screen', () => {
  const { C, me } = ready();
  const s = plain(C.setPrefs(me, { home: F.homeOrder([]).map((x, i) => ({ id: x.id, hide: i === 5 })) }));
  assert.strictEqual(s.fun.prefs.home.length, F.HOME_DEFAULT.length);
  assert.strictEqual(s.fun.prefs.home[5].id, 'stage'); assert.strictEqual(s.fun.prefs.home[5].hide, true);
});

// ---------- routines ----------

test('Routines: the morning one is open until noon, then folds to a line; the evening one appears at 6pm', () => {
  const { g, C, me } = ready('2026-10-14T07:30:00Z');                   // 08:30 BST
  const phase = name => plain(C.appState(me)).routines.routines.find(r => r.name === name).phase;
  assert.strictEqual(phase('Morning'), 'open'); assert.strictEqual(phase('Evening'), 'hidden');
  at(g, '2026-10-14T11:30:00Z');                                         // 12:30
  assert.strictEqual(phase('Morning'), 'summary'); assert.strictEqual(phase('Evening'), 'hidden');
  at(g, '2026-10-14T17:10:00Z');                                         // 18:10
  assert.strictEqual(phase('Evening'), 'open'); assert.strictEqual(phase('Morning'), 'hidden');
  assert.strictEqual(plain(C.appState(me)).routines.evening, true);
  // pure rule
  assert.strictEqual(C.routinePhase({ name: 'Morning', time: 510 }, 600, true), 'summary', 'finished before noon folds');
  assert.strictEqual(C.routinePhase({ name: 'Wind down', time: 1290 }, 1100, false), 'open', 'late routines count as evening');
  assert.strictEqual(C.routinePhase({ name: 'Gym bag', time: 900 }, 830, false), 'hidden');
  assert.strictEqual(C.routinePhase({ name: 'Gym bag', time: 900 }, 850, false), 'open');
});

test('Routines: "Look at the Home tab" is gone from the default and from existing routines', () => {
  const { C, me, g } = ready();
  const steps = () => plain(C.appState(me)).routines.routines.find(r => r.name === 'Morning').steps;
  assert.ok(!steps().some(s => /home tab/i.test(s)));
  C.saveRoutine(me, 'Morning', { name: 'Morning', time: '08:30', steps: ['Teeth', 'Look at the Home tab', 'Get dressed'] });
  delete g.state.props.ROUTINE_V2;
  assert.deepStrictEqual(steps(), ['Teeth', 'Get dressed']);
});

// ---------- the brief ----------

test('Brief: rewritten for a new part of the day, every 3 hours, and after something big (at most every 15 min)', () => {
  const { C } = ready();
  const t0 = Date.UTC(2026, 9, 14, 8, 0), b = { date: '2026-10-14', part: 'morning', brief: 'x', ts: t0 };
  assert.strictEqual(C.briefStale(b, '2026-10-14', 'morning', t0 + 60000, false), false);
  assert.strictEqual(C.briefStale(b, '2026-10-14', 'afternoon', t0 + 60000, false), true);
  assert.strictEqual(C.briefStale(b, '2026-10-15', 'morning', t0 + 60000, false), true);
  assert.strictEqual(C.briefStale(b, '2026-10-14', 'morning', t0 + 3 * 3600000, false), true);
  assert.strictEqual(C.briefStale(b, '2026-10-14', 'morning', t0 + 10 * 60000, true), false, 'too soon after the last one');
  assert.strictEqual(C.briefStale(b, '2026-10-14', 'morning', t0 + 16 * 60000, true), true);
  // the page's side
  assert.strictEqual(F.briefDue(null, 'morning', t0, 0), 'stale');
  assert.strictEqual(F.briefDue(b, 'morning', t0 + 60000, 0), '');
  assert.strictEqual(F.briefDue(b, 'morning', t0 + 20 * 60000, t0 + 5 * 60000), 'big');
  assert.strictEqual(F.briefDue(b, 'morning', t0 + 5 * 60000, t0 + 4 * 60000), '');
  assert.strictEqual(F.briefDue(b, 'morning', t0 + 3 * 3600000 + 1, 0), 'stale');
  assert.strictEqual(F.ago(t0, t0 + 30000), 'just now');
  assert.strictEqual(F.ago(t0, t0 + 12 * 60000), '12 min ago');
  assert.strictEqual(F.ago(t0, t0 + 125 * 60000), '2 h ago');
  // what counts as big
  const st = (won, gym) => ({ game: { win: { won } }, today: { gym: { done: gym } }, routines: { routines: [] }, deadlines: [] });
  assert.strictEqual(F.bigMoment(st(false, false), st(true, false)), true);
  assert.strictEqual(F.bigMoment(st(true, false), st(true, true)), true);
  assert.strictEqual(F.bigMoment(st(true, true), st(true, true)), false);
});

