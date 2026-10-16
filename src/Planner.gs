/**
 * Planner.gs: pure logic with no Google services, so it can be unit-tested
 * in Node (see test/). Times of day are plain "minutes since midnight"
 * numbers; turning them into real Dates happens in the Google-facing files.
 */

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "15:00", "3pm", "3:30 pm", "1500", "15.00" or a fraction of a day -> minutes. */
function parseClock(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value >= 0 && value < 1) return Math.round(value * 24 * 60);
    if (value >= 0 && value < 24) return Math.round(value * 60);
    return null;
  }
  var s = String(value).trim().toLowerCase();
  var m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  var h = Number(m[1]);
  var min = m[2] ? Number(m[2]) : 0;
  var ampm = m[3];
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minutes -> "15:05" */
function formatClock(minutes) {
  var m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  var h = Math.floor(m / 60);
  var mm = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
}

/** Rest periods: "3 min", "2.5 min", "2:30", "90 sec", "90s". Bare numbers above 10 are seconds, otherwise minutes. Returns seconds. */
function parseRestSeconds(value) {
  if (value === null || value === undefined || value === '') return 0;
  var s = String(value).trim().toLowerCase();
  var colon = s.match(/^(\d+):(\d{2})/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  var num = s.match(/(\d+(?:\.\d+)?)/);
  if (!num) return 0;
  var n = Number(num[1]);
  if (/s(ec)?/.test(s.replace(/\d|\.|\s/g, '')) && !/m/.test(s)) return Math.round(n);
  if (/m/.test(s)) return Math.round(n * 60);
  return n > 10 ? Math.round(n) : Math.round(n * 60);
}

/** "Mon, Wed" / "monday wednesday" -> [1, 3] */
function parseDays(text) {
  var out = [];
  String(text || '').toLowerCase().split(/[^a-z]+/).forEach(function (word) {
    if (word.length < 2) return;
    for (var i = 0; i < 7; i++) {
      if (DAY_NAMES[i].toLowerCase().indexOf(word.slice(0, 3)) === 0 && out.indexOf(i) === -1) out.push(i);
    }
  });
  return out.sort();
}

function firstInt(value) {
  var m = String(value === undefined || value === null ? '' : value).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Rough gym time: each set takes `secondsPerSet` of work plus its rest, plus warm-up and a minute to move between exercises. */
function estimateSessionMinutes(exercises, opts) {
  var secondsPerSet = opts.secondsPerSet || 45;
  var total = 0;
  exercises.forEach(function (ex) {
    var sets = firstInt(ex.sets) || 1;
    total += sets * secondsPerSet + Math.max(sets - 1, 0) * parseRestSeconds(ex.rest) + 60;
  });
  return Math.round(total / 60 + (opts.warmup || 0));
}

/**
 * Work out the trip timings for one travel mode.
 * p: {mode, freeFrom, prep, sessionMinutes, bikeMinutes, busMinutes, walkToStop, lastBus}
 */
function planTrip(p) {
  var leaveAt = p.freeFrom + p.prep;
  if (p.mode === 'bike') {
    var arrive = leaveAt + p.bikeMinutes;
    var finish = arrive + p.sessionMinutes;
    return { mode: 'bike', leaveAt: leaveAt, arriveAt: arrive, finishAt: finish, homeAt: finish + p.bikeMinutes, latestLeave: null, tight: false, shortBy: 0 };
  }
  var arriveAt = leaveAt + p.busMinutes;
  var finishAt = arriveAt + p.sessionMinutes;
  var latestLeave = p.lastBus - p.walkToStop - p.sessionMinutes - p.busMinutes;
  return {
    mode: 'bus',
    leaveAt: leaveAt,
    arriveAt: arriveAt,
    finishAt: finishAt,
    homeAt: finishAt + p.walkToStop + p.busMinutes,
    latestLeave: latestLeave,
    tight: leaveAt > latestLeave,
    shortBy: Math.max(0, leaveAt - latestLeave)
  };
}

/** Forecast hours touching [startMin, endMin). Hours are {hour, temp, rainProb, rainMm, wind, gust}. */
function hoursInWindow(hours, startMin, endMin) {
  return (hours || []).filter(function (h) {
    return h.hour * 60 < endMin && (h.hour + 1) * 60 > startMin;
  });
}

/**
 * Bike or bus? Bike only if every hour of the round trip passes the rules.
 * rules: {maxRainProb, maxRainMm, minTemp, maxGust}
 */
function chooseTravel(hours, startMin, endMin, rules) {
  var window = hoursInWindow(hours, startMin, endMin);
  if (!window.length) {
    return { mode: 'bus', reasons: ["couldn't get the forecast, so bus is the safe choice"], summary: '' };
  }
  var worst = {
    rainProb: Math.max.apply(null, window.map(function (h) { return h.rainProb || 0; })),
    rainMm: Math.max.apply(null, window.map(function (h) { return h.rainMm || 0; })),
    minTemp: Math.min.apply(null, window.map(function (h) { return h.temp; })),
    maxTemp: Math.max.apply(null, window.map(function (h) { return h.temp; })),
    gust: Math.max.apply(null, window.map(function (h) { return h.gust || 0; }))
  };
  var reasons = [];
  if (worst.rainProb > rules.maxRainProb) reasons.push(worst.rainProb + '% chance of rain');
  if (worst.rainMm > rules.maxRainMm) reasons.push(worst.rainMm + ' mm of rain forecast');
  if (worst.minTemp < rules.minTemp) reasons.push('cold (' + Math.round(worst.minTemp) + '°C)');
  if (worst.gust > rules.maxGust) reasons.push('gusts up to ' + Math.round(worst.gust) + ' km/h');
  var summary = Math.round(worst.minTemp) + (Math.round(worst.minTemp) === Math.round(worst.maxTemp) ? '' : '–' + Math.round(worst.maxTemp)) +
    '°C, rain chance up to ' + worst.rainProb + '%, gusts up to ' + Math.round(worst.gust) + ' km/h';
  return reasons.length ? { mode: 'bus', reasons: reasons, summary: summary } : { mode: 'bike', reasons: ['dry and calm'], summary: summary };
}

/**
 * Pull a body weight out of whatever was typed into the task.
 * Accepts "82.4", "82,4kg", "13st 4", "13 st 4.5 lb", "185 lb". Bare numbers use defaultUnit.
 * Returns {kg, typed} or null.
 */
function parseWeight(text, defaultUnit) {
  var s = String(text || '').toLowerCase().replace(/,/g, '.');
  var st = s.match(/(\d+(?:\.\d+)?)\s*st(?:one)?s?\b\s*(?:(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)?)?/);
  var kg = null;
  if (st) {
    kg = (Number(st[1]) * 14 + (st[2] ? Number(st[2]) : 0)) * 0.45359237;
  } else {
    var lb = s.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/);
    var kgm = s.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?)?/);
    if (lb) kg = Number(lb[1]) * 0.45359237;
    else if (kgm) {
      var n = Number(kgm[1]);
      var unit = String(defaultUnit || 'kg').toLowerCase();
      kg = unit === 'lb' ? n * 0.45359237 : unit === 'st' ? n * 14 * 0.45359237 : n;
    }
  }
  if (kg === null || !(kg >= 30 && kg <= 300)) return null;
  return { kg: Math.round(kg * 10) / 10, typed: String(text).trim() };
}

function formatExercise(ex, i) {
  if (ex.line) return (i + 1) + '. ' + ex.line + (ex.rest ? ' · rest ' + ex.rest : '');
  var line = (i + 1) + '. ' + ex.exercise + ': ' + (ex.sets || '?') + ' × ' + (ex.reps || '?');
  if (ex.rpe !== '' && ex.rpe !== undefined && ex.rpe !== null) line += ' @ RPE ' + ex.rpe;
  if (ex.rest) line += ' · rest ' + ex.rest;
  if (ex.notes) line += '\n   ' + ex.notes;
  return line;
}

/**
 * Calendar title + description for the gym event.
 * plan: {sessionName, exercises, sessionMinutes, trip, travel, sunset, lastBus, warnings}
 */
function buildGymEventText(plan) {
  var t = plan.trip;
  var bike = t.mode === 'bike';
  var title = (t.tight ? 'Tight: ' : '') + '' + plan.sessionName + ' · ' + (bike ? 'Bike' : 'Bus') + ' · leave ' + formatClock(t.leaveAt);

  var lines = [];
  lines.push((bike ? 'BIKE today: ' : 'BUS today: ') + plan.travel.reasons.join(', ') + '.');
  lines.push('Leave home: ' + formatClock(t.leaveAt));
  if (!bike) {
    if (t.tight) {
      lines.push('Tight today: you need to leave by ' + formatClock(t.latestLeave) + ' to finish in time for the last bus (' +
        formatClock(plan.lastBus) + '). That is ' + t.shortBy + ' min earlier than planned, so cut the last exercise or two.');
    } else {
      lines.push('Latest you can leave: ' + formatClock(t.latestLeave) + ' (and still make the last bus at ' + formatClock(plan.lastBus) + ')');
    }
  }
  lines.push('Training: ' + formatClock(t.arriveAt) + '–' + formatClock(t.finishAt) + ' (about ' + plan.sessionMinutes + ' min)');
  lines.push('Home about: ' + formatClock(t.homeAt));
  if (bike && plan.sunset !== null && plan.sunset !== undefined && t.homeAt > plan.sunset) {
    lines.push('Sunset is ' + formatClock(plan.sunset) + ', so lights on for the ride home.');
  }
  if (plan.travel.summary) lines.push('Weather: ' + plan.travel.summary);
  (plan.warnings || []).forEach(function (w) { lines.push('Note: ' + w); });
  lines.push('');
  lines.push(plan.sessionName.toUpperCase());
  plan.exercises.forEach(function (ex, i) { lines.push(formatExercise(ex, i)); });
  lines.push('');
  lines.push('Log it in the app\'s Train tab.');
  return { title: title, description: lines.join('\n') };
}

/**
 * The 11pm alert. totals {kcal, protein}, targets {kcal, proteinMin, proteinMax}.
 * Over on calories → suggest a small protein snack instead of "kcal left".
 */
function buildFoodCheckText(totals, targets, entryCount, pageUrl) {
  var kcal = Math.round(totals.kcal);
  var protein = Math.round(totals.protein);
  var proteinShort = Math.max(0, targets.proteinMin - protein);
  var proteinPart = proteinShort ? proteinShort + 'g protein to go' : 'protein done';
  var title;
  var advice;
  if (!entryCount) {
    title = 'No food logged today';
    advice = 'If you ate, add it now. A rough guess beats a blank day.';
  } else if (kcal > targets.kcal) {
    var over = kcal - targets.kcal;
    if (proteinShort) {
      title = 'Over by ' + over + ' kcal · ' + proteinShort + 'g protein short → shake or yogurt';
      advice = FOOD_SNACKS + ' closes most of the protein gap for very few calories.';
    } else {
      title = 'Over by ' + over + ' kcal · protein done · kitchen closed';
      advice = "Protein's done, so nothing else needed today.";
    }
  } else {
    title = '' + (targets.kcal - kcal) + ' kcal left · ' + proteinPart;
    advice = proteinShort ? 'Make whatever you eat next mostly protein. ' + FOOD_SNACKS + ' are easy wins.' : 'Targets hit. Nice.';
  }
  var lines = [
    'Today: ' + kcal + ' of ' + targets.kcal + ' kcal · ' + protein + 'g protein (target ' + targets.proteinMin + '–' + targets.proteinMax + 'g)',
    '',
    advice
  ];
  if (protein > targets.proteinMax) lines.push('(Protein is above your range. Fine, just noting it.)');
  if (pageUrl) lines.push('', 'Open the app: ' + pageUrl);
  return { title: title, description: lines.join('\n') };
}

var FOOD_SNACKS = 'A protein shake (~120 kcal, 24 g) or a 0% Greek yogurt (~95 kcal, 17 g)';

// ---------- Dates as plain day numbers (no time zones involved) ----------

function ymdToDays(ymd) {
  var p = String(ymd).split('-');
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000);
}

function daysToYmd(n) {
  var d = new Date(n * 86400000);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

/** 0 = Sunday ... 6 = Saturday */
function weekdayOfDays(n) {
  return ((n + 4) % 7 + 7) % 7;
}

// ---------- Recurring quests ----------

/**
 * How often a quest repeats, from the Chores tab's "Every" column:
 * "daily", "3" / "3 days", "weekly", "2 weeks" / "fortnightly", "monthly",
 * "3 months", "yearly", weekdays ("Wed" or "Mon, Thu"), "monthly 15"
 * (the 15th of each month), or blank / "as needed" (never scheduled).
 */
function parseEvery(text) {
  var s = String(text === undefined || text === null ? '' : text).trim().toLowerCase();
  if (!s || /as needed|never|^-$/.test(s)) return { kind: 'none' };
  var m = s.match(/^monthly\s+(?:on\s+)?(?:the\s+)?(\d{1,2})/);
  if (m) return { kind: 'monthly', day: Math.min(31, Math.max(1, Number(m[1]))) };
  m = s.match(/^weekly\s+(?:on\s+)?([a-z ,]+)$/);
  if (m && parseDays(m[1]).length) return { kind: 'weekdays', days: parseDays(m[1]) };
  m = s.match(/^(?:(2|3|4) weeks|fortnightly|biweekly|every (2|3|4) weeks)\s+(?:on\s+)?([a-z]+)$/);
  if (m && parseDays(m[3]).length) return { kind: 'biweekly', day: parseDays(m[3])[0], weeks: Number(m[1] || m[2] || 2) };
  if (/^(daily|every ?day)$/.test(s)) return { kind: 'days', days: 1 };
  if (/^weekly$/.test(s)) return { kind: 'days', days: 7 };
  if (/^fortnightly$/.test(s)) return { kind: 'days', days: 14 };
  if (/^monthly$/.test(s)) return { kind: 'days', days: 30 };
  if (/^(yearly|annually)$/.test(s)) return { kind: 'days', days: 365 };
  m = s.match(/^(?:every\s+)?(\d+(?:\.\d+)?)\s*(d|days?|w|weeks?|m|months?|y|years?)?$/);
  if (m) {
    var n = Number(m[1]);
    var unit = (m[2] || 'd').charAt(0);
    var days = Math.round(n * ({ d: 1, w: 7, m: 30, y: 365 })[unit]);
    return days > 0 ? { kind: 'days', days: days } : { kind: 'none' };
  }
  var wd = parseDays(s);
  if (wd.length) return { kind: 'weekdays', days: wd };
  return { kind: 'none' };
}

/**
 * Is a quest due today? Repeats count from when it was last done, so a late
 * job never piles up. Returns {due, overdue, next, score}: a higher score
 * means more pressing (fixed-date jobs like bin day first).
 */
function questDue(every, lastDoneYmd, todayYmd, nextDueYmd) {
  var e = typeof every === 'string' || !every ? parseEvery(every) : every;
  var today = ymdToDays(todayYmd);
  var last = lastDoneYmd ? ymdToDays(lastDoneYmd) : null;
  var doneToday = last === today;
  if (e.kind === 'none') return { due: false, overdue: 0, next: '', score: 0 };
  // Fixed schedules (set days or dates) follow the "Next due" date once it's set.
  if (nextDueYmd && e.kind !== 'days') {
    var nd = ymdToDays(nextDueYmd);
    if (doneToday && nd <= today) nd = ymdToDays(nextOccurrence(e, todayYmd, nextDueYmd));
    var od = today - nd;
    return { due: od >= 0, overdue: Math.max(0, od), next: daysToYmd(Math.max(nd, today)), score: od >= 0 ? (e.kind === 'weekdays' ? 10 : 5) + od : 0 };
  }
  if (e.kind === 'biweekly') {
    var first = ymdToDays(nextOccurrence(e, daysToYmd(today - 1), ''));
    return { due: first === today && !doneToday, overdue: 0, next: daysToYmd(first), score: first === today ? 6 : 0 };
  }
  if (e.kind === 'days') {
    if (last === null) return { due: true, overdue: 0, next: todayYmd, score: 0.5 };
    var next = last + e.days;
    var over = today - next;
    return { due: over >= 0, overdue: Math.max(0, over), next: daysToYmd(Math.max(next, today)), score: over >= 0 ? (over + 1) / e.days : 0 };
  }
  if (e.kind === 'weekdays') {
    var isDay = e.days.indexOf(weekdayOfDays(today)) !== -1;
    var due = isDay && !doneToday;
    var n2 = today + (due ? 0 : 1);
    while (e.days.indexOf(weekdayOfDays(n2)) === -1) n2++;
    return { due: due, overdue: 0, next: daysToYmd(n2), score: due ? 10 : 0 };
  }
  // monthly on a set day (clamped to short months)
  var t = new Date(today * 86400000);
  function occurrence(y, mo) {
    var len = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return Math.round(Date.UTC(y, mo, Math.min(e.day, len)) / 86400000);
  }
  var y = t.getUTCFullYear(), mth = t.getUTCMonth();
  var occ = occurrence(y, mth);
  if (occ > today) occ = occurrence(mth === 0 ? y - 1 : y, (mth + 11) % 12);
  var dueM = last === null || last < occ;
  if (last === null) return { due: true, overdue: 0, next: todayYmd, score: 5 };
  var nextOcc = occurrence(mth === 11 ? y + 1 : y, (mth + 1) % 12);
  if (occurrence(y, mth) > today) nextOcc = occurrence(y, mth);
  return { due: dueM, overdue: dueM ? today - occ : 0, next: dueM ? todayYmd : daysToYmd(nextOcc), score: dueM ? 5 + (today - occ) : 0 };
}

/**
 * The next date a fixed schedule falls on, strictly after `afterYmd`.
 * Every-2-weeks keeps its rhythm from `anchorYmd` (the last due date).
 */
function nextOccurrence(every, afterYmd, anchorYmd) {
  var e = typeof every === 'string' || !every ? parseEvery(every) : every;
  var after = ymdToDays(afterYmd);
  var n;
  if (e.kind === 'days') return daysToYmd(after + e.days);
  if (e.kind === 'weekdays') {
    n = after + 1;
    while (e.days.indexOf(weekdayOfDays(n)) === -1) n++;
    return daysToYmd(n);
  }
  if (e.kind === 'biweekly') {
    if (anchorYmd) {
      n = ymdToDays(anchorYmd);
      var step = 7 * (e.weeks || 2);
      while (n <= after) n += step;
      while (n - step > after) n -= step;
      return daysToYmd(n);
    }
    n = after + 1;
    while (weekdayOfDays(n) !== e.day) n++;
    return daysToYmd(n);
  }
  if (e.kind === 'monthly') {
    var t = new Date((after + 1) * 86400000), y = t.getUTCFullYear(), mo = t.getUTCMonth();
    for (var k = 0; k < 14; k++) {
      var yy = y + Math.floor((mo + k) / 12), mm = (mo + k) % 12;
      var len = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
      var cand = Math.round(Date.UTC(yy, mm, Math.min(e.day, len)) / 86400000);
      if (cand > after) return daysToYmd(cand);
    }
  }
  return '';
}

/**
 * Next due date after finishing a job today. Doing a fortnightly or monthly
 * job early pushes the next one back, so it doesn't come round again days later.
 */
function nextAfterDone(every, todayYmd, nextDueYmd) {
  var e = typeof every === 'string' || !every ? parseEvery(every) : every;
  var n = nextOccurrence(e, todayYmd, nextDueYmd);
  if (!n) return '';
  var gap = ymdToDays(n) - ymdToDays(todayYmd);
  if (e.kind === 'biweekly' && gap < 7) n = daysToYmd(ymdToDays(n) + 7 * (e.weeks || 2));
  if (e.kind === 'monthly' && gap < 14) n = nextOccurrence(e, n, '');
  return n;
}

/** Which of the four rhythms a schedule belongs to (for the Schedule page). */
function rhythmOf(every) {
  var e = typeof every === 'string' || !every ? parseEvery(every) : every;
  if (e.kind === 'days' && e.days === 1) return 'daily';
  if (e.kind === 'weekdays') return 'weekly';
  if (e.kind === 'biweekly') return 'biweekly';
  if (e.kind === 'monthly') return 'monthly';
  if (e.kind === 'days' && e.days <= 10) return 'weekly';
  if (e.kind === 'days' && e.days <= 20) return 'biweekly';
  if (e.kind === 'days' && e.days <= 45) return 'monthly';
  return 'other';
}

/** "Mon, Thu" / "Sun" / "15th" style label for a schedule. */
function rhythmLabel(every) {
  var e = typeof every === 'string' || !every ? parseEvery(every) : every;
  var full = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  if (/^2\.5 days$/.test(String(every || '').trim())) return 'A few times a week';
  if (e.kind === 'days') return e.days === 1 ? 'Every day' : e.days === 7 ? 'Weekly' : e.days === 30 ? 'Monthly' : e.days % 7 === 0 ? 'Every ' + (e.days / 7) + ' weeks' : 'Every ' + e.days + ' days';
  if (e.kind === 'weekdays') return e.days.map(function (d) { return full[d]; }).join(' and ');
  if (e.kind === 'biweekly') return (e.weeks > 2 ? 'Every ' + e.weeks + ' weeks on ' : 'Every other ') + full[e.day].replace(/s$/, '');
  if (e.kind === 'monthly') return 'Monthly on the ' + e.day + (['th', 'st', 'nd', 'rd'][(e.day % 100 > 10 && e.day % 100 < 14) ? 0 : Math.min(e.day % 10, 4) % 4] || 'th');
  return 'When needed';
}

// ---------- XP and levels ----------

/** Level n needs 50·n·(n−1) XP in total: 100 for level 2, 300 for 3, 600 for 4... */
function levelFor(totalXp) {
  var n = 1;
  while (50 * (n + 1) * n <= totalXp) n++;
  var base = 50 * n * (n - 1), next = 50 * (n + 1) * n;
  return { level: n, into: totalXp - base, need: next - base };
}

// ---------- Strength training (nSuns-style) ----------

/** "75x5, 85x3, 95x1+" -> [{pct: 75, reps: 5, amrap: false}, ...] */
function parseScheme(text) {
  return String(text || '').split(/[,;\n]+/).map(function (part) {
    var m = part.trim().match(/^(\d+(?:\.\d+)?)\s*%?\s*[x×]\s*(\d+)\s*(\+)?$/i);
    return m ? { pct: Number(m[1]), reps: Number(m[2]), amrap: !!m[3] } : null;
  }).filter(Boolean);
}

function roundTo(weight, step) {
  step = step || 2.5;
  return Math.round(weight / step) * step;
}

/** Estimated one-rep max (Epley). */
function e1rm(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * nSuns progression from the reps on the heavy 1+ set:
 * 0–1 → stay, 2–3 → +2.5, 4–5 → +2.5 upper / +5 lower, 6+ → +5 upper / +7.5 lower (kg).
 */
function tmIncrease(reps, body) {
  var lower = String(body || '').toLowerCase() === 'lower';
  if (reps <= 1) return 0;
  if (reps <= 3) return 2.5;
  if (reps <= 5) return lower ? 5 : 2.5;
  return lower ? 7.5 : 5;
}

/** Sets with real weights from a training max, rounded to the plates you have. */
function schemeSets(schemeText, tm, step) {
  return parseScheme(schemeText).map(function (s) {
    return { pct: s.pct, reps: s.reps, amrap: s.amrap, weight: tm ? roundTo(tm * s.pct / 100, step) : null };
  });
}

// ---------- Games ----------

/** Colours for a guess: g = right place, y = in the word elsewhere, b = not in it. Repeated letters handled like Wordle. */
function scoreGuess(guess, answer) {
  var res = ['b', 'b', 'b', 'b', 'b'], left = {};
  for (var i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 'g';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (var j = 0; j < 5; j++) {
    if (res[j] !== 'g' && left[guess[j]]) { res[j] = 'y'; left[guess[j]]--; }
  }
  return res.join('');
}

/** Today's word number: walks through every answer once before repeating (not the same order as NYT Wordle). */
function wordIndex(ymd, count) {
  var day = ymdToDays(ymd);
  return ((1234 * day + 777) % count + count) % count;
}

/** A small seeded random generator so both of you get the same daily puzzle. */
function seededRandom(seed) {
  var x = 0;
  for (var i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

/** Countdown-style numbers puzzle for a date: six numbers and a target. */
function numbersPuzzle(ymd) {
  var r = seededRandom('numbers' + ymd);
  var bigs = [25, 50, 75, 100], smalls = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
  var bigCount = 1 + Math.floor(r() * 2);
  var nums = [];
  for (var i = 0; i < bigCount; i++) nums.push(bigs.splice(Math.floor(r() * bigs.length), 1)[0]);
  while (nums.length < 6) nums.push(smalls.splice(Math.floor(r() * smalls.length), 1)[0]);
  return { numbers: nums, target: 101 + Math.floor(r() * 899) };
}

/**
 * Check a numbers answer like "(75 + 5) * 6 - 3". Only + - × ÷ and brackets,
 * each number used at most once, whole numbers only. Returns {value} or {error}.
 */
function evalNumbers(expr, numbers) {
  var s = String(expr || '').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!/^[0-9+\-*/()]+$/.test(s) || !s) return { error: 'Use only numbers, + − × ÷ and brackets.' };
  var pool = numbers.slice(), pos = 0;
  function num() {
    var m = s.slice(pos).match(/^\d+/);
    if (!m) throw new Error('Something is missing near "' + s.slice(pos, pos + 3) + '".');
    pos += m[0].length;
    var v = Number(m[0]), i = pool.indexOf(v);
    if (i === -1) throw new Error(v + ' isn\'t one of your numbers (or it\'s used twice).');
    pool.splice(i, 1);
    return v;
  }
  function factor() {
    if (s[pos] === '(') { pos++; var v = expr2(); if (s[pos] !== ')') throw new Error('A bracket isn\'t closed.'); pos++; return v; }
    return num();
  }
  function term() {
    var v = factor();
    while (s[pos] === '*' || s[pos] === '/') {
      var op = s[pos++], w = factor();
      if (op === '*') v *= w;
      else { if (w === 0 || v % w !== 0) throw new Error('Division has to come out as a whole number.'); v /= w; }
    }
    return v;
  }
  function expr2() {
    var v = term();
    while (s[pos] === '+' || s[pos] === '-') { var op = s[pos++], w = term(); v = op === '+' ? v + w : v - w; }
    return v;
  }
  try {
    var v = expr2();
    if (pos !== s.length) throw new Error('Check the end of your sum.');
    return { value: v, used: numbers.length - pool.length };
  } catch (e) {
    return { error: e.message };
  }
}

/** Points for a numbers answer: 10 exact, 7 within 5, 5 within 10, else 0. */
function numbersPoints(value, target) {
  var d = Math.abs(value - target);
  return d === 0 ? 10 : d <= 5 ? 7 : d <= 10 ? 5 : 0;
}

// ---- Tempo (the DJ game) ----

var TEMPO_STYLES = [['Hip hop', 86, 98], ['Afrobeats', 100, 112], ['Disco', 110, 120], ['House', 120, 126], ['Tech house', 124, 128],
  ['UK garage', 130, 134], ['Techno', 130, 140], ['Trance', 136, 140], ['Dubstep', 140, 140], ['Drum and bass', 170, 176]];

function tempoPuzzle(ymd) {
  var r = seededRandom('tempo' + ymd);
  var s = TEMPO_STYLES[Math.floor(r() * TEMPO_STYLES.length)];
  return { style: s[0], bpm: s[1] + Math.floor(r() * (s[2] - s[1] + 1)) };
}

/** Points for a tapped tempo (0 if you're more than 7 BPM out). Half time counts for fast tracks (nobody taps 174). */
function tempoPoints(tapped, bpm) {
  var d = Math.abs(tapped - bpm);
  if (bpm > 150) d = Math.min(d, Math.abs(tapped * 2 - bpm));
  return d <= 1 ? 10 : d <= 2 ? 8 : d <= 4 ? 6 : d <= 7 ? 3 : 0;
}

/** DJ Set grade from accuracy (%). */
function setGrade(acc) {
  acc = Number(acc);
  return acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
}

/** Points for a DJ Set (0-10): accuracy, with a little extra for longer sets. */
function setPoints(acc, mixes) {
  acc = Number(acc); mixes = Number(mixes) || 1;
  if (!isFinite(acc) || acc < 50) return 0;   // a train wreck: no points, no XP
  var base = acc >= 95 ? 9 : acc >= 85 ? 7 : acc >= 70 ? 5 : 3;
  return Math.min(10, base + (mixes >= 3 ? 1 : 0));
}

// ---- Gym transport: hourly buses, timetable in the Config tab ----

/** "Mon-Fri", "Sat", "Mon, Wed", "Weekdays", "Daily" -> [1..5] etc. */
function parseDayRange(text) {
  var t = String(text || '').trim().toLowerCase();
  if (!t) return [];
  if (/^(daily|every ?day|all)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^week ?days?$/.test(t)) return [1, 2, 3, 4, 5];
  if (/^week ?ends?$/.test(t)) return [0, 6];
  var m = t.match(/^([a-z]+)\s*[-–to]+\s*([a-z]+)$/);
  if (m) {
    var a = parseDays(m[1])[0], b = parseDays(m[2])[0], out = [];
    if (a === undefined || b === undefined) return [];
    for (var d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
    return out.sort();
  }
  return parseDays(t);
}

/** "15:01, 16:01 18:30" -> [901, 961, 1110] (sorted). */
function parseTimes(text) {
  return String(text || '').split(/[,;\s]+/).map(parseClock).filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
}

/**
 * Plan a gym trip by bus (and the e-bike as a dry-day alternative).
 * o: { dow, free (minutes, when you can leave work or, on a day off, roughly when you want to leave),
 *      dayOff, earlyBy (minutes you can leave work early), tt: [{route, way:'out'|'back', days:[..], times:[..], door}],
 *      walkToStop, gymToStance, buffer, minGym, maxGym, preferred:'3', sessionMins (day off), bikeMins, dry, bikeLeaveAfter }
 * Returns { ok, leaveBy, out, arrive, gymFrom, gymTo, gymMins, back, homeBy, finishBy, missed, bike, notes, problem }.
 */
function planTransport(o) {
  var pref = String(o.preferred || '3');
  var buses = function (way) {
    var list = [];
    (o.tt || []).forEach(function (r) { if (r.way === way && r.days.indexOf(o.dow) !== -1) r.times.forEach(function (t) { list.push({ route: String(r.route), dep: t, door: r.door }); }); });
    return list.sort(function (a, b) { return a.dep - b.dep || (a.route === pref ? -1 : b.route === pref ? 1 : 0); });
  };
  var outs = buses('out'), backs = buses('back');
  var leaveFor = function (b) { return b.dep - o.walkToStop; };
  var pairFor = function (out, want) {
    var arrive = out.dep + out.door;
    var options = backs.map(function (b) { var leaveGym = b.dep - o.gymToStance - o.buffer; return { back: b, leaveGym: leaveGym, gym: leaveGym - arrive, home: b.dep + b.door }; })
      .filter(function (x) { return x.gym >= 30; });
    var ok = function (x) { return x.gym >= o.minGym; };
    var inRange = function (x) { return x.gym >= o.minGym && x.gym <= o.maxGym; };
    var pick = options.filter(function (x) { return x.back.route === pref && inRange(x); })[0] ||
      options.filter(function (x) { return x.back.route === pref && ok(x); })[0] ||
      options.filter(function (x) { return inRange(x); })[0] ||
      options.filter(ok)[0] ||
      options.sort(function (a, b) { return b.gym - a.gym; })[0];
    if (want && pick) {
      // a day off: the pair closest to the session length you want, without going under it
      var fit = options.filter(function (x) { return x.gym >= want; }).sort(function (a, b) { return (a.back.route === pref ? 0 : 1) - (b.back.route === pref ? 0 : 1) || a.gym - b.gym; })[0];
      if (fit) pick = fit;
    }
    if (!pick) return null;
    return { out: out, leaveBy: leaveFor(out), arrive: arrive, gymFrom: arrive, gymTo: pick.leaveGym, gymMins: pick.gym, back: pick.back, homeBy: pick.home };
  };
  var res = { ok: false, notes: [] };
  // which outbound buses can you make?
  var earliest = o.dayOff ? -1 : o.free - (o.earlyBy || 0);
  var candidates = outs.filter(function (b) { return leaveFor(b) >= earliest; });
  var first;
  if (o.dayOff) {
    var target = o.free;
    first = candidates.filter(function (b) { return b.route === pref; }).sort(function (a, b) { return Math.abs(leaveFor(a) - target) - Math.abs(leaveFor(b) - target); })[0] ||
      candidates.sort(function (a, b) { return Math.abs(leaveFor(a) - target) - Math.abs(leaveFor(b) - target); })[0];
  } else {
    first = candidates.filter(function (b) { return b.route === pref; })[0];
  }
  var plan = first ? pairFor(first, o.dayOff ? o.sessionMins : 0) : null;
  // a day off with only after-work buses in the timetable: never quietly plan the after-work bus instead
  if (plan && o.dayOff && Math.abs(plan.leaveBy - o.free) > 90) {
    res.late = plan; plan = null; res.noDaytime = true;
    res.problem = 'Your bus times only cover after work, so there\'s no bus near ' + formatClock(o.free) + ' yet. Add the daytime times for the ' + pref + ' (it runs through the day) under Transport in the Config tab, or pick another time.';
  }
  if (plan) {
    Object.assign(res, plan, { ok: true });
    if (o.dayOff && Math.abs(plan.leaveBy - o.free) > 45) res.notes.push('The nearest bus to ' + formatClock(o.free) + ' in your timetable.');
    if (!o.dayOff && plan.leaveBy < o.free) { res.finishBy = plan.leaveBy; res.notes.push('Wrap up work a few minutes early: you need to be out the door at ' + formatClock(plan.leaveBy) + '.'); }
    if (plan.gymMins < o.minGym) res.notes.push('Short session: only ' + plan.gymMins + ' min in the gym before the last bus back.');
    // missed it? the next bus out
    var next = outs.filter(function (b) { return b.dep > first.dep && (b.route === pref || !outs.some(function (x) { return x.dep > first.dep && x.route === pref; })); })[0];
    var nb = next ? pairFor(next, o.dayOff ? o.sessionMins : 0) : null;
    if (nb) res.missed = nb;
  } else if (!res.noDaytime) {
    // no preferred bus you can make: the fallback bus, if one works
    var fb = candidates.map(function (b) { return pairFor(b, o.dayOff ? o.sessionMins : 0); }).filter(function (p) { return p && p.gymMins >= o.minGym; })[0];
    if (fb && o.dayOff) { Object.assign(res, fb, { ok: true, fallback: true }); res.notes.push('No ' + pref + ' near then, so the ' + fb.out.route + '.'); }
    else {
      if (fb) res.late = fb;   // a work day with no preferred bus: the late fallback is only offered, not planned
      res.problem = outs.length ? 'No bus ' + pref + ' you can make after work today.' : 'No buses in the Transport timetable for this day yet.';
    }
  }
  var nextPref = outs.filter(function (b) { return b.route === pref; }).filter(function (b) { return leaveFor(b) >= o.free; })[0];
  if (!o.dayOff && !res.ok && outs.some(function (b) { return b.route === pref; })) {
    var close = outs.filter(function (b) { return b.route === pref && leaveFor(b) < earliest; }).pop();
    if (close) res.problem = 'The ' + formatClock(close.dep) + ' (' + pref + ') means leaving at ' + formatClock(leaveFor(close)) + ', before you finish at ' + formatClock(o.free) + ', so it isn\'t realistic.';
  }
  // the e-bike: no timetable
  var bLeave = (o.dayOff ? (res.ok ? res.leaveBy : o.free) : o.free + (o.bikeLeaveAfter || 0)), want = o.dayOff ? o.sessionMins : Math.min(o.maxGym, Math.max(o.minGym, res.gymMins || 90));
  res.bike = { leave: bLeave, gymFrom: bLeave + o.bikeMins, gymTo: bLeave + o.bikeMins + want, gymMins: want, home: bLeave + o.bikeMins * 2 + want, dry: !!o.dry };
  return res;
}

/** Lines for the calendar event and the alert. */
function transportLines(t, opts) {
  opts = opts || {};
  var hm = formatClock, lines = [];
  if (t.mode === 'bike') {
    lines.push('E-BIKE today (dry): leave ' + hm(t.bike.leave) + ', ' + opts.bikeMins + ' min each way, no timetable');
    lines.push('Gym ' + hm(t.bike.gymFrom) + '–' + hm(t.bike.gymTo) + ', ' + t.bike.gymMins + ' min');
    lines.push('Home by ' + hm(t.bike.home));
    if (t.problem) lines.push('Why not the bus: ' + t.problem);
    if (t.late) lines.push('Late option: bus ' + t.late.out.route + ' at ' + hm(t.late.out.dep) + ' (leave ' + hm(t.late.leaveBy) + '), gym ' + hm(t.late.gymFrom) + '–' + hm(t.late.gymTo) + ', back on the ' + t.late.back.route + ' at ' + hm(t.late.back.dep) + ', home by ' + hm(t.late.homeBy) + '.');
    return lines;
  }
  if (!t.ok) {
    lines.push('No bus plan: ' + t.problem);
    if (t.bike.dry) lines.push('It\'s dry: take the e-bike. Leave ' + hm(t.bike.leave) + ', ' + opts.bikeMins + ' min each way, gym ' + hm(t.bike.gymFrom) + '–' + hm(t.bike.gymTo) + ' (' + t.bike.gymMins + ' min), home by ' + hm(t.bike.home) + '.');
    else if (opts.moveTo) lines.push('It\'s wet, so move this session to ' + opts.moveTo + ' (tap Change on the gym card).');
    if (t.late) lines.push('Late option: bus ' + t.late.out.route + ' at ' + hm(t.late.out.dep) + ' (leave ' + hm(t.late.leaveBy) + '), gym ' + hm(t.late.gymFrom) + '–' + hm(t.late.gymTo) + ', back on the ' + t.late.back.route + ' at ' + hm(t.late.back.dep) + ', home by ' + hm(t.late.homeBy) + '.');
    return lines;
  }
  lines.push('Leave by ' + hm(t.leaveBy) + ' → bus ' + t.out.route + ' at ' + hm(t.out.dep) + ' from ' + (opts.outStop || 'Whitelaw Avenue'));
  lines.push('Gym ' + hm(t.gymFrom) + '–' + hm(t.gymTo) + ', ' + t.gymMins + ' min (leave the gym at ' + hm(t.gymTo) + ')');
  lines.push('Back: bus ' + t.back.route + ' at ' + hm(t.back.dep) + ' from ' + (opts.backStop || 'Coatbridge Bus Stance (westbound)') + ' → home by ' + hm(t.homeBy));
  t.notes.forEach(function (n) { lines.push(n); });
  if (t.missed) lines.push('Miss the ' + hm(t.out.dep) + '? Next: bus ' + t.missed.out.route + ' at ' + hm(t.missed.out.dep) + ' (leave ' + hm(t.missed.leaveBy) + '), gym ' + hm(t.missed.gymFrom) + '–' + hm(t.missed.gymTo) + ', back on the ' + t.missed.back.route + ' at ' + hm(t.missed.back.dep) + ', home by ' + hm(t.missed.homeBy) + '.');
  if (t.bike.dry) lines.push('It\'s dry, so the e-bike works too: leave ' + hm(t.bike.leave) + ', ' + opts.bikeMins + ' min each way, gym ' + hm(t.bike.gymFrom) + '–' + hm(t.bike.gymTo) + ', home by ' + hm(t.bike.home) + '.');
  return lines;
}


// ---- Work blocks (time blocking) ----

var BLOCK_KINDS = { focus: 'Deep work', admin: 'Admin', meet: 'Meeting', learn: 'Learning', break: 'Break' };

/** Rough minutes per item, to size a block like "Queue 40 emails" when no time is given. */
var UNIT_MINS = { emails: 1.5, email: 1.5, messages: 2, dms: 2, replies: 2, posts: 10, post: 10, videos: 45, video: 45, clips: 10, reels: 20, thumbnails: 15, edits: 20,
  calls: 15, tickets: 8, pages: 20, articles: 45, invoices: 5, leads: 3, tasks: 10, items: 5, orders: 4, reviews: 10, designs: 30, photos: 3, images: 3, slides: 6, words: 0.03 };

/** What kind of block a task sounds like. */
function guessBlockKind(task) {
  var t = ' ' + String(task || '').toLowerCase() + ' ';
  if (/\b(lunch|break|walk|coffee|tea|stretch|nap|rest|gym)\b/.test(t)) return 'break';
  if (/\b(meeting|meet|call|calls|standup|stand-up|sync|1:1|one to one|interview|catch ?up|zoom|teams|huddle)\b/.test(t)) return 'meet';
  if (/\b(queue|schedule)\b/.test(t) && /\b(emails?|posts?|messages?)\b/.test(t)) return 'admin';
  if (/\b(email|emails|inbox|admin|invoice|invoices|expenses|slack|messages|paperwork|timesheet|booking|bills?)\b/.test(t)) return 'admin';
  if (/\b(learn|learning|course|study|read|reading|tutorial|training|practice)\b/.test(t)) return 'learn';
  return 'focus';
}

/**
 * "Write the report 10-11:30", "Emails 30m", "Call Sam at 3pm for 45 min",
 * "Deep work 2h", "Lunch 12:30-13:15 tomorrow" -> { task, start, mins, kind, tomorrow }.
 * start is minutes since midnight, or null when no time was given.
 * Hours without am/pm before 7 are read as afternoon (it's a work day).
 */
function parseBlock(text) {
  var t = ' ' + String(text || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim() + ' ', m, start = null, end = null, mins = null, tomorrow = false;
  if (!t.trim()) return null;
  function toMin(h, mm, ap) {
    h = Number(h); mm = Number(mm || 0);
    if (h > 23 || mm > 59) return null;
    ap = (ap || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; else if (ap === 'am' && h === 12) h = 0; else if (!ap && h >= 1 && h < 7) h += 12;
    return h * 60 + mm;
  }
  if (/\btomorrow\b/i.test(t)) { tomorrow = true; t = t.replace(/\s(for\s+)?tomorrow\b/i, ' '); }
  var CL = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?';
  m = t.match(new RegExp('\\s(?:from\\s+|at\\s+)?' + CL + '\\s*(?:-|to|until|till)\\s*' + CL + '(?=\\s)', 'i'));
  if (m) {
    end = toMin(m[4], m[5], m[6]);
    start = toMin(m[1], m[2], m[3] || m[6]);
    if (!m[3] && m[6] && start !== null && end !== null && start > end) start = toMin(m[1], m[2], '');
    if (start !== null && end !== null) { if (end <= start) end += 12 * 60; if (end - start <= 12 * 60) { mins = end - start; t = t.replace(m[0], ' '); } else { start = null; end = null; } }
    else { start = null; end = null; }
  }
  // a length ("2h", "45 min"): used unless a range already set it, and always taken out of the name
  m = t.match(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes)?)?(?=\s)/i);
  if (m) { if (mins === null) mins = Math.round(Number(m[1]) * 60) + Number(m[2] || 0); t = t.replace(m[0], ' '); }
  else {
    m = t.match(/\s(?:for\s+)?(\d{1,3})\s*(?:m|min|mins|minute|minutes)(?=\s)/i);
    if (m) { if (mins === null) mins = Number(m[1]); t = t.replace(m[0], ' '); }
  }
  if (start === null) {
    m = t.match(new RegExp('\\s(?:at|@|from)\\s+' + CL + '(?=\\s)', 'i')) || t.match(/\s(\d{1,2})[:.](\d{2})\s*(am|pm)?(?=\s)/i) || t.match(/\s(\d{1,2})()\s*(am|pm)(?=\s)/i);
    if (m) { var st = toMin(m[1], m[2], m[3]); if (st !== null) { start = st; t = t.replace(m[0], ' '); } }
  }
  var target = 0, unit = '';
  m = t.match(new RegExp('\\s(\\d{1,4})\\s+(' + Object.keys(UNIT_MINS).join('|') + ')(?=\\s)', 'i'));
  if (m && Number(m[1]) > 0) { target = Number(m[1]); unit = m[2].toLowerCase(); }
  var task = t.replace(/\s(for|at|from|on|@|,|-)\s*$/i, ' ').replace(/^\s*(-|,)\s*/, '').replace(/\s+/g, ' ').trim();
  task = task.replace(/\s(for|at|from)$/i, '').trim();
  if (!task) task = 'Focus block';
  task = task.charAt(0).toUpperCase() + task.slice(1);
  var kind = guessBlockKind(task);
  if (mins === null && target) { var per = UNIT_MINS[unit] || UNIT_MINS[unit.replace(/s$/, '')] || 3; mins = Math.max(15, Math.min(240, Math.round(target * per / 5) * 5)); }
  if (mins === null) mins = kind === 'focus' || kind === 'learn' ? 60 : 30;
  mins = Math.max(5, Math.min(600, mins));
  if (start !== null) start = Math.max(0, Math.min(1435, start));
  return { task: task.slice(0, 100), start: start, mins: mins, kind: kind, tomorrow: tomorrow, target: Math.min(target, 9999), unit: unit };
}

/** First free start (minutes) for a block of `mins`, not before `from`, around the blocks already there. */
function placeBlock(blocks, mins, from) {
  var at = Math.ceil(from / 5) * 5;
  blocks.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (b) {
    if (at + mins <= b.start) return;
    if (b.start + b.mins > at) at = b.start + b.mins;
  });
  return Math.min(at, 1440 - mins);
}

/**
 * XP for finishing a block: by length (about 2 per 10 minutes, 4 to 24), deep
 * work x1.5, meetings half, breaks 2. +3 for starting on time, +1 for each
 * block already done today (up to +5).
 */
function blockXp(kind, mins, onTime, combo) {
  if (kind === 'break') return 2;
  var base = Math.max(4, Math.min(24, Math.round(mins / 10) * 2));
  if (kind === 'focus') base = Math.round(base * 1.5);
  if (kind === 'meet') base = Math.max(2, Math.round(base / 2));
  return base + (onTime ? 3 : 0) + Math.min(5, Math.max(0, combo || 0));
}


// ---- Deadlines ("Send the invoice by 3pm") ----

/**
 * Finds the time in a to-do and splits it off.
 * Understands: by/at/before 3pm, 3:30pm, 15:00, noon, midday, tonight,
 * this afternoon, end of day / eod, in 20 mins, in 2 hours, tomorrow ...
 * nowMin: minutes since midnight now. Returns {task, dayOffset, min} or null.
 * A time that has already gone today means tomorrow.
 */
function parseDeadline(text, nowMin) {
  var s = ' ' + String(text || '').replace(/\s+/g, ' ').trim() + ' ';
  var day = 0, min = null, m;
  function cut(re) { s = s.replace(re, ' '); }
  if (/\btomorrow\b/i.test(s)) { day = 1; cut(/\b(by |for )?tomorrow\b/i); }
  if ((m = s.match(/\bin (\d+(?:\.\d+)?|an?|half an?) ?(mins?|minutes?|hours?|hrs?|h)\b/i))) {
    var n = /half/i.test(m[1]) ? 0.5 : /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
    min = nowMin + Math.round(/^h/i.test(m[2]) ? n * 60 : n);
    cut(m[0]);
  } else if ((m = s.match(/\b(?:by|at|before|for|until|til) (\d{1,2})(?:[:.](\d{2}))? ?(am|pm)?\b/i)) || (m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))? ?(am|pm)\b/i)) || (m = s.match(/\b(\d{1,2})[:.](\d{2})\b/))) {
    var h = Number(m[1]), mm = Number(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (h > 23 || mm > 59) return null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && !m[2] && h >= 1 && h <= 7) h += 12;           // "by 3" means 3pm
    min = h * 60 + mm;
    cut(m[0]);
  } else if ((m = s.match(/\b(?:by |at |before )?(noon|midday|this afternoon|end of (?:the )?(?:work ?)?day|eod|tonight|this evening|bedtime)\b/i)) || (m = s.match(/\b(?:by|at|before) (lunch ?time|lunch)\b/i))) {
    var w = m[1].toLowerCase();
    min = /noon|midday/.test(w) ? 720 : /lunch/.test(w) ? 780 : /afternoon/.test(w) ? 900 : /end|eod/.test(w) ? 1020 : /bed/.test(w) ? 1350 : 1260;
    cut(m[0]);
  }
  if (min === null) return null;
  day += Math.floor(min / 1440);
  min = ((min % 1440) + 1440) % 1440;
  if (day === 0 && min <= nowMin) day = 1;
  var task = s.replace(/\b(by|at|before|until|til)\s*$/i, '').replace(/\s+([,.!])/g, '$1').replace(/\s+/g, ' ').trim().replace(/[,.;:-]+$/, '').trim();
  if (!task) return null;
  return { task: task.charAt(0).toUpperCase() + task.slice(1), dayOffset: day, min: min };
}

var NAG_LEVELS = {
  gentle: { before: [15], soon: 60, later: 120 },
  normal: { before: [30, 10], soon: 15, later: 30 },
  aggressive: { before: [60, 30, 15, 5], soon: 5, later: 15 }
};

/**
 * Should a deadline nag now? All times in ms. Before the deadline: a reminder
 * as each "minutes before" mark passes. At the deadline: one straight away.
 * After it: every `soon` minutes for two hours, then every `later` minutes.
 * Returns '' (no), 'before', 'due' or 'late'.
 */
function nagDue(dueMs, nowMs, lastNagMs, level) {
  var L = NAG_LEVELS[level] || NAG_LEVELS.normal, M = 60000;
  lastNagMs = lastNagMs || 0;
  if (nowMs < dueMs) {
    var marks = L.before.map(function (b) { return dueMs - b * M; });
    return marks.some(function (t) { return lastNagMs < t && t <= nowMs; }) ? 'before' : '';
  }
  if (lastNagMs < dueMs) return 'due';
  var every = (nowMs - dueMs < 120 * M ? L.soon : L.later) * M;
  return nowMs - lastNagMs >= every - 30000 ? 'late' : '';
}

// Node test hook. Apps Script ignores this because `module` doesn't exist there.
if (typeof module !== 'undefined') {
  module.exports = {
    parseClock: parseClock, formatClock: formatClock, parseRestSeconds: parseRestSeconds, parseDays: parseDays,
    estimateSessionMinutes: estimateSessionMinutes, planTrip: planTrip, chooseTravel: chooseTravel,
    parseWeight: parseWeight, buildGymEventText: buildGymEventText, hoursInWindow: hoursInWindow
  };
}
