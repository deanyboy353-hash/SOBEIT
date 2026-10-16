const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

// The XP rule (no chore setup): a day is won at 30 XP. Mon 12 Oct 2026 starts the week.
function ready(iso = '2026-10-12T05:05:00Z') {
  const g = loadProject({ now: new Date(iso) });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const at = (g, iso) => { g.state.now = new Date(iso); g.ctx.resetRun_(); };
const award = (g, d, xp, who = 'me') => g.ctx.appendRow_('xp', { Date: d, Time: '12:00', Who: who, What: 'x', XP: xp, Kind: 'quest' });
const streak = (g, id, st) => { g.state.props['STREAK_' + id] = JSON.stringify(st); };
const cash = (C, who = 'me') => C.cashBreakdown_(who).total;
const plain = x => JSON.parse(JSON.stringify(x));

test('lazy days: two a week each, the third is refused, and they come back on Monday', () => {
  const { g, C, me, partner } = ready();
  let s = plain(C.appState(me));
  assert.deepStrictEqual([s.game.lazy.left, s.game.lazy.perWeek, s.game.lazy.today], [2, 2, false]);
  s = plain(C.lazyDay(me, 'today'));
  assert.deepStrictEqual([s.game.lazy.left, s.game.lazy.today, s.game.win.lazy], [1, true, true]);
  assert.throws(() => C.lazyDay(me, 'today'), /already a lazy day/);
  assert.strictEqual(plain(C.appState(partner)).game.lazy.left, 2, 'each person has their own');
  at(g, '2026-10-14T08:00:00Z');                       // Wed
  C.lazyDay(me, 'today');
  at(g, '2026-10-16T08:00:00Z');                       // Fri
  assert.strictEqual(plain(C.appState(me)).game.lazy.left, 0);
  assert.throws(() => C.lazyDay(me, 'today'), /No lazy days left this week\. They reset on Monday/);
  at(g, '2026-10-18T20:00:00Z');                       // Sun night: still last week's
  assert.strictEqual(plain(C.appState(me)).game.lazy.left, 0);
  at(g, '2026-10-19T08:00:00Z');                       // Mon
  assert.strictEqual(plain(C.appState(me)).game.lazy.left, 2);
});

test('a lazy day is neither won nor lost: the streak stays, nothing is taken, and today can be undone', () => {
  const { g, C, me } = ready();
  streak(g, 'me', { count: 5, best: 5, through: '2026-10-11' });
  C.lazyDay(me, 'today');
  assert.strictEqual(C.streakNow_('me', '2026-10-12', 30).count, 5);
  assert.strictEqual(C.streakNow_('me', '2026-10-12', 30).lazy, true);
  at(g, '2026-10-13T05:05:00Z');
  const before = C.xpTotal_('me'), c0 = cash(C);
  C.dailyRun();
  assert.strictEqual(C.streakState_('me').count, 5, 'protected');
  assert.strictEqual(C.xpTotal_('me'), before);
  assert.strictEqual(cash(C), c0);
  // undo gives today's back
  C.lazyDay(me, 'today');
  assert.strictEqual(plain(C.appState(me)).game.lazy.left, 0);
  const s = plain(C.lazyDay(me, 'undo'));
  assert.deepStrictEqual([s.game.lazy.left, s.game.lazy.today], [1, false]);
  assert.throws(() => C.lazyDay(me, 'undo'), /isn't a lazy day/);
});

test('missing the minimum: the streak resets, 10% of the day\'s potential goes (capped), shown next morning; winning today pays it back', () => {
  const { g, C, me } = ready();
  award(g, '2026-10-11', 400); C.addCash_('me', 'Starting money', 1000, 'start');   // plenty in the bank: level 3, well into it
  streak(g, 'me', { count: 6, best: 6, through: '2026-10-11' });
  at(g, '2026-10-13T05:05:00Z');                        // Mon 12th was missed
  const xp0 = C.xpTotal_('me'), c0 = cash(C);
  C.dailyRun();
  const st = C.streakState_('me');
  assert.strictEqual(st.count, 0);
  assert.strictEqual(st.best, 6);
  assert.deepStrictEqual([st.penalty.xp, st.penalty.cash], [3, 30], '10% of the 30 XP goal, £10 a point');
  assert.strictEqual(C.xpTotal_('me'), xp0 - 3);
  assert.strictEqual(cash(C), c0 - 30);
  assert.strictEqual(C.xpOn_('me', '2026-10-13'), 0, 'today\'s XP isn\'t touched: the cost sits on the missed day');
  let lz = plain(C.appState(me)).game.lazy;
  assert.deepStrictEqual(lz.missed, { xp: 3, cash: 30, back: false });
  // the comeback: win today and it comes back, once
  C.addXp_('me', 'Hoover', 20, 'quest');
  assert.strictEqual(C.streakState_('me').penalty.back, false, 'not won yet');
  C.addXp_('me', 'Bins', 15, 'quest');
  assert.strictEqual(C.streakState_('me').penalty.back, true);
  assert.strictEqual(C.xpTotal_('me'), xp0 - 3 + 35 + 3);
  assert.strictEqual(cash(C), c0 - 30 + 350 + 30);
  C.addXp_('me', 'Dishes', 10, 'quest');
  assert.strictEqual(g.tab('XP log').rows().filter(r => r[5] === 'comeback').length, 1);
  g.state.cache = {};   // direct calls above skip withLock_, which is what clears the cached screen
  lz = plain(C.appState(me)).game.lazy;
  assert.strictEqual(lz.missed.back, true);
  // the cap: a big day's potential still costs at most 10 XP
  const names = C.readChores_().map(q => q.name);
  const p = C.missPenalty_('me', '2026-10-13', { must: names, bonus: [] }, 30);
  assert.ok(names.length && p.xp === 10, JSON.stringify(p));
});

test('never below zero: no XP or cash to lose means nothing is taken, and a level is never lost', () => {
  const { g, C, me } = ready();
  // nothing earned yet: nothing to take
  let p = C.missPenalty_('me', '2026-10-11', null, 30);
  assert.strictEqual(p.xp, 0);
  assert.ok(C.xpTotal_('me') >= 0 && cash(C) >= 0);
  // exactly at the start of level 2 (100 XP): the level is kept, so nothing is taken
  award(g, '2026-10-10', 100);
  assert.strictEqual(C.levelFor(C.xpTotal_('me')).level, 2);
  p = C.missPenalty_('me', '2026-10-11', null, 30);
  assert.strictEqual(p.xp, 0);
  assert.strictEqual(C.levelFor(C.xpTotal_('me')).level, 2);
  // 2 XP into the level: only 2 can go
  award(g, '2026-10-10', 2);
  p = C.missPenalty_('me', '2026-10-11', null, 30);
  assert.strictEqual(p.xp, 2);
  assert.strictEqual(C.levelFor(C.xpTotal_('me')).level, 2);
  assert.ok(cash(C) >= 0);
});

test('a missed day can be made a lazy day until noon the next morning: streak back, cost refunded', () => {
  const { g, C, me } = ready();
  award(g, '2026-10-11', 400); C.addCash_('me', 'Starting money', 1000, 'start');
  streak(g, 'me', { count: 6, best: 6, through: '2026-10-11' });
  at(g, '2026-10-13T05:05:00Z');
  const xp0 = C.xpTotal_('me'), c0 = cash(C);
  C.dailyRun();
  at(g, '2026-10-13T08:30:00Z');                        // 09:30 BST
  const offer = plain(C.appState(me)).game.lazy.offerYesterday;
  assert.deepStrictEqual(offer, { date: '2026-10-12', xp: 3, cash: 30, streak: 6 });
  const s = plain(C.lazyDay(me, 'yesterday'));
  assert.strictEqual(C.streakState_('me').count, 6);
  assert.strictEqual(C.xpTotal_('me'), xp0);
  assert.strictEqual(cash(C), c0);
  assert.strictEqual(s.game.lazy.left, 1, 'it uses one of that week\'s');
  assert.strictEqual(s.game.lazy.offerYesterday, null);
  assert.strictEqual(s.game.lazy.missed, null);
  assert.throws(() => C.lazyDay(me, 'yesterday'), /already a lazy day/);
});

test('the morning offer ends at noon and needs a lazy day left in that week', () => {
  const { g, C, me } = ready('2026-10-14T05:05:00Z');   // Wed
  C.lazyDay(me, 'today');
  at(g, '2026-10-15T05:05:00Z');
  C.lazyDay(me, 'today');                               // both of this week's used (Wed, Thu)
  award(g, '2026-10-16', 0);
  at(g, '2026-10-17T05:05:00Z');                        // Fri was missed
  C.dailyRun();
  assert.strictEqual(plain(C.appState(me)).game.lazy.offerYesterday, null, 'none left this week');
  assert.throws(() => C.lazyDay(me, 'yesterday'), /No lazy days left/);
  // next week: Monday missed, offer until noon on Tuesday
  at(g, '2026-10-20T05:05:00Z');
  C.dailyRun();
  at(g, '2026-10-20T10:30:00Z');                        // 11:30 BST
  assert.ok(plain(C.appState(me)).game.lazy.offerYesterday);
  at(g, '2026-10-20T11:30:00Z');                        // 12:30 BST
  assert.strictEqual(plain(C.appState(me)).game.lazy.offerYesterday, null);
  assert.throws(() => C.lazyDay(me, 'yesterday'), /Too late for yesterday/);
});

test('the pet only gets sleepy on a lazy or missed day', () => {
  const { g, C, me } = ready();
  streak(g, 'team', { count: 4, best: 4, total: 9, through: '2026-10-11' });
  C.lazyDay(me, 'today');
  at(g, '2026-10-12T10:00:00Z');
  const pet = plain(C.appState(me)).game.pet;
  assert.strictEqual(pet.mood, 'sleepy');
  assert.strictEqual(pet.days, 9, 'never shrinks');
});
