const test = require('node:test');
const assert = require('node:assert');
const F = require('../web/fmt.js');

test('XP ring: under the goal shows "x of goal"; at or past it shows "Goal hit", never "45 of 30"', () => {
  assert.deepStrictEqual(F.xpGoal(12, 30), { hit: false, big: '12', small: 'of 30 XP', label: '12 of 30 XP' });
  assert.deepStrictEqual(F.xpGoal(30, 30), { hit: true, big: 'Goal hit', small: '30 XP today', label: 'Goal hit · 30 XP' });
  assert.strictEqual(F.xpGoal(45, 30).label, 'Goal hit · 45 XP');
  assert.ok(!/45 of 30/.test(JSON.stringify(F.xpGoal(45, 30))));
  assert.strictEqual(F.xpGoal(-3, 30).big, '0');
});
