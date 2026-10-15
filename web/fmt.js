/* Nudge · fmt.js: small pure formatters shared by the app and the tests. */
(function (root) {
  'use strict';
  /** The XP ring's text: under the goal "12" / "of 30 XP"; at or past it "Goal hit" / "45 XP today". */
  function xpGoal(xp, goal) {
    xp = Math.max(0, Math.round(Number(xp) || 0)); goal = Math.max(1, Math.round(Number(goal) || 1));
    return xp >= goal ? { hit: true, big: 'Goal hit', small: xp + ' XP today', label: 'Goal hit · ' + xp + ' XP' } : { hit: false, big: String(xp), small: 'of ' + goal + ' XP', label: xp + ' of ' + goal + ' XP' };
  }
  var api = { xpGoal: xpGoal };
  root.NudgeFmt = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
