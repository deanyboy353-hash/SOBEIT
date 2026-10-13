/**
 * Chores.gs: body doubling for two. Each person opens their own chores page
 * (you: the main key, your partner: their own key that only opens chores).
 * Pick one job, get a timer and a step list, and see what the other person
 * is doing. Distractions get parked for later instead of followed.
 *
 * Live sessions are kept in Script Properties (CHORE_me / CHORE_partner);
 * finished jobs go to the Chores log tab, parked things to the Later tab.
 * Only your phone gets a calendar alert; your partner's page chimes while open.
 * Functions without a trailing underscore are called from App.html (Chores tab).
 */

var CHORE_PEOPLE = ['me', 'partner'];
var MAX_CHORE_MINUTES = 180;

var CHORE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short job name, e.g. "Clean the oven"' },
    minutes: { type: 'integer', description: 'Realistic time for one person doing it at a steady pace' },
    steps: { type: 'array', items: { type: 'string' }, description: '3 to 6 short, concrete steps in order' }
  },
  required: ['name', 'minutes', 'steps'],
  additionalProperties: false
};

/** 'me' or 'partner' for a page key; anything else is refused. */
function who_(key) {
  var props = PropertiesService.getScriptProperties();
  if (key && key === props.getProperty('WEBAPP_KEY')) return 'me';
  if (key && key === props.getProperty('PARTNER_KEY')) return 'partner';
  throw new Error('This link is out of date. Open the chores link from the Config tab again.');
}

function session_(p) {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('CHORE_' + p) || 'null');
}

function saveSession_(p, s) {
  var props = PropertiesService.getScriptProperties();
  if (s) props.setProperty('CHORE_' + p, JSON.stringify(s));
  else props.deleteProperty('CHORE_' + p);
}

/** Chores tab rows, plus how long each one has actually taken lately. */
function readChores_() {
  var rows = sheet_('chores').getDataRange().getValues();
  var recent = {};
  rowsBetween_('choresLog', addDays_(todayYmd_(), -90), todayYmd_()).forEach(function (r) {
    if (r['Result'] !== 'Done') return;
    (recent[r['Task']] = recent[r['Task']] || []).push(Number(r['Actual (min)']) || 0);
  });
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0]).trim();
    if (!name) continue;
    var times = (recent[name] || []).slice(-5).sort(function (a, b) { return a - b; });
    out.push({
      name: name,
      minutes: Math.min(MAX_CHORE_MINUTES, Math.max(1, Number(rows[i][1]) || 10)),
      steps: String(rows[i][2] || '').split(/\s*;\s*|\n/).filter(String),
      usual: times.length >= 2 ? times[Math.floor(times.length / 2)] : null
    });
  }
  return out;
}

function choresDoneToday_() {
  var done = { me: [], partner: [] };
  rowsBetween_('choresLog', todayYmd_(), todayYmd_()).forEach(function (r) {
    if (r['Result'] === 'Done' && done[r['Who']]) done[r['Who']].push(String(r['Task']));
  });
  return done;
}

/** Everything a chores page needs. Sessions left running for hours are closed off first. */
function choresState_(p) {
  var settings = readConfig_().settings;
  var now = new Date().getTime();
  var done = choresDoneToday_();
  var people = {};
  CHORE_PEOPLE.forEach(function (q) {
    var s = session_(q);
    if (s && now > s.endsAt + 2 * 3600000) { closeSession_(q, s, 'Not finished'); s = null; }
    people[q] = {
      name: String(settings[q === 'me' ? 'Your name' : 'Partner name'] || '').trim(),
      session: s,
      doneToday: done[q]
    };
  });
  var later = rowsBetween_('later', '0000', '9999').filter(function (r) { return !r['Done']; })
    .map(function (r) { return { id: String(r['ID']), thing: String(r['Thing']), who: String(r['Who']) }; });
  return { you: p, now: now, people: people, chores: readChores_(), later: later, hasClaudeKey: !!claudeKey_() };
}

/** Log a session and clear it; unfinished steps from a stopped job are parked automatically. */
function closeSession_(p, s, result) {
  var now = new Date();
  appendRow_('choresLog', {
    'Date': Utilities.formatDate(new Date(s.startedAt), TZ, 'yyyy-MM-dd'), 'Who': p, 'Task': s.task,
    'Planned (min)': s.planned, 'Actual (min)': Math.max(1, Math.round((now.getTime() - s.startedAt) / 60000)),
    'Result': result, 'Started': Utilities.formatDate(new Date(s.startedAt), TZ, 'HH:mm'),
    'Finished': Utilities.formatDate(now, TZ, 'HH:mm'), 'Steps done': s.steps.length ? s.step + '/' + s.steps.length : ''
  });
  if (result === 'Stopped' && s.step < s.steps.length) {
    park_(p, s.task + ': ' + s.steps.slice(s.step).join(', '));
  }
  if (p === 'me') removeChoreAlert_(s);
  saveSession_(p, null);
}

function park_(p, text) {
  appendRow_('later', { 'Date': now_(), 'Who': p, 'Thing': String(text).slice(0, 300), 'Done': '', 'ID': Utilities.getUuid().replace(/-/g, '').slice(0, 10) });
}

// Your phone and watch buzz when your time is up (a calendar alert at the end time).
function setChoreAlert_(s) {
  var end = new Date(Math.ceil(s.endsAt / 60000) * 60000);
  var ev = CalendarApp.getDefaultCalendar().createEvent('⏰ ' + s.task + ": time's up", end, new Date(end.getTime() + 60000), {
    description: 'Finished? Tap Done on the chores page. Need longer? Tap +5 min.'
  });
  ev.setTag(EVENT_TAG, 'chore');
  ev.removeAllReminders();
  ev.addPopupReminder(0);
  ev.setColor(CalendarApp.EventColor.GRAY);
}

function removeChoreAlert_(s) {
  var ymd = Utilities.formatDate(new Date(s.endsAt), TZ, 'yyyy-MM-dd');
  removeTaggedEvents_(ymd, 'chore');
}

// ---- called from the page ----

function choresState(key) {
  var p = who_(key);
  return withLock_(function () { return choresState_(p); });
}

/** Claude times and breaks down a job that isn't in the Chores tab. */
function planChore(key, text) {
  who_(key);
  text = String(text || '').trim();
  if (!text) throw new Error('Type the job first.');
  var known = readChores_().filter(function (c) { return c.name.toLowerCase() === text.toLowerCase(); })[0];
  if (known) return known;
  if (!claudeKey_()) return { name: text, minutes: 15, steps: [], guessed: true };
  var plan = callClaudeJson_(
    'You help someone with ADHD do one household job without drifting onto other jobs. Given a job, give a realistic time ' +
    'for one person at a steady pace (UK home) and 3 to 6 short, concrete steps in order. Keep steps inside this one job: ' +
    'no "while you are there" extras.', text, CHORE_SCHEMA, claudeModel_());
  return {
    name: String(plan.name || text).slice(0, 80),
    minutes: Math.min(MAX_CHORE_MINUTES, Math.max(1, Math.round(Number(plan.minutes) || 15))),
    steps: (plan.steps || []).slice(0, 8).map(String)
  };
}

/** Start one job. Refused while another is running: finish or stop it first, so you can't hop. */
function startChore(key, plan) {
  var p = who_(key);
  return withLock_(function () {
    var current = session_(p);
    if (current) throw new Error('Finish or stop "' + current.task + '" first. One job at a time.');
    var minutes = Math.min(MAX_CHORE_MINUTES, Math.max(1, Math.round(Number(plan && plan.minutes) || 0)));
    var name = String(plan && plan.name || '').trim().slice(0, 80);
    if (!name || !minutes) throw new Error('Pick a job first.');
    var now = new Date().getTime();
    var s = {
      task: name, steps: (plan.steps || []).slice(0, 8).map(String), step: 0,
      startedAt: now, endsAt: now + minutes * 60000, planned: minutes
    };
    saveSession_(p, s);
    if (p === 'me') setChoreAlert_(s);
    return choresState_(p);
  });
}

function stepDone(key, index) {
  var p = who_(key);
  return withLock_(function () {
    var s = session_(p);
    if (!s) return choresState_(p);
    s.step = Math.max(0, Math.min(s.steps.length, Number(index) + 1));
    saveSession_(p, s);
    return choresState_(p);
  });
}

function extendChore(key, minutes) {
  var p = who_(key);
  return withLock_(function () {
    var s = session_(p);
    if (!s) throw new Error('No job running.');
    var now = new Date().getTime();
    if (p === 'me') removeChoreAlert_(s);
    s.endsAt = Math.max(s.endsAt, now) + Math.max(1, Math.min(30, Number(minutes) || 5)) * 60000;
    saveSession_(p, s);
    if (p === 'me') setChoreAlert_(s);
    return choresState_(p);
  });
}

/**
 * result: 'Done', 'Stopped' (unfinished steps are parked for later) or
 * 'Cancelled' (started the wrong job by mistake: nothing is logged).
 */
function finishChore(key, result) {
  var p = who_(key);
  return withLock_(function () {
    var s = session_(p);
    if (s && result === 'Cancelled') {
      if (p === 'me') removeChoreAlert_(s);
      saveSession_(p, null);
    } else if (s) {
      closeSession_(p, s, result === 'Stopped' ? 'Stopped' : 'Done');
    }
    return choresState_(p);
  });
}

/** "I've just noticed the windows need doing": write it down, don't go and do it. */
function parkThing(key, text) {
  var p = who_(key);
  text = String(text || '').trim();
  if (!text) throw new Error('Type the thing to park.');
  return withLock_(function () {
    park_(p, text);
    return choresState_(p);
  });
}

function clearLater(key, id) {
  var p = who_(key);
  return withLock_(function () {
    var r = findRow_('later', 'ID', id);
    if (r) updateRow_('later', r, { 'Done': now_() });
    return choresState_(p);
  });
}
