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
  var title = (t.tight ? '⚠️ ' : '') + '🏋️ ' + plan.sessionName + ' · ' + (bike ? '🚲 Bike' : '🚌 Bus') + ' · leave ' + formatClock(t.leaveAt);

  var lines = [];
  lines.push((bike ? '🚲 BIKE today: ' : '🚌 BUS today: ') + plan.travel.reasons.join(', ') + '.');
  lines.push('Leave home: ' + formatClock(t.leaveAt));
  if (!bike) {
    if (t.tight) {
      lines.push('⚠️ Tight today: you need to leave by ' + formatClock(t.latestLeave) + ' to finish in time for the last bus (' +
        formatClock(plan.lastBus) + '). That is ' + t.shortBy + ' min earlier than planned, so cut the last exercise or two.');
    } else {
      lines.push('Latest you can leave: ' + formatClock(t.latestLeave) + ' (and still make the last bus at ' + formatClock(plan.lastBus) + ')');
    }
  }
  lines.push('Training: ' + formatClock(t.arriveAt) + '–' + formatClock(t.finishAt) + ' (about ' + plan.sessionMinutes + ' min)');
  lines.push('Home about: ' + formatClock(t.homeAt));
  if (bike && plan.sunset !== null && plan.sunset !== undefined && t.homeAt > plan.sunset) {
    lines.push('💡 Sunset is ' + formatClock(plan.sunset) + ', so lights on for the ride home.');
  }
  if (plan.travel.summary) lines.push('Weather: ' + plan.travel.summary);
  (plan.warnings || []).forEach(function (w) { lines.push('⚠️ ' + w); });
  lines.push('');
  lines.push(plan.sessionName.toUpperCase());
  plan.exercises.forEach(function (ex, i) { lines.push(formatExercise(ex, i)); });
  lines.push('');
  lines.push('✅ Tick "Gym done" in Google Tasks when you finish. That is your whole log.');
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
  var proteinPart = proteinShort ? proteinShort + 'g protein to go' : 'protein ✅';
  var title;
  var advice;
  if (!entryCount) {
    title = '🍽️ No food logged today';
    advice = 'If you ate, add it now. A rough guess beats a blank day.';
  } else if (kcal > targets.kcal) {
    var over = kcal - targets.kcal;
    if (proteinShort) {
      title = '🍽️ Over by ' + over + ' kcal · ' + proteinShort + 'g protein short → shake or yogurt';
      advice = FOOD_SNACKS + ' closes most of the protein gap for very few calories.';
    } else {
      title = '🍽️ Over by ' + over + ' kcal · protein ✅ · kitchen closed';
      advice = "Protein's done, so nothing else needed today.";
    }
  } else {
    title = '🍽️ ' + (targets.kcal - kcal) + ' kcal left · ' + proteinPart;
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

// Node test hook. Apps Script ignores this because `module` doesn't exist there.
if (typeof module !== 'undefined') {
  module.exports = {
    parseClock: parseClock, formatClock: formatClock, parseRestSeconds: parseRestSeconds, parseDays: parseDays,
    estimateSessionMinutes: estimateSessionMinutes, planTrip: planTrip, chooseTravel: chooseTravel,
    parseWeight: parseWeight, buildGymEventText: buildGymEventText, hoursInWindow: hoursInWindow
  };
}
