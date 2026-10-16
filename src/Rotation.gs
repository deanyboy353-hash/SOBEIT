/**
 * Rotation.gs: the rotation helpers the rest of the app uses (the splits and templates themselves are in
 * Training.gs), plus the old one-off moves from the Upper/Lower programme. The rotation only moves on
 * when a session is actually logged (miss a day and the same session waits for you).
 * No barbell squats, deadlifts, RDLs or other hip hinges: hack squat, leg press, machines and seated work.
 * Push: chest + quads. Pull: back (extra volume) + hamstrings. Shoulders & Arms: delts, biceps, triceps, calves.
 * Weights come from what you lifted last time (beat the top of the rep range on every set and it goes up a step).
 */

var ROTATION = ['Push', 'Pull', 'Shoulders & Arms'];

// [Session, Exercise, Sets, Reps, RPE, Rest, Notes]
var ROTATION_SESSIONS = [
  ['Push', 'Barbell bench press', '4', '6-10', '8', '2.5 min', 'Main chest lift. Leave 2 reps in the tank.'],
  ['Push', 'Hack squat', '4', '8-10', '8', '2.5 min', 'Main quad lift. Full depth, controlled.'],
  ['Push', 'Incline DB press', '3', '8-10', '8', '2 min', ''],
  ['Push', 'Leg press', '3', '10-12', '8', '2 min', 'Feet low on the plate for more quads'],
  ['Push', 'Leg extension', '3', '12-15', '9', '75 sec', ''],
  ['Push', 'Cable fly', '3', '12-15', '9', '60 sec', ''],
  ['Push', 'Triceps pushdown', '3', '10-12', '9', '60 sec', ''],
  ['Pull', 'Lat pulldown', '4', '8-10', '8', '2 min', 'Main back lift'],
  ['Pull', 'Chest-supported row', '4', '8-10', '8', '2 min', 'Chest on the pad: no lower-back strain'],
  ['Pull', 'Seated cable row', '3', '10-12', '8', '90 sec', ''],
  ['Pull', 'Machine pullover', '3', '12-15', '9', '75 sec', 'Extra lat volume'],
  ['Pull', 'Seated leg curl', '4', '10-12', '9', '90 sec', 'Main hamstring lift'],
  ['Pull', 'Lying leg curl', '3', '10-12', '9', '75 sec', ''],
  ['Pull', 'Face pull', '3', '15-20', '9', '60 sec', ''],
  ['Shoulders & Arms', 'Seated DB shoulder press', '4', '8-10', '8', '2 min', ''],
  ['Shoulders & Arms', 'Cable lateral raise', '4', '12-15', '9', '60 sec', 'Last set: drop the weight and keep going'],
  ['Shoulders & Arms', 'Rear delt fly (machine)', '3', '15-20', '9', '60 sec', ''],
  ['Shoulders & Arms', 'EZ-bar curl', '3', '10-12', '9', '75 sec', ''],
  ['Shoulders & Arms', 'Overhead cable triceps extension', '3', '10-12', '9', '75 sec', ''],
  ['Shoulders & Arms', 'Incline DB curl', '3', '10-12', '9', '60 sec', ''],
  ['Shoulders & Arms', 'Machine dip', '3', '10-12', '9', '75 sec', ''],
  ['Shoulders & Arms', 'Seated calf raise', '3', '12-15', '9', '60 sec', '']
];
var HINGE = /dead ?lift|\brdl\b|romanian|good ?morning|back squat|front squat|^squat$|hip thrust|kettlebell swing|trap.?bar/i;

/** Which rotation session a logged workout was, from its exercises (for old "Upper A"-style entries). */
function classifySession(exercises) {
  var score = { 'Push': 0, 'Pull': 0, 'Shoulders & Arms': 0 };
  (exercises || []).forEach(function (e) {
    e = String(e).toLowerCase();
    if (/reverse fly|rear delt|lateral|shoulder press|overhead press/.test(e)) score['Shoulders & Arms']++;
    else if (/bench|chest|incline|fly|squat|leg press|leg extension|split squat|lunge|pec/.test(e)) score.Push++;
    else if (/row|pulldown|pull.?ups?\b|chin|pullover|leg curl|hamstring|face pull|lat\b|deadlift/.test(e)) score.Pull++;
    else if (/shoulder|overhead press|lateral|rear delt|curl|triceps|tricep|dip|calf|shrug/.test(e)) score['Shoulders & Arms']++;
  });
  var best = '', top = 0;
  ROTATION.forEach(function (s) { if (score[s] > top) { top = score[s]; best = s; } });
  return best;
}

/** Main sessions completed, oldest first: [{ date, session, template }] (any split; the Pump never counts). See Training.gs. */
function rotationDone_(toYmd) {
  return mainDone_(toYmd).map(function (x) { return { date: x.date, session: TEMPLATES[x.template].name, template: x.template }; });
}
/** The next session in your split's rotation, by name: the one after the last you did. Skipping a day moves nothing. */
function rotationNext_(ymd) { return TEMPLATES[nextTemplate_(addDays_(ymd, -1))].name; }
/** Main session completed on a day ('' if none). */
function rotationDoneOn_(ymd) {
  var d = mainDone_(ymd).filter(function (x) { return x.date === ymd; });
  return d.length ? TEMPLATES[d[d.length - 1].template].name : '';
}

/**
 * Once: put the rotation in the Sessions and Programme tabs and the weekly plan, keep the old Upper/Lower
 * rows (renamed "Old: ...", ignored by the app), and fix old feed and XP labels ("Gym: Upper A" -> the session it really was).
 */
function ensureRotation_() {
  if (prop_('TRAIN_V2')) return;
  var ss = sheet_('sessions'), sv = ss.getDataRange().getValues(), changed = false;
  for (var i = 1; i < sv.length; i++) {
    var n = String(sv[i][0]).trim();
    if (/^(Upper|Lower) [AB]$/.test(n)) { ss.getRange(i + 1, 1).setValue('Old: ' + n); changed = true; }
    else if (ROTATION.indexOf(n) !== -1) { ss.getRange(i + 1, 1).setValue('Old: ' + n + ' preset'); changed = true; }   // the old Push/Pull presets share a name: kept, renamed
    else if (n === 'Full Body Express' && HINGE.test(String(sv[i][1]))) { ss.getRange(i + 1, 2).setValue('Leg press'); ss.getRange(i + 1, 7).setValue('Swapped in for a hip hinge'); changed = true; }
  }
  var have = {}; ss.getDataRange().getValues().slice(1).forEach(function (r) { have[String(r[0]).trim() + '|' + String(r[1]).trim()] = 1; });
  var add = ROTATION_SESSIONS.filter(function (r) { return !have[r[0] + '|' + r[1]]; });
  if (add.length) { ss.getRange(ss.getLastRow() + 1, 1, add.length, 7).setValues(add); changed = true; }
  if (changed) { forget_('sessions'); configCache_ = null; }
  var ps = sheet_('programme'), pv = ps.getDataRange().getValues();
  for (var j = 1; j < pv.length; j++) { var pn = String(pv[j][0]).trim(); if (/^(Upper|Lower) [AB]$/.test(pn)) ps.getRange(j + 1, 1).setValue('Old: ' + pn); }
  forget_('programme');
  // weekly plan: training days follow the rotation
  var cv = sheet_('config').getDataRange().getValues();
  for (var k = 0; k < cv.length; k++) if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(String(cv[k][0])) && /^(Upper|Lower) [AB]$/.test(String(cv[k][2]))) sheet_('config').getRange(k + 1, 3).setValue('Rotation');
  forget_('config'); configCache_ = null;
  relabelOldSessions_();
  setProp_('TRAIN_V2', '1');
}

/** "Gym: Upper A" in the feed, the XP log and the Gym tab -> the rotation session those exercises really were. */
function relabelOldSessions_() {
  var byDate = {};
  rowsBetween_('workoutLog', '0000', '9999').forEach(function (r) { (byDate[String(r['Date'])] = byDate[String(r['Date'])] || []).push(String(r['Exercise'])); });
  var guess = function (d) { return classifySession(byDate[d] || []) || 'Push'; };
  var xs = sheet_('xp'), xv = xs.getDataRange().getValues(), head = xv[0], wc = head.indexOf('What'), dc = head.indexOf('Date');
  for (var i = 1; i < xv.length; i++) {
    var m = /^Gym: (Upper|Lower) [AB]$/.exec(String(xv[i][wc]));
    if (m) { var d = xv[i][dc] instanceof Date ? Utilities.formatDate(xv[i][dc], TZ, 'yyyy-MM-dd') : String(xv[i][dc]); xs.getRange(i + 1, wc + 1).setValue('Gym: ' + guess(d)); }
  }
  forget_('xp'); xpCache_ = null;
  var f = feed_(), fc = false;
  f.forEach(function (e) { var m2 = /^Gym: (Upper|Lower) [AB]/.exec(e.text || ''); if (m2) { e.text = e.text.replace(/^Gym: (Upper|Lower) [AB]/, 'Gym: ' + guess(e.date)); fc = true; } });
  if (fc) PROPS.setProperty('FEED', JSON.stringify(f));
  try {
    var gs = sheet_('gym'), gv = gs.getDataRange().getValues(), sc = gv[0].indexOf('Session'), gd = gv[0].indexOf('Date');
    for (var g = 1; g < gv.length; g++) if (sc >= 0 && /^(Upper|Lower) [AB]$/.test(String(gv[g][sc]))) { var dd = gv[g][gd] instanceof Date ? Utilities.formatDate(gv[g][gd], TZ, 'yyyy-MM-dd') : String(gv[g][gd]); if (byDate[dd]) gs.getRange(g + 1, sc + 1).setValue(guess(dd)); }
    forget_('gym');
  } catch (e) { /* no gym tab yet */ }
}
