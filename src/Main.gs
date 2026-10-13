/**
 * Main.gs: entry points and schedules.
 *
 *   setup()      run once by hand: builds the Sheet tabs, the web app key and the triggers
 *   dailyRun()   about 6am every day: tidies yesterday, then runs every job in dailyJobs_()
 *   pollTasks()  every 10 minutes: logs ticked tasks (see Tasks.gs)
 *   foodCheck()  ~10:40pm, booked each morning: "what's left today" alert (see Food.gs)
 *   weeklySummary() Sunday 6–7pm: the week in numbers (see WeeklySummary.gs)
 *   doGet/doPost web app: food page + phone data endpoint (see WebApp.gs)
 *
 * Later phases plug in here:
 *   - new morning jobs                              → add to dailyJobs_()
 *   - new phone data (health, geofence)             → add to POST_ROUTES in WebApp.gs
 *   - food photo folder watcher                     → a new trigger in installTriggers_()
 */

// A function rather than a plain list because Apps Script loads files in
// order, and these functions live in files that load after this one.
function dailyJobs_() {
  return [
    { name: 'Streaks', run: function (ymd) { updateStreaks_(ymd); return 'settled'; } },
    { name: 'Quests', run: planQuests_ },
    { name: 'Routines', run: planRoutines_ },
    { name: 'Appointments', run: planPrep_ },
    { name: 'Gym plan', run: planGymDay_ },
    { name: 'Weigh-in', run: planWeighIn_ },
    { name: 'Food check', run: scheduleFoodCheck_ },
    { name: 'Morning briefs', run: planBriefs_ }
  ];
}

// The published web app (deployment "Phase 1"). Not secret without the key.
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyGglsy-_DOdaCn7DFhNyD8JH89jGapkUXUHdWp-JmdpuupiMPPEp6gm8e23x-yOVbsYQ/exec';

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PROPS.setProperty('SPREADSHEET_ID', ss.getId());
  prepareSheet_();
  installTriggers_();
  log_('INFO', 'Setup complete');
  dailyRun();
}

/**
 * Builds missing tabs, columns and settings without touching your data.
 * Runs at setup and every morning, so new features arrive without re-running setup.
 */
function prepareSheet_() {
  var ss = db_();
  ss.setSpreadsheetTimeZone(TZ);
  resetRun_();
  seedConfig_();
  ensureSettings_();
  seedSessions_();
  seedPresets_();
  seedChores_();
  ensureQuests_();
  forget_('chores');
  ensureSchedule_();
  upgradeSessions_();
  seedSimple_('rewards', ['Reward', 'Cost (XP)', 'Who'], DEFAULT_REWARDS, [320]);
  seedSimple_('routines', ['Routine', 'Who', 'Time', 'Steps (separate with ;)'], DEFAULT_ROUTINES, [120, 0, 0, 600]);
  seedSimple_('lifts', ['Lift', 'Training max (kg)', 'Body'], DEFAULT_LIFTS, [180, 150]);
  seedSimple_('programme', ['Session', 'T1 lift', 'T1 sets', 'T2 lift', 'T2 % of', 'T2 sets'], DEFAULT_PROGRAMME, [0, 140, 380, 160, 140, 380]);
  Object.keys(HEADERS).forEach(ensureTab_);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  resetRun_(); // the seeding above wrote straight to the tabs
  var props = PROPS;
  if (!props.getProperty('WEBAPP_KEY')) props.setProperty('WEBAPP_KEY', Utilities.getUuid().replace(/-/g, ''));
  if (!props.getProperty('PARTNER_KEY')) props.setProperty('PARTNER_KEY', Utilities.getUuid().replace(/-/g, ''));
  var settings = readConfig_().settings;
  if (settings['Web app key'] !== props.getProperty('WEBAPP_KEY')) setSetting_('Web app key', props.getProperty('WEBAPP_KEY'));
  if (settings['Web app URL'] !== WEBAPP_URL) setSetting_('Web app URL', WEBAPP_URL);
  var theirs = WEBAPP_URL + '?key=' + props.getProperty('PARTNER_KEY');
  if (settings['Your app link'] !== appUrl_()) setSetting_('Your app link', appUrl_());
  if (settings['Partner app link'] !== theirs) setSetting_('Partner app link', theirs);
}

var RECURRING_TRIGGERS = ['dailyRun', 'pollTasks', 'weeklySummary'];

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (RECURRING_TRIGGERS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ensureTriggers_();
}

/** Adds any recurring trigger that's missing (e.g. one added by a later update). */
function ensureTriggers_() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('dailyRun') === -1) ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(6).inTimezone(TZ).create();
  if (have.indexOf('pollTasks') === -1) ScriptApp.newTrigger('pollTasks').timeBased().everyMinutes(10).create();
  if (have.indexOf('weeklySummary') === -1) ScriptApp.newTrigger('weeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(18).inTimezone(TZ).create();
}

function dailyRun() {
  var problems = [];
  withLock_(function () {
    var today = todayYmd_();
    try { prepareSheet_(); ensureTriggers_(); } catch (e) { problems.push('Updating the Sheet: ' + e); }
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
  resetRun_(); // someone else may have just changed things: read fresh
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
