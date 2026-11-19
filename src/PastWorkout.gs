/**
 * PastWorkout.gs: workouts logged after the fact, in words ("Monday did Lower A, bench PR 90 x 8").
 * Claude reads the words into a plan (PAST_SCHEMA); the server checks and does it:
 *   log      a workout on a past day: what you say you did, the rest of the template at your last weights
 *   move     a workout logged on the wrong day goes to the right one
 *   relabel  a workout logged as the wrong session (the Pump instead of Lower A) gets the right name
 *   remove   a workout logged twice goes to the Archive tab (never deleted)
 * Every change copies the rows it touches to the Archive tab first.
 */

var PAST_DAYS = 60;   // how far back a workout can be logged or changed

/** Pure: the sets to log for one exercise. given = [{ weight, reps, type }], pr = { weight, reps }, last = last time's working sets. */
function pastSetsFor(given, pr, last) {
  if (given && given.length) return given.map(function (s) { return { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, type: /^[WDF]$/.test(String(s.type || '')) ? String(s.type) : '' }; })
    .filter(function (s) { return s.reps > 0 && s.weight >= 0; });
  var base = (last || []).filter(function (s) { return s.t !== 'W'; }).map(function (s) { return { weight: Number(s.w) || 0, reps: Number(s.r) || 0, type: '' }; });
  if (!pr) return base;
  if (!base.length) return [{ weight: Number(pr.weight) || 0, reps: Number(pr.reps) || 0, type: '' }];
  // the PR takes the place of the heaviest set; the rest are as last time
  var top = 0; base.forEach(function (s, i) { if (s.weight > base[top].weight) top = i; });
  base[top] = { weight: Number(pr.weight) || 0, reps: Number(pr.reps) || 0, type: '' };
  return base;
}

/**
 * Pure: a whole workout's sets. rows = the template's exercises; given = { name: sets }, prs = { name: { weight, reps } },
 * last = { lower name: sets }; fill false = only what was given (they listed the whole session).
 */
function pastPlan(rows, given, prs, last, canon, fill) {
  canon = canon || function (n) { return String(n); };
  var key = function (n) { return canon(n).toLowerCase(); };
  var g = {}, p = {}, used = {}, out = [], missing = [];
  Object.keys(given || {}).forEach(function (n) { g[key(n)] = { name: n, sets: given[n] }; });
  Object.keys(prs || {}).forEach(function (n) { p[key(n)] = prs[n]; });
  (rows || []).forEach(function (name) {
    var k = key(name);
    if (fill === false && !g[k] && !p[k]) return;
    var sets = pastSetsFor(g[k] && g[k].sets, p[k], (last || {})[k]);
    used[k] = 1;
    if (sets.length) out.push({ exercise: name, sets: sets, from: g[k] ? 'you' : p[k] ? 'pr' : 'last' });
    else missing.push(name);
  });
  // exercises you named that aren't in the template still go in
  Object.keys(g).forEach(function (k) { if (!used[k]) { var sets = pastSetsFor(g[k].sets, p[k], null); if (sets.length) out.push({ exercise: g[k].name, sets: sets, from: 'you' }); used[k] = 1; } });
  Object.keys(p).forEach(function (k) { if (!used[k]) out.push({ exercise: Object.keys(prs).filter(function (n) { return key(n) === k; })[0], sets: pastSetsFor(null, p[k], (last || {})[k]), from: 'pr' }); });
  return { exercises: out, missing: missing };
}

/** Last time's working sets for every exercise, from workouts before `ymd`: { 'bench press': [{ w, r, t, date }] }. */
function lastBefore_(ymd) {
  var rows = rowsBetween_('workoutLog', addDays_(ymd, -365), addDays_(ymd, -1)), last = {}, out = {};
  rows.forEach(function (r) { var k = canonicalExercise(r['Exercise']).toLowerCase(); last[k] = String(r['Date']) + '|' + String(r['Workout'] || r['Session']); });
  rows.forEach(function (r) {
    var k = canonicalExercise(r['Exercise']).toLowerCase();
    if (String(r['Date']) + '|' + String(r['Workout'] || r['Session']) !== last[k]) return;
    (out[k] = out[k] || []).push({ w: Number(r['Weight (kg)']) || 0, r: Number(r['Reps']) || 0, t: String(r['Type'] || ''), date: String(r['Date']) });
  });
  return out;
}

/** A date the plan can touch: a real day, not in the future, within PAST_DAYS. */
function pastDay_(ymd) {
  var d = String(ymd || ''), today = todayYmd_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Which day? I couldn\'t work out the date.');
  if (d > today) throw new Error(d + ' hasn\'t happened yet.');
  if (d < addDays_(today, -PAST_DAYS)) throw new Error(d + ' is too far back to change here.');
  return d;
}
var PAST_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Mon 16 Nov" */
function dayWords_(ymd) { return DAY_NAMES[dayOfWeek_(ymd)] + ' ' + Number(ymd.slice(8, 10)) + ' ' + PAST_MONTHS[Number(ymd.slice(5, 7)) - 1]; }

/** The workouts logged on a day, grouped: [{ id, template, session, exercises, rows: [row numbers] }]. */
function workoutsOn_(ymd) {
  var v = vals_('workoutLog'), h = v[0], c = {}, by = {}, out = [];
  h.forEach(function (x, i) { c[x] = i; });
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][c['Date']]) !== ymd) continue;
    var id = String(v[i][c['Workout']] || '') || ymd + ' ' + String(v[i][c['Session']] || '');
    var w = by[id]; if (!w) { w = by[id] = { id: id, template: String(v[i][c['Template']] || ''), session: String(v[i][c['Session']] || ''), exercises: [], rows: [] }; out.push(w); }
    w.rows.push(i + 1);
    var ex = String(v[i][c['Exercise']]); if (w.exercises.indexOf(ex) === -1) w.exercises.push(ex);
  }
  return out;
}

/** Which of a day's workouts a plan means: by template id or name, else the only one. */
function pickWorkout_(list, tpl) {
  if (!list.length) return null;
  if (tpl) {
    var id = tplDef_(tpl) ? tpl : templateByName_(tpl), n = String(tpl).toLowerCase();
    var hit = list.filter(function (w) { return (id && w.template === id) || w.session.toLowerCase() === n; })[0];
    if (hit) return hit;
  }
  return list.length === 1 ? list[0] : null;
}

/** Log a workout on a past day. w = { date, template, exercises: [{ name, sets }], prs: [{ exercise, weight, reps }], fill_rest, notes, xp } */
function logPast_(who, w) {
  var ymd = pastDay_(w.date), tpl = w.template ? (tplDef_(w.template) ? String(w.template) : templateByName_(w.template)) : '';
  var def = tpl ? templateOf_(tpl) : null, session = def ? def.name : String(w.session || 'Workout').slice(0, 60);
  var given = {}, prs = {};
  (w.exercises || []).forEach(function (e) { if (e && e.name) given[String(e.name)] = e.sets || []; });
  (w.prs || []).forEach(function (p) { if (p && p.exercise) prs[String(p.exercise)] = { weight: p.weight, reps: p.reps }; });
  var plan = pastPlan(def ? def.ex.map(function (x) { return x.exercise; }) : [], given, prs, lastBefore_(ymd), canonicalExercise, w.fill_rest !== false);
  if (!plan.exercises.length) throw new Error('Nothing to log for ' + dayWords_(ymd) + ': no sets given and no earlier weights for ' + session + '.');
  // logged already? Then it isn't added twice
  var have = workoutsOn_(ymd).filter(function (x) { return (tpl && x.template === tpl) || x.exercises.filter(function (e) { return plan.exercises.some(function (p) { return canonicalExercise(p.exercise) === canonicalExercise(e); }); }).length >= 2; })[0];
  if (have) return { skipped: true, line: session + ' is already logged on ' + dayWords_(ymd) + '. Nothing added.' };

  var log = rowsBetween_('workoutLog', '0000', addDays_(ymd, -1)), best = {};
  log.forEach(function (r) { if (String(r['Type'] || '') === 'W') return; var k = canonicalExercise(r['Exercise']).toLowerCase(); best[k] = Math.max(best[k] || 0, Number(r['Weight (kg)']) || 0); });
  var wid = 'past' + Utilities.getUuid().replace(/-/g, '').slice(0, 8), sets = 0, volume = 0, prList = [];
  plan.exercises.forEach(function (x) {
    var k = canonicalExercise(x.exercise).toLowerCase(), n = 0;
    x.sets.forEach(function (s) {
      n++;
      appendRow_('workoutLog', { 'Date': ymd, 'Session': session, 'Exercise': x.exercise, 'Tier': 'Acc', 'Set': n, 'Weight (kg)': s.weight, 'Reps': s.reps, 'Target': '',
        'e1RM': s.type === 'W' ? '' : e1rm(s.weight, s.reps), 'Type': s.type, 'Workout': wid, 'RPE': '', 'Template': tpl || '' });
      if (s.type !== 'W') { sets++; volume += s.weight * s.reps; }
      if (s.type !== 'W' && best[k] && s.weight > best[k] && prList.indexOf(x.exercise) === -1) prList.push(x.exercise);
    });
  });
  appendRow_('workouts', { 'Date': ymd, 'ID': wid, 'Session': session, 'Start': '', 'End': '', 'Minutes': '', 'Sets': sets, 'Volume (kg)': Math.round(volume), 'PRs': prList.length,
    'Notes': ['Logged later'].concat(w.notes ? [String(w.notes).slice(0, 200)] : []).join(' · ') });
  // the day counts as a gym day (main sessions only), with its XP on that day
  if (tpl !== PUMP_ID) {
    var r = findRow_('gym', 'Date', ymd), before = r ? readRow_('gym', r) : {};
    var up = { 'Status': 'Done', 'Session': session, 'Template': tpl || '', 'Ticked at': 'later' };
    if (r) updateRow_('gym', r, up); else appendRow_('gym', Object.assign({ 'Date': ymd, 'Day': DAY_NAMES[dayOfWeek_(ymd)] }, up));
    if (w.xp !== false && !/^Done/.test(String(before['Status'] || ''))) { appendRow_('xp', { 'Date': ymd, 'Time': '12:00', 'Who': who, 'What': 'Gym: ' + session + ' (logged later)', 'XP': 50, 'Kind': 'gym' }); xpCache_ = null; }
  }
  var from = plan.exercises.filter(function (x) { return x.from === 'last'; }).length;
  return { logged: true, id: wid, date: ymd, session: session, sets: sets, prs: prList, missing: plan.missing,
    line: 'Logged ' + session + ' on ' + dayWords_(ymd) + ': ' + plan.exercises.length + ' exercises, ' + sets + ' sets' + (from ? ' (' + from + ' at your last weights)' : '') +
      (prList.length ? '. New best: ' + prList.join(', ') : '') + (plan.missing.length ? '. Left out (no earlier weights): ' + plan.missing.join(', ') : '') + '.' };
}

/** Copy a workout's rows to the Archive tab before changing them. */
function archiveWorkout_(what, ymd, w) {
  var v = vals_('workoutLog');
  archive_('workouts', what + ' ' + ymd + ' ' + (w.session || w.template), { header: v[0], rows: w.rows.map(function (r) { return v[r - 1]; }) });
}

/** Move a workout from one day to another (the outbox's late arrivals). */
function movePast_(from, to, tpl) {
  from = pastDay_(from); to = pastDay_(to);
  if (from === to) throw new Error('That workout is already on ' + dayWords_(to) + '.');
  var w = pickWorkout_(workoutsOn_(from), tpl);
  if (!w) throw new Error('Couldn\'t tell which workout on ' + dayWords_(from) + ' to move. Name the session.');
  archiveWorkout_('Moved to ' + to + ':', from, w);
  w.rows.forEach(function (r) { updateRow_('workoutLog', r, { 'Date': to }); });
  var wr = findRow_('workouts', 'ID', w.id); if (wr) updateRow_('workouts', wr, { 'Date': to });
  // the gym log follows: the old day is no longer a gym day unless something else was logged there
  var left = workoutsOn_(from).length, r1 = findRow_('gym', 'Date', from);
  if (r1 && !left && /^Done/.test(String(readRow_('gym', r1)['Status'] || ''))) updateRow_('gym', r1, { 'Status': 'Moved to ' + to });
  if (w.template !== PUMP_ID) {
    var r2 = findRow_('gym', 'Date', to), up = { 'Status': 'Done', 'Session': w.session, 'Template': w.template, 'Ticked at': 'moved' };
    if (r2) updateRow_('gym', r2, up); else appendRow_('gym', Object.assign({ 'Date': to, 'Day': DAY_NAMES[dayOfWeek_(to)] }, up));
  }
  return { line: 'Moved ' + (w.session || 'the workout') + ' from ' + dayWords_(from) + ' to ' + dayWords_(to) + '.' };
}

/** Give a day's workout the right session (logged as the Pump when it was Lower A). */
function relabelPast_(ymd, fromTpl, toTpl) {
  ymd = pastDay_(ymd);
  var id = tplDef_(toTpl) ? String(toTpl) : templateByName_(toTpl);
  if (!id) throw new Error('No session called "' + toTpl + '".');
  var w = pickWorkout_(workoutsOn_(ymd), fromTpl);
  if (!w) throw new Error('Couldn\'t tell which workout on ' + dayWords_(ymd) + ' to change. Name the session it shows as.');
  var name = tplDef_(id).name;
  archiveWorkout_('Relabelled as ' + name + ':', ymd, w);
  w.rows.forEach(function (r) { updateRow_('workoutLog', r, { 'Template': id, 'Session': name }); });
  var wr = findRow_('workouts', 'ID', w.id); if (wr) updateRow_('workouts', wr, { 'Session': name });
  if (id !== PUMP_ID) {
    var g = findRow_('gym', 'Date', ymd), up = { 'Status': 'Done', 'Session': name, 'Template': id };
    if (g) updateRow_('gym', g, up); else appendRow_('gym', Object.assign({ 'Date': ymd, 'Day': DAY_NAMES[dayOfWeek_(ymd)] }, up));
  }
  return { line: dayWords_(ymd) + ': ' + (w.session || 'the workout') + ' is now ' + name + '.' };
}

/** A workout logged twice: its rows go to the Archive tab and leave the log. */
function removePast_(ymd, tpl) {
  ymd = pastDay_(ymd);
  var w = pickWorkout_(workoutsOn_(ymd), tpl);
  if (!w) throw new Error('Couldn\'t tell which workout on ' + dayWords_(ymd) + ' to take out. Name the session.');
  archiveWorkout_('Removed:', ymd, w);
  w.rows.slice().sort(function (a, b) { return b - a; }).forEach(function (r) { sheet_('workoutLog').deleteRow(r); });
  forget_('workoutLog');
  var wr = findRow_('workouts', 'ID', w.id); if (wr) { archive_('workouts', 'Removed summary ' + ymd, readRow_('workouts', wr)); sheet_('workouts').deleteRow(wr); forget_('workouts'); }
  if (!workoutsOn_(ymd).length) { var g = findRow_('gym', 'Date', ymd); if (g && /^Done/.test(String(readRow_('gym', g)['Status'] || ''))) updateRow_('gym', g, { 'Status': 'Removed' }); }
  return { line: 'Took ' + (w.session || 'the workout') + ' on ' + dayWords_(ymd) + ' out of the log (a copy is in the Archive tab).' };
}

/** Do a checked plan: [{ action, date, to_date, template, from_template, exercises, prs, notes }] -> lines. */
function doPast_(who, list) {
  var lines = [];
  (list || []).slice(0, 10).forEach(function (a) {
    try {
      if (a.action === 'log') lines.push(logPast_(who, a).line);
      else if (a.action === 'move') lines.push(movePast_(a.date, a.to_date, a.template).line);
      else if (a.action === 'relabel') lines.push(relabelPast_(a.date, a.from_template, a.template).line);
      else if (a.action === 'remove') lines.push(removePast_(a.date, a.template).line);
    } catch (e) { lines.push(e.message); }
  });
  return lines;
}

var PAST_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'One or two short sentences saying what you understood. If something is missing (a day, a session, a number), ask for it here and leave it out of the plan.' },
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['log', 'move', 'relabel', 'remove'] },
          date: { type: 'string', description: 'yyyy-MM-dd. For log, relabel and remove: the day. For move: the day it is logged on now.' },
          to_date: { type: 'string', description: 'For move: the day it really happened. Empty otherwise.' },
          template: { type: 'string', description: 'The session id from the list (ul-la, ul-ua…). For move and remove: which workout on that day. For relabel: what it really was.' },
          from_template: { type: 'string', description: 'For relabel: what it is logged as now (its id or name). Empty otherwise.' },
          exercises: { type: 'array', description: 'For log: only exercises the person gave sets for. Use the session\'s exercise names where it is the same exercise.',
            items: { type: 'object', properties: { name: { type: 'string' }, sets: { type: 'array', items: { type: 'object', properties: { weight: { type: 'number' }, reps: { type: 'number' }, type: { type: 'string', enum: ['', 'W', 'D'], description: 'W warm-up, D drop set, empty a working set' } }, required: ['weight', 'reps', 'type'] } } }, required: ['name', 'sets'] } },
          prs: { type: 'array', description: 'For log: a personal best they mention (one set), when they give no other sets for that exercise.',
            items: { type: 'object', properties: { exercise: { type: 'string' }, weight: { type: 'number' }, reps: { type: 'number' } }, required: ['exercise', 'weight', 'reps'] } },
          fill_rest: { type: 'boolean', description: 'For log: true when they only named the session (or a PR), so the rest goes in at last weights; false when they listed what they did.' },
          notes: { type: 'string', description: 'For log: cardio and anything else worth keeping, like "Incline walk 20 min".' }
        },
        required: ['action', 'date', 'to_date', 'template', 'from_template', 'exercises', 'prs', 'fill_rest', 'notes']
      }
    }
  },
  required: ['reply', 'plan']
};

/** What Claude needs: today, the sessions and their exercises, and the last three weeks as logged. */
function pastContext_() {
  var today = todayYmd_(), lines = ['Today is ' + DAY_NAMES_LONG[dayOfWeek_(today)] + ' ' + dayWords_(today).replace(/^\w+ /, '') + ' ' + today.slice(0, 4) + ' (' + today + ').'];
  lines.push('A weekday on its own ("Monday") means the most recent one before today. "Last Monday" means the same unless they say otherwise.');
  lines.push('', 'Sessions (id: name: exercises):');
  SPLITS[splitState_().split].order.concat(presetIds_()).forEach(function (id) { var t = templateOf_(id); if (t) lines.push(id + ': ' + t.name + ': ' + t.ex.map(function (x) { return x.exercise; }).join(', ')); });
  lines.push('', 'Logged in the last 21 days:');
  var any = false;
  for (var d = addDays_(today, -21); d <= today; d = addDays_(d, 1)) workoutsOn_(d).forEach(function (w) {
    any = true; lines.push(d + ' (' + DAY_NAMES[dayOfWeek_(d)] + '): ' + (w.session || '?') + (w.template ? ' [' + w.template + ']' : '') + ': ' + w.exercises.join(', '));
  });
  if (!any) lines.push('(nothing)');
  return lines.join('\n');
}

/**
 * "Monday did Lower A, bench PR 90 x 8": logs, moves, relabels or removes past workouts.
 * Exercises not mentioned are logged at last time's weights; nothing is ever made up.
 */
function logWorkoutText(key, text) {
  var who = who_(key);
  if (who !== 'me') throw new Error('Workouts are Dean\'s for now.');
  text = String(text || '').trim().slice(0, 3000);
  if (!text) throw new Error('Say which day and which session, like "Monday did Lower A".');
  if (!claudeKey_()) throw new Error('This needs the Claude API key. Add it in Settings.');
  var out = pastFromText_(who, text, true);
  return { reply: out.reply, done: out.done, state: appState_(who) };
}

/** Claude reads the words, the server does the plan (inside the lock unless `lock`). Also Ask's log_workout. */
function pastFromText_(who, text, lock) {
  var res = callClaudeJson_(AI_VOICE +
    'You turn what someone says about past gym sessions into a plan for their workout log. Use only what they say and the lists below; never invent weights or reps. ' +
    'For a session they name, put in exercises only those they gave sets for; the app fills the rest at their last weights. A PR they mention with no other sets for that exercise goes in prs. ' +
    'A workout "on the wrong day" is a move; one logged as the wrong session (the Pump, Arms & Shoulders) is a relabel; one logged twice is a remove. If the day or session is unclear, ask in reply and leave it out.',
    pastContext_() + '\n\nThey say: ' + text, PAST_SCHEMA, claudeModel_(), 20000);
  var lines = [];
  if (lock) withLock_(function () { lines = doPast_(who, res.plan || []); }); else lines = doPast_(who, res.plan || []);
  return { reply: String(res.reply || ''), done: lines };
}

/**
 * Settle one remembered workout against the log: already there (relabelled if it shows as another session),
 * logged a day or two out (moved; or, when you listed every set, the stray copy archived and yours logged), else logged.
 */
function settlePast_(who, spec, around) {
  var ymd = pastDay_(spec.date), tpl = spec.template, names = (spec.exercises || []).map(function (e) { return canonicalExercise(e.name); });
  if (!names.length && tplDef_(tpl)) names = templateOf_(tpl).ex.map(function (x) { return canonicalExercise(x.exercise); });
  var same = function (w) { return w.template === tpl || w.exercises.filter(function (e) { return names.indexOf(canonicalExercise(e)) !== -1; }).length >= 2; };
  var here = workoutsOn_(ymd).filter(same)[0];
  if (here) return [here.template === tpl ? tplDef_(tpl).name + ' is already logged on ' + dayWords_(ymd) + '.' : relabelPast_(ymd, here.template || here.session, tpl).line];
  for (var k = 1; k <= (around || 0); k++) {
    var days = [addDays_(ymd, k), addDays_(ymd, -k)].filter(function (d) { return d <= todayYmd_(); });
    for (var j = 0; j < days.length; j++) {
      var near = workoutsOn_(days[j]).filter(same)[0];
      if (!near) continue;
      if (spec.fill_rest === false) return [removePast_(days[j], near.template || near.session).line, logPast_(who, spec).line];
      var lines = [movePast_(days[j], ymd, near.template || near.session).line];
      if (near.template !== tpl) lines.push(relabelPast_(ymd, near.template || near.session, tpl).line);
      return lines;
    }
  }
  return [logPast_(who, spec).line];
}

// Dean's two sessions the lag lost (asked for on 19 Nov 2026): Monday 16 Nov as he listed it, Thursday 12 Nov at his last weights with the bench PR.
var PAST_NOV_2026 = [
  { date: '2026-11-16', template: 'ul-la', fill_rest: false, notes: 'Seated leg curl and leg extension as a superset, 3 rounds · Incline walk 20 min · hack squat drop set reps not given (8 put in)',
    exercises: [
      { name: 'Leg press', sets: [{ weight: 100, reps: 10, type: 'W' }, { weight: 150, reps: 8, type: 'W' }, { weight: 190, reps: 5, type: 'W' }, { weight: 225, reps: 8, type: '' }, { weight: 225, reps: 10, type: '' }, { weight: 225, reps: 8, type: '' }] },
      { name: 'Hack squat', sets: [{ weight: 77, reps: 10, type: '' }, { weight: 97, reps: 10, type: '' }, { weight: 127, reps: 8, type: '' }, { weight: 97, reps: 8, type: 'D' }] },
      { name: 'Seated leg curl', sets: [{ weight: 36, reps: 9, type: '' }, { weight: 36, reps: 9, type: '' }, { weight: 36, reps: 9, type: '' }] },
      { name: 'Leg extension', sets: [{ weight: 52, reps: 10, type: '' }, { weight: 52, reps: 10, type: '' }, { weight: 52, reps: 10, type: '' }] }] },
  { date: '2026-11-12', template: 'ul-ua', fill_rest: true, prs: [{ exercise: 'Bench press', weight: 90, reps: 8 }], exercises: [] }
];
/**
 * For the Apps Script editor's Run button (it hides names ending in _): settles the two sessions once and
 * prints what it did. Safe to run again: the second time it only prints the first run's lines.
 */
function fixPastWorkouts() {
  var done = JSON.parse(prop_('PAST_NOV_V1') || 'null');
  var lines = done && done.lines ? ['Already done on ' + done.at + ':'].concat(done.lines) : ensurePastNov_();
  lines.forEach(function (l) { console.log(l); });
  try { clearStateCache_(); } catch (e) { /* older copy without the state cache */ }
  return lines;
}

/** Once: settle those two, the results in the feed and kept in PAST_NOV_V1. */
function ensurePastNov_() {
  var out = [];
  PAST_NOV_2026.forEach(function (spec) { try { out = out.concat(settlePast_('me', spec, 2)); } catch (e) { out.push(e.message); } });
  out.forEach(function (l) { addFeed_('me', l, 'gym'); });
  setProp_('PAST_NOV_V1', JSON.stringify({ at: now_(), lines: out }));
  return out;
}
