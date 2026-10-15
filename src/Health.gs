/**
 * Health.gs: sleep, steps, heart and readiness from your phone or watch.
 *
 * The free HC Webhook app (Google Play, or the App Store for iPhone) reads
 * Health Connect / Apple Health and posts it here every 15 minutes or so:
 *
 *   <web app URL>?key=<your key>&source=health
 *
 * Either key works, so you each get your own Health page. Every day is one
 * row of the Health tab per person: headline numbers you can read in the
 * Sheet, plus a Detail column (JSON) with the minute-by-minute data the app
 * draws. Records are keyed by their time, so a resent batch never counts twice.
 *
 * Sleep score and readiness are this app's own estimates (Fitbit's aren't
 * shared with other apps), built from the same ingredients: how long you
 * slept, deep and REM sleep, time awake, and your heart rate and HRV against
 * your own two-week baseline.
 */

var STAGE_CODES = ['awake', 'rem', 'light', 'deep'];  // stored as 0..3

/** Health Connect, Apple Health and numeric stage names → awake / rem / light / deep (null = ignore). */
function stageOf_(s) {
  if (typeof s === 'number' || /^\d+$/.test(String(s))) s = ['unknown', 'awake', 'sleeping', 'out_of_bed', 'light', 'deep', 'rem', 'awake_in_bed'][Number(s)] || 'unknown';
  s = String(s || '').toLowerCase().replace(/^(stage_type_|hkcategoryvaluesleepanalysis)/, '').replace(/[\s-]/g, '_');
  if (s === 'in_bed' || s === 'inbed') return null;          // Apple's "in bed" overlaps the real stages
  if (/awake|out_of_bed/.test(s)) return 'awake';
  if (/deep/.test(s)) return 'deep';
  if (/rem/.test(s)) return 'rem';
  return 'light';                                             // light, core, sleeping, asleep, unknown
}

function emptyHealthDay_() {
  return { st: {}, di: {}, ac: {}, hr: {}, rhr: {}, hrv: {}, o2: {}, rr: {}, sk: {}, ex: {}, sl: {}, w: null, vo2: null };
}

function healthRowIndex_(ymd, who) {
  var v = vals_('health');
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === ymd && String(v[i][1]) === who) return i + 1;
  return 0;
}

function loadHealthDay_(ymd, who) {
  var r = healthRowIndex_(ymd, who);
  if (!r) return emptyHealthDay_();
  try { return Object.assign(emptyHealthDay_(), JSON.parse(String(vals_('health')[r - 1][headerMap_('health')['Detail']] || '{}'))); }
  catch (e) { return emptyHealthDay_(); }
}

function localTime_(iso) {
  var d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  var hm = Utilities.formatDate(d, TZ, 'HH:mm').split(':');
  return { ymd: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), min: Number(hm[0]) * 60 + Number(hm[1]), ms: d.getTime() };
}

/** The webhook: merge a batch into the days it touches, then recompute those days. */
function ingestHealth_(raw, who, opts) {
  var p = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  if (p.test) return { test: true, days: 0 };   // HC Webhook's "Test" button sends made-up data
  var replace = opts && opts.replace;
  var days = {};
  function day(ymd) { return days[ymd] || (days[ymd] = replace ? emptyHealthDay_() : loadHealthDay_(ymd, who)); }
  function each(list, fn) { (Array.isArray(list) ? list : []).forEach(function (r) { try { fn(r); } catch (e) { /* skip a bad record */ } }); }
  function put(field, timeKey, value, list) {
    each(list, function (r) {
      var t = localTime_(r[timeKey]);
      var v = Number(value(r));
      if (t && isFinite(v)) day(t.ymd)[field][t.min] = Math.round(v * 100) / 100;
    });
  }
  put('st', 'start_time', function (r) { return r.count; }, p.steps);
  put('di', 'start_time', function (r) { return r.meters; }, p.distance);
  put('ac', 'start_time', function (r) { return r.calories; }, p.active_calories);
  put('hr', 'time', function (r) { return r.avg !== undefined ? r.avg : r.bpm; }, p.heart_rate);
  put('rhr', 'time', function (r) { return r.bpm; }, p.resting_heart_rate);
  put('hrv', 'time', function (r) { return r.avg !== undefined ? r.avg : r.rmssd_millis; }, p.heart_rate_variability);
  put('o2', 'time', function (r) { return r.avg !== undefined ? r.avg : r.percentage; }, p.oxygen_saturation);
  put('rr', 'time', function (r) { return r.avg !== undefined ? r.avg : r.rate; }, p.respiratory_rate);
  put('sk', 'time', function (r) { return r.avg_delta_celsius !== undefined ? r.avg_delta_celsius : r.delta_celsius; }, p.skin_temperature);
  each(p.weight, function (r) { var t = localTime_(r.time); if (t) day(t.ymd).w = Math.round(Number(r.kilograms) * 10) / 10; });
  each(p.vo2_max, function (r) { var t = localTime_(r.time); if (t) day(t.ymd).vo2 = Math.round(Number(r.ml_per_kg_per_min) * 10) / 10; });
  each(p.exercise, function (r) {
    var t = localTime_(r.start_time);
    if (!t) return;
    day(t.ymd).ex[t.min] = { type: String(r.type || 'Workout'), min: Math.round(Number(r.duration_seconds || 0) / 60),
      km: r.distance_meters ? Math.round(r.distance_meters / 10) / 100 : null, steps: r.steps || null };
  });
  // Sleep belongs to the morning you wake up.
  each(p.sleep, function (r) {
    var end = localTime_(r.session_end_time || r.end_time);
    if (!end) return;
    var start = r.start_time ? new Date(r.start_time).getTime() : end.ms - Number(r.duration_seconds || 0) * 1000;
    var stages = [];
    (r.stages || []).forEach(function (s) {
      var code = stageOf_(s.stage);
      if (!code) return;
      var a = new Date(s.start_time).getTime(), b = s.end_time ? new Date(s.end_time).getTime() : a + Number(s.duration_seconds || 0) * 1000;
      if (!(b > a)) return;
      stages.push([STAGE_CODES.indexOf(code), Math.round((a - start) / 6000) / 10, Math.round((b - a) / 6000) / 10]);
    });
    stages.sort(function (x, y) { return x[1] - y[1]; });
    day(end.ymd).sl[String(end.ms)] = { s: start, e: end.ms, g: stages };
  });

  var touched = Object.keys(days).sort();
  touched.forEach(function (ymd) { saveHealthDay_(ymd, who, days[ymd]); });
  if (touched.length) {
    setProp_('HEALTH_SYNC_' + who, String(new Date().getTime()));
    healthXp_(who);
  }
  return { days: touched.length };
}

/** The numbers for one day, from its detail. */
function healthSummary_(d) {
  var sum = function (m) { return Object.keys(m).reduce(function (s, k) { return s + Number(m[k]); }, 0); };
  var vals = function (m) { return Object.keys(m).map(function (k) { return Number(m[k]); }); };
  var avg = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; };
  var r1 = function (x) { return x === null || x === undefined ? null : Math.round(x * 10) / 10; };
  var rhrKeys = Object.keys(d.rhr).sort(function (a, b) { return a - b; });
  var hrVals = vals(d.hr);
  var night = mainSleep_(d);
  return {
    steps: Math.round(sum(d.st)), km: r1(sum(d.di) / 1000), active: Math.round(sum(d.ac)),
    rhr: rhrKeys.length ? Math.round(Number(d.rhr[rhrKeys[rhrKeys.length - 1]])) : hrVals.length ? Math.round(Math.min.apply(null, hrVals)) : null,
    hrv: r1(avg(vals(d.hrv))), o2: r1(avg(vals(d.o2))), rr: r1(avg(vals(d.rr))), skin: d.sk && Object.keys(d.sk).length ? r1(avg(vals(d.sk))) : null,
    sleep: night
  };
}

/** The longest sleep ending on this day, with stage totals and a score. */
function mainSleep_(d) {
  var best = null;
  Object.keys(d.sl).forEach(function (k) { var s = d.sl[k]; if (!best || s.e - s.s > best.e - best.s) best = s; });
  if (!best) return null;
  var tot = [0, 0, 0, 0], wakeups = 0;
  best.g.forEach(function (g, i) { tot[g[0]] += g[2]; if (g[0] === 0 && i > 0 && i < best.g.length - 1 && g[2] >= 2) wakeups++; });
  var inBed = Math.round((best.e - best.s) / 60000);
  if (!best.g.length) tot[2] = inBed;                         // no stages: count it all as sleep
  var asleep = Math.round(tot[1] + tot[2] + tot[3]);
  return {
    start: best.s, end: best.e, inBed: inBed, asleep: asleep,
    awake: Math.round(tot[0]), rem: Math.round(tot[1]), light: Math.round(tot[2]), deep: Math.round(tot[3]),
    wakeups: wakeups, stages: best.g,
    bedtime: Utilities.formatDate(new Date(best.s), TZ, 'HH:mm'), wake: Utilities.formatDate(new Date(best.e), TZ, 'HH:mm')
  };
}

/**
 * Sleep score out of 100, like Fitbit's three parts:
 * duration (50) against your goal, quality (25) from deep + REM share, restoration (25) from time
 * awake and wake-ups. Tuned so a night Fitbit scores 86 lands within a few points.
 */
function sleepScore(night, goalMin) {
  if (!night || !night.asleep) return null;
  var dur = Math.min(1, night.asleep / (goalMin || 480)) * 50;
  var hasStages = night.deep + night.rem > 0;
  var quality = hasStages ? Math.min(1, (night.deep + night.rem) / night.asleep / 0.45) * 25 : 18;
  var restore = Math.max(0, 25 * Math.max(0, 1 - night.awake / Math.max(1, night.inBed) * 5) - Math.min(5, night.wakeups));
  return Math.max(0, Math.min(100, Math.round(dur + quality + restore)));
}

function sleepLabel(score) {
  return score === null ? '' : score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';
}

/** Readiness out of 100: last night's sleep, plus HRV and resting heart rate against your baseline. */
function readinessScore(sleep, hrv, hrvBase, rhr, rhrBase) {
  var parts = [], weights = [];
  if (sleep !== null && sleep !== undefined) { parts.push(sleep); weights.push(0.4); }
  if (hrv && hrvBase) { parts.push(Math.max(0, Math.min(100, 65 + (hrv / hrvBase - 1) * 200))); weights.push(0.3); }
  if (rhr && rhrBase) { parts.push(Math.max(0, Math.min(100, 70 - (rhr - rhrBase) * 7))); weights.push(0.3); }
  if (!parts.length) return null;
  var w = weights.reduce(function (s, x) { return s + x; }, 0);
  return Math.round(parts.reduce(function (s, x, i) { return s + x * weights[i]; }, 0) / w);
}

function readinessLabel(r) {
  return r === null ? '' : r >= 80 ? 'Ready to go' : r >= 60 ? 'Steady' : 'Take it easy';
}

function healthGoals_() {
  var s = readConfig_().settings;
  return { steps: num_(s, 'Step goal', 7000), sleepMin: Math.round(num_(s, 'Sleep goal (hours)', 8) * 60) };
}

function healthRows_(who, from, to) {
  return rowsBetween_('health', from, to).filter(function (r) { return r['Who'] === who; });
}

function baseline_(who, ymd, col) {
  var v = healthRows_(who, addDays_(ymd, -14), addDays_(ymd, -1)).map(function (r) { return Number(r[col]); }).filter(function (x) { return x > 0; });
  return v.length >= 3 ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null;
}

function saveHealthDay_(ymd, who, d) {
  var sm = healthSummary_(d), goals = healthGoals_();
  var score = sleepScore(sm.sleep, goals.sleepMin);
  var ready = readinessScore(score, sm.hrv, baseline_(who, ymd, 'HRV (ms)'), sm.rhr, baseline_(who, ymd, 'Resting HR'));
  var detail = JSON.stringify(d);
  if (detail.length > 48000) { d.hr = thin_(d.hr); detail = JSON.stringify(d); }
  var row = {
    'Date': ymd, 'Who': who, 'Steps': sm.steps, 'Distance (km)': sm.km, 'Active kcal': sm.active, 'Resting HR': sm.rhr || '', 'HRV (ms)': sm.hrv || '',
    'SpO2 (%)': sm.o2 || '', 'Breathing (rpm)': sm.rr || '', 'Sleep (min)': sm.sleep ? sm.sleep.asleep : '', 'Deep (min)': sm.sleep ? sm.sleep.deep : '',
    'Light (min)': sm.sleep ? sm.sleep.light : '', 'REM (min)': sm.sleep ? sm.sleep.rem : '', 'Awake (min)': sm.sleep ? sm.sleep.awake : '',
    'Sleep score': score === null ? '' : score, 'Readiness': ready === null ? '' : ready, 'Bedtime': sm.sleep ? sm.sleep.bedtime : '', 'Wake': sm.sleep ? sm.sleep.wake : '',
    'Updated': now_('yyyy-MM-dd HH:mm'), 'Detail': detail
  };
  var r = healthRowIndex_(ymd, who);
  if (r) updateRow_('health', r, row); else appendRow_('health', row);
}

function thin_(m) {
  var out = {};
  Object.keys(m).forEach(function (k) { var b = Math.floor(Number(k) / 5) * 5; if (out[b] === undefined) out[b] = m[k]; });
  return out;
}

/** XP for today's step goal and last night's sleep, once each. */
function healthXp_(who) {
  var today = todayYmd_(), r = healthRowIndex_(today, who);
  if (!r) return;
  var row = readRow_('health', r), goals = healthGoals_();
  var got = function (kind) { return xpRows_().some(function (x) { return x.who === who && x.date === today && x.kind === kind; }); };
  if (Number(row['Steps']) >= goals.steps && !got('steps')) addXp_(who, 'Step goal: ' + Number(row['Steps']).toLocaleString('en-GB') + ' steps', 10, 'steps');
  if (Number(row['Sleep (min)']) >= goals.sleepMin - 30 && !got('sleep')) addXp_(who, 'Slept ' + hm_(Number(row['Sleep (min)'])), 10, 'sleep');
}

function hm_(min) {
  return Math.floor(min / 60) + 'h ' + (min % 60 < 10 ? '0' : '') + Math.round(min % 60) + 'm';
}

// ---------- for the app ----------

/** One day in full detail, plus two weeks of trends. */
/** Every time HC Webhook gets in touch, even with nothing: so the app can say what's actually happening. */
function healthContact_(who, kind, days, error) {
  setProp_('HEALTH_CONTACT_' + who, JSON.stringify({ t: new Date().getTime(), kind: kind, days: days || 0, error: error ? String(error).slice(0, 200) : '' }));
}

/** Plain-English status for the Health screen: has data arrived for this day, and if not, why not and what to do. */
function healthStatus(day, hasData, sync, contact, nowMs) {
  if (hasData) return { ok: true, text: '', fix: '' };
  var ago = function (t) { return Math.round((nowMs - t) / 60000); };
  if (!contact && !sync) return { ok: false, text: 'No data from your watch yet.', fix: 'HC Webhook hasn\'t reached the app. In HC Webhook, add the webhook address below (JSON format) and tap Sync now.' };
  if (contact && contact.kind === 'error') return { ok: false, text: 'HC Webhook reached the app but the data couldn\'t be read.', fix: 'In HC Webhook, set the format to JSON (not gRPC) and tap Sync now.' };
  if (contact && contact.kind === 'test' && (!sync || contact.t > sync)) return { ok: false, text: 'Only HC Webhook\'s test message has arrived so far.', fix: 'Tap Sync now in HC Webhook (the Test button sends made-up data, which is ignored).' };
  if (contact && contact.kind === 'empty' && ago(contact.t) < 180) return { ok: false, text: 'HC Webhook got in touch ' + (ago(contact.t) < 2 ? 'just now' : ago(contact.t) + ' min ago') + ' but sent nothing for today.', fix: 'Open HC Webhook and check Health Connect permissions (Steps, Sleep, Heart rate…), and that your watch has synced to Health Connect (open the Fitbit or Pixel Watch app).' };
  return { ok: false, text: 'No data from your watch for ' + (day ? 'this day' : 'today') + ' yet.', fix: 'Open HC Webhook and tap Sync now. If it keeps happening, check it\'s set to sync every 15 minutes and has Health Connect permissions.' };
}

function healthState_(who, ymd) {
  ymd = ymd || todayYmd_();
  var goals = healthGoals_(), d = loadHealthDay_(ymd, who), sm = healthSummary_(d);
  var hours = [];
  for (var h = 0; h < 24; h++) hours.push({ steps: 0, hr: [] });
  Object.keys(d.st).forEach(function (k) { hours[Math.floor(k / 60)].steps += Number(d.st[k]); });
  Object.keys(d.hr).forEach(function (k) { hours[Math.floor(k / 60)].hr.push(Number(d.hr[k])); });
  var hrHours = hours.map(function (x) {
    if (!x.hr.length) return null;
    return [Math.round(x.hr.reduce(function (s, v) { return s + v; }, 0) / x.hr.length), Math.round(Math.min.apply(null, x.hr)), Math.round(Math.max.apply(null, x.hr))];
  });
  var trend = [];
  var rows = healthRows_(who, addDays_(ymd, -13), ymd), byDate = {};
  rows.forEach(function (r) { byDate[r['Date']] = r; });
  for (var i = 13; i >= 0; i--) {
    var dt = addDays_(ymd, -i), r = byDate[dt] || {};
    trend.push({ date: dt, steps: Number(r['Steps']) || 0, sleep: Number(r['Sleep (min)']) || 0, score: Number(r['Sleep score']) || null,
      ready: Number(r['Readiness']) || null, rhr: Number(r['Resting HR']) || null, hrv: Number(r['HRV (ms)']) || null, bed: hhmm_(r['Bedtime']), wake: hhmm_(r['Wake']) });
  }
  var hrvBase = baseline_(who, ymd, 'HRV (ms)'), rhrBase = baseline_(who, ymd, 'Resting HR');
  var score = sleepScore(sm.sleep, goals.sleepMin);
  var ready = readinessScore(score, sm.hrv, hrvBase, sm.rhr, rhrBase);
  var week = trend.slice(-7), slept = week.filter(function (t) { return t.sleep; });
  var debt = slept.reduce(function (s, t) { return s + Math.max(0, goals.sleepMin - t.sleep); }, 0);
  var beds = week.map(function (t) { return t.bed; }).filter(Boolean).map(function (b) { var m = parseClock(b); return m < 12 * 60 ? m + 1440 : m; });
  var spread = beds.length >= 3 ? Math.round(Math.sqrt(beds.reduce(function (s, x) { var mu = beds.reduce(function (a, y) { return a + y; }, 0) / beds.length; return s + (x - mu) * (x - mu); }, 0) / beds.length)) : null;
  var sync = Number(prop_('HEALTH_SYNC_' + who) || 0);
  var ex = Object.keys(d.ex).sort(function (a, b) { return a - b; }).map(function (k) { return Object.assign({ at: formatClock(Number(k)) }, d.ex[k]); });
  var lastW = null, lastVo2 = null;
  healthRows_(who, addDays_(ymd, -60), ymd).forEach(function (r) {
    try { var dd = JSON.parse(String(r['Detail'] || '{}')); if (dd.w) lastW = { kg: dd.w, date: r['Date'] }; if (dd.vo2) lastVo2 = dd.vo2; } catch (e) { /* ignore */ }
  });
  var hasData = !!(sm.steps || sm.sleep || Object.keys(d.hr).length || Object.keys(d.ex).length || sm.km);
  var contact = JSON.parse(prop_('HEALTH_CONTACT_' + who) || 'null');
  return {
    date: ymd, today: todayYmd_(), connected: !!sync || rows.length > 0 || !!contact, synced: sync, hasData: hasData, contact: contact,
    status: healthStatus(ymd === todayYmd_() ? '' : ymd, hasData, sync, contact, new Date().getTime()),
    webhook: webappUrl_() + '?key=' + PROPS.getProperty(who === 'me' ? 'WEBAPP_KEY' : 'PARTNER_KEY') + '&source=health',
    goals: goals,
    steps: sm.steps, km: sm.km, active: sm.active, stepsByHour: hours.map(function (x) { return Math.round(x.steps); }), exercise: ex,
    heart: { rhr: sm.rhr, rhrBase: rhrBase ? Math.round(rhrBase) : null, hrv: sm.hrv, hrvBase: hrvBase ? Math.round(hrvBase) : null, o2: sm.o2, rr: sm.rr, skin: sm.skin, byHour: hrHours },
    sleep: sm.sleep ? Object.assign({}, sm.sleep, { score: score, label: sleepLabel(score) }) : null,
    readiness: ready === null ? null : { score: ready, label: readinessLabel(ready), sleep: score,
      hrv: sm.hrv && hrvBase ? Math.round((sm.hrv / hrvBase - 1) * 100) : null, rhr: sm.rhr && rhrBase ? Math.round(sm.rhr - rhrBase) : null },
    week: { debt: debt, spread: spread, avgSleep: slept.length ? Math.round(slept.reduce(function (s, t) { return s + t.sleep; }, 0) / slept.length) : null,
      avgSteps: Math.round(week.reduce(function (s, t) { return s + t.steps; }, 0) / 7) },
    trend: trend, weight: lastW, vo2: lastVo2,
    insight: (function () { var x = JSON.parse(prop_('HEALTH_AI_' + who) || 'null'); return x && x.date === ymd ? x : null; })()
  };
}

/** The Health page for another day (browsing back). */
function healthDay(key, ymd) {
  var who = who_(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) throw new Error('Bad date.');
  return healthState_(who, ymd);
}

var HEALTH_AI_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Under 8 words, like "A strong night\'s sleep"' },
    insight: { type: 'string', description: '2 or 3 short sentences explaining what the numbers mean today, against their own baseline. No emojis.' },
    tip: { type: 'string', description: 'One practical suggestion for today, under 20 words' }
  },
  required: ['headline', 'insight', 'tip'],
  additionalProperties: false
};

/** Claude reads the day's numbers and explains them in plain words. */
function healthInsight(key, ymd) {
  var who = who_(key);
  if (!claudeKey_()) throw new Error('This needs the Claude API key. Add it in Settings.');
  var h = healthState_(who, ymd || todayYmd_());
  var s = h.sleep, hr = h.heart;
  var text = [
    'Date: ' + h.date + (who === 'me' ? '. Training today: ' + (todaySession_(h.date) || 'rest day') : ''),
    s ? 'Sleep: ' + hm_(s.asleep) + ' asleep (goal ' + hm_(h.goals.sleepMin) + '), ' + s.bedtime + ' to ' + s.wake + '. Deep ' + s.deep + ' min, REM ' + s.rem + ' min, light ' + s.light + ' min, awake ' + s.awake + ' min, ' + s.wakeups + ' wake-ups. Score ' + s.score + '.' : 'No sleep recorded.',
    h.readiness ? 'Readiness ' + h.readiness.score + '.' : '',
    'Resting HR ' + (hr.rhr || '?') + ' (baseline ' + (hr.rhrBase || '?') + '), HRV ' + (hr.hrv || '?') + ' ms (baseline ' + (hr.hrvBase || '?') + '), SpO2 ' + (hr.o2 || '?') + '%, breathing ' + (hr.rr || '?') + '.',
    'Steps ' + h.steps + ' of ' + h.goals.steps + '. 7-day sleep debt ' + h.week.debt + ' min, bedtime spread ' + (h.week.spread === null ? '?' : h.week.spread + ' min') + '.',
    'Last 14 days (date, sleep min, score, steps, resting HR, HRV): ' + h.trend.filter(function (t) { return t.sleep || t.steps; }).map(function (t) { return [t.date.slice(5), t.sleep, t.score, t.steps, t.rhr, t.hrv].join(' '); }).join('; ')
  ].join('\n');
  var res = callClaudeJson_(AI_VOICE + 'You read sleep and fitness data like a friendly coach. Compare with their own baseline, never diagnose, and keep it encouraging. If something looks off for days, suggest seeing a GP gently.',
    text, HEALTH_AI_SCHEMA, claudeModel_(), 6000);
  var out = { date: h.date, headline: String(res.headline || ''), insight: String(res.insight || ''), tip: String(res.tip || '') };
  setProp_('HEALTH_AI_' + who, JSON.stringify(out));
  return out;
}

/**
 * History import from the app: a few whole days at a time, read from HC
 * Webhook's local server on the phone. Each day in the batch is rebuilt from
 * scratch, so it also clears out anything wrong that was there.
 */
function importHealth(key, json) {
  var who = who_(key);
  return withLock_(function () { return ingestHealth_(json, who, { replace: true }); });
}
