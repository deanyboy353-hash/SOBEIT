/**
 * GymDay.gs: item 1 (daily gym calendar event) and item 2 ("Gym done" task).
 */

var EVENT_TAG = 'sobeit';

/**
 * Today's session: the one you picked in the app if you changed it, otherwise
 * the weekly plan in the Config tab. '' means a rest day.
 */
function todaySession_(ymd, cfg) {
  var o = JSON.parse(prop_('GYM_TODAY') || 'null');
  if (o && o.date === ymd) return o.session || rotationDoneOn_(ymd);
  cfg = cfg || readConfig_();
  var day = cfg.schedule[dayOfWeek_(ymd)];
  if (!day || !day.train) {
    if (!flexGym_(cfg) || weekSessionsLeft_(ymd) <= 0) return rotationDoneOn_(ymd);
    return rotationDoneOn_(ymd) || rotationNext_(ymd);
  }
  return rotationDoneOn_(ymd) || (!day.session || day.session === 'Rotation' || LEGACY_TEMPLATES[day.session] || templateByName_(day.session) ? rotationNext_(ymd) : day.session);   // a named custom session on the plan stays
}

/** Any day can be a gym day (until the week's target is hit) when this setting is on. */
function flexGym_(cfg) { return /^(true|yes|y|1)$/i.test(String((cfg || readConfig_()).settings['Train any day I can make the bus'] || '')); }
/** Sessions still to do this week (Mon to Sun) to hit the target from setup (default 4). */
function weekSessionsLeft_(ymd) {
  var h = health_('me'), target = h.on === false ? 0 : Number(h.trainDays) || 4, mon = addDays_(ymd, -((dayOfWeek_(ymd) + 6) % 7));
  var done = {}; rotationDone_(addDays_(ymd, -1)).forEach(function (x) { if (x.date >= mon) done[x.date] = 1; });
  return target - Object.keys(done).length;
}

function planGymDay_(ymd, cfg) {
  var dow = dayOfWeek_(ymd);
  var session = todaySession_(ymd, cfg);
  var day = Object.assign({ freeFrom: null, alertAt: null }, cfg.schedule[dow] || {}, { train: !!session, session: session });
  if (!session) {
    removeTaggedEvents_(ymd, 'gym');
    return 'Rest day';
  }
  var s = cfg.settings;
  var warnings = [];
  var exercises = sessionExercises_(day.session, cfg);
  if (!exercises || !exercises.length) {
    warnings.push('No exercises found for "' + day.session + '".');
    exercises = [];
  }

  // The day's two main lifts (Programme + Lifts tabs) go first, with real weights.
  var plan = workoutPlan_(day.session);
  var lines = mainLiftLines_(plan);
  var main = plan.main.map(function (m, i) { return { line: lines[i], sets: m.sets.length, rest: m.rest }; });
  exercises = main.concat(exercises);
  var sessionMinutes = num_(s, 'Session length (min)', 0) ||
    estimateSessionMinutes(exercises, { secondsPerSet: num_(s, 'Seconds per working set', 60), warmup: num_(s, 'Warm-up (min)', 10) });
  var tp = transportPlan_(ymd, dow, day, cfg, sessionMinutes);
  var t = tp.plan, hm = formatClock;
  var title, start, end;
  if (t.mode === 'bike') { title = day.session + ' · E-bike · leave ' + hm(t.bike.leave); start = t.bike.leave; end = t.bike.home; }
  else if (t.ok) { title = day.session + ' · Bus ' + t.out.route + ' ' + hm(t.out.dep) + ' · leave ' + hm(t.leaveBy); start = t.leaveBy; end = t.homeBy; }
  else if (!(cfg.schedule[dow] || {}).train) {   // an optional day and no way there after work: just a rest day
    setProp_('GYM_TODAY', JSON.stringify({ date: ymd, session: '' }));
    removeTaggedEvents_(ymd, 'gym');
    return 'Rest day (no bus fits after work)';
  }
  else { title = 'Move ' + day.session + ' to ' + tp.moveTo + '? No bus after work'; start = tp.free; end = tp.free + 30; }
  var lines = tp.lines.concat(tp.weather ? ['Weather: ' + tp.weather] : []).concat(warnings.map(function (w) { return 'Note: ' + w; }));
  lines.push('', day.session.toUpperCase());
  exercises.forEach(function (ex, i) { lines.push(formatExercise(ex, i)); });
  lines.push('', 'Log it in the app\'s Train tab.');

  removeTaggedEvents_(ymd, 'gym');
  var event = CalendarApp.getDefaultCalendar().createEvent(title, atTime_(ymd, start), atTime_(ymd, end), {
    description: lines.join('\n'),
    location: s['Gym name'] || 'JD Gym Coatbridge'
  });
  event.setTag(EVENT_TAG, 'gym');
  event.removeAllReminders();
  var alertAt = day.alertAt !== null && day.alertAt < start ? day.alertAt : start - 15;
  if (start - alertAt > 0) event.addPopupReminder(start - alertAt);
  event.addPopupReminder(0);
  event.setColor(t.mode === 'bike' ? CalendarApp.EventColor.GREEN : t.ok ? CalendarApp.EventColor.BLUE : CalendarApp.EventColor.ORANGE);
  var text = { title: title };

  var row = {
    'Date': ymd, 'Day': DAY_NAMES[dow], 'Session': day.session, 'Travel': t.mode === 'bike' ? 'Bike' : t.ok ? 'Bus' : 'Move',
    'Leave at': hm(start), 'Weather': tp.weather || 'no forecast',
    'Bus': t.ok && t.mode !== 'bike' ? t.out.route + ' ' + hm(t.out.dep) + ' / ' + t.back.route + ' ' + hm(t.back.dep) : '',
    'Gym window': t.mode === 'bike' ? hm(t.bike.gymFrom) + '–' + hm(t.bike.gymTo) : t.ok ? hm(t.gymFrom) + '–' + hm(t.gymTo) : '',
    'Home by': hm(t.mode === 'bike' ? t.bike.home : t.ok ? t.homeBy : end), 'Plan': tp.lines.join('\n')
  };
  var r = findRow_('gym', 'Date', ymd);
  if (r) updateRow_('gym', r, row);
  else appendRow_('gym', Object.assign(row, { 'Status': 'Planned' }));
  return text.title;
}

/** Each morning: a gym day from before that wasn't logged is marked as not done. */
/** Gym done (from the app): log it once with its XP, and record the session so the rotation moves on. Main sessions only (never the Pump). */
function markGymDone_(ymd, session, template) {
  var r = findRow_('gym', 'Date', ymd);
  var before = r ? readRow_('gym', r) : {};
  session = session || String(before['Session'] || '') || todaySession_(ymd) || '';
  if (!/^Done/.test(String(before['Status'] || ''))) addXp_('me', 'Gym: ' + (session || 'session done'), 50, 'gym');
  var update = { 'Status': 'Done', 'Ticked at': now_('HH:mm') };
  if (session && (!before['Session'] || !/^Done/.test(String(before['Status'] || '')))) update['Session'] = session;     // so the rotation knows what was done
  var tpl = template && tplDef_(template) ? template : templateByName_(session); if (tpl && tpl !== PUMP_ID) update['Template'] = tpl;
  if (r) updateRow_('gym', r, update);
  else appendRow_('gym', Object.assign({ 'Date': ymd, 'Day': DAY_NAMES[dayOfWeek_(ymd)] }, update));
}

function closeOldGymDays_(todayYmd) {
  rowsBetween_('gym', addDays_(todayYmd, -7), addDays_(todayYmd, -1)).forEach(function (row) {
    if (row['Status'] !== 'Planned') return;
    var r = findRow_('gym', 'Date', String(row['Date'])); if (r) updateRow_('gym', r, { 'Status': 'Not done' });
  });
}

/** Delete events this script made for that day (so re-running replaces rather than duplicates). */
function removeTaggedEvents_(ymd, kind) {
  CalendarApp.getDefaultCalendar().getEvents(atTime_(ymd, 0), atTime_(addDays_(ymd, 1), 0)).forEach(function (ev) {
    if (ev.getTag(EVENT_TAG) === kind) ev.deleteEvent();
  });
}

/**
 * The day's travel plan from the Transport section of the Config tab: the bus
 * (preferring the 3), the gym window, the bus back, home-by, and the e-bike when it's dry.
 */
function transportPlan_(ymd, dow, day, cfg, sessionMinutes) {
  var s = cfg.settings, tick = function (v) { return v === true || /^(true|yes|y|x|✓)$/i.test(String(v).trim()); };
  var dayOff = dayOffWork_('me', ymd, cfg);
  var free, earlyBy = num_(s, 'Can leave work early by (min)', 5);
  if (dayOff) free = ((dow === 0 || dow === 6) && cellClock_(s['Weekend: leave around'])) || cellClock_(s['Day off: leave around']) || 720;
  else {
    free = day.freeFrom !== null && day.freeFrom !== undefined ? day.freeFrom : (dow === 4 ? 960 : 900);
    if (dow === 4) {
      earlyBy = num_(s, 'Thursday: can leave work early by (min)', 0);
      if (tick(s['Thursday early finish'])) { free = cellClock_(s['Thursday early finish time']) || 900; earlyBy = num_(s, 'Can leave work early by (min)', 5); }
    }
  }
  var bikeMins = num_(s, 'E-bike each way (min)', num_(s, 'Bike: door to gym (min)', 17));
  var forecast = { hours: [] };
  try { forecast = fetchForecast_(num_(s, 'Weather latitude', 55.8622), num_(s, 'Weather longitude', -4.0266), ymd); } catch (e) { log_('WARN', 'Weather: ' + e); }
  var weather = chooseTravel(forecast.hours, free, free + 180, {
    maxRainProb: num_(s, 'Bike: max rain chance (%)', 30), maxRainMm: num_(s, 'Bike: max rain (mm per hour)', 0.3),
    minTemp: num_(s, 'Bike: min temperature (°C)', 3), maxGust: num_(s, 'Bike: max gusts (km/h)', 45)
  });
  var t = planTransport({
    dow: dow, free: free, dayOff: dayOff, earlyBy: earlyBy, tt: cfg.timetable || [],
    walkToStop: num_(s, 'Walk home to Whitelaw Avenue stop (min)', 2), gymToStance: num_(s, 'Walk JD Gym to Coatbridge Bus Stance (min)', 12),
    buffer: num_(s, 'Buffer before the bus back (min)', 2), minGym: num_(s, 'Gym time: at least (min)', 75), maxGym: num_(s, 'Gym time: at most (min)', 100),
    preferred: String(s['Preferred bus'] || '3').trim(), sessionMins: dayOff ? num_(s, 'Day off: session length (min)', 90) : sessionMinutes,
    bikeMins: bikeMins, bikeLeaveAfter: num_(s, 'E-bike: leave after work (min)', 5), dry: weather.mode === 'bike'
  });
  if (!t.ok && t.bike.dry) t.mode = 'bike';
  var offDays = parseDayRange(s['Days off work'] === undefined ? 'Fri, Sat, Sun' : s['Days off work']);
  var moveTo = '';
  for (var i = 1; i <= 7 && !moveTo; i++) { var d = (dow + i) % 7; if (offDays.indexOf(d) !== -1) moveTo = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]; }
  var lines = transportLines(t, { bikeMins: bikeMins, moveTo: moveTo || 'another day' });
  return { plan: t, lines: lines, free: free, dayOff: dayOff, moveTo: moveTo || 'another day', weather: weather.summary || '', dry: weather.mode === 'bike' };
}

/** For checking: the plan for a day, without touching the calendar. Thursday's toggle can be forced. */
function previewTransport_(ymd, thursdayEarly) {
  var cfg = readConfig_();
  if (thursdayEarly !== undefined) cfg = Object.assign({}, cfg, { settings: Object.assign({}, cfg.settings, { 'Thursday early finish': thursdayEarly ? 'TRUE' : 'FALSE' }) });
  var dow = dayOfWeek_(ymd), day = Object.assign({ freeFrom: null, alertAt: null }, cfg.schedule[dow] || {});
  return transportPlan_(ymd, dow, day, cfg, 90);
}

/** A day off work: your usual days off (Config: Days off work), the days Yaz doesn't work (from setup), or a day marked off in the app. */
function dayOffWork_(who, ymd, cfg) {
  ymd = ymd || todayYmd_();
  var mark = JSON.parse(prop_('OFFDAYS_' + who) || '{}');
  if (mark[ymd] !== undefined) return !!mark[ymd];
  var dow = dayOfWeek_(ymd);
  if (who === 'me') { var st = (cfg || readConfig_()).settings; return parseDayRange(st['Days off work'] === undefined ? 'Fri, Sat, Sun' : st['Days off work']).indexOf(dow) !== -1; }
  var w = profile_(who).work || {};
  return Object.keys(w).length ? !w[dow] : false;
}
/** Mark today (or a date) as a day off, or as a work day after all. The gym plan is rebuilt around it. */
function setDayOff(key, off, ymd) {
  var who = who_(key);
  ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? ymd : todayYmd_();
  return withLock_(function () {
    var m = JSON.parse(prop_('OFFDAYS_' + who) || '{}'); m[ymd] = !!off;
    Object.keys(m).sort().slice(0, -30).forEach(function (k) { delete m[k]; });   // keep the last 30
    setProp_('OFFDAYS_' + who, JSON.stringify(m));
    if (who === 'me' && ymd === todayYmd_()) { try { planGymDay_(ymd, readConfig_()); } catch (e) { log_('WARN', 'Gym re-plan: ' + e); } }
    return appState_(who);
  });
}
/** When you'd like to head to the gym on a day off (HH:MM). The plan for today is rebuilt with it. */
function setDayOffLeave(key, hhmm) {
  var who = who_(key), m = parseClock(String(hhmm || ''));
  if (who !== 'me') throw new Error('The gym plan is Dean\'s.');
  if (m === null || m < 360 || m > 1260) throw new Error('Pick a time between 06:00 and 21:00.');
  return withLock_(function () {
    setSetting_('Day off: leave around', formatClock(m));
    forget_('config'); configCache_ = null;
    try { planGymDay_(todayYmd_(), readConfig_()); } catch (e) { log_('WARN', 'Gym re-plan: ' + e); }
    return appState_(who);
  });
}
