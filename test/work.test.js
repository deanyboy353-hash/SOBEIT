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
  const p = t => { const r = plain(g.ctx.parseBlock(t)); delete r.tomorrow; return r; };
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
