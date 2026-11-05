const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

// Tue 13 Oct 2026, 10:00 in Glenboig. Extras (reminders) are switched on per test.
function ready(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-13T09:00:00Z') });
  g.ctx.setup();
  return { g, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const at = (g, iso) => { g.state.now = new Date(iso); };
const plain = x => JSON.parse(JSON.stringify(x));
const xpRows = g => g.tab('XP log').rows().slice(1).map(r => ({ who: r[2], what: r[3], xp: Number(r[4]), kind: r[5] }));
const withPush = g => {
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.ctx.registerDevice(g.state.props.WEBAPP_KEY, 'me-phone-token-0123456789', 'Pixel');
  g.ctx.registerDevice(g.state.props.PARTNER_KEY, 'yaz-phone-token-0123456789', 'iPhone');
};
const pushesTo = (g, token) => g.state.pushes.filter(p => p.token === token);

test('names, team and level eras: Deany the bedroom DJ, Yazzy the fresh face', () => {
  const { g, me, partner } = ready();
  const mine = g.ctx.appState(me).fun, hers = g.ctx.appState(partner).fun;
  assert.strictEqual(mine.nick, 'Deany');
  assert.strictEqual(mine.otherNick, 'Yazzy');
  assert.strictEqual(mine.team, 'Yazzy & Deany');
  assert.strictEqual(mine.era, 'Bedroom DJ');
  assert.strictEqual(hers.era, 'Fresh face');
  assert.strictEqual(hers.nextEra, 'Lash apprentice');
  assert.strictEqual(g.ctx.eraTitle_('partner', 3), 'Rhinestone rookie');
  assert.strictEqual(g.ctx.eraTitle_('me', 12), 'Legend 3');
});

test('retired extras: no challenges, double XP, Wrapped, XP rewards or badges, and their old data goes to the Archive tab', () => {
  const { g, me, partner } = ready();
  delete g.state.props.EXTRAS_OFF;
  withPush(g);
  // old data from before the change
  g.state.props.CHAL_partner = JSON.stringify({ '2026-10-12': { chores2: true } });
  g.tab('Config').rows();
  const cfg = g.ss.getSheetByName('Config');
  cfg.appendRow(['Daily challenges', 'TRUE', 'old']); cfg.appendRow(['Double XP', 'TRUE', 'old']); cfg.appendRow(['Meds reminder', '08:30', 'old']);
  const rw = g.ss.insertSheet('Rewards'); rw.appendRow(['Reward', 'Cost (XP)', 'Who']); rw.appendRow(['Fancy coffee', '100', 'Anyone']);
  assert.ok(!g.ss.getSheetByName('Archive'), 'a fresh install has nothing to archive');
  delete g.state.props.EXTRAS_RETIRED;
  g.ctx.retireExtras_();
  g.ctx.retireExtras_();   // runs once
  const arch = g.tab('Archive').rows().slice(1);
  assert.deepStrictEqual(arch.map(r => r[0]).sort(), ['Daily challenges', 'Rewards', 'Settings']);
  assert.match(arch.find(r => r[0] === 'Rewards')[2], /Fancy coffee/);
  assert.match(arch.find(r => r[0] === 'Settings')[2], /Meds reminder/);
  assert.ok(!g.state.props.CHAL_partner);
  assert.ok(g.ss.getSheetByName('Old Rewards'), 'the Rewards tab is kept, renamed');
  assert.ok(!g.ss.getSheetByName('Config').getDataRange().getValues().some(r => /^(Daily challenges|Double XP|Meds reminder)$/.test(r[0])));
  // nothing in the state or the server for them
  const st = plain(g.ctx.appState(me));
  ['challenges', 'boost'].forEach(k => assert.ok(!(k in st.fun), k));
  assert.deepStrictEqual([st.game.badges, st.game.rewards], [[], []], 'only empty stand-ins for older cached apps');
  ['getWrapped', 'redeemReward', 'submitMix', 'boostActive_', 'checkChallenges_'].forEach(f => assert.strictEqual(typeof g.ctx[f], 'undefined', f));
  // XP adds up: every job is its own XP, nothing doubled, no bonus rows
  const q = st.quests.board.filter(x => x.who !== 'partner').slice(0, 2);
  for (let h = 12; h <= 20; h += 4) {
    at(g, '2026-10-13T' + String(h).padStart(2, '0') + ':10:00Z');
    g.ctx.nagRun();
  }
  q.forEach(x => g.ctx.questDone(me, x.name));
  q.forEach(x => assert.strictEqual(xpRows(g).find(r => r.what === x.name).xp, x.xp));
  assert.strictEqual(xpRows(g).filter(r => r.kind === 'bonus').length, 0);
  assert.strictEqual(g.ctx.xpOn_('me', '2026-10-13'), q.reduce((s, x) => s + x.xp, 0));
  assert.ok(!g.state.pushes.some(p => /Double XP|challenge/i.test(p.title + p.body)));
  void partner;
});

test('evening reminders (normal level): streak saver at 19:30, last call at 21:30, never twice, quiet at night', () => {
  const { g, me } = ready();
  delete g.state.props.EXTRAS_OFF;
  g.ctx.setSetting_('Double XP', 'FALSE');
  withPush(g);
  g.ctx.setPrefs(me, { nag: 'normal' });
  g.state.props.STREAK_me = JSON.stringify({ count: 4, freezes: 0, best: 4, through: '2026-10-12', frozeOn: '' });
  at(g, '2026-10-13T18:35:00Z');
  g.ctx.nagRun(); g.ctx.nagRun();
  let mine = pushesTo(g, 'me-phone-token-0123456789');
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].title, 'Keep your streak');
  assert.match(mine[0].body, /4-day|30 XP|streak/);
  at(g, '2026-10-13T20:35:00Z');
  g.ctx.nagRun();
  mine = pushesTo(g, 'me-phone-token-0123456789');
  assert.strictEqual(mine.length, 2);
  assert.strictEqual(mine[1].title, 'Streak alert');
  at(g, '2026-10-13T22:00:00Z'); // 23:00: no streak nags, only the food check you asked for
  const before = g.state.pushes.length;
  g.ctx.nagRun();
  const late = g.state.pushes.slice(before);
  assert.strictEqual(late.length, 1);
  assert.strictEqual(late[0].tab, 'food');
  g.ctx.questDone(me, g.ctx.appState(me).quests.board[0].name);
});

test('Us: one tap logs it for both, private, with winks and "tonight?"', () => {
  const { g, me, partner } = ready('2026-10-13T20:00:00Z');
  withPush(g);
  let s = g.ctx.logUs(partner);
  assert.strictEqual(s.fun.us.week, 1);
  assert.strictEqual(g.ctx.appState(me).fun.us.week, 1);
  const rows = xpRows(g).filter(r => r.kind === 'spice');
  assert.deepStrictEqual(rows.map(r => r.who).sort(), ['me', 'partner']);
  assert.ok(rows.every(r => r.xp === 20));
  assert.ok(!s.game.feed.some(f => f.kind === 'spice'), 'never in the feed');
  assert.match(pushesTo(g, 'me-phone-token-0123456789').at(-1).title, /Yazzy logged it/);
  assert.throws(() => g.ctx.logUs(me), /Already counted/);
  assert.ok(s.fun.us.badges.find(b => b.name === 'First flame').earned);
  // tonight?
  g.ctx.sendWink(me, 'tonight');
  assert.strictEqual(pushesTo(g, 'yaz-phone-token-0123456789').at(-1).title, 'Deany: tonight?');
  assert.throws(() => g.ctx.answerTonight(me, true), /Nothing to answer/);
  assert.strictEqual(g.ctx.appState(partner).fun.us.ask.from, 'me');
  s = g.ctx.answerTonight(partner, true);
  assert.strictEqual(s.fun.us.ask.answer, 'yes');
  assert.strictEqual(pushesTo(g, 'me-phone-token-0123456789').at(-1).title, 'Yazzy said yes');
  g.ctx.sendWink(partner, 'wink');
  assert.strictEqual(pushesTo(g, 'me-phone-token-0123456789').at(-1).title, 'Yazzy sent you a wink');
  // weekly summary stays private
  assert.doesNotMatch(JSON.stringify(g.state.mails), /Quality time/);
});

test('word stakes: set before anyone finishes, settled for both when you both have', () => {
  const { g, me, partner } = ready();
  withPush(g);
  const answer = g.ctx.todaysWord_('2026-10-13');
  let s = g.ctx.setStake(me, 'Loser makes the tea');
  assert.deepStrictEqual(plain(s.stake), { text: 'Loser makes the tea', by: 'you', result: '' });
  assert.strictEqual(g.ctx.gamesState(partner).stake.by, 'them');
  assert.match(pushesTo(g, 'yaz-phone-token-0123456789').at(-1).title, /set today's stakes/);
  g.ctx.guessWord(me, answer === 'crane' ? 'slate' : 'crane');
  g.ctx.guessWord(me, answer);
  assert.throws(() => g.ctx.setStake(partner, 'Winner picks the film'), /Too late/);
  s = g.ctx.guessWord(partner, answer);
  assert.strictEqual(s.stake.result, 'you');
  assert.strictEqual(g.ctx.gamesState(me).stake.result, 'them');
  const settled = g.state.pushes.filter(p => p.title === 'Word settled');
  assert.strictEqual(settled.length, 2);
  assert.match(settled[0].body, /Yazzy wins\. Deany owes: loser makes the tea/);
});

test('Tempo: replay as often as you like; best counts; XP once, only when you score', () => {
  const { g, me, partner } = ready();
  const pz = g.ctx.tempoPuzzle('2026-10-13');
  assert.ok(pz.bpm >= 86 && pz.bpm <= 176 && pz.style);
  assert.strictEqual(g.ctx.tempoPoints(87, 174), 10, 'half time counts for drum and bass');
  assert.strictEqual(g.ctx.tempoPoints(124, 128), 6);
  assert.strictEqual(g.ctx.tempoPoints(pz.bpm + 20, pz.bpm), 0, 'way off scores nothing');
  const xp = () => g.tab('XP log').rows().filter(r => r[2] === 'me' && r[5] === 'game').length;
  let s = g.ctx.submitTempo(me, pz.bpm + 20);
  assert.strictEqual(s.tempo.mine.points, 0);
  assert.strictEqual(xp(), 0, 'no XP for a miss');
  assert.strictEqual(s.tempo.style, '', 'style stays secret until you score');
  s = g.ctx.submitTempo(me, pz.bpm + 5);
  assert.strictEqual(s.tempo.mine.points, 3);
  assert.strictEqual(s.last.firstXp, 8);
  assert.strictEqual(s.tempo.style, pz.style);
  s = g.ctx.submitTempo(me, pz.bpm + 1.5);
  assert.strictEqual(s.tempo.mine.points, 8);
  assert.strictEqual(s.last.firstXp, 0, 'XP only once a day');
  s = g.ctx.submitTempo(me, pz.bpm + 9);
  assert.strictEqual(s.tempo.mine.points, 8, 'best counts');
  for (let i = 0; i < 5; i++) s = g.ctx.submitTempo(me, pz.bpm);
  assert.strictEqual(s.tempo.mine.points, 10);
  assert.strictEqual(s.tempo.mine.tries, 9, 'no limit on tries');
  assert.strictEqual(xp(), 1);
  assert.throws(() => g.ctx.submitTempo(partner, 'x'), /didn't register/);
  s = g.ctx.submitTempo(partner, pz.bpm + 1.5);
  assert.strictEqual(s.tempo.other.bpm, pz.bpm);
  assert.strictEqual(s.stats.them, 1);
  const rows = g.tab('Games').rows().filter(r => r[3] === 'tempo');
  assert.strictEqual(rows.length, 2, 'one row each, kept at your best');
  assert.strictEqual(Number(rows.find(r => r[2] === 'me')[4]), 10);
});

test('a studio session on the timer earns creative XP', () => {
  const { g, me } = ready();
  g.ctx.startChore(me, { name: 'Make a beat', minutes: 20, steps: ['Make a loop'], creative: 'music' });
  at(g, '2026-10-13T09:22:00Z');
  const s = g.ctx.finishChore(me, 'Done');
  const row = xpRows(g).find(r => r.kind === 'create');
  assert.strictEqual(row.what, 'Make a beat');
  assert.strictEqual(row.xp, 11);
  assert.strictEqual(g.tab('Later').rows().length, 1, 'nothing parked');
});

test('speed: the app\'s refresh is served from cache until something changes', () => {
  const { g, me, partner } = ready();
  const first = g.ctx.appState(me);
  assert.ok(g.state.cache.STATE_me);
  // put a marked copy in the cache: the next refresh must come from it, not the Sheet
  const marked = JSON.parse(JSON.stringify(first)); marked.fun.nick = 'Cached';
  g.ctx.putCachedState_(g.ctx.CacheService.getScriptCache(), 'me', marked);
  assert.strictEqual(g.ctx.appState(me).fun.nick, 'Cached');
  g.ctx.addShopping(partner, 'Milk'); // any change by either of you clears it
  assert.strictEqual(g.state.cache.STATE_me, undefined);
  const fresh = g.ctx.appState(me);
  assert.strictEqual(fresh.fun.nick, 'Deany');
  assert.ok(fresh.shopping.some(i => i.item === 'Milk'));
  assert.ok(first.now <= fresh.now);
});

test('customise: characters, look, names, titles and home layout are saved per person', () => {
  const { g, me, partner } = ready();
  let s = g.ctx.setPrefs(me, { char: 'sa-one', accent: 'green', text: 'large', sound: false, home: [{ id: 'feed' }, { id: 'us', hide: true }, { id: 'nope' }] });
  assert.strictEqual(s.fun.chars.me, 'sa-one');
  assert.strictEqual(s.fun.prefs.accent, 'green');
  assert.strictEqual(s.fun.prefs.sound, false);
  assert.deepStrictEqual(plain(s.fun.prefs.home), [{ id: 'feed', hide: false }, { id: 'us', hide: true }]);
  s = g.ctx.setPrefs(partner, { char: 'vc-two', nick: 'Yaz', team: 'Deany & Yaz', titles: 'city' });
  assert.strictEqual(s.fun.chars.me, 'sa-one', 'Yaz sees your character');
  assert.strictEqual(s.fun.nick, 'Yaz');
  assert.strictEqual(s.fun.team, 'Deany & Yaz');
  assert.strictEqual(s.fun.era, 'New in town');
  assert.strictEqual(g.ctx.appState(me).fun.chars.partner, 'vc-two');
  assert.strictEqual(g.ctx.setPrefs(me, { char: '<script>' }).fun.chars.me, '');
  assert.throws(() => g.ctx.setTheme(me, 'hotdog'), /Unknown theme/);
  assert.strictEqual(g.ctx.setTheme(me, 'vice'), 'vice');
});

test('your look: hair, clothes and colours are saved, and only real options are kept', () => {
  const { g, me, partner } = ready();
  let s = g.ctx.setPrefs(me, { char: 'sa-one', look: { hair: 'afro', hc: '#7c3aed', top: 'hawaii', head: '<b>', tc: 'red; drop', glow: 'x' } });
  assert.deepStrictEqual(plain(s.fun.looks.me), { hair: 'afro', hc: '#7c3aed', top: 'hawaii' });
  assert.deepStrictEqual(plain(g.ctx.appState(partner).fun.looks.me), { hair: 'afro', hc: '#7c3aed', top: 'hawaii' }, 'Yaz sees your look');
  s = g.ctx.setPrefs(me, { char: 'vc-three' });
  assert.deepStrictEqual(plain(s.fun.looks.me), {}, 'a new character starts from their own style');
  s = g.ctx.setPrefs(partner, { char: 'sa-denise' });
  assert.strictEqual(s.fun.chars.partner, 'sa-denise');
});

test('the shared pet grows with lifetime joint days, never shrinks, and naps instead of dying', () => {
  const { g } = ready();
  const pet = (t, m) => JSON.parse(JSON.stringify(g.ctx.petState(t, m)));
  assert.strictEqual(pet({ total: 0, count: 0, todayDone: false }, 600).stage, 'egg');
  assert.strictEqual(pet({ total: 0, count: 0, todayDone: false }, 600).mood, 'sleepy');
  const p7 = pet({ total: 7, count: 7, todayDone: true }, 600);
  assert.strictEqual(p7.stage, 'teen'); assert.strictEqual(p7.mood, 'happy'); assert.deepStrictEqual(p7.next, { at: 14, name: 'Grown-up', left: 7 });
  const lapsed = pet({ total: 7, count: 0, todayDone: false }, 600);
  assert.strictEqual(lapsed.stage, 'teen', 'a broken streak never shrinks the pet');
  assert.strictEqual(lapsed.mood, 'sleepy');
  assert.strictEqual(pet({ total: 7, count: 3, todayDone: false }, 600).mood, 'waiting');
  assert.strictEqual(pet({ total: 7, count: 3, todayDone: false }, 23 * 60).mood, 'sleepy');
  assert.strictEqual(pet({ total: 120, count: 0 }, 600).stage, 'mythic');
  // lifetime total survives a reset
  g.state.props.STREAK_team = JSON.stringify({ count: 5, freezes: 0, best: 5, through: '2026-10-11', frozeOn: '' });
  g.ctx.updateStreaks_('2026-10-13');
  const st = JSON.parse(g.state.props.STREAK_team);
  assert.strictEqual(st.count, 0); assert.strictEqual(st.best, 5);
  assert.ok(g.ctx.appState(g.state.props.WEBAPP_KEY).game.pet.days >= 5);
});
