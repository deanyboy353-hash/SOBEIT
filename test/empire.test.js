const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-14T09:00:00Z') }); // Wed 10:00
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
const mine = g => g.state.pushes.filter(p => p.token === 'me-phone-token-0123456789');
const giveCash = (g, who, n) => g.ctx.addCash_(who, 'Test money', n, 'test');

// ---------- deadlines ----------

test('deadline parsing: everyday ways of saying when', () => {
  const { g } = ready();
  const p = (t, now) => plain(g.ctx.parseDeadline(t, now === undefined ? 600 : now));
  assert.deepStrictEqual(p('Do X at work by 3pm'), { task: 'Do X at work', dayOffset: 0, min: 900 });
  assert.deepStrictEqual(p('send the invoice by 15:30'), { task: 'Send the invoice', dayOffset: 0, min: 930 });
  assert.deepStrictEqual(p('call mum in 20 mins'), { task: 'Call mum', dayOffset: 0, min: 620 });
  assert.deepStrictEqual(p('call the bank in an hour'), { task: 'Call the bank', dayOffset: 0, min: 660 });
  assert.deepStrictEqual(p('gym at 5'), { task: 'Gym', dayOffset: 0, min: 1020 });
  assert.deepStrictEqual(p('lunch with dad at noon'), { task: 'Lunch with dad', dayOffset: 0, min: 720 });
  assert.deepStrictEqual(p('report by end of day'), { task: 'Report', dayOffset: 0, min: 1020 });
  assert.deepStrictEqual(p('bins out tonight'), { task: 'Bins out', dayOffset: 0, min: 1260 });
  assert.deepStrictEqual(p('book the dentist tomorrow by 11am'), { task: 'Book the dentist', dayOffset: 1, min: 660 });
  assert.deepStrictEqual(p('pay rent by 9am'), { task: 'Pay rent', dayOffset: 1, min: 540 }, 'a time already gone means tomorrow');
  assert.deepStrictEqual(p('stretch in 3 hours', 23 * 60), { task: 'Stretch', dayOffset: 1, min: 120 });
  assert.strictEqual(p('buy milk'), null);
  assert.strictEqual(p('by 3pm'), null, 'needs a task');
  assert.strictEqual(p('meet at 25:00'), null);
});

test('nag schedule: build-up before, every 5 minutes after on Duolingo level', () => {
  const { g } = ready();
  const M = 60000, due = 1e12, n = (t, last, lv) => g.ctx.nagDue(due, due + t * M, last === undefined ? 0 : due + last * M, lv || 'aggressive');
  assert.strictEqual(n(-61), '');
  assert.strictEqual(n(-59), 'before');
  assert.strictEqual(n(-29, -59), 'before');
  assert.strictEqual(n(-20, -29), '');
  assert.strictEqual(n(0, -5), 'due');
  assert.strictEqual(n(3, 0), '');
  assert.strictEqual(n(5, 0), 'late');
  assert.strictEqual(n(125, 120), '');
  assert.strictEqual(n(135, 120), 'late', 'every 15 after two hours');
  assert.strictEqual(n(10, 0, 'normal'), '');
  assert.strictEqual(n(15, 0, 'normal'), 'late');
  assert.strictEqual(n(30, 0, 'gentle'), '');
});

test('a deadline nags until done: before, at, and every 5 minutes after, quiet at night', () => {
  const { g, me } = ready();
  withPush(g);
  const res = g.ctx.addDeadline(me, 'Do X at work by 3pm');
  assert.strictEqual(res.added.task, 'Do X at work');
  assert.strictEqual(res.added.dueText, '2026-10-14 15:00');
  assert.strictEqual(res.state.deadlines.length, 1);
  assert.strictEqual(g.tab('Deadlines').rows()[1][4], '2026-10-14 15:00', 'due time kept as text');
  const id = res.state.deadlines[0].id;
  const run = iso => { at(g, iso); g.ctx.nagRun(); return mine(g).filter(p => /Coming up|Due now|Overdue/.test(p.title)).length; };
  assert.strictEqual(run('2026-10-14T12:00:00Z'), 0);     // 13:00, two hours to go
  assert.strictEqual(run('2026-10-14T13:01:00Z'), 1);     // 14:01, an hour to go
  assert.strictEqual(run('2026-10-14T13:31:00Z'), 2);     // half an hour
  assert.strictEqual(run('2026-10-14T13:46:00Z'), 3);
  assert.strictEqual(run('2026-10-14T13:56:00Z'), 4);
  assert.strictEqual(run('2026-10-14T14:00:30Z'), 5);     // due
  assert.strictEqual(mine(g).at(-1).title, 'Due now');
  assert.strictEqual(run('2026-10-14T14:03:00Z'), 5);
  assert.strictEqual(run('2026-10-14T14:06:00Z'), 6);
  assert.strictEqual(run('2026-10-14T14:11:00Z'), 7);
  assert.match(mine(g).at(-1).body, /Do X at work/);
  assert.strictEqual(mine(g).at(-1).title, 'Overdue');
  const n = mine(g).at(-1).note;
  assert.ok(n.requireInteraction && n.renotify, 'stays on screen and buzzes again');
  assert.strictEqual(n.tag, 'deadline-' + id);
  assert.deepStrictEqual(n.actions.map(x => x.title), ['Done', '+30 min', 'Park it']);
  assert.strictEqual(mine(g).at(-1).data.deadline, id);
  // night: nothing
  assert.strictEqual(run('2026-10-14T21:45:00Z'), 7);
  // done late: +5 XP, no more nags
  at(g, '2026-10-15T07:30:00Z');
  const d = g.ctx.deadlineAction(me, id, 'done');
  assert.strictEqual(d.xp, 5);
  assert.strictEqual(d.state.deadlines.length, 0);
  assert.strictEqual(run('2026-10-15T08:10:00Z'), 7);
});

test('deadline buttons: done on time, +30 minutes, park it (with XP penalties)', () => {
  const { g, me, partner } = ready();
  let s = g.ctx.addDeadline(me, 'Email Sarah by 11am').state;
  let id = s.deadlines[0].id;
  assert.strictEqual(g.ctx.deadlineAction(me, id, 'done').xp, 15);
  assert.ok(xpRows(g).some(r => r.what === 'On time: Email Sarah' && r.xp === 15));
  // +30 minutes: -3 XP and the time moves
  s = g.ctx.addDeadline(me, 'Ring the garage by 10:30').state;
  id = s.deadlines[0].id;
  s = g.ctx.deadlineAction(me, id, 'extend').state;
  assert.strictEqual(s.deadlines[0].dueText, '2026-10-14 11:00');
  // park: -10 XP, saved for later, the day's XP drops
  const before = g.ctx.appState(me).game.xpToday;
  const r = g.ctx.deadlineAction(me, id, 'park');
  assert.strictEqual(r.xp, -10);
  assert.strictEqual(r.state.game.xpToday, before - 10);
  assert.ok(r.state.chores.later.some(l => /Ring the garage/.test(l.thing)));
  assert.ok(!r.state.game.feed.some(f => /Parked/.test(f.text)), 'penalties stay out of the feed');
  assert.throws(() => g.ctx.deadlineAction(partner, id, 'done'), /gone/);
  assert.throws(() => g.ctx.addDeadline(me, 'buy milk'), /Add a time/);
  assert.throws(() => g.ctx.deadlineAction(me, id, 'explode'), /Unknown action/);
});

test('Duolingo level: from 6pm, a streak nag every half hour until the goal is hit', () => {
  const { g, me } = ready();
  delete g.state.props.EXTRAS_OFF;
  g.ctx.setSetting_('Double XP', 'FALSE');
  withPush(g);
  const count = () => mine(g).filter(p => /streak|Today still counts/i.test(p.title)).length;
  at(g, '2026-10-14T16:50:00Z'); g.ctx.nagRun(); assert.strictEqual(count(), 0);
  at(g, '2026-10-14T17:02:00Z'); g.ctx.nagRun(); g.ctx.nagRun(); assert.strictEqual(count(), 1);
  at(g, '2026-10-14T17:31:00Z'); g.ctx.nagRun(); assert.strictEqual(count(), 2);
  assert.ok(mine(g).at(-1).note.requireInteraction, 'streak nags stay on screen too');
  assert.doesNotMatch(mine(g).at(-1).body, /0-day/);
  // Yaz is on the normal level: no half-hourly nags
  assert.strictEqual(g.state.pushes.filter(p => p.token === 'yaz-phone-token-0123456789' && /streak|Today still counts/i.test(p.title)).length, 0);
  // hitting the goal stops them
  const q = g.ctx.appState(me).quests.board.filter(x => x.who !== 'partner');
  q.forEach(x => g.ctx.questDone(me, x.name));
  at(g, '2026-10-14T18:01:00Z'); g.ctx.nagRun(); assert.strictEqual(count(), 2);
});

test('Ask can set a deadline', () => {
  const { g, me } = ready();
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-test';
  g.state.claudeReply = { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'On it.', actions: [{ type: 'add_deadline', text: 'Send the invoice by 3pm', rhythm: 'none', minutes: 0 }] }) }] } };
  const r = g.ctx.ask(me, 'remind me to send the invoice by 3pm');
  assert.deepStrictEqual(plain(r.done), ['Deadline: Send the invoice by 15:00']);
  assert.strictEqual(r.state.deadlines[0].task, 'Send the invoice');
});

// ---------- cash and the empire ----------

test('cash: every XP pays $10, and old XP is paid out once', () => {
  const { g, me } = ready();
  const q = g.ctx.appState(me).quests.board.find(x => x.who !== 'partner');
  g.ctx.questDone(me, q.name);
  assert.strictEqual(g.ctx.appState(me).empire.cash, q.xp * 10);
  g.ctx.addDeadline(me, 'thing by 11am');
  const id = g.ctx.appState(me).deadlines[0].id;
  g.ctx.deadlineAction(me, id, 'park');
  assert.strictEqual(g.ctx.appState(me).empire.cash, q.xp * 10, 'penalties take XP, not cash');
  // starting cash for XP from before cash existed
  const h = loadProject({ now: new Date('2026-10-14T09:00:00Z') });
  h.ctx.setup();
  h.ctx.addXp_('me', 'Old work', 120, 'quest');
  h.tab('Cash').getRange(2, 1, 1, 6).clearContent();
  h.ctx.forget_('cash');
  delete h.state.props.CASH_V1;
  h.ctx.setup();
  h.ctx.setup();
  assert.strictEqual(h.ctx.appState(h.state.props.WEBAPP_KEY).empire.cash, 1200);
});

test('empire: buy, upgrade, ride, income, sell, and Yaz sees it', () => {
  const { g, me, partner } = ready();
  withPush(g);
  assert.throws(() => g.ctx.buyItem(me, 'ganton'), /You need \$5,000 more/);
  giveCash(g, 'me', 200000);
  let s = g.ctx.buyItem(me, 'ganton');
  assert.strictEqual(s.empire.cash, 195000);
  assert.strictEqual(s.empire.homeName, 'Grove Street house');
  assert.throws(() => g.ctx.buyItem(me, 'ganton'), /already own/);
  assert.throws(() => g.ctx.buyItem(me, 'jetpack'), /isn't for sale/);
  s = g.ctx.buyItem(me, 'savanna');
  assert.strictEqual(s.empire.rideName, 'Savanna');
  s = g.ctx.buyItem(me, 'malibu');
  assert.strictEqual(s.empire.income, 600);
  assert.strictEqual(g.state.pushes.filter(p => p.token === 'yaz-phone-token-0123456789').at(-1).title, 'Deany just bought The Malibu Club');
  // upgrades: a studio adds 15% income and costs 30% of the price
  s = g.ctx.upgradeItem(me, 'malibu', 'studio');
  const club = s.empire.owned.find(o => o.id === 'malibu');
  assert.strictEqual(club.income, 690);
  assert.strictEqual(s.empire.cash, 200000 - 5000 - 9000 - 120000 - 36000);
  assert.throws(() => g.ctx.upgradeItem(me, 'malibu', 'studio'), /Already done/);
  assert.throws(() => g.ctx.upgradeItem(me, 'savanna', 'pool'), /doesn't fit/);
  assert.ok(!club.next.some(u => u.id === 'studio'));
  s = g.ctx.upgradeItem(me, 'savanna', 'hydraulics');
  // morning income
  at(g, '2026-10-15T05:05:00Z');
  g.ctx.dailyRun();
  const cashTab = g.tab('Cash').rows().filter(r => r[5] === 'income');
  assert.strictEqual(cashTab.length, 1);
  assert.strictEqual(Number(cashTab[0][4]), 690);
  // Yaz sees your empire
  const y = g.ctx.appState(partner).empire;
  assert.strictEqual(y.other.rideName, 'Savanna');
  assert.strictEqual(y.other.count, 3);
  assert.ok(y.other.worth > 170000);
  assert.strictEqual(y.cash, 0);
  // sell for 60% of what went in
  const cash = g.ctx.appState(me).empire.cash;
  s = g.ctx.sellItem(me, 'savanna');
  assert.strictEqual(s.empire.cash, cash + Math.round((9000 + 1800) * 0.6));
  assert.strictEqual(s.empire.rideName, '');
  assert.throws(() => g.ctx.sellItem(me, 'savanna'), /don't own/);
  s = g.ctx.setFavourite(me, 'malibu');
  assert.strictEqual(s.empire.homeName, 'The Malibu Club');
  assert.strictEqual(s.catalog.length, 30);
});

// ---------- the week plan and together jobs ----------

test('plan the week: pair jobs with people; together jobs pay both double XP', () => {
  const { g, me, partner } = ready();
  let s = g.ctx.appState(me);
  const bed = s.plan.find(q => q.name === 'Make the bed');
  assert.strictEqual(bed.who, 'together', 'a daily together job is added');
  assert.ok(s.plan.every(q => ['daily', 'weekly', 'biweekly'].includes(q.rhythm)));
  assert.strictEqual(s.plan.find(q => q.name === 'Food shop').who, 'together');
  // pair dishes with Yaz, bins with Dean
  s = g.ctx.saveWeekPlan(me, { 'Do the dishes': 'partner', 'Take the bins out': 'me', 'Not a chore': 'me', 'Tidy the living room': 'robot' });
  assert.strictEqual(s.plan.find(q => q.name === 'Do the dishes').who, 'partner');
  assert.strictEqual(s.plan.find(q => q.name === 'Take the bins out').who, 'me');
  assert.strictEqual(s.plan.find(q => q.name === 'Tidy the living room').who, 'anyone');
  const col = g.tab('Chores').rows()[0].indexOf('Who');
  assert.strictEqual(g.tab('Chores').rows().find(r => r[0] === 'Do the dishes')[col], 'Partner');
  // together: both get double
  const xpBefore = { me: g.ctx.xpOn_('me', '2026-10-14'), partner: g.ctx.xpOn_('partner', '2026-10-14') };
  g.ctx.questDone(me, 'Make the bed', true);
  const q = g.ctx.readChores_().find(x => x.name === 'Make the bed');
  assert.strictEqual(g.ctx.xpOn_('me', '2026-10-14') - xpBefore.me, q.xp * 2);
  assert.strictEqual(g.ctx.xpOn_('partner', '2026-10-14') - xpBefore.partner, q.xp * 2);
  assert.ok(g.ctx.appState(partner).quests.all.some(x => x.name === 'Make the bed' && x.doneToday));
  assert.throws(() => g.ctx.questDone(partner, 'Make the bed', true), /already done today/);
  // solo on a together job: normal XP
  const before = g.ctx.xpOn_('me', '2026-10-14');
  g.ctx.questDone(me, 'Food shop', false);
  assert.strictEqual(g.ctx.xpOn_('me', '2026-10-14') - before, g.ctx.readChores_().find(x => x.name === 'Food shop').xp);
});

test('Mix: beatmatch scoring, three tries, best counts, and Yaz sees it', () => {
  const { g, me, partner } = ready();
  const pz = g.ctx.mixPuzzle('2026-10-14');
  assert.notStrictEqual(pz.a, pz.b);
  assert.ok(Math.abs(pz.bpmB - pz.bpmA) >= 3 && Math.abs(pz.bpmB - pz.bpmA) <= 7);
  assert.deepStrictEqual([g.ctx.mixPoints(0.3, 20), g.ctx.mixPoints(0.8, 50), g.ctx.mixPoints(1.5, 90), g.ctx.mixPoints(3, 150), g.ctx.mixPoints(9, 400)], [10, 8, 6, 4, 2]);
  let s = g.ctx.submitMix(me, 3, 150);
  assert.strictEqual(s.mix.mine.points, 4);
  s = g.ctx.submitMix(me, 0.8, 40);
  assert.strictEqual(s.mix.mine.points, 8);
  s = g.ctx.submitMix(me, 6, 300);
  assert.ok(s.mix.mine.final);
  assert.strictEqual(s.mix.mine.points, 8, 'best of three');
  assert.throws(() => g.ctx.submitMix(me, 0, 0), /Done for today/);
  assert.throws(() => g.ctx.submitMix(partner, 'loud', 1), /didn't register/);
  s = g.ctx.submitMix(partner, 0.2, 10);
  assert.ok(s.mix.mine.final, 'a perfect mix locks in');
  assert.strictEqual(s.mix.other.points, 8);
  assert.strictEqual(s.stats.you, 1);
  assert.ok(g.tab('Games').rows().some(r => r[3] === 'mix' && r[2] === 'me'));
});
