/**
 * Timers.gs: a push to your phone the moment a timer ends (rest timer, chore
 * timer), even with the app closed. Pending timers sit in one list; a single
 * one-off trigger is armed for the earliest. nagRun (every 5 minutes) flushes
 * anything a trigger missed. The app shows the same notification itself when
 * it's open in the background, with the same tag, so you only see one.
 */

function timers_() { return JSON.parse(prop_('TIMERS') || '[]'); }

function saveTimers_(list) {
  setProp_('TIMERS', JSON.stringify(list));
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'timerRun') ScriptApp.deleteTrigger(t); });
  if (!list.length) return;
  var next = Math.min.apply(null, list.map(function (t) { return t.at; }));
  ScriptApp.newTrigger('timerRun').timeBased().at(new Date(Math.max(next, new Date().getTime() + 1000))).create();
}

function setTimer_(who, id, at, title, body, tab) {
  var list = timers_().filter(function (t) { return !(t.who === who && t.id === id); });
  list.push({ who: who, id: id, at: at, title: String(title).slice(0, 80), body: String(body || '').slice(0, 160), tab: tab || 'home' });
  saveTimers_(list);
}

function clearTimer_(who, id) {
  var list = timers_(), left = list.filter(function (t) { return !(t.who === who && t.id === id); });
  if (left.length !== list.length) saveTimers_(left);
}

/** Send every timer that's due (called by its trigger, and by nagRun as a backstop). */
function flushTimers_() {
  var now = new Date().getTime(), list = timers_(), due = list.filter(function (t) { return t.at <= now + 20000; });
  if (!due.length) return 0;
  due.forEach(function (t) { push_(t.who, t.title, t.body, t.tab, false, { timer: true, tag: 'timer-' + t.id }); });
  saveTimers_(list.filter(function (t) { return t.at > now + 20000; }));
  return due.length;
}

function timerRun() { withLock_(flushTimers_); }

// ---- called from the app ----

/** Start (or move) a timer: a push when it ends. */
function setTimer(key, id, seconds, title, body, tab) {
  var who = who_(key);
  id = String(id || '').replace(/[^\w-]/g, '').slice(0, 30);
  seconds = Math.round(Number(seconds));
  if (!id || !(seconds >= 5 && seconds <= 3 * 3600)) throw new Error('That timer doesn\'t look right.');
  return withLock_(function () { setTimer_(who, id, new Date().getTime() + seconds * 1000, title || 'Time\'s up', body, tab); return { ok: true }; });
}

function clearTimer(key, id) {
  var who = who_(key);
  return withLock_(function () { clearTimer_(who, String(id || '')); return { ok: true }; });
}
