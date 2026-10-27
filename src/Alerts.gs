/**
 * Alerts.gs: phone pushes at the moments that matter, alongside the calendar alerts.
 * Leave-by on gym days, weigh-in at wake time, the three meal nudges (10–11, 2–3pm, 7–8pm, only if
 * nothing's been logged for that meal), the evening food check, and bins the evening before collection.
 * Each fires once a day, within 20 minutes of its time (the trigger runs every 10).
 * They're times you set yourself, so quiet hours don't block them.
 */

// Meal nudges: [id, from, to (minutes), logged since (minutes), title, body]. Each goes once, in its hour, if nothing's been logged since `since`.
var MEAL_NUDGES = [
  ['meal1', 10 * 60, 11 * 60, 0, 'Breakfast?', 'Something with protein sets up the rest of the day: eggs, yoghurt or a shake.'],
  ['meal2', 14 * 60, 15 * 60, 11 * 60 + 30, 'Lunchtime?', 'Fancy some food? Something with protein keeps the afternoon steady.'],
  ['meal3', 19 * 60, 20 * 60, 16 * 60, 'Time for tea?', 'Some protein and some veg, and the day\'s food is sorted.']
];
/** Pure: which alerts are due now. c = { m, gym, weighDay, weighed, wake, food, foodAt, bins } -> [{ who, id, title, body, tab }] */
function dueAlerts(c) {
  var out = [], near = function (at) { return at !== null && at !== undefined && c.m >= at && c.m < at + 20; };
  var g = c.gym;
  if (g && !g.done && g.leaveAt !== null && near(g.leaveAt - 15)) {
    out.push({ who: 'me', id: 'leave', title: 'Leave in 15 min for ' + g.session, body: (g.travel === 'Bike' ? 'E-bike' : g.bus ? 'Bus ' + g.bus : 'Head off') + ' · out the door by ' + formatClock(g.leaveAt) + '.', tab: 'train' });
  }
  if (c.weighDay && !c.weighed && near(c.wake)) out.push({ who: 'me', id: 'weigh', title: 'Weigh-in day', body: 'Loo first, then scales, before food or drink. Tap to log it.', tab: 'home' });
  var f = c.food;
  if (f) MEAL_NUDGES.forEach(function (n) { if (c.m >= n[1] && c.m < n[2] && !(f.lastAt !== null && f.lastAt !== undefined && f.lastAt >= n[3])) out.push({ who: 'me', id: n[0], title: n[4], body: n[5], tab: 'food' }); });
  if (f && near(c.foodAt)) {
    var kl = f.kcalTarget - f.kcal, pl = f.proteinMin - f.protein;
    out.push({ who: 'me', id: 'foodcheck', title: f.entries ? (pl > 0 ? pl + 'g protein to go' : 'Protein done') + ' · ' + (kl >= 0 ? kl + ' kcal left' : -kl + ' kcal over') : 'Fancy logging today?',
      body: f.entries ? (pl > 0 ? 'A shake or yoghurt before bed would close the gap.' : 'Nice. Add anything else you had.') : 'A rough guess is plenty. It helps tomorrow\'s numbers.', tab: 'food' });
  }
  Object.keys(c.bins || {}).forEach(function (who) {
    var b = c.bins[who];
    if (b && b.length && near(19 * 60)) out.push({ who: who, id: 'bins', title: 'Bins out tonight', body: b.join(', ').replace(/Bins out: /g, '') + ' collected tomorrow.', tab: 'chores' });
  });
  return out;
}

/** Gathers today's numbers and sends whatever is due (once each per day). */
function alertsHeartbeat_(ymd, m, sent) {
  var c = { m: m, bins: {} };
  try {
    var t = todayState_(), cfg = readConfig_();
    c.gym = t.gym ? { session: t.gym.session, done: t.gym.done, travel: t.gym.travel, bus: t.gym.bus, leaveAt: t.gym.leaveAt ? parseClock(t.gym.leaveAt) : null } : null;
    c.weighDay = t.weighDay; c.weighed = t.weighedToday;
    c.wake = cellClock_(cfg.settings['Wake time']); if (c.wake === null) c.wake = parseClock('08:30');
    var entries = foodEntries_(ymd), tot = sumFood_(entries), tg = foodTargets_(cfg.settings);
    var lastAt = entries.reduce(function (a, e) { var t = parseClock(String(e.time || '')); return t !== null && (a === null || t > a) ? t : a; }, null);
    c.food = { entries: entries.length, kcal: Math.round(tot.kcal), protein: Math.round(tot.protein), kcalTarget: tg.kcal, proteinMin: tg.proteinMin, lastAt: lastAt };
    c.foodAt = cellClock_(cfg.settings['Evening food check']); if (c.foodAt === null) c.foodAt = parseClock('23:00');
  } catch (e) { log_('WARN', 'Alerts: ' + e); }
  try {
    if (setupOn_()) {
      var plan = cpToday_(), st = cpState_(ymd), name = {};
      st.chores.forEach(function (ch) { name[ch.id] = ch.name; });
      PEOPLE.forEach(function (w) { c.bins[w] = plan[w].must.concat(plan[w].bonus).filter(function (id) { return /^Bins out/i.test(name[id] || '') && !st.done[ymd + '|' + id]; }).map(function (id) { return name[id]; }); });
    }
  } catch (e) { /* no chore plan yet */ }
  try { if (!health_('me').on) { c.gym = null; c.weighDay = false; c.food = null; } } catch (e) { /* setup not loaded */ }
  dueAlerts(c).forEach(function (a) {
    if (sent[a.who].indexOf(a.id) !== -1) return;
    sent[a.who].push(a.id);
    push_(a.who, a.title, a.body, a.tab, a.id === 'leave', { tag: 'alert-' + a.id });
  });
}
