/**
 * Backup.gs: whole-app backups that never touch your live data.
 *  - Every morning: a compressed snapshot of every tab (and the app's settings) goes into a separate
 *    "Nudge backups" spreadsheet in your Drive. The last 14 days are kept.
 *  - Export everything: the same snapshot as a file you download.
 *  - Import backup: rebuilds a backup into a NEW spreadsheet ("Nudge restore ...") so you can look
 *    before swapping anything. Importing never overwrites the live sheet.
 * Keys, tokens and passwords are left out of every backup.
 */

var BACKUP_KEEP_DAYS = 14;
var BACKUP_CHUNK = 45000;   // a Sheets cell holds 50,000 characters

/** Script Properties worth keeping: everything except secrets and short-lived caches. */
function safeProps_() {
  var all = PropertiesService.getScriptProperties().getProperties(), out = {};
  Object.keys(all).forEach(function (k) {
    if (/KEY|TOKEN|SECRET|PASS|_SA$|^FCM|^DEVICES|^BACKUP_ID$|^CHAT_|^SA_TOKEN/i.test(k)) return;   // the chat room is a secret too
    out[k] = all[k];
  });
  return out;
}

/** Every tab's values (dates as ISO text) plus the safe settings. */
function backupSnapshot_() {
  var tabs = {};
  db_().getSheets().forEach(function (sh) {
    var n = sh.getName(); if (/^Sheet\d*$/.test(n)) return;
    tabs[n] = sh.getDataRange().getValues().map(function (r) { return r.map(function (v) { return v instanceof Date ? v.toISOString() : v; }); });
  });
  return { app: 'Nudge', version: 1, at: new Date().toISOString(), tabs: tabs, props: safeProps_() };
}

function packSnapshot_(snap) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(snap), 'application/json')).getBytes());
}
function unpackSnapshot_(packed) {
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(packed), 'application/x-gzip')).getDataAsString());
}

function backupBook_() {
  var id = prop_('BACKUP_ID'), book = null;
  if (id) try { book = SpreadsheetApp.openById(id); } catch (e) { book = null; }
  if (!book || book.getId() === db_().getId()) {
    book = SpreadsheetApp.create('Nudge backups');
    setProp_('BACKUP_ID', book.getId());
  }
  var sh = book.getSheetByName('Backups');
  if (!sh) {
    sh = book.getSheets()[0]; sh.setName('Backups');
    sh.getRange(1, 1, 1, 5).setValues([['Date', 'Saved at', 'Part', 'Parts', 'Data']]);
  }
  return { book: book, sheet: sh };
}

/** Daily job: today's snapshot, once, then drop snapshots older than two weeks. */
function dailyBackup_(ymd) {
  var b = backupBook_(), sh = b.sheet, rows = sh.getDataRange().getValues().slice(1);
  if (rows.some(function (r) { return String(r[0]) === ymd; })) return 'Already backed up today';
  var packed = packSnapshot_(backupSnapshot_()), parts = [];
  for (var i = 0; i < packed.length; i += BACKUP_CHUNK) parts.push(packed.slice(i, i + BACKUP_CHUNK));
  var at = new Date().toISOString();
  sh.getRange(sh.getLastRow() + 1, 1, parts.length, 5).setValues(parts.map(function (p, k) { return [ymd, at, k + 1, parts.length, p]; }));
  // prune: keep the newest BACKUP_KEEP_DAYS dates (these are copies, never the live data)
  var dates = {}; sh.getDataRange().getValues().slice(1).forEach(function (r) { dates[String(r[0])] = 1; });
  var keep = Object.keys(dates).sort().slice(-BACKUP_KEEP_DAYS);
  var all = sh.getDataRange().getValues();
  for (var r = all.length - 1; r >= 1; r--) if (keep.indexOf(String(all[r][0])) === -1) sh.deleteRow(r + 1);
  setProp_('BACKUP_LAST', ymd);
  return 'Backed up (' + Math.round(packed.length / 1024) + ' KB)';
}

/** Rebuild a snapshot into a brand-new spreadsheet. Returns its link. */
function restoreToNewBook_(snap) {
  if (!snap || snap.app !== 'Nudge' || !snap.tabs) throw new Error('That file isn\'t a Nudge backup.');
  var when = String(snap.at || '').slice(0, 10) || 'backup';
  var book = SpreadsheetApp.create('Nudge restore ' + when), first = book.getSheets()[0], used = false;
  Object.keys(snap.tabs).forEach(function (name) {
    var vals = snap.tabs[name]; if (!vals || !vals.length) return;
    var w = Math.max.apply(null, vals.map(function (r) { return r.length; })) || 1;
    var sh = used ? book.insertSheet(name) : (first.setName(name), first); used = true;
    sh.getRange(1, 1, vals.length, w).setValues(vals.map(function (r) { while (r.length < w) r.push(''); return r; }));
  });
  var p = snap.props || {}, keys = Object.keys(p);
  if (keys.length) { var ps = book.insertSheet('App settings (backup)'); ps.getRange(1, 1, keys.length + 1, 2).setValues([['Setting', 'Value']].concat(keys.map(function (k) { return [k, String(p[k]).slice(0, 49000)]; }))); }
  return { url: book.getUrl(), name: book.getName(), tabs: Object.keys(snap.tabs).length };
}

// ---- called from the page (Dean's link only: backups hold both people's data) ----

function backupStatus(key) {
  requireKey_(key);
  var id = prop_('BACKUP_ID');
  return { last: prop_('BACKUP_LAST') || '', url: id ? 'https://docs.google.com/spreadsheets/d/' + id : '', keep: BACKUP_KEEP_DAYS };
}
function backupNow(key) {
  requireKey_(key);
  return withLock_(function () { var msg = dailyBackup_(todayYmd_()); return Object.assign(backupStatus(key), { msg: msg }); });
}
function exportAll(key) {
  requireKey_(key);
  return JSON.stringify(backupSnapshot_());
}
function importBackup(key, text) {
  requireKey_(key);
  var snap;
  try { snap = JSON.parse(String(text || '')); } catch (e) { throw new Error('That file isn\'t a Nudge backup (it\'s not readable JSON).'); }
  return restoreToNewBook_(snap);
}

/**
 * Removed features keep their data here: a tab called "Archive" in your Sheet, one row per thing kept
 * (feature, what it was, the data as JSON, when). Nothing in it is used by the app.
 */
function archive_(feature, what, data) {
  var text = typeof data === 'string' ? data : JSON.stringify(data);
  if (!text || text === '{}' || text === '[]' || text === 'null') return;
  var ss = db_(), sh = ss.getSheetByName('Archive');
  if (!sh) { sh = ss.insertSheet('Archive'); sh.getRange(1, 1, 1, 4).setValues([['Feature', 'What', 'Data', 'Archived']]).setFontWeight('bold'); }
  sh.appendRow([feature, what, text.slice(0, 49000), now_()]);
}

/**
 * Runs once: the retired extras (daily challenges and the chest, surprise Double XP, XP rewards, Wrapped,
 * the Mix game, general badges, streak freezes, routine calendar events and the Meds alert) keep their data in the
 * Archive tab. Their settings rows leave the Config tab; nothing else is touched.
 */
var RETIRED_SETTINGS = ['Daily challenges', 'Double XP', 'Meds reminder'];

function retireExtras_() {
  if (prop_('EXTRAS_RETIRED')) return;
  PEOPLE.forEach(function (who) {
    var c = prop_('CHAL_' + who);
    if (c) { archive_('Daily challenges', 'CHAL_' + who, c); delProp_('CHAL_' + who); }
  });
  var fr = {};
  PEOPLE.concat(['team']).forEach(function (id) { var st = JSON.parse(prop_('STREAK_' + id) || 'null'); if (st && (st.freezes || st.frozeOn)) fr[id] = { freezes: st.freezes, frozeOn: st.frozeOn }; });
  archive_('Streak freezes', 'replaced by lazy days', fr);
  var ss = db_(), rw = ss.getSheetByName('Rewards');
  if (rw && rw.getLastRow() > 0) {
    archive_('Rewards', 'Rewards tab', rw.getDataRange().getDisplayValues());
    if (!ss.getSheetByName('Old Rewards')) rw.setName('Old Rewards');   // kept, just renamed so it's clearly unused
  }
  var spent = xpRows_().filter(function (r) { return r.kind === 'reward'; });
  if (spent.length) archive_('Rewards', 'XP spent (still in the XP log)', spent);
  var sh = sheet_('config'), vals = sh.getDataRange().getValues(), gone = [];
  for (var i = vals.length - 1; i >= 1; i--) {
    if (RETIRED_SETTINGS.indexOf(String(vals[i][0]).trim()) !== -1) { gone.push([vals[i][0], vals[i][1]]); sh.deleteRow(i + 1); }
  }
  if (gone.length) { archive_('Settings', 'Config rows', gone); forget_('config'); configCache_ = null; }
  setProp_('EXTRAS_RETIRED', '1');
}
