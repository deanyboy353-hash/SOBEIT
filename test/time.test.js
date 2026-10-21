const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const plain = x => JSON.parse(JSON.stringify(x));
const london = (g, d, p) => g.ctx.Utilities.formatDate(d, 'Europe/London', p || 'yyyy-MM-dd HH:mm');

test('Dates roll over at midnight UK time (not UTC), in summer time and after the clocks go back', () => {
  const g = loadProject({ now: new Date('2026-10-14T23:30:00Z') });     // 00:30 BST on Thu 15th
  g.ctx.setup();
  assert.strictEqual(g.ctx.todayYmd_(), '2026-10-15');
  g.state.now = new Date('2026-10-24T23:30:00Z');                       // 00:30 BST on Sun 25th
  assert.strictEqual(g.ctx.todayYmd_(), '2026-10-25');
  g.state.now = new Date('2026-10-25T23:30:00Z');                       // 23:30 GMT on Sun 25th (clocks went back at 2am)
  assert.strictEqual(g.ctx.todayYmd_(), '2026-10-25');
  g.state.now = new Date('2026-10-26T00:05:00Z');                       // 00:05 GMT on Mon 26th
  assert.strictEqual(g.ctx.todayYmd_(), '2026-10-26');
  assert.strictEqual(g.ctx.addDays_('2026-10-24', 1), '2026-10-25');
  assert.strictEqual(g.ctx.addDays_('2026-10-25', 1), '2026-10-26');   // across the 25-hour day
  assert.strictEqual(g.ctx.addDays_('2026-10-26', -2), '2026-10-24');
  assert.strictEqual(g.ctx.dayOfWeek_('2026-10-25'), 0);
});

test('Across the clocks going back: gym, weigh-in and briefs stay on UK clock times', () => {
  const g = loadProject({ now: new Date('2026-10-24T05:05:00Z') });     // Sat 06:05 BST, a training day
  g.ctx.setup(); g.ctx.dailyRun();
  let ev = g.calendar.live().find(e => e.tags.sobeit === 'gym');
  assert.strictEqual(london(g, ev.start, 'HH:mm'), '14:59', 'Saturday: out on the 15:01, in time for the 16:41 home');
  g.state.now = new Date('2026-10-26T06:05:00Z');                       // Mon 06:05 GMT, weigh-in day
  g.ctx.dailyRun();
  const weigh = g.calendar.live().find(e => e.title === 'Weigh in' && london(g, e.start, 'yyyy-MM-dd') === '2026-10-26');
  assert.ok(weigh, 'Monday weigh-in event');
  assert.strictEqual(london(g, weigh.start, 'HH:mm'), '08:30');
  g.state.now = new Date('2026-10-27T06:05:00Z');                       // Tue 06:05 GMT, a training day
  g.ctx.dailyRun();
  ev = g.calendar.live().find(e => e.tags.sobeit === 'gym' && london(g, e.start, 'yyyy-MM-dd') === '2026-10-27');
  assert.strictEqual(london(g, ev.start, 'HH:mm'), '14:59', 'leave-by is still 14:59 UK time after the change');
  // a streak settles across the 25-hour Sunday without skipping or doubling a day
  const st = plain(JSON.parse(g.state.props.STREAK_me));
  assert.strictEqual(st.through, '2026-10-26');
});

test('Privacy: Yaz never gets Dean\'s weight, food or health; no API keys reach the front end', () => {
  const g = loadProject({ now: new Date('2026-10-14T07:40:00Z') });
  g.ctx.setup();
  const me = g.state.props.WEBAPP_KEY, yaz = g.state.props.PARTNER_KEY;
  g.ctx.logWeightNow(me, '87.3');
  g.ctx.saveSetup(me, 'health', { height: 183, goal: 79.5 });
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-secretsecretsecretsecret';
  const yazState = JSON.stringify(g.ctx.appState(yaz)), yazPage = g.ctx.doGet({ parameter: { key: yaz } }).html;
  [yazState, yazPage].forEach(s => {
    assert.doesNotMatch(s, /87\.3|79\.5|"height":183/, 'Dean\'s body data');
    assert.doesNotMatch(s, /sk-ant-secret/, 'Claude key');
    assert.doesNotMatch(s, /private_key|BEGIN PRIVATE/, 'service account');
    assert.doesNotMatch(s, /"food":\{|"train":\{|"today":\{"date"/, 'Dean-only sections');
  });
  assert.doesNotMatch(JSON.stringify(g.ctx.appState(me)), /sk-ant-secret/, 'not even Dean\'s own page carries the key');
  const fs = require('fs'), path = require('path');
  fs.readdirSync(path.join(__dirname, '../web')).filter(f => /\.(js|html|json)$/.test(f) && f !== 'words.js').forEach(f => {
    const s = fs.readFileSync(path.join(__dirname, '../web', f), 'utf8');
    assert.doesNotMatch(s, /sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN PRIVATE KEY|AIza[0-9A-Za-z_-]{30,}/, f + ' has a key in it');
  });
});
