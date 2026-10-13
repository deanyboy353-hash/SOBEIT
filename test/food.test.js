const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

const TUE_MORNING = new Date('2026-10-13T05:05:00Z'); // 06:05 UK

function ready(now = TUE_MORNING) {
  const g = loadProject({ now });
  g.ctx.setup();
  return { g, key: g.state.props.WEBAPP_KEY };
}

test('setup adds Presets tab, food settings and the food page link', () => {
  const { g, key } = ready();
  assert.ok(g.tab('Presets').getLastRow() > 1);
  assert.deepStrictEqual(g.tab('Food').rows()[0].slice(0, 7), ['Date', 'Time', 'Item', 'kcal', 'Protein (g)', 'Source', 'Entry']);
  const cfg = g.tab('Config').rows();
  const val = k => (cfg.find(r => r[0] === k) || [])[1];
  assert.strictEqual(val('Daily kcal target'), '1800');
  assert.strictEqual(val('Protein min (g)'), '130');
  assert.strictEqual(val('Protein max (g)'), '160');
  assert.match(val('Food page'), new RegExp('/exec\\?key=' + key + '$'));
});

test('an older Config tab gets the new settings without losing edits', () => {
  const { g } = ready();
  const cfg = g.tab('Config');
  // Simulate a Config tab made before food tracking: drop the food rows, change a value.
  const rows = cfg.data;
  ['Daily kcal target', 'Protein min (g)', 'Protein max (g)', 'Evening food check', 'Claude model', 'Food page']
    .forEach(k => { const i = rows.findIndex(r => r && r[0] === k); rows.splice(i, 1); });
  rows.find(r => r && r[0] === 'Wake time')[1] = '07:45';
  g.ctx.dailyRun();
  const after = cfg.rows();
  assert.strictEqual(after.find(r => r[0] === 'Wake time')[1], '07:45');
  assert.strictEqual(after.find(r => r[0] === 'Daily kcal target')[1], '1800');
  // still inside the SETTINGS block, before the weekly plan
  assert.ok(after.findIndex(r => r[0] === 'Food page') < after.findIndex(r => r[0] === 'WEEKLY PLAN'));
  assert.strictEqual(after.find(r => r[0] === 'Tue')[2], 'Upper A');
});

test('page needs the key; with it, it renders today\'s state', () => {
  const { g, key } = ready();
  const noKey = g.ctx.doGet({ parameter: {} });
  assert.match(noKey.text, /"ok":true/);
  const page = g.ctx.doGet({ parameter: { key } });
  assert.match(page.html, /var KEY = "\w+";/);
  assert.match(page.html, /"targets":\{"kcal":1800,"proteinMin":130,"proteinMax":160\}/);
  assert.doesNotMatch(page.html, /<\?/);
  assert.throws(() => g.ctx.foodState('wrong'), /out of date/);
});

test('preset tap logs instantly; totals add up; undo removes it', () => {
  const { g, key } = ready();
  const name = g.ctx.foodState(key).presets[0].name;
  let res = g.ctx.logPreset(key, name);
  res = g.ctx.logPreset(key, name);
  assert.strictEqual(res.state.totals.kcal, 240);
  assert.strictEqual(res.state.totals.protein, 48);
  assert.strictEqual(res.state.entries.length, 2);
  const undone = g.ctx.undoLast(key);
  assert.deepStrictEqual([...undone.removed], [name]);
  assert.strictEqual(undone.state.totals.kcal, 120);
  assert.throws(() => g.ctx.logPreset(key, 'Not a preset'), /no longer in your Presets/);
});

test('quick-add asks Claude (key from Script Properties), logs each item, undo removes the whole entry', () => {
  const { g, key } = ready();
  assert.throws(() => g.ctx.quickAdd(key, '2 protein weetabix 200ml milk'), /No Claude API key/);
  assert.throws(() => g.ctx.saveClaudeKey(key, 'hello'), /doesn't look like/);
  g.ctx.saveClaudeKey(key, 'sk-ant-api03-' + 'x'.repeat(40));
  assert.strictEqual(g.ctx.foodState(key).hasClaudeKey, true);

  g.ctx.logPreset(key, g.ctx.foodState(key).presets[1].name); // an earlier entry that must survive undo
  const res = g.ctx.quickAdd(key, '2 protein weetabix 200ml milk');
  assert.strictEqual(res.added.length, 2);
  assert.strictEqual(res.state.totals.kcal, 95 + 300);

  const req = g.state.claudeRequests[0];
  assert.strictEqual(req.headers['x-api-key'], 'sk-ant-api03-' + 'x'.repeat(40));
  assert.strictEqual(req.body.model, 'claude-opus-5-5');
  assert.strictEqual(req.body.fallbacks, 'default');
  assert.strictEqual(req.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.strictEqual(req.body.output_config.format.type, 'json_schema');
  assert.match(req.body.system, /Greek yogurt 0% \(170g\): 95 kcal, 17 g protein/);
  assert.strictEqual(req.body.messages[0].content, '2 protein weetabix 200ml milk');

  const rows = g.tab('Food').rows();
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[2][5], 'quick-add: 2 protein weetabix 200ml milk');
  assert.strictEqual(rows[2][6], rows[3][6], 'same entry id');

  const undone = g.ctx.undoLast(key);
  assert.strictEqual(undone.removed.length, 2);
  assert.strictEqual(undone.state.totals.kcal, 95);
  assert.ok(!JSON.stringify(g.tab('Config').rows()).includes('sk-ant'), 'API key never written to the Sheet');
});

test('Claude errors come back as plain-English messages', () => {
  const { g, key } = ready();
  g.ctx.saveClaudeKey(key, 'sk-ant-api03-' + 'x'.repeat(40));
  g.state.claudeReply = { code: 401, body: { error: { message: 'invalid x-api-key' } } };
  assert.throws(() => g.ctx.quickAdd(key, 'toast'), /rejected the API key/);
  g.state.claudeReply = { body: { stop_reason: 'refusal', content: [] } };
  assert.throws(() => g.ctx.quickAdd(key, 'toast'), /wouldn't answer/);
  assert.strictEqual(g.tab('Food').getLastRow(), 1);
});

test('undo only touches today', () => {
  const { g, key } = ready();
  g.ctx.logPreset(key, g.ctx.foodState(key).presets[0].name);
  g.state.now = new Date('2026-10-14T08:00:00Z');
  assert.throws(() => g.ctx.undoLast(key), /Nothing logged today/);
  assert.strictEqual(g.ctx.foodState(key).totals.kcal, 0, 'new day starts at zero');
});

test('11pm check: booked each morning, event shows what is left', () => {
  const { g, key } = ready();
  const trig = g.state.triggers.find(t => t.fn === 'foodCheck');
  assert.strictEqual(g.ctx.Utilities.formatDate(trig.at, 'Europe/London', 'HH:mm'), '22:40');
  g.ctx.logPreset(key, 'Chicken breast (150g)');
  g.state.now = new Date('2026-10-13T21:40:00Z');
  g.ctx.foodCheck();
  const ev = g.calendar.live().find(e => /🍽️/.test(e.title));
  assert.strictEqual(ev.title, '🍽️ 1560 kcal left · 84g protein to go');
  assert.strictEqual(g.ctx.Utilities.formatDate(ev.start, 'Europe/London', 'HH:mm'), '23:00');
  assert.deepStrictEqual([...ev.reminders], [0]);
  assert.match(ev.opts.description, /Food page: https:\/\/script\.google\.com/);
  g.ctx.foodCheck();
  assert.strictEqual(g.calendar.live().filter(e => /🍽️/.test(e.title)).length, 1, 'no duplicates');
});

test('food check wording: over → protein snack; nothing logged; all good', () => {
  const P = loadProject().ctx;
  const t = { kcal: 1800, proteinMin: 130, proteinMax: 160 };
  assert.strictEqual(P.buildFoodCheckText({ kcal: 1950, protein: 100 }, t, 5).title, '🍽️ Over by 150 kcal · 30g protein short → shake or yogurt');
  assert.match(P.buildFoodCheckText({ kcal: 1950, protein: 100 }, t, 5).description, /protein shake .* Greek yogurt/);
  assert.strictEqual(P.buildFoodCheckText({ kcal: 1950, protein: 140 }, t, 5).title, '🍽️ Over by 150 kcal · protein ✅ · kitchen closed');
  assert.strictEqual(P.buildFoodCheckText({ kcal: 0, protein: 0 }, t, 0).title, '🍽️ No food logged today');
  assert.strictEqual(P.buildFoodCheckText({ kcal: 1700, protein: 135 }, t, 4).title, '🍽️ 100 kcal left · protein ✅');
});

test('Sunday summary includes daily food averages, gym, weight and the week ahead', () => {
  const { g, key } = ready(new Date('2026-10-12T05:05:00Z')); // Mon
  const days = [['2026-10-12', 1700, 140], ['2026-10-13', 1900, 120], ['2026-10-15', 1800, 130]];
  days.forEach(([d, k, p]) => g.ctx.appendRow_('food', { Date: d, Time: '12:00', Item: 'x', kcal: k, 'Protein (g)': p, Source: 'test', Entry: d }));
  g.ctx.appendRow_('weight', { Date: '2026-10-14', 'Weight (kg)': 83.5 });
  g.ctx.appendRow_('weight', { Date: '2026-10-16', 'Weight (kg)': 83.1 });
  g.ctx.appendRow_('gym', { Date: '2026-10-14', Day: 'Wed', Session: 'Lower A', Status: 'Done ✅' });
  g.ctx.appendRow_('gym', { Date: '2026-10-16', Day: 'Fri', Session: 'Upper B', Status: 'Not ticked' });
  g.ctx.appendRow_('choresLog', { Date: '2026-10-15', Who: 'me', Task: 'Do the dishes', 'Actual (min)': 12, Result: 'Done' });
  g.ctx.appendRow_('choresLog', { Date: '2026-10-16', Who: 'partner', Task: 'Change the bedding', 'Actual (min)': 14, Result: 'Done' });
  g.ctx.appendRow_('choresLog', { Date: '2026-10-16', Who: 'me', Task: 'Hoover downstairs', 'Actual (min)': 20, Result: 'Done' });
  g.state.now = new Date('2026-10-18T17:30:00Z'); // Sun 18:30
  g.ctx.weeklySummary();
  const ev = g.calendar.live().find(e => e.title === '📊 Your week');
  assert.strictEqual(g.ctx.Utilities.formatDate(ev.start, 'Europe/London', 'EEE HH:mm'.replace('EEE ', '')), '19:00');
  const d = ev.opts.description;
  assert.match(d, /Daily average: 1800 kcal \(target 1800\) · 130g protein \(target 130–160\)/);
  assert.match(d, /Logged 3 of 7 days · protein hit on 2 · within calories on 2/);
  assert.match(d, /1 of 2 sessions done \(Wed Lower A\)/);
  assert.match(d, /83\.5 → 83\.1 kg \(-0\.4\)/);
  assert.match(d, /🧹 CHORES\nYou: 2 jobs, 32 min · Partner: 1 jobs, 14 min/);
  assert.match(d, /Mon: ⚖️ weigh-in\nTue: 🏋️ Upper A\nWed: 🏋️ Lower A · ⚖️ weigh-in/);
});
