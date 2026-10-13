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
  inbox: 'Inbox',
  log: 'Log'
};

// Columns for the data tabs. Add a column at the END of a list and it is
// created automatically next time setup() runs.
var HEADERS = {
  gym: ['Date', 'Day', 'Session', 'Travel', 'Leave at', 'Weather', 'Status', 'Ticked at', 'Arrived', 'Left', 'Minutes at gym', 'Notes'],
  weight: ['Date', 'Time', 'Weight (kg)', 'You typed', 'Change (kg)'],
  health: ['Date', 'Sleep (h)', 'Steps', 'Resting HR', 'Avg HR', 'Source', 'Received at'],
  food: ['Date', 'Time', 'Item', 'kcal', 'Protein (g)', 'Source', 'Entry', 'Photo', 'Notes'],
  choresLog: ['Date', 'Who', 'Task', 'Planned (min)', 'Actual (min)', 'Result', 'Started', 'Finished', 'Steps done'],
  later: ['Date', 'Who', 'Thing', 'Done', 'ID'],
  inbox: ['Received at', 'Source', 'Body'],
  log: ['Time', 'Level', 'Message']
};

function db_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('No spreadsheet linked. Run setup() from the script editor.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', active.getId());
  return active;
}

function sheet_(key) {
  var ss = db_();
  var sh = ss.getSheetByName(TABS[key]);
  if (!sh) sh = ss.insertSheet(TABS[key]);
  return sh;
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
  return sh;
}

function headerMap_(sh) {
  var row = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var map = {};
  row.forEach(function (h, i) { if (h) map[h] = i; });
  return map;
}

function appendRow_(key, obj) {
  var sh = sheet_(key);
  var map = headerMap_(sh);
  var width = Math.max(sh.getLastColumn(), 1);
  var row = [];
  for (var i = 0; i < width; i++) row.push('');
  Object.keys(obj).forEach(function (k) { if (k in map) row[map[k]] = obj[k]; });
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, width).setValues([row]);
  return r;
}

/** Row number (1-based) of the last row whose `column` equals `value`, or 0. */
function findRow_(key, column, value) {
  var sh = sheet_(key);
  var map = headerMap_(sh);
  var last = sh.getLastRow();
  if (last < 2 || !(column in map)) return 0;
  var values = sh.getRange(2, map[column] + 1, last - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(value)) return i + 2;
  }
  return 0;
}

function readRow_(key, rowNum) {
  var sh = sheet_(key);
  var map = headerMap_(sh);
  var values = sh.getRange(rowNum, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var out = {};
  Object.keys(map).forEach(function (h) { out[h] = values[map[h]]; });
  return out;
}

function updateRow_(key, rowNum, obj) {
  var sh = sheet_(key);
  var map = headerMap_(sh);
  Object.keys(obj).forEach(function (k) {
    if (k in map) sh.getRange(rowNum, map[k] + 1).setValue(obj[k]);
  });
}

/** Rows whose Date (yyyy-MM-dd) is between from and to, inclusive, as objects. */
function rowsBetween_(key, fromYmd, toYmd) {
  var sh = sheet_(key);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var d = String(values[i][headers.indexOf('Date')]);
    if (d < fromYmd || d > toYmd) continue;
    var obj = {};
    headers.forEach(function (h, j) { if (h) obj[h] = values[i][j]; });
    out.push(obj);
  }
  return out;
}

function lastRowObject_(key) {
  var sh = sheet_(key);
  return sh.getLastRow() >= 2 ? readRow_(key, sh.getLastRow()) : null;
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
