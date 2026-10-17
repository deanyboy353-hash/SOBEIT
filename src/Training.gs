/**
 * Training.gs: the gym. One main split, Upper / Lower A/B (Upper A, Lower A, Upper B, Lower B), plus presets
 * you can do any day instead: Push, Pull and Legs (PPL), Full Body, the Arms & Shoulders Pump, and any workout
 * you save yourself from the Train tab (TRAIN_MINE). Upper A leads with chest, Upper B with back.
 *
 * The split is a rotation, not fixed days: the next session waits until you've done it, whatever day it is.
 * A preset never moves the rotation. Push, Pull, Legs and Full Body count as a gym session (50 XP, the weekly
 * target); the Pump is an extra: bonus XP, never counts towards the target and never counts as missed.
 * The old Push / Pull / Shoulders & Arms split (October 2026) is kept in TEMPLATES so its history still reads.
 *
 * Rules for every template: no hip hinges (no deadlifts, RDLs, good mornings, heavy barbell back squats),
 * no calf raises, a little more back than chest, fewer exercises with more sets, antagonist supersets.
 * Each exercise row: [exercise, sets, reps, RPE, rest, superset group ('' or a letter shared by a pair)].
 *
 * Your edits and swaps are kept per template in Script Properties (TRAIN_TPL); "reset to default" drops them.
 * History is never rewritten: old exercise names are mapped onto the new ones when they're read (ALIASES).
 */

var SPLITS = {
  ul: { name: 'Upper / Lower A/B', order: ['ul-ua', 'ul-la', 'ul-ub', 'ul-lb'] }
};
var SPLIT_DEFAULT = 'ul', PUMP_ID = 'pump', PUMP_XP = 20, WEEK_TARGET = 4;
// Any day, instead of the next session in the rotation (they never move it). The Pump is the extra.
var PRESETS = ['ppl-push', 'ppl-pull', 'ppl-legs', 'full', PUMP_ID];

var TEMPLATES = {
  'ppsa-push': { name: 'Push', focus: 'Chest and quads', mins: 70, ex: [
    ['Bench press', 4, '6-8', 8, '2.5–3 min', ''],
    ['Hack squat', 4, '8-10', 8, '2–3 min', ''],
    ['Incline DB press', 3, '8-12', 8, '2 min', ''],
    ['Leg extension', 3, '12-15', 9, '90s', 'a'], ['Cable fly', 3, '12-15', 9, '90s', 'a']] },
  'ppsa-pull': { name: 'Pull', focus: 'Back and hamstrings', mins: 70, ex: [
    ['Lat pulldown', 4, '8-10', 8, '2 min', ''],
    ['Seated cable row', 4, '8-10', 8, '2 min', ''],
    ['Band-assisted pull-up', 3, '8-12', 8, '2 min', ''],
    ['Seated leg curl', 4, '10-12', 9, '90s', 'a'], ['Face pull', 4, '12-15', 9, '90s', 'a']] },
  'ppsa-sa': { name: 'Shoulders & Arms', focus: 'Delts, biceps and triceps', mins: 65, ex: [
    ['Seated DB shoulder press', 4, '8-10', 8, '2 min', ''],
    ['Cable lateral raise', 4, '12-15', 9, '60–90s', 'a'], ['Reverse pec deck', 4, '12-15', 9, '60–90s', 'a'],
    ['EZ-bar curl', 3, '10-12', 9, '60–90s', 'b'], ['Rope pushdown', 3, '10-12', 9, '60–90s', 'b'],
    ['Incline DB curl', 3, '12-15', 9, '60s', 'c'], ['Overhead cable extension', 3, '12-15', 9, '60s', 'c']] },
  'ul-ua': { name: 'Upper A', focus: 'Upper body, chest first', mins: 70, ex: [
    ['Bench press', 4, '5-6', 8, '3 min', ''],
    ['Incline DB press', 3, '8-10', 8, '2 min', ''],
    ['Lat pulldown', 3, '8-10', 8, '2 min', 'a'], ['Cable fly', 3, '12-15', 9, '2 min', 'a'],
    ['Seated DB shoulder press', 3, '8-10', 8, '90s', 'b'], ['Seated cable row', 3, '10-12', 8, '90s', 'b'],
    ['Rope pushdown', 3, '10-12', 9, '60–90s', '']] },
  'ul-la': { name: 'Lower A', focus: 'Lower body, heavier', mins: 65, ex: [
    ['Hack squat', 4, '6-8', 8, '3 min', ''],
    ['Leg press', 3, '10-12', 8, '2 min', ''],
    ['Seated leg curl', 4, '10-12', 9, '90s', 'a'], ['Leg extension', 4, '10-12', 9, '90s', 'a'],
    ['Cable crunch', 3, '12-15', 8, '60s', '']] },
  'ul-ub': { name: 'Upper B', focus: 'Upper body, pull first', mins: 70, ex: [
    ['Lat pulldown', 4, '6-8', 8, '2.5 min', ''],
    ['Chest-supported row', 4, '8-10', 8, '2 min', ''],
    ['Seated cable row', 3, '10-12', 8, '90s', 'a'], ['Machine chest press', 3, '10-12', 8, '90s', 'a'],
    ['Face pull', 3, '12-15', 9, '60s', 'b'], ['Cable lateral raise', 3, '12-15', 9, '60s', 'b'],
    ['EZ-bar curl', 3, '10-12', 9, '60–90s', '']] },
  'ul-lb': { name: 'Lower B', focus: 'Lower body, volume', mins: 65, ex: [
    ['Leg press', 4, '10-12', 8, '2 min', ''],
    ['DB split squat', 3, '10 each leg', 8, '2 min', ''],
    ['Seated leg curl', 4, '12-15', 9, '90s', 'a'], ['Leg extension', 4, '12-15', 9, '90s', 'a'],
    ['Hanging knee raise', 3, '10-15', 8, '60s', '']] },
  'ppl-push': { name: 'Push', focus: 'Chest, shoulders and triceps', mins: 65, ex: [
    ['Bench press', 4, '6-8', 8, '2.5–3 min', ''],
    ['Seated DB shoulder press', 3, '8-10', 8, '2 min', ''],
    ['Incline DB press', 3, '10-12', 8, '2 min', ''],
    ['Cable lateral raise', 3, '12-15', 9, '60–90s', 'a'], ['Rope pushdown', 3, '12-15', 9, '60–90s', 'a']] },
  'ppl-pull': { name: 'Pull', focus: 'Back, rear delts and biceps', mins: 70, ex: [
    ['Lat pulldown', 4, '8-10', 8, '2 min', ''],
    ['Seated cable row', 4, '8-10', 8, '2 min', ''],
    ['Chest-supported row', 3, '10-12', 8, '2 min', ''],
    ['Face pull', 3, '12-15', 9, '60–90s', 'a'], ['EZ-bar curl', 3, '10-12', 9, '60–90s', 'a']] },
  'ppl-legs': { name: 'Legs', focus: 'Quads and hamstrings', mins: 70, ex: [
    ['Hack squat', 4, '8-10', 8, '2.5–3 min', ''],
    ['Leg press', 3, '10-12', 8, '2 min', ''],
    ['Seated leg curl', 4, '10-12', 9, '90s', 'a'], ['Leg extension', 4, '10-12', 9, '90s', 'a'],
    ['DB split squat', 3, '10 each leg', 8, '2 min', '']] },
  'full': { name: 'Full Body', focus: 'Everything once, about an hour', mins: 60, ex: [
    ['Hack squat', 3, '8-10', 8, '2.5 min', ''],
    ['Lat pulldown', 3, '8-10', 8, '2 min', 'a'], ['Incline DB press', 3, '8-10', 8, '2 min', 'a'],
    ['Chest-supported row', 3, '10-12', 8, '2 min', ''],
    ['Seated leg curl', 3, '10-12', 9, '90s', 'b'], ['Seated DB shoulder press', 3, '10-12', 8, '90s', 'b']] },
  'pump': { name: 'Arms & Shoulders Pump', focus: 'Optional extra: delts and arms', mins: 45, extra: true, ex: [
    ['Machine shoulder press', 3, '12-15', 9, '90s', ''],
    ['Cable lateral raise', 4, '15-20', 9, '60s', 'a'], ['Reverse pec deck', 4, '15-20', 9, '60s', 'a'],
    ['Cable curl', 3, '12-15', 9, '60s', 'b'], ['Rope pushdown', 3, '12-15', 9, '60s', 'b'],
    ['Hammer curl', 3, '12-15', 9, '60s', 'c'], ['Overhead cable extension', 3, '12-15', 9, '60s', 'c'],
    ['Lateral raise drop set', 1, 'to failure', 10, '', '']] }
};

// Old names in your history (the previous rotation, Strong, Liftoff) -> the names the templates use.
var ALIASES = {
  'barbell bench press': 'Bench press', 'bench press (barbell)': 'Bench press', 'flat bench press': 'Bench press',
  'incline dumbbell bench press': 'Incline DB press', 'incline bench press (dumbbell)': 'Incline DB press', 'incline db bench press': 'Incline DB press',
  'triceps pushdown': 'Rope pushdown', 'tricep pushdown': 'Rope pushdown', 'tricep rope pushdown': 'Rope pushdown', 'triceps pushdown (cable - rope)': 'Rope pushdown', 'rope pushdown (cable)': 'Rope pushdown',
  'overhead cable triceps extension': 'Overhead cable extension', 'cable overhead tricep extension': 'Overhead cable extension', 'triceps extension (cable)': 'Overhead cable extension',
  'rear delt fly (machine)': 'Reverse pec deck', 'rear delt fly': 'Reverse pec deck', 'reverse fly (machine)': 'Reverse pec deck', 'reverse pec deck (machine)': 'Reverse pec deck', 'rear delt reverse fly (machine)': 'Reverse pec deck',
  'pull-up (or assisted)': 'Band-assisted pull-up', 'assisted pull-up': 'Band-assisted pull-up', 'pull up (assisted)': 'Band-assisted pull-up', 'pull-up (assisted)': 'Band-assisted pull-up', 'band assisted pull-up': 'Band-assisted pull-up',
  'lateral raise (cable)': 'Cable lateral raise', 'seated overhead press (dumbbell)': 'Seated DB shoulder press', 'seated dumbbell shoulder press': 'Seated DB shoulder press', 'shoulder press (dumbbell)': 'Seated DB shoulder press',
  'shoulder press (machine)': 'Machine shoulder press', 'chest press (machine)': 'Machine chest press', 'lat pulldown (cable)': 'Lat pulldown', 'lat pulldown - close grip (cable)': 'Close-grip pulldown',
  'seated row (cable)': 'Seated cable row', 'seated leg curl (machine)': 'Seated leg curl', 'leg extension (machine)': 'Leg extension', 'leg press (machine)': 'Leg press', 'hack squat (machine)': 'Hack squat',
  'face pull (cable)': 'Face pull', 'chest supported row': 'Chest-supported row', 'chest fly': 'Cable fly', 'cable crossover': 'Cable fly', 'ez bar curl': 'EZ-bar curl', 'ez-bar curl (barbell)': 'EZ-bar curl',
  'incline dumbbell curl': 'Incline DB curl', 'incline curl (dumbbell)': 'Incline DB curl', 'hammer curl (dumbbell)': 'Hammer curl', 'bicep curl (cable)': 'Cable curl', 'cable bicep curl': 'Cable curl',
  'bulgarian split squat': 'DB split squat', 'split squat (dumbbell)': 'DB split squat', 'cable crunch (cable)': 'Cable crunch', 'hanging leg raise': 'Hanging knee raise'
};

// Same muscle, same rules: what the Swap button offers.
var MUSCLES = {
  'Chest press': ['Bench press', 'Incline DB press', 'DB bench press', 'Machine chest press', 'Incline machine press'],
  'Chest fly': ['Cable fly', 'Pec deck', 'Low-to-high cable fly'],
  'Quads': ['Hack squat', 'Leg press', 'Pendulum squat', 'Belt squat', 'DB split squat'],
  'Quad isolation': ['Leg extension', 'Single-leg extension'],
  'Hamstrings': ['Seated leg curl', 'Lying leg curl', 'Standing leg curl'],
  'Lats': ['Lat pulldown', 'Close-grip pulldown', 'Band-assisted pull-up', 'Assisted pull-up machine', 'Single-arm cable pulldown'],
  'Mid back': ['Seated cable row', 'Chest-supported row', 'Machine row', 'Chest-supported T-bar row'],
  'Shoulder press': ['Seated DB shoulder press', 'Machine shoulder press', 'Seated Arnold press'],
  'Side delts': ['Cable lateral raise', 'DB lateral raise', 'Machine lateral raise', 'Lateral raise drop set'],
  'Rear delts': ['Reverse pec deck', 'Face pull', 'Rear delt cable fly'],
  'Biceps': ['EZ-bar curl', 'Cable curl', 'Incline DB curl', 'Hammer curl', 'Preacher curl', 'DB curl'],
  'Triceps': ['Rope pushdown', 'Overhead cable extension', 'Straight-bar pushdown', 'Machine dip', 'EZ-bar skull crusher'],
  'Abs': ['Cable crunch', 'Hanging knee raise', 'Machine crunch', 'Ab wheel']
};
var SMALL_LIFTS = ['Chest fly', 'Side delts', 'Rear delts', 'Biceps', 'Triceps', 'Abs'];   // +1–2 kg steps
var NOT_ALLOWED = /dead ?lift|\brdl\b|romanian|good ?morning|back squat|front squat|^squat$|barbell squat|hip thrust|kettlebell swing|trap.?bar|calf|calves/i;

/** An old or imported exercise name -> the name the templates use (unknown names stay as they are). */
function canonicalExercise(name) {
  var n = String(name || '').trim();
  return ALIASES[n.toLowerCase()] || n;
}
function muscleOf(exercise) {
  var c = canonicalExercise(exercise).toLowerCase();
  return Object.keys(MUSCLES).filter(function (m) { return MUSCLES[m].some(function (x) { return x.toLowerCase() === c; }); })[0] || '';
}
function allowedExercise(name) { return !!String(name || '').trim() && !NOT_ALLOWED.test(String(name)); }
/** Alternatives for the Swap button: same muscle, no hip hinges, no calves. */
function swapOptions(exercise) {
  var m = muscleOf(exercise), c = canonicalExercise(exercise).toLowerCase();
  return m ? MUSCLES[m].filter(function (x) { return x.toLowerCase() !== c && allowedExercise(x); }) : [];
}

/** The top of a rep range ("8-10" -> 10, "10 each leg" -> 10, "to failure" -> 0). */
function repTop(reps) {
  var s = String(reps || ''), m = s.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  return m ? Number(m[2]) : firstInt(s);
}
/**
 * Progression: if every working set last time hit the top of the rep range at or below the target RPE
 * (sets logged without an RPE count as fine), add 2.5 kg, or 1–2 kg on small isolation lifts.
 * last: [{ w, r, rpe }]. Returns { add, weight, text } or null.
 */
function progressionHint(exercise, reps, rpe, last) {
  var top = repTop(reps), work = (last || []).filter(function (s) { return s.t !== 'W' && s.r > 0; });
  if (!top || !work.length) return null;
  var target = Number(rpe) || 10;
  var ok = work.every(function (s) { return s.r >= top && (!(Number(s.rpe) > 0) || Number(s.rpe) <= target); });
  if (!ok) return null;
  var small = SMALL_LIFTS.indexOf(muscleOf(exercise)) !== -1, add = small ? 1 : 2.5, w = Math.max.apply(null, work.map(function (s) { return s.w; }));
  if (!(w > 0)) return null;
  return { add: add, weight: Math.round((w + add) * 4) / 4, text: 'Every set hit ' + top + ' reps' + (rpe ? ' at RPE ' + rpe + ' or easier' : '') + ': add ' + (small ? '1–2 kg' : '2.5 kg') + ' (' + Math.round((w + add) * 4) / 4 + ' kg).' };
}

/** The next session in a rotation: the one after the last you did (the first if you haven't done any). */
function rotationAfter(order, doneIds) {
  var last = (doneIds || []).filter(function (id) { return order.indexOf(id) !== -1; }).slice(-1)[0];
  return last ? order[(order.indexOf(last) + 1) % order.length] : order[0];
}

// ---------- state ----------

/** { split, since, skip }: sessions of this split count from `since` on (the first `skip` on that day were before you switched). */
function splitState_() {
  var s = JSON.parse(prop_('TRAIN_SPLIT') || 'null');
  if (s && !SPLITS[s.split]) {
    // a split that's now presets (Push / Pull / Shoulders & Arms, Push / Pull / Legs): Upper / Lower from today, at Upper A
    var today = todayYmd_(), order = SPLITS[SPLIT_DEFAULT].order;
    var skip = mainDone_(today).filter(function (x) { return x.date === today && order.indexOf(x.template) !== -1; }).length;
    s = { split: SPLIT_DEFAULT, since: today, skip: skip, from: s.split };
    setProp_('TRAIN_SPLIT', JSON.stringify(s));
  }
  if (!s) s = { split: SPLIT_DEFAULT, since: '0000-00-00', skip: 0 };
  return s;
}
function tplEdits_() { return JSON.parse(prop_('TRAIN_TPL') || '{}'); }
/** Workouts you saved from the Train tab: { 'my-…': { name, ex: [rows], at } }. They work like presets. */
function myWorkouts_() { return JSON.parse(prop_('TRAIN_MINE') || '{}'); }
/** A template's definition: one of ours, or one of yours. */
function tplDef_(id, mine) {
  if (TEMPLATES[id]) return TEMPLATES[id];
  var m = (mine || myWorkouts_())[id];
  return m ? { name: m.name, focus: 'Your workout', mins: m.mins || 60, ex: m.ex, mine: true } : null;
}
/** The presets in order: ours, then yours, then the Pump last. */
function presetIds_() { return PRESETS.filter(function (x) { return x !== PUMP_ID; }).concat(Object.keys(myWorkouts_()), [PUMP_ID]); }

/** A template as you'll do it: your edits, then your swaps. Each exercise: { exercise, base, swapped, sets, reps, rpe, rest, restSec, group }. */
function templateOf_(id, edits) {
  var t = tplDef_(id); if (!t) return null;
  var e = (edits || tplEdits_())[id] || {}, rows = e.ex || t.ex, swaps = e.swaps || {};
  var ex = rows.map(function (r) {
    var base = String(r[0]), name = swaps[base] || base;
    return { exercise: name, base: base, swapped: name !== base, sets: Number(r[1]) || 1, reps: String(r[2]), rpe: r[3] === '' || r[3] === null ? '' : Number(r[3]), rest: String(r[4] || ''), restSec: parseRestSeconds(r[4]), group: String(r[5] || '') };
  });
  return { id: id, name: t.name, focus: t.focus, mins: t.mins, extra: !!t.extra, mine: !!t.mine, preset: !!t.mine || PRESETS.indexOf(id) !== -1, split: Object.keys(SPLITS).filter(function (s) { return SPLITS[s].order.indexOf(id) !== -1; })[0] || '', edited: !!e.ex, swaps: Object.keys(swaps).length, ex: ex };
}
/** A session name (as kept in the Gym log) -> its template: your split first, then the presets, then old names. */
function templateByName_(name, splitId) {
  var n = String(name || '').trim(); if (!n) return '';
  var sp = SPLITS[splitId || splitState_().split];
  var hit = sp.order.filter(function (id) { return TEMPLATES[id].name === n; })[0];
  if (hit) return hit;
  var mine = myWorkouts_();
  hit = presetIds_().filter(function (id) { return tplDef_(id, mine).name === n; })[0];
  return hit || LEGACY_TEMPLATES[n] || '';
}
// Session names logged before templates existed (the old rotation, and the Upper/Lower programme before that).
var LEGACY_TEMPLATES = { 'Push': 'ppsa-push', 'Pull': 'ppsa-pull', 'Shoulders & Arms': 'ppsa-sa', 'Upper A': 'ul-ua', 'Lower A': 'ul-la', 'Upper B': 'ul-ub', 'Lower B': 'ul-lb', 'Arms & Shoulders Pump': 'pump' };

/** Exercises for a session name, in the old { exercise, sets, reps, rpe, rest, notes } shape (calendar, Today card). */
function sessionExercises_(name, cfg) {
  var id = templateByName_(name);
  if (id && tplDef_(id)) return templateOf_(id).ex.map(function (x) { return { exercise: x.exercise, sets: String(x.sets), reps: x.reps, rpe: x.rpe === '' ? '' : String(x.rpe), rest: x.rest, notes: x.group ? 'Superset ' + x.group.toUpperCase() : '' }; });
  return (cfg || readConfig_()).sessions[name] || [];
}

/** Main sessions done, oldest first: [{ date, template }] from the Workout log and Gym done ticks (Pump never counts). */
function mainDone_(toYmd) {
  var seen = {}, out = [], mine = myWorkouts_();
  function add(date, tpl) { if (!tpl || tpl === PUMP_ID || !(TEMPLATES[tpl] || mine[tpl]) || seen[date + '|' + tpl]) return; seen[date + '|' + tpl] = 1; out.push({ date: date, template: tpl }); }
  rowsBetween_('workoutLog', '0000', toYmd).forEach(function (r) { add(String(r['Date']), String(r['Template'] || '') || LEGACY_TEMPLATES[String(r['Session'])]); });
  try { rowsBetween_('gym', '0000', toYmd).forEach(function (r) { if (/^Done/.test(String(r['Status'] || ''))) add(String(r['Date']), String(r['Template'] || '') || LEGACY_TEMPLATES[String(r['Session'])]); }); } catch (e) { /* no gym log yet */ }
  return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}
/** The next main session's template id, counting sessions done up to (and including) `throughYmd`. */
function nextTemplate_(throughYmd) {
  var st = splitState_(), order = SPLITS[st.split].order, skipped = 0;
  var done = mainDone_(throughYmd).filter(function (x) {
    if (order.indexOf(x.template) === -1 || x.date < st.since) return false;
    if (x.date === st.since && skipped < st.skip) { skipped++; return false; }
    return true;
  });
  return rotationAfter(order, done.map(function (x) { return x.template; }));
}
/** Main sessions this week (Monday to Sunday) towards the target. */
function weekMain_(ymd) {
  var mon = addDays_(ymd, -((dayOfWeek_(ymd) + 6) % 7)), days = {};
  mainDone_(ymd).forEach(function (x) { if (x.date >= mon) days[x.date] = 1; });
  var h = health_('me');
  return { done: Object.keys(days).length, target: h.on === false ? 0 : Number(h.trainDays) || WEEK_TARGET };
}

/** What the Train tab and the gym card need about the split. */
function splitInfo_(ymd) {
  var st = splitState_(), sp = SPLITS[st.split], edits = tplEdits_(), next = nextTemplate_(addDays_(ymd, -1));
  var doneToday = mainDone_(ymd).filter(function (x) { return x.date === ymd; }).map(function (x) { return x.template; });
  if (doneToday.length && sp.order.indexOf(doneToday[doneToday.length - 1]) !== -1) next = nextTemplate_(ymd);
  return {
    split: st.split, name: sp.name, since: st.since,
    presets: presetIds_().map(function (id) { var t = tplDef_(id); return { id: id, name: t.name, focus: t.focus, mins: t.mins, extra: !!t.extra, mine: !!t.mine }; }),
    splits: Object.keys(SPLITS).map(function (k) { return { id: k, name: SPLITS[k].name, sessions: SPLITS[k].order.map(function (id) { return TEMPLATES[id].name; }) }; }),
    order: sp.order.map(function (id) { return { id: id, name: TEMPLATES[id].name, focus: TEMPLATES[id].focus }; }),
    next: { id: next, name: TEMPLATES[next].name }, doneToday: doneToday,
    pump: { id: PUMP_ID, name: TEMPLATES[PUMP_ID].name, xp: PUMP_XP, doneToday: pumpDoneOn_(ymd) },
    week: weekMain_(ymd),
    templates: sp.order.concat(presetIds_()).reduce(function (o, id) { o[id] = templateOf_(id, edits); return o; }, {}),
    migration: JSON.parse(prop_('TRAIN_V3') || 'null')
  };
}
function pumpDoneOn_(ymd) {
  return rowsBetween_('workoutLog', ymd, ymd).some(function (r) { return String(r['Template'] || '') === PUMP_ID; });
}

// ---------- last time, and history by exercise ----------

/** The last workout's sets for each exercise (by its template name): { 'bench press': [{ w, r, rpe, t, date }] }. */
function lastByExercise_() {
  var rows = rowsBetween_('workoutLog', addDays_(todayYmd_(), -365), todayYmd_()), last = {}, out = {};
  rows.forEach(function (r) { var k = canonicalExercise(r['Exercise']).toLowerCase(); last[k] = String(r['Date']) + '|' + String(r['Workout'] || r['Session']); });
  rows.forEach(function (r) {
    var k = canonicalExercise(r['Exercise']).toLowerCase();
    if (String(r['Date']) + '|' + String(r['Workout'] || r['Session']) !== last[k]) return;
    (out[k] = out[k] || []).push({ w: Number(r['Weight (kg)']) || 0, r: Number(r['Reps']) || 0, rpe: r['RPE'] === '' || r['RPE'] === undefined ? '' : Number(r['RPE']), t: String(r['Type'] || ''), date: String(r['Date']) });
  });
  return out;
}
/** Each template exercise with what you did last time and the progression hint. */
function templatePlan_(id) {
  var t = templateOf_(id), last = lastByExercise_();
  t.ex.forEach(function (x) {
    var l = (last[canonicalExercise(x.exercise).toLowerCase()] || []).filter(function (s) { return s.t !== 'W'; });
    x.last = l; x.lastDate = l.length ? l[0].date : '';
    x.hint = progressionHint(x.exercise, x.reps, x.rpe, l);
    x.options = swapOptions(x.base);
  });
  return t;
}

/** Main lifts over your whole history (Strong and Liftoff imports included): best estimated 1RM per day. */
var MAIN_LIFTS = ['Bench press', 'Hack squat', 'Lat pulldown', 'Seated cable row', 'Incline DB press', 'Seated DB shoulder press', 'Leg press', 'Chest-supported row'];
function liftHistory_() {
  var by = {};
  rowsBetween_('workoutLog', '0000', '9999').forEach(function (r) {
    if (String(r['Type'] || '') === 'W') return;
    var name = canonicalExercise(r['Exercise']); if (MAIN_LIFTS.indexOf(name) === -1) return;
    var w = Number(r['Weight (kg)']) || 0, reps = Number(r['Reps']) || 0, est = Number(r['e1RM']) || (w && reps ? e1rm(w, reps) : 0), d = String(r['Date']);
    if (!est) return;
    by[name] = by[name] || {};
    var day = by[name][d] = by[name][d] || { e: 0, w: 0, r: 0 };
    if (est > day.e) day.e = est;
    if (w > day.w || (w === day.w && reps > day.r)) { day.w = w; day.r = reps; }
  });
  return MAIN_LIFTS.filter(function (n) { return by[n]; }).map(function (n) {
    return { lift: n, points: Object.keys(by[n]).sort().map(function (d) { var x = by[n][d]; return [d, Math.round(x.e * 10) / 10, x.w, x.r]; }) };
  });
}

// ---------- called from the app ----------

/** Pick the main split. History stays; the new split starts at its first session. */
function setSplit(key, split) {
  requireKey_(key);
  if (!SPLITS[split]) throw new Error('No split called "' + split + '".');
  return withLock_(function () {
    var cur = splitState_(), today = todayYmd_();
    if (cur.split === split && prop_('TRAIN_SPLIT')) return appState_('me');
    var skip = mainDone_(today).filter(function (x) { return x.date === today && SPLITS[split].order.indexOf(x.template) !== -1; }).length;
    setProp_('TRAIN_SPLIT', JSON.stringify({ split: split, since: today, skip: skip, from: cur.split }));
    var o = JSON.parse(prop_('GYM_TODAY') || 'null');
    if (o && o.date === today && rotationDoneOn_(today) === '') delProp_('GYM_TODAY');     // today's plan follows the new split
    try { if (todaySession_(today)) planGymDay_(today, readConfig_()); } catch (e) { log_('WARN', 'Re-planning after a split change: ' + e); }
    return appState_('me');
  });
}

function checkTpl_(id) { if (!tplDef_(id)) throw new Error('No template called "' + id + '".'); }
/** Rows from the app -> template rows, checked against the rules. */
function tplRows_(rows) {
  var list = (rows || []).filter(function (r) { return r && String(r.exercise || '').trim(); }).slice(0, 12).map(function (r) {
    var name = String(r.exercise).trim().slice(0, 60);
    if (!allowedExercise(name)) throw new Error(name + ' breaks the rules: no hip hinges and no calf raises.');
    var rpe = r.rpe === '' || r.rpe === null || r.rpe === undefined ? '' : Math.max(5, Math.min(10, Number(r.rpe) || 8));
    return [name, Math.max(1, Math.min(10, Math.round(Number(r.sets) || 3))), String(r.reps || '8-12').slice(0, 20), rpe, String(r.rest || '90s').slice(0, 16), /^[a-f]$/.test(String(r.group || '')) ? String(r.group) : ''];
  });
  if (!list.length) throw new Error('Keep at least one exercise.');
  return list;
}

/** Swap one exercise in a template for another that hits the same muscle (name '' puts the original back). Kept until you change it back. */
function swapExercise(key, id, base, name) {
  requireKey_(key); checkTpl_(id);
  base = String(base || ''); name = String(name || '').trim().slice(0, 60);
  if (name && !allowedExercise(name)) throw new Error(name + ' breaks the rules: no hip hinges and no calf raises.');
  return withLock_(function () {
    var all = tplEdits_(), e = all[id] = all[id] || {};
    e.swaps = e.swaps || {};
    if (!name || name === base) delete e.swaps[base]; else e.swaps[base] = name;
    if (!Object.keys(e.swaps).length) delete e.swaps;
    if (!Object.keys(e).length) delete all[id];
    setProp_('TRAIN_TPL', JSON.stringify(all));
    return appState_('me');
  });
}

/** Edit a template: rows [{ exercise, sets, reps, rpe, rest, group }]. */
function editTemplate(key, id, rows) {
  requireKey_(key); checkTpl_(id);
  var list = tplRows_(rows);
  return withLock_(function () {
    var all = tplEdits_();
    all[id] = all[id] || {};
    all[id].ex = list;
    if (all[id].swaps) list.forEach(function (r) { delete all[id].swaps[r[0]]; });   // an edited name replaces its old swap
    setProp_('TRAIN_TPL', JSON.stringify(all));
    return appState_('me');
  });
}

/** Back to the template as it came: your edits and swaps for it go. */
function resetTemplate(key, id) {
  requireKey_(key); checkTpl_(id);
  return withLock_(function () {
    var all = tplEdits_();
    if (all[id]) archive_('Training', 'Template edits before reset: ' + id, all[id]);
    delete all[id];
    setProp_('TRAIN_TPL', JSON.stringify(all));
    return appState_('me');
  });
}

/** Save your own workout (a new one, or replace yours with this id). It shows with the presets: any day, a full gym session, the rotation stays put. */
function saveMyWorkout(key, name, rows, id) {
  requireKey_(key);
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new Error('Give it a name, like Arms day.');
  var list = tplRows_(rows);
  return withLock_(function () {
    var mine = myWorkouts_();
    if (id && !mine[id]) throw new Error('That workout isn\'t there any more.');
    var taken = Object.keys(SPLITS).reduce(function (a, k) { return a.concat(SPLITS[k].order); }, []).concat(PRESETS, Object.keys(mine)).filter(function (x) { return x !== id; })
      .some(function (x) { return tplDef_(x, mine).name.toLowerCase() === name.toLowerCase(); });
    if (taken) throw new Error('There\'s already a workout called ' + name + '. Pick another name.');
    if (!id && Object.keys(mine).length >= 20) throw new Error('That\'s 20 of your own workouts. Delete one first.');
    id = id || 'my-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    mine[id] = { name: name, ex: list, at: todayYmd_(), mins: Math.min(120, 10 + list.reduce(function (a, r) { return a + r[1] * 3; }, 0)) };
    setProp_('TRAIN_MINE', JSON.stringify(mine));
    var st = appState_('me'); st.savedWorkout = id;
    return st;
  });
}
/** Delete one of your workouts. Its definition goes to the Archive tab; anything you logged with it stays. */
function deleteMyWorkout(key, id) {
  requireKey_(key);
  return withLock_(function () {
    var mine = myWorkouts_();
    if (!mine[id]) throw new Error('That workout isn\'t there any more.');
    archive_('Training', 'Your workout deleted: ' + mine[id].name, mine[id]);
    delete mine[id];
    setProp_('TRAIN_MINE', JSON.stringify(mine));
    return appState_('me');
  });
}

// ---------- once: back up, then move to templates ----------

/**
 * Runs once. Copies every gym tab (Workout log, Workouts, Gym log, Sessions, Programme, Lifts, TM history) and the
 * training settings into the backup spreadsheet, on a sheet that's never pruned. Then adds the RPE and Template
 * columns, renames the old Push / Pull / Shoulders & Arms / Pump rows in the Sessions tab to "Old: …" (kept; the
 * templates replace them) and records how your logged exercises map onto the templates. Nothing is deleted.
 */
function ensureSplits_() {
  if (prop_('TRAIN_V3')) return JSON.parse(prop_('TRAIN_V3'));
  var result = { at: new Date().toISOString(), backup: backupGym_() };
  ensureTab_('workoutLog'); ensureTab_('gym');
  var ss = sheet_('sessions'), sv = ss.getDataRange().getValues(), renamed = 0;
  var replaced = ['Push', 'Pull', 'Shoulders & Arms', 'Arms & Shoulders Pump'];
  for (var i = 1; i < sv.length; i++) {
    var n = String(sv[i][0]).trim();
    if (replaced.indexOf(n) !== -1) { ss.getRange(i + 1, 1).setValue('Old: ' + n); renamed++; }
  }
  if (renamed) { forget_('sessions'); configCache_ = null; }
  result.renamedRows = renamed;
  // how history maps on: every logged exercise name -> the template name it now counts as
  var names = {}, inTemplates = {};
  Object.keys(TEMPLATES).forEach(function (id) { TEMPLATES[id].ex.forEach(function (r) { inTemplates[r[0].toLowerCase()] = 1; }); });
  rowsBetween_('workoutLog', '0000', '9999').forEach(function (r) { var n2 = String(r['Exercise']).trim(); if (n2) names[n2] = (names[n2] || 0) + 1; });
  result.sets = 0; result.mapped = 0; result.renamed = {}; result.other = [];
  Object.keys(names).forEach(function (n3) {
    var c = canonicalExercise(n3); result.sets += names[n3];
    if (inTemplates[c.toLowerCase()]) { result.mapped += names[n3]; if (c !== n3) result.renamed[n3] = c; }
    else result.other.push(n3);
  });
  setProp_('TRAIN_V3', JSON.stringify(result));
  return result;
}

/** A full copy of the gym data in the backup spreadsheet, on its own sheet ("Gym before splits"). Returns rows saved. */
function backupGym_() {
  var tabs = {}, rows = 0;
  ['workoutLog', 'workouts', 'gym', 'sessions', 'programme', 'lifts', 'tmHistory'].forEach(function (k) {
    try { var v = sheet_(k).getDataRange().getValues().map(function (r) { return r.map(function (x) { return x instanceof Date ? x.toISOString() : x; }); }); tabs[TABS[k]] = v; rows += v.length; } catch (e) { /* tab not there */ }
  });
  var props = {}; ['GYM_TODAY', 'TRAIN_V2', 'TRAIN_SPLIT', 'TRAIN_TPL', 'HEALTH_me'].forEach(function (p) { if (prop_(p)) props[p] = prop_(p); });
  var packed = packSnapshot_({ app: 'Nudge', what: 'gym before splits', at: new Date().toISOString(), tabs: tabs, props: props });
  var b = backupBook_(), sh = b.book.getSheetByName('Gym before splits');
  if (!sh) { sh = b.book.insertSheet('Gym before splits'); sh.getRange(1, 1, 1, 4).setValues([['Saved at', 'Part', 'Parts', 'Data']]); }
  var parts = [];
  for (var i = 0; i < packed.length; i += BACKUP_CHUNK) parts.push(packed.slice(i, i + BACKUP_CHUNK));
  var at = new Date().toISOString();
  sh.getRange(sh.getLastRow() + 1, 1, parts.length, 4).setValues(parts.map(function (p, k) { return [at, k + 1, parts.length, p]; }));
  return { rows: rows, kb: Math.round(packed.length / 1024), sheet: 'Gym before splits' };
}
