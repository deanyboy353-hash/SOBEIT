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
  if (o && o.date === ymd) return o.session;
  var day = (cfg || readConfig_()).schedule[dayOfWeek_(ymd)];
  if (!day || !day.train) return '';
  return rotationDoneOn_(ymd) || (ROTATION.indexOf(day.session) !== -1 || day.session === 'Rotation' || !day.session || /^(Upper|Lower) [AB]$/.test(day.session) ? rotationNext_(ymd) : day.session);
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
  var exercises = cfg.sessions[day.session];
  if (!exercises || !exercises.length) {
    warnings.push('No exercises found for "' + day.session + '" in the Sessions tab.');
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
  else { title = 'Move ' + day.session + ' to ' + tp.moveTo + '? No bus after work'; start = tp.free; end = tp.free + 30; }
  var lines = tp.lines.concat(tp.weather ? ['Weather: ' + tp.weather] : []).concat(warnings.map(function (w) { return 'Note: ' + w; }));
  lines.push('', day.session.toUpperCase());
  exercises.forEach(function (ex, i) { lines.push(formatExercise(ex, i)); });
  lines.push('', 'Log it in the app\'s Train tab (or tick "Gym done" in Google Tasks).');

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

  createTrackedTask_('gym', ymd, 'Gym done: ' + day.session, 'Tick when you finish. That logs it.');

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

function onGymTaskDone_(task, info) {
  var r = findRow_('gym', 'Date', info.date);
  var before = r ? readRow_('gym', r) : {}, session = String(before['Session'] || '') || todaySession_(info.date) || '';
  if (!/^Done/.test(String(before['Status'] || ''))) addXp_('me', 'Gym: ' + (session || 'session done'), 50, 'gym');
  var update = { 'Status': 'Done', 'Ticked at': completedAt_(task) };
  if (session && !before['Session']) update['Session'] = session;     // so the rotation knows what was done
  if (r) updateRow_('gym', r, update);
  else appendRow_('gym', Object.assign({ 'Date': info.date, 'Day': DAY_NAMES[dayOfWeek_(info.date)] }, update));
  return false;
}

function onGymTaskExpired_(task, info) {
  var r = findRow_('gym', 'Date', info.date);
  if (r && readRow_('gym', r)['Status'] === 'Planned') updateRow_('gym', r, { 'Status': 'Not ticked' });
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
  var dayOff = parseDayRange(s['Days off work'] === undefined ? 'Fri, Sat, Sun' : s['Days off work']).indexOf(dow) !== -1;
  var free, earlyBy = num_(s, 'Can leave work early by (min)', 5);
  if (dayOff) free = cellClock_(s['Day off: leave around']) || 720;
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
