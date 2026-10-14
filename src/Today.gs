/**
 * Today.gs: the app's Today tab. Today's gym session (with a Gym done
 * button) and a weigh-in box. Both do the same as ticking the matching
 * Google Task, and they tick that task too, so nothing is logged twice.
 */

function todayState_() {
  var ymd = todayYmd_();
  var cfg = readConfig_();
  var dow = dayOfWeek_(ymd);
  var session = todaySession_(ymd, cfg);
  var gym = null;
  if (session) {
    var r = findRow_('gym', 'Date', ymd);
    var row = r ? readRow_('gym', r) : {};
    gym = {
      session: session,
      travel: String(row['Travel'] || ''),
      leaveAt: hhmm_(row['Leave at']),
      weather: String(row['Weather'] || ''),
      done: /^Done/.test(String(row['Status'] || '')),
      exercises: (cfg.sessions[session] || []).map(function (ex) {
        return { exercise: String(ex.exercise), sets: String(ex.sets), reps: String(ex.reps), rpe: String(ex.rpe), rest: String(ex.rest), notes: String(ex.notes || '') };
      })
    };
  }
  var weights = rowsBetween_('weight', addDays_(ymd, -90), ymd).filter(function (w) { return w['Weight (kg)'] !== ''; });
  var last = weights[weights.length - 1];
  return {
    date: ymd,
    day: DAY_NAMES[dow],
    gym: gym,
    weighDay: parseDays(cfg.settings['Weigh-in days']).indexOf(dow) !== -1,
    weighedToday: !!last && last['Date'] === ymd,
    lastWeight: last ? { date: String(last['Date']), kg: Number(last['Weight (kg)']), change: last['Change (kg)'] } : null
  };
}

/** Marks today's tracked task of this type (and ref) as done, ticking it in Google Tasks too. */
function completeTracked_(type, ymd, ref) {
  var t = tracked_();
  Object.keys(t).forEach(function (id) {
    if (t[id].type !== type || t[id].date !== ymd || t[id].done || (ref && t[id].ref !== ref)) return;
    t[id].done = true;
    try { Tasks.Tasks.patch({ status: 'completed' }, TASK_LIST, id); } catch (e) { /* deleted already */ }
  });
  saveTracked_(t);
}

// ---- called from the page ----

function todayState(key) {
  requireKey_(key);
  return todayState_();
}

function gymDone(key) {
  requireKey_(key);
  return withLock_(function () {
    var ymd = todayYmd_();
    completeTracked_('gym', ymd);
    onGymTaskDone_({ completed: new Date().toISOString() }, { date: ymd });
    return todayState_();
  });
}

function logWeightNow(key, text) {
  requireKey_(key);
  var w = parseWeight(text, readConfig_().settings['Weight unit'] || 'kg');
  if (!w) throw new Error("Couldn't read a weight from that. Try 82.4, 13st 2 or 185 lb.");
  return withLock_(function () {
    var ymd = todayYmd_();
    completeTracked_('weigh', ymd);
    logWeight_(ymd, now_('HH:mm'), w);
    return todayState_();
  });
}
