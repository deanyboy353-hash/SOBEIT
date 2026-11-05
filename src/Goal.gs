/**
 * Goal.gs: the weight-loss goal. At least 0.5 kg a week from 17 Oct 2026, through Christmas and on to the end of March.
 *
 * How the numbers work:
 *   Trend      a smoothed weight (each weigh-in moves it 10% of the way), so a salty day or a big shop doesn't matter.
 *   Burn       what you burn in a day. It starts from your weight (32 kcal a kg) and learns from your own logs: the food
 *              you logged over the last four weeks against how the trend moved (7,700 kcal is about 1 kg).
 *   Week       the budget is set per week: 7 × burn, minus the weekly deficit (aim 0.6 kg, so a loose day still clears
 *              the 0.5 kg minimum). The social day gets your burn (maintenance); the other six share the rest, a little
 *              more on gym days and a little less on rest days. Never below 1,700 a day: if it would be, steps make up
 *              the gap instead. Over or under on a day spreads across the rest of the week (at most 250 a day).
 *   Behind     if the trend has lost under 0.5 kg a week over the last fortnight, it's a push week: 100 less a day
 *              and 2,000 more steps, until it's back on pace.
 *
 * The scale is optional (scale: 'quiet', the default): no weigh-in nags, and progress is counted from what you log (days on plan,
 * your streak, and kg off on paper from the logged deficit), so a water or creatine jump on the scales can't undo a good week.
 * After a consistent fortnight it suggests a check-in weigh. scale: 'daily' brings back daily weigh-ins, the trend line and push weeks.
 *
 * Stored in Script Properties (GOAL); weights in the Weight tab, food in the Food tab. Nothing here writes to either.
 */

var GOAL_DEFAULT = { on: true, scale: 'quiet', start: '2026-10-17', milestone: '2026-12-25', milestoneName: 'Christmas', end: '2027-03-31', endName: 'end of March', minRate: 0.5, rate: 0.6, social: 6, why: '', startKg: null };
var KCAL_PER_KG = 7700, GOAL_FLOOR = 1700, KCAL_PER_STEP = 0.05, GOAL_STEPS = { gym: 7500, rest: 10000, social: 9000 };
var DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function goal_() {
  try { if (!health_('me').on) return null; } catch (e) { /* setup not loaded */ }   // health and fitness off: no goal, no nags
  var g = JSON.parse(prop_('GOAL') || 'null');
  return g && g.on !== false ? Object.assign({}, GOAL_DEFAULT, g) : null;
}

/** The goal is on and the scale is optional: no weigh-in days, alerts or calendar events. */
function scaleQuiet_() { var g = goal_(); return !!g && g.scale !== 'daily'; }

/** Once: switch the goal on, starting from the weight logged nearest to (on or before) the start date. */
function ensureGoal_() {
  if (prop_('GOAL_V1')) return;
  if (!prop_('GOAL')) setProp_('GOAL', JSON.stringify({ on: true }));
  setProp_('GOAL_V1', '1');
}

/** [[ymd, kg]] oldest first: the Weight tab (the last weigh-in of each day), plus scale weights synced from the phone on other days. */
function weights_() {
  var by = {};
  try { healthRows_('me', '0000', '9999').forEach(function (r) { try { var w = Number(JSON.parse(String(r['Detail'] || '{}')).w); if (w > 30 && w < 300) by[String(r['Date'])] = w; } catch (e) { /* no detail */ } }); } catch (e) { /* no Health tab */ }
  rowsBetween_('weight', '0000', '9999').forEach(function (r) { var kg = Number(r['Weight (kg)']); if (kg > 30 && kg < 300) by[String(r['Date'])] = kg; });
  return Object.keys(by).sort().map(function (d) { return [d, by[d]]; });
}

/** Pure: the smoothed trend for every day from the first weigh-in to `to`. [[ymd, kg]] */
function trendSeries(points, to) {
  if (!points || !points.length) return [];
  var by = {}, out = [], t = points[0][1];
  points.forEach(function (p) { by[p[0]] = p[1]; });
  for (var d = points[0][0]; d <= to; d = addDays_(d, 1)) {
    if (by[d] !== undefined) t = t + 0.1 * (by[d] - t);
    out.push([d, Math.round(t * 100) / 100]);
  }
  return out;
}

/**
 * Pure: what you burn a day. prior: the starting guess. days: [{ kcal (null when not properly logged), trend }], oldest first.
 * Needs 10 properly logged days to start learning, and trusts the logs fully at 21.
 */
function burnEstimate(prior, days) {
  var logged = days.filter(function (d) { return d.kcal !== null && d.kcal !== undefined; });
  if (logged.length < 8 || days.length < 11) return { kcal: Math.round(prior / 10) * 10, learned: 0, logged: logged.length };
  var avg = logged.reduce(function (a, d) { return a + d.kcal; }, 0) / logged.length;
  var slope = (days[days.length - 1].trend - days[0].trend) / (days.length - 1);   // kg a day (negative when losing)
  var seen = avg - slope * KCAL_PER_KG, w = Math.min(1, logged.length / 21);
  var est = prior * (1 - w) + seen * w;
  est = Math.max(prior - 700, Math.min(prior + 700, est));
  est = Math.max(1600, Math.min(4200, est));
  return { kcal: Math.round(est / 10) * 10, learned: Math.round(w * 100), logged: logged.length, seen: Math.round(seen) };
}

/**
 * Pure: the week's plan and today's target.
 * o = { burn, rate, social (0-6), gym: [dows], floor, push (bool), today (ymd), week: [{ ymd, dow, logged (kcal or null) }] Mon..Sun }
 * -> { type, kcal, planned, adjust, steps, weekly, days: [{ ymd, dow, type, planned, logged }], over (kcal over so far this week, before today) }
 */
function goalDayPlan(o) {
  var floor = o.floor || GOAL_FLOOR, push = o.push ? 100 : 0;
  var weekly = Math.round(7 * o.burn - o.rate * KCAL_PER_KG) - push * 6;
  var social = Math.max(floor, Math.min(o.burn, weekly - 6 * floor));   // a tight week shrinks the social day, never below the floor
  var others = weekly - social, nonSocial = o.week.filter(function (d) { return d.dow !== o.social; });
  var nG = nonSocial.filter(function (d) { return o.gym.indexOf(d.dow) !== -1; }).length, nR = nonSocial.length - nG;
  var base = others / Math.max(1, nonSocial.length), up = nG && nR ? 120 : 0, down = nR ? up * nG / nR : 0;
  var days = o.week.map(function (d) {
    var type = d.dow === o.social ? 'social' : o.gym.indexOf(d.dow) !== -1 ? 'gym' : 'rest';
    var kcal = type === 'social' ? social : type === 'gym' ? base + up : base - down, extraSteps = 0;
    if (type !== 'social' && kcal < floor) { extraSteps = (floor - kcal) / KCAL_PER_STEP; kcal = floor; }
    var steps = GOAL_STEPS[type] + (push ? 2000 : 0) + Math.ceil(extraSteps / 500) * 500;
    return { ymd: d.ymd, dow: d.dow, type: type, planned: Math.round(kcal / 10) * 10, steps: steps, logged: d.logged };
  });
  var past = days.filter(function (d) { return d.ymd < o.today; }), left = days.filter(function (d) { return d.ymd >= o.today; }).length || 1;
  var over = past.reduce(function (a, d) { return a + (d.logged === null || d.logged === undefined ? 0 : d.logged - d.planned); }, 0);
  var me = days.filter(function (d) { return d.ymd === o.today; })[0] || days[0];
  var adjust = me.type === 'social' ? 0 : Math.max(-250, Math.min(250, -over / left));
  var kcal = Math.max(me.type === 'social' ? 0 : floor, Math.round((me.planned + adjust) / 10) * 10);
  return { type: me.type, kcal: kcal, planned: me.planned, adjust: kcal - me.planned, steps: me.steps, weekly: weekly, days: days, over: Math.round(over) };
}

/**
 * Pure: how consistent you've been, from what you logged. o = { start, today, burn, rate, social, gym, logs: { ymd: kcal|null } }
 * A day is on plan when it was properly logged and within 100 kcal of its target (300 on the social day).
 * -> { days: [{ ymd, status: 'on'|'over'|'none' }], streak, on14, logged14, paperKg, week: { on, past }, lastWeek: { on, logged, paperKg } }
 */
function goalConsistency(o) {
  var out = [], mon = function (d) { return addDays_(d, -((dayOfWeek_(d) + 6) % 7)); }, paper = 0, lastWeek = { on: 0, logged: 0, paperKg: 0 }, thisMon = mon(o.today);
  for (var m = mon(o.start); m <= thisMon; m = addDays_(m, 7)) {
    var week = [];
    for (var i = 0; i < 7; i++) { var d = addDays_(m, i); week.push({ ymd: d, dow: dayOfWeek_(d), logged: o.logs[d] === undefined ? null : o.logs[d] }); }
    goalDayPlan({ burn: o.burn, rate: o.rate, social: o.social, gym: o.gym, today: m, week: week }).days.forEach(function (x) {
      if (x.ymd < o.start || x.ymd >= o.today) return;
      var st = x.logged === null || x.logged === undefined ? 'none' : x.logged <= x.planned + (x.type === 'social' ? 300 : 100) ? 'on' : 'over';
      if (st !== 'none') paper += (o.burn - x.logged) / KCAL_PER_KG;
      out.push({ ymd: x.ymd, status: st });
      if (m === addDays_(thisMon, -7)) { if (st === 'on') lastWeek.on++; if (st !== 'none') { lastWeek.logged++; lastWeek.paperKg += (o.burn - x.logged) / KCAL_PER_KG; } }
    });
  }
  var streak = 0;
  for (var k = out.length - 1; k >= 0 && out[k].status === 'on'; k--) streak++;
  var last14 = out.slice(-14), thisWeek = out.filter(function (x) { return x.ymd >= thisMon; });
  lastWeek.paperKg = Math.round(lastWeek.paperKg * 10) / 10;
  return { days: out, streak: streak, on14: last14.filter(function (x) { return x.status === 'on'; }).length, logged14: last14.filter(function (x) { return x.status !== 'none'; }).length,
    paperKg: Math.round(paper * 10) / 10, week: { on: thisWeek.filter(function (x) { return x.status === 'on'; }).length, past: thisWeek.length }, lastWeek: lastWeek };
}

/** A day's food, if it was properly logged (2+ entries and 900+ kcal), else null. { ymd: kcal } */
function loggedDays_(from, to) {
  var by = {};
  rowsBetween_('food', from, to).forEach(function (r) { var d = String(r['Date']); by[d] = by[d] || { n: 0, kcal: 0 }; by[d].n++; by[d].kcal += Number(r['kcal']) || 0; });
  var out = {};
  Object.keys(by).forEach(function (d) { out[d] = by[d].n >= 2 && by[d].kcal >= 900 ? Math.round(by[d].kcal) : null; });
  return out;
}

/** Everything about the goal for a day: targets, trend, pace and the chart. Null when the goal is off. */
function goalState_(ymd) {
  var g = goal_(); if (!g) return null;
  ymd = ymd || todayYmd_();
  var pts = weights_(), series = trendSeries(pts, ymd), tAt = {};
  series.forEach(function (p) { tAt[p[0]] = p[1]; });
  var nowKg = series.length ? series[series.length - 1][1] : null;
  // the start: the trend on the start date (or the first weigh-in after it, if none before), kept once there is one
  if (!g.startKg && pts.length) {
    var before = pts.filter(function (p) { return p[0] <= g.start; }).length, after = pts.filter(function (p) { return p[0] >= g.start; })[0];
    g.startKg = before && tAt[g.start] !== undefined ? Math.round(tAt[g.start] * 10) / 10 : (after || pts[pts.length - 1])[1];
    var saved = JSON.parse(prop_('GOAL') || '{}'); saved.startKg = g.startKg; setProp_('GOAL', JSON.stringify(saved));
  }
  var weeks = function (d) { return Math.max(0, (Date.parse(d + 'T12:00:00Z') - Date.parse(g.start + 'T12:00:00Z')) / (7 * 864e5)); };
  var minLine = function (d) { return g.startKg === null ? null : Math.round((g.startKg - g.minRate * weeks(d)) * 10) / 10; };
  var aimLine = function (d) { return g.startKg === null ? null : Math.round((g.startKg - g.rate * weeks(d)) * 10) / 10; };
  // what you burn, learned from the last four weeks (to yesterday)
  // only between two real weigh-ins at least 10 days apart: between weigh-ins the trend is flat, which would read as "no loss"
  var from = addDays_(ymd, -28), logs = loggedDays_(from, addDays_(ymd, -1)), days = [];
  var real = pts.filter(function (p) { return p[0] >= from && p[0] < ymd; }), w1 = real[0], w2 = real[real.length - 1];
  if (w1 && w2 && Date.parse(w2[0]) - Date.parse(w1[0]) >= 10 * 864e5) {
    for (var d = w1[0]; d <= w2[0]; d = addDays_(d, 1)) days.push({ kcal: logs[d] === undefined ? null : logs[d], trend: tAt[d] });
  }
  var burn = burnEstimate(Math.round((nowKg || g.startKg || 85) * 32), days);
  // pace: the last fortnight of the trend
  var ago = tAt[addDays_(ymd, -14)], recent = ago !== undefined && nowKg !== null ? Math.round((ago - nowKg) / 2 * 100) / 100 : null;
  var quiet = g.scale !== 'daily';
  var push = !quiet && recent !== null && ymd >= addDays_(g.start, 14) && recent < g.minRate;   // only when you've chosen to follow the scale
  // the week, Monday to Sunday
  var cfg = readConfig_(), mon = addDays_(ymd, -((dayOfWeek_(ymd) + 6) % 7)), wk = loggedDays_(mon, addDays_(mon, 6)), week = [];
  for (var i = 0; i < 7; i++) { var wd = addDays_(mon, i); week.push({ ymd: wd, dow: dayOfWeek_(wd), logged: wd < ymd && wk[wd] !== undefined ? wk[wd] : null }); }
  var gymDays = Object.keys(cfg.schedule).filter(function (k) { return cfg.schedule[k].train; }).map(Number);
  var today = goalDayPlan({ burn: burn.kcal, rate: g.rate, social: g.social, gym: gymDays, push: push, today: ymd, week: week });
  try { if (todaySession_(ymd) && today.type === 'rest') { today = goalDayPlan({ burn: burn.kcal, rate: g.rate, social: g.social, gym: gymDays.concat([dayOfWeek_(ymd)]), push: push, today: ymd, week: week }); } } catch (e) { /* no gym plan */ }
  var behind = !quiet && nowKg !== null && g.startKg !== null ? Math.round((nowKg - minLine(ymd)) * 10) / 10 : null;
  // consistency: what you logged since the start, against each day's plan
  var since = g.start < ymd ? loggedDays_(g.start, addDays_(ymd, -1)) : {};
  var cons = goalConsistency({ start: g.start, today: ymd, burn: burn.kcal, rate: g.rate, social: g.social, gym: gymDays, logs: since });
  var lastW = pts.length ? pts[pts.length - 1] : null, sinceWeigh = lastW ? Math.round((Date.parse(ymd) - Date.parse(lastW[0])) / 864e5) : null;
  var base = g.startKg !== null ? g.startKg : lastW ? lastW[1] : null, paperLine = [], run = 0;
  if (base !== null) { paperLine.push([g.start, base]); cons.days.forEach(function (x) { if (x.status !== 'none') run += (burn.kcal - since[x.ymd]) / KCAL_PER_KG; paperLine.push([addDays_(x.ymd, 1), Math.round((base - run) * 100) / 100]); }); }
  var proj = function (d) { return nowKg === null || recent === null ? null : Math.round((nowKg - recent * (Date.parse(d + 'T12:00:00Z') - Date.parse(ymd + 'T12:00:00Z')) / (7 * 864e5)) * 10) / 10; };
  return {
    start: g.start, startKg: g.startKg, why: g.why, rate: g.rate, minRate: g.minRate, social: g.social, socialName: DAY_NAMES_LONG[g.social],
    scale: quiet ? 'quiet' : 'daily', consistency: cons, lastWeigh: lastW ? { date: lastW[0], kg: lastW[1], days: sinceWeigh } : null,
    checkin: quiet && cons.on14 >= 10 && (sinceWeigh === null || sinceWeigh >= 14),
    now: nowKg, lost: nowKg !== null && g.startKg !== null ? Math.round((g.startKg - nowKg) * 10) / 10 : null, recent: recent, push: push, behind: behind,
    milestone: { date: g.milestone, name: g.milestoneName, kg: minLine(g.milestone), aim: aimLine(g.milestone), projected: proj(g.milestone), weeksLeft: Math.max(0, Math.ceil((Date.parse(g.milestone) - Date.parse(ymd)) / (7 * 864e5))) },
    end: { date: g.end, name: g.endName, kg: minLine(g.end), aim: aimLine(g.end), projected: proj(g.end) },
    burn: burn, today: today,
    weekEaten: today.days.reduce(function (a, x) { return a + (x.logged || 0); }, 0),
    chart: { weights: pts.filter(function (p) { return p[0] >= addDays_(g.start, -14); }), trend: series.filter(function (p) { return p[0] >= addDays_(g.start, -14); }), paper: paperLine }
  };
}

/** goalState_ for today, worked out once per run (reads several tabs). */
var goalRun_ = null;
function goalCached_() {
  // today's targets only depend on earlier days, so the day's plan is kept (script cache, 6 hours) until a new weight comes in
  var ymd = todayYmd_(), stamp = 'goal1|' + ymd + '|' + vals_('weight').length + '|' + (prop_('GOAL') || '').length + '|' + String(prop_('GOAL') || '').slice(-60);
  if (goalRun_ && goalRun_.stamp === stamp) return goalRun_.gs;
  var cache = null, gs;
  try { cache = CacheService.getScriptCache(); var hit = cache.get(stamp.replace(/[^\w|.-]/g, '').slice(0, 240)); if (hit) gs = JSON.parse(hit); } catch (e) { cache = null; }
  if (gs === undefined) {
    gs = goalState_(ymd);
    try { var txt = JSON.stringify(gs); if (cache && txt.length < 90000) cache.put(stamp.replace(/[^\w|.-]/g, '').slice(0, 240), txt, 21600); } catch (e) { /* too big or no cache: fine */ }
  }
  goalRun_ = { stamp: stamp, gs: gs };
  return gs;
}

/** Change the goal from the app: social day, reason, pace (0.5 to 1 kg a week), or off. */
function setGoal(key, ch) {
  var who = who_(key); if (who !== 'me') throw new Error('The goal is Dean\'s.');
  ch = ch || {};
  return withLock_(function () {
    var g = JSON.parse(prop_('GOAL') || '{}');
    if (ch.social !== undefined) { var s = Number(ch.social); if (!(s >= 0 && s <= 6)) throw new Error('Pick a day for the social day.'); g.social = s; }
    if (ch.why !== undefined) g.why = String(ch.why).trim().slice(0, 200);
    if (ch.rate !== undefined) { var r = Math.round(Number(ch.rate) * 10) / 10; if (!(r >= 0.5 && r <= 1)) throw new Error('Pick a pace from 0.5 to 1 kg a week.'); g.rate = r; }
    if (ch.on !== undefined) g.on = !!ch.on;
    if (ch.scale !== undefined) g.scale = ch.scale === 'daily' ? 'daily' : 'quiet';
    setProp_('GOAL', JSON.stringify(g));
    return appState_('me');
  });
}

// ---------- reminders ----------

var GOAL_EVENING = [
  'Log tonight\'s food: {left}. {why}',
  'Three things logged makes today count. {left}.',
  'Rough numbers beat no numbers. {left}.',
  '{goal}. Log what you ate.',
  'Nothing logged since earlier. {left}. {why}'
];

/**
 * Pure: the goal's pushes due now. c = { m, dow, wake, weighed, weighDay, entries, kcal, protein, t: goalState_.today, steps,
 * proteinMin, socialYesterday, why, goalLine, weekLine, behindLine } -> [{ id, title, body, tab, persist }]
 */
function goalAlerts(c) {
  var out = [], at = function (x) { return c.m >= x && c.m < x + 25; };
  var left = c.kcal <= c.t.kcal ? (c.t.kcal - c.kcal) + ' kcal left today' : (c.kcal - c.t.kcal) + ' kcal over today';
  var why = c.why ? 'Why: ' + c.why + '.' : c.goalLine + '.';
  var fill = function (s) { return s.replace('{left}', left).replace('{why}', why).replace('{goal}', c.goalLine); };
  if (c.scale === 'daily' && !c.weighed && !c.weighDay && at(c.wake + 20)) out.push({ id: 'gweigh', title: 'Weigh in', body: 'Loo, scales, then log it. The trend needs the daily numbers. ' + c.goalLine + '.', tab: 'home' });
  if (c.scale === 'daily' && !c.weighed && at(c.wake + 150)) out.push({ id: 'gweigh2', title: 'Still no weigh-in', body: 'Ten seconds. Scales, then log it on Home.', tab: 'home' });
  // the scale is optional: after a consistent fortnight, one gentle Sunday suggestion
  if (c.checkin && !c.weighed && c.dow === 0 && at(c.wake + 45)) out.push({ id: 'gcheckin', title: 'Good time for a check-in weigh', body: c.checkinLine, tab: 'home' });
  if (c.t.type === 'social' && at(c.wake + 30)) out.push({ id: 'gsocial', title: 'Social day: up to ' + c.t.kcal.toLocaleString('en-GB') + ' kcal', body: 'Protein early, a pint of water between drinks, and log it all anyway. A logged social day is a planned one.', tab: 'food' });
  if (c.socialYesterday && at(c.wake + 30)) out.push({ id: 'gback', title: 'Back on plan: ' + c.t.kcal.toLocaleString('en-GB') + ' kcal', body: 'Yesterday was the social day. Today counts double for the trend. ' + why, tab: 'food' });
  if (c.weekLine && c.dow === 1 && at(c.wake + 60)) out.push({ id: 'gweek', title: 'Week check', body: c.weekLine, tab: 'food' });
  if (c.behindLine && c.dow === 4 && at(12 * 60)) out.push({ id: 'gbehind', title: c.scale === 'daily' ? 'Behind pace' : 'Back on it today', body: c.behindLine, tab: 'food' });
  if (c.entries === 0 && at(10 * 60 + 30)) out.push({ id: 'gbreak', title: 'Breakfast logged?', body: c.t.kcal.toLocaleString('en-GB') + ' kcal and ' + c.proteinMin + 'g protein today. Start with protein.', tab: 'food' });
  if (c.entries <= 1 && at(14 * 60)) out.push({ id: 'glunch', title: 'Lunch logged?', body: fill('{left}. Log it while you remember.'), tab: 'food' });
  if (c.kcal > c.t.kcal + 100 && c.m >= 12 * 60) out.push({ id: 'gover', title: (c.kcal - c.t.kcal) + ' kcal over today', body: 'One day doesn\'t undo a week: it\'s spread over the next few days. Stop here, log the rest honestly. A 30-minute walk is about 150.', tab: 'food' });
  if (c.steps !== null && c.steps !== undefined && c.steps < c.t.steps * 0.6 && at(18 * 60)) out.push({ id: 'gsteps', title: (c.t.steps - c.steps).toLocaleString('en-GB') + ' steps to go', body: 'A 25-minute walk is about 3,000. ' + c.goalLine + '.', tab: 'health' });
  // from 8pm, every half hour until three things are logged (quiet hours still apply)
  if (c.entries < 3 && c.m >= 20 * 60 && c.m < 22 * 60 + 30) {
    var slot = Math.floor(c.m / 30);
    out.push({ id: 'geve-' + slot, title: c.entries ? 'Only ' + c.entries + ' thing' + (c.entries === 1 ? '' : 's') + ' logged today' : 'Nothing logged today', body: fill(GOAL_EVENING[slot % GOAL_EVENING.length]), tab: 'food', persist: true });
  }
  return out;
}

/** From the heartbeat (every 10 minutes): sends the goal's pushes once each, outside your quiet hours. */
function goalHeartbeat_(ymd, m, sent) {
  // runs every 5 minutes inside the script lock, so it reads as little as it can: the day's plan is cached,
  // and steps are only read when the 6pm check is due
  if (quietFor_('me', m)) return;
  var gs = goalCached_(); if (!gs) return;
  var cfg = readConfig_(), wake = cellClock_(cfg.settings['Wake time']); if (wake === null) wake = parseClock('08:30');
  var entries = foodEntries_(ymd), tot = sumFood_(entries), steps = null;
  var lw = lastRowObject_('weight'), t = { weighedToday: !!lw && String(lw['Date']) === ymd, weighDay: gs.scale === 'daily' && parseDays(cfg.settings['Weigh-in days']).indexOf(dayOfWeek_(ymd)) !== -1 };
  if (m >= 18 * 60 && m < 18 * 60 + 25 && sent.me.indexOf('gsteps') === -1) { try { var hd = healthState_('me', ymd); steps = hd && hd.hasData && hd.steps > 0 ? hd.steps : null; } catch (e) { /* no health data */ } }
  var goalLine = goalLine_(gs), yest = gs.today.days.filter(function (x) { return x.ymd === addDays_(ymd, -1); })[0];
  var alerts = goalAlerts({
    m: m, dow: dayOfWeek_(ymd), wake: wake, weighed: t.weighedToday, weighDay: t.weighDay, entries: entries.length, kcal: Math.round(tot.kcal), protein: Math.round(tot.protein),
    t: gs.today, steps: steps, proteinMin: foodTargets_(cfg.settings).proteinMin, socialYesterday: !!(yest && yest.type === 'social') || (dayOfWeek_(ymd) === (gs.social + 1) % 7),
    why: gs.why, goalLine: goalLine, weekLine: weekLine_(gs), behindLine: behindLine_(gs), scale: gs.scale, checkin: gs.checkin,
    checkinLine: gs.consistency.on14 + ' of the last 14 days on plan. If you fancy it, weigh in tomorrow morning: loo first, before food. Expect 1 to 2 kg of water and creatine on top; the plan doesn\'t depend on it.'
  });
  alerts.forEach(function (a) {
    if (sent.me.indexOf(a.id) !== -1 || quietFor_('me', m)) return;
    sent.me.push(a.id);
    push_('me', a.title, a.body, a.tab, false, a.persist ? { persist: true, tag: 'goal' } : { tag: 'goal-' + a.id.replace(/-\d+$/, '') });
  });
}

function goalLine_(gs) {
  if (gs.scale !== 'daily') return gs.consistency.streak >= 2 ? gs.consistency.streak + ' days on plan in a row' : 'At least ' + gs.minRate + ' kg a week, one day at a time';
  var kg = gs.milestone.kg;
  return kg ? gs.milestone.kg + ' kg by ' + gs.milestone.name + (gs.now ? ' (trend ' + gs.now + ')' : '') : 'At least ' + gs.minRate + ' kg a week';
}
function weekLine_(gs) {
  var C = gs.consistency, lw = C.lastWeek, kc = gs.today.weekly.toLocaleString('en-GB');
  if (gs.scale !== 'daily') {
    if (!lw.logged) return 'New week: ' + kc + ' kcal to spend, ' + gs.socialName + ' is the social day. Log everything, even the rough days.';
    return 'Last week: ' + lw.on + ' of 7 days on plan' + (lw.paperKg > 0 ? ', about ' + lw.paperKg + ' kg off on paper' : '') + '. ' +
      (lw.on <= 3 ? 'That week\'s done. This one starts from zero: ' : 'Same again: ') + kc + ' kcal this week.';
  }
  if (gs.recent === null || gs.now === null) return 'New week: ' + kc + ' kcal to spend, ' + gs.socialName + ' is the social day. Weigh in daily so the trend can work.';
  return 'Trend ' + gs.now + ' kg, ' + (gs.recent >= 0 ? 'down ' + gs.recent : 'up ' + (-gs.recent)) + ' kg a week lately. ' +
    (gs.behind <= 0 ? 'On pace for ' + gs.milestone.kg + ' kg by ' + gs.milestone.name + '.' : gs.behind + ' kg behind the line: push week, ' + gs.today.kcal.toLocaleString('en-GB') + ' kcal and ' + gs.today.steps.toLocaleString('en-GB') + ' steps.') +
    ' This week: ' + kc + ' kcal.';
}
/** Thursday's nudge: a slipping week (quiet scale) or behind the line (daily scale); '' when there's nothing to say. */
function behindLine_(gs) {
  var C = gs.consistency, today = gs.today.kcal.toLocaleString('en-GB');
  if (gs.scale !== 'daily') return C.week.past >= 2 && C.week.on < C.week.past - 1 ? 'This week so far: ' + C.week.on + ' of ' + C.week.past + ' days on plan. Nothing to make up, just make today a clean one: ' + today + ' kcal.' + (gs.why ? ' ' + gs.why + '.' : '') : '';
  if (!(gs.behind > 0.2)) return '';
  return gs.behind + ' kg behind the ' + gs.minRate + ' kg-a-week line. Today: ' + today + ' kcal and ' + gs.today.steps.toLocaleString('en-GB') + ' steps gets it back.' + (gs.why ? ' Why: ' + gs.why + '.' : '');
}
