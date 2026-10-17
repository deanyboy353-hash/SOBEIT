/**
 * WebApp.gs: the endpoint your phone posts data to.
 *
 *   POST <Web app URL>?key=<Web app key>&source=<name>
 *
 * Every request is saved to the Inbox tab first, then passed to the handler
 * for its `source`. Phase 1 only has `raw` (save and stop).
 * source=health is your phone's health data (Health.gs). Later: `geofence` (MacroDroid) and so on.
 */

var POST_ROUTES = {
  raw: function () { return 'stored'; }
};

// What the installable app may call, by name. Everything checks the key itself.
function rpcTable_() {
  return {
    appState: appState, batch: batch, choresState: choresState, questDone: questDone, claimQuest: claimQuest, whatNow: whatNow,
    brainDump: brainDump, saveBrainDump: saveBrainDump, addQuest: addQuest, addShopping: addShopping, toggleShopping: toggleShopping,
    askToJoin: askToJoin, planChore: planChore, startChore: startChore, stepDone: stepDone, extendChore: extendChore,
    finishChore: finishChore, parkThing: parkThing, clearLater: clearLater, highFive: highFive, lazyDay: lazyDay, aftersReport: aftersReport, setSplit: setSplit, swapExercise: swapExercise, editTemplate: editTemplate, resetTemplate: resetTemplate, clientError: clientError,
    routineStep: routineStep, saveRoutine: saveRoutine, setupState: setupState, saveSetup: saveSetup, previewChores: previewChores, buildChores: buildChores, saveChore: saveChore, choreAction: choreAction, deleteRoutine: deleteRoutine, chatPing: chatPing, setDayOff: setDayOff, setDayOffLeave: setDayOffLeave, addWater: addWater, setTheme: setTheme, todayState: todayState, gymDone: gymDone,
    logWeightNow: logWeightNow, foodState: foodState, logPreset: logPreset, quickAdd: quickAdd, quickAddPhoto: quickAddPhoto, importWorkoutCsv: importWorkoutCsv, backupStatus: backupStatus, backupNow: backupNow, exportAll: exportAll, importBackup: importBackup, undoLast: undoLast,
    saveClaudeKey: saveClaudeKey, trainState: trainState, setTrainingMax: setTrainingMax, saveWorkout: saveWorkout,
    respreadSchedule: respreadSchedule, saveQuest: saveQuest, deleteQuest: deleteQuest,
    gamesState: gamesState, guessWord: guessWord, submitTarget: submitTarget, submitRecall: submitRecall,
    registerDevice: registerDevice, sendNudge: sendNudge, ask: ask, clearAsk: clearAsk, getBrief: getBrief,
    mealIdeas: mealIdeas, logIdea: logIdea, logUs: logUs, sendWink: sendWink, answerTonight: answerTonight,
    setStake: setStake, submitTempo: submitTempo, setTodaySession: setTodaySession,
    healthDay: healthDay, healthInsight: healthInsight, importHealth: importHealth, setPrefs: setPrefs,
    addDeadline: addDeadline, deadlineAction: deadlineAction, buyItem: buyItem, upgradeItem: upgradeItem, sellItem: sellItem, setFavourite: setFavourite, saveWeekPlan: saveWeekPlan,
    workState: workState, addBlock: addBlock, planDay: planDay, updateBlock: updateBlock, blockAction: blockAction, shiftBlocks: shiftBlocks, copyPlan: copyPlan,
    buyWear: buyWear, setLook3d: setLook3d, saveLookSlot: saveLookSlot, wearLookSlot: wearLookSlot, deleteLookSlot: deleteLookSlot, testPush: testPush, countBlock: countBlock, undoAction: undoAction, removeFood: removeFood, editFood: editFood, removeShopping: removeShopping, setTimer: setTimer, clearTimer: clearTimer, saveTemplate: saveTemplate, deleteTemplate: deleteTemplate, logCardio: logCardio, deleteCardio: deleteCardio
  };
}

/**
 * Several taps in one request (the phone's outbox): each runs in order and on its own (one failing doesn't stop
 * the rest), then the screen is built once. → { results: [{ id, ok, result | error }], state }.
 */
var BATCH_MAX = 40;
function batch(key, items) {
  who_(key);
  items = (items || []).slice(0, BATCH_MAX);
  var table = rpcTable_(), results = [];
  DEFER_STATE_ = true;
  try {
    items.forEach(function (it) {
      var fn = it && table[it.fn];
      if (!fn || it.fn === 'batch' || it.fn === 'appState') { results.push({ id: it && it.id, ok: false, error: 'Unknown action.' }); return; }
      try {
        var r = fn.apply(null, [key].concat(it.args || []));
        if (r && r.deferred) r = null; else if (r && r.state && r.state.deferred) { delete r.state; r.stateDeferred = true; }
        results.push({ id: it.id, ok: true, result: r });
      } catch (e) { results.push({ id: it.id, ok: false, error: String(e && e.message || e) }); }
    });
  } finally { DEFER_STATE_ = false; }
  clearStateCache_();
  return { results: results, state: appState(key) };
}

/** {fn, key, args} from the installable app → {ok, result} or {ok: false, error}. */
function rpc_(body) {
  try { ensureInstance_(body.key); } catch (e) { return json_({ ok: false, error: 'Setting up your app failed: ' + e.message }); }
  var fn = rpcTable_()[body.fn];
  if (!fn) return json_({ ok: false, error: 'Unknown action.' });
  try {
    return json_({ ok: true, result: fn.apply(null, [body.key].concat(body.args || [])) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var params = (e && e.parameter) || {};
  var raw = e && e.postData ? e.postData.contents : '';
  if (params.source === 'health') {
    // Your phone's health data (HC Webhook). Either of your keys; never stored in the Inbox (too big, too private).
    var hwho;
    try { hwho = who_(params.key); } catch (x) { return json_({ ok: false, error: 'bad key' }); }
    try {
      return json_({ ok: true, source: 'health', result: withLock_(function () { var r = ingestHealth_(raw, hwho); healthContact_(hwho, r.test ? 'test' : r.days ? 'data' : 'empty', r.days || 0); return r; }) });
    } catch (err) {
      try { healthContact_(hwho, 'error', 0, String(err)); } catch (x) { /* ignore */ }
      log_('ERROR', 'Health sync: ' + err);
      return json_({ ok: false, error: String(err) });
    }
  }
  if (raw && raw.charAt(0) === '{' && !params.source) {
    var body;
    try { body = JSON.parse(raw); } catch (x) { body = null; }
    if (body && body.fn) return rpc_(body);
  }
  if (!validKey_(params.key)) return json_({ ok: false, error: 'bad key' });
  var source = String(params.source || 'raw');
  var body = e.postData ? e.postData.contents : '';
  try {
    appendRow_('inbox', { 'Received at': now_('yyyy-MM-dd HH:mm:ss'), 'Source': source, 'Body': String(body).slice(0, 45000) });
    var handler = POST_ROUTES[source] || POST_ROUTES.raw;
    return json_({ ok: true, source: source, result: handler(body, params) });
  } catch (err) {
    log_('ERROR', 'doPost(' + source + '): ' + err);
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * The app: one page with Today, Food and Chores tabs. Your partner's key
 * opens the same app with only the Chores tab. No valid key (or ?status=1):
 * a short "I'm alive" reply that shows no data.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  try { ensureInstance_(params.key); } catch (err) { log_('WARN', 'Instance setup: ' + err); }
  var who = null;
  try { who = who_(params.key); } catch (err) { /* no valid key */ }
  if (!who || params.status) {
    return json_({ ok: true, service: 'sobeit', keyAccepted: validKey_(params.key), time: now_() });
  }
  var page = HtmlService.createTemplateFromFile('App');
  page.key = params.key;
  page.theme = String(prop_('THEME_' + who) || 'rave');
  page.tab = ({ chores: 'chores', quests: 'chores', food: 'food', train: 'train', play: 'play', you: 'you', more: 'you' })[String(params.page || '')] || '';
  page.initialJson = JSON.stringify(appState_(who)).replace(/</g, '\\u003c');
  var out = page.evaluate()
    .setTitle('Nudge')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  try { if (appBaseUrl_()) out.setFaviconUrl(appBaseUrl_().replace(/\/?$/, '/') + 'favicon-32.png'); } catch (e) {}
  return out;
}

// While a batch runs, actions skip building the whole screen; the batch builds it once at the end.
var DEFER_STATE_ = false;
function appState_(who) {
  if (DEFER_STATE_) return { deferred: true };
  prefetchTabs_(Object.keys(TABS).filter(function (k) { return k !== 'inbox' && k !== 'log'; }));
  var brief = JSON.parse(prop_('BRIEF_' + who) || 'null');
  var s = {
    who: who, solo: solo_(), now: new Date().getTime(), names: names_(), game: gameState_(who), quests: questsState_(who), chores: choresState_(who),
    routines: routinesState_(who), shopping: shoppingState_(), hasClaudeKey: !!claudeKey_(), schedule: scheduleState_(),
    games: gamesState_(who), push: pushStatus_(who), brief: brief && brief.date === todayYmd_() && brief.part === briefSlot(minutesNow_()) ? brief : null,
    theme: String(prop_('THEME_' + who) || 'rave')
  };
  s.fun = funState_(who, s.game);
  s.health = healthState_(who);
  s.deadlines = deadlinesState_(who);
  s.chat = chatConfig_(who);
  try { s.briefSig = briefSig_(who); } catch (e) { s.briefSig = ''; }
  s.work = workState_(who);
  s.wardrobe = wardrobeState_(who);
  s.undo = undoInfo_(who);
  s.empire = empireState_(who);
  s.catalog = empireCatalog_();
  s.plan = planState_();
  var pf = profile_(who), hh = health_(who);
  s.setup = { done: !!pf.done, built: house_().built, health: !!hh.on, partnerDone: !!profile_(who === 'me' ? 'partner' : 'me').done, motivation: pf.motivation };
  if (who === 'me') {
    s.today = todayState_();
    s.food = foodState_();
    s.train = trainState_();
  }
  return s;
}

/**
 * Everything for the app at once (used to refresh after coming back to it).
 * Kept for 5 minutes in the script cache, compressed (the full state is too big
 * for one cache entry, which silently made every refresh slow). Any change by
 * either of you clears it (withLock_), so refreshes are near-instant and never stale.
 */
var STATE_TTL = 300, STATE_PART = 90000;
// Bump when the screen's shape changes, so a deploy never serves a screen saved by the old code.
var STATE_VERSION = 'presets-1';
function appState(key) {
  var who = who_(key);
  // once: back up the gym data, then templates (a failure is logged and retried at most hourly, never in the way)
  if (!prop_('TRAIN_V3') && new Date().getTime() - Number(prop_('TRAIN_V3_TRY') || 0) > 3600000) {
    try { withLock_(ensureSplits_); } catch (e) { setProp_('TRAIN_V3_TRY', String(new Date().getTime())); log_('WARN', 'Training splits move: ' + e); }
  }
  var cache = stateCache_(), hit = cache && getCachedState_(cache, who);
  var stamp = todayYmd_() + '|' + dayPart(minutesNow_()) + '|' + STATE_VERSION;   // never serve yesterday's (or this morning's, or the old code's) screen
  if (hit && hit.cacheStamp === stamp) { hit.now = new Date().getTime(); return hit; }
  var state = withLock_(function () { if (!prop_('TITLES_V2')) { try { var st0 = readConfig_().settings; ['Your level titles', 'Partner level titles'].forEach(function (k) { var v = String(st0[k] || '').trim().toLowerCase(); if (v === 'ye' || v === 'kanye') setSetting_(k, 'Glam'); else if (v === 'gta') setSetting_(k, 'City'); }); setProp_('TITLES_V2', '1'); } catch (e) { log_('WARN', 'Titles: ' + e); } } if ((!prop_('LIFTOFF_V1') || !prop_('STRONG_V1') || !prop_('IMPORT_XP_V2')) && !instance_()) { try { ensureLiftoffImport_(); } catch (e) { log_('WARN', 'Liftoff import: ' + e); } } if (!prop_('BINS_V2') && !instance_()) { try { ensureHomeBins_(); } catch (e) { log_('WARN', 'Bins: ' + e); } } if (!prop_('ROUTINE_V2')) { try { tidyRoutines_(); } catch (e) { log_('WARN', 'Routines: ' + e); } } if (!prop_('TRANSPORT_V1')) { try { ensureTransport_(); } catch (e) { log_('WARN', 'Transport setup: ' + e); } } if (!prop_('PRESETS_V1')) { try { ensurePresets_(); } catch (e) { log_('WARN', 'Presets: ' + e); } } if (!prop_('TRAIN_V2')) { try { ensureRotation_(); } catch (e) { log_('WARN', 'Training rotation: ' + e); } } return appState_(who); });
  state.cacheStamp = stamp;
  if (cache) putCachedState_(cache, who, state);
  return state;
}

function putCachedState_(cache, who, state) {
  try {
    var json = JSON.stringify(state), packed;
    try { packed = 'Z' + Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes()); } catch (e) { packed = 'J' + json; }
    var parts = []; for (var i = 0; i < packed.length; i += STATE_PART) parts.push(packed.slice(i, i + STATE_PART));
    if (parts.length > 10) return;
    var o = {}; parts.forEach(function (p, k) { o['STATE_' + who + '_' + k] = p; });
    o['STATE_' + who] = String(parts.length);
    cache.putAll(o, STATE_TTL);
  } catch (e) { log_('WARN', 'State cache: ' + e); }
}

function getCachedState_(cache, who) {
  try {
    var n = Number(cache.get('STATE_' + who)); if (!n) return null;
    var keys = []; for (var i = 0; i < n; i++) keys.push('STATE_' + who + '_' + i);
    var got = cache.getAll(keys), packed = '';
    for (i = 0; i < n; i++) { if (got[keys[i]] === undefined || got[keys[i]] === null) return null; packed += got[keys[i]]; }
    var json = packed.charAt(0) === 'Z' ? Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(packed.slice(1)), 'application/x-gzip')).getDataAsString() : packed.slice(1);
    return JSON.parse(json);
  } catch (e) { return null; }
}

function stateCache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function clearStateCache_() {
  var cache = stateCache_();
  if (cache) cache.removeAll(['STATE_me', 'STATE_partner']);
}

/** Light, dark, or "auto" (match the phone). Remembered per person. */
function setTheme(key, theme) {
  var who = who_(key);
  if (['light', 'dark', 'auto', 'rave', 'grove', 'vice'].indexOf(theme) === -1) throw new Error('Unknown theme.');
  setProp_('THEME_' + who, theme);
  clearStateCache_();
  return theme;
}

/** Your link: the installable app once it's published, otherwise the Google page. */
function appUrl_() {
  var key = PROPS.getProperty('WEBAPP_KEY');
  return key ? (appBaseUrl_() || webappUrl_()) + '?key=' + key + (instance_() && appBaseUrl_() ? '&api=' + encodeURIComponent(webappUrl_()) : '') : '';
}

function validKey_(key) {
  var expected = PROPS.getProperty('WEBAPP_KEY');
  return !!expected && key === expected;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** A screen in the app failed to draw: noted in the Log tab (what broke, where), nothing else. */
function clientError(key, where, msg, stack) {
  var who = who_(key);
  log_('WARN', 'App screen "' + String(where).slice(0, 20) + '" (' + who + '): ' + String(msg).slice(0, 300) + ' | ' + String(stack || '').replace(/\s+/g, ' ').slice(0, 600));
  return true;
}
