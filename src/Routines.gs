/**
 * Routines.gs: morning and evening checklists (Routines tab), a water
 * counter. One tap per step in the app.
 */

function readRoutines_(who) {
  return vals_('routines').slice(1)
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return {
        name: String(r[0]).trim(),
        who: String(r[1] || 'Me').trim().toLowerCase().replace(/^(you|anyone)$/, 'me'),
        time: cellClock_(r[2]),
        steps: String(r[3] || '').split(/\s*;\s*|\n/).filter(String)
      };
    })
    .filter(function (r) { return !who || r.who === who; });
}

/** Today's ticks: {date, done: {"me|Morning": [0, 2]}, water: {me: 3}, finished: {"me|Morning": true}} */
function dayState_() {
  var props = PROPS;
  var d = JSON.parse(props.getProperty('DAY') || 'null');
  if (!d || d.date !== todayYmd_()) d = { date: todayYmd_(), done: {}, water: {}, finished: {} };
  return d;
}

function saveDay_(d) {
  PROPS.setProperty('DAY', JSON.stringify(d));
}

/**
 * How a routine shows on Home right now: 'open' (the full checklist), 'summary' (one line, e.g. "Morning routine 3/6")
 * or 'hidden'. Morning routines are open 05:00-12:00 and fold to a summary until 18:00; evening ones appear at 18:00
 * (and stay until 03:00). Anything else keeps the old rule: from an hour before its time until it's finished.
 */
function routinePhase(r, nowMin, finished) {
  var t = r.time === null || r.time === undefined || r.time === '' ? null : Number(r.time);
  var evening = /evening|night|bed/i.test(r.name) || (t !== null && t >= 17 * 60);
  var morning = !evening && (/morning|wake/i.test(r.name) || (t !== null && t < 12 * 60));
  if (evening) return nowMin >= 18 * 60 || nowMin < 3 * 60 ? (finished ? 'summary' : 'open') : 'hidden';
  if (morning) return nowMin >= 18 * 60 || nowMin < 5 * 60 ? 'hidden' : nowMin >= 12 * 60 || finished ? 'summary' : 'open';
  return !finished && (t === null || nowMin >= t - 60) ? 'open' : 'hidden';
}

function routinesState_(who) {
  var d = dayState_();
  var nowMin = parseClock(now_('HH:mm'));
  return {
    routines: readRoutines_(who).map(function (r) {
      var k = who + '|' + r.name;
      return { name: r.name, time: r.time === null ? '' : formatClock(r.time), steps: r.steps, done: d.done[k] || [], finished: !!d.finished[k],
        showNow: r.time === null || nowMin >= r.time - 60 || (r.time < 6 * 60 && nowMin < 6 * 60), phase: routinePhase(r, nowMin, !!d.finished[k]) };
    }),
    evening: nowMin >= 18 * 60 || nowMin < 3 * 60,
    water: d.water[who] || 0,
    waterGoal: waterGoal_(who)
  };
}

/** Your own water goal (set in the app), or the Config tab's. 0 hides the water tile. */
function waterGoal_(who) {
  var p = prefs_(who);
  return p.waterGoal !== undefined && p.waterGoal !== '' ? Number(p.waterGoal) : num_(readConfig_().settings, 'Water goal (glasses)', 8);
}

// ---- called from the page ----

function routineStep(key, routine, index) {
  var who = who_(key);
  return withLock_(function () {
    var d = dayState_();
    var k = who + '|' + routine;
    var r = readRoutines_(who).filter(function (x) { return x.name === routine; })[0];
    if (!r) throw new Error('That routine is no longer in the Routines tab.');
    var list = d.done[k] || [];
    var i = list.indexOf(Number(index));
    if (i === -1) list.push(Number(index)); else list.splice(i, 1);
    d.done[k] = list;
    if (!d.finished[k] && list.length >= r.steps.length) {
      d.finished[k] = true;
      addXp_(who, r.name + ' routine done', 10, 'routine');
    }
    saveDay_(d);
    return appState_(who);
  });
}

function addWater(key, delta) {
  var who = who_(key);
  return withLock_(function () {
    var d = dayState_();
    var goal = waterGoal_(who);
    var before = d.water[who] || 0;
    d.water[who] = Math.max(0, before + (Number(delta) || 1));
    if (goal && before < goal && d.water[who] >= goal) addXp_(who, 'Water goal hit ', 5, 'water');
    saveDay_(d);
    return appState_(who);
  });
}

// ---- editing routines from the app (no Sheet needed) ----

function routineRow_(who, name) {
  var v = vals_('routines');
  for (var i = 1; i < v.length; i++) {
    var w = String(v[i][1] || 'Me').trim().toLowerCase().replace(/^(you|anyone)$/, 'me');
    if (String(v[i][0]).trim() === name && w === who) return i + 1;
  }
  return 0;
}

/** Add or change a routine. oldName '' makes a new one. Ticks already made today follow their step. */
function saveRoutine(key, oldName, r) {
  var who = who_(key);
  r = r || {};
  var name = String(r.name || '').replace(/[;|]/g, '').trim().slice(0, 40);
  var steps = (r.steps || []).map(function (s) { return String(s || '').replace(/;/g, ',').replace(/\s+/g, ' ').trim().slice(0, 80); }).filter(Boolean).slice(0, 25);
  var time = r.time === '' || r.time === null || r.time === undefined ? null : parseClock(String(r.time));
  if (!name) throw new Error('Give the routine a name, like Morning.');
  if (!steps.length) throw new Error('Add at least one step.');
  if (r.time && time === null) throw new Error('That time doesn\'t look right. Try 08:30.');
  oldName = String(oldName || '').trim();
  return withLock_(function () {
    var clash = routineRow_(who, name);
    var row = oldName ? routineRow_(who, oldName) : 0;
    if (clash && clash !== row) throw new Error('You already have a routine called ' + name + '.');
    var oldSteps = row ? String(vals_('routines')[row - 1][3] || '').split(/\s*;\s*|\n/).filter(String) : [];
    var cells = [[name, who === 'me' ? 'Me' : 'Partner', time === null ? '' : formatClock(time), steps.join('; ')]];
    var sh = sheet_('routines');
    if (row) sh.getRange(row, 1, 1, 4).setNumberFormat('@').setValues(cells);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setNumberFormat('@').setValues(cells);
    forget_('routines');
    // keep today's ticks on the same steps (by their words), under the new name
    var d = dayState_(), ok = who + '|' + (oldName || name), nk = who + '|' + name;
    var done = (d.done[ok] || []).map(function (i) { return steps.indexOf(oldSteps[i]); }).filter(function (i) { return i !== -1; });
    var fin = !!d.finished[ok];
    delete d.done[ok]; delete d.finished[ok];
    if (done.length) d.done[nk] = done;
    if (fin) d.finished[nk] = true;
    saveDay_(d);
    return appState_(who);
  });
}

function deleteRoutine(key, name) {
  var who = who_(key);
  return withLock_(function () {
    var row = routineRow_(who, String(name || '').trim());
    if (!row) throw new Error('That routine is already gone.');
    sheet_('routines').deleteRow(row); forget_('routines');
    return appState_(who);
  });
}

/** One-off: drop the old default "Look at the Home tab" step (Home is where the routine already is). Other steps are left alone. */
function tidyRoutines_() {
  var rows = vals_('routines'), sh = sheet_('routines');
  for (var i = 1; i < rows.length; i++) {
    var steps = String(rows[i][3] || '').split(/\s*;\s*|\n/).filter(String), kept = steps.filter(function (s) { return !/^look at the home tab$/i.test(s.trim()); });
    if (kept.length && kept.length !== steps.length) sh.getRange(i + 1, 4).setNumberFormat('@').setValue(kept.join('; '));
  }
  forget_('routines');
  setProp_('ROUTINE_V2', '1');
}
