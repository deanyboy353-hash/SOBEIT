/**
 * Quests.gs: everything that keeps the house running. Recurring quests come
 * from the Chores tab (Every / Who / Energy / XP columns). Each morning up to
 * "Quests per day" due ones go on a shared daily board, arrive in your
 * Google Tasks, and (if you've given an email) in your partner's inbox.
 * Ticking one anywhere counts everywhere.
 *
 * Also here: claiming and covering each other's jobs, "What now?", the brain
 * dump, the shopping list, prep reminders for tomorrow's appointments and
 * email nudges for your partner.
 */

// ---------- the daily board ----------

/** Today's board (picked once per day, then kept so ticked quests stay visible). */
function board_() {
  var today = todayYmd_();
  var props = PROPS;
  var b = JSON.parse(props.getProperty('BOARD') || 'null');
  if (b && b.date === today) return b;
  var cap = num_(readConfig_().settings, 'Quests per day', 6);
  var due = readChores_().filter(function (q) { return q.due; }).sort(function (a, c) { return c.score - a.score; });
  b = { date: today, items: due.slice(0, Math.max(1, cap)).map(function (q) { return q.name; }), claims: {} };
  props.setProperty('BOARD', JSON.stringify(b));
  return b;
}

function saveBoard_(b) {
  PROPS.setProperty('BOARD', JSON.stringify(b));
}

/** Daily job: build the board, send your quests to Google Tasks, email your partner theirs. */
function planQuests_(ymd, cfg) {
  var props = PROPS;
  props.deleteProperty('BOARD');
  var b = board_();
  var quests = readChores_();
  var byName = {};
  quests.forEach(function (q) { byName[q.name] = q; });
  b.items.forEach(function (name) {
    var q = byName[name];
    if (q && q.who !== 'partner') createTrackedTask_('quest', ymd, '' + name, (q.minutes ? '~' + q.minutes + ' min · ' : '') + q.xp + ' XP. Tick here or in the app.', name);
  });
  var mine = b.items.filter(function (n) { return byName[n] && byName[n].who !== 'me'; });
  if (mine.length) {
    push_('partner', 'Today: ' + mine.length + ' quest' + (mine.length === 1 ? '' : 's'), mine.slice(0, 4).join(', ') + (mine.length > 4 ? '…' : ''), 'quests', true);
  }
  return b.items.length + ' quests on the board';
}

function onQuestTaskDone_(task, info) {
  var q = readChores_().filter(function (x) { return x.name === info.ref; })[0];
  if (q && q.lastDone !== info.date) completeQuest_('me', info.ref, {});
  return false;
}

/**
 * Mark a quest done: XP (half again for the other person if you covered
 * their job), "Last done" in the sheet, ticks the Google Task, adds to the feed.
 * opts.partial = stopped early (a taster): some XP, but it stays due.
 */
function completeQuest_(who, name, opts) {
  opts = opts || {};
  var today = todayYmd_();
  var q = readChores_().filter(function (x) { return x.name === name; })[0];
  if (!q) return 0;
  if (opts.partial) return addXp_(who, 'Made a start: ' + name, Math.max(2, Math.round(q.xp / 3)), 'start');
  var upd = { 'Last done': today, 'Last done by': who };
  var rule = parseEvery(q.every);
  if (rule.kind !== 'none') upd['Next due'] = nextAfterDone(rule, today, q.nextDue);
  updateRow_('chores', q.row, upd);
  var xp = addXp_(who, name, q.xp, 'quest');
  var owner = q.who === 'me' || q.who === 'partner' ? q.who : null;
  if (owner && owner !== who) addXp_(who, 'Covered: ' + name, Math.round(q.xp / 2), 'cover');
  completeTracked_('quest', today, name);
  return xp;
}

/** The board plus everything else, shaped for the Quests tab. */
function questsState_(who) {
  var today = todayYmd_();
  var b = board_();
  var quests = readChores_();
  var view = function (q) {
    return {
      name: q.name, minutes: q.minutes, steps: q.steps, usual: q.usual, every: q.every, who: q.who, energy: q.energy, xp: q.xp,
      doneToday: q.lastDone === today, doneBy: q.lastDone === today ? q.lastBy : '', due: q.due, overdue: q.overdue, next: q.next,
      claimedBy: b.claims[q.name] || ''
    };
  };
  var onBoard = b.items.map(function (n) { return quests.filter(function (q) { return q.name === n; })[0]; }).filter(Boolean);
  return {
    board: onBoard.map(view),
    more: quests.filter(function (q) { return q.due && b.items.indexOf(q.name) === -1; }).map(view),
    doneExtra: quests.filter(function (q) { return q.lastDone === today && b.items.indexOf(q.name) === -1; }).map(view),
    upcoming: quests.filter(function (q) { return !q.due && q.next && q.next > today && q.next <= addDays_(today, 7); })
      .sort(function (a, c) { return a.next < c.next ? -1 : 1; }).map(view),
    all: quests.map(view)
  };
}

// ---------- called from the page ----------

function questDone(key, name) {
  var who = who_(key);
  return withLock_(function () {
    var q = readChores_().filter(function (x) { return x.name === name; })[0];
    if (!q) throw new Error('"' + name + '" is no longer in the Chores tab.');
    if (q.lastDone === todayYmd_()) throw new Error(name + ' is already done today.');
    completeQuest_(who, name, {});
    return appState_(who);
  });
}

function claimQuest(key, name) {
  var who = who_(key);
  return withLock_(function () {
    var b = board_();
    if (b.claims[name] === who) delete b.claims[name];
    else if (!b.claims[name]) b.claims[name] = who;
    else throw new Error('Already claimed.');
    saveBoard_(b);
    return appState_(who);
  });
}

/**
 * "What now?": one job that fits your energy and time. Due ones first, then
 * ones coming up soon. skip = names already offered and turned down.
 */
function whatNow(key, energy, minutes, skip) {
  var who = who_(key);
  var today = todayYmd_();
  var level = { low: 1, medium: 2, high: 3 }[String(energy)] || 3;
  var b = board_();
  var fits = readChores_().filter(function (q) {
    var e = { low: 1, medium: 2, high: 3 }[q.energy] || 2;
    var mine = q.who === 'anyone' || q.who === who;
    var claimedByOther = b.claims[q.name] && b.claims[q.name] !== who;
    return mine && !claimedByOther && q.lastDone !== today && e <= level && q.minutes <= Number(minutes || 999) && (skip || []).indexOf(q.name) === -1;
  });
  var rank = function (q) { return (q.due ? 100 : 0) + (b.items.indexOf(q.name) !== -1 ? 50 : 0) + q.score * 10 - (q.next ? ymdToDays(q.next) - ymdToDays(today) : 30); };
  fits.sort(function (a, c) { return rank(c) - rank(a); });
  var q = fits[0];
  return q ? { name: q.name, minutes: Math.min(q.minutes, Number(minutes || q.minutes)), fullMinutes: q.minutes, steps: q.steps, xp: q.xp, due: q.due } : null;
}

// ---------- brain dump ----------

var DUMP_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Short, clear wording of one thing' },
          kind: { type: 'string', enum: ['task', 'recurring', 'shopping', 'park'] },
          every: { type: 'string', description: 'For recurring: daily, 3 days, weekly, 2 weeks, monthly, monthly 15, yearly or a weekday. Else empty.' },
          minutes: { type: 'integer', description: 'Rough minutes it takes (0 for shopping)' }
        },
        required: ['text', 'kind', 'every', 'minutes'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

/** Sort a messy brain dump into tasks, repeating jobs, shopping and things to park. Nothing is saved until you confirm. */
function brainDump(key, text) {
  who_(key);
  text = String(text || '').trim();
  if (!text) throw new Error('Type whatever is in your head first.');
  if (!claudeKey_()) {
    return text.split(/\n|;|,(?=\s*[a-z])/i).map(function (t) { return t.trim(); }).filter(String)
      .map(function (t) { return { text: t, kind: 'task', every: '', minutes: 10 }; });
  }
  var res = callClaudeJson_(
    'Someone with ADHD has typed everything on their mind. Split it into separate, clear items. kind: "task" for a one-off ' +
    'thing to do, "recurring" for a job that should repeat (give how often in every), "shopping" for things to buy, "park" for ' +
    'ideas, worries or someday things that need no action now. Keep their meaning; make each item short and concrete. UK home.',
    text.slice(0, 2000), DUMP_SCHEMA, claudeModel_());
  return (res.items || []).slice(0, 30);
}

function saveBrainDump(key, items) {
  var who = who_(key);
  return withLock_(function () {
    (items || []).forEach(function (it) {
      var t = String(it.text || '').trim().slice(0, 120);
      if (!t) return;
      if (it.kind === 'shopping') addShopping_(who, t);
      else if (it.kind === 'park') park_(who, t);
      else if (it.kind === 'recurring') addQuestRow_(t, Number(it.minutes) || 10, it.every || 'weekly', who === 'me' ? 'Anyone' : 'Anyone');
      else {
        park_(who, '' + t);
        if (who === 'me') Tasks.Tasks.insert({ title: t, due: todayYmd_() + 'T00:00:00.000Z' }, TASK_LIST);
      }
    });
    addXp_(who, 'Brain dump: ' + (items || []).length + ' things sorted', 5, 'brain');
    return appState_(who);
  });
}

function addQuestRow_(name, minutes, every, whoCol) {
  var head = vals_('chores')[0];
  var row = {};
  row[head[0]] = name; row[head[1]] = String(minutes);
  row['Every'] = every; row['Who'] = whoCol; row['Energy'] = minutes <= 10 ? 'Low' : 'Medium';
  appendRow_('chores', row);
}

function addQuest(key, name, every, minutes) {
  var who = who_(key);
  name = String(name || '').trim().slice(0, 80);
  if (!name) throw new Error('Give the quest a name.');
  return withLock_(function () {
    if (readChores_().some(function (q) { return q.name.toLowerCase() === name.toLowerCase(); })) throw new Error('"' + name + '" is already a quest.');
    addQuestRow_(name, Math.max(1, Number(minutes) || 10), String(every || 'weekly'), 'Anyone');
    return appState_(who);
  });
}

// ---------- shopping list (shared) ----------

function addShopping_(who, text) {
  String(text).split(/\n|,/).map(function (t) { return t.trim(); }).filter(String).forEach(function (t) {
    appendRow_('shopping', { 'Date': todayYmd_(), 'Item': t.slice(0, 80), 'Who': who, 'Got': '', 'ID': Utilities.getUuid().replace(/-/g, '').slice(0, 10) });
  });
}

function shoppingState_() {
  return rowsBetween_('shopping', '0000', '9999').filter(function (r) { return !r['Got'] || String(r['Got']).slice(0, 10) === todayYmd_(); })
    .map(function (r) { return { id: String(r['ID']), item: String(r['Item']), who: String(r['Who']), got: !!r['Got'] }; });
}

function addShopping(key, text) {
  var who = who_(key);
  if (!String(text || '').trim()) throw new Error('Type what to buy.');
  return withLock_(function () { addShopping_(who, text); return appState_(who); });
}

function toggleShopping(key, id) {
  var who = who_(key);
  return withLock_(function () {
    var r = findRow_('shopping', 'ID', id);
    if (r) updateRow_('shopping', r, { 'Got': readRow_('shopping', r)['Got'] ? '' : now_() });
    return appState_(who);
  });
}

// ---------- appointments: a prep reminder the day before ----------

function planPrep_(ymd, cfg) {
  var tomorrow = addDays_(ymd, 1);
  var events = CalendarApp.getDefaultCalendar().getEvents(atTime_(tomorrow, 0), atTime_(addDays_(tomorrow, 1), 0))
    .filter(function (ev) { return !ev.getTag(EVENT_TAG) && !(ev.isAllDayEvent && ev.isAllDayEvent()); });
  events.slice(0, 5).forEach(function (ev) {
    createTrackedTask_('prep', ymd, 'Prep for tomorrow: ' + ev.getTitle() + ' at ' + Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm'),
      'What do you need? Travel time, documents, clothes, questions to ask.', ev.getTitle());
  });
  return events.length + ' things tomorrow';
}

function onPrepTaskDone_(task, info) {
  addXp_('me', 'Prepped for ' + info.ref, 5, 'prep');
  return false;
}

// ---------- partner email ----------

function partnerUrl_() {
  var k = PROPS.getProperty('PARTNER_KEY');
  return k ? (appBaseUrl_() || WEBAPP_URL) + '?key=' + k : '';
}

function emailPartner_(subject, body) {
  var to = String(readConfig_().settings['Partner email'] || '').trim();
  if (!/@/.test(to)) return false;
  try { MailApp.sendEmail(to, subject, body); return true; } catch (e) { log_('WARN', 'Partner email: ' + e); return false; }
}

/** "Come and do chores with me": a push (email or calendar alert if push isn't set up) and a banner in their app. */
function askToJoin(key) {
  var who = who_(key);
  setProp_('INVITE', JSON.stringify({ from: who, at: new Date().getTime() }));
  var other = who === 'me' ? 'partner' : 'me';
  var sent = push_(other, names_()[who] + ' wants company for chores', 'Pick a job and do it together.', 'quests', true) > 0;
  addFeed_(who, 'Wants company for chores', 'invite');
  return { sent: sent, state: appState_(who) };
}
