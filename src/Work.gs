/**
 * Work.gs: time blocking for the work day.
 *
 * Type "Write the report 10-11:30" or "Emails 30m" and it lands on your day's
 * timeline (in the first free slot if you didn't give a time). Start a block on
 * time, tick it off, collect XP:
 *   length: about 2 XP per 10 minutes (4 to 24), deep work x1.5, meetings half, breaks 2
 *   +3 for starting within five minutes of its time, +1 for each block already done today (up to +5)
 *   Clean sheet: every work block of the day done (at least 3) +25 XP, and it builds a work streak.
 * nagRun() pings you just before a block starts, if you haven't started it, and when it ends.
 */

var CLEAN_SHEET_XP = 25;

function workHours_(who) {
  var p = prefs_(who);
  return { start: isFinite(p.workStart) ? Number(p.workStart) : 540, end: isFinite(p.workEnd) ? Number(p.workEnd) : 1050 };
}

function blockRows_(who, ymd) {
  return rowsBetween_('blocks', ymd, ymd)
    .filter(function (r) { return r['Who'] === who && r['Status'] !== 'deleted'; })
    .map(function (r) {
      return { id: String(r['ID']), task: String(r['Task']), kind: BLOCK_KINDS[r['Kind']] ? String(r['Kind']) : 'focus', start: Number(r['Start (min)']) || 0, mins: Number(r['Mins']) || 30,
        status: String(r['Status'] || 'planned'), startedAt: Number(r['Started (ms)']) || 0, doneAt: Number(r['Done (ms)']) || 0, xp: Number(r['XP']) || 0, pings: Number(r['Pings']) || 0,
        target: Number(r['Target']) || 0, count: Number(r['Count']) || 0, unit: String(r['Unit'] || '') };
    })
    .sort(function (a, b) { return a.start - b.start || (a.id < b.id ? -1 : 1); });
}

function blockRow_(id) { return findRow_('blocks', 'ID', id); }

function cleanDays_(who) { return JSON.parse(prop_('CLEAN_' + who) || '[]'); }

/** Days in a row (skipping days with nothing planned) where every work block got done. */
function workStreak_(who) {
  var clean = cleanDays_(who), today = todayYmd_(), from = addDays_(today, -60), planned = {}, n = 0;
  rowsBetween_('blocks', from, today).forEach(function (r) { if (r['Who'] === who && r['Kind'] !== 'break' && r['Status'] !== 'deleted') planned[String(r['Date'])] = true; });
  for (var d = today; d >= from; d = addDays_(d, -1)) {
    if (!planned[d]) continue;
    if (clean.indexOf(d) !== -1) n++;
    else if (d !== today) break;
  }
  return n;
}

function workState_(who, ymd) {
  ymd = ymd || todayYmd_();
  var b = blockRows_(who, ymd), work = b.filter(function (x) { return x.kind !== 'break'; });
  var done = work.filter(function (x) { return x.status === 'done'; });
  var sum = function (l) { return l.reduce(function (s, x) { return s + x.mins; }, 0); };
  return {
    date: ymd, today: ymd === todayYmd_(), blocks: b, hours: workHours_(who), kinds: BLOCK_KINDS,
    planned: sum(work), doneMins: sum(done), done: done.length, total: work.length,
    clean: cleanDays_(who).indexOf(ymd) !== -1, cleanXp: CLEAN_SHEET_XP, xp: b.reduce(function (s, x) { return s + x.xp; }, 0), streak: workStreak_(who),
    week: workWeek_(who), kit: workKit_(who)
  };
}

var WORK_KIT_DEFAULT = ['Queue 40 emails', 'Edit 2h', 'Inbox zero 30m', 'Calls 45m', 'Plan tomorrow 15m'];
function workKit_(who) { var k = prefs_(who).workKit; return Array.isArray(k) ? k : WORK_KIT_DEFAULT.slice(); }

/** The last 7 days: how many of each thing (emails, videos...) and how long on each kind of work. */
function workWeek_(who) {
  var today = todayYmd_(), units = {}, kinds = {}, blocks = 0;
  rowsBetween_('blocks', addDays_(today, -6), today).forEach(function (r) {
    if (r['Who'] !== who || r['Status'] === 'deleted' || r['Status'] === 'skipped') return;
    var c = Number(r['Count']) || 0, u = String(r['Unit'] || '');
    if (u && c) units[u] = (units[u] || 0) + c;
    if (r['Status'] === 'done') { kinds[r['Kind']] = (kinds[r['Kind']] || 0) + (Number(r['Mins']) || 0); blocks++; }
  });
  return { units: units, kinds: kinds, blocks: blocks };
}

function addBlock_(who, ymd, p) {
  if (!('Target' in headerMap_('blocks'))) ensureTab_('blocks');   // first block ever: set up the Work blocks tab now
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  appendRow_('blocks', { 'Date': ymd, 'ID': id, 'Who': who, 'Task': p.task, 'Kind': p.kind, 'Start (min)': p.start, 'Mins': p.mins, 'Status': 'planned', 'Started (ms)': '', 'Done (ms)': '', 'XP': '', 'Pings': 0, 'Target': p.target || '', 'Count': p.target ? 0 : '', 'Unit': p.unit || '' });
  return id;
}

function validDay_(ymd) {
  var today = todayYmd_();
  ymd = String(ymd || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymd >= addDays_(today, -1) && ymd <= addDays_(today, 14) ? ymd : '';
}

function workResult_(who, ymd, extra) {
  var out = { state: appState_(who), work: workState_(who, ymd) };
  Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

/** If every work block today is done (3 or more), the clean sheet bonus, once. */
function checkCleanSheet_(who, ymd) {
  var work = blockRows_(who, ymd).filter(function (x) { return x.kind !== 'break'; });
  if (work.length < 3 || work.some(function (x) { return x.status !== 'done'; })) return 0;
  var clean = cleanDays_(who);
  if (clean.indexOf(ymd) !== -1) return 0;
  clean.push(ymd);
  setProp_('CLEAN_' + who, JSON.stringify(clean.slice(-90)));
  addXp_(who, 'Clean sheet: every work block done', CLEAN_SHEET_XP, 'work');
  push_(who === 'me' ? 'partner' : 'me', nicks_()[who] + ' cleared every work block', work.length + ' blocks, nothing skipped. Clean sheet.', 'home');
  return CLEAN_SHEET_XP;
}

// ---- called from the app ----

function workState(key, ymd) {
  var who = who_(key);
  return workState_(who, validDay_(ymd) || todayYmd_());
}

/** "Write the report 10-11:30". startMin (optional) places it where you tapped on the timeline. */
function addBlock(key, text, ymd, startMin) {
  var who = who_(key);
  var p = parseBlock(text);
  if (!p) throw new Error('Type what you\'re working on, like "Write the report 10-11:30" or "Emails 30m".');
  return withLock_(function () {
    var today = todayYmd_(), day = validDay_(ymd) || (p.tomorrow ? addDays_(today, 1) : today);
    if (isFinite(startMin) && startMin !== null && startMin !== '') p.start = Math.max(0, Math.min(1435, Math.round(Number(startMin) / 5) * 5));
    var hours = workHours_(who), placed = p.start === null;
    if (placed) {
      var from = day === today ? Math.max(hours.start, minutesNow_()) : hours.start;
      p.start = placeBlock(blockRows_(who, day).filter(function (x) { return x.status !== 'skipped'; }), p.mins, from);
    }
    var id = undoable_(who, 'Added: ' + p.task, function () { return addBlock_(who, day, p); });
    var u = JSON.parse(prop_('UNDO_' + who)); u.restore = { block: { id: id, values: { 'Status': 'deleted' } } }; setProp_('UNDO_' + who, JSON.stringify(u));
    return workResult_(who, day, { added: { id: id, task: p.task, start: p.start, mins: p.mins, kind: p.kind, placed: placed, date: day } });
  });
}

/** Lots at once (one per line): each goes into the next free slot, in order. */
function planDay(key, text, ymd) {
  var who = who_(key);
  var lines = String(text || '').split(/\n|;/).map(function (l) { return l.replace(/^\s*[-*•\d.)]+\s*/, '').trim(); }).filter(Boolean).slice(0, 20);
  if (!lines.length) throw new Error('Add one task per line, like "Emails 30m".');
  return withLock_(function () {
    var today = todayYmd_(), day = validDay_(ymd) || today, hours = workHours_(who), n = 0;
    var from = day === today ? Math.max(hours.start, minutesNow_()) : hours.start;
    lines.forEach(function (line) {
      var p = parseBlock(line); if (!p) return;
      if (p.start === null) p.start = placeBlock(blockRows_(who, day).filter(function (x) { return x.status !== 'skipped'; }), p.mins, from);
      addBlock_(who, day, p); n++;
    });
    return workResult_(who, day, { added: n });
  });
}

/** Move, resize, rename or re-label a block that isn't finished. */
function updateBlock(key, id, ch) {
  var who = who_(key);
  ch = ch || {};
  return withLock_(function () {
    var r = blockRow_(id), row = r ? readRow_('blocks', r) : null;
    if (!row || row['Who'] !== who || row['Status'] === 'deleted') throw new Error('That block has gone.');
    var up = {};
    if (ch.start !== undefined && isFinite(ch.start)) up['Start (min)'] = Math.max(0, Math.min(1435, Math.round(Number(ch.start) / 5) * 5));
    if (ch.mins !== undefined && isFinite(ch.mins)) up['Mins'] = Math.max(5, Math.min(600, Math.round(Number(ch.mins) / 5) * 5));
    if (ch.task !== undefined && String(ch.task).trim()) up['Task'] = String(ch.task).trim().slice(0, 100);
    if (ch.kind !== undefined && BLOCK_KINDS[ch.kind]) up['Kind'] = ch.kind;
    if (up['Start (min)'] !== undefined) up['Pings'] = 0;
    updateRow_('blocks', r, up);
    return workResult_(who, String(row['Date']));
  });
}

function finishBlock_(who, r, b, ymd) {
  var now = new Date().getTime(), startMs = atTime_(ymd, b.start).getTime(), onTime = !!b.startedAt && Math.abs(b.startedAt - startMs) <= 5 * 60000;
  var combo = blockRows_(who, ymd).filter(function (x) { return x.status === 'done' && x.kind !== 'break'; }).length;
  var xp = blockXp(b.kind, b.mins, onTime, combo), part = b.target ? Math.max(0.25, Math.min(1, b.count / b.target)) : 1;
  if (b.target && b.count > b.target) xp += 3;                       // went past the target
  xp = Math.max(1, Math.round(xp * part));
  addXp_(who, (b.kind === 'break' ? 'Took a break: ' : 'Work block: ') + b.task + (b.target ? ' (' + b.count + '/' + b.target + ' ' + b.unit + ')' : '') + (onTime ? ' (on time)' : ''), xp, 'work');
  updateRow_('blocks', r, { 'Status': 'done', 'Done (ms)': now, 'XP': xp, 'Started (ms)': b.startedAt || now });
  return { xp: xp, onTime: onTime, combo: Math.min(5, combo), clean: checkCleanSheet_(who, ymd), part: part };
}

/** Progress on a counted block ("Queue 40 emails"): +1, +5, -1... Hitting the target ticks it off. */
function countBlock(key, id, delta) {
  var who = who_(key);
  delta = Math.round(Number(delta));
  if (!delta || Math.abs(delta) > 500) throw new Error('That didn\'t count.');
  return withLock_(function () {
    var r = blockRow_(id), row = r ? readRow_('blocks', r) : null;
    if (!row || row['Who'] !== who || row['Status'] === 'deleted') throw new Error('That block has gone.');
    var ymd = String(row['Date']), b = blockRows_(who, ymd).filter(function (x) { return x.id === id; })[0];
    if (!b.target) throw new Error('That block has no count.');
    if (b.status === 'done') return workResult_(who, ymd, { xp: 0, count: b.count });
    var was = b.count;
    b.count = Math.max(0, Math.min(b.target * 3, b.count + delta));
    var up = { 'Count': b.count };
    if (b.status === 'planned' || b.status === 'skipped') { up['Status'] = 'active'; if (!b.startedAt) up['Started (ms)'] = new Date().getTime(); b.startedAt = b.startedAt || up['Started (ms)']; }
    updateRow_('blocks', r, up);
    if (was < b.target && b.count >= b.target) {
      var snap = { block: { id: b.id, values: { 'Status': 'active', 'Done (ms)': '', 'XP': '', 'Count': was } }, clean: ymd };
      return workResult_(who, ymd, Object.assign({ hit: true, count: b.count }, undoable_(who, b.task, function () { return finishBlock_(who, r, b, ymd); }, snap)));
    }
    return workResult_(who, ymd, { xp: 0, count: b.count });
  });
}

/** start, done, skip, delete or reopen. */
function blockAction(key, id, action) {
  var who = who_(key);
  if (['start', 'done', 'skip', 'delete', 'reopen'].indexOf(action) === -1) throw new Error('Unknown action.');
  return withLock_(function () {
    var r = blockRow_(id), row = r ? readRow_('blocks', r) : null;
    if (!row || row['Who'] !== who || row['Status'] === 'deleted') throw new Error('That block has gone.');
    var ymd = String(row['Date']), b = blockRows_(who, ymd).filter(function (x) { return x.id === id; })[0], now = new Date().getTime();
    if (action === 'start') {
      if (b.status === 'planned' || b.status === 'skipped') updateRow_('blocks', r, { 'Status': 'active', 'Started (ms)': now });
    } else if (action === 'done') {
      if (b.status === 'done') return workResult_(who, ymd, { xp: 0 });
      var snap = { block: { id: b.id, values: { 'Status': b.status, 'Done (ms)': '', 'XP': '', 'Started (ms)': b.startedAt || '', 'Count': b.target ? b.count : '' } }, clean: ymd };
      return workResult_(who, ymd, undoable_(who, b.task, function () { return finishBlock_(who, r, b, ymd); }, snap));
    } else if (action === 'skip') {
      if (b.status !== 'done') updateRow_('blocks', r, { 'Status': 'skipped' });
    } else if (action === 'reopen') {
      if (b.status === 'skipped') updateRow_('blocks', r, { 'Status': 'planned' });
    } else if (action === 'delete') {
      if (b.status === 'done') throw new Error('That one\'s done and paid. It stays.');
      updateRow_('blocks', r, { 'Status': 'deleted' });
    }
    return workResult_(who, ymd, { xp: 0 });
  });
}

/** Running late: push the rest of today back (the block you're in gets longer). */
function shiftBlocks(key, mins) {
  var who = who_(key);
  mins = Math.round(Number(mins) / 5) * 5;
  if (!mins || Math.abs(mins) > 240) throw new Error('Pick a shift up to 4 hours.');
  return withLock_(function () {
    var ymd = todayYmd_(), now = minutesNow_(), n = 0;
    blockRows_(who, ymd).forEach(function (b) {
      if (b.status === 'done' || b.status === 'skipped') return;
      var r = blockRow_(b.id);
      if (b.status === 'active' || (b.start <= now && b.start + b.mins > now)) { updateRow_('blocks', r, { 'Mins': Math.max(5, b.mins + mins) }); n++; }
      else if (b.start > now - 5) { updateRow_('blocks', r, { 'Start (min)': Math.max(0, Math.min(1435, b.start + mins)), 'Pings': 0 }); n++; }
    });
    return workResult_(who, ymd, { moved: n });
  });
}

/** Copy the most recent day with a plan (in the last week) onto this day. */
function copyPlan(key, ymd) {
  var who = who_(key);
  return withLock_(function () {
    var day = validDay_(ymd) || todayYmd_(), have = blockRows_(who, day), src = null;
    for (var i = 1; i <= 7 && !src; i++) { var d = addDays_(day, -i), l = blockRows_(who, d); if (l.length) src = l; }
    if (!src) throw new Error('No plan in the last week to copy.');
    var n = 0;
    src.forEach(function (b) {
      if (b.status === 'skipped' || have.some(function (x) { return x.task === b.task && x.start === b.start; })) return;
      addBlock_(who, day, { task: b.task, kind: b.kind, start: b.start, mins: b.mins, target: b.target, unit: b.unit }); n++;
    });
    return workResult_(who, day, { added: n });
  });
}

// ---- reminders (from nagRun every 5 minutes) ----

/** Pings: 1 = "up next" sent, 2 = "not started" sent, 4 = "time's up" sent. */
function workNags_() {
  if (quietNow_()) return 0;
  var ymd = todayYmd_(), now = minutesNow_(), sent = 0;
  ['me', 'partner'].forEach(function (who) {
    var level = nagLevel_(who);
    blockRows_(who, ymd).forEach(function (b) {
      if (b.status === 'done' || b.status === 'skipped') return;
      var r = 0, title = '', body = '';
      if (!(b.pings & 1) && b.status === 'planned' && b.start - now <= 5 && b.start - now >= 0) {
        r = 1; title = 'Up next at ' + formatClock(b.start); body = b.task + ' (' + b.mins + ' min). Start it on time for +3 XP.';
      } else if (!(b.pings & 2) && b.status === 'planned' && now >= b.start + 10 && now < b.start + b.mins && level !== 'gentle') {
        r = 2; title = 'You haven\'t started ' + b.task; body = 'It was meant to start at ' + formatClock(b.start) + '. Start it now, or move it.';
      } else if (!(b.pings & 4) && now >= b.start + b.mins && now < b.start + b.mins + 60 && b.kind !== 'break') {
        r = 4; title = 'Time\'s up: ' + b.task; body = b.status === 'active' ? 'Done? Tick it off for your XP. Running over? Push the rest of the day back.' : 'Did it happen? Tick it off, or skip it.';
      }
      if (!r) return;
      push_(who, title, body, 'work', r === 4, {});
      updateRow_('blocks', blockRow_(b.id), { 'Pings': b.pings | r });
      sent++;
    });
  });
  return sent;
}
