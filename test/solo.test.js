const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function soloCopy() {
  const g = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  g.ctx.INSTANCE = { url: 'https://script.google.com/macros/s/DYLZ123/exec', key: 'dylzkey0123456789abcdef', solo: true, name: 'Dylz', nick: 'Dylz' };
  g.ctx.setup();
  return g;
}

test('a separate solo copy: its own preset key, its own name, its own server URL, no partner', () => {
  const g = soloCopy();
  assert.strictEqual(g.state.props.WEBAPP_KEY, 'dylzkey0123456789abcdef');
  assert.strictEqual(g.state.props.SOLO, '1');
  const s = g.ctx.appState('dylzkey0123456789abcdef');
  assert.strictEqual(s.solo, true);
  assert.strictEqual(s.who, 'me');
  assert.strictEqual(s.fun.nick, 'Dylz');
  assert.strictEqual(g.ctx.nicks_().team, 'Dylz');
  assert.throws(() => g.ctx.appState(g.state.props.PARTNER_KEY), /out of date/, 'no partner link works on a solo copy');
  assert.strictEqual(g.ctx.webappUrl_(), 'https://script.google.com/macros/s/DYLZ123/exec');
  const cfg = JSON.stringify(g.tab('Config').rows());
  assert.ok(cfg.includes('DYLZ123'));
  assert.ok(!/Deany|Yazzy/.test(JSON.stringify(s.fun)), 'none of Dean and Yaz in his app');
});

test('solo: no pushes to a partner, every chore is his, the pet grows on his own wins', () => {
  const g = soloCopy();
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.state.props.DEVICES = JSON.stringify({ me: [], partner: [{ token: 'ghost-token-0123456789', label: 'x' }] });
  assert.strictEqual(g.ctx.push_('partner', 'hi', 'there', 'home'), 0);
  assert.strictEqual(g.state.pushes.length, 0);
  const st = g.ctx.cpState_('2026-10-13');
  assert.ok(st.chores.length > 0 && st.chores.every(c => c.assign === 'me'));
  const pet = JSON.parse(JSON.stringify(g.ctx.petState({ total: 3, count: 3, todayDone: false }, 600, true)));
  assert.match(pet.line, /you to win the day/);
});

test('the main app is unchanged: not solo, partner link still works', () => {
  const g = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  g.ctx.setup();
  assert.strictEqual(g.ctx.appState(g.state.props.WEBAPP_KEY).solo, false);
  assert.strictEqual(g.ctx.appState(g.state.props.PARTNER_KEY).who, 'partner');
  assert.ok(g.ctx.webappUrl_().includes('AKfycbyGglsy'));
});

test('a fresh copy sets itself up on its first request and assumes nothing about the person', () => {
  const g = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  g.ctx.INSTANCE = { url: 'https://script.google.com/macros/s/DYLZ123/exec', key: 'dylzkey0123456789abcdef', solo: true, name: 'Dylz', nick: 'Dylz' };
  assert.ok(!g.state.props.WEBAPP_KEY);
  const out = JSON.parse(g.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ fn: 'appState', key: 'dylzkey0123456789abcdef', args: [] }) } }).text);
  assert.strictEqual(out.ok, true, out.error);
  const s = out.result;
  assert.strictEqual(s.solo, true);
  assert.strictEqual(s.setup.done, false, 'setup still to do: the app opens the wizard first');
  assert.strictEqual(s.setup.health, false, 'health and fitness off until he says yes');
  const st = JSON.parse(JSON.stringify(g.ctx.setupState('dylzkey0123456789abcdef')));
  assert.deepStrictEqual(st.profile.work, {}, 'no preset work days');
  assert.deepStrictEqual(st.health.weighDays, []);
  assert.strictEqual(st.health.trainDays, 0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.ctx.gymDays_())), [], 'no gym days');
  assert.strictEqual(g.ctx.todaySession_('2026-10-13'), '');
  assert.ok(!g.ctx.todayState_().weighDay);
  // a wrong key never triggers setup
  const g2 = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  g2.ctx.INSTANCE = g.ctx.INSTANCE;
  g2.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ fn: 'appState', key: 'nope', args: [] }) } });
  assert.ok(!g2.state.props.WEBAPP_KEY);
});

test('setup: "I don\'t go to the gym" clears gym days; picking days sets them', () => {
  const g = soloCopy(), k = 'dylzkey0123456789abcdef';
  g.ctx.saveSetup(k, 'health', { on: true, trainDays: 3, gymDays: [1, 3, 5] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.ctx.gymDays_())).sort(), [1, 3, 5]);
  g.ctx.saveSetup(k, 'health', { trainDays: 0, gymDays: [] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.ctx.gymDays_())), []);
  g.ctx.saveSetup(k, 'health', { weighDays: [] });
  assert.ok(!g.ctx.todayState_().weighDay);
});
