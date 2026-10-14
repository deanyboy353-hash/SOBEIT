/**
 * Schedule.gs: the Schedule page. Every chore runs on one of four rhythms:
 * daily, weekly (on set days), every 2 weeks (on a set day), or monthly (on
 * a set date). "Spread" gives each one a sensible day so they don't pile up:
 * bigger jobs on lighter days, nothing doubled up where it can be avoided,
 * and a little randomness so it feels natural.
 */

// Where each starter chore belongs. Anything else is placed by the spreader.
var SCHEDULE_PLAN = {
  'Do the dishes': 'daily',
  'Wipe down the kitchen': 'daily',
  'Tidy the living room': 'daily',
  '10-minute reset': 'daily',
  'Take the bins out': 'weekly Wed',
  'Hoover downstairs': 'weekly',
  'Put a wash on': 'weekly 2',
  'Hang up or fold laundry': 'weekly 2',
  'Clean the bathroom': 'weekly',
  'Wash the towels': 'weekly',
  'Food shop': 'weekly Sun',
  'Mop the kitchen floor': 'weekly',
  'Change the bedding': 'biweekly',
  'Clean the microwave': 'biweekly',
  'E-bike check': 'biweekly',
  'Sort one pile': 'biweekly',
  'Clean out the fridge': 'monthly',
  'Descale the kettle': 'monthly',
  'Washing machine clean cycle': 'monthly',
  'Clean the oven': 'monthly',
  'Declutter one drawer': 'monthly',
  'Check bills and subscriptions': 'monthly 1',
  'Change toothbrush heads': 'monthly'
};

/**
 * Build a full schedule. Returns {name: {every, nextDue}}.
 * rand: a function returning 0..1 (Math.random, or a fixed one in tests).
 * gymDays: weekday numbers you train on (kept lighter).
 */
function spreadSchedule_(quests, todayYmd, gymDays, rand) {
  rand = rand || Math.random;
  var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var load = [0, 0, 0, 0, 0, 0, 0];      // minutes per weekday
  var fortnight = [0, 0];                 // minutes in week A / week B
  var monthLoad = {};                     // minutes per day of month
  gymDays.forEach(function (d) { load[d] += 40; }); // training days count as busy
  var weight = function (q) { return q.minutes * ({ low: 1, medium: 1.3, high: 1.7 }[q.energy] || 1.3); };
  var pickDays = function (count, q) {
    var order = [0, 1, 2, 3, 4, 5, 6].map(function (d) { return { d: d, v: load[d] + rand() * 12 + (q.energy === 'high' && gymDays.indexOf(d) !== -1 ? 60 : 0) }; })
      .sort(function (a, b) { return a.v - b.v; });
    var chosen = [];
    // spread multi-day jobs apart (e.g. Mon and Thu, not Mon and Tue)
    order.forEach(function (o) {
      if (chosen.length >= count) return;
      if (chosen.every(function (c) { var gap = Math.abs(c - o.d); return Math.min(gap, 7 - gap) >= (count > 1 ? 2 : 0); })) chosen.push(o.d);
    });
    chosen.sort();
    chosen.forEach(function (d) { load[d] += weight(q); });
    return chosen;
  };
  var out = {};
  var today = todayYmd;
  // Biggest jobs first so they get the quietest days.
  quests.slice().sort(function (a, b) { return weight(b) - weight(a); }).forEach(function (q) {
    var plan = SCHEDULE_PLAN[q.name] || q.rhythm;
    var every;
    if (plan === 'other' || plan === 'none') return;
    if (/^daily/.test(plan)) every = 'daily';
    else if (/^weekly/.test(plan)) {
      var fixed = plan.match(/^weekly ([A-Za-z].*)$/);
      if (fixed) { every = 'weekly ' + fixed[1]; parseDays(fixed[1]).forEach(function (d) { load[d] += weight(q); }); }
      else every = 'weekly ' + pickDays(Number((plan.match(/^weekly (\d)$/) || [])[1]) || 1, q).map(function (d) { return DAYN[d]; }).join(', ');
    } else if (/^biweekly/.test(plan)) {
      var d = pickDays(1, q)[0];
      load[d] -= weight(q) / 2; // only every other week
      var wk = fortnight[0] <= fortnight[1] ? 0 : 1;
      fortnight[wk] += weight(q);
      every = '2 weeks ' + DAYN[d];
      var first = nextOccurrence({ kind: 'biweekly', day: d }, addDays_(today, -1), '');
      out[q.name] = { every: every, nextDue: wk ? addDays_(first, 7) : first };
      return;
    } else if (/^monthly/.test(plan)) {
      var fixedDay = Number((plan.match(/^monthly (\d+)/) || [])[1]);
      var day = fixedDay;
      if (!day) {
        var best = null;
        for (var tries = 0; tries < 12; tries++) {
          var cand = 3 + Math.floor(rand() * 25); // 3rd–27th: away from payday rush and month ends
          var v = (monthLoad[cand] || 0) + (monthLoad[cand - 1] || 0) / 2 + (monthLoad[cand + 1] || 0) / 2;
          if (best === null || v < best.v) best = { d: cand, v: v };
        }
        day = best.d;
      }
      monthLoad[day] = (monthLoad[day] || 0) + weight(q);
      every = 'monthly ' + day;
    }
    out[q.name] = { every: every, nextDue: every === 'daily' ? today : nextOccurrence(every, addDays_(today, -1), '') };
  });
  // Hang the washing up the day after it goes in.
  var wash = out['Put a wash on'], hang = out['Hang up or fold laundry'];
  if (wash && hang && /^weekly /.test(wash.every)) {
    var hd = parseDays(wash.every.slice(7)).map(function (d) { return DAYN[(d + 1) % 7]; });
    out['Hang up or fold laundry'] = { every: 'weekly ' + hd.join(', '), nextDue: nextOccurrence('weekly ' + hd.join(', '), addDays_(today, -1), '') };
  }
  return out;
}

/** Write a schedule to the Chores tab (Every + Next due). */
function applySchedule_(plan) {
  readChores_().forEach(function (q) {
    var p = plan[q.name];
    if (p) updateRow_('chores', q.row, { 'Every': p.every, 'Next due': p.nextDue });
  });
}

function gymDays_() {
  var sched = readConfig_().schedule;
  return Object.keys(sched).filter(function (d) { return sched[d].train; }).map(Number);
}

/** One-off upgrade: put every chore on a rhythm with spread-out dates. */
function ensureSchedule_() {
  if (prop_('SCHEDULE_V3')) return;
  applySchedule_(spreadSchedule_(readChores_(), todayYmd_(), gymDays_()));
  setProp_('SCHEDULE_V3', '1');
  setProp_('BOARD', '');
}

function scheduleState_() {
  var order = { daily: 0, weekly: 1, biweekly: 2, monthly: 3, other: 4 };
  return readChores_().map(function (q) {
    return { name: q.name, every: q.every, rhythm: q.rhythm, label: q.label, next: q.due ? todayYmd_() : (q.nextDue || q.next), due: q.due, overdue: q.overdue,
      minutes: q.minutes, who: q.who, energy: q.energy, xp: q.xp, steps: q.steps, lastDone: q.lastDone };
  }).sort(function (a, b) { return order[a.rhythm] - order[b.rhythm] || (a.next < b.next ? -1 : a.next > b.next ? 1 : 0); });
}

// ---- called from the page ----

/** Spread every chore out again with fresh, sensible dates. */
function respreadSchedule(key) {
  var who = who_(key);
  return withLock_(function () {
    applySchedule_(spreadSchedule_(readChores_(), todayYmd_(), gymDays_()));
    delProp_('BOARD');
    return appState_(who);
  });
}

/**
 * Save one chore from the Schedule page.
 * f: {name, newName?, rhythm: daily|weekly|biweekly|monthly|other, days: [0-6], date: 1-31, every (for other), minutes, who, energy, steps}
 */
function saveQuest(key, f) {
  var who = who_(key);
  return withLock_(function () {
    var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var name = String(f.newName || f.name || '').trim().slice(0, 80);
    if (!name) throw new Error('Give the chore a name.');
    var days = (f.days || []).map(Number).filter(function (d) { return d >= 0 && d <= 6; }).sort();
    var every;
    if (f.rhythm === 'daily') every = 'daily';
    else if (f.rhythm === 'weekly') { if (!days.length) throw new Error('Pick at least one day.'); every = 'weekly ' + days.map(function (d) { return DAYN[d]; }).join(', '); }
    else if (f.rhythm === 'biweekly') { if (!days.length) throw new Error('Pick a day.'); every = '2 weeks ' + DAYN[days[0]]; }
    else if (f.rhythm === 'monthly') every = 'monthly ' + Math.min(31, Math.max(1, Number(f.date) || 1));
    else every = String(f.every || 'as needed');
    var today = todayYmd_();
    var nextDue = f.rhythm === 'daily' ? today : (parseEvery(every).kind === 'none' ? '' : nextOccurrence(every, addDays_(today, -1), ''));
    var fields = {
      'Minutes': String(Math.max(1, Math.min(180, Number(f.minutes) || 10))),
      'Every': every, 'Who': ({ me: 'Me', partner: 'Partner' })[f.who] || 'Anyone',
      'Energy': ({ low: 'Low', high: 'High' })[f.energy] || 'Medium', 'Next due': nextDue
    };
    var head = vals_('chores')[0];
    fields[head[2]] = (f.steps || []).join('; ');
    var existing = f.name ? readChores_().filter(function (q) { return q.name === f.name; })[0] : null;
    if (existing) {
      fields[head[0]] = name;
      updateRow_('chores', existing.row, fields);
    } else {
      if (readChores_().some(function (q) { return q.name.toLowerCase() === name.toLowerCase(); })) throw new Error('"' + name + '" already exists.');
      fields[head[0]] = name;
      appendRow_('chores', fields);
    }
    delProp_('BOARD');
    return appState_(who);
  });
}

function deleteQuest(key, name) {
  var who = who_(key);
  return withLock_(function () {
    var q = readChores_().filter(function (x) { return x.name === name; })[0];
    if (q) { sheet_('chores').deleteRow(q.row); forget_('chores'); }
    delProp_('BOARD');
    return appState_(who);
  });
}

// ---- the week plan: who does what, and doing things together ----

var TOGETHER_MULTIPLIER = 2;

/** Once: a daily "Make the bed" for the two of you, and the bedding and food shop as together jobs. */
function ensureTogether_() {
  if (prop_('TOGETHER_V1')) return;
  var chores = readChores_();
  if (!chores.some(function (q) { return q.name.toLowerCase() === 'make the bed'; })) {
    addQuestRow_('Make the bed', 3, 'daily', 'Together');
    var head = vals_('chores')[0];
    updateRow_('chores', vals_('chores').length, (function () { var o = {}; o[head[2]] = 'Duvet straight; Pillows up; Throw on'; o['Next due'] = todayYmd_(); return o; })());
  }
  readChores_().forEach(function (q) {
    if ((q.name === 'Change the bedding' || q.name === 'Food shop') && q.who === 'anyone') updateRow_('chores', q.row, { 'Who': 'Together' });
  });
  forget_('chores');
  setProp_('TOGETHER_V1', '1');
}

/** The main jobs for the planner: everyday and weekly ones (not the once-a-month bits). */
function planState_() {
  return readChores_().filter(function (q) { return q.rhythm === 'daily' || q.rhythm === 'weekly' || q.rhythm === 'biweekly'; })
    .map(function (q) { return { name: q.name, who: q.who, rhythm: q.rhythm, label: q.label, minutes: q.minutes, xp: q.xp }; });
}

/** Save the week plan: {chore name: 'me' | 'partner' | 'together' | 'anyone'}. */
function saveWeekPlan(key, plan) {
  var who = who_(key);
  var col = { me: 'Me', partner: 'Partner', together: 'Together', anyone: 'Anyone' };
  return withLock_(function () {
    var changed = 0;
    readChores_().forEach(function (q) {
      var w = plan && plan[q.name];
      if (!col[w] || w === q.who) return;
      updateRow_('chores', q.row, { 'Who': col[w] });
      changed++;
    });
    forget_('chores');
    delProp_('BOARD');
    if (changed) push_(who === 'me' ? 'partner' : 'me', nicks_()[who] + ' planned the week', 'See who\'s doing what in Chores.', 'chores');
    return appState_(who);
  });
}
