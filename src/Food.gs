/**
 * Food.gs: calorie and protein tracking.
 *
 * Functions without a trailing underscore are called from the food page
 * (App.html) via google.script.run. Each one checks the web app key
 * first, because the page is reachable by anyone who has its address.
 */

function foodTargets_(settings) {
  return {
    kcal: num_(settings, 'Daily kcal target', 1800),
    proteinMin: num_(settings, 'Protein min (g)', 130),
    proteinMax: num_(settings, 'Protein max (g)', 160)
  };
}

function foodEntries_(ymd) {
  return rowsBetween_('food', ymd, ymd).map(function (r) {
    return { entry: String(r['Entry']), time: String(r['Time']), item: String(r['Item']), kcal: Number(r['kcal']) || 0, protein: Number(r['Protein (g)']) || 0, source: String(r['Source']) };
  });
}

function sumFood_(entries) {
  return entries.reduce(function (t, e) { return { kcal: t.kcal + e.kcal, protein: t.protein + e.protein }; }, { kcal: 0, protein: 0 });
}

/** Everything the page needs to draw itself. */
function foodState_() {
  var settings = readConfig_().settings;
  var entries = foodEntries_(todayYmd_());
  return {
    date: todayYmd_(),
    targets: foodTargets_(settings),
    totals: sumFood_(entries),
    entries: entries,
    presets: readPresets_(),
    hasClaudeKey: !!claudeKey_()
  };
}

function addFood_(items, source) {
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  var ymd = todayYmd_();
  var time = now_('HH:mm');
  items.forEach(function (i) {
    appendRow_('food', { 'Date': ymd, 'Time': time, 'Item': i.name, 'kcal': i.kcal, 'Protein (g)': i.protein, 'Source': source, 'Entry': id });
  });
  return id;
}

function requireKey_(key) {
  if (!validKey_(key)) throw new Error('This link is out of date. Open your app link from the Config tab again.');
}

// ---- called from the page ----

function foodState(key) {
  requireKey_(key);
  return foodState_();
}

function logPreset(key, name) {
  requireKey_(key);
  return withLock_(function () {
    var preset = readPresets_().filter(function (p) { return p.name === name; })[0];
    if (!preset) throw new Error('"' + name + '" is no longer in your Presets tab. Close and reopen the page to refresh.');
    undoable_('me', preset.name, function () { addFood_([preset], 'preset'); });
    return { state: foodState_(), added: [preset], undo: undoInfo_('me') };
  });
}

function quickAdd(key, text) {
  requireKey_(key);
  text = String(text || '').trim();
  if (!text) throw new Error('Type what you ate first.');
  var items = estimateFood_(text, readPresets_(), String(readConfig_().settings['Claude model'] || '').trim() || CLAUDE_DEFAULT_MODEL);
  if (!items.length) throw new Error("Couldn't find any food in that. Try e.g. \"2 eggs on toast\".");
  return withLock_(function () {
    undoable_('me', text.slice(0, 40), function () { addFood_(items, 'quick-add: ' + text); });
    return { state: foodState_(), added: items, undo: undoInfo_('me') };
  });
}

/** A shared or snapped photo of food -> estimated and logged (with undo). */
function quickAddPhoto(key, b64, mime, note) {
  requireKey_(key);
  mime = String(mime || 'image/jpeg');
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error('That file isn\'t a photo Claude can read. Try a JPEG or PNG.');
  b64 = String(b64 || '');
  if (!b64 || b64.length > 6e6) throw new Error('That photo is too big. Try a smaller one.');
  var items = estimateFoodPhoto_(b64, mime, note, readPresets_(), claudeModel_());
  if (!items.length) throw new Error("Couldn't spot any food in that photo. Type it instead.");
  return withLock_(function () {
    undoable_('me', 'Photo: ' + items[0].name.slice(0, 30), function () { addFood_(items, 'photo' + (note ? ': ' + String(note).slice(0, 60) : '')); });
    return { state: foodState_(), added: items, undo: undoInfo_('me') };
  });
}

/** Remove one food item from today (the n-th row of that entry with that name). */
function removeFood(key, entry, item) {
  requireKey_(key);
  return withLock_(function () {
    var row = foodRowFor_(entry, item);
    if (!row) throw new Error('That item has gone already.');
    sheet_('food').deleteRow(row); forget_('food');
    return { state: foodState_() };
  });
}

/** Fix one food item: name, kcal or protein. */
function editFood(key, entry, item, ch) {
  requireKey_(key);
  ch = ch || {};
  return withLock_(function () {
    var row = foodRowFor_(entry, item);
    if (!row) throw new Error('That item has gone already.');
    var up = {};
    if (String(ch.item || '').trim()) up['Item'] = String(ch.item).trim().slice(0, 80);
    if (ch.kcal !== undefined && isFinite(ch.kcal) && ch.kcal >= 0 && ch.kcal < 5000) up['kcal'] = Math.round(Number(ch.kcal));
    if (ch.protein !== undefined && isFinite(ch.protein) && ch.protein >= 0 && ch.protein < 400) up['Protein (g)'] = Math.round(Number(ch.protein) * 10) / 10;
    updateRow_('food', row, up);
    return { state: foodState_() };
  });
}

function foodRowFor_(entry, item) {
  var v = vals_('food'), map = headerMap_('food'), today = todayYmd_();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][map['Entry']]) === String(entry) && String(v[i][map['Item']]) === String(item) && String(v[i][map['Date']]).slice(0, 10) === today) return i + 1;
  }
  return 0;
}

/** Removes the most recent entry (all rows from one tap or one quick-add), today only. */
function undoLast(key) {
  requireKey_(key);
  return withLock_(function () {
    var sh = sheet_('food');
    var last = vals_('food').length;
    if (last < 2) throw new Error('Nothing to undo.');
    var lastRow = readRow_('food', last);
    if (String(lastRow['Date']) !== todayYmd_()) throw new Error('Nothing logged today to undo.');
    var id = String(lastRow['Entry']);
    var removed = [];
    for (var r = last; r >= 2; r--) {
      var row = readRow_('food', r);
      if (String(row['Entry']) !== id) break;
      removed.unshift(String(row['Item']));
      sh.deleteRow(r);
    }
    forget_('food');
    return { state: foodState_(), removed: removed };
  });
}

function saveClaudeKey(key, apiKey) {
  requireKey_(key);
  apiKey = String(apiKey || '').trim();
  if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(apiKey)) throw new Error("That doesn't look like a Claude API key. It should start with sk-ant-");
  PROPS.setProperty('ANTHROPIC_API_KEY', apiKey);
  return foodState_();
}

// ---- the 11pm check ----

/** Daily job: book a one-off trigger shortly before the evening check time. */
function scheduleFoodCheck_(ymd, cfg) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'foodCheck') ScriptApp.deleteTrigger(t);
  });
  var at = cellClock_(cfg.settings['Evening food check']);
  if (at === null) at = parseClock('23:00');
  var fireAt = atTime_(ymd, at - 20);
  if (fireAt.getTime() <= new Date().getTime()) return 'Food check time already passed today';
  ScriptApp.newTrigger('foodCheck').timeBased().at(fireAt).create();
  return 'Food check booked for ' + formatClock(at);
}

function foodCheck() {
  withLock_(function () {
    var ymd = todayYmd_();
    var settings = readConfig_().settings;
    var at = cellClock_(settings['Evening food check']);
    if (at === null) at = parseClock('23:00');
    var entries = foodEntries_(ymd);
    var totals = sumFood_(entries), targets = foodTargets_(settings);
    if (totals.protein >= targets.proteinMin) addXp_('me', 'Protein target hit', 15, 'protein');
    if (entries.length >= 3 && totals.kcal <= targets.kcal) addXp_('me', 'Food logged, within calories', 10, 'food');
    var text = buildFoodCheckText(sumFood_(entries), foodTargets_(settings), entries.length, appUrl_());
    removeTaggedEvents_(ymd, 'food');
    var event = CalendarApp.getDefaultCalendar().createEvent(text.title, atTime_(ymd, at), atTime_(ymd, at + 5), { description: text.description });
    event.setTag(EVENT_TAG, 'food');
    event.removeAllReminders();
    event.addPopupReminder(0);
    event.setColor(CalendarApp.EventColor.ORANGE);
  });
}
