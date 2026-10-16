const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');
const F = require('../web/fmt.js');
const plain = x => JSON.parse(JSON.stringify(x));
const at = (g, iso) => { g.state.now = new Date(iso); };

function built(iso) {
  const g = loadProject({ now: new Date(iso || '2026-10-14T08:00:00Z') }); g.ctx.setup();
  const me = g.state.props.WEBAPP_KEY, partner = g.state.props.PARTNER_KEY;
  g.ctx.saveSetup(me, 'profile', { done: true, minimum: 2, manageable: '3-4', hates: [] });
  g.ctx.saveSetup(partner, 'profile', { done: true, minimum: 2, work: { 1: [540, 1050], 2: [540, 1050], 3: [540, 1050], 4: [540, 1050] } });
  g.ctx.saveSetup(me, 'house', { floors: ['downstairs'], rooms: [{ name: 'Kitchen', floor: 'downstairs' }, { name: 'Bathroom', floor: 'downstairs' }], bins: [], laundryDay: 6, pets: false,
    chores: { dishes: { now: 'daily', goal: 'daily', who: 'whoever' }, bathroom: { now: 'monthly', goal: 'weekly', who: 'whoever' } }, extras: [{ name: 'Make the bed', now: 'daily', goal: 'daily', who: 'me', minutes: 3 }] });
  g.ctx.buildChores(me);
  return { g, C: g.ctx, me, partner };
}
const claude = (g, brief) => { g.state.claudeReply = { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ brief, first: 'Make the bed' }) }] } }; };

test('Brief matches the day: once the day is won the AI is told so, and the brief is rewritten after a job is done', () => {
  const { g, C, me } = built();
  g.state.props.ANTHROPIC_API_KEY = 'k'; C.resetRun_();
  claude(g, 'Start with the bed.');
  let b = plain(C.getBrief(me));
  const sig0 = plain(C.appState(me)).briefSig;
  assert.strictEqual(b.sig, sig0, 'the brief remembers what it was written against');
  assert.strictEqual(plain(C.getBrief(me)).brief, 'Start with the bed.', 'unchanged state: no new brief');
  plain(C.appState(me)).quests.board.filter(q => q.must).forEach(q => C.questDone(me, q.name));
  const s = plain(C.appState(me));
  assert.strictEqual(s.game.win.won, true);
  assert.notStrictEqual(s.briefSig, sig0, 'jobs done change the fingerprint');
  assert.strictEqual(F.briefBehind(b, s), true, 'the phone knows the brief is behind');
  assert.strictEqual(F.briefSig(s), s.briefSig, 'phone and server agree on the fingerprint');
  at(g, '2026-10-14T08:01:30Z');
  claude(g, 'Day won. Enjoy the evening.');
  const n = g.state.claudeRequests.length;
  b = plain(C.getBrief(me));
  assert.strictEqual(b.brief, 'Day won. Enjoy the evening.');
  const prompt = JSON.stringify(g.state.claudeRequests[n].body);
  assert.match(prompt, /ALREADY WON/, 'the AI is told the day is won');
  assert.match(prompt, /Do not suggest more chores/);
  assert.strictEqual(F.briefDue(b, 'morning', b.ts + 1000, 0, F.briefSig(s)), '', 'the new brief matches the screen');
});

test('Brief: a fresh brief isn\'t rewritten for every tap (a minute apart at most)', () => {
  const t0 = 1e12, b = { date: 'd', part: 'morning', brief: 'x', ts: t0, sig: '0|0|0|0' };
  assert.strictEqual(F.briefDue(b, 'morning', t0 + 30000, 0, '1|0|0|0'), '', 'too soon');
  assert.strictEqual(F.briefDue(b, 'morning', t0 + 61000, 0, '1|0|0|0'), 'big');
});

test('Days off: Fri to Sun (or a day you mark) hide the work cards; the gym plan on a day off never uses the after-work bus', () => {
  const { g, C, me, partner } = built('2026-10-16T07:00:00Z');   // Friday
  C.dailyRun();
  let s = plain(C.appState(me));
  assert.strictEqual(s.work.off, true, 'Friday is a day off');
  assert.ok(s.today.gym === null || s.today.gym.dayOff, 'gym plan knows it\'s a day off');
  if (s.today.gym) { assert.ok(!/^Leave by 14:59/.test(s.today.gym.plan), s.today.gym.plan); assert.strictEqual(s.today.gym.noDaytime, true); }
  // Yaz works Mon-Thu (from setup): Friday is her day off too; a Thursday isn't
  assert.strictEqual(plain(C.appState(partner)).work.off, true);
  s = plain(C.setDayOff(me, false));
  assert.strictEqual(s.work.off, false, 'marked as a work day after all');
  at(g, '2026-10-15T07:00:00Z'); C.resetRun_();
  assert.strictEqual(plain(C.appState(me)).work.off, false, 'Thursday is a work day');
  s = plain(C.setDayOff(me, true));
  assert.strictEqual(s.work.off, true, 'and can be marked off');
  assert.strictEqual(plain(C.appState(partner)).work.off, false, 'marking yours doesn\'t change Yaz\'s');
});

test('Day off: picking a different time re-plans the gym and is remembered', () => {
  const { g, C, me } = built('2026-10-16T07:00:00Z');
  C.dailyRun();
  const s = plain(C.setDayOffLeave(me, '10:30'));
  assert.strictEqual(C.readConfig_().settings['Day off: leave around'], '10:30');
  if (s.today.gym) assert.strictEqual(s.today.gym.leaveAround, '10:30');
  assert.throws(() => C.setDayOffLeave(me, '03:00'), /between/);
});
