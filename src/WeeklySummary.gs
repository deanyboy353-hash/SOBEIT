/**
 * WeeklySummary.gs: item 8. Sunday evening calendar event with the week's
 * numbers and a preview of the week ahead. Health (sleep, steps) joins once
 * Health Connect data is flowing in.
 */

var WEEKLY_SUMMARY_AT = 19 * 60;

function weeklySummary() {
  withLock_(function () {
    var today = todayYmd_();
    var text = buildWeeklySummary_(today, readConfig_());
    removeTaggedEvents_(today, 'week');
    var event = CalendarApp.getDefaultCalendar().createEvent('Your week', atTime_(today, WEEKLY_SUMMARY_AT), atTime_(today, WEEKLY_SUMMARY_AT + 15), { description: text });
    event.setTag(EVENT_TAG, 'week');
    event.removeAllReminders();
    event.addPopupReminder(0);
    event.setColor(CalendarApp.EventColor.PALE_BLUE);
  });
}

function buildWeeklySummary_(endYmd, cfg) {
  var startYmd = addDays_(endYmd, -6);
  var lines = ['Week ' + startYmd + ' → ' + endYmd, ''];

  // Food: averages over the days something was logged.
  var byDay = {};
  rowsBetween_('food', startYmd, endYmd).forEach(function (r) {
    var d = byDay[r['Date']] = byDay[r['Date']] || { kcal: 0, protein: 0 };
    d.kcal += Number(r['kcal']) || 0;
    d.protein += Number(r['Protein (g)']) || 0;
  });
  var days = Object.keys(byDay);
  var t = foodTargets_(cfg.settings);
  lines.push('FOOD');
  if (days.length) {
    var avgK = Math.round(days.reduce(function (s, d) { return s + byDay[d].kcal; }, 0) / days.length);
    var avgP = Math.round(days.reduce(function (s, d) { return s + byDay[d].protein; }, 0) / days.length);
    var proteinHit = days.filter(function (d) { return byDay[d].protein >= t.proteinMin; }).length;
    var underKcal = days.filter(function (d) { return byDay[d].kcal <= t.kcal; }).length;
    lines.push('Daily average: ' + avgK + ' kcal (target ' + t.kcal + ') · ' + avgP + 'g protein (target ' + t.proteinMin + '–' + t.proteinMax + ')');
    lines.push('Logged ' + days.length + ' of 7 days · protein hit on ' + proteinHit + ' · within calories on ' + underKcal);
  } else {
    lines.push('Nothing logged this week.');
  }
  lines.push('');

  // Gym
  var gym = rowsBetween_('gym', startYmd, endYmd);
  var done = gym.filter(function (r) { return /^Done/.test(String(r['Status'])); });
  lines.push('GYM');
  lines.push(gym.length ? done.length + ' of ' + gym.length + ' sessions done' + (done.length ? ' (' + done.map(function (r) { return r['Day'] + ' ' + r['Session']; }).join(', ') + ')' : '') : 'No sessions planned.');
  lines.push('');

  // Weight
  var w = rowsBetween_('weight', startYmd, endYmd).filter(function (r) { return r['Weight (kg)'] !== ''; });
  lines.push('WEIGHT');
  if (w.length >= 2) {
    var first = Number(w[0]['Weight (kg)']), last = Number(w[w.length - 1]['Weight (kg)']);
    var diff = Math.round((last - first) * 10) / 10;
    lines.push(first + ' → ' + last + ' kg (' + (diff > 0 ? '+' : '') + diff + ')');
  } else if (w.length === 1) {
    lines.push(w[0]['Weight (kg)'] + ' kg (one weigh-in this week)');
  } else {
    lines.push('No weigh-ins this week.');
  }
  lines.push('');

  // Chores
  var chores = rowsBetween_('choresLog', startYmd, endYmd).filter(function (r) { return r['Result'] === 'Done'; });
  lines.push('CHORES');
  if (chores.length) {
    var names = { me: String(cfg.settings['Your name'] || 'You'), partner: String(cfg.settings['Partner name'] || 'Partner') };
    lines.push(['me', 'partner'].map(function (p) {
      var mine = chores.filter(function (r) { return r['Who'] === p; });
      return names[p] + ': ' + mine.length + (mine.length === 1 ? ' job, ' : ' jobs, ') + mine.reduce(function (s, r) { return s + (Number(r['Actual (min)']) || 0); }, 0) + ' min';
    }).join(' · '));
  } else {
    lines.push('No chores logged this week.');
  }
  lines.push('');

  // XP and streaks
  var goal = dailyGoal_(cfg.settings);
  var nm = { me: String(cfg.settings['Your name'] || 'You'), partner: String(cfg.settings['Partner name'] || 'Partner') };
  lines.push('XP & STREAKS');
  ['me', 'partner'].forEach(function (p) {
    var st = streakNow_(p, endYmd, goal);
    lines.push(nm[p] + ': ' + xpBetween_(p, startYmd, endYmd) + ' XP · ' + st.count + '-day streak · level ' + levelFor(xpTotal_(p)).level);
  });
  var team = streakNow_('team', endYmd, goal);
  if (team.count) lines.push('Team streak: ' + team.count + ' days together');
  lines.push('');

  // Training progress
  var tmRows = rowsBetween_('tmHistory', startYmd, endYmd).filter(function (r) { return r['1+ reps'] !== ''; });
  if (tmRows.length) {
    lines.push('STRENGTH');
    tmRows.forEach(function (r) {
      lines.push(r['Lift'] + ': ' + r['1+ reps'] + ' reps on the heavy set → TM ' + r['New TM'] + ' kg' + (Number(r['Change']) ? ' (+' + r['Change'] + ')' : ' (same)'));
    });
    lines.push('');
  }

  // Next week's top 3: the jobs most worth doing early
  var soon = readChores_().filter(function (q) { return q.due || (q.next && q.next <= addDays_(endYmd, 7)); })
    .sort(function (a, b) { return (b.due ? 1000 + b.score : 0) - (a.due ? 1000 + a.score : 0) || (a.next < b.next ? -1 : 1); }).slice(0, 3);
  if (soon.length) {
    lines.push('TOP 3 FOR NEXT WEEK');
    soon.forEach(function (q) { lines.push('• ' + q.name + (q.due ? ' (due now)' : ' (due ' + q.next.slice(5) + ')')); });
    lines.push('');
  }

  // Week ahead
  lines.push('WEEK AHEAD');
  var weighDays = parseDays(cfg.settings['Weigh-in days']);
  for (var i = 1; i <= 7; i++) {
    var ymd = addDays_(endYmd, i);
    var dow = dayOfWeek_(ymd);
    var bits = [];
    var day = cfg.schedule[dow];
    if (day && day.train) bits.push('' + day.session);
    if (weighDays.indexOf(dow) !== -1) bits.push('weigh-in');
    if (bits.length) lines.push(DAY_NAMES[dow] + ': ' + bits.join(' · '));
  }
  var text = lines.join('\n');
  var review = weeklyReviewAI_(text);
  return review ? review + '\n\n' + text : text;
}
