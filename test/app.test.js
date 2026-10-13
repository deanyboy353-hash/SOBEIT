const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready() {
  const g = loadProject({ now: new Date('2026-10-13T17:00:00Z') }); // Tue 18:00
  g.ctx.setup();
  return { g, me: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}
const setSetting = (g, k, v) => { const t = g.tab('Config'); const i = t.rows().findIndex(r => r[0] === k); t.getRange(i + 1, 2).setValue(v); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const claudeSays = (g, obj) => { g.state.claudeReply = { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] } }; };
const plain = x => JSON.parse(JSON.stringify(x)); // objects from the sandbox
const rpc = (g, body) => JSON.parse(g.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } }).text);

// ---- schedule page ----

test('every chore gets a rhythm and a sensible next date', () => {
  const { g, me } = ready();
  const sched = g.ctx.appState(me).schedule;
  const rhythms = new Set(sched.map(q => q.rhythm));
  ['daily', 'weekly', 'biweekly', 'monthly'].forEach(r => assert.ok(rhythms.has(r), 'has ' + r + ' chores'));
  const limit = { daily: 0, weekly: 6, biweekly: 13, monthly: 31 };
  sched.filter(q => q.rhythm in limit).forEach(q => {
    assert.match(q.next, /^\d{4}-\d{2}-\d{2}$/, q.name);
    const d = daysBetween('2026-10-13', q.next);
    assert.ok(d >= 0 && d <= limit[q.rhythm], q.name + ' (' + q.every + ') next ' + q.next);
  });
});

test('saving a chore from the schedule page: weekly days, monthly date, rename, delete', () => {
  const { g, me } = ready();
  let s = g.ctx.saveQuest(me, { rhythm: 'weekly', days: [1, 4], name: 'Water the plants', minutes: 5 });
  let q = s.schedule.find(x => x.name === 'Water the plants');
  assert.strictEqual(q.every, 'weekly Mon, Thu');
  assert.ok([1, 4].includes(new Date(q.next + 'T12:00:00Z').getUTCDay()));
  s = g.ctx.saveQuest(me, { name: 'Water the plants', newName: 'Feed the plants', rhythm: 'monthly', date: 15, minutes: 5 });
  q = s.schedule.find(x => x.name === 'Feed the plants');
  assert.strictEqual(q.next, '2026-10-15');
  assert.ok(!s.schedule.some(x => x.name === 'Water the plants'));
  assert.throws(() => g.ctx.saveQuest(me, { rhythm: 'weekly', days: [], name: 'Nope' }), /Pick at least one day/);
  assert.throws(() => g.ctx.saveQuest(me, { rhythm: 'daily', name: 'feed the PLANTS' }), /already exists/);
  const before = s.schedule.length;
  s = g.ctx.deleteQuest(me, 'Feed the plants');
  assert.strictEqual(s.schedule.length, before - 1);
  s = g.ctx.respreadSchedule(me);
  assert.strictEqual(s.schedule.length, before - 1);
});

// ---- games ----

test('daily word: same word for both, no spoilers, live progress, scores and a head-to-head', () => {
  const { g, me, partner } = ready();
  const answer = g.ctx.todaysWord_('2026-10-13');
  assert.match(answer, /^[a-z]{5}$/);
  assert.throws(() => g.ctx.guessWord(me, 'abcde'), /Not in the word list/);
  assert.throws(() => g.ctx.guessWord(me, 'abc'), /Five letters/);
  const wrong = answer === 'crane' ? 'slate' : 'crane';
  let s = g.ctx.guessWord(me, wrong);
  assert.strictEqual(s.word.guesses.length, 1);
  assert.strictEqual(s.word.answer, '');
  // partner sees my colours but not my letters
  let p = g.ctx.gamesState(partner);
  assert.strictEqual(p.word.other.tries, 1);
  assert.deepStrictEqual(plain(p.word.other.guesses), []);
  s = g.ctx.guessWord(me, answer);
  assert.ok(s.word.won && s.word.done);
  assert.strictEqual(s.word.answer, answer);
  assert.throws(() => g.ctx.guessWord(me, answer), /finished today/);
  p = g.ctx.guessWord(partner, answer);
  assert.ok(p.word.won);
  assert.deepStrictEqual(plain(p.word.other.guesses), [wrong, answer]); // both done: boards revealed
  assert.strictEqual(p.stats.you, 1); // partner got it in 1, beat my 2
  assert.strictEqual(g.ctx.gamesState(me).stats.them, 1);
  assert.strictEqual(g.ctx.gamesState(me).stats.word.dist[1], 1);
  assert.strictEqual(g.tab('Games').rows().filter(r => r[3] === 'word').length, 2);
});

test('numbers: only your six numbers, best answer counts, lock in shows your partner', () => {
  const { g, me, partner } = ready();
  const pz = g.ctx.numbersPuzzle('2026-10-13');
  const [a, b] = pz.numbers;
  assert.throws(() => g.ctx.submitTarget(me, '999 + 1'), /./);
  let s = g.ctx.submitTarget(me, a + ' + ' + b);
  assert.strictEqual(s.target.mine.best, a + b);
  assert.strictEqual(g.ctx.gamesState(partner).target.other.expr, ''); // hidden until partner locks in
  s = g.ctx.submitTarget(me, '', true);
  assert.ok(s.target.mine.final);
  assert.throws(() => g.ctx.submitTarget(me, a + ' + ' + b), /Locked in/);
  g.ctx.submitTarget(partner, String(a));
  const p = g.ctx.submitTarget(partner, '', true);
  assert.strictEqual(p.target.other.expr, a + ' + ' + b);
});

test('recall keeps your best of the day in one Games row', () => {
  const { g, me } = ready();
  g.ctx.submitRecall(me, 5);
  g.ctx.submitRecall(me, 8);
  const s = g.ctx.submitRecall(me, 3);
  assert.strictEqual(s.recall.mine.best, 8);
  const rows = g.tab('Games').rows().filter(r => r[3] === 'recall');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(Number(rows[0][4]), 8);
});

// ---- the installable app's connection ----

test('app API: runs allowed actions with your key; partner key still can\'t reach food', () => {
  const { g, me, partner } = ready();
  let r = rpc(g, { fn: 'appState', key: me, args: [] });
  assert.ok(r.ok && r.result.who === 'me' && r.result.food);
  r = rpc(g, { fn: 'appState', key: partner, args: [] });
  assert.ok(r.ok && r.result.who === 'partner' && !r.result.food && !r.result.train);
  r = rpc(g, { fn: 'foodState', key: partner, args: [] });
  assert.ok(!r.ok && /out of date/.test(r.error));
  r = rpc(g, { fn: 'setup', key: me, args: [] });
  assert.deepStrictEqual(r, { ok: false, error: 'Unknown action.' });
  r = rpc(g, { fn: 'guessWord', key: 'wrong', args: ['crane'] });
  assert.ok(!r.ok);
  r = rpc(g, { fn: 'addShopping', key: partner, args: ['Milk'] });
  assert.ok(r.ok);
  assert.ok(g.ctx.appState(me).shopping.some(i => i.item === 'Milk'));
});

// ---- push ----

test('nudges: without push set up they fall back to email or a calendar alert', () => {
  const { g, me, partner } = ready();
  setSetting(g, 'Partner email', 'partner@example.com');
  assert.deepStrictEqual(plain(g.ctx.sendNudge(me, 'Dishes?')), { delivered: true });
  assert.strictEqual(g.state.mails.at(-1).to, 'partner@example.com');
  assert.match(g.state.mails.at(-1).body, /Dishes\?/);
  const before = g.calendar.events.length;
  assert.deepStrictEqual(plain(g.ctx.sendNudge(partner, 'Gym time')), { delivered: true });
  assert.strictEqual(g.calendar.events.length, before + 1);
  assert.throws(() => g.ctx.sendNudge(me, '  '), /Type a message/);
});

test('push: phones register, nudges go through Firebase, dead phones are forgotten', () => {
  const { g, me, partner } = ready();
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.state.props.APP_URL = 'https://life-quest.web.app/';
  g.ctx.registerDevice(partner, 'partner-phone-token-0123456789', 'iPhone');
  g.ctx.registerDevice(partner, 'dead-old-phone-token-0123456789', 'old');
  assert.strictEqual(g.ctx.appState(partner).push.devices, 2);
  assert.strictEqual(g.ctx.appState(me).push.otherDevices, 2);
  const mails = g.state.mails.length;
  assert.deepStrictEqual(plain(g.ctx.sendNudge(me, 'Dishes?')), { delivered: true });
  assert.strictEqual(g.state.mails.length, mails, 'no email when push worked');
  const sent = g.state.pushes.find(x => x.token === 'partner-phone-token-0123456789');
  assert.strictEqual(sent.body, 'Dishes?');
  assert.strictEqual(g.ctx.appState(partner).push.devices, 1);
  // game events reach the other person too
  g.ctx.guessWord(me, g.ctx.todaysWord_('2026-10-13'));
  assert.match(g.state.pushes.at(-1).title, /got the word in 1/);
  assert.strictEqual(g.state.pushes.at(-1).tab, 'play');
  assert.throws(() => g.ctx.registerDevice(me, 'short'), /looks wrong/);
});

// ---- AI ----

test('ask: Claude answers and acts in the app (shopping, chores, a job to start)', () => {
  const { g, me } = ready();
  assert.throws(() => g.ctx.ask(me, 'hi'), /Claude API key/);
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-test';
  claudeSays(g, { reply: 'Done. Start with the dishes.', actions: [
    { type: 'add_shopping', text: 'Eggs', rhythm: 'none', minutes: 0 },
    { type: 'add_chore', text: 'Clean the car mats', rhythm: 'monthly', minutes: 5 },
    { type: 'start_job', text: 'Do the dishes', rhythm: 'none', minutes: 15 }
  ] });
  const r = g.ctx.ask(me, 'need eggs, and remind me to clean the car mats. what now?');
  assert.strictEqual(r.reply, 'Done. Start with the dishes.');
  assert.ok(r.state.shopping.some(i => i.item === 'Eggs'));
  const k = r.state.schedule.find(q => q.name === 'Clean the car mats');
  assert.strictEqual(k.rhythm, 'monthly');
  assert.ok(k.next);
  assert.ok(r.startJob && r.startJob.minutes > 0);
  assert.strictEqual(r.done.length, 2);
  const req = g.state.claudeRequests.at(-1);
  assert.match(req.body.messages[0].content, /car mats/);
  assert.strictEqual(req.body.output_config.format.type, 'json_schema');
  // history is kept for the next question, and can be cleared
  claudeSays(g, { reply: 'Sure.', actions: [] });
  g.ctx.ask(me, 'thanks');
  assert.match(g.state.claudeRequests.at(-1).body.messages[0].content, /Earlier:/);
  g.ctx.clearAsk(me);
  g.ctx.ask(me, 'hi again');
  assert.doesNotMatch(g.state.claudeRequests.at(-1).body.messages[0].content, /Earlier:/);
});

test('morning brief and meal ideas', () => {
  const { g, me } = ready();
  assert.strictEqual(g.ctx.getBrief(me), null);
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-test';
  claudeSays(g, { brief: 'Upper day. Keep it simple.', first: 'Fill a water bottle' });
  assert.strictEqual(g.ctx.getBrief(me).first, 'Fill a water bottle');
  const calls = g.state.claudeRequests.length;
  g.ctx.getBrief(me);
  assert.strictEqual(g.state.claudeRequests.length, calls, 'brief is made once a day');
  assert.strictEqual(g.ctx.appState(me).brief.brief, 'Upper day. Keep it simple.');
  claudeSays(g, { ideas: [{ name: 'Greek yoghurt and berries', kcal: 250, protein_g: 25, why: 'Quick protein' }] });
  const ideas = g.ctx.mealIdeas(me);
  assert.strictEqual(ideas[0].protein, 25);
  const res = g.ctx.logIdea(me, ideas[0]);
  assert.ok(res.state.entries.some(e => e.item === 'Greek yoghurt and berries'));
});

test('built Google page has no emojis and no leftover template tags', () => {
  const { g, me } = ready();
  const html = g.ctx.doGet({ parameter: { key: me, page: 'play' } }).html;
  assert.match(html, /window\.LQ_TAB = "play";/);
  assert.doesNotMatch(html, /<\?/);
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
});
