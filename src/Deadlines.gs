/**
 * Deadlines.gs: "Send the invoice by 3pm", and the app won't let it go.
 *
 * A deadline nags you on your phone as it gets close, then keeps going after
 * it's due (every 5 minutes on Duolingo level) until you tap Done or Park it.
 *   Done on time   +15 XP      Done late    +5 XP
 *   +30 minutes    -3 XP       Park it      -10 XP (saved in Later)
 * How hard it pushes is your "Nag level" in Customise: gentle, normal or Duolingo.
 * nagRun() runs every 5 minutes. Nothing is sent from 22:30 to 08:00.
 */

var DEADLINE_XP = { onTime: 15, late: 5, extend: -3, park: -10 };

var NAG_LINES = {
  before: ['{task}: due at {due}. {left} left.', 'Heads up: {task} by {due}. You\'ve got this.', '{left} until {task} is due. Start now and it\'s easy.'],
  due: ['{task} is due now.', 'Time\'s up: {task}. Done, or park it?', 'It\'s {due}. {task}?'],
  late: ['{task} was due at {due}. {late} late.', 'Still waiting on {task}. It won\'t do itself.', '{task}. {late} overdue. Tap Done or park it.',
    'These reminders won\'t stop until {task} is done.', '{char} is looking at you. {task}, {late} late.', 'You could finish {task} in less time than you\'ve spent ignoring this.',
    '{task}. Five minutes. Go.', 'Still here. Still {task}.',
    '{other} finished their stuff ages ago. Just saying. {task}?', 'Future you is going to be so annoyed about {task}.',
    'This is the {nth} reminder about {task}.', 'Imagine how good ticking off {task} will feel. Now imagine doing it.']
};

function deadlineRows_(who) {
  return rowsBetween_('deadlines', '0000', '9999')
    .filter(function (r) { return (!who || r['Who'] === who); })
    .map(function (r) {
      return { id: String(r['ID']), who: String(r['Who']), task: String(r['Task']), due: Number(r['Due (ms)']), dueText: String(r['Due'] instanceof Date ? Utilities.formatDate(r['Due'], TZ, 'yyyy-MM-dd HH:mm') : r['Due']),
        status: String(r['Status'] || 'open'), nags: Number(r['Nags']) || 0, lastNag: Number(r['Last nag (ms)']) || 0, finished: String(r['Finished'] || ''), xp: Number(r['XP']) || 0 };
    });
}

function openDeadlines_(who) {
  return deadlineRows_(who).filter(function (d) { return d.status === 'open'; }).sort(function (a, b) { return a.due - b.due; });
}

function deadlineRow_(id) {
  return findRow_('deadlines', 'ID', id);
}

function nagLevel_(who) {
  var lv = prefs_(who).nag;
  return NAG_LEVELS[lv] ? lv : who === 'me' ? 'aggressive' : 'normal';
}

/** Adds one from text like "Send the invoice by 3pm". Returns the deadline. */
function addDeadline_(who, text) {
  text = String(text || '').trim().slice(0, 140);
  var p = parseDeadline(text, minutesNow_());
  if (!p) throw new Error('Add a time, like "by 3pm", "at 15:30" or "in 2 hours".');
  var ymd = addDays_(todayYmd_(), p.dayOffset), due = atTime_(ymd, p.min);
  var d = { id: Utilities.getUuid().replace(/-/g, '').slice(0, 10), who: who, task: p.task.slice(0, 100), due: due.getTime(), dueText: ymd + ' ' + formatClock(p.min) };
  appendRow_('deadlines', { 'Date': todayYmd_(), 'ID': d.id, 'Who': who, 'Task': d.task, 'Due': d.dueText, 'Due (ms)': d.due, 'Status': 'open', 'Nags': 0, 'Last nag (ms)': 0, 'Finished': '', 'XP': '' });
  return d;
}

function deadlinesState_(who) {
  return openDeadlines_(who).map(function (d) { return { id: d.id, task: d.task, due: d.due, dueText: d.dueText, nags: d.nags }; });
}

function fill_(line, d, who) {
  var now = new Date().getTime(), mins = Math.round(Math.abs(d.due - now) / 60000);
  var span = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' min';
  var c = charName_(prefs_(who).char);
  var nth = d.nags + 1, other = nicks_()[who === 'me' ? 'partner' : 'me'];
  var ord = nth + (nth % 100 >= 11 && nth % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][nth % 10] || 'th');
  return line.replace('{task}', d.task).replace('{due}', d.dueText.slice(-5)).replace('{left}', span).replace('{late}', span)
    .replace('{char}', c || 'Everyone').replace('{other}', other).replace('{nth}', ord);
}

function charName_(id) {
  var names = { 'sa-cj': 'CJ', 'sa-smoke': 'Big Smoke', 'sa-sweet': 'Sweet', 'sa-ryder': 'Ryder', 'sa-kendl': 'Kendl', 'sa-cesar': 'Cesar', 'sa-catalina': 'Catalina',
    'sa-woozie': 'Woozie', 'sa-truth': 'The Truth', 'sa-toreno': 'Toreno', 'sa-maddogg': 'Madd Dogg', 'sa-ogloc': 'OG Loc', 'sa-zero': 'Zero', 'sa-tenpenny': 'Tenpenny',
    'vc-tommy': 'Tommy', 'vc-lance': 'Lance', 'vc-ken': 'Ken', 'vc-mercedes': 'Mercedes', 'vc-umberto': 'Umberto', 'vc-phil': 'Phil', 'vc-kent': 'Kent Paul',
    'vc-diaz': 'Diaz', 'vc-avery': 'Avery', 'vc-sonny': 'Sonny', 'sa-denise': 'Denise', 'sa-millie': 'Millie', 'sa-helena': 'Helena', 'sa-michelle': 'Michelle',
    'sa-katie': 'Katie', 'sa-barbara': 'Barbara', 'sa-lowrider': 'Your lowrider crew', 'sa-vinewood': 'Vinewood', 'vc-skater': 'Ocean Beach', 'vc-singer': 'The Malibu crowd',
    'vc-lifeguard': 'The lifeguard', 'vc-heiress': 'Starfish Island', 'vc-aerobics': 'Your aerobics class' };
  return names[id] || '';
}

/** Every 5 minutes: nag about deadlines, plus the other timed reminders. */
function nagRun() {
  withLock_(function () {
    try { nagDeadlines_(); } catch (e) { log_('WARN', 'Deadline nags: ' + e); }
    try { workNags_(); } catch (e) { log_('WARN', 'Work nags: ' + e); }
    try { heartbeat_(); } catch (e) { log_('WARN', 'Reminders: ' + e); }
  });
}

function quietNow_() {
  var m = minutesNow_();
  return m >= 22 * 60 + 30 || m < 8 * 60;
}

function nagDeadlines_() {
  if (quietNow_()) return 0;
  var now = new Date().getTime(), sent = 0;
  openDeadlines_().forEach(function (d) {
    var kind = nagDue(d.due, now, d.lastNag, nagLevel_(d.who));
    if (!kind) return;
    var lines = NAG_LINES[kind], line = fill_(lines[d.nags % lines.length], d, d.who);
    var title = kind === 'before' ? 'Coming up' : kind === 'due' ? 'Due now' : 'Overdue';
    push_(d.who, title, line, 'home', kind === 'due', { deadline: d.id, persist: kind !== 'before' });
    updateRow_('deadlines', deadlineRow_(d.id), { 'Nags': d.nags + 1, 'Last nag (ms)': now });
    sent++;
  });
  return sent;
}

// ---- called from the app ----

function addDeadline(key, text) {
  var who = who_(key);
  return withLock_(function () {
    var d = addDeadline_(who, text);
    var mins = Math.round((d.due - new Date().getTime()) / 60000);
    return { added: { task: d.task, due: d.due, dueText: d.dueText, inMin: mins }, state: appState_(who) };
  });
}

/** Done, park or +30 minutes. Done and park only apply to your own deadlines. */
function deadlineAction(key, id, action) {
  var who = who_(key);
  if (['done', 'park', 'extend'].indexOf(action) === -1) throw new Error('Unknown action.');
  return withLock_(function () {
    var r = deadlineRow_(id), row = r ? readRow_('deadlines', r) : null;
    if (!row || row['Who'] !== who) throw new Error('That deadline has gone.');
    if (row['Status'] !== 'open') return { state: appState_(who), xp: 0 };
    var d = deadlineRows_(who).filter(function (x) { return x.id === id; })[0], now = new Date().getTime(), xp = 0;
    if (action === 'done') {
      xp = now <= d.due ? DEADLINE_XP.onTime : DEADLINE_XP.late;
      addXp_(who, (now <= d.due ? 'On time: ' : 'Done late: ') + d.task, xp, 'deadline');
      updateRow_('deadlines', r, { 'Status': 'done', 'Finished': now_('yyyy-MM-dd HH:mm'), 'XP': xp });
    } else if (action === 'park') {
      xp = DEADLINE_XP.park;
      addXp_(who, 'Parked: ' + d.task, xp, 'penalty');
      park_(who, d.task + ' (was due ' + d.dueText.slice(-5) + ')');
      updateRow_('deadlines', r, { 'Status': 'parked', 'Finished': now_('yyyy-MM-dd HH:mm'), 'XP': xp });
    } else if (action === 'extend') {
      xp = DEADLINE_XP.extend;
      var due = Math.max(now, d.due) + 30 * 60000;
      addXp_(who, 'More time: ' + d.task, xp, 'penalty');
      updateRow_('deadlines', r, { 'Due (ms)': due, 'Due': Utilities.formatDate(new Date(due), TZ, 'yyyy-MM-dd HH:mm'), 'Last nag (ms)': now, 'Nags': 0 });
    } else {
      throw new Error('Unknown action.');
    }
    return { state: appState_(who), xp: xp };
  });
}
