/**
 * Config.gs: everything you might want to change lives in the Config and
 * Sessions tabs. This file writes the starting values (only into empty tabs,
 * so your edits are never overwritten) and reads them back each run.
 */

// [Setting name (don't rename), starting value, what it does]
var DEFAULT_SETTINGS = [
  ['Wake time', '08:30', 'When the weigh-in alert goes off on weigh-in days'],
  ['Weigh-in days', 'Mon, Wed', 'Days to weigh in, e.g. "Mon, Wed"'],
  ['Weight unit', 'kg', 'What a bare number means when you weigh in: kg, st or lb. You can always type "13st 2" or "185 lb".'],
  ['Prep before leaving (min)', '15', 'Time to change and get out the door after you are free'],
  ['Bus: door to gym (min)', '30', 'Walk to stop + wait + bus ride'],
  ['Bus: gym to stop (min)', '5', 'Walk from the gym to the stop for the bus home'],
  ['Last bus home', '18:15', 'Last bus back. Leave-by times are worked back from this.'],
  ['Bike: door to gym (min)', '17', 'E-bike ride each way'],
  ['Session length (min)', 'auto', '"auto" works it out from the Sessions tab, or type a number'],
  ['Warm-up (min)', '10', 'Added to the auto session length'],
  ['Seconds per working set', '60', 'Used by the auto session length (includes setting up)'],
  ['Bike: max rain chance (%)', '30', 'Above this in any hour of the trip → bus'],
  ['Bike: max rain (mm per hour)', '0.3', 'Above this in any hour of the trip → bus'],
  ['Bike: min temperature (°C)', '3', 'Below this → bus'],
  ['Bike: max gusts (km/h)', '45', 'Above this → bus'],
  ['Weather latitude', '55.8622', 'Where to check the forecast (Coatbridge)'],
  ['Weather longitude', '-4.0266', ''],
  ['Gym name', 'JD Gym Coatbridge', 'Shown as the event location, so Maps works'],
  ['Daily kcal target', '1800', 'Calories per day'],
  ['Protein min (g)', '130', 'Protein target range: bottom'],
  ['Protein max (g)', '160', 'Protein target range: top'],
  ['Evening food check', '23:00', 'When the "what\'s left today" alert goes off'],
  ['Claude model', 'claude-opus-5-5', 'Model used for quick-add estimates'],
  ['Food page', '', 'Filled in automatically. Open on your phone, then ⋮ → Add to home screen.'],
  ['Email me if something breaks', 'TRUE', 'Untick to stop error emails'],
  ['Web app URL', '', 'Filled in automatically. Used later by HC Webhook and MacroDroid.'],
  ['Web app key', '', 'Filled in automatically. Add it to the URL as ?key=… (keep it private)']
];

// [Day, Train?, Session, Free from, Alert at]
var DEFAULT_SCHEDULE = [
  ['Mon', false, '', '15:00', '14:45'],
  ['Tue', true, 'Upper A', '15:00', '14:45'],
  ['Wed', true, 'Lower A', '15:00', '14:45'],
  ['Thu', false, '', '16:00', '15:45'],
  ['Fri', true, 'Upper B', '15:00', '14:45'],
  ['Sat', true, 'Lower B', '15:00', '14:45'],
  ['Sun', false, '', '15:00', '14:45']
];

var SESSION_HEADERS = ['Session', 'Exercise', 'Sets', 'Reps', 'RPE', 'Rest', 'Notes'];

var DEFAULT_SESSIONS = [
  ['Upper A', 'Barbell bench press', '4', '5-6', '8', '3 min', 'Top set first, then the rest'],
  ['Upper A', 'Barbell row', '4', '6-8', '8', '2.5 min', ''],
  ['Upper A', 'Seated DB shoulder press', '3', '8-10', '8', '2 min', ''],
  ['Upper A', 'Lat pulldown', '3', '8-12', '8', '2 min', ''],
  ['Upper A', 'Cable lateral raise', '3', '12-15', '9', '75 sec', ''],
  ['Upper A', 'EZ-bar curl', '3', '10-12', '9', '75 sec', ''],
  ['Upper A', 'Triceps pushdown', '3', '10-12', '9', '75 sec', ''],
  ['Lower A', 'Back squat', '4', '5-6', '8', '3 min', ''],
  ['Lower A', 'Romanian deadlift', '3', '8-10', '8', '2.5 min', ''],
  ['Lower A', 'Leg press', '3', '10-12', '8', '2 min', ''],
  ['Lower A', 'Lying leg curl', '3', '10-12', '9', '90 sec', ''],
  ['Lower A', 'Standing calf raise', '4', '10-15', '9', '60 sec', ''],
  ['Lower A', 'Hanging knee raise', '3', '10-15', '8', '60 sec', ''],
  ['Upper B', 'Incline DB press', '4', '8-10', '8', '2 min', ''],
  ['Upper B', 'Pull-up (or assisted)', '4', '6-8', '8', '2.5 min', ''],
  ['Upper B', 'Chest-supported row', '3', '10-12', '8', '2 min', ''],
  ['Upper B', 'Machine shoulder press', '3', '10-12', '8', '90 sec', ''],
  ['Upper B', 'Rear delt fly', '3', '12-15', '9', '60 sec', ''],
  ['Upper B', 'Hammer curl', '3', '10-12', '9', '60 sec', ''],
  ['Upper B', 'Overhead triceps extension', '3', '10-12', '9', '60 sec', ''],
  ['Lower B', 'Trap-bar deadlift', '3', '4-5', '7-8', '3 min', ''],
  ['Lower B', 'Bulgarian split squat', '3', '8-10 each leg', '8', '2 min', ''],
  ['Lower B', 'Hack squat', '3', '8-12', '8', '2 min', ''],
  ['Lower B', 'Seated leg curl', '3', '12-15', '9', '90 sec', ''],
  ['Lower B', 'Hip thrust', '3', '8-12', '8', '2 min', ''],
  ['Lower B', 'Seated calf raise', '4', '12-15', '9', '60 sec', '']
];

function seedConfig_() {
  var sh = sheet_('config');
  if (sh.getLastRow() > 0) return false;
  sh.getRange(1, 1, 200, 5).setNumberFormat('@');
  var rows = [['SETTINGS', '', ''], ['Setting', 'Value', 'What it does']].concat(DEFAULT_SETTINGS);
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  var r = rows.length + 2;
  sh.getRange(r, 1).setValue('WEEKLY PLAN');
  sh.getRange(r + 1, 1, 1, 5).setValues([['Day', 'Train?', 'Session', 'Free from', 'Alert at']]);
  sh.getRange(r + 2, 1, 7, 5).setValues(DEFAULT_SCHEDULE);
  sh.getRange(r + 2, 2, 7, 1).setNumberFormat('General').insertCheckboxes()
    .setValues(DEFAULT_SCHEDULE.map(function (d) { return [d[1]]; }));
  [1, 2, r, r + 1].forEach(function (row) { sh.getRange(row, 1, 1, 5).setFontWeight('bold'); });
  var emailRow = 3 + DEFAULT_SETTINGS.map(function (s) { return s[0]; }).indexOf('Email me if something breaks');
  sh.getRange(emailRow, 2).setNumberFormat('General').insertCheckboxes().setValue(true);
  sh.setColumnWidth(1, 230);
  sh.setColumnWidth(3, 420);
  return true;
}

var PRESET_HEADERS = ['Food', 'kcal', 'Protein (g)'];

// Placeholders until your own list goes in. One row per button, in this order.
var DEFAULT_PRESETS = [
  ['Protein shake', '120', '24'],
  ['Greek yogurt 0% (170g)', '95', '17'],
  ['Weetabix Protein ×2 + 200ml semi-skimmed', '300', '23'],
  ['Chicken breast (150g)', '240', '46'],
  ['Banana', '105', '1'],
  ['Coffee with milk', '30', '2']
];

function seedPresets_() {
  var sh = sheet_('presets');
  if (sh.getLastRow() > 0) return false;
  sh.getRange(1, 1, 1, PRESET_HEADERS.length).setValues([PRESET_HEADERS]).setFontWeight('bold');
  sh.getRange(2, 1, DEFAULT_PRESETS.length, PRESET_HEADERS.length).setValues(DEFAULT_PRESETS);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 280);
  return true;
}

function readPresets_() {
  var rows = sheet_('presets').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0]).trim();
    if (!name) continue;
    out.push({ name: name, kcal: Number(rows[i][1]) || 0, protein: Number(rows[i][2]) || 0 });
  }
  return out;
}

/** Adds settings introduced after your Config tab was first made, without touching your values. */
function ensureSettings_() {
  var sh = sheet_('config');
  var rows = sh.getDataRange().getValues();
  var have = {};
  var lastSettingRow = 0;
  var inSettings = false;
  for (var i = 0; i < rows.length; i++) {
    var a = String(rows[i][0]).trim();
    if (a === 'Setting') { inSettings = true; continue; }
    if (inSettings && !a) break;
    if (inSettings) { have[a] = true; lastSettingRow = i + 1; }
  }
  if (!lastSettingRow) return;
  DEFAULT_SETTINGS.forEach(function (d) {
    if (have[d[0]]) return;
    sh.insertRowAfter(lastSettingRow);
    lastSettingRow++;
    sh.getRange(lastSettingRow, 1, 1, 3).setNumberFormat('@').setValues([d]);
  });
}

function seedSessions_() {
  var sh = sheet_('sessions');
  if (sh.getLastRow() > 0) return false;
  sh.getRange(1, 1, 500, SESSION_HEADERS.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, SESSION_HEADERS.length).setValues([SESSION_HEADERS]).setFontWeight('bold');
  sh.getRange(2, 1, DEFAULT_SESSIONS.length, SESSION_HEADERS.length).setValues(DEFAULT_SESSIONS);
  sh.setFrozenRows(1);
  return true;
}

/** Read the Config and Sessions tabs into a plain object. */
function readConfig_() {
  var rows = sheet_('config').getDataRange().getValues();
  var settings = {};
  var schedule = {};
  var mode = '';
  rows.forEach(function (row) {
    var a = String(row[0]).trim();
    if (a === 'Setting') { mode = 'settings'; return; }
    if (a === 'Day') { mode = 'schedule'; return; }
    if (!a || a === 'SETTINGS' || a === 'WEEKLY PLAN') return;
    if (mode === 'settings') settings[a] = row[1];
    if (mode === 'schedule') {
      var d = parseDays(a)[0];
      if (d === undefined) return;
      schedule[d] = {
        train: row[1] === true || /^(true|yes|y|x|✓)$/i.test(String(row[1]).trim()),
        session: String(row[2]).trim(),
        freeFrom: cellClock_(row[3]),
        alertAt: cellClock_(row[4])
      };
    }
  });

  var sessions = {};
  var srows = sheet_('sessions').getDataRange().getValues();
  var h = srows[0].map(function (x) { return String(x).trim().toLowerCase(); });
  for (var i = 1; i < srows.length; i++) {
    var r = srows[i];
    var name = String(r[h.indexOf('session')]).trim();
    if (!name) continue;
    (sessions[name] = sessions[name] || []).push({
      exercise: r[h.indexOf('exercise')], sets: r[h.indexOf('sets')], reps: r[h.indexOf('reps')],
      rpe: r[h.indexOf('rpe')], rest: r[h.indexOf('rest')], notes: h.indexOf('notes') >= 0 ? r[h.indexOf('notes')] : ''
    });
  }
  return { settings: settings, schedule: schedule, sessions: sessions };
}

/** Times typed into Sheets can come back as Date objects. */
function cellClock_(v) {
  if (v instanceof Date) return parseClock(Utilities.formatDate(v, TZ, 'HH:mm'));
  return parseClock(v);
}

function num_(settings, key, fallback) {
  var v = Number(String(settings[key] === undefined ? '' : settings[key]).replace(',', '.'));
  return isNaN(v) || settings[key] === '' || settings[key] === undefined ? fallback : v;
}

function setSetting_(key, value) {
  var sh = sheet_('config');
  var rows = sh.getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
}
