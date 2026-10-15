/**
 * ChorePlan.gs: the chore schedule engine (pure: no Sheets, no clocks; tested in Node).
 *
 * Setup answers -> a chore list (cpBuildChores), each chore with how often it's done now and how often you'd like.
 * Frequencies ramp gently from "now" towards "goal" over about 3 weeks (cpEvery).
 * Each day, each person gets a short MINIMUM (must-do, 10 minutes or less each) and optional BONUS jobs (cpPlanDay).
 * Hitting the minimum makes the day a win. Missed jobs roll over without piling up (cpRollover).
 * Shared work is split fairly between the two of you, rotating where asked and steering away from jobs you hate.
 *
 * Dates are 'YYYY-MM-DD'. Weekdays: 0 Sunday ... 6 Saturday. Minutes of the day: 540 = 09:00.
 * A chore: { id, key, name, area, floor, minutes, every (days, may be 2.5) | days: [weekday...] (+ weeks: 2, anchor),
 *   now, goal (days), rampFrom (date), assign: 'me'|'partner'|'together'|'rotate'|'anyone', tod: 'morning'|'afternoon'|'evening'|'any',
 *   xp, notes, archived, order, after (id of a chore this follows by a day), due, last, lastBy }
 * A person: { work: {weekday: [start, end]}, gym: [weekday...], manageable: '1-2'|'3-4'|'5+', minimum, hates: [key|id], energy }
 */

var CP_FREQ = { daily: 1, few: 2.5, weekly: 7, biweekly: 14, monthly: 30, rarely: 90 };
var CP_FREQ_NAMES = { daily: 'Daily', few: 'A few times a week', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', rarely: 'Rarely' };
var CP_LADDER = [1, 2, 2.5, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60, 90];
var CP_RAMP_WEEKS = 3;        // weeks to go from halfway to the goal
var CP_CARRY_CAP = 2;         // overdue jobs a day can carry; the rest move to the next free day
var CP_SHORT = 10;            // must-do jobs are this many minutes or less
var CP_HEAVY = 20;            // jobs this long or longer never go after 9pm
var CP_LATE = 21 * 60;

// ---------- dates ----------
function cpDayNum(ymd) { var p = String(ymd).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
function cpYmd(n) { var d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
function cpAdd(ymd, n) { return cpYmd(cpDayNum(ymd) + n); }
function cpDiff(a, b) { return cpDayNum(a) - cpDayNum(b); }       // a - b in days
function cpDow(ymd) { return ((cpDayNum(ymd) + 4) % 7 + 7) % 7; }   // 1970-01-01 was a Thursday

// ---------- frequency ----------
/** Nearest step on the ladder (so "every 9.4 days" reads as "every 10 days"). */
function cpSnap(days) {
  var best = CP_LADDER[0];
  CP_LADDER.forEach(function (x) { if (Math.abs(Math.log(x / days)) < Math.abs(Math.log(best / days))) best = x; });
  return best;
}
/** How often (in days) a chore runs on a date: halfway between now and goal at first, reaching the goal after CP_RAMP_WEEKS. Never ramps towards doing it less. */
function cpEvery(c, ymd) {
  if (c.days) return 7 * (c.weeks || 1) / c.days.length;
  var now = c.now || c.goal || c.every || 7, goal = c.goal || now;
  if (goal >= now || !c.rampFrom) return goal;
  var w = Math.max(0, cpDiff(ymd, c.rampFrom)) / 7, f = Math.min(1, 0.5 + 0.5 * w / CP_RAMP_WEEKS);
  return f >= 1 ? goal : cpSnap(now * Math.pow(goal / now, f));
}
function cpEveryText(days) {
  if (days <= 1) return 'Every day';
  if (days === 2.5) return 'A few times a week';
  if (days === 7) return 'Weekly';
  if (days === 14) return 'Every 2 weeks';
  if (days >= 28 && days <= 31) return 'Monthly';
  if (days % 7 === 0) return 'Every ' + days / 7 + ' weeks';
  return 'Every ' + days + ' days';
}
var CP_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function cpFreqText(c, ymd) { return c.days ? (c.weeks === 2 ? 'Every other ' : '') + c.days.map(function (d) { return CP_DAY_NAMES[d]; }).join(' & ') : cpEveryText(cpEvery(c, ymd)); }

/** Is a fixed-day chore on for this date (weekday match, and the right week if every other week)? */
function cpOnDay(c, ymd) {
  if (!c.days || c.days.indexOf(cpDow(ymd)) === -1) return false;
  if (c.weeks === 2 && c.anchor) return Math.floor(Math.abs(cpDiff(ymd, c.anchor)) / 7) % 2 === 0;
  return true;
}
/** The next date on or after `from` that a fixed-day chore runs. */
function cpNextOn(c, from) { for (var i = 0; i < 28; i++) { var d = cpAdd(from, i); if (cpOnDay(c, d)) return d; } return null; }

// ---------- capacity (how much a person can take on a day) ----------
var CP_BASE_MINS = { '1-2': 20, '3-4': 40, '5+': 65 };
var CP_BASE_COUNT = { '1-2': 2, '3-4': 4, '5+': 6 };
function cpWorkMins(p, ymd) { var w = p && p.work && p.work[cpDow(ymd)]; return w ? Math.max(0, w[1] - w[0]) : 0; }
function cpIsGym(p, ymd) { return !!(p && p.gym && p.gym.indexOf(cpDow(ymd)) !== -1); }
/** Minutes of chores that feel fine on this day: lighter on work days and gym days, more on days off. */
function cpCapacity(p, ymd) {
  var base = CP_BASE_MINS[(p && p.manageable) || '3-4'] || 40, w = cpWorkMins(p, ymd);
  var f = w >= 360 ? 0.5 : w > 0 ? 0.7 : 1.4;
  if (cpIsGym(p, ymd)) f *= 0.8;
  return Math.round(base * f);
}
function cpMaxCount(p, ymd) { var n = CP_BASE_COUNT[(p && p.manageable) || '3-4'] || 4; return cpWorkMins(p, ymd) >= 360 ? Math.max(2, n - 1) : n; }
function cpLikes(p, c) { return !!(p && p.likes && (p.likes.indexOf(c.key) !== -1 || p.likes.indexOf(c.id) !== -1)); }
function cpHates(p, c) { return !!(p && p.hates && (p.hates.indexOf(c.key) !== -1 || p.hates.indexOf(c.id) !== -1)); }

// ---------- who does it ----------
function cpOther(who) { return who === 'me' ? 'partner' : 'me'; }
/**
 * Decide who does one run of a chore. loads: { me: share of the week's capacity already planned, partner: ... }.
 * rotate: the other person from last time, unless they hate it (and the other doesn't) or their week is much heavier.
 * anyone: whoever has the lighter week, steering away from a hated job.
 */
function cpWho(c, people, loads) {
  var a = c.assign || 'anyone';
  if (a === 'me' || a === 'partner' || a === 'together') return a;
  loads = loads || { me: 0, partner: 0 };
  var hm = cpHates(people.me, c), hp = cpHates(people.partner, c);
  if (a === 'rotate') {
    var next = c.lastBy === 'me' ? 'partner' : c.lastBy === 'partner' ? 'me' : (c.order || 0) % 2 ? 'partner' : 'me', other = cpOther(next);
    if (cpHates(people[next], c) && !cpHates(people[other], c)) return other;
    if ((loads[next] || 0) > (loads[other] || 0) * 1.5 + 0.15) return other;
    return next;
  }
  if (hm && !hp) return 'partner';
  if (hp && !hm) return 'me';
  var lm = cpLikes(people.me, c), lp = cpLikes(people.partner, c), gap = Math.abs((loads.partner || 0) - (loads.me || 0));
  if (lm !== lp && gap < 0.3) return lm ? 'me' : 'partner';            // whoever doesn't mind it, unless their week is much fuller
  return (loads.partner || 0) < (loads.me || 0) ? 'partner' : 'me';
}

// ---------- the next due date (spread over the week) ----------
/**
 * After a chore is done on `doneOn` (or when it's first set up), when is it next due?
 * Weekly-or-rarer jobs can move a day or two to land on a lighter day, and big jobs prefer days off.
 * load(person, ymd) -> minutes already planned that day (optional).
 */
function cpNextDue(c, doneOn, people, load, who) {
  if (c.days) return cpNextOn(c, cpAdd(doneOn, 1));
  var every = cpEvery(c, doneOn), step = every % 1 ? (cpDayNum(doneOn) % 2 ? Math.ceil(every) : Math.floor(every)) : every, due = cpAdd(doneOn, step);
  if (every < 7 || !people) return due;
  var p = people[who || 'me'] || people.me, best = due, bestScore = -1e9;
  for (var k = -1; k <= 2; k++) {
    var d = cpAdd(due, k); if (cpDiff(d, doneOn) < 1) continue;
    var free = cpCapacity(p, d) - (load ? load(who || 'me', d) : 0);
    var score = free - Math.abs(k) * 3 + (c.minutes >= 25 && !cpWorkMins(p, d) ? 25 : 0) - (c.minutes >= 25 && cpIsGym(p, d) ? 10 : 0);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

// ---------- one day's plan ----------
/**
 * state: { chores, people: { me, partner }, done: { 'ymd|id': who } (jobs done), loads (optional) }
 * Returns { me: { must, bonus, minimum, later }, partner: {...} } where each job is
 * { id, name, minutes, tod, overdue (days), early (pulled forward), who }.
 * minimum: how many jobs make today a win (the person's daily minimum, or fewer if there isn't that much to do).
 */
function cpPlanDay(state, ymd) {
  var people = state.people || {}, out = {}, loads = state.loads || { me: 0, partner: 0 };
  ['me', 'partner'].forEach(function (w) { out[w] = { must: [], bonus: [], later: [], minimum: 0 }; });
  var live = (state.chores || []).filter(function (c) { return !c.archived; });
  var runs = { me: [], partner: [] };
  live.forEach(function (c) {
    var due = cpDueOn(c, ymd, state); if (!due) return;
    var who = c.whoToday || cpWho(c, people, loads);
    var job = { id: c.id, name: c.name, minutes: c.minutes, tod: cpTod(c), overdue: due.overdue, every: cpEvery(c, ymd), fixed: !!c.days, who: who, xp: c.xp };
    (who === 'together' ? ['me', 'partner'] : [who]).forEach(function (w) { if (runs[w] && !(state.done && state.done[ymd + '|' + c.id])) runs[w].push(job); });
  });
  ['me', 'partner'].forEach(function (w) {
    var p = people[w] || {}, list = runs[w];
    // most pressing first: fixed-day jobs (bins), then how late they are for how often they come round
    list.sort(function (a, b) { return (b.fixed - a.fixed) || (b.overdue / b.every - a.overdue / a.every) || (a.minutes - b.minutes) || (a.name < b.name ? -1 : 1); });
    // carry-over cap: only a couple of late, non-urgent jobs today; the rest go to the next free day
    var late = 0, keep = [];
    list.forEach(function (j) { if (j.overdue > 0 && !j.fixed && j.every >= 7) { if (late < CP_CARRY_CAP) { late++; keep.push(j); } else out[w].later.push(j); } else keep.push(j); });
    var minimum = p.minimum === undefined ? 2 : Math.max(0, Number(p.minimum) || 0);
    // must-dos, in this order: short everyday house jobs due today; a short everyday job pulled forward from the next 3 days;
    // then rare short jobs (a yearly "book the boiler service"); then the shortest of whatever's left
    var isShort = function (j) { return j.minutes <= CP_SHORT; }, common = function (j) { return j.every <= 45; };
    var must = keep.filter(function (j) { return isShort(j) && common(j); }).slice(0, minimum);
    if (must.length < minimum) cpUpcoming(state, ymd, w, 3).filter(function (j) { return isShort(j) && common(j) && !must.some(function (m) { return m.id === j.id; }); }).slice(0, minimum - must.length).forEach(function (j) { j.early = true; must.push(j); });
    if (must.length < minimum) must = must.concat(keep.filter(function (j) { return isShort(j) && must.indexOf(j) === -1; }).slice(0, minimum - must.length));
    if (must.length < minimum) must = must.concat(keep.filter(function (j) { return must.indexOf(j) === -1; }).sort(function (a, b) { return a.minutes - b.minutes; }).slice(0, minimum - must.length));
    var rest = keep.filter(function (j) { return must.indexOf(j) === -1; }), cap = cpCapacity(p, ymd), used = must.reduce(function (s, j) { return s + j.minutes; }, 0), maxN = cpMaxCount(p, ymd);
    rest.forEach(function (j) {
      var urgent = j.fixed || j.every < 7;
      if (urgent || (must.length + out[w].bonus.length < maxN && used + j.minutes <= cap)) { out[w].bonus.push(j); used += j.minutes; }
      else out[w].later.push(j);
    });
    out[w].must = must; out[w].minimum = must.length; out[w].mins = used; out[w].capacity = cap;
  });
  return out;
}
/** Is chore c due on ymd? -> { overdue: days late } or null. */
function cpDueOn(c, ymd, state) {
  if (c.archived) return null;
  if (c.after) {
    var lead = (state.chores || []).filter(function (x) { return x.id === c.after; })[0];
    if (!lead || !lead.last || (c.last && c.last >= lead.last)) return null;
    var d0 = cpAdd(lead.last, 1); return cpDiff(ymd, d0) >= 0 ? { overdue: cpDiff(ymd, d0) } : null;
  }
  if (c.days) return cpOnDay(c, ymd) ? { overdue: 0 } : null;   // a missed bin day isn't carried: the next one comes round
  if (!c.due) return null;
  var late = cpDiff(ymd, c.due);
  if (late < 0) return null;
  return { overdue: cpEvery(c, ymd) <= 2 ? 0 : late };            // daily-ish jobs never pile up: just today's
}
function cpTod(c) {
  var t = c.tod || 'any';
  if (t === 'evening' && c.minutes >= CP_HEAVY) t = 'afternoon';   // nothing heavy late at night
  return t;
}
/** Jobs coming up for a person in the next n days (to pull forward a short one). */
function cpUpcoming(state, ymd, who, n) {
  var out = [];
  (state.chores || []).forEach(function (c) {
    if (c.archived || c.days || c.after || !c.due) return;
    var ahead = cpDiff(c.due, ymd); if (ahead < 1 || ahead > n) return;
    var w = c.whoToday || cpWho(c, state.people || {}, state.loads);
    if (w === who || w === 'together') out.push({ id: c.id, name: c.name, minutes: c.minutes, tod: cpTod(c), overdue: 0, every: cpEvery(c, ymd), fixed: false, who: w, xp: c.xp });
  });
  return out.sort(function (a, b) { return a.minutes - b.minutes; });
}

/** A win: done at least as many jobs as the day's minimum (any jobs count, must-do or bonus). A day with nothing to do is a free win. */
function cpIsWin(doneCount, minimum) { return (doneCount || 0) >= (minimum || 0); }

// ---------- end of day ----------
/**
 * After a day: jobs the plan put in "later" (over the carry cap or over capacity) move to the next day with room,
 * so nothing piles up on one day. Returns [{ id, from, to }] and updates c.due.
 */
function cpRollover(state, ymd) {
  var plan = cpPlanDay(state, ymd), moves = [], booked = {};
  ['me', 'partner'].forEach(function (w) {
    var p = (state.people || {})[w] || {};
    plan[w].later.forEach(function (j) {
      var c = (state.chores || []).filter(function (x) { return x.id === j.id; })[0]; if (!c || c.days || c.after) return;
      for (var k = 1; k <= 7; k++) {
        var d = cpAdd(ymd, k), used = booked[w + d] || cpPlanned(state, w, d);
        if (used + c.minutes <= cpCapacity(p, d) || k === 7) { booked[w + d] = used + c.minutes; moves.push({ id: c.id, from: c.due, to: d }); c.due = d; break; }
      }
    });
  });
  return moves;
}
/** Minutes a person already has due on a day (not counting late jobs). */
function cpPlanned(state, who, ymd) {
  var t = 0;
  (state.chores || []).forEach(function (c) {
    if (c.archived) return;
    var on = c.days ? cpOnDay(c, ymd) : c.due === ymd; if (!on) return;
    var w = c.whoToday || cpWho(c, state.people || {}, state.loads);
    if (w === who || w === 'together') t += c.minutes;
  });
  return t;
}

/** Mark a chore done: remember who and when, and work out the next due date (on a lighter day where possible). */
function cpComplete(state, c, ymd, by) {
  c.last = ymd; c.lastBy = by === 'together' ? (c.lastBy === 'me' ? 'partner' : 'me') : by;
  var who = cpWho(c, state.people || {}, state.loads);
  c.due = cpNextDue(c, ymd, state.people, function (w, d) { return cpPlanned(state, w, d); }, who === 'together' ? 'me' : who);
  return c.due;
}

/** Each person's share of their week's capacity already used by planned jobs (for the fair split). */
function cpLoads(state, from) {
  var mins = { me: 0, partner: 0 }, cap = { me: 0, partner: 0 };
  for (var i = 0; i < 7; i++) {
    var d = cpAdd(from, i);
    ['me', 'partner'].forEach(function (w) { cap[w] += cpCapacity((state.people || {})[w], d); });
    (state.chores || []).forEach(function (c) {
      if (c.archived) return;
      var on = c.days ? cpOnDay(c, d) : c.due === d; if (!on) return;
      var a = c.assign;
      if (a === 'me' || a === 'partner') mins[a] += c.minutes;
      else if (a === 'together') { mins.me += c.minutes; mins.partner += c.minutes; }
    });
  }
  return { me: cap.me ? mins.me / cap.me : 0, partner: cap.partner ? mins.partner / cap.partner : 0 };
}

/**
 * Pin who does each shared/rotating/anyone run that's due in the week, filling the lighter person first, so the week is fair.
 * Sets c.whoToday (cleared when the chore is done). Fixed jobs keep their person.
 */
function cpAssignWeek(state, from) {
  var loads = cpLoads(state, from), cap = { me: 0, partner: 0 };
  for (var i = 0; i < 7; i++) ['me', 'partner'].forEach(function (w) { cap[w] += cpCapacity((state.people || {})[w], cpAdd(from, i)); });
  var flex = (state.chores || []).filter(function (c) { return !c.archived && (c.assign === 'rotate' || c.assign === 'anyone' || !c.assign); });
  flex.sort(function (a, b) { return b.minutes - a.minutes; });   // big jobs first, so small ones even it out
  flex.forEach(function (c) {
    var runs = 0;
    for (var i = 0; i < 7; i++) { var d = cpAdd(from, i); if (c.days ? cpOnDay(c, d) : c.due === d || (c.due && c.due < from && i === 0)) runs++; }
    if (!runs) { c.whoToday = c.whoToday || ''; return; }
    var w = cpWho(c, state.people || {}, loads);
    c.whoToday = w;
    loads[w] += c.minutes * runs / (cap[w] || 1);
  });
  state.loads = loads;
  return loads;
}

// ---------- the chore list from setup answers ----------
/** The 12 common chores asked about in setup (plus extras). */
var CP_PRESETS = [
  { key: 'hoover_down', ask: 'Hoover downstairs', single: 'Hoover', area: 'Floors' },
  { key: 'hoover_up', ask: 'Hoover upstairs', area: 'Floors', needs: 'upstairs' },
  { key: 'dishes', ask: 'Dishes / dishwasher', area: 'Kitchen', minutes: 10, tod: 'evening' },
  { key: 'laundry', ask: 'Laundry (wash, dry, put away)', area: 'Laundry' },
  { key: 'sheets', ask: 'Change bedsheets', area: 'Bedroom', minutes: 15 },
  { key: 'bathroom', ask: 'Clean bathroom', area: 'Bathroom', minutes: 20 },
  { key: 'kitchen', ask: 'Kitchen surfaces and hob', area: 'Kitchen', minutes: 10 },
  { key: 'bins', ask: 'Bins out', area: 'Outside', minutes: 5, tod: 'evening' },
  { key: 'tidy_bedroom', ask: 'Tidy bedroom / put clothes away', area: 'Bedroom', minutes: 10 },
  { key: 'mop', ask: 'Mop floors', area: 'Floors' },
  { key: 'shop', ask: 'Food shop', area: 'Errands', minutes: 60, tod: 'afternoon' },
  { key: 'dusting', ask: 'Dusting', area: 'Living areas' }
];
var CP_WHO = { me: 'me', yaz: 'partner', partner: 'partner', shared: 'rotate', whoever: 'anyone', together: 'together' };
var CP_HARD_FLOOR = /kitchen|bath|toilet|wc|hall|stair|utility|en.?suite/i;

/** Minutes a job takes from the rooms it covers. */
function cpRoomsOn(h, floor) { return (h.rooms || []).filter(function (r) { return !floor || (r.floor || 'downstairs') === floor; }); }
function cpXp(minutes) { return Math.max(5, Math.min(40, Math.round(minutes / 5) * 5)); }

/**
 * household: { floors: ['downstairs','upstairs'], rooms: [{ name, floor }], bins: [{ name, day, weeks, anchor }], laundryDay, pets,
 *   chores: { key: { now, goal, who } }, extras: [{ name, now, goal, who, minutes }] }
 * Returns chores (not yet saved) with now/goal in days, rampFrom = today, first due dates spread over the first week.
 */
function cpBuildChores(h, today) {
  h = h || {};
  var two = (h.floors || []).length > 1, out = [], ans = h.chores || {}, n = 0;
  function freq(k, fallbackNow, fallbackGoal) {
    var a = ans[k] || {}, now = CP_FREQ[a.now] || CP_FREQ[fallbackNow] || 7, goal = CP_FREQ[a.goal] || CP_FREQ[a.now] || CP_FREQ[fallbackGoal] || now;
    return { now: now, goal: goal, assign: CP_WHO[a.who] || 'anyone', skip: a.now === 'never' };
  }
  function add(o, f) { if (f && f.skip) return; var c = Object.assign({ id: 'c' + (++n), area: '', floor: '', notes: '', tod: 'any', archived: false, order: n, rampFrom: today }, f || {}, o); delete c.skip; c.xp = c.xp || cpXp(c.minutes); out.push(c); }
  var down = cpRoomsOn(h, 'downstairs'), up = cpRoomsOn(h, 'upstairs');
  // hoovering: one job per floor, longer with more rooms
  if (two) {
    add({ key: 'hoover_down', name: 'Hoover downstairs', area: 'Floors', floor: 'downstairs', minutes: Math.max(10, 5 + 3 * down.length) }, freq('hoover_down', 'weekly'));
    add({ key: 'hoover_up', name: 'Hoover upstairs', area: 'Floors', floor: 'upstairs', minutes: Math.max(10, 5 + 3 * up.length) }, freq('hoover_up', 'weekly'));
  } else add({ key: 'hoover_down', name: 'Hoover', area: 'Floors', minutes: Math.max(10, 5 + 3 * (h.rooms || []).length) }, freq('hoover_down', 'weekly'));
  add({ key: 'dishes', name: 'Dishes / dishwasher', area: 'Kitchen', minutes: 10, tod: 'evening' }, freq('dishes', 'daily'));
  // laundry: wash and hang on laundry day (if weekly or rarer), put away the next day
  var lf = freq('laundry', 'weekly');
  if (!lf.skip) {
    var washDays = lf.goal >= 7 && h.laundryDay !== undefined && h.laundryDay !== null && h.laundryDay !== '' ? { days: [Number(h.laundryDay)] } : {};
    add(Object.assign({ key: 'laundry', name: 'Laundry: wash and hang', area: 'Laundry', minutes: 15 }, washDays), lf);
    var washId = out[out.length - 1].id;
    add({ key: 'laundry_away', name: 'Laundry: put it away', area: 'Laundry', minutes: 10, after: washId }, lf);
  }
  var bedrooms = (h.rooms || []).filter(function (r) { return /bed/i.test(r.name); });
  var sf = freq('sheets', 'biweekly');
  (bedrooms.length ? bedrooms : [{ name: 'Bedroom' }]).forEach(function (r, i) { add({ key: 'sheets', name: 'Change bedsheets' + (bedrooms.length > 1 ? ': ' + r.name : ''), area: r.name, floor: r.floor || '', minutes: 15 }, sf); });
  var baths = (h.rooms || []).filter(function (r) { return /bath|toilet|wc|en.?suite|shower/i.test(r.name); }).sort(function (a, b) { return /toilet|wc/i.test(a.name) - /toilet|wc/i.test(b.name); }), bf = freq('bathroom', 'weekly');
  (baths.length ? baths : [{ name: 'Bathroom' }]).forEach(function (r) { add({ key: 'bathroom', name: 'Clean ' + r.name.charAt(0).toLowerCase() + r.name.slice(1), area: r.name, floor: r.floor || '', minutes: /toilet|wc/i.test(r.name) ? 10 : 20 }, bf); });
  add({ key: 'kitchen', name: 'Kitchen surfaces and hob', area: 'Kitchen', minutes: 10 }, freq('kitchen', 'few'));
  // bins: the evening before each collection
  var binF = freq('bins', 'weekly');
  (h.bins || []).forEach(function (b) {
    var day = (Number(b.day) + 6) % 7;
    add({ key: 'bins', name: 'Bins out: ' + b.name, area: 'Outside', minutes: 5, tod: 'evening', days: [day], weeks: Number(b.weeks) === 2 ? 2 : 1, anchor: b.anchor ? cpAdd(b.anchor, -1) : '' }, { assign: binF.assign });
  });
  add({ key: 'tidy_bedroom', name: 'Tidy bedroom and put clothes away', area: 'Bedroom', minutes: 10 }, freq('tidy_bedroom', 'few'));
  var mf = freq('mop', 'biweekly');
  (two ? [['downstairs', down], ['upstairs', up]] : [['', h.rooms || []]]).forEach(function (x) {
    var hard = x[1].filter(function (r) { return CP_HARD_FLOOR.test(r.name); });
    if (two && !hard.length) return;
    add({ key: 'mop', name: two ? 'Mop ' + x[0] + ' (' + hard.map(function (r) { return r.name.toLowerCase(); }).join(', ') + ')' : 'Mop floors', area: 'Floors', floor: x[0], minutes: Math.max(10, 5 + 4 * Math.max(1, hard.length)) }, mf);
  });
  add({ key: 'shop', name: 'Food shop', area: 'Errands', minutes: 60, tod: 'afternoon' }, freq('shop', 'weekly'));
  var df = freq('dusting', 'biweekly');
  (two ? [['downstairs', down], ['upstairs', up]] : [['', h.rooms || []]]).forEach(function (x) { add({ key: 'dusting', name: 'Dust' + (x[0] ? ' ' + x[0] : ''), area: 'Living areas', floor: x[0], minutes: Math.max(10, 5 + 2 * x[1].length) }, df); });
  if (h.pets) add({ key: 'pets', name: 'Pet care (food, water, clean up)', area: 'Pets', minutes: 10 }, { now: 1, goal: 1, assign: 'rotate' });
  (h.extras || []).forEach(function (x) {
    if (!x || !String(x.name || '').trim()) return;
    add({ key: 'extra', name: String(x.name).trim().slice(0, 60), area: x.area || '', minutes: Math.max(5, Number(x.minutes) || 15) }, { now: CP_FREQ[x.now] || 7, goal: CP_FREQ[x.goal] || CP_FREQ[x.now] || 7, assign: CP_WHO[x.who] || 'anyone' });
  });
  // first due dates: spread each job over its first cycle, lightest days first
  var state = { chores: out, people: h.people || {} };
  out.forEach(function (c, i) {
    if (c.days || c.after) return;
    var every = cpEvery(c, today), span = Math.max(1, Math.min(7, Math.round(every))), best = today, bestUsed = 1e9;
    for (var k = 0; k < span; k++) {
      var d = cpAdd(today, (k + i) % span), used = cpPlanned(state, 'me', d) + cpPlanned(state, 'partner', d) - (c.minutes >= 25 && !cpWorkMins((h.people || {}).me, d) ? 30 : 0);
      if (used < bestUsed) { bestUsed = used; best = d; }
    }
    c.due = best;
  });
  return out;
}
