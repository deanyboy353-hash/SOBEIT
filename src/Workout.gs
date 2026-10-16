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
    if (s && !/^Old: /.test(s)) out[s] = { t1: String(r[1]).trim(), t1Sets: String(r[2]), t2: String(r[3]).trim(), t2Of: String(r[4] || r[3]).trim(), t2Sets: String(r[5]) };
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
  var todaySession = todaySession_(today, cfg);
  var doneToday = rowsBetween_('workoutLog', today, today).length > 0;
  // What comes next if you just go in order (handy when the week went sideways).
  var logged = rowsBetween_('workoutLog', addDays_(today, -60), addDays_(today, -1));
  var last = logged.length ? String(logged[logged.length - 1]['Session']) : '';
  var split = splitInfo_(today), order = split.order.map(function (x) { return x.name; });
  var next = split.next.name, planned = day && day.train ? (rotationDoneOn_(today) || next) : todaySession;   // flexible days: whatever today offers
  // your own saved workouts (the Sessions tab, minus the old rows the templates replaced)
  sessions = sessions.filter(function (s) { return !/^Old: /.test(s) && order.indexOf(s) === -1 && s !== split.pump.name; });
  var tpl = split.order.map(function (x) { return x.id; }).concat([PUMP_ID]).reduce(function (o, id) { o[id] = templatePlan_(id); return o; }, {});
  return {
    today: todaySession,
    split: split, tpl: tpl, lifts: liftHistory_(),
    planned: planned, rotation: order, rotationNext: next, trainDays: Object.keys(cfg.schedule).filter(function (d) { return cfg.schedule[d].train; }).map(Number),
    changed: todaySession !== planned,
    last: last, next: next,
    sessions: sessions,
    plans: sessions.reduce(function (o, s) { o[s] = workoutPlan_(s); return o; }, {}),
    doneToday: doneToday,
    progress: progress_(),
    history: workoutHistory_(),
    cardio: cardioState_(),
    prev: previousSets_(),
    records: records_(),
    kinds: sessions.reduce(function (o, s) { o[s] = readProgramme_()[s] ? 'programme' : PRESET_NAMES.indexOf(s) !== -1 ? 'preset' : 'custom'; return o; }, {})
  };
}

/** Progress per main lift: TM over time, best estimated 1RM, recent heavy-set reps; plus weekly volume. */
function progress_() {
  var log = rowsBetween_('workoutLog', '0000', '9999');
  var hist = rowsBetween_('tmHistory', '0000', '9999');
  var lifts = readLifts_();
  var out = Object.keys(lifts).map(function (k) {
    var l = lifts[k];
    var mine = log.filter(function (r) { return canonicalExercise(r['Exercise']).toLowerCase() === canonicalExercise(k).toLowerCase(); });
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
    undoable_('me', 'Training max for ' + l.name, function () {
      sheet_('lifts').getRange(l.row, 2).setValue(tm);
      forget_('lifts');
      appendRow_('tmHistory', { 'Date': todayYmd_(), 'Lift': l.name, 'Old TM': l.tm || '', 'New TM': tm, 'Change': l.tm ? tm - l.tm : 0, '1+ reps': '' });
    }, { lift: { name: l.name, row: l.row, tm: l.tm || '', set: tm } });
    var out = trainState_();
    out.undo = undoInfo_('me');
    out.tmSet = { lift: l.name, from: l.tm || 0, to: tm };
    return out;
  });
}

/**
 * Save a finished workout. sets: [{exercise, tier, set, weight, reps, target}].
 * Applies nSuns progression, spots PRs, logs the gym session and XP.
 */
function saveWorkout(key, session, sets, meta) {
  requireKey_(key);
  meta = meta || {};
  session = String(session || 'Workout').trim().slice(0, 60) || 'Workout';
  return withLock_(function () {
    var today = todayYmd_(), wid = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    var tpl = TEMPLATES[meta.template] ? String(meta.template) : templateByName_(session);
    if (tpl) session = TEMPLATES[tpl].name;
    var done = (sets || []).filter(function (s) { return Number(s.reps) > 0 && Number(s.weight) >= 0; });
    if (!done.length) throw new Error('Tick at least one set first.');
    var log = rowsBetween_('workoutLog', '0000', '9999');
    var bestBefore = {}, heaviestBefore = {};
    log.forEach(function (r) { if (String(r['Type'] || '') === 'W') return; var k = canonicalExercise(r['Exercise']).toLowerCase(); bestBefore[k] = Math.max(bestBefore[k] || 0, Number(r['e1RM']) || 0); heaviestBefore[k] = Math.max(heaviestBefore[k] || 0, Number(r['Weight (kg)']) || 0); });

    var prs = [];
    var volume = 0, seenPr = {};
    done.forEach(function (s) {
      var type = /^[WDF]$/.test(String(s.type || '')) ? String(s.type) : '';
      var est = type === 'W' ? '' : e1rm(Number(s.weight), Number(s.reps));
      var rpe = Number(s.rpe) >= 5 && Number(s.rpe) <= 10 ? Math.round(Number(s.rpe) * 2) / 2 : '';
      appendRow_('workoutLog', { 'Date': today, 'Session': session, 'Exercise': String(s.exercise).slice(0, 60), 'Tier': s.tier || 'Acc', 'Set': s.set, 'Weight (kg)': Number(s.weight), 'Reps': Number(s.reps), 'Target': s.target || '', 'e1RM': est, 'Type': type, 'Workout': wid, 'RPE': rpe, 'Template': tpl || '' });
      volume += Number(s.weight) * Number(s.reps);
      if (type === 'W') return;
      var k = canonicalExercise(s.exercise).toLowerCase();
      // A PR beats every earlier workout (not just an earlier set today): best estimated 1RM, or heaviest weight.
      if (bestBefore[k] && est > bestBefore[k] && !seenPr[k + 'e']) { seenPr[k + 'e'] = 1; prs.push({ exercise: s.exercise, e1rm: est, weight: Number(s.weight), reps: Number(s.reps), kind: 'e1RM' }); }
      else if (heaviestBefore[k] && Number(s.weight) > heaviestBefore[k] && !seenPr[k + 'w']) { seenPr[k + 'w'] = 1; prs.push({ exercise: s.exercise, e1rm: est, weight: Number(s.weight), reps: Number(s.reps), kind: 'weight' }); }
    });
    var started = Number(meta.started) || 0, ended = new Date().getTime(), mins = started && ended > started ? Math.min(360, Math.round((ended - started) / 60000)) : '';
    appendRow_('workouts', { 'Date': today, 'ID': wid, 'Session': session, 'Start': started ? Utilities.formatDate(new Date(started), TZ, 'HH:mm') : '', 'End': Utilities.formatDate(new Date(ended), TZ, 'HH:mm'),
      'Minutes': mins, 'Sets': done.filter(function (s) { return s.type !== 'W'; }).length, 'Volume (kg)': Math.round(volume), 'PRs': prs.length, 'Notes': String(meta.notes || '').slice(0, 300) });

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
    var bonus = 0;
    if (tpl === PUMP_ID) {
      // the Pump is extra: bonus XP (once a day), and the rotation and today's main session are left alone
      if (!xpRows_().some(function (r) { return r.who === 'me' && r.date === today && r.kind === 'pump'; })) bonus = addXp_('me', 'Bonus: ' + session, PUMP_XP, 'pump');
    } else {
      if (session !== todaySession_(today)) useSession_(today, session);
      markGymDone_(today, session);
    }
    return { changes: changes, prs: prs, minutes: mins, volume: Math.round(volume), sets: done.length, bonus: bonus, extra: tpl === PUMP_ID, state: appState_('me') };
  });
}

/** Remember today's session and fix the gym row to match. */
function useSession_(ymd, session) {
  setProp_('GYM_TODAY', JSON.stringify({ date: ymd, session: session }));
  var r = findRow_('gym', 'Date', ymd);
  if (r && session) updateRow_('gym', r, { 'Session': session });
}

/** Change today's workout (or make it a rest day: session ''). Moves the calendar event too. */
function setTodaySession(key, session) {
  requireKey_(key);
  session = String(session || '');
  return withLock_(function () {
    var today = todayYmd_(), cfg = readConfig_();
    if (session && !readProgramme_()[session] && !sessionExercises_(session, cfg).length) throw new Error('No session called "' + session + '".');
    if (templateByName_(session) === PUMP_ID) throw new Error('The Pump is an extra: start it from the gym card, it doesn\'t replace today\'s session.');
    var r = findRow_('gym', 'Date', today);
    if (r && /^Done/.test(String(readRow_('gym', r)['Status'] || ''))) throw new Error('Today\'s workout is already logged.');
    useSession_(today, session);
    try { planGymDay_(today, cfg); } catch (e) { log_('WARN', 'Re-planning the gym day: ' + e); }
    return appState_('me');
  });
}

// ---- Strong-style extras: templates, history, records, cardio ----

var PRESET_SESSIONS = [
  ['Arms & Shoulders Pump', 'Seated DB shoulder press', '3', '10-12', '8', '90 sec', 'Smooth reps, full range'],
  ['Arms & Shoulders Pump', 'Cable lateral raise', '4', '12-15', '9', '60 sec', 'Last set: drop the weight and keep going'],
  ['Arms & Shoulders Pump', 'EZ-bar curl', '3', '10-12', '9', '75 sec', ''],
  ['Arms & Shoulders Pump', 'Triceps pushdown', '3', '10-12', '9', '75 sec', ''],
  ['Arms & Shoulders Pump', 'Incline DB curl', '3', '10-12', '9', '60 sec', ''],
  ['Arms & Shoulders Pump', 'Overhead cable triceps extension', '3', '12-15', '9', '60 sec', ''],
  ['Arms & Shoulders Pump', 'Rear delt fly', '3', '15-20', '9', '60 sec', ''],
  ['Arms & Shoulders Pump', 'Hammer curl', '2', '12-15', '10', '45 sec', 'Finisher: chase the pump'],
  ['Push', 'Barbell bench press', '4', '6-8', '8', '2.5 min', ''],
  ['Push', 'Incline DB press', '3', '8-10', '8', '2 min', ''],
  ['Push', 'Machine shoulder press', '3', '10-12', '8', '90 sec', ''],
  ['Push', 'Cable fly', '3', '12-15', '9', '60 sec', ''],
  ['Push', 'Cable lateral raise', '3', '12-15', '9', '60 sec', ''],
  ['Push', 'Triceps pushdown', '3', '10-12', '9', '60 sec', ''],
  ['Pull', 'Pull-up (or assisted)', '4', '6-10', '8', '2 min', ''],
  ['Pull', 'Barbell row', '3', '8-10', '8', '2 min', ''],
  ['Pull', 'Lat pulldown', '3', '10-12', '8', '90 sec', ''],
  ['Pull', 'Seated cable row', '3', '10-12', '8', '90 sec', ''],
  ['Pull', 'Face pull', '3', '15-20', '9', '60 sec', ''],
  ['Pull', 'EZ-bar curl', '3', '10-12', '9', '60 sec', ''],
  ['Full Body Express', 'Goblet squat', '3', '10-12', '8', '90 sec', ''],
  ['Full Body Express', 'DB bench press', '3', '8-12', '8', '90 sec', ''],
  ['Full Body Express', 'Seated cable row', '3', '10-12', '8', '90 sec', ''],
  ['Full Body Express', 'Romanian deadlift', '3', '8-10', '8', '2 min', ''],
  ['Full Body Express', 'Cable lateral raise', '2', '12-15', '9', '60 sec', ''],
  ['Full Body Express', 'Plank', '3', '45 sec', '', '45 sec', 'Reps = seconds']
];
var PRESET_NAMES = PRESET_SESSIONS.map(function (r) { return r[0]; }).filter(function (n, i, a) { return a.indexOf(n) === i; });

/** Adds the preset workouts to the Sessions tab once (you can edit or delete them there). */
function ensurePresets_() {
  if (prop_('PRESETS_V1')) return;
  var have = readConfig_().sessions, rows = PRESET_SESSIONS.filter(function (r) { return !have[r[0]]; });
  if (rows.length) { var sh = sheet_('sessions'); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows); forget_('sessions'); configCache_ = null; }
  setProp_('PRESETS_V1', '1');
}

/** The last time each exercise was done: its sets in order (for the "Previous" column). */
function previousSets_() {
  var rows = rowsBetween_('workoutLog', addDays_(todayYmd_(), -180), todayYmd_()), last = {}, out = {};
  rows.forEach(function (r) { var k = canonicalExercise(r['Exercise']).toLowerCase(); last[k] = String(r['Date']) + '|' + String(r['Workout'] || r['Session']); });
  rows.forEach(function (r) {
    var k = canonicalExercise(r['Exercise']).toLowerCase();
    if (String(r['Date']) + '|' + String(r['Workout'] || r['Session']) !== last[k]) return;
    var x = { w: Number(r['Weight (kg)']) || 0, r: Number(r['Reps']) || 0, t: String(r['Type'] || ''), rpe: r['RPE'] === '' || r['RPE'] === undefined ? '' : Number(r['RPE']) };
    (out[k] = out[k] || []).push(x);
    var raw = String(r['Exercise']).toLowerCase(); if (raw !== k) (out[raw] = out[raw] || []).push(x);   // old names find it too
  });
  return out;
}

/** Best estimated 1RM and heaviest set per exercise, with a short history for the chart. */
function records_() {
  var by = {};
  rowsBetween_('workoutLog', '0000', '9999').forEach(function (r) {
    if (String(r['Type'] || '') === 'W') return;
    var name = canonicalExercise(r['Exercise']), k = name.toLowerCase(), d = String(r['Date']), e = Number(r['e1RM']) || 0, w = Number(r['Weight (kg)']) || 0, reps = Number(r['Reps']) || 0;
    var x = by[k] = by[k] || { exercise: name, best: 0, heaviest: 0, heaviestReps: 0, sets: 0, days: {}, last: '' };
    x.sets++; x.last = d;
    if (e > x.best) x.best = e;
    if (w > x.heaviest || (w === x.heaviest && reps > x.heaviestReps)) { x.heaviest = w; x.heaviestReps = reps; }
    x.days[d] = Math.max(x.days[d] || 0, e);
  });
  return Object.keys(by).map(function (k) {
    var x = by[k], days = Object.keys(x.days).sort();
    return { exercise: x.exercise, best: Math.round(x.best * 10) / 10, heaviest: x.heaviest, heaviestReps: x.heaviestReps, sets: x.sets, last: x.last,
      history: days.slice(-12).map(function (d) { return { date: d, e1rm: Math.round(x.days[d] * 10) / 10 }; }) };
  }).sort(function (a, b) { return a.last < b.last ? 1 : -1; });
}

/** Recent workouts, newest first, with their sets. */
function workoutHistory_() {
  var from = addDays_(todayYmd_(), -90), sets = {};
  rowsBetween_('workoutLog', from, todayYmd_()).forEach(function (r) {
    var id = String(r['Workout'] || (r['Date'] + ' ' + r['Session']));
    (sets[id] = sets[id] || []).push({ exercise: String(r['Exercise']), w: Number(r['Weight (kg)']) || 0, r: Number(r['Reps']) || 0, t: String(r['Type'] || '') });
  });
  var list = rowsBetween_('workouts', from, todayYmd_()).map(function (r) {
    return { id: String(r['ID']), date: String(r['Date']), session: String(r['Session']), minutes: Number(r['Minutes']) || 0, sets: Number(r['Sets']) || 0, volume: Number(r['Volume (kg)']) || 0, prs: Number(r['PRs']) || 0, notes: String(r['Notes'] || ''), detail: sets[String(r['ID'])] || [] };
  });
  // older workouts (before the Workouts tab existed), from the log
  var known = {}; list.forEach(function (w) { known[w.id] = 1; });
  Object.keys(sets).forEach(function (id) {
    if (known[id] || / /.test(id) === false) return;
    var s = sets[id], parts = id.split(' ');
    list.push({ id: id, date: parts[0], session: parts.slice(1).join(' '), minutes: 0, sets: s.length, volume: Math.round(s.reduce(function (a, x) { return a + x.w * x.r; }, 0)), prs: 0, notes: '', detail: s });
  });
  return list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 30);
}

/** Save (or replace) a workout template in the Sessions tab. exercises: [{exercise, sets, reps, rest, rpe, notes}] */
function saveTemplate(key, name, exercises) {
  requireKey_(key);
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new Error('Give the workout a name.');
  var list = (exercises || []).filter(function (e) { return String(e.exercise || '').trim(); }).slice(0, 20);
  if (!list.length) throw new Error('Add at least one exercise.');
  return withLock_(function () {
    if (readProgramme_()[name] || templateByName_(name)) throw new Error('"' + name + '" is one of your split\'s sessions; edit it from the Train tab, or pick another name.');
    deleteTemplateRows_(name);
    var rows = list.map(function (e) { return [name, String(e.exercise).trim().slice(0, 60), String(Math.max(1, Math.min(10, Math.round(Number(e.sets) || 3)))), String(e.reps || '8-12').slice(0, 20), String(e.rpe || ''), String(e.rest || '90 sec').slice(0, 12), String(e.notes || '').slice(0, 120)]; });
    var sh = sheet_('sessions');
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
    forget_('sessions'); configCache_ = null;
    return trainState_();
  });
}

function deleteTemplate(key, name) {
  requireKey_(key);
  return withLock_(function () {
    if (readProgramme_()[name] || templateByName_(name)) throw new Error('Split sessions can\'t be deleted; edit them or reset them to default instead.');
    deleteTemplateRows_(String(name));
    return trainState_();
  });
}

function deleteTemplateRows_(name) {
  var sh = sheet_('sessions'), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]).trim() === name) sh.deleteRow(i + 1);
  forget_('sessions'); configCache_ = null;
}

// ---- cardio ----

var CARDIO_TYPES = ['Walk', 'Run', 'E-bike', 'Cycle', 'Cross-trainer', 'Rowing', 'Stairs', 'Swim', 'HIIT', 'Football', 'Dance', 'Other'];

function cardioState_() {
  var today = todayYmd_(), rows = rowsBetween_('cardio', addDays_(today, -60), today).map(function (r) {
    return { id: String(r['ID']), date: String(r['Date']), type: String(r['Type']), minutes: Number(r['Minutes']) || 0, km: Number(r['Distance (km)']) || 0, kcal: Number(r['kcal']) || 0, hr: Number(r['Avg HR']) || 0, notes: String(r['Notes'] || '') };
  }).reverse();
  var week = rows.filter(function (r) { return r.date >= addDays_(today, -6); });
  return { recent: rows.slice(0, 15), types: CARDIO_TYPES, weekMinutes: week.reduce(function (a, r) { return a + r.minutes; }, 0), weekKm: Math.round(week.reduce(function (a, r) { return a + r.km; }, 0) * 10) / 10 };
}

/** Log a cardio session: {type, minutes, km, kcal, hr, notes, date}. XP: about 1 per 3 minutes (up to 20). */
function logCardio(key, c) {
  requireKey_(key);
  c = c || {};
  var mins = Math.round(Number(c.minutes));
  if (!(mins >= 1 && mins <= 600)) throw new Error('How many minutes? (1 to 600)');
  var type = CARDIO_TYPES.indexOf(c.type) !== -1 ? c.type : String(c.type || 'Other').trim().slice(0, 30) || 'Other';
  var km = Number(c.km) || 0, kcal = Math.round(Number(c.kcal) || 0), hr = Math.round(Number(c.hr) || 0);
  if (km < 0 || km > 300 || kcal < 0 || kcal > 5000 || hr < 0 || hr > 230) throw new Error('One of those numbers looks off.');
  return withLock_(function () {
    var today = todayYmd_(), date = /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) && c.date <= today && c.date >= addDays_(today, -7) ? c.date : today;
    undoable_('me', type + ' ' + mins + ' min', function () {
      appendRow_('cardio', { 'Date': date, 'ID': Utilities.getUuid().replace(/-/g, '').slice(0, 10), 'Type': type, 'Minutes': mins, 'Distance (km)': km || '', 'kcal': kcal || '', 'Avg HR': hr || '', 'Notes': String(c.notes || '').slice(0, 200) });
      addXp_('me', 'Cardio: ' + type + ' ' + mins + ' min' + (km ? ', ' + km + ' km' : ''), Math.max(3, Math.min(20, Math.round(mins / 3))), 'cardio');
    });
    return { state: appState_('me') };
  });
}

function deleteCardio(key, id) {
  requireKey_(key);
  return withLock_(function () {
    var r = findRow_('cardio', 'ID', id);
    if (r) { sheet_('cardio').deleteRow(r); forget_('cardio'); }
    return { state: appState_('me') };
  });
}
