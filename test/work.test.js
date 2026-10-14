const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-14T08:00:00Z') }); // Wed 09:00 UK
  g.ctx.setup();
  return { g, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const at = (g, iso) => { g.state.now = new Date(iso); };
const plain = x => JSON.parse(JSON.stringify(x));
const withPush = g => {
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.ctx.registerDevice(g.state.props.WEBAPP_KEY, 'me-phone-token-0123456789', 'Pixel');
  g.ctx.registerDevice(g.state.props.PARTNER_KEY, 'yaz-phone-token-0123456789', 'iPhone');
};
const mine = g => g.state.pushes.filter(p => p.token === 'me-phone-token-0123456789');

test('parseBlock: everyday ways of writing a block', () => {
  const { g } = ready();
  const p = t => { const r = plain(g.ctx.parseBlock(t)); delete r.tomorrow; if (!r.target) { delete r.target; delete r.unit; } return r; };
  assert.deepStrictEqual(p('Write the report 10-11:30'), { task: 'Write the report', start: 600, mins: 90, kind: 'focus' });
  assert.deepStrictEqual(p('Emails 30m'), { task: 'Emails', start: null, mins: 30, kind: 'admin' });
  assert.deepStrictEqual(p('Call Sam at 3pm for 45 min'), { task: 'Call Sam', start: 900, mins: 45, kind: 'meet' });
  assert.deepStrictEqual(p('Deep work 2h'), { task: 'Deep work', start: null, mins: 120, kind: 'focus' });
  assert.deepStrictEqual(p('plan the sprint 2-3pm'), { task: 'Plan the sprint', start: 840, mins: 60, kind: 'focus' });
  assert.deepStrictEqual(p('Inbox zero 11-1'), { task: 'Inbox zero', start: 660, mins: 120, kind: 'admin' });
  assert.deepStrictEqual(p('Design mockups from 14:00 to 15:30'), { task: 'Design mockups', start: 840, mins: 90, kind: 'focus' });
  assert.deepStrictEqual(p('Budget 9am 1h30'), { task: 'Budget', start: 540, mins: 90, kind: 'focus' });
  assert.deepStrictEqual(p('Lunch 12:30-13:15'), { task: 'Lunch', start: 750, mins: 45, kind: 'break' });
  assert.strictEqual(g.ctx.parseBlock('Standup tomorrow 9:30').tomorrow, true);
  assert.deepStrictEqual(p('Queue 40 emails'), { task: 'Queue 40 emails', start: null, mins: 60, kind: 'admin', target: 40, unit: 'emails' });
  assert.deepStrictEqual(p('Edit 3 videos'), { task: 'Edit 3 videos', start: null, mins: 135, kind: 'focus', target: 3, unit: 'videos' });
  assert.deepStrictEqual(p('Edit 2h'), { task: 'Edit', start: null, mins: 120, kind: 'focus' });
  assert.deepStrictEqual(p('Reply to 25 messages 10-11'), { task: 'Reply to 25 messages', start: 600, mins: 60, kind: 'admin', target: 25, unit: 'messages' });
  assert.strictEqual(g.ctx.parseBlock(''), null);
  assert.strictEqual(g.ctx.placeBlock([{ start: 600, mins: 60 }, { start: 690, mins: 30 }], 45, 540), 540);
  assert.strictEqual(g.ctx.placeBlock([{ start: 600, mins: 60 }, { start: 690, mins: 30 }], 45, 580), 720, 'skips past both');
  assert.deepStrictEqual([g.ctx.blockXp('focus', 60, true, 2), g.ctx.blockXp('admin', 30, false, 0), g.ctx.blockXp('meet', 60, false, 0), g.ctx.blockXp('break', 30, true, 3), g.ctx.blockXp('admin', 30, true, 9)], [23, 6, 6, 2, 14]);
});

test('Work: add, place in free slots, start on time, done, clean sheet, streak', () => {
  const { g, me } = ready();
  withPush(g);
  let r = g.ctx.addBlock(me, 'Write the report 9-10:30');
  assert.strictEqual(r.added.start, 540);
  r = g.ctx.addBlock(me, 'Emails 30m');
  assert.strictEqual(r.added.start, 630, 'first free slot after the report');
  assert.strictEqual(r.added.placed, true);
  r = g.ctx.planDay(me, '- Call Sam 30m\n- Lunch 45m\nReview PRs 1h');
  assert.strictEqual(r.added, 3);
  const w = r.work;
  assert.deepStrictEqual(plain(w.blocks.map(b => [b.task, b.start, b.mins, b.kind])), [['Write the report', 540, 90, 'focus'], ['Emails', 630, 30, 'admin'], ['Call Sam', 660, 30, 'meet'], ['Lunch', 690, 45, 'break'], ['Review PRs', 735, 60, 'focus']]);
  assert.strictEqual(w.total, 4);
  assert.strictEqual(w.planned, 210);
  assert.ok(r.state.work.blocks.length === 5, 'app state carries today');
  const id = n => w.blocks.find(b => b.task === n).id;
  // started on time (09:02), done: 18 x1.5 = 27 + 3
  at(g, '2026-10-14T08:02:00Z');
  g.ctx.blockAction(me, id('Write the report'), 'start');
  at(g, '2026-10-14T09:30:00Z');
  r = g.ctx.blockAction(me, id('Write the report'), 'done');
  assert.strictEqual(r.xp, 30);
  assert.strictEqual(r.onTime, true);
  // never started: no on-time bonus, but +1 for the block in a row
  r = g.ctx.blockAction(me, id('Emails'), 'done');
  assert.strictEqual(r.xp, 6 + 1);
  r = g.ctx.blockAction(me, id('Emails'), 'done');
  assert.strictEqual(r.xp, 0, 'paid once');
  r = g.ctx.blockAction(me, id('Lunch'), 'done');
  assert.strictEqual(r.xp, 2);
  assert.throws(() => g.ctx.blockAction(me, id('Lunch'), 'delete'), /done and paid/);
  r = g.ctx.blockAction(me, id('Call Sam'), 'done');
  assert.strictEqual(r.clean, 0, 'not all done yet');
  r = g.ctx.blockAction(me, id('Review PRs'), 'done');
  assert.strictEqual(r.clean, 25);
  assert.strictEqual(r.work.clean, true);
  assert.strictEqual(r.work.streak, 1);
  assert.ok(g.state.pushes.some(p => p.token === 'yaz-phone-token-0123456789' && /cleared every work block/.test(p.title)));
  assert.throws(() => g.ctx.blockAction(me, id('Review PRs'), 'explode'), /Unknown action/);
});

test('Work: move, resize, skip, delete, running late, copy yesterday, partner can\'t touch', () => {
  const { g, me, partner } = ready('2026-10-13T08:00:00Z');
  g.ctx.planDay(me, 'Standup 9:30 15m\nDeep work 10-12\nEmails 30m');
  at(g, '2026-10-14T08:00:00Z');
  let r = g.ctx.copyPlan(me);
  assert.strictEqual(r.added, 3);
  r = g.ctx.copyPlan(me);
  assert.strictEqual(r.added, 0, 'no duplicates');
  const id = n => r.work.blocks.find(b => b.task === n).id;
  r = g.ctx.updateBlock(me, id('Emails'), { start: 783, mins: 47, kind: 'learn', task: 'Course' });
  const c = r.work.blocks.find(b => b.task === 'Course');
  assert.deepStrictEqual(plain([c.start, c.mins, c.kind]), [785, 45, 'learn']);
  assert.throws(() => g.ctx.updateBlock(partner, c.id, { start: 600 }), /gone/);
  // 10:20, in the deep work block: push everything back 15
  at(g, '2026-10-14T09:20:00Z');
  r = g.ctx.shiftBlocks(me, 15);
  const by = n => r.work.blocks.find(b => b.task === n);
  assert.strictEqual(by('Standup').start, 570, 'finished times stay');
  assert.strictEqual(by('Deep work').mins, 135, 'the block you are in gets longer');
  assert.strictEqual(by('Course').start, 800);
  r = g.ctx.blockAction(me, by('Standup').id, 'skip');
  assert.strictEqual(r.work.blocks.find(b => b.task === 'Standup').status, 'skipped');
  r = g.ctx.blockAction(me, by('Course').id, 'delete');
  assert.ok(!r.work.blocks.some(b => b.task === 'Course'));
  // tomorrow
  r = g.ctx.addBlock(me, 'Plan next week tomorrow 9-10');
  assert.strictEqual(r.added.date, '2026-10-15');
  assert.strictEqual(g.ctx.workState(me, '2026-10-15').blocks.length, 1);
  assert.throws(() => g.ctx.addBlock(me, '   '), /Type what/);
  assert.throws(() => g.ctx.setPrefs(me, { workStart: 600, workEnd: 620 }), /at least an hour/);
  g.ctx.setPrefs(me, { workStart: 480, workEnd: 990 });
  assert.deepStrictEqual(plain(g.ctx.workState(me).hours), { start: 480, end: 990 });
});

test('Work reminders: up next, not started, time\'s up; quiet at night', () => {
  const { g, me } = ready();
  withPush(g);
  g.ctx.addBlock(me, 'Write the report 10-11');
  at(g, '2026-10-14T08:56:00Z');   // 09:56
  g.ctx.nagRun();
  assert.ok(/Up next at 10:00/.test(mine(g).pop().title));
  g.ctx.nagRun();
  assert.ok(!mine(g).some((p, i, a) => i > 0 && /Up next/.test(p.title) && /Up next/.test(a[i - 1].title)), 'once');
  at(g, '2026-10-14T09:12:00Z');   // 10:12, not started
  g.ctx.nagRun();
  assert.ok(/haven't started/.test(mine(g).pop().title));
  at(g, '2026-10-14T10:02:00Z');   // 11:02
  g.ctx.nagRun();
  assert.ok(/Time's up: Write the report/.test(mine(g).pop().title));
  const n = mine(g).length;
  g.ctx.addBlock(me, 'Late one 23:00-23:30');
  at(g, '2026-10-14T21:58:00Z');   // 22:58
  g.ctx.nagRun();
  assert.strictEqual(mine(g).length, n, 'quiet hours');
});

test('Work: the Work blocks tab sets itself up on first use (before the daily run adds it)', () => {
  const { g, me } = ready();
  g.ctx.db_().deleteSheet(g.ctx.db_().getSheetByName('Work blocks'));
  g.ctx.resetRun_();
  const r = g.ctx.addBlock(me, 'Emails 9:30 30m');
  assert.strictEqual(r.work.blocks.length, 1);
  assert.strictEqual(r.work.blocks[0].task, 'Emails');
});

test('Wardrobe: free basics, chores unlock the best pieces, cash pays, only owned things can be worn', () => {
  const { g, me, partner } = ready();
  let w = g.ctx.wardrobeState_('me');
  assert.ok(w.owned.includes('fade') && w.owned.includes('tee') && !w.owned.includes('gown'));
  assert.strictEqual(w.chores, 0);
  assert.throws(() => g.ctx.buyWear(me, 'grove'), /5 more chores/);
  assert.throws(() => g.ctx.buyWear(me, 'afro'), /need \$800 more/);
  g.ctx.addCash_('me', 'Test money', 30000, 'test');
  g.ctx.buyWear(me, 'afro');
  assert.throws(() => g.ctx.buyWear(me, 'afro'), /already own/);
  for (let i = 0; i < 5; i++) g.ctx.addXp_('me', 'Chore ' + i, 5, 'quest');
  g.ctx.buyWear(me, 'grove');
  assert.strictEqual(g.ctx.cashOf_('me'), 30000 - 800 - 1500 + 25 * 10);
  assert.throws(() => g.ctx.setLook3d(me, { top: 'bodice' }), /don't own/);
  assert.throws(() => g.ctx.setLook3d(me, { hair: 'grove' }), /don't own/, 'wrong slot');
  let s = g.ctx.setLook3d(me, { hair: 'afro', top: 'grove', topC: '#00FF00', skin: 'red', acc: [], lips: '#ff0000' });
  assert.strictEqual(s.wardrobe.look.hair, 'afro');
  assert.strictEqual(s.wardrobe.look.topC, '#00ff00');
  assert.strictEqual(s.wardrobe.look.skin, '#8d5a3b', 'bad colours ignored');
  assert.strictEqual(s.wardrobe.look.lips, '#9c4a52', 'no glam kit, no lipstick');
  assert.throws(() => g.ctx.setLook3d(me, { acc: ['shades', 'chain', 'cap', 'hoops', 'bandana'] }), /Four extras/);
  assert.strictEqual(g.ctx.wardrobeState_('partner').other.hair, 'afro', 'your partner sees your look');
  assert.strictEqual(g.ctx.wardrobeState_('partner').look.body, 'f');
});

test('Push: the test goes to your own phone; a rejected message keeps the phone; a gone phone is dropped; status shows it all', () => {
  const { g, me, partner } = ready();
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  let r = g.ctx.testPush(me);
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(r.status.devices, 0);
  g.ctx.registerDevice(me, 'me-phone-token-0123456789', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)');
  g.ctx.registerDevice(partner, 'yaz-phone-token-0123456789', 'iPhone');
  r = g.ctx.testPush(me);
  assert.strictEqual(r.sent, 1);
  assert.strictEqual(g.state.pushes.pop().token, 'me-phone-token-0123456789', 'to you, not your partner');
  assert.ok(r.status.lastOk > 0);
  // Google rejects one message: the phone stays registered and the reason shows
  g.ctx.registerDevice(me, 'bad-token-xxxxxxxxxxxxxxxxxx', 'Desktop Windows');
  r = g.ctx.testPush(me);
  assert.strictEqual(r.status.devices, 2, 'kept');
  assert.ok(/Invalid JSON payload/.test(r.results.find(x => x.code === 400).error));
  // a phone that no longer exists is dropped
  g.ctx.registerDevice(me, 'dead-token-xxxxxxxxxxxxxxxxx', 'Old phone');
  r = g.ctx.testPush(me);
  assert.strictEqual(r.status.devices, 2);
  assert.ok(!r.status.phones.some(p => p.label === 'Old phone'));
  assert.strictEqual(g.ctx.appState(partner).push.devices, 1);
});

test('Work: counted blocks ("Queue 40 emails"): progress, hitting the target pays, partial pay, weekly totals, job kit', () => {
  const { g, me } = ready();
  let r = g.ctx.addBlock(me, 'Queue 40 emails 9-10');
  const id = r.added.id;
  r = g.ctx.countBlock(me, id, 10);
  let b = r.work.blocks.find(x => x.id === id);
  assert.deepStrictEqual([b.count, b.target, b.unit, b.status], [10, 40, 'emails', 'active']);
  r = g.ctx.countBlock(me, id, -15);
  assert.strictEqual(r.work.blocks.find(x => x.id === id).count, 0, 'never below zero');
  r = g.ctx.countBlock(me, id, 25); r = g.ctx.countBlock(me, id, 15);
  assert.strictEqual(r.hit, true, 'hitting 40 ticks it off');
  assert.ok(r.xp >= 6);
  assert.strictEqual(r.work.blocks.find(x => x.id === id).status, 'done');
  assert.strictEqual(g.ctx.countBlock(me, id, 5).xp, 0, 'paid once');
  // stopping early pays a share
  r = g.ctx.addBlock(me, 'Edit 4 videos 10-12');
  const v = r.added.id;
  g.ctx.countBlock(me, v, 1);
  r = g.ctx.blockAction(me, v, 'done');
  assert.strictEqual(r.part, 0.25);
  assert.throws(() => g.ctx.countBlock(me, r.work.blocks.find(x => x.task === 'Edit 4 videos').id, 1e6), /didn't count/);
  r = g.ctx.addBlock(me, 'Deep work 1h');
  assert.throws(() => g.ctx.countBlock(me, r.added.id, 1), /no count/);
  const w = g.ctx.workState(me);
  assert.deepStrictEqual(plain(w.week.units), { emails: 40, videos: 1 });
  assert.ok(w.kit.includes('Queue 40 emails'));
  g.ctx.setPrefs(me, { workKit: ['Edit 2h', '  ', 'Queue 60 emails'] });
  assert.deepStrictEqual(plain(g.ctx.workState(me).kit), ['Edit 2h', 'Queue 60 emails']);
});
