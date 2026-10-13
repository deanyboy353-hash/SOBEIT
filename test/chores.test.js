const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready() {
  const g = loadProject({ now: new Date('2026-10-13T17:00:00Z') }); // Tue 18:00
  g.ctx.setup();
  return { g, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const at = (g, iso) => { g.state.now = new Date(iso); };
const val = (g, k) => (g.tab('Config').rows().find(r => r[0] === k) || [])[1];

test('setup adds Chores, Chores log and Later tabs, and two chores links', () => {
  const { g, me, partner } = ready();
  assert.ok(g.tab('Chores').getLastRow() > 5);
  assert.ok(g.tab('Chores log') && g.tab('Later'));
  assert.notStrictEqual(me, partner);
  assert.match(val(g, 'Your app link'), new RegExp('\\?key=' + me + '$'));
  assert.match(val(g, 'Partner app link'), new RegExp('\\?key=' + partner + '$'));
});

test('partner link opens chores only; it cannot reach food or post data', () => {
  const { g, me, partner } = ready();
  const page = g.ctx.doGet({ parameter: { key: partner } });
  const boot = JSON.parse(page.html.match(/var S = (.*);/)[1]);
  assert.deepStrictEqual(Object.keys(boot).filter(k => ['today', 'food', 'train'].includes(k)), []);
  assert.strictEqual(boot.who, 'partner');
  assert.throws(() => g.ctx.todayState(partner), /out of date/);
  assert.throws(() => g.ctx.gymDone(partner), /out of date/);
  assert.throws(() => g.ctx.foodState(partner), /out of date/);
  assert.throws(() => g.ctx.logPreset(partner, 'Protein shake'), /out of date/);
  assert.match(g.ctx.doPost({ parameter: { key: partner }, postData: { contents: '{}' } }).text, /bad key/);
  assert.throws(() => g.ctx.choresState('nope'), /out of date/);
  // your link opens everything in one app
  const mine = JSON.parse(g.ctx.doGet({ parameter: { key: me } }).html.match(/var S = (.*);/)[1]);
  assert.ok(['today', 'food', 'train', 'quests', 'game', 'chores'].every(k => k in mine));
  assert.doesNotMatch(page.html, /<\?/);
});

test('do the dishes: timer, steps, alert on your phone, partner sees it, no hopping', () => {
  const { g, me, partner } = ready();
  const dishes = g.ctx.choresState(me).chores.find(c => c.name === 'Do the dishes');
  assert.strictEqual(dishes.minutes, 15);
  assert.strictEqual(dishes.steps.length, 5);

  let s = g.ctx.startChore(me, dishes);
  const sess = s.chores.people.me.session;
  assert.strictEqual(sess.endsAt - sess.startedAt, 15 * 60000);
  const alert = g.calendar.live().find(e => /time's up/.test(e.title));
  assert.strictEqual(alert.title, "Do the dishes: time's up");
  assert.strictEqual(g.ctx.Utilities.formatDate(alert.start, 'Europe/London', 'HH:mm'), '18:15');
  assert.deepStrictEqual([...alert.reminders], [0]);

  // partner sees it live
  const theirs = g.ctx.choresState(partner);
  assert.strictEqual(theirs.you, 'partner');
  assert.strictEqual(theirs.people.me.session.task, 'Do the dishes');

  // can't start a second job
  assert.throws(() => g.ctx.startChore(me, { name: 'Hoover downstairs', minutes: 20 }), /One job at a time/);

  s = g.ctx.stepDone(me, 0); s = g.ctx.stepDone(me, 1);
  assert.strictEqual(s.chores.people.me.session.step, 2);

  // +5 moves the alert
  at(g, '2026-10-13T17:14:00Z');
  g.ctx.extendChore(me, 5);
  const moved = g.calendar.live().filter(e => /time's up/.test(e.title));
  assert.strictEqual(moved.length, 1);
  assert.strictEqual(g.ctx.Utilities.formatDate(moved[0].start, 'Europe/London', 'HH:mm'), '18:20');

  at(g, '2026-10-13T17:18:00Z');
  s = g.ctx.finishChore(me, 'Done');
  assert.strictEqual(s.chores.people.me.session, null);
  assert.deepStrictEqual([...s.chores.people.me.doneToday], ['Do the dishes']);
  assert.strictEqual(g.calendar.live().filter(e => /time's up/.test(e.title)).length, 0, 'alert removed');
  const log = g.tab('Chores log').rows()[1];
  assert.deepStrictEqual(log.slice(0, 9), ['2026-10-13', 'me', 'Do the dishes', 15, 18, 'Done', '18:00', '18:18', '2/5']);
});

test('partner timer runs on their page (no calendar alert on your phone)', () => {
  const { g, partner } = ready();
  g.ctx.startChore(partner, { name: 'Change the bedding', minutes: 15, steps: [] });
  assert.strictEqual(g.calendar.live().filter(e => /time's up/.test(e.title)).length, 0);
  assert.strictEqual(g.ctx.finishChore(partner, 'Done').chores.people.partner.doneToday[0], 'Change the bedding');
});

test('parking a distraction keeps you on the job; stopping parks the rest; tick clears', () => {
  const { g, me, partner } = ready();
  g.ctx.startChore(me, g.ctx.choresState(me).chores[0]);
  let s = g.ctx.parkThing(me, 'windows are filthy');
  assert.strictEqual(s.chores.people.me.session.task, 'Do the dishes', 'still on the same job');
  s = g.ctx.finishChore(me, 'Stopped');
  assert.deepStrictEqual([...s.chores.later.map(l => l.thing)], ['windows are filthy', 'Do the dishes: Clear and scrape plates, Fill the sink or load the dishwasher, Wash or load everything, Dry and put away (or start the dishwasher), Wipe the counters and sink']);
  // partner sees the shared Later list and can clear it
  s = g.ctx.clearLater(partner, s.chores.later[0].id);
  assert.strictEqual(s.chores.later.length, 1);
  assert.strictEqual(g.tab('Chores log').rows()[1][5], 'Stopped');
});

test('wrong job: cancel logs nothing', () => {
  const { g, me } = ready();
  g.ctx.startChore(me, { name: 'Put a wash on', minutes: 5, steps: [] });
  const s = g.ctx.finishChore(me, 'Cancelled');
  assert.strictEqual(s.chores.people.me.session, null);
  assert.strictEqual(g.tab('Chores log').getLastRow(), 1);
  assert.strictEqual(g.calendar.live().filter(e => /time's up/.test(e.title)).length, 0);
});

test('a job left running for hours is closed off as Not finished', () => {
  const { g, me } = ready();
  g.ctx.startChore(me, { name: 'Hoover downstairs', minutes: 20, steps: [] });
  at(g, '2026-10-13T21:00:00Z');
  assert.strictEqual(g.ctx.choresState(me).people.me.session, null);
  assert.strictEqual(g.tab('Chores log').rows()[1][5], 'Not finished');
});

test('new job: Claude times it and breaks it down; without a key you set the time', () => {
  const { g, me } = ready();
  let p = g.ctx.planChore(me, 'paint the fence');
  assert.deepStrictEqual({ ...p, steps: [...p.steps] }, { name: 'paint the fence', minutes: 15, steps: [], guessed: true });
  g.ctx.saveClaudeKey(me, 'sk-ant-api03-' + 'x'.repeat(40));
  g.state.claudeReply = { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ name: 'Clean the oven', minutes: 40, steps: ['Take the racks out', 'Spray the inside', 'Scrub the racks', 'Wipe it all down'] }) }] } };
  p = g.ctx.planChore(me, 'paint the fence');
  assert.strictEqual(p.minutes, 40);
  assert.strictEqual(p.steps.length, 4);
  assert.match(g.state.claudeRequests[0].body.system, /ADHD/);
  // known jobs don't call Claude
  g.ctx.planChore(me, 'do the dishes');
  assert.strictEqual(g.state.claudeRequests.length, 1);
});

test('the Chores tab learns your real times', () => {
  const { g, me } = ready();
  for (const mins of [11, 12, 13]) {
    g.ctx.startChore(me, { name: 'Do the dishes', minutes: 15, steps: [] });
    g.state.now = new Date(g.state.now.getTime() + mins * 60000);
    g.ctx.finishChore(me, 'Done');
  }
  assert.strictEqual(g.ctx.choresState(me).chores.find(c => c.name === 'Do the dishes').usual, 12);
});
