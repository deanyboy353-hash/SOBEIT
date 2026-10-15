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
const HOUSE = {
  floors: ['downstairs', 'upstairs'],
  rooms: [{ name: 'Kitchen', floor: 'downstairs' }, { name: 'Living room', floor: 'downstairs' }, { name: 'Hallway', floor: 'downstairs' },
    { name: 'Bedroom', floor: 'upstairs' }, { name: 'Study', floor: 'upstairs' }, { name: 'Bathroom', floor: 'upstairs' }],
  bins: [{ name: 'General', day: 2 }], laundryDay: 6, pets: false,
  chores: { hoover_down: { now: 'monthly', goal: 'weekly', who: 'shared' }, dishes: { now: 'daily', goal: 'daily', who: 'whoever' }, bins: { who: 'me' }, bathroom: { now: 'monthly', goal: 'weekly', who: 'whoever' } },
  extras: [{ name: 'Water the plants', now: 'weekly', goal: 'weekly', who: 'me', minutes: 5 }]
};
function built() {
  const r = ready();
  r.g.ctx.saveSetup(r.me, 'profile', { done: true, minimum: 2, manageable: '3-4', hates: [] });
  r.g.ctx.saveSetup(r.partner, 'profile', { done: true, minimum: 2, work: { 1: [540, 1050], 2: [540, 1050], 3: [540, 1050], 4: [540, 1050], 5: [540, 1050] } });
  r.g.ctx.saveSetup(r.me, 'house', HOUSE);
  r.g.ctx.buildChores(r.me);
  return r;
}

test('Setup: Dean\'s profile and health start pre-filled; Yaz\'s health is off and empty', () => {
  const { g, me, partner } = ready();
  const d = plain(g.ctx.setupState(me));
  assert.deepStrictEqual(d.profile.work, { 1: [540, 900], 2: [540, 900], 3: [540, 900], 4: [540, 960] });
  assert.strictEqual(d.profile.minimum, 2);
  assert.strictEqual(d.health.on, true); assert.strictEqual(d.health.kcal, 1800);
  assert.deepStrictEqual(d.health.protein, [130, 160]); assert.deepStrictEqual(d.health.weighDays, [1, 3]);
  assert.strictEqual(d.health.trainDays, 4); assert.strictEqual(d.health.stretchDays, 5); assert.strictEqual(d.health.noHinge, true);
  assert.strictEqual(d.health.share, false);
  const y = plain(g.ctx.setupState(partner));
  assert.deepStrictEqual(y.health, { on: false, share: false });
  assert.deepStrictEqual(y.profile.work, {});
});

test('Setup: Dean\'s body data stays private unless he shares it; Yaz never sees health questions unless she turns them on', () => {
  const { g, me, partner } = ready();
  g.ctx.saveSetup(me, 'health', { height: 183, weight: 96.4, goal: 85, goalDate: '2027-06-01' });
  const yazView = JSON.stringify(g.ctx.setupState(partner)) + JSON.stringify(g.ctx.appState(partner));
  assert.ok(!/96\.4|"goal":85|183/.test(yazView), 'Dean\'s numbers leaked to Yaz');
  assert.strictEqual(plain(g.ctx.setupState(partner)).partner.health, null);
  assert.strictEqual(plain(g.ctx.appState(partner)).setup.health, false);
  g.ctx.saveSetup(me, 'health', { share: true });
  assert.strictEqual(plain(g.ctx.setupState(partner)).partner.health.weight, 96.4);
  // Yaz can only change her own: turning hers on doesn't touch Dean's
  g.ctx.saveSetup(partner, 'health', { on: true });
  assert.strictEqual(plain(g.ctx.setupState(partner)).health.on, true);
  assert.strictEqual(plain(g.ctx.setupState(me)).health.height, 183);
  // and Dean's food targets follow his answers
  g.ctx.saveSetup(me, 'health', { kcal: 1900, protein: [140, 170] });
  assert.strictEqual(plain(g.ctx.foodState(me)).targets.kcal, 1900);
});

test('Setup: the household is shared; either of you can fill it in or change it', () => {
  const { g, me, partner } = ready();
  g.ctx.saveSetup(partner, 'house', { laundryDay: 0, pets: true });
  assert.strictEqual(plain(g.ctx.setupState(me)).house.laundryDay, 0);
  g.ctx.saveSetup(me, 'house', { laundryDay: 6 });
  assert.strictEqual(plain(g.ctx.setupState(partner)).house.laundryDay, 6);
  assert.strictEqual(plain(g.ctx.setupState(partner)).house.pets, true);
});

test('Building the chore list merges what you had: nothing lost, history kept', () => {
  const { g, me } = ready();
  const before = plain(g.ctx.appState(me)).quests.all.map(q => q.name);
  g.ctx.questDone(me, 'Clean the bathroom');                       // some history
  g.ctx.saveSetup(me, 'house', HOUSE);
  const prev = plain(g.ctx.previewChores(me));
  assert.ok(prev.some(x => x.action === 'update' && x.was === 'Clean the bathroom' && x.name === 'Clean bathroom'), JSON.stringify(prev.filter(x => /bath/i.test(x.name))));
  assert.ok(prev.some(x => x.action === 'update' && x.was === 'Hoover downstairs' && x.name === 'Hoover downstairs'));
  assert.ok(prev.some(x => x.action === 'add' && x.name === 'Hoover upstairs'));
  assert.ok(prev.some(x => x.action === 'keep' && x.name === 'Clean the oven'));
  // previewing changes nothing
  assert.deepStrictEqual(plain(g.ctx.appState(me)).quests.all.map(q => q.name), before);
  const r = plain(g.ctx.buildChores(me));
  assert.ok(r.built > 5);
  const all = plain(g.ctx.appState(me)).quests.all, names = all.map(q => q.name);
  before.filter(n => !prev.some(x => x.was === n && x.name !== n)).forEach(n => assert.ok(names.includes(n), n + ' was lost'));
  const bath = all.find(q => q.name === 'Clean bathroom');
  assert.strictEqual(bath.doneToday, true);                           // kept its history
  assert.match(bath.notes, /Was: Clean the bathroom/);
  assert.ok(names.includes('Bins out: General') && names.includes('Water the plants') && names.includes('Hoover upstairs'));
  // the chore log and XP history aren't touched
  assert.ok(g.tab('XP log').rows().some(r => /Clean the bathroom/.test(r.join(' '))));
});

test('Each person gets their own day: a minimum of short must-do jobs, then bonus', () => {
  const { g, me, partner } = built();
  const d = plain(g.ctx.appState(me)).quests, y = plain(g.ctx.appState(partner)).quests;
  assert.strictEqual(d.planned, true);
  assert.strictEqual(d.minimum, 2);
  assert.strictEqual(d.board.filter(q => q.must).length, 2);
  d.board.filter(q => q.must).forEach(q => assert.ok(q.minutes <= 10, q.name + ' ' + q.minutes));
  assert.ok(y.board.length > 0);
  const mine = d.board.map(q => q.name), hers = y.board.map(q => q.name);
  const both = d.board.filter(q => hers.includes(q.name));
  assert.ok(both.every(q => q.who === 'together'), 'only together jobs are on both lists: ' + both.map(q => q.name + ' ' + q.who));
});

test('The streak counts days you hit your minimum (any jobs), not the XP goal', () => {
  const { g, me } = built();
  let s = plain(g.ctx.appState(me));
  assert.strictEqual(s.game.streak.todayDone, false);
  const two = s.quests.board.filter(q => q.must).map(q => q.name);
  g.ctx.questDone(me, two[0]);
  assert.strictEqual(plain(g.ctx.appState(me)).game.streak.todayDone, false);
  g.ctx.questDone(me, two[1]);
  s = plain(g.ctx.appState(me));
  assert.strictEqual(s.quests.win, true);
  assert.strictEqual(s.game.streak.todayDone, true);
  assert.ok(s.game.xpToday < s.game.goal, 'XP ' + s.game.xpToday + ' should be under the goal to prove the point');
  // next morning the day is settled as a win
  at(g, '2026-10-15T05:00:00Z'); g.ctx.dailyRun();
  assert.strictEqual(plain(g.ctx.appState(me)).game.streak.count, 1);
});

test('Editing a chore changes the days ahead; archive, reorder and delete', () => {
  const { g, me, partner } = built();
  g.ctx.saveChore(me, 'Water the plants', { who: 'partner', freq: 'days', days: [4], tod: 'morning', xp: 15, notes: 'Kitchen ones too', minutes: 5 });
  let q = plain(g.ctx.appState(me)).quests.all.find(x => x.name === 'Water the plants');
  assert.strictEqual(q.who, 'partner'); assert.strictEqual(q.every, 'weekly Thu'); assert.strictEqual(q.tod, 'morning'); assert.strictEqual(q.xp, 15); assert.strictEqual(q.notes, 'Kitchen ones too');
  at(g, '2026-10-15T07:00:00Z'); g.ctx.dailyRun();                // Thursday
  assert.ok(plain(g.ctx.appState(partner)).quests.board.some(x => x.name === 'Water the plants'));
  assert.ok(!plain(g.ctx.appState(me)).quests.board.some(x => x.name === 'Water the plants'));
  g.ctx.saveChore(me, 'Water the plants', { name: 'Water all the plants' });
  assert.ok(plain(g.ctx.appState(me)).quests.all.some(x => x.name === 'Water all the plants'));
  g.ctx.choreAction(me, 'Water all the plants', 'archive');
  assert.ok(!plain(g.ctx.appState(partner)).quests.board.some(x => /plants/.test(x.name)));
  assert.strictEqual(plain(g.ctx.appState(me)).quests.all.find(x => x.name === 'Water all the plants').archived, true);
  g.ctx.choreAction(me, 'Water all the plants', 'unarchive');
  const order = () => plain(g.ctx.appState(me)).quests.all.map(x => x.name);
  const i = order().indexOf('Water all the plants');
  g.ctx.choreAction(me, 'Water all the plants', 'up');
  assert.strictEqual(order().indexOf('Water all the plants'), i - 1);
  g.ctx.saveChore(me, '', { name: 'Clean the windows', freq: 'monthly', minutes: 30, who: 'rotate' });
  assert.ok(order().includes('Clean the windows'));
  g.ctx.choreAction(me, 'Clean the windows', 'delete');
  assert.ok(!order().includes('Clean the windows'));
  assert.throws(() => g.ctx.saveChore(me, 'Food shop', { name: 'Dishes / dishwasher' }), /already a chore/);
});

test('A week of real days: missed jobs roll on without piling up', () => {
  const { g, me, partner } = built();
  for (let d = 15; d <= 21; d++) {
    at(g, '2026-10-' + d + 'T05:00:00Z'); g.ctx.dailyRun();
    const s = plain(g.ctx.appState(me)).quests;
    const late = s.board.filter(q => q.overdue > 0 && !/daily|days/.test(q.every));
    assert.ok(late.length <= 3, d + ': ' + late.map(q => q.name + ' ' + q.overdue).join(', '));
    assert.ok(s.board.length <= 8, d + ': ' + s.board.length + ' jobs');
  }
});

test('Reminders: the day\'s list at wake time, the minimum in gentle words, nothing in quiet hours, calm means no nags', () => {
  const { g, me, partner } = built();
  delete g.state.props.EXTRAS_OFF;
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.ctx.registerDevice(me, 'me-phone-token-0123456789', 'Pixel');
  g.ctx.registerDevice(partner, 'yaz-phone-token-0123456789', 'iPhone');
  g.ctx.saveSetup(me, 'profile', { wake: 450, reminder: 'gentle', quiet: [1260, 420], motivation: 'streaks' });
  g.ctx.saveSetup(partner, 'profile', { wake: 480, motivation: 'calm', quiet: [1350, 450] });
  const to = t => g.state.pushes.filter(p => p.token === t);
  at(g, '2026-10-14T08:10:00Z'); g.ctx.heartbeat_();                   // 09:10: both are up
  const list = to('me-phone-token-0123456789').find(p => /to win the day/.test(p.title));
  assert.ok(list, JSON.stringify(to('me-phone-token-0123456789').map(p => p.title)));
  assert.match(list.title, /Today: 2 to win the day/);
  assert.ok(to('yaz-phone-token-0123456789').some(p => /Today/.test(p.title)));
  at(g, '2026-10-14T18:40:00Z'); g.ctx.heartbeat_();                   // 19:40, Dean hasn't hit his minimum
  const nag = to('me-phone-token-0123456789').find(p => /streak|counts/i.test(p.title));
  assert.ok(nag && /small jobs and today counts/.test(nag.body), JSON.stringify(nag));
  assert.ok(!to('yaz-phone-token-0123456789').some(p => /streak|counts|ahead/i.test(p.title)), 'calm: no nags for Yaz');
  const n = to('me-phone-token-0123456789').length;
  at(g, '2026-10-14T20:35:00Z'); g.ctx.heartbeat_();                   // 21:35, inside Dean's quiet hours
  assert.strictEqual(to('me-phone-token-0123456789').length, n);
});
