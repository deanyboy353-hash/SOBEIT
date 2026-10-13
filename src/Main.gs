/**
 * Main.gs: entry points and schedules.
 *
 *   setup()      run once by hand: builds the Sheet tabs, the web app key and the triggers
 *   dailyRun()   about 6am every day: tidies yesterday, then runs every job in dailyJobs_()
 *   pollTasks()  every 10 minutes: logs ticked tasks (see Tasks.gs)
 *   doPost()     web app endpoint (see WebApp.gs)
 *
 * Later phases plug in here:
 *   - new morning jobs (e.g. Sunday weekly summary) → add to dailyJobs_()
 *   - new phone data (health, geofence)             → add to POST_ROUTES in WebApp.gs
 *   - food photo folder watcher                     → a new trigger in installTriggers_()
 */

// A function rather than a plain list because Apps Script loads files in
// order, and these functions live in files that load after this one.
function dailyJobs_() {
  return [
    { name: 'Gym plan', run: planGymDay_ },
    { name: 'Weigh-in', run: planWeighIn_ }
  ];
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss = db_();
  ss.setSpreadsheetTimeZone(TZ);
  seedConfig_();
  seedSessions_();
  Object.keys(HEADERS).forEach(ensureTab_);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WEBAPP_KEY')) props.setProperty('WEBAPP_KEY', Utilities.getUuid().replace(/-/g, ''));
  setSetting_('Web app key', props.getProperty('WEBAPP_KEY'));
  var url = ScriptApp.getService().getUrl();
  if (url) setSetting_('Web app URL', url);

  installTriggers_();
  log_('INFO', 'Setup complete');
  dailyRun();
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['dailyRun', 'pollTasks'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(6).inTimezone(TZ).create();
  ScriptApp.newTrigger('pollTasks').timeBased().everyMinutes(10).create();
}

function dailyRun() {
  var problems = [];
  withLock_(function () {
    var today = todayYmd_();
    try { sweepOldTasks_(today); } catch (e) { problems.push('Tidying old tasks: ' + e); }
    var cfg = readConfig_();
    dailyJobs_().forEach(function (job) {
      try {
        log_('INFO', job.name + ': ' + job.run(today, cfg));
      } catch (e) {
        problems.push(job.name + ': ' + (e && e.stack ? e.stack : e));
      }
    });
  });
  problems.forEach(function (p) { log_('ERROR', p); });
  if (problems.length) notifyProblem_(problems.join('\n\n'));
}

function notifyProblem_(text) {
  try {
    var enabled = readConfig_().settings['Email me if something breaks'];
    if (enabled === false || String(enabled).toUpperCase() === 'FALSE') return;
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Gym planner hit a problem',
      'This morning\'s plan didn\'t fully work:\n\n' + text +
      '\n\nOpen the Sheet on your PC → Automation menu → "Plan today again". If it keeps happening, see the README.');
  } catch (e) {
    console.error(e);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('Another run is still going; try again in a minute.');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---- Sheet menu (PC only: the Sheets phone app doesn't show custom menus) ----

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Automation')
    .addItem('Plan today again (after changing settings)', 'dailyRun')
    .addItem('Check ticked tasks now', 'pollTasks')
    .addItem('Repair (re-run setup)', 'setup')
    .addToUi();
}
