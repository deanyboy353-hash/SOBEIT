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

test('DST change days: today and the weekday stay right on the server and on the phone (last Sunday of March and of October)', () => {
  const F = require('../web/fmt.js');
  const cases = [
    ['2026-03-28T23:59:00Z', '2026-03-28', 6],   // 23:59 GMT Sat
    ['2026-03-29T00:30:00Z', '2026-03-29', 0],   // 00:30 GMT Sun, clocks go forward at 1am
    ['2026-03-29T22:59:00Z', '2026-03-29', 0],   // 23:59 BST Sun
    ['2026-03-29T23:30:00Z', '2026-03-30', 1],   // 00:30 BST Mon
    ['2026-10-24T23:30:00Z', '2026-10-25', 0],   // 00:30 BST Sun, clocks go back at 2am
    ['2026-10-25T23:30:00Z', '2026-10-25', 0],   // 23:30 GMT Sun (a 25-hour day)
    ['2026-10-26T00:05:00Z', '2026-10-26', 1],   // 00:05 GMT Mon
    ['2026-10-27T07:00:00Z', '2026-10-27', 2]    // Tue morning: the day Home said Monday
  ];
  for (const [iso, ymd, dow] of cases) {
    const ms = Date.parse(iso);
    assert.strictEqual(F.ukYmd(ms), ymd, 'phone ' + iso);
    assert.strictEqual(F.ukDow(ms), dow, 'phone weekday ' + iso);
    const g = loadProject({ now: new Date(iso) });
    g.ctx.setup();
    assert.strictEqual(g.ctx.todayYmd_(), ymd, 'server ' + iso);
    assert.strictEqual(g.ctx.dayOfWeek_(ymd), dow, 'server weekday ' + iso);
    assert.strictEqual(plain(g.ctx.todayState(g.state.props.WEBAPP_KEY)).date, ymd, 'Today card ' + iso);
  }
  assert.match(F.ukLongDate(Date.parse('2026-10-27T07:00:00Z')), /^Tuesday,? 27 October$/);
  assert.strictEqual(F.ukMinutes(Date.parse('2026-10-25T23:30:00Z')), 23 * 60 + 30);
  assert.strictEqual(F.ukMinutes(Date.parse('2026-03-29T23:30:00Z')), 30);
});

test('The phone never takes its clock from a saved screen: a day-old copy can no longer put "today" back a day', () => {
  const F = require('../web/fmt.js');
  assert.strictEqual(F.clockOffset(-14 * 3600e3), 0, 'a screen saved last night is not a clock');
  assert.strictEqual(F.clockOffset(1200), 1200);
  assert.strictEqual(F.clockOffset('nonsense'), 0);
  const src = require('fs').readFileSync(require('path').join(__dirname, '../web/app.js'), 'utf8');
  assert.ok(!/S\.now - Date\.now\(\)/.test(src), 'no offset from the saved state');
  assert.ok(!/toLocaleDateString\('en-GB', \{ weekday: 'long', day: 'numeric', month: 'long' \}\)/.test(src.slice(src.indexOf('function renderHome'), src.indexOf('function renderHome') + 800)), 'Home\'s date is in UK time');
});
