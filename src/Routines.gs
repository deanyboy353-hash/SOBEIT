/**
 * Routines.gs: morning and evening checklists (Routines tab), a water
 * counter and an optional meds reminder. Your routines also arrive as a
 * calendar alert at their time; one tap per step in the app.
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

/** Daily job: calendar alerts for your routines and meds. */
function planRoutines_(ymd, cfg) {
  removeTaggedEvents_(ymd, 'routine');
  var routines = readRoutines_('me');
  routines.forEach(function (r) {
    if (r.time === null || !r.steps.length) return;
    var ev = CalendarApp.getDefaultCalendar().createEvent((r.name === 'Evening' ? '🌙 ' : '🌅 ') + r.name + ' routine (' + r.steps.length + ' steps)',
      atTime_(ymd, r.time), atTime_(ymd, r.time + 10), { description: r.steps.map(function (s) { return '☐ ' + s; }).join('\n') + '\n\nTick them off in the app: ' + appUrl_() });
    ev.setTag(EVENT_TAG, 'routine'); ev.removeAllReminders(); ev.addPopupReminder(0);
    ev.setColor(CalendarApp.EventColor.MAUVE);
  });
  var meds = cellClock_(cfg.settings['Meds reminder']);
  if (meds !== null) {
    var m = CalendarApp.getDefaultCalendar().createEvent('💊 Meds', atTime_(ymd, meds), atTime_(ymd, meds + 5), { description: 'Take your meds, then tick the step in your routine.' });
    m.setTag(EVENT_TAG, 'routine'); m.removeAllReminders(); m.addPopupReminder(0);
  }
  return routines.length + ' routines';
}

function routinesState_(who) {
  var d = dayState_();
  var nowMin = parseClock(now_('HH:mm'));
  return {
    routines: readRoutines_(who).map(function (r) {
      var k = who + '|' + r.name;
      return { name: r.name, time: r.time === null ? '' : formatClock(r.time), steps: r.steps, done: d.done[k] || [], finished: !!d.finished[k],
        showNow: r.time === null || nowMin >= r.time - 60 || (r.time < 6 * 60 && nowMin < 6 * 60) };
    }),
    water: d.water[who] || 0,
    waterGoal: num_(readConfig_().settings, 'Water goal (glasses)', 8)
  };
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
    var goal = num_(readConfig_().settings, 'Water goal (glasses)', 8);
    var before = d.water[who] || 0;
    d.water[who] = Math.max(0, before + (Number(delta) || 1));
    if (goal && before < goal && d.water[who] >= goal) addXp_(who, 'Water goal hit 💧', 5, 'water');
    saveDay_(d);
    return appState_(who);
  });
}
