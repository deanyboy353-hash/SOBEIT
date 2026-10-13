/**
 * WebApp.gs: the endpoint your phone posts data to.
 *
 *   POST <Web app URL>?key=<Web app key>&source=<name>
 *
 * Every request is saved to the Inbox tab first, then passed to the handler
 * for its `source`. Phase 1 only has `raw` (save and stop).
 * Later: add `health` (HC Webhook), `geofence` (MacroDroid) and so on to POST_ROUTES.
 */

var POST_ROUTES = {
  raw: function () { return 'stored'; }
};

// What the installable app may call, by name. Everything checks the key itself.
function rpcTable_() {
  return {
    appState: appState, choresState: choresState, questDone: questDone, claimQuest: claimQuest, whatNow: whatNow,
    brainDump: brainDump, saveBrainDump: saveBrainDump, addQuest: addQuest, addShopping: addShopping, toggleShopping: toggleShopping,
    askToJoin: askToJoin, planChore: planChore, startChore: startChore, stepDone: stepDone, extendChore: extendChore,
    finishChore: finishChore, parkThing: parkThing, clearLater: clearLater, redeemReward: redeemReward, highFive: highFive,
    routineStep: routineStep, addWater: addWater, setTheme: setTheme, todayState: todayState, gymDone: gymDone,
    logWeightNow: logWeightNow, foodState: foodState, logPreset: logPreset, quickAdd: quickAdd, undoLast: undoLast,
    saveClaudeKey: saveClaudeKey, trainState: trainState, setTrainingMax: setTrainingMax, saveWorkout: saveWorkout,
    respreadSchedule: respreadSchedule, saveQuest: saveQuest, deleteQuest: deleteQuest,
    gamesState: gamesState, guessWord: guessWord, submitTarget: submitTarget, submitRecall: submitRecall,
    registerDevice: registerDevice, sendNudge: sendNudge, ask: ask, clearAsk: clearAsk, getBrief: getBrief,
    mealIdeas: mealIdeas, logIdea: logIdea
  };
}

/** {fn, key, args} from the installable app → {ok, result} or {ok: false, error}. */
function rpc_(body) {
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
  var who = null;
  try { who = who_(params.key); } catch (err) { /* no valid key */ }
  if (!who || params.status) {
    return json_({ ok: true, service: 'sobeit', keyAccepted: validKey_(params.key), time: now_() });
  }
  var page = HtmlService.createTemplateFromFile('App');
  page.key = params.key;
  page.theme = String(prop_('THEME_' + who) || 'light');
  page.tab = ({ chores: 'chores', quests: 'chores', food: 'food', train: 'train', play: 'play', you: 'you', more: 'you' })[String(params.page || '')] || '';
  page.initialJson = JSON.stringify(appState_(who)).replace(/</g, '\\u003c');
  return page.evaluate()
    .setTitle('Life Quest')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function appState_(who) {
  var brief = JSON.parse(prop_('BRIEF_' + who) || 'null');
  var s = {
    who: who, now: new Date().getTime(), names: names_(), game: gameState_(who), quests: questsState_(who), chores: choresState_(who),
    routines: routinesState_(who), shopping: shoppingState_(), hasClaudeKey: !!claudeKey_(), schedule: scheduleState_(),
    games: gamesState_(who), push: pushStatus_(who), brief: brief && brief.date === todayYmd_() ? brief : null,
    theme: String(prop_('THEME_' + who) || 'light')
  };
  if (who === 'me') {
    s.today = todayState_();
    s.food = foodState_();
    s.train = trainState_();
  }
  return s;
}

/** Everything for the app at once (used to refresh after coming back to it). */
function appState(key) {
  var who = who_(key);
  return withLock_(function () { return appState_(who); });
}

/** Light, dark, or "auto" (match the phone). Remembered per person. */
function setTheme(key, theme) {
  var who = who_(key);
  if (['light', 'dark', 'auto'].indexOf(theme) === -1) throw new Error('Unknown theme.');
  setProp_('THEME_' + who, theme);
  return theme;
}

/** Your link: the installable app once it's published, otherwise the Google page. */
function appUrl_() {
  var key = PROPS.getProperty('WEBAPP_KEY');
  return key ? (appBaseUrl_() || WEBAPP_URL) + '?key=' + key : '';
}

function validKey_(key) {
  var expected = PROPS.getProperty('WEBAPP_KEY');
  return !!expected && key === expected;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
