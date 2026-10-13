/**
 * WeighIn.gs: item 3. Calendar alert at wake time + a task you type your
 * weight into. Ticking it logs the weight to the Weight tab.
 */

var WEIGH_TITLE = '⚖️ Weigh-in: type your weight here, then tick';

function planWeighIn_(ymd, cfg) {
  var s = cfg.settings;
  if (parseDays(s['Weigh-in days']).indexOf(dayOfWeek_(ymd)) === -1) {
    removeTaggedEvents_(ymd, 'weigh');
    return 'Not a weigh-in day';
  }
  var wake = cellClock_(s['Wake time']);
  if (wake === null) wake = parseClock('08:30');

  removeTaggedEvents_(ymd, 'weigh');
  var event = CalendarApp.getDefaultCalendar().createEvent('⚖️ Weigh in', atTime_(ymd, wake), atTime_(ymd, wake + 5), {
    description: 'Loo first, then scales, before food or drink.\n\n' +
      'Open the "Weigh-in" task in Google Tasks, tap the title and add your weight (e.g. "82.4", "13st 2" or "185 lb"), then tick it.'
  });
  event.setTag(EVENT_TAG, 'weigh');
  event.removeAllReminders();
  event.addPopupReminder(0);
  event.setColor(CalendarApp.EventColor.YELLOW);

  createTrackedTask_('weigh', ymd, WEIGH_TITLE, 'Examples: 82.4 · 13st 2 · 185 lb. Type it in the title or here.');
  return 'Weigh-in at ' + formatClock(wake);
}

function weightFromTask_(task, settings) {
  var title = String(task.title || '').replace(WEIGH_TITLE, '');
  return parseWeight(title + ' ' + (task.notes || '').replace(/^Examples:.*$/m, ''), settings['Weight unit'] || 'kg');
}

function onWeighTaskDone_(task, info) {
  var w = weightFromTask_(task, readConfig_().settings);
  if (!w) {
    // Ticked without a number: reopen it and ask again, rather than silently losing it.
    Tasks.Tasks.patch({ status: 'needsAction', completed: null, title: "⚖️ Didn't catch a number. Type your weight here, then tick" }, TASK_LIST, task.id);
    return true;
  }
  logWeight_(info.date, completedAt_(task).slice(11), w);
  return false;
}

/** Not ticked by the next morning: log it anyway if a number was typed. */
function onWeighTaskExpired_(task, info) {
  if (!task) return;
  var w = weightFromTask_(task, readConfig_().settings);
  if (w) logWeight_(info.date, '', w);
}

function logWeight_(ymd, time, w) {
  var prev = lastRowObject_('weight');
  var change = prev && prev['Weight (kg)'] !== '' ? Math.round((w.kg - Number(prev['Weight (kg)'])) * 10) / 10 : '';
  appendRow_('weight', { 'Date': ymd, 'Time': time, 'Weight (kg)': w.kg, 'You typed': w.typed, 'Change (kg)': change });
}
