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
  return day && day.train ? day.session : '';
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
  var freeFrom = day.freeFrom !== null ? day.freeFrom : parseClock('15:00');
  var lastBus = parseClock(s['Last bus home']) || parseClock('18:15');
  var tripParams = {
    freeFrom: freeFrom,
    prep: num_(s, 'Prep before leaving (min)', 15),
    sessionMinutes: sessionMinutes,
    bikeMinutes: num_(s, 'Bike: door to gym (min)', 17),
    busMinutes: num_(s, 'Bus: door to gym (min)', 30),
    walkToStop: num_(s, 'Bus: gym to stop (min)', 5),
    lastBus: lastBus
  };
  var bikeTrip = planTrip(Object.assign({ mode: 'bike' }, tripParams));

  var forecast = { hours: [], sunset: null };
  try {
    forecast = fetchForecast_(num_(s, 'Weather latitude', 55.8622), num_(s, 'Weather longitude', -4.0266), ymd);
  } catch (e) {
    log_('WARN', 'Weather: ' + e);
  }
  var travel = chooseTravel(forecast.hours, bikeTrip.leaveAt, bikeTrip.homeAt, {
    maxRainProb: num_(s, 'Bike: max rain chance (%)', 30),
    maxRainMm: num_(s, 'Bike: max rain (mm per hour)', 0.3),
    minTemp: num_(s, 'Bike: min temperature (°C)', 3),
    maxGust: num_(s, 'Bike: max gusts (km/h)', 45)
  });
  var trip = travel.mode === 'bike' ? bikeTrip : planTrip(Object.assign({ mode: 'bus' }, tripParams));

  // Item 6 slots in here later: read the calendar and shift `trip` around other plans.

  var text = buildGymEventText({
    sessionName: day.session, exercises: exercises, sessionMinutes: sessionMinutes,
    trip: trip, travel: travel, sunset: forecast.sunset, lastBus: lastBus, warnings: warnings
  });

  removeTaggedEvents_(ymd, 'gym');
  var event = CalendarApp.getDefaultCalendar().createEvent(text.title, atTime_(ymd, trip.leaveAt), atTime_(ymd, trip.homeAt), {
    description: text.description,
    location: s['Gym name'] || 'JD Gym Coatbridge'
  });
  event.setTag(EVENT_TAG, 'gym');
  event.removeAllReminders();
  var alertAt = day.alertAt !== null ? day.alertAt : trip.leaveAt - 15;
  if (trip.leaveAt - alertAt > 0) event.addPopupReminder(trip.leaveAt - alertAt);
  event.addPopupReminder(0);
  event.setColor(trip.mode === 'bike' ? CalendarApp.EventColor.GREEN : CalendarApp.EventColor.BLUE);

  createTrackedTask_('gym', ymd, 'Gym done: ' + day.session, 'Tick when you finish. That logs it.');

  var row = {
    'Date': ymd, 'Day': DAY_NAMES[dow], 'Session': day.session, 'Travel': trip.mode === 'bike' ? 'Bike' : 'Bus',
    'Leave at': formatClock(trip.leaveAt), 'Weather': travel.summary || 'no forecast'
  };
  var r = findRow_('gym', 'Date', ymd);
  if (r) updateRow_('gym', r, row);
  else appendRow_('gym', Object.assign(row, { 'Status': 'Planned' }));
  return text.title;
}

function onGymTaskDone_(task, info) {
  var r = findRow_('gym', 'Date', info.date);
  var before = r ? readRow_('gym', r) : {};
  if (!/^Done/.test(String(before['Status'] || ''))) addXp_('me', 'Gym: ' + (before['Session'] || 'session done'), 50, 'gym');
  var update = { 'Status': 'Done', 'Ticked at': completedAt_(task) };
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
