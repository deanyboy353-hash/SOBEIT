/**
 * Setup.gs: the setup wizard's answers, and the personalised chore schedule built from them.
 *
 * Stored in Script Properties (small JSON):
 *   SETUP_me / SETUP_partner  each person's profile (only they can change it)
 *   HEALTH_me / HEALTH_partner  the health & fitness module: OFF unless that person turns it on; private unless they share
 *   HOUSE  the shared household answers (either of you can fill it in or edit it) and `built` once the chore list is made
 *   CPDAY  today's plan for both of you (kept for the day so ticked jobs stay put)
 *   CPMIN  each day's minimum per person (streaks count days you hit it)
 * Chores live in the Chores tab as before, with extra columns (Area, Time of day, Notes, Archived, Order, Now/Goal (days), Ramp from, Key, After).
 */

var DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- profile ----------
function profileDefaults_(who) {
  var n = names_();
  var p = { done: false, name: who === 'me' ? n.me : n.partner, avatar: '', work: {}, wake: 450, bed: 1380, energy: 'morning', manageable: '3-4', minimum: 2,
    likes: [], hates: [], motivation: 'streaks', reminder: 'gentle', quiet: [1350, 450] };
  if (who === 'me') {
    var h = workHours_('me');
    p.work = { 1: [540, 900], 2: [540, 900], 3: [540, 900], 4: [540, 960] };     // Mon-Wed 9-3, Thu 9-4, Fri-Sun off
    if (h.start !== 540 || h.end !== 1050) [1, 2, 3, 4].forEach(function (d) { p.work[d] = [h.start, p.work[d][1]]; });
  }
  return p;
}
function profile_(who) {
  var saved = JSON.parse(prop_('SETUP_' + who) || 'null');
  return Object.assign(profileDefaults_(who), saved || {});
}

// ---------- health (opt-in, private) ----------
function healthDefaults_(who) {
  if (who !== 'me') return { on: false, share: false };   // never pre-filled or asked for Yaz
  var s = readConfig_().settings, last = null;
  try { var w = rowsBetween_('weight', addDays_(todayYmd_(), -60), todayYmd_()); if (w.length) last = Number(w[w.length - 1]['Weight (kg)']) || null; } catch (e) { /* no weights yet */ }
  var weigh = String(s['Weigh-in days'] || 'Mon, Wed').split(/[,\s]+/).map(function (x) { return DAYS3.indexOf(x.slice(0, 3)); }).filter(function (d) { return d >= 0; });
  return { on: true, share: false, height: null, weight: last, goal: null, goalDate: '', pace: '0.5', trainDays: 4, stretchDays: 5,
    split: 'Push / Pull / Shoulders-Arms', noHinge: true, kcal: Number(s['Daily kcal target']) || 1800,
    protein: [Number(s['Protein min (g)']) || 130, Number(s['Protein max (g)']) || 160], weighDays: weigh.length ? weigh : [1, 3], fasted: true };
}
function health_(who) {
  var saved = JSON.parse(prop_('HEALTH_' + who) || 'null');
  return Object.assign(healthDefaults_(who), saved || {});
}
/** What the other person may see of someone's health: nothing, unless they switched sharing on. */
function sharedHealth_(who) {
  var h = health_(who);
  if (!h.on || !h.share) return null;
  return { weight: h.weight, goal: h.goal, trainDays: h.trainDays };
}

// ---------- household ----------
function house_() {
  return Object.assign({ floors: ['downstairs', 'upstairs'], rooms: [], others: 0, bins: [], laundryDay: '', pets: false, chores: {}, extras: [], built: '', by: '' },
    JSON.parse(prop_('HOUSE') || 'null') || {});
}
function setupOn_() { return !!house_().built; }

/** Everything the wizard needs: your answers, the shared household, and whether your partner has done theirs. */
function setupState_(who) {
  var other = who === 'me' ? 'partner' : 'me', op = profile_(other), house = house_();
  return {
    profile: profile_(who), health: health_(who), house: house,
    partner: { name: op.name, done: !!op.done, health: sharedHealth_(other) },
    presets: CP_PRESETS.map(function (p) { return { key: p.key, ask: house.floors.length > 1 || !p.single ? p.ask : p.single, needs: p.needs || '' }; }),
    built: house.built
  };
}
function setupState(key) { return setupState_(who_(key)); }

/** Save one part of setup. section: 'profile' | 'health' | 'house'. Only the fields given change. */
function saveSetup(key, section, data) {
  var who = who_(key);
  data = data || {};
  return withLock_(function () {
    if (section === 'profile') {
      var p = Object.assign(profile_(who), pick_(data, ['done', 'name', 'avatar', 'work', 'wake', 'bed', 'energy', 'manageable', 'minimum', 'likes', 'hates', 'motivation', 'reminder', 'quiet']));
      p.minimum = Math.max(0, Math.min(6, Math.round(Number(p.minimum)))); if (!isFinite(p.minimum)) p.minimum = 2;
      if (data.name && String(data.name).trim()) setSetting_(who === 'me' ? 'Your name' : 'Partner name', String(data.name).trim().slice(0, 30));
      if (data.work) {   // keep the Work tab's hours in step (the earliest start, the latest finish)
        var days = Object.keys(p.work).filter(function (d) { return p.work[d]; });
        if (days.length) savePrefsRaw_(who, { workStart: Math.min.apply(null, days.map(function (d) { return p.work[d][0]; })), workEnd: Math.max.apply(null, days.map(function (d) { return p.work[d][1]; })) });
      }
      setProp_('SETUP_' + who, JSON.stringify(p));
    } else if (section === 'health') {
      var h = Object.assign(health_(who), pick_(data, ['on', 'share', 'height', 'weight', 'goal', 'goalDate', 'pace', 'trainDays', 'stretchDays', 'split', 'noHinge', 'kcal', 'protein', 'weighDays', 'fasted']));
      setProp_('HEALTH_' + who, JSON.stringify(h));
      if (who === 'me' && h.on) {   // the food page and weigh-in alerts read these
        if (h.kcal) setSetting_('Daily kcal target', String(h.kcal));
        if (h.protein && h.protein.length === 2) { setSetting_('Protein min (g)', String(h.protein[0])); setSetting_('Protein max (g)', String(h.protein[1])); }
        if (h.weighDays && h.weighDays.length) setSetting_('Weigh-in days', h.weighDays.map(function (d) { return DAYS3[d]; }).join(', '));
      }
    } else if (section === 'house') {
      var hs = Object.assign(house_(), pick_(data, ['floors', 'rooms', 'others', 'bins', 'laundryDay', 'pets', 'chores', 'extras']));
      hs.by = hs.by || who;
      setProp_('HOUSE', JSON.stringify(hs));
    } else throw new Error('Unknown part of setup.');
    delProp_('CPDAY');
    return { setup: setupState_(who), state: appState_(who) };
  });
}
function pick_(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
function savePrefsRaw_(who, ch) { var p = JSON.parse(prop_('PREFS_' + who) || '{}'); Object.keys(ch).forEach(function (k) { p[k] = ch[k]; }); setProp_('PREFS_' + who, JSON.stringify(p)); }

// ---------- people for the planner ----------
function cpPeople_() {
  var out = {}, gym = gymDays_();
  PEOPLE.forEach(function (w) {
    var p = profile_(w);
    out[w] = { work: p.work || {}, gym: w === 'me' ? gym : [], manageable: p.manageable, minimum: p.minimum, hates: p.hates || [], likes: p.likes || [], energy: p.energy };
  });
  return out;
}

// ---------- chore rows <-> planner chores ----------
var CP_WHO_COL = { me: 'Me', partner: 'Partner', together: 'Together', anyone: 'Anyone', rotate: 'Rotate' };
function cpChoreOf_(q, today) {
  var rule = parseEvery(q.every), c = { id: q.name, key: q.key, name: q.name, minutes: q.minutes, assign: solo_() ? 'me' : CP_WHO_COL[q.who] ? q.who : 'anyone', tod: q.tod || 'any', xp: q.xp,
    archived: q.archived || rule.kind === 'none', order: q.order, last: q.lastDone, lastBy: q.lastBy, after: q.after || '', area: q.area, notes: q.notes };
  if (rule.kind === 'weekdays') c.days = rule.days.slice();
  else if (rule.kind === 'biweekly') { c.days = [rule.day]; c.weeks = 2; c.anchor = q.nextDue || today; }
  else {
    var every = rule.kind === 'monthly' ? 30 : rule.days || 7;
    c.now = q.nowDays || every; c.goal = q.goalDays || every; c.rampFrom = q.rampFrom || '';
    c.due = q.nextDue || (q.lastDone ? addDays_(q.lastDone, Math.round(cpEvery(c, today))) : today);
  }
  if (c.after) { c.days = null; delete c.due; }
  return c;
}
/** "Every" text for a planner chore, in the Chores tab's own words. */
function everyText_(c, ymd) {
  if (c.days) return c.weeks === 2 ? '2 weeks ' + DAYS3[c.days[0]] : 'weekly ' + c.days.map(function (d) { return DAYS3[d]; }).join(', ');
  var e = cpEvery(c, ymd);
  return e <= 1 ? 'daily' : e === 2.5 ? '2.5 days' : e % 7 === 0 ? (e === 7 ? 'weekly' : e / 7 + ' weeks') : e >= 28 && e <= 31 ? 'monthly' : e + ' days';
}
function cpState_(today) {
  var chores = readChores_().map(function (q) { return cpChoreOf_(q, today); });
  var done = {};
  xpRows_().forEach(function (r) { if (r.date === today && r.kind === 'quest' && r.xp > 0) chores.forEach(function (c) { if (r.what === c.name || r.what.indexOf(c.name + ' (together)') === 0) done[today + '|' + c.id] = r.who; }); });
  chores.forEach(function (c) { if (c.last === today) done[today + '|' + c.id] = c.lastBy || 'me'; });
  return { chores: chores, people: cpPeople_(), done: done };
}

// ---------- today's plan (kept for the day) ----------
/** { date, me: { must: [names], bonus: [names], minimum }, partner: {...} } */
function cpToday_() {
  var today = todayYmd_(), saved = JSON.parse(prop_('CPDAY') || 'null');
  if (saved && saved.date === today) return saved;
  var st = cpState_(today);
  st.done = {};                     // plan the whole day, including anything already ticked
  cpAssignWeek(st, today);
  var plan = cpPlanDay(st, today), out = { date: today };
  PEOPLE.forEach(function (w) { out[w] = { must: plan[w].must.map(function (j) { return j.id; }), bonus: plan[w].bonus.map(function (j) { return j.id; }), early: plan[w].must.filter(function (j) { return j.early; }).map(function (j) { return j.id; }), minimum: plan[w].minimum, later: plan[w].later.map(function (j) { return j.id; }) }; });
  setProp_('CPDAY', JSON.stringify(out));
  var mins = JSON.parse(prop_('CPMIN') || '{}'); mins[today] = { me: out.me.minimum, partner: out.partner.minimum };
  Object.keys(mins).sort().slice(0, -90).forEach(function (k) { delete mins[k]; });
  setProp_('CPMIN', JSON.stringify(mins));
  return out;
}
/** Chores someone finished on a day (each job once; covering or doing it together counts too). */
function choresDoneOn_(who, ymd) {
  var seen = {};
  xpRows_().forEach(function (r) { if (r.who === who && r.date === ymd && r.kind === 'quest' && r.xp > 0) seen[r.what.replace(/ \(together\)$/, '')] = 1; });
  return Object.keys(seen).length;
}
/** Did someone hit their minimum on a day? null when there's no plan for that day (then the old XP rule applies). */
function minimumMet_(who, ymd) {
  var house = house_(); if (!house.built || ymd < house.built) return null;
  var m = (JSON.parse(prop_('CPMIN') || '{}')[ymd] || {})[who];
  if (m === undefined) return null;
  return cpIsWin(choresDoneOn_(who, ymd), m);
}

/** Daily job (once setup has built the chore list): roll late jobs on, keep "Every" in step with the ramp, plan the day. */
function cpDaily_(ymd) {
  var yesterday = addDays_(ymd, -1), st = cpState_(yesterday), moves = cpRollover(st, yesterday), byName = {};
  readChores_().forEach(function (q) { byName[q.name] = q; });
  moves.forEach(function (m) { var q = byName[m.id]; if (q) updateRow_('chores', q.row, { 'Next due': m.to }); });
  st.chores.forEach(function (c) { var q = byName[c.id]; if (!q || c.archived || c.after) return; var e = everyText_(c, ymd); if (e !== q.every) updateRow_('chores', q.row, { 'Every': e }); });
  forget_('chores'); choresCache_ = null; delProp_('CPDAY');
  var plan = cpToday_();
  return 'chore plan: ' + plan.me.must.length + '+' + plan.me.bonus.length + ' for Dean, ' + plan.partner.must.length + '+' + plan.partner.bonus.length + ' for Yaz' + (moves.length ? ', moved ' + moves.length : '');
}
/** After a job is done: its next date, on a lighter day where it can be. */
function cpAfterDone_(name, ymd, by) {
  if (!setupOn_()) return;
  var st = cpState_(ymd), c = st.chores.filter(function (x) { return x.id === name; })[0];
  if (!c || c.days || c.after || c.archived) return;
  cpAssignWeek(st, ymd);
  var next = cpComplete(st, c, ymd, by), q = readChores_().filter(function (x) { return x.name === name; })[0];
  if (q && next) updateRow_('chores', q.row, { 'Next due': next });
}

// ---------- building the chore list from the answers (merging what's there) ----------
var CP_MATCH = {
  hoover_down: /hoover|vacuum/i, hoover_up: /(hoover|vacuum).*up|up.*(hoover|vacuum)/i, dishes: /dish/i, laundry: /wash on|laundry|put a wash/i,
  laundry_away: /put.*(away|clothes)|\bhang|\bfold/i, sheets: /sheet|bedding|bed linen/i, bathroom: /bath|toilet|\bloo\b|shower/i, kitchen: /kitchen|hob|surface|worktop|counter/i,
  bins: /bin/i, tidy_bedroom: /tidy.*bed|bedroom|clothes away/i, mop: /mop/i, shop: /shop/i, dusting: /dust/i, pets: /pet|cat|dog|litter/i
};
/** Words two chore names share (4+ letters), so the closest existing chore is matched. */
function cpLikeness_(a, b) {
  var w = function (s) { return String(s).toLowerCase().match(/[a-z]{4,}/g) || []; }, A = w(a), n = 0;
  w(b).forEach(function (x) { if (A.indexOf(x) !== -1) n++; });
  return n;
}
/** What building would do, for the review screen: [{ action: 'update'|'add'|'keep', name, was, every, who, minutes, area }]. Nothing is changed. */
function cpPreview_(who) {
  var house = house_(), today = todayYmd_(), gen = cpBuildChores(Object.assign({}, house, { people: cpPeople_() }), today);
  var existing = readChores_().filter(function (q) { return !q.archived; }), used = {}, out = [];
  gen.forEach(function (c) {
    var re = CP_MATCH[c.key], m = null;
    if (re) m = existing.filter(function (q) { return !used[q.name] && (q.key === c.key || re.test(q.name)) && (c.key !== 'laundry' || !CP_MATCH.laundry_away.test(q.name)) && (c.key !== 'hoover_down' || !/up/i.test(q.name)) && (c.key !== 'tidy_bedroom' || !/sheet|bedding/i.test(q.name)); })
      .sort(function (a, b) { return cpLikeness_(b.name, c.name) - cpLikeness_(a.name, c.name); })[0];   // "Clean the bathroom" goes with "Clean bathroom", not "Clean toilet"
    if (!m) m = existing.filter(function (q) { return !used[q.name] && q.name.toLowerCase() === c.name.toLowerCase(); })[0];
    if (m) used[m.name] = 1;
    out.push({ action: m ? 'update' : 'add', name: c.name, was: m ? m.name : '', every: cpFreqText(c, today), goal: c.days ? '' : cpEveryText(c.goal), who: c.assign, minutes: c.minutes, area: c.area, key: c.key, c: c });
  });
  existing.forEach(function (q) { if (!used[q.name]) out.push({ action: 'keep', name: q.name, was: q.name, every: q.label, who: q.who, minutes: q.minutes, area: q.area }); });
  return out;
}
function previewChores(key) {
  var who = who_(key);
  return cpPreview_(who).map(function (x) { var y = Object.assign({}, x); delete y.c; return y; });
}
/** Make the chore list: update matched chores (history kept), add the new ones, keep everything else. */
function buildChores(key) {
  var who = who_(key);
  return withLock_(function () {
    var plan = cpPreview_(who), today = todayYmd_(), byName = {}, idOf = {};
    readChores_().forEach(function (q) { byName[q.name] = q; });
    var gen = plan.filter(function (x) { return x.c; });
    gen.forEach(function (x) { idOf[x.c.id] = x.name; });
    var order = 0;
    gen.forEach(function (x) {
      var c = x.c, f = { 'Minutes': String(c.minutes), 'Every': everyText_(c, today), 'Who': CP_WHO_COL[c.assign] || 'Anyone', 'XP': String(c.xp), 'Area': c.area || '', 'Time of day': c.tod || 'any',
        'Archived': '', 'Order': String(++order), 'Now (days)': c.days ? '' : String(c.now), 'Goal (days)': c.days ? '' : String(c.goal), 'Ramp from': c.days ? '' : today, 'Key': c.key || '', 'After': c.after ? idOf[c.after] || '' : '',
        'Next due': c.days ? (cpNextOn(c, today) || '') : c.due || '', 'Energy': c.minutes <= 10 ? 'Low' : c.minutes >= 30 ? 'High' : 'Medium' };
      if (x.action === 'update') {
        var q = byName[x.was];
        if (x.was !== x.name) { f['Notes'] = (q.notes ? q.notes + ' · ' : '') + 'Was: ' + x.was; renameChore_(q, x.name); }
        if (q.lastDone && !c.days) f['Next due'] = addDays_(q.lastDone, Math.round(cpEvery(c, today))) < today ? c.due : addDays_(q.lastDone, Math.round(cpEvery(c, today)));
        updateRow_('chores', q.row, f);
      } else {
        var row = { 'Job': x.name }; Object.keys(f).forEach(function (k) { row[k] = f[k]; });
        appendChore_(row);
      }
    });
    var keepN = order;
    plan.filter(function (x) { return x.action === 'keep'; }).forEach(function (x) { var q = byName[x.was]; if (q) updateRow_('chores', q.row, { 'Order': String(++keepN) }); });
    var h = house_(); h.built = today; setProp_('HOUSE', JSON.stringify(h));
    delProp_('BOARD'); delProp_('CPDAY'); forget_('chores'); choresCache_ = null;
    return { built: gen.length, kept: plan.length - gen.length, setup: setupState_(who), state: appState_(who) };
  });
}
function appendChore_(fields) {
  var sh = sheet_('chores'), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], row = head.map(function (h, i) { return i === 0 ? fields['Job'] : fields[h] !== undefined ? fields[h] : ''; });
  if (fields['Minutes'] !== undefined) row[1] = fields['Minutes'];
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  forget_('chores'); choresCache_ = null;
}
/** Rename a chore everywhere its name is used as a reference (the row itself and today's board). */
function renameChore_(q, name) {
  sheet_('chores').getRange(q.row, 1).setValue(name);
  var after = readChores_().filter(function (x) { return x.after === q.name; });
  after.forEach(function (x) { updateRow_('chores', x.row, { 'After': name }); });
  forget_('chores'); choresCache_ = null;
}

// ---------- editing any chore ----------
/**
 * Change a chore. f: { name, area, freq: 'daily'|'few'|'weekly'|'biweekly'|'monthly'|'rarely'|'days'|'asneeded', days: [0-6], weeks: 1|2,
 *   minutes, who: 'me'|'partner'|'together'|'rotate'|'anyone', tod, xp, notes }. Changing how often stops the ramp (it's your call now).
 */
function saveChore(key, name, f) {
  var who = who_(key);
  f = f || {};
  return withLock_(function () {
    var q = readChores_().filter(function (x) { return x.name === name; })[0], today = todayYmd_();
    if (!q && name) throw new Error('"' + name + '" isn\'t in the chore list any more.');
    var up = {}, newName = String(f.name || name || '').trim().slice(0, 60);
    if (!newName) throw new Error('Give the chore a name.');
    if (newName !== name && readChores_().some(function (x) { return x.name.toLowerCase() === newName.toLowerCase(); })) throw new Error('There\'s already a chore called ' + newName + '.');
    if (f.minutes !== undefined) up['Minutes'] = String(Math.max(1, Math.min(180, Math.round(Number(f.minutes) || 10))));
    if (f.who !== undefined) up['Who'] = CP_WHO_COL[f.who] || 'Anyone';
    if (f.tod !== undefined) up['Time of day'] = /^(morning|afternoon|evening|any)$/.test(f.tod) ? f.tod : 'any';
    if (f.xp !== undefined) up['XP'] = String(Math.max(1, Math.min(200, Math.round(Number(f.xp) || 5))));
    if (f.notes !== undefined) up['Notes'] = String(f.notes).slice(0, 300);
    if (f.area !== undefined) up['Area'] = String(f.area).slice(0, 40);
    if (f.freq !== undefined) {
      if (f.freq === 'days') {
        var days = (f.days || []).map(Number).filter(function (d) { return d >= 0 && d <= 6; });
        if (!days.length) throw new Error('Pick at least one day.');
        up['Every'] = Number(f.weeks) === 2 ? '2 weeks ' + DAYS3[days[0]] : 'weekly ' + days.map(function (d) { return DAYS3[d]; }).join(', ');
        up['Now (days)'] = ''; up['Goal (days)'] = ''; up['Ramp from'] = '';
        up['Next due'] = cpNextOn({ days: days, weeks: Number(f.weeks) === 2 ? 2 : 1, anchor: today }, today) || '';
      } else if (f.freq === 'asneeded') { up['Every'] = 'as needed'; up['Next due'] = ''; }
      else {
        var every = CP_FREQ[f.freq]; if (!every) throw new Error('Pick how often.');
        up['Every'] = everyText_({ now: every, goal: every }, today); up['Now (days)'] = String(every); up['Goal (days)'] = String(every); up['Ramp from'] = '';
        up['Next due'] = q && q.lastDone ? (addDays_(q.lastDone, Math.ceil(every)) < today ? today : addDays_(q.lastDone, Math.ceil(every))) : today;
      }
    }
    if (!q) {
      var row = { 'Job': newName, 'Minutes': up['Minutes'] || '10', 'Every': up['Every'] || 'weekly', 'Who': up['Who'] || 'Anyone', 'Next due': up['Next due'] || today, 'Order': String(readChores_().length + 1) };
      Object.keys(up).forEach(function (k) { if (row[k] === undefined) row[k] = up[k]; });
      appendChore_(row);
    } else {
      if (newName !== name) renameChore_(q, newName);
      if (Object.keys(up).length) updateRow_('chores', q.row, up);
    }
    delProp_('BOARD'); delProp_('CPDAY'); forget_('chores'); choresCache_ = null;
    return appState_(who);
  });
}
/** archive | unarchive | delete | up | down */
function choreAction(key, name, action) {
  var who = who_(key);
  return withLock_(function () {
    var list = readChores_().slice().sort(function (a, b) { return a.order - b.order; }), q = list.filter(function (x) { return x.name === name; })[0];
    if (!q) throw new Error('"' + name + '" isn\'t in the chore list any more.');
    if (action === 'archive' || action === 'unarchive') updateRow_('chores', q.row, { 'Archived': action === 'archive' ? 'yes' : '' });
    else if (action === 'delete') { sheet_('chores').deleteRow(q.row); forget_('chores'); }
    else if (action === 'up' || action === 'down') {
      var i = list.indexOf(q), j = action === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < list.length) { list.splice(i, 1); list.splice(j, 0, q); list.forEach(function (x, k) { if (x.order !== k + 1) updateRow_('chores', x.row, { 'Order': String(k + 1) }); }); }
    } else throw new Error('Unknown action.');
    delProp_('BOARD'); delProp_('CPDAY'); forget_('chores'); choresCache_ = null;
    return appState_(who);
  });
}
