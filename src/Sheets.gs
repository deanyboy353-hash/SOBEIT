/**
 * Sheets.gs: the Google Sheet is the database. Every tab is described here
 * once; the rest of the code reads and writes rows as plain objects keyed by
 * column header.
 */

var TZ = 'Europe/London';

var TABS = {
  config: 'Config',
  sessions: 'Sessions',
  gym: 'Gym log',
  weight: 'Weight',
  health: 'Health',
  food: 'Food',
  presets: 'Presets',
  chores: 'Chores',
  choresLog: 'Chores log',
  later: 'Later',
  xp: 'XP log',
  rewards: 'Rewards',
  routines: 'Routines',
  shopping: 'Shopping',
  lifts: 'Lifts',
  programme: 'Programme',
  workoutLog: 'Workout log',
  tmHistory: 'TM history',
  games: 'Games',
  deadlines: 'Deadlines',
  blocks: 'Work blocks',
  cash: 'Cash',
  inbox: 'Inbox',
  log: 'Log'
};

// Columns for the data tabs. Add a column at the END of a list and it is
// created automatically next time setup() runs.
var HEADERS = {
  gym: ['Date', 'Day', 'Session', 'Travel', 'Leave at', 'Weather', 'Status', 'Ticked at', 'Arrived', 'Left', 'Minutes at gym', 'Notes'],
  weight: ['Date', 'Time', 'Weight (kg)', 'You typed', 'Change (kg)'],
  food: ['Date', 'Time', 'Item', 'kcal', 'Protein (g)', 'Source', 'Entry', 'Photo', 'Notes'],
  choresLog: ['Date', 'Who', 'Task', 'Planned (min)', 'Actual (min)', 'Result', 'Started', 'Finished', 'Steps done'],
  later: ['Date', 'Who', 'Thing', 'Done', 'ID'],
  xp: ['Date', 'Time', 'Who', 'What', 'XP', 'Kind'],
  shopping: ['Date', 'Item', 'Who', 'Got', 'ID'],
  workoutLog: ['Date', 'Session', 'Exercise', 'Tier', 'Set', 'Weight (kg)', 'Reps', 'Target', 'e1RM'],
  tmHistory: ['Date', 'Lift', 'Old TM', 'New TM', 'Change', '1+ reps'],
  games: ['Date', 'Time', 'Who', 'Game', 'Score', 'Detail'],
  health: ['Date', 'Who', 'Steps', 'Distance (km)', 'Active kcal', 'Resting HR', 'HRV (ms)', 'SpO2 (%)', 'Breathing (rpm)', 'Sleep (min)', 'Deep (min)',
    'Light (min)', 'REM (min)', 'Awake (min)', 'Sleep score', 'Readiness', 'Bedtime', 'Wake', 'Updated', 'Detail'],
  deadlines: ['Date', 'ID', 'Who', 'Task', 'Due', 'Due (ms)', 'Status', 'Nags', 'Last nag (ms)', 'Finished', 'XP'],
  blocks: ['Date', 'ID', 'Who', 'Task', 'Kind', 'Start (min)', 'Mins', 'Status', 'Started (ms)', 'Done (ms)', 'XP', 'Pings'],
  cash: ['Date', 'Time', 'Who', 'What', 'Amount', 'Kind'],
  inbox: ['Received at', 'Source', 'Body'],
  log: ['Time', 'Level', 'Message']
};

// ---------- per-run memory ----------
// Each tap in the app is a fresh run on Google's side. Within one run every
// tab is read from Google once and then served from memory (writes keep the
// memory up to date), which is what keeps the app quick.

var ss_ = null, sheets_ = {}, vals = {}, props_ = null, configCache_ = null, choresCache_ = null;

/** Forget everything read so far (start of a run, or after taking the lock). */
function resetRun_() {
  sheets_ = {}; vals = {}; props_ = null; configCache_ = null; choresCache_ = null; xpCache_ = null;
}

function prop_(k) {
  if (!props_) props_ = PropertiesService.getScriptProperties().getProperties();
  return k in props_ ? props_[k] : null;
}
function setProp_(k, v) {
  prop_(k);
  props_[k] = String(v);
  PropertiesService.getScriptProperties().setProperty(k, String(v));
}
function delProp_(k) {
  prop_(k);
  delete props_[k];
  PropertiesService.getScriptProperties().deleteProperty(k);
}
var PROPS = { getProperty: prop_, setProperty: setProp_, deleteProperty: delProp_ };

/** Results worked out from a tab (config, quests, XP) go stale when it changes. */
function derived_(key) {
  if (key === 'config' || key === 'sessions') configCache_ = null;
  if (key === 'chores') choresCache_ = null;
  if (key === 'xp') xpCache_ = null;
}
/** Call after writing to a tab directly (not through appendRow_/updateRow_). */
function forget_(key) {
  delete vals[key];
  derived_(key);
}

function db_() {
  if (ss_) return ss_;
  var id = prop_('SPREADSHEET_ID');
  if (id) return (ss_ = SpreadsheetApp.openById(id));
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('No spreadsheet linked. Run setup() from the script editor.');
  setProp_('SPREADSHEET_ID', active.getId());
  return (ss_ = active);
}

function sheet_(key) {
  if (sheets_[key]) return sheets_[key];
  var ss = db_();
  var sh = ss.getSheetByName(TABS[key]);
  if (!sh) sh = ss.insertSheet(TABS[key]);
  return (sheets_[key] = sh);
}

/** Every value on a tab (row 1 = headers), read once per run. */
function vals_(key) {
  if (!vals[key]) vals[key] = sheet_(key).getDataRange().getValues();
  return vals[key];
}

/** Create the tab if needed and make sure its header row is complete. */
function ensureTab_(key) {
  var sh = sheet_(key);
  var headers = HEADERS[key];
  if (!headers) return sh;
  if (sh.getLastRow() <= 1) sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).clearContent(); // no data yet: lay the headers out fresh
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  headers.forEach(function (h) {
    if (existing.indexOf(h) === -1) {
      var col = existing.filter(String).length + 1;
      sh.getRange(1, col).setValue(h);
      existing[col - 1] = h;
    }
  });
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  // Dates/times stored as text so Sheets doesn't reformat them.
  sh.getRange(1, 1, sh.getMaxRows(), 2).setNumberFormat('@');
  forget_(key);
  return sh;
}

/** Column positions by header name. Takes a tab key (fast) or a sheet. */
function headerMap_(keyOrSheet) {
  var row = typeof keyOrSheet === 'string' ? vals_(keyOrSheet)[0]
    : keyOrSheet.getRange(1, 1, 1, Math.max(keyOrSheet.getLastColumn(), 1)).getValues()[0];
  var map = {};
  row.forEach(function (h, i) { if (h) map[h] = i; });
  return map;
}

function appendRow_(key, obj) {
  var v = vals_(key);
  var map = headerMap_(key);
  var width = Math.max(v[0].length, 1);
  var row = [];
  for (var i = 0; i < width; i++) row.push('');
  Object.keys(obj).forEach(function (k) { if (k in map) row[map[k]] = obj[k]; });
  var r = v.length + 1;
  sheet_(key).getRange(r, 1, 1, width).setValues([row.map(asText_)]);
  v.push(row);
  derived_(key);
  return r;
}

/** Row number (1-based) of the last row whose `column` equals `value`, or 0. */
function findRow_(key, column, value) {
  var v = vals_(key);
  var map = headerMap_(key);
  if (!(column in map)) return 0;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][map[column]]) === String(value)) return i + 1;
  }
  return 0;
}

function readRow_(key, rowNum) {
  var map = headerMap_(key);
  var values = vals_(key)[rowNum - 1] || [];
  var out = {};
  Object.keys(map).forEach(function (h) { out[h] = values[map[h]] === undefined ? '' : values[map[h]]; });
  return out;
}

/** Change some cells in a row: one write to Google. */
function updateRow_(key, rowNum, obj) {
  var v = vals_(key);
  var map = headerMap_(key);
  var row = v[rowNum - 1];
  if (!row) return;
  Object.keys(obj).forEach(function (k) { if (k in map) row[map[k]] = obj[k]; });
  sheet_(key).getRange(rowNum, 1, 1, row.length).setValues([row.map(asText_)]);
  derived_(key);
}

/**
 * Clock times like "15:15" (and "2026-10-14 15:15") are written with a leading apostrophe so Sheets
 * keeps them as text. Otherwise it turns them into a date in 1899 and they
 * come back as "Sat Dec 30 1899 15:15…".
 */
function asText_(v) {
  return typeof v === 'string' && /^(\d{4}-\d{2}-\d{2} )?\d{1,2}:\d{2}(:\d{2})?$/.test(v) ? "'" + v : v;
}

/** Rows whose Date (yyyy-MM-dd) is between from and to, inclusive, as objects. */
function rowsBetween_(key, fromYmd, toYmd) {
  var values = vals_(key);
  var headers = values[0];
  var di = headers.indexOf('Date');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var d = String(values[i][di]);
    if (d < fromYmd || d > toYmd) continue;
    var obj = {};
    headers.forEach(function (h, j) { if (h) obj[h] = values[i][j]; });
    out.push(obj);
  }
  return out;
}

function lastRowObject_(key) {
  var n = vals_(key).length;
  return n >= 2 ? readRow_(key, n) : null;
}

function now_(pattern) {
  return Utilities.formatDate(new Date(), TZ, pattern || 'yyyy-MM-dd HH:mm');
}

function todayYmd_() {
  return now_('yyyy-MM-dd');
}

/** 0 = Sunday ... 6 = Saturday, for a 'yyyy-MM-dd' date in UK time. */
function dayOfWeek_(ymd) {
  return Number(Utilities.formatDate(atTime_(ymd, 12 * 60), TZ, 'u')) % 7;
}

/** Real Date for a UK clock time on a given day. */
function atTime_(ymd, minutes) {
  return Utilities.parseDate(ymd + ' ' + formatClock(minutes), TZ, 'yyyy-MM-dd HH:mm');
}

function addDays_(ymd, n) {
  var d = atTime_(ymd, 12 * 60);
  return Utilities.formatDate(new Date(d.getTime() + n * 86400000), TZ, 'yyyy-MM-dd');
}

function log_(level, message) {
  try {
    appendRow_('log', { 'Time': now_('yyyy-MM-dd HH:mm:ss'), 'Level': level, 'Message': String(message).slice(0, 5000) });
  } catch (e) {
    console.error(message);
  }
}
