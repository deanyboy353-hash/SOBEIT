const test = require('node:test');
const assert = require('node:assert');
const { loadProject } = require('./fakes');

function ready() {
  const g = loadProject({ now: new Date('2026-10-13T05:30:00Z') });
  g.ctx.setup();
  g.state.props.ANTHROPIC_API_KEY = 'sk-ant-secret';
  return { g, key: g.state.props.WEBAPP_KEY, partner: g.state.props.PARTNER_KEY };
}

test('daily backup goes to a separate spreadsheet, once a day, with no secrets, and the live sheet is untouched', () => {
  const { g } = ready();
  const live = JSON.stringify(g.tab('Config').rows());
  assert.match(g.ctx.dailyBackup_('2026-10-14'), /Backed up/);
  assert.match(g.ctx.dailyBackup_('2026-10-14'), /Already/);
  const book = g.state.spreadsheets[0];
  assert.strictEqual(book.getName(), 'Nudge backups');
  assert.notStrictEqual(book.getId(), 'sheet-id');
  const rows = book.getSheetByName('Backups').rows().slice(1);
  const snap = g.ctx.unpackSnapshot_(rows.filter(r => r[0] === '2026-10-14').map(r => r[4]).join(''));
  assert.strictEqual(snap.app, 'Nudge');
  assert.ok(snap.tabs.Config.length > 5);
  assert.ok(!JSON.stringify(snap).includes('sk-ant-secret'), 'API key never in a backup');
  assert.ok(!Object.keys(snap.props).some(k => /KEY/.test(k)));
  assert.strictEqual(JSON.stringify(g.tab('Config').rows()), live);
});

test('keeps the last 14 days of backups', () => {
  const { g } = ready();
  for (let d = 1; d <= 20; d++) g.ctx.dailyBackup_('2026-10-' + String(d).padStart(2, '0'));
  const dates = new Set(g.state.spreadsheets[0].getSheetByName('Backups').rows().slice(1).map(r => r[0]));
  assert.strictEqual(dates.size, 14);
  assert.ok(dates.has('2026-10-20') && !dates.has('2026-10-06'));
});

test('export then import makes a NEW spreadsheet; the live data is never overwritten; partner link cannot export', () => {
  const { g, key, partner } = ready();
  const json = g.ctx.exportAll(key);
  assert.ok(!json.includes('sk-ant-secret'));
  const before = JSON.stringify(g.tab('Food').rows());
  const res = g.ctx.importBackup(key, json);
  assert.match(res.name, /^Nudge restore 2026-10-13/);
  const book = g.state.spreadsheets.find(s => s.getName() === res.name);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(book.getSheetByName('Config').rows())), JSON.parse(json).tabs.Config.map(r => r.map(v => v)));
  assert.strictEqual(JSON.stringify(g.tab('Food').rows()), before);
  assert.throws(() => g.ctx.importBackup(key, '{"hello":1}'), /isn't a Nudge backup/);
  assert.throws(() => g.ctx.importBackup(key, 'nope'), /isn't a Nudge backup/);
  assert.throws(() => g.ctx.exportAll(partner), /out of date/);
});
