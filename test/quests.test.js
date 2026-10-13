const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready(iso = '2026-10-14T05:05:00Z') { // Wed 06:05
  const g = loadProject({ now: new Date(iso) });
  g.ctx.setup();
  return { g, C: g.ctx, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const col = (g, h) => g.tab('Chores').rows()[0].indexOf(h);
const row = (g, name) => g.tab('Chores').rows().find(r => r[0] === name);
const day = (g, iso) => { g.state.now = new Date(iso); };

test('Chores tab gains quest columns and starter quests; existing rows get schedules', () => {
  const { g } = ready();
  for (const h of ['Every', 'Who', 'Energy', 'XP', 'Last done', 'Last done by']) assert.ok(col(g, h) > 2, h);
  assert.strictEqual(row(g, 'Do the dishes')[col(g, 'Every')], 'daily');
  assert.match(row(g, 'Change the bedding')[col(g, 'Every')], /^2 weeks (Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
  assert.match(row(g, 'Clean out the fridge')[col(g, 'Every')], /^monthly \d+$/);
  assert.match(row(g, 'Take the bins out')[col(g, 'Every')], /^weekly Wed$/);
  assert.ok(row(g, 'Clean out the fridge'));
  // running again doesn't duplicate
  g.ctx.dailyRun();
  assert.strictEqual(g.tab('Chores').rows().filter(r => r[0] === 'Clean out the fridge').length, 1);
});

test('daily board: capped, bin day first, pushed to Google Tasks; ticking anywhere counts once', () => {
  const { g, C, me, partner } = ready();
  const q = C.questsState_('me');
  assert.strictEqual(q.board.length, 6);
  assert.ok(q.board.some(b => b.name === 'Take the bins out'), 'Wednesday = bin day');
  const questTasks = g.tasks.open().filter(t => /XP\. Tick here/.test(t.notes || ''));
  assert.strictEqual(questTasks.length, q.board.filter(b => b.who !== 'partner').length);

  // partner does the dishes in the app → your Google Task ticks itself
  let s = C.questDone(partner, 'Do the dishes');
  assert.ok(!g.tasks.open().some(t => t.title === 'Do the dishes'));
  assert.strictEqual(s.game.xpToday, 15, 'XP for whoever did it');
  assert.strictEqual(C.gameState_('me').xpToday, 0);
  assert.throws(() => C.questDone(me, 'Do the dishes'), /already done today/);

  // you tick the bins in Google Tasks → XP for you
  const bins = g.tasks.open().find(t => t.title === 'Take the bins out');
  g.tasks.tick(bins.id, '2026-10-14T08:00:00.000Z');
  C.pollTasks();
  assert.strictEqual(C.gameState_('me').xpToday, 5);
  assert.strictEqual(row(g, 'Take the bins out')[col(g, 'Last done')], '2026-10-14');
  assert.strictEqual(row(g, 'Take the bins out')[col(g, 'Last done by')], 'me');
  C.pollTasks();
  assert.strictEqual(C.gameState_('me').xpToday, 5, 'not counted twice');
});

test('a fortnightly job done early pushes the next one back, not days later', () => {
  const { g, C, me } = ready();
  const bed = () => C.scheduleState_().find(x => x.name === 'Change the bedding');
  const first = bed().next;
  C.questDone(me, 'Change the bedding');
  const next = bed().next;
  const gap = (Date.parse(next) - Date.parse('2026-10-14')) / 86400000;
  assert.ok(gap >= 7 && gap <= 21, 'next bedding ' + next + ' (was ' + first + ')');
  day(g, next.replace(/$/, 'T05:05:00Z'));
  assert.ok(C.questsState_('me').all.find(x => x.name === 'Change the bedding').due);
});

test('claim and cover: covering your partner\'s job gives you a bonus', () => {
  const { g, C, me, partner } = ready();
  g.tab('Chores').getRange(g.tab('Chores').rows().findIndex(r => r[0] === 'Hoover downstairs') + 1, col(g, 'Who') + 1).setValue('Partner');
  let s = C.claimQuest(me, 'Do the dishes');
  assert.strictEqual(s.quests.board.find(x => x.name === 'Do the dishes').claimedBy, 'me');
  assert.throws(() => C.claimQuest(partner, 'Do the dishes'), /Already claimed/);
  s = C.questDone(me, 'Hoover downstairs');
  assert.strictEqual(s.game.xpToday, 20 + 10, 'quest XP + half again for covering');
});

test('What now? fits energy and time, and can be skipped', () => {
  const { C, me } = ready();
  const low = C.whatNow(me, 'low', 5, []);
  assert.ok(low.minutes <= 5);
  const again = C.whatNow(me, 'low', 5, [low.name]);
  assert.notStrictEqual(again && again.name, low.name);
  const big = C.whatNow(me, 'high', 60, []);
  assert.strictEqual(big.due, true, 'something due today comes first');
});

test('chores timer finishing a quest completes it; a stopped 5-minute taster gives some XP but stays due', () => {
  const { g, C, me } = ready('2026-10-14T17:00:00Z');
  const before = C.gameState_('me').xpToday;
  C.startChore(me, { name: 'Wipe down the kitchen', minutes: 5, steps: [], taster: true });
  day(g, '2026-10-14T17:05:00Z');
  let s = C.finishChore(me, 'Stopped');
  assert.ok(s.game.xpToday > before);
  assert.ok(s.quests.all.find(x => x.name === 'Wipe down the kitchen').due, 'a taster leaves it due');
  assert.strictEqual(g.tab('Later').getLastRow(), 1, 'a taster does not park anything');
  C.startChore(me, { name: 'Do the dishes', minutes: 15, steps: [] });
  day(g, '2026-10-14T17:18:00Z');
  s = C.finishChore(me, 'Done');
  assert.ok(s.quests.all.find(x => x.name === 'Do the dishes').doneToday);
});

test('streaks: goal days count, a freeze covers a missed day, levels go up', () => {
  const { g, C, me } = ready('2026-10-01T05:05:00Z');
  const award = (d, xp) => g.ctx.appendRow_('xp', { Date: d, Time: '12:00', Who: 'me', What: 'x', XP: xp, Kind: 'quest' });
  for (let d = 1; d <= 7; d++) award('2026-10-0' + d, 40);       // 7 good days → 1 freeze
  award('2026-10-09', 40);                                          // the 8th is missed
  day(g, '2026-10-10T05:05:00Z');
  C.dailyRun();
  const st = C.streakNow_('me', '2026-10-10', 30);
  assert.strictEqual(st.count, 8, '7 + the 9th; the missed 8th used the freeze');
  assert.strictEqual(st.freezes, 0);
  assert.strictEqual(C.gameState_('me').level.level, 3, '320+ XP is level 3');
  assert.ok(C.gameState_('me').badges.find(b => b.id === 'streak-7').earned);
});

test('reward shop spends XP, never below zero', () => {
  const { g, C, me } = ready();
  assert.throws(() => C.redeemReward(me, 'Fancy coffee'), /more XP/);
  g.ctx.appendRow_('xp', { Date: '2026-10-14', Time: '09:00', Who: 'me', What: 'x', XP: 150, Kind: 'quest' });
  const s = C.redeemReward(me, 'Fancy coffee');
  assert.strictEqual(s.game.balance, 50);
  assert.strictEqual(s.game.total, 150, 'level XP is not reduced by spending');
});

test('feed and high-fives', () => {
  const { C, me, partner } = ready();
  C.questDone(partner, 'Do the dishes');
  const item = C.gameState_('me').feed.find(f => f.who === 'partner');
  const s = C.highFive(me, item.id);
  assert.deepStrictEqual([...s.game.feed.find(f => f.id === item.id).hi5], ['me']);
  C.highFive(partner, item.id); // can't high-five yourself
  assert.strictEqual(C.gameState_('me').feed.find(f => f.id === item.id).hi5.length, 1);
});

test('routines: calendar alert, one tap per step, XP when finished', () => {
  const { g, C, me } = ready();
  assert.ok(g.calendar.live().find(e => /Morning routine/.test(e.title)));
  day(g, '2026-10-14T07:40:00Z');
  let s;
  for (let i = 0; i < 5; i++) s = C.routineStep(me, 'Morning', i);
  const m = s.routines.routines.find(r => r.name === 'Morning');
  assert.strictEqual(m.finished, true);
  assert.ok(s.game.feed.some(f => /Morning routine done/.test(f.text)));
  s = C.addWater(me, 1);
  assert.strictEqual(s.routines.water, 1);
});

test('shopping list is shared; brain dump sorts things (no Claude key: all become tasks)', () => {
  const { g, C, me, partner } = ready();
  let s = C.addShopping(partner, 'eggs, Greek yogurt');
  assert.deepStrictEqual([...s.shopping.map(x => x.item)], ['eggs', 'Greek yogurt']);
  s = C.toggleShopping(me, s.shopping[0].id);
  assert.strictEqual(s.shopping[0].got, true);
  const items = C.brainDump(me, 'ring the dentist\nbuy bin bags');
  assert.strictEqual(items.length, 2);
  s = C.saveBrainDump(me, [{ text: 'Ring the dentist', kind: 'task', every: '', minutes: 5 }, { text: 'Bin bags', kind: 'shopping', every: '', minutes: 0 },
    { text: 'Water the plants', kind: 'recurring', every: 'weekly', minutes: 5 }, { text: 'Holiday ideas', kind: 'park', every: '', minutes: 0 }]);
  assert.ok(s.shopping.some(x => x.item === 'Bin bags'));
  assert.ok(row(g, 'Water the plants'));
  assert.ok(g.tasks.open().some(t => t.title === 'Ring the dentist'));
  assert.ok(s.chores.later.some(l => l.thing === 'Holiday ideas'));
});

test('appointments tomorrow get a prep task', () => {
  const { g, C } = ready();
  g.calendar.createEvent('Dentist', new Date('2026-10-15T09:00:00Z'), new Date('2026-10-15T09:30:00Z'), {});
  C.dailyRun();
  assert.ok(g.tasks.open().some(t => t.title === 'Prep for tomorrow: Dentist at 10:00'));
});

test('partner email: daily quests, join-me nudges, time\'s-up alarm (only if an email is set)', () => {
  const { g, C, partner, me } = ready();
  assert.strictEqual(g.state.mails.length, 0);
  const cfg = g.tab('Config');
  cfg.getRange(cfg.rows().findIndex(r => r[0] === 'Partner email') + 1, 2).setValue('sam@example.com');
  C.dailyRun();
  assert.ok(g.state.mails.some(m => m.to === 'sam@example.com' && /^Today: \d+ quests?/.test(m.subject)));
  C.askToJoin(me);
  assert.ok(g.state.mails.some(m => /wants company for chores/.test(m.subject)));
  assert.strictEqual(C.choresState(partner).invite.from, 'me');
  C.startChore(partner, { name: 'Do the dishes', minutes: 15, steps: [] });
  assert.ok(g.state.triggers.some(t => t.fn === 'partnerTimeUp'));
  day(g, '2026-10-14T05:21:00Z');
  C.partnerTimeUp();
  assert.ok(g.state.mails.some(m => /Time's up: Do the dishes/.test(m.subject)));
  C.askToJoin(partner);
  assert.ok(g.calendar.live().some(e => /wants company/.test(e.title)), 'your phone buzzes');
});
