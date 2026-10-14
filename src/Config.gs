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
  ['Your name', 'Dean', 'Shown in the app and to your partner'],
  ['Partner name', 'Yaz', 'Shown in the app'],
  ['Your nickname', 'Deany', 'What the app calls you'],
  ['Partner nickname', 'Yazzy', 'What the app calls your partner'],
  ['Team name', 'Yazzy & Deany', 'The two of you, together'],
  ['Your level titles', 'DJ', 'Names for your levels: DJ, Ye, GTA or None'],
  ['Partner level titles', 'Ye', 'Names for your partner\'s levels: DJ, Ye, GTA or None'],
  ['Step goal', '7000', 'Steps a day (Health page)'],
  ['Sleep goal (hours)', '8', 'Hours of sleep you aim for (Health page and sleep score)'],
  ['Daily challenges', 'TRUE', 'Three small goals a day each, for bonus XP'],
  ['Double XP', 'TRUE', 'A surprise half hour of double XP each day, with a notification'],
  ['Reminders', 'TRUE', 'Evening nudges when a streak is at risk'],
  ['Your app link', '', 'Filled in automatically. Open it on your phone, then install it (see the README). Keep it private.'],
  ['Partner app link', '', 'Filled in automatically. Send this to your partner. It opens everything except Train and Food.'],
  ['Partner email', '', 'Optional. Your partner gets their daily quests, "join me" nudges and time\'s-up alerts by email (iPhones can\'t get app alerts).'],
  ['Daily XP goal', '30', 'XP each of you aims for per day. Hitting it keeps your streak going.'],
  ['Quests per day', '6', 'Most quests put on the daily board, so it never feels like a wall'],
  ['Water goal (glasses)', '8', 'Shown on the Home tab. Set to 0 to hide it.'],
  ['Meds reminder', '', 'Optional time, e.g. 08:30, for a daily calendar alert. Leave blank for none.'],
  ['Plate step (kg)', '2.5', 'Gym weights are rounded to this'],
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
  var rows = vals_('presets');
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

var CHORE_HEADERS = ['Job', 'Minutes', 'Steps (separate with ;)'];

// Typical times for one person at a steady pace. Change them to match your house.
var DEFAULT_CHORES = [
  ['Do the dishes', '15', 'Clear and scrape plates; Fill the sink or load the dishwasher; Wash or load everything; Dry and put away (or start the dishwasher); Wipe the counters and sink'],
  ['Change the bedding', '15', 'Strip the bed; Put the sheets in the wash; Fitted sheet on; Duvet cover on; Pillowcases on'],
  ['Hoover downstairs', '20', 'Pick things up off the floor; Hoover the living room; Hoover the hall and stairs; Hoover the kitchen; Empty the hoover'],
  ['Put a wash on', '5', 'Gather the washing; Sort lights and darks; Load the machine; Add detergent and start it'],
  ['Hang up or fold laundry', '15', 'Empty the machine; Hang or fold; Put it away'],
  ['Clean the bathroom', '20', 'Spray the toilet, sink and shower; Scrub the toilet; Wipe the sink and taps; Rinse the shower or bath; Wipe the mirror; Mop the floor'],
  ['Tidy the living room', '10', 'Rubbish in the bin; Cups and plates to the kitchen; Things back where they live; Cushions and throws straight'],
  ['Wipe down the kitchen', '10', 'Clear the counters; Spray and wipe counters; Wipe the hob; Wipe the table'],
  ['Take the bins out', '5', 'Empty the small bins into the big one; New bin bags in; Bins out to the kerb'],
  ['10-minute reset', '10', 'Rubbish in the bin; Dishes to the kitchen; Clothes to the wash basket; Clear one surface']
];

function seedChores_() {
  var sh = sheet_('chores');
  if (sh.getLastRow() > 0) return false;
  sh.getRange(1, 1, 1, CHORE_HEADERS.length).setValues([CHORE_HEADERS]).setFontWeight('bold');
  sh.getRange(2, 1, DEFAULT_CHORES.length, CHORE_HEADERS.length).setValues(DEFAULT_CHORES);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(3, 600);
  return true;
}

// ---------- Quests (the Chores tab, extended) ----------

// Columns added to the Chores tab. Every: daily, 3 days, weekly, 2 weeks,
// monthly, monthly 15, yearly, or weekdays like "Wed". Who: Anyone / Me / Partner.
var QUEST_COLUMNS = ['Every', 'Who', 'Energy', 'XP', 'Last done', 'Last done by', 'Next due'];

// [Job, Minutes, Steps, Every, Who, Energy]
var DEFAULT_QUESTS = [
  ['Do the dishes', '15', '', 'daily', 'Anyone', 'Low'],
  ['Change the bedding', '15', '', '2 weeks', 'Anyone', 'Medium'],
  ['Hoover downstairs', '20', '', '4 days', 'Anyone', 'Medium'],
  ['Put a wash on', '5', '', '3 days', 'Anyone', 'Low'],
  ['Hang up or fold laundry', '15', '', '3 days', 'Anyone', 'Low'],
  ['Clean the bathroom', '20', '', 'weekly', 'Anyone', 'High'],
  ['Tidy the living room', '10', '', '2 days', 'Anyone', 'Low'],
  ['Wipe down the kitchen', '10', '', 'daily', 'Anyone', 'Low'],
  ['Take the bins out', '5', '', 'Wed', 'Anyone', 'Low'],
  ['10-minute reset', '10', '', 'as needed', 'Anyone', 'Low'],
  ['Wash the towels', '5', 'Gather the towels; Load the machine; Add detergent and start it', 'weekly', 'Anyone', 'Low'],
  ['Food shop', '45', 'Check the fridge and cupboards; Check the shopping list in the app; Go or order online; Put it all away', 'weekly', 'Anyone', 'Medium'],
  ['Mop the kitchen floor', '10', 'Clear the floor; Sweep or hoover; Mop; Let it dry', 'weekly', 'Anyone', 'Medium'],
  ['Clean the microwave', '5', 'Bowl of water and lemon in for 3 min; Wipe inside; Wipe the door and handle', '2 weeks', 'Anyone', 'Low'],
  ['Clean out the fridge', '20', 'Bin anything out of date; Take shelves out if needed; Wipe the shelves; Put food back, oldest at the front', 'monthly', 'Anyone', 'Medium'],
  ['Descale the kettle', '5', 'Fill halfway with water and a splash of vinegar or descaler; Boil and leave 20 min; Empty and rinse twice', '2 months', 'Anyone', 'Low'],
  ['Washing machine clean cycle', '5', 'Wipe the door seal; Clean the drawer; Run an empty hot wash with cleaner', 'monthly', 'Anyone', 'Low'],
  ['Clean the oven', '40', 'Take the racks out to soak; Spray the inside; Wait 15 min; Scrub and wipe; Racks back in', '3 months', 'Anyone', 'High'],
  ['Sort one pile', '10', 'Pick one pile, only one; Bin anything that is rubbish; Put away things that live in this room; Things for other rooms go in a basket; Decide on the rest: keep, donate or bin', 'as needed', 'Anyone', 'Low'],
  ['Declutter one drawer', '10', 'Empty the drawer; Bin the rubbish; Put back only what belongs there; Donate bag for the rest', 'monthly', 'Anyone', 'Low'],
  ['Check bills and subscriptions', '15', 'Open your banking app; Check what went out this month; Cancel anything you don\'t use; Note any bills due soon', 'monthly 1', 'Me', 'Medium'],
  ['E-bike check', '10', 'Pump the tyres; Check the brakes; Clean and oil the chain; Charge the battery', '2 weeks', 'Me', 'Low'],
  ['E-bike service', '10', 'Book a service at a bike shop', '6 months', 'Me', 'Low'],
  ['Book the dentist', '5', 'Call or book online; Put it in the calendar', '6 months', 'Anyone', 'Low'],
  ['Book the boiler service', '5', 'Call the landlord or engineer; Put the date in the calendar', 'yearly', 'Anyone', 'Low'],
  ['Change toothbrush heads', '2', '', '3 months', 'Anyone', 'Low']
];

/** Adds the quest columns to the Chores tab and the starter quests (once), keeping your edits. */
function ensureQuests_() {
  var sh = sheet_('chores');
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  QUEST_COLUMNS.forEach(function (h) {
    if (head.indexOf(h) === -1) {
      sh.getRange(1, head.filter(String).length + 1).setValue(h).setFontWeight('bold');
      head[head.filter(String).length] = h;
    }
  });
  var props = PROPS;
  if (props.getProperty('QUESTS_V2')) return;
  var map = headerMap_(sh);
  var rows = sh.getDataRange().getValues();
  var names = rows.slice(1).map(function (r) { return String(r[0]).trim(); });
  DEFAULT_QUESTS.forEach(function (q) {
    var i = names.indexOf(q[0]);
    if (i !== -1) {
      var r = i + 2;
      if (!rows[i + 1][map['Every']]) sh.getRange(r, map['Every'] + 1).setValue(q[3]);
      if (!rows[i + 1][map['Who']]) sh.getRange(r, map['Who'] + 1).setValue(q[4]);
      if (!rows[i + 1][map['Energy']]) sh.getRange(r, map['Energy'] + 1).setValue(q[5]);
    } else {
      var row = [];
      for (var c = 0; c < sh.getLastColumn(); c++) row.push('');
      row[0] = q[0]; row[1] = q[1]; row[2] = q[2];
      row[map['Every']] = q[3]; row[map['Who']] = q[4]; row[map['Energy']] = q[5];
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    }
  });
  sh.getRange(2, map['Every'] + 1, Math.max(sh.getLastRow() - 1, 1), 1).setNumberFormat('@');
  sh.getRange(2, map['Last done'] + 1, Math.max(sh.getLastRow() - 1, 1), 1).setNumberFormat('@');
  props.setProperty('QUESTS_V2', '1');
}

// ---------- Rewards, routines ----------

var DEFAULT_REWARDS = [
  ['Fancy coffee', '100', 'Anyone'],
  ['Guilt-free gaming or TV hour', '150', 'Anyone'],
  ['Lie-in (the other one does the morning)', '300', 'Anyone'],
  ['Takeaway night', '600', 'Anyone'],
  ['New gym top', '1000', 'Me']
];

var DEFAULT_ROUTINES = [
  ['Morning', 'Me', '08:30', 'Meds (if you take them); Glass of water; Teeth; Get dressed; Look at the Home tab'],
  ['Evening', 'Me', '22:30', 'Phone on charge; Keys, wallet and headphones by the door; Gym bag ready if training tomorrow; Teeth; Set out tomorrow\'s clothes']
];

function seedSimple_(key, headers, rows, widths) {
  var sh = sheet_(key);
  if (sh.getLastRow() > 0) return false;
  sh.getRange(1, 1, 500, headers.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  (widths || []).forEach(function (w, i) { if (w) sh.setColumnWidth(i + 1, w); });
  return true;
}

// ---------- Strength programme (nSuns-style upper/lower) ----------

var DEFAULT_LIFTS = [
  ['Bench press', '', 'Upper'],
  ['Overhead press', '', 'Upper'],
  ['Squat', '', 'Lower'],
  ['Deadlift', '', 'Lower']
];

// [Session, T1 lift, T1 sets (% of TM x reps, + = as many as you can), T2 lift, T2 % of, T2 sets]
var DEFAULT_PROGRAMME = [
  ['Upper A', 'Bench press', '75x5, 85x3, 95x1+, 90x3, 85x3, 80x3, 75x5, 70x5, 65x5+', 'Overhead press', 'Overhead press', '50x6, 60x5, 70x3, 70x5, 70x7, 70x4, 70x6, 70x8'],
  ['Lower A', 'Squat', '75x5, 85x3, 95x1+, 90x3, 85x3, 80x3, 75x5, 70x5, 65x5+', 'Sumo deadlift', 'Deadlift', '50x5, 60x5, 70x3, 70x5, 70x7, 70x4, 70x6, 70x8'],
  ['Upper B', 'Overhead press', '75x5, 85x3, 95x1+, 90x3, 85x3, 80x3, 75x5, 70x5, 65x5+', 'Incline bench press', 'Bench press', '40x6, 50x5, 60x3, 60x5, 60x7, 60x4, 60x6, 60x8'],
  ['Lower B', 'Deadlift', '75x5, 85x3, 95x1+, 90x3, 85x3, 80x3, 75x3, 70x3, 65x3+', 'Front squat', 'Squat', '35x5, 45x5, 55x3, 55x5, 55x7, 55x4, 55x6, 55x8']
];

// Accessories after the two main lifts (the Sessions tab).
var ACCESSORY_SESSIONS = [
  ['Upper A', 'Barbell row', '4', '6-8', '8', '2 min', ''],
  ['Upper A', 'Lat pulldown', '3', '8-12', '8', '90 sec', ''],
  ['Upper A', 'Cable lateral raise', '3', '12-15', '9', '60 sec', ''],
  ['Upper A', 'EZ-bar curl', '3', '10-12', '9', '60 sec', ''],
  ['Upper A', 'Triceps pushdown', '3', '10-12', '9', '60 sec', ''],
  ['Lower A', 'Leg press', '3', '10-12', '8', '2 min', ''],
  ['Lower A', 'Lying leg curl', '3', '10-12', '9', '90 sec', ''],
  ['Lower A', 'Standing calf raise', '4', '10-15', '9', '60 sec', ''],
  ['Lower A', 'Hanging knee raise', '3', '10-15', '8', '60 sec', ''],
  ['Upper B', 'Pull-up (or assisted)', '4', '6-8', '8', '2 min', ''],
  ['Upper B', 'Chest-supported row', '3', '10-12', '8', '90 sec', ''],
  ['Upper B', 'Rear delt fly', '3', '12-15', '9', '60 sec', ''],
  ['Upper B', 'Hammer curl', '3', '10-12', '9', '60 sec', ''],
  ['Upper B', 'Overhead triceps extension', '3', '10-12', '9', '60 sec', ''],
  ['Lower B', 'Bulgarian split squat', '3', '8-10 each leg', '8', '90 sec', ''],
  ['Lower B', 'Seated leg curl', '3', '12-15', '9', '60 sec', ''],
  ['Lower B', 'Hip thrust', '3', '8-12', '8', '90 sec', ''],
  ['Lower B', 'Seated calf raise', '4', '12-15', '9', '60 sec', '']
];

/** If the Sessions tab still holds the original starter list, swap it for accessories (the main lifts now live in Programme). */
function upgradeSessions_() {
  var sh = sheet_('sessions');
  var rows = sh.getDataRange().getValues().slice(1).filter(function (r) { return String(r[0]).trim(); });
  var same = rows.length === DEFAULT_SESSIONS.length && rows.every(function (r, i) {
    return String(r[0]) === DEFAULT_SESSIONS[i][0] && String(r[1]) === DEFAULT_SESSIONS[i][1];
  });
  if (!same) return false;
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), SESSION_HEADERS.length).clearContent();
  sh.getRange(2, 1, ACCESSORY_SESSIONS.length, SESSION_HEADERS.length).setValues(ACCESSORY_SESSIONS);
  return true;
}

function seedSessions_() {
  var sh = sheet_('sessions');
  if (sh.getLastRow() > 0) return false;
  sh.getRange(1, 1, 500, SESSION_HEADERS.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, SESSION_HEADERS.length).setValues([SESSION_HEADERS]).setFontWeight('bold');
  sh.getRange(2, 1, ACCESSORY_SESSIONS.length, SESSION_HEADERS.length).setValues(ACCESSORY_SESSIONS);
  sh.setFrozenRows(1);
  return true;
}

/** Read the Config and Sessions tabs into a plain object. */
function readConfig_() {
  if (configCache_) return configCache_;
  var rows = vals_('config');
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
  var srows = vals_('sessions');
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
  return (configCache_ = { settings: settings, schedule: schedule, sessions: sessions });
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
  var rows = vals_('config');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sheet_('config').getRange(i + 1, 2).setValue(value);
      rows[i][1] = value;
      derived_('config');
      return;
    }
  }
}
