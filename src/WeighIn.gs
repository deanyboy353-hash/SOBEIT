/**
 * WeighIn.gs: item 3. Calendar alert at wake time + a task you type your
 * weight into. Ticking it logs the weight to the Weight tab.
 */


function planWeighIn_(ymd, cfg) {
  var s = cfg.settings;
  if (parseDays(s['Weigh-in days']).indexOf(dayOfWeek_(ymd)) === -1) {
    removeTaggedEvents_(ymd, 'weigh');
    return 'Not a weigh-in day';
  }
  var wake = cellClock_(s['Wake time']);
  if (wake === null) wake = parseClock('08:30');

  removeTaggedEvents_(ymd, 'weigh');
  var event = CalendarApp.getDefaultCalendar().createEvent('Weigh in', atTime_(ymd, wake), atTime_(ymd, wake + 5), {
    description: 'Loo first, then scales, before food or drink.\n\n' +
      'Log it on Home in Nudge (82.4, 13st 2 or 185 lb).'
  });
  event.setTag(EVENT_TAG, 'weigh');
  event.removeAllReminders();
  event.addPopupReminder(0);
  event.setColor(CalendarApp.EventColor.YELLOW);

  return 'Weigh-in at ' + formatClock(wake);
}

function logWeight_(ymd, time, w) {
  var prev = lastRowObject_('weight');
  if (!prev || String(prev['Date']) !== ymd) addXp_('me', 'Weigh-in', 10, 'weigh');
  var change = prev && prev['Weight (kg)'] !== '' ? Math.round((w.kg - Number(prev['Weight (kg)'])) * 10) / 10 : '';
  appendRow_('weight', { 'Date': ymd, 'Time': time, 'Weight (kg)': w.kg, 'You typed': w.typed, 'Change (kg)': change });
}
