/**
 * Workout.gs: the Train tab. An nSuns-style upper/lower programme:
 *
 *   T1  the day's main lift, 9 sets worked out from its training max (TM)
 *   T2  a second heavy lift, 8 sets from another lift's TM
 *   then the accessories from the Sessions tab (double progression)
 *
 * The heavy "1+" set on T1 decides next week's TM (see tmIncrease in
 * Planner.gs). Every set lands in the Workout log tab; TM changes in
 * TM history. Edit TMs any time in the Lifts tab and the plan follows.
 */

var T1_REST = '2 min';
var T2_REST = '90 sec';

function readLifts_() {
  var out = {};
  vals_('lifts').slice(1).forEach(function (r, i) {
    var name = String(r[0]).trim();
    if (name) out[name.toLowerCase()] = { name: name, tm: Number(r[1]) || null, body: String(r[2] || 'Upper').trim(), row: i + 2 };
  });
  return out;
}

function readProgramme_() {
  var out = {};
  vals_('programme').slice(1).forEach(function (r) {
    var s = String(r[0]).trim();
    if (s) out[s] = { t1: String(r[1]).trim(), t1Sets: String(r[2]), t2: String(r[3]).trim(), t2Of: String(r[4] || r[3]).trim(), t2Sets: String(r[5]) };
  });
  return out;
}

function lastSets_(exercise) {
  var rows = rowsBetween_('workoutLog', '0000', '9999').filter(function (r) { return String(r['Exercise']) === exercise; });
  if (!rows.length) return null;
  var lastDate = String(rows[rows.length - 1]['Date']);
  return rows.filter(function (r) { return String(r['Date']) === lastDate; })
    .map(function (r) { return { weight: Number(r['Weight (kg)']) || 0, reps: Number(r['Reps']) || 0 }; });
}

/** The full plan for one session, with real weights. */
function workoutPlan_(sessionName) {
  var cfg = readConfig_();
  var step = num_(cfg.settings, 'Plate step (kg)', 2.5);
  var lifts = readLifts_();
  var prog = readProgramme_()[sessionName];
  var main = [];
  if (prog) {
    [['T1', prog.t1, prog.t1, prog.t1Sets, T1_REST], ['T2', prog.t2, prog.t2Of, prog.t2Sets, T2_REST]].forEach(function (m) {
      if (!m[1]) return;
      var base = lifts[m[2].toLowerCase()];
      var tm = base ? base.tm : null;
      main.push({ tier: m[0], exercise: m[1], basedOn: base ? base.name : m[2], tm: tm, rest: m[4], sets: schemeSets(m[3], tm, step) });
    });
  }
  var accessories = (cfg.sessions[sessionName] || []).map(function (ex) {
    var last = lastSets_(String(ex.exercise));
    var top = (String(ex.reps).match(/(\d+)\s*(?:-|–|to)\s*(\d+)/) || [])[2] || firstInt(ex.reps);
    var hitTop = last && last.length && last.every(function (s) { return s.reps >= Number(top); });
    var lastW = last && last.length ? last[0].weight : null;
    return {
      tier: 'Acc', exercise: String(ex.exercise), sets: firstInt(ex.sets) || 3, reps: String(ex.reps), rpe: String(ex.rpe), rest: String(ex.rest), notes: String(ex.notes || ''),
      lastWeight: lastW, lastReps: last ? last.map(function (s) { return s.reps; }) : [],
      suggest: hitTop && lastW ? roundTo(lastW + step, step) : lastW,
      bumped: !!(hitTop && lastW)
    };
  });
  return { session: sessionName, main: main, accessories: accessories, step: step };
}

/** Lines for the gym calendar event. */
function mainLiftLines_(plan) {
  return plan.main.map(function (m) {
    if (!m.tm) return m.exercise + ' (' + m.tier + '): set a training max for ' + m.basedOn + ' in the app';
    return m.exercise + ' (' + m.tier + '): ' + m.sets.map(function (s) { return s.weight + '×' + s.reps + (s.amrap ? '+' : ''); }).join(', ');
  });
}

function trainState_() {
  var today = todayYmd_();
  var cfg = readConfig_();
  var dow = dayOfWeek_(today);
  var day = cfg.schedule[dow];
  var sessions = Object.keys(readProgramme_());
  Object.keys(cfg.sessions).forEach(function (s) { if (sessions.indexOf(s) === -1) sessions.push(s); });
  var todaySession = day && day.train ? day.session : '';
  var doneToday = rowsBetween_('workoutLog', today, today).length > 0;
  return {
    today: todaySession,
    sessions: sessions,
    plans: sessions.reduce(function (o, s) { o[s] = workoutPlan_(s); return o; }, {}),
    doneToday: doneToday,
    progress: progress_()
  };
}

/** Progress per main lift: TM over time, best estimated 1RM, recent heavy-set reps; plus weekly volume. */
function progress_() {
  var log = rowsBetween_('workoutLog', '0000', '9999');
  var hist = rowsBetween_('tmHistory', '0000', '9999');
  var lifts = readLifts_();
  var out = Object.keys(lifts).map(function (k) {
    var l = lifts[k];
    var mine = log.filter(function (r) { return String(r['Exercise']).toLowerCase() === k; });
    var best = mine.reduce(function (b, r) { return Math.max(b, Number(r['e1RM']) || 0); }, 0);
    var h = hist.filter(function (r) { return String(r['Lift']).toLowerCase() === k; });
    return {
      lift: l.name, tm: l.tm, body: l.body, best: best,
      tmHistory: h.slice(-12).map(function (r) { return { date: String(r['Date']), tm: Number(r['New TM']), change: Number(r['Change']), reps: Number(r['1+ reps']) }; }),
      sessions: Object.keys(mine.reduce(function (o, r) { o[r['Date']] = 1; return o; }, {})).length
    };
  });
  var weeks = {};
  log.forEach(function (r) {
    var d = String(r['Date']);
    var monday = addDays_(d, -((dayOfWeek_(d) + 6) % 7));
    weeks[monday] = (weeks[monday] || 0) + (Number(r['Weight (kg)']) || 0) * (Number(r['Reps']) || 0);
  });
  var wk = Object.keys(weeks).sort().slice(-8).map(function (w) { return { week: w, volume: Math.round(weeks[w]) }; });
  return { lifts: out, weeks: wk, workouts: Object.keys(log.reduce(function (o, r) { o[r['Date']] = 1; return o; }, {})).length };
}

// ---- called from the page ----

function trainState(key) {
  requireKey_(key);
  return trainState_();
}

/** Set a training max from a recent set (weight × reps): TM = 90% of the estimated 1RM. */
function setTrainingMax(key, lift, weight, reps) {
  requireKey_(key);
  return withLock_(function () {
    var l = readLifts_()[String(lift).toLowerCase()];
    if (!l) throw new Error(lift + ' is not in the Lifts tab.');
    var w = Number(weight), r = Math.round(Number(reps));
    if (!(w > 0) || !(r >= 1 && r <= 15)) throw new Error('Enter a weight and 1–15 reps you did recently.');
    var step = num_(readConfig_().settings, 'Plate step (kg)', 2.5);
    var tm = roundTo(e1rm(w, r) * 0.9, step);
    sheet_('lifts').getRange(l.row, 2).setValue(tm);
    forget_('lifts');
    appendRow_('tmHistory', { 'Date': todayYmd_(), 'Lift': l.name, 'Old TM': l.tm || '', 'New TM': tm, 'Change': l.tm ? tm - l.tm : 0, '1+ reps': '' });
    return trainState_();
  });
}

/**
 * Save a finished workout. sets: [{exercise, tier, set, weight, reps, target}].
 * Applies nSuns progression, spots PRs, logs the gym session and XP.
 */
function saveWorkout(key, session, sets) {
  requireKey_(key);
  return withLock_(function () {
    var today = todayYmd_();
    var done = (sets || []).filter(function (s) { return Number(s.reps) > 0 && Number(s.weight) >= 0; });
    if (!done.length) throw new Error('Tick at least one set first.');
    var log = rowsBetween_('workoutLog', '0000', '9999');
    var bestBefore = {};
    log.forEach(function (r) { var k = String(r['Exercise']).toLowerCase(); bestBefore[k] = Math.max(bestBefore[k] || 0, Number(r['e1RM']) || 0); });

    var prs = [];
    done.forEach(function (s) {
      var est = e1rm(Number(s.weight), Number(s.reps));
      appendRow_('workoutLog', { 'Date': today, 'Session': session, 'Exercise': s.exercise, 'Tier': s.tier, 'Set': s.set, 'Weight (kg)': Number(s.weight), 'Reps': Number(s.reps), 'Target': s.target || '', 'e1RM': est });
      var k = String(s.exercise).toLowerCase();
      // A PR beats every earlier workout (not just an earlier set today).
      if (s.tier !== 'Acc' && bestBefore[k] && est > bestBefore[k]) prs.push({ exercise: s.exercise, e1rm: est, weight: Number(s.weight), reps: Number(s.reps) });
    });

    // nSuns: the first "+" set of T1 sets next week's training max.
    var changes = [];
    var plan = workoutPlan_(session);
    var t1 = plan.main.filter(function (m) { return m.tier === 'T1'; })[0];
    if (t1 && t1.tm) {
      var heavy = done.filter(function (s) { return s.tier === 'T1' && /\+$/.test(String(s.target)); })[0];
      if (heavy) {
        var l = readLifts_()[t1.basedOn.toLowerCase()];
        var inc = tmIncrease(Number(heavy.reps), l.body);
        var newTm = roundTo(l.tm + inc, plan.step);
        if (inc) { sheet_('lifts').getRange(l.row, 2).setValue(newTm); forget_('lifts'); }
        appendRow_('tmHistory', { 'Date': today, 'Lift': l.name, 'Old TM': l.tm, 'New TM': inc ? newTm : l.tm, 'Change': inc, '1+ reps': Number(heavy.reps) });
        changes.push({ lift: l.name, from: l.tm, to: inc ? newTm : l.tm, change: inc, reps: Number(heavy.reps) });
      }
    }

    // Best PR only, once per workout, so the XP stays sensible.
    var bestPr = prs.sort(function (a, b) { return b.e1rm - a.e1rm; })[0];
    if (bestPr) addXp_('me', 'PR: ' + bestPr.exercise + ' ' + bestPr.weight + '×' + bestPr.reps, 25, 'pr');
    completeTracked_('gym', today);
    onGymTaskDone_({ completed: new Date().toISOString() }, { date: today });
    return { changes: changes, prs: prs, state: appState_('me') };
  });
}
