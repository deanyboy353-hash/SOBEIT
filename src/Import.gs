/**
 * Import.gs: bring in workouts from another app (Liftoff or Strong CSV exports), logged as if they'd been
 * done in Nudge on the day: sets in the Workout log, a Workouts row and the Gym log ticked Done, all dated
 * the day they happened, so history, PRs, "last time" weights and the rotation all know about them.
 * No XP or cash: those only come from things done in the app from now on. Safe to run twice.
 */

var LB = 2.20462262;
// Liftoff's names -> the names Nudge already uses, so "last time" and PRs line up with the rotation.
var IMPORT_NAMES = {
  'bench press': 'Barbell bench press', 'hack squat': 'Hack squat', 'lat pulldown': 'Lat pulldown', 'seated cable row': 'Seated cable row',
  'lying leg curl': 'Lying leg curl', 'seated leg curl': 'Seated leg curl', 'leg extension': 'Leg extension', 'cable fly': 'Cable fly',
  'cable lateral raise': 'Cable lateral raise', 'seated dumbbell shoulder press': 'Seated DB shoulder press', 'incline dumbbell bench press': 'Incline DB press',
  'tricep pushdown': 'Triceps pushdown', 'tricep rope pushdown': 'Triceps pushdown', 'cable overhead tricep extension': 'Overhead cable triceps extension',
  'incline dumbbell curl': 'Incline DB curl', 'ez bar curl': 'EZ-bar curl', 'face pull': 'Face pull',
  // Strong's names
  'bench press (barbell)': 'Barbell bench press', 'incline bench press (dumbbell)': 'Incline DB press', 'lat pulldown (cable)': 'Lat pulldown',
  'seated row (cable)': 'Seated cable row', 'seated leg curl (machine)': 'Seated leg curl', 'leg extension (machine)': 'Leg extension', 'face pull (cable)': 'Face pull',
  'lateral raise (cable)': 'Cable lateral raise', 'seated overhead press (dumbbell)': 'Seated DB shoulder press', 'leg press': 'Leg press',
  'chest supported row': 'Chest-supported row', 'pullover (machine)': 'Machine pullover', 'chest fly': 'Cable fly'
};

/** CSV text -> rows of cells (quotes, commas or semicolons, and newlines inside quotes handled). */
function parseCsv(text) {
  var s = String(text || '').replace(/^﻿/, ''), first = s.split(/\r?\n/)[0] || '';
  var sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  var out = [], row = [], cell = '', q = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

/** Which app a workout export came from: Strong has a "Workout #" column; Liftoff doesn't. */
function workoutCsvSource(text) { return /workout #/i.test(String(text || '').split(/\r?\n/)[0]) ? 'Strong' : 'Liftoff'; }

/**
 * Pure: a Liftoff or Strong CSV -> workouts [{ date, time, minutes, name, sets: [{ exercise, set, weight, reps, type }] }], oldest first.
 * Weights: a "Weight (kg)" column is kg; Liftoff's bare "Weight" is pounds (unit 'lb') and converts to kg (nearest 0.25).
 * Strong's W/D/F set markers become warm-up / drop / failure sets; rest-timer and zero-rep rows are dropped.
 * The same workout saved twice (same day, or re-saved the next day) is kept once; empty workouts are dropped.
 */
function parseWorkoutCsv(text, unit) {
  var rows = parseCsv(text); if (rows.length < 2) return [];
  var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); }), col = function (names) { for (var i = 0; i < names.length; i++) { var k = head.indexOf(names[i]); if (k !== -1) return k; } return -1; };
  var cNo = col(['workout #']), cDate = col(['date']), cName = col(['workout name']), cEx = col(['exercise name', 'exercise']), cSet = col(['set order', 'set']),
    cW = col(['weight (kg)', 'weight (lbs)', 'weight']), cR = col(['reps']), cDur = col(['duration']), cSec = col(['duration (sec)']);
  if (cDate === -1 || cEx === -1 || cR === -1) throw new Error('That file doesn\'t look like a workout export (needs Date, Exercise Name and Reps columns).');
  var wHead = head[cW] || '', toKg = /kg/.test(wHead) || unit === 'kg' ? 1 : 1 / LB;
  var zeroBased = cSet !== -1 && rows.slice(1).some(function (r) { return String(r[cSet]).trim() === '0'; });
  var byKey = {}, order = [];
  rows.slice(1).forEach(function (r) {
    var stamp = String(r[cDate] || '').trim(), ex = String(r[cEx] || '').trim(), reps = Math.round(Number(r[cR]) || 0), so = cSet === -1 ? '' : String(r[cSet]).trim();
    if (!stamp || !ex || reps <= 0 || /rest/i.test(so)) return;
    var key = (cNo !== -1 ? String(r[cNo]).trim() + '|' : '') + stamp;
    if (!byKey[key]) {
      var mins = cSec !== -1 ? Math.round((Number(r[cSec]) || 0) / 60) : durationMins_(r[cDur]);
      byKey[key] = { key: key, stamp: stamp, date: stamp.slice(0, 10), time: stamp.slice(11, 16), minutes: mins > 0 && mins <= 180 ? mins : '', name: cName !== -1 ? String(r[cName] || '').trim() : '', sets: [], n: {} };
      order.push(key);
    }
    var w = byKey[key], name = IMPORT_NAMES[ex.toLowerCase()] || ex, type = /^[WDF]$/i.test(so) ? so.toUpperCase() : '';
    w.n[name] = (w.n[name] || 0) + 1;
    w.sets.push({ exercise: name, set: /^\d+$/.test(so) ? Number(so) + (zeroBased ? 1 : 0) : w.n[name], weight: Math.round((Number(r[cW]) || 0) * toKg * 4) / 4, reps: reps, type: type });
  });
  var seen = {}, out = [];
  order.sort(function (a, b) { return byKey[a].stamp < byKey[b].stamp ? -1 : byKey[a].stamp > byKey[b].stamp ? 1 : 0; }).forEach(function (k) {
    var w = byKey[k], sig = w.sets.map(function (s) { return s.exercise + ':' + s.set + ':' + s.weight + 'x' + s.reps; }).join(';');
    delete w.n; delete w.key;
    if (!w.sets.length || (seen[sig] && addDays_(seen[sig], 1) >= w.date)) return;
    seen[sig] = w.date; out.push(w);
  });
  return out;
}
function durationMins_(s) {
  var m = /(\d+)\s*hours?\s*(\d+)\s*minutes?/i.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;   // over 3 hours means the clock was left running: ignored by the caller
}

/** Write parsed workouts into the sheets as if logged on the day. Returns { added, skipped, sets, prs }. */
function importWorkouts_(workouts, source) {
  var log = rowsBetween_('workoutLog', '0000', '9999'), have = {}, best = {}, heavy = {};
  log.forEach(function (r) { have[String(r['Date']) + '|' + String(r['Exercise']).toLowerCase() + '|' + r['Set'] + '|' + Number(r['Weight (kg)']) + '|' + Number(r['Reps'])] = 1; });
  var setRows = [], workoutRows = [], xpRows = [], cashRows = [], gymRows = [], added = 0, skipped = 0, prs = 0, sets = 0;
  var gymHave = {}; rowsBetween_('gym', '0000', '9999').forEach(function (r) { gymHave[String(r['Date'])] = /^Done/.test(String(r['Status'] || '')); });
  // PRs count against everything before that day, including earlier imported days
  var history = log.map(function (r) { return { date: String(r['Date']), ex: String(r['Exercise']).toLowerCase(), e: Number(r['e1RM']) || 0, w: Number(r['Weight (kg)']) || 0 }; });
  workouts.forEach(function (w) {
    if (w.sets.every(function (s) { return have[w.date + '|' + s.exercise.toLowerCase() + '|' + s.set + '|' + s.weight + '|' + s.reps]; })) { skipped++; return; }
    best = {}; heavy = {};
    history.forEach(function (h) { if (h.date < w.date) { best[h.ex] = Math.max(best[h.ex] || 0, h.e); heavy[h.ex] = Math.max(heavy[h.ex] || 0, h.w); } });
    var session = classifySession(w.sets.map(function (s) { return s.exercise; })) || 'Workout', wid = Utilities.getUuid().replace(/-/g, '').slice(0, 10), volume = 0, top = null;
    w.sets.forEach(function (s) {
      var warm = s.type === 'W', est = warm ? 0 : e1rm(s.weight, s.reps), k = s.exercise.toLowerCase();
      setRows.push({ 'Date': w.date, 'Session': session, 'Exercise': s.exercise.slice(0, 60), 'Tier': 'Acc', 'Set': s.set, 'Weight (kg)': s.weight, 'Reps': s.reps, 'Target': '', 'e1RM': warm ? '' : est, 'Type': s.type || '', 'Workout': wid });
      if (warm) return;
      history.push({ date: w.date, ex: k, e: est, w: s.weight });
      volume += s.weight * s.reps; sets++;
      if ((best[k] && est > best[k]) || (heavy[k] && s.weight > heavy[k])) { if (!top || est > top.e) top = { ex: s.exercise, w: s.weight, r: s.reps, e: est }; }
    });
    workoutRows.push({ 'Date': w.date, 'ID': wid, 'Session': session, 'Start': w.time, 'End': '', 'Minutes': w.minutes, 'Sets': w.sets.length, 'Volume (kg)': Math.round(volume), 'PRs': top ? 1 : 0, 'Notes': 'Imported from ' + source + (w.name ? ': ' + w.name : '') });
    if (!gymHave[w.date]) { gymRows.push({ 'Date': w.date, 'Day': DAY_NAMES[dayOfWeek_(w.date)], 'Session': session, 'Status': 'Done', 'Ticked at': w.time, 'Notes': 'Imported from ' + source }); gymHave[w.date] = true; }
    if (top) prs++;
    added++;
  });
  appendRows_('workoutLog', setRows); appendRows_('workouts', workoutRows); appendRows_('gym', gymRows);
  xpCache_ = null; delProp_('GYM_TODAY');
  return { added: added, skipped: skipped, sets: sets, prs: prs };
}

/** From the app: import a workout CSV (Liftoff exports pounds; pass unit 'kg' if yours is in kg). */
function importWorkoutCsv(key, text, unit) {
  requireKey_(key);
  var source = workoutCsvSource(text), workouts = parseWorkoutCsv(text, unit === 'kg' ? 'kg' : 'lb');
  if (!workouts.length) throw new Error('No workouts found in that file.');
  return withLock_(function () {
    var r = importWorkouts_(workouts, source);
    if (r.added) addFeed_('me', 'Imported ' + r.added + ' workouts from ' + source, 'gym');
    return Object.assign(r, { state: appState_('me') });
  });
}

/** Once each: Dean's Strong and Liftoff history, if the private ImportData.gs (never committed) is present. */
function ensureLiftoffImport_() {
  if (instance_()) return;
  if (!prop_('STRONG_V1') && typeof STRONG_CSV !== 'undefined') setProp_('STRONG_V1', JSON.stringify(importWorkouts_(parseWorkoutCsv(STRONG_CSV, 'kg'), 'Strong')));
  if (!prop_('LIFTOFF_V1') && typeof LIFTOFF_CSV !== 'undefined') setProp_('LIFTOFF_V1', JSON.stringify(importWorkouts_(parseWorkoutCsv(LIFTOFF_CSV, 'lb'), 'Liftoff')));
  removeImportXp_();
}

/**
 * Once: take back any XP and cash an earlier version of the import gave for old workouts (Dean asked for
 * XP and cash only from things done in the app). Matches each imported workout's day and start time, so
 * nothing earned in the app is touched.
 */
function removeImportXp_() {
  if (prop_('IMPORT_XP_V2')) return 0;
  var stamps = {};
  rowsBetween_('workouts', '0000', '9999').forEach(function (r) { if (/^Imported from/.test(String(r['Notes'] || ''))) stamps[String(r['Date']) + '|' + String(r['Start'])] = 1; });
  var removed = 0;
  [['xp', function (r) { return /^(Gym: |PR: )/.test(String(r[3])) && /^(gym|pr)$/.test(String(r[5])); }], ['cash', function (r) { return /^(Gym: |PR: )/.test(String(r[3])) && String(r[5]) === 'earned'; }]].forEach(function (t) {
    var sh = sheet_(t[0]), v = sh.getDataRange().getValues();
    for (var i = v.length - 1; i >= 1; i--) {
      var d = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], TZ, 'yyyy-MM-dd') : String(v[i][0]);
      var tm = v[i][1] instanceof Date ? Utilities.formatDate(v[i][1], TZ, 'HH:mm') : String(v[i][1]);
      if (v[i][2] === 'me' && stamps[d + '|' + tm] && t[1](v[i])) { sh.deleteRow(i + 1); removed++; }
    }
    forget_(t[0]);
  });
  xpCache_ = null;
  setProp_('IMPORT_XP_V2', String(removed));
  return removed;
}
