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
  workouts: 'Workouts',
  cardio: 'Cardio',
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
  gym: ['Date', 'Day', 'Session', 'Travel', 'Leave at', 'Weather', 'Status', 'Ticked at', 'Arrived', 'Left', 'Minutes at gym', 'Notes', 'Bus', 'Gym window', 'Home by', 'Plan'],
  weight: ['Date', 'Time', 'Weight (kg)', 'You typed', 'Change (kg)'],
  food: ['Date', 'Time', 'Item', 'kcal', 'Protein (g)', 'Source', 'Entry', 'Photo', 'Notes'],
  choresLog: ['Date', 'Who', 'Task', 'Planned (min)', 'Actual (min)', 'Result', 'Started', 'Finished', 'Steps done'],
  later: ['Date', 'Who', 'Thing', 'Done', 'ID'],
  xp: ['Date', 'Time', 'Who', 'What', 'XP', 'Kind'],
  shopping: ['Date', 'Item', 'Who', 'Got', 'ID'],
  workoutLog: ['Date', 'Session', 'Exercise', 'Tier', 'Set', 'Weight (kg)', 'Reps', 'Target', 'e1RM', 'Type', 'Workout'],
  workouts: ['Date', 'ID', 'Session', 'Start', 'End', 'Minutes', 'Sets', 'Volume (kg)', 'PRs', 'Notes'],
  cardio: ['Date', 'ID', 'Type', 'Minutes', 'Distance (km)', 'kcal', 'Avg HR', 'Notes'],
  tmHistory: ['Date', 'Lift', 'Old TM', 'New TM', 'Change', '1+ reps'],
  games: ['Date', 'Time', 'Who', 'Game', 'Score', 'Detail'],
  health: ['Date', 'Who', 'Steps', 'Distance (km)', 'Active kcal', 'Resting HR', 'HRV (ms)', 'SpO2 (%)', 'Breathing (rpm)', 'Sleep (min)', 'Deep (min)',
    'Light (min)', 'REM (min)', 'Awake (min)', 'Sleep score', 'Readiness', 'Bedtime', 'Wake', 'Updated', 'Detail'],
  deadlines: ['Date', 'ID', 'Who', 'Task', 'Due', 'Due (ms)', 'Status', 'Nags', 'Last nag (ms)', 'Finished', 'XP'],
  blocks: ['Date', 'ID', 'Who', 'Task', 'Kind', 'Start (min)', 'Mins', 'Status', 'Started (ms)', 'Done (ms)', 'XP', 'Pings', 'Target', 'Count', 'Unit'],
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
  sheets_ = {}; vals = {}; props_ = null; configCache_ = null; choresCache_ = null; xpCache_ = null; tabVers_ = null; dirtyTabs_ = {};
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
  return (sheets_[key] = watchWrites_(sh, key));
}

/** Every value on a tab (row 1 = headers): from this run's memory, then the shared tab cache, then the Sheet. */
function vals_(key) {
  if (vals[key]) return vals[key];
  var hit = tabCacheGet_(key);
  if (hit) return (vals[key] = hit);
  var ver = tabVersion_(key);
  vals[key] = sheet_(key).getDataRange().getValues();
  tabCachePut_(key, ver, vals[key]);
  return vals[key];
}

// ---------- shared tab cache ----------
// Reading a tab from Google is the slow part of every tap (there are ~24). Each tab's values are
// kept compressed in the script cache under a version. ANY write to a tab (through sheet_) gives it
// a new version at once, so a stale copy can never be served. Tabs you edit by hand in the Sheet
// also expire quickly (and onEdit bumps them). If anything goes wrong the cache switches itself off.
var TAB_TTL = 600, TAB_TTL_HAND = 90, TAB_PART = 90000;
var HAND_EDITED = { config: 1, sessions: 1, chores: 1, rewards: 1, routines: 1, presets: 1, lifts: 1, programme: 1 };
var WRITE_METHODS = { setValue: 1, setValues: 1, setFormula: 1, setFormulas: 1, setRichTextValue: 1, setRichTextValues: 1, appendRow: 1, deleteRow: 1, deleteRows: 1, insertRowAfter: 1, insertRowBefore: 1, insertRowsAfter: 1, insertRowsBefore: 1, insertRows: 1, deleteColumn: 1, deleteColumns: 1, insertColumnAfter: 1, insertColumnBefore: 1, insertColumnsAfter: 1, insertColumnsBefore: 1, clear: 1, clearContent: 1, clearContents: 1, sort: 1, moveTo: 1, copyTo: 1, randomize: 1, trimWhitespace: 1, removeDuplicates: 1, insertCheckboxes: 1, check: 1, uncheck: 1 };
var tabVers_ = null, tabOff_ = false, dirtyTabs_ = {}, tabTokN_ = 0;
// version labels: time + a counter (writes happen under the script lock, so they can't collide)
function tabToken_() { return new Date().getTime().toString(36) + '.' + (++tabTokN_).toString(36); }
function tabCacheOn_() { if (tabOff_ || prop_('TABCACHE_OFF')) return null; try { return CacheService.getScriptCache(); } catch (e) { tabOff_ = true; return null; } }
function tabVersion_(key) {
  var c = tabCacheOn_(); if (!c) return '';
  if (!tabVers_) { try { var ks = Object.keys(TABS).map(function (k) { return 'TV:' + k; }), got = c.getAll(ks); tabVers_ = {}; Object.keys(TABS).forEach(function (k) { tabVers_[k] = got['TV:' + k] || ''; }); } catch (e) { tabOff_ = true; return ''; } }
  if (!tabVers_[key]) { tabVers_[key] = tabToken_(); try { c.put('TV:' + key, tabVers_[key], 21600); } catch (e) { tabOff_ = true; } }
  return tabVers_[key];
}
/** A tab changed: forget it here and give it a new version everywhere. */
function bumpTab_(key) {
  forget_(key); dirtyTabs_[key] = true;
  var c = tabCacheOn_(); if (!c) return;
  if (!tabVers_) tabVersion_(key);
  tabVers_[key] = tabToken_();
  try { c.put('TV:' + key, tabVers_[key], 21600); } catch (e) { tabOff_ = true; }
}
function packVals_(rows) {
  var json = JSON.stringify(rows.map(function (r) { return r.map(function (v) { return v instanceof Date ? { $d: v.getTime() } : v; }); }));
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
}
function unpackVals_(s) {
  var rows = JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString());
  return rows.map(function (r) { return r.map(function (v) { return v && typeof v === 'object' && '$d' in v ? new Date(v.$d) : v; }); });
}
function tabCachePut_(key, ver, rows) {
  var c = tabCacheOn_(); if (!c || !ver || dirtyTabs_[key] || ver !== tabVersion_(key)) return;
  try {
    var packed = packVals_(rows), parts = [], o = {};
    for (var i = 0; i < packed.length; i += TAB_PART) parts.push(packed.slice(i, i + TAB_PART));
    if (parts.length > 20) return;
    parts.forEach(function (p, k) { o['T:' + key + ':' + ver + ':' + k] = p; });
    o['T:' + key + ':' + ver] = String(parts.length);
    c.putAll(o, HAND_EDITED[key] ? TAB_TTL_HAND : TAB_TTL);
  } catch (e) { /* too big or the cache is busy: just read the Sheet next time */ }
}
function tabCacheGet_(key) {
  var c = tabCacheOn_(); if (!c || dirtyTabs_[key]) return null;
  try {
    var ver = tabVersion_(key), n = Number(c.get('T:' + key + ':' + ver)); if (!n) return null;
    var keys = []; for (var i = 0; i < n; i++) keys.push('T:' + key + ':' + ver + ':' + i);
    var got = c.getAll(keys), s = '';
    for (i = 0; i < n; i++) { if (got[keys[i]] == null) return null; s += got[keys[i]]; }
    return unpackVals_(s);
  } catch (e) { return null; }
}
/** Fetch many tabs from the cache in 3 round trips (versions, sizes, parts) instead of one Sheet read each. */
function prefetchTabs_(keys) {
  var c = tabCacheOn_(); if (!c) return;
  try {
    keys = keys.filter(function (k) { return !vals[k] && !dirtyTabs_[k]; });
    var vers = {}; keys.forEach(function (k) { vers[k] = tabVersion_(k); });
    var metaKeys = keys.map(function (k) { return 'T:' + k + ':' + vers[k]; }), metas = c.getAll(metaKeys), partKeys = [];
    keys.forEach(function (k) { var n = Number(metas['T:' + k + ':' + vers[k]]); for (var i = 0; i < n; i++) partKeys.push('T:' + k + ':' + vers[k] + ':' + i); });
    var parts = partKeys.length ? c.getAll(partKeys) : {};
    keys.forEach(function (k) {
      var n = Number(metas['T:' + k + ':' + vers[k]]), s = ''; if (!n) return;
      for (var i = 0; i < n; i++) { var p = parts['T:' + k + ':' + vers[k] + ':' + i]; if (p == null) return; s += p; }
      try { vals[k] = unpackVals_(s); } catch (e) {}
    });
  } catch (e) {}
}
/** Wrap a sheet so every write through it retires that tab's cached copy. Falls back to the plain sheet. */
function watchWrites_(sh, key) {
  if (typeof Proxy === 'undefined') { tabOff_ = true; return sh; }
  var raw = typeof WeakMap !== 'undefined' ? watchWrites_.raw || (watchWrites_.raw = new WeakMap()) : null;
  function unwrap(x) { return raw && x && typeof x === 'object' && raw.has(x) ? raw.get(x) : x; }
  function wrap(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var p = new Proxy(obj, { get: function (t, name) {
      var v = t[name];
      if (typeof v !== 'function') return v;
      return function () {
        var args = Array.prototype.map.call(arguments, unwrap), out = v.apply(t, args);
        if (WRITE_METHODS[name]) bumpTab_(key);
        if (out === t) return p;                                                   // chained calls (setNumberFormat(...).setValues(...)) stay watched
        return /^(getRange|getDataRange|getRangeList|offset|getCell|getRanges|getSheet)$/.test(String(name)) ? (Array.isArray(out) ? out.map(wrap) : wrap(out)) : out;
      };
    } });
    if (raw) raw.set(p, obj);
    return p;
  }
  // self-check on Google's side: a wrapped sheet must answer and hand back a wrapped range, or we use the plain sheet and no cache
  try { var w = wrap(sh); if (w.getName() !== sh.getName()) throw new Error('proxy'); var rg = w.getRange(1, 1); if (!rg || typeof rg.getValues !== 'function') throw new Error('proxy'); return w; } catch (e) { tabOff_ = true; return sh; }
}
/** Hand edits in the Sheet (simple trigger): retire that tab's cached copy too. */
function onEdit(e) {
  try { var name = e && e.range && e.range.getSheet().getName(); Object.keys(TABS).forEach(function (k) { if (TABS[k] === name) bumpTab_(k); }); } catch (x) {}
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
