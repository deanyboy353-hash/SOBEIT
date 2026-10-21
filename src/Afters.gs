/**
 * Afters.gs: the one link with Afters, the DJ game (its own app at https://afters-dj.web.app).
 *
 * Afters sends reports here (aftersReport): practice minutes, and Academy lessons finished at Solid
 * or better. Each report has an id, so a report sent twice (Afters retries when this is unreachable)
 * counts once. In return: XP, the DJ headphones on your character on days you practised, and the
 * gold DJ headphones for your first finished lesson.
 *
 *   Practice   1 XP for every 2 minutes, up to 30 XP a day (an hour)
 *   Lesson     +10 XP the first time each lesson is finished
 */

var AFTERS_XP_CAP = 30, AFTERS_LESSON_XP = 10;

function aftersData_(who) {
  var d = JSON.parse(prop_('AFTERS_' + who) || 'null') || {};
  d.days = d.days || {}; d.paid = d.paid || {}; d.lessons = d.lessons || []; d.seen = d.seen || [];
  return d;
}

/** A report from Afters: { id, day: 'yyyy-mm-dd', minutes, lessons: [{ id, name, level }] }. */
function aftersReport(key, report) {
  var who = who_(key);
  report = report || {};
  var id = String(report.id || '').slice(0, 40), minutes = Math.round(Number(report.minutes) || 0);
  if (!/^[\w-]{6,40}$/.test(id)) throw new Error('That report has no id.');
  if (!(minutes >= 0 && minutes <= 600)) throw new Error('That practice time doesn\'t look right.');
  var lessons = (Array.isArray(report.lessons) ? report.lessons : []).slice(0, 20);
  return withLock_(function () {
    var d = aftersData_(who), today = todayYmd_(), xp = 0;
    if (d.seen.indexOf(id) !== -1) return { ok: true, duplicate: true, xp: 0, today: d.days[today] || 0 };
    // practice: counted on the day it happened (if it's within the last week), paid now
    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(report.day)) && report.day <= today && report.day >= addDays_(today, -7) ? String(report.day) : today;
    if (minutes) {
      d.days[day] = (d.days[day] || 0) + minutes;
      var due = Math.min(AFTERS_XP_CAP, Math.floor(d.days[day] / 2)) - (d.paid[day] || 0);
      if (due > 0) { d.paid[day] = (d.paid[day] || 0) + due; xp += addXp_(who, 'Mix practice in Afters', due, 'practice'); }
    }
    // lessons: XP once each, and the gold headphones for the first
    lessons.forEach(function (l) {
      var lid = String(l && l.id || '').slice(0, 40);
      if (!lid || d.lessons.indexOf(lid) !== -1) return;
      d.lessons.push(lid);
      xp += addXp_(who, 'Afters lesson: ' + String(l.name || lid).slice(0, 60), AFTERS_LESSON_XP, 'practice');
      grantAch_(who, 'booth1');
    });
    d.seen.push(id); d.seen = d.seen.slice(-300);
    Object.keys(d.days).sort().slice(0, -60).forEach(function (k) { delete d.days[k]; delete d.paid[k]; });
    setProp_('AFTERS_' + who, JSON.stringify(d));
    return { ok: true, xp: xp, today: d.days[today] || 0 };
  });
}

/** For the Mix practice card: minutes today and this week, lessons finished, and the address Afters reports to. */
function aftersState_(who) {
  var d = aftersData_(who), today = todayYmd_(), week = 0;
  for (var i = 0; i < 7; i++) week += d.days[addDays_(today, -i)] || 0;
  return { today: d.days[today] || 0, week: week, lessons: d.lessons.length, api: webappUrl_() };
}
