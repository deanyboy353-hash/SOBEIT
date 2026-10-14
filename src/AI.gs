/**
 * AI.gs: Claude helping out around the app.
 *
 *   Morning brief   a few calm sentences each morning: what matters today and a first move
 *   Ask             type anything ("I'm overwhelmed", "add milk", "plan my evening");
 *                   Claude answers and can add shopping, chores, to-dos and parked
 *                   notes, or suggest a job to start
 *   Meal ideas      three ideas that fit the calories and protein you have left
 *   Weekly review   a short paragraph at the top of Sunday's summary
 *
 * All of it needs the Claude API key (pasted once in the app). Without it
 * the app works the same, just without these extras.
 */

var BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    brief: { type: 'string', description: '2 or 3 short, warm sentences. No emojis, no lists.' },
    first: { type: 'string', description: 'One small first action, under 8 words' }
  },
  required: ['brief', 'first'],
  additionalProperties: false
};

/** The day at a glance, as text for Claude. */
function dayContext_(who) {
  var q = questsState_(who);
  var g = gameState_(who);
  var lines = ['Date: ' + todayYmd_() + ' (' + DAY_NAMES[dayOfWeek_(todayYmd_())] + ')',
    'Streak: ' + g.streak.count + ' days. XP today ' + g.xpToday + ' of ' + g.goal + '.',
    'Today\'s chores: ' + (q.board.map(function (x) { return x.name + (x.doneToday ? ' (done)' : '') + ' ~' + x.minutes + 'min'; }).join('; ') || 'none')];
  try {
    var hs = healthState_(who);
    if (hs.sleep) lines.push('Last night: ' + hm_(hs.sleep.asleep) + ' asleep (' + hs.sleep.bedtime + '-' + hs.sleep.wake + '), sleep score ' + hs.sleep.score + (hs.readiness ? ', readiness ' + hs.readiness.score + ' (' + hs.readiness.label + ')' : '') + '.');
    if (hs.steps) lines.push('Steps so far: ' + hs.steps + ' of ' + hs.goals.steps + '.');
  } catch (e) { /* health optional */ }
  if (who === 'me') {
    var t = todayState_();
    if (t.gym) lines.push('Gym: ' + t.gym.session + (t.gym.travel ? ', ' + t.gym.travel + ', leave ' + t.gym.leaveAt : '') + (t.gym.weather ? '. Weather: ' + t.gym.weather : '') + (t.gym.done ? ' (done)' : ''));
    else lines.push('Rest day from the gym.');
    if (t.weighDay && !t.weighedToday) lines.push('It is a weigh-in day.');
    try {
      var evs = CalendarApp.getDefaultCalendar().getEvents(atTime_(todayYmd_(), 0), atTime_(addDays_(todayYmd_(), 1), 0))
        .filter(function (e) { return !e.getTag(EVENT_TAG); }).slice(0, 6)
        .map(function (e) { return Utilities.formatDate(e.getStartTime(), TZ, 'HH:mm') + ' ' + e.getTitle(); });
      if (evs.length) lines.push('Calendar: ' + evs.join('; '));
    } catch (e) { /* calendar optional */ }
    var f = foodState_();
    lines.push('Food so far: ' + f.totals.kcal + ' of ' + f.targets.kcal + ' kcal, ' + f.totals.protein + 'g protein (target ' + f.targets.proteinMin + '-' + f.targets.proteinMax + ').');
  }
  return lines.join('\n');
}

var AI_VOICE = 'You are a calm, kind helper inside an app for someone with ADHD (and their partner) in Glenboig, Scotland. ' +
  'Be brief, concrete and encouraging, never preachy or guilt-tripping. Plain British English. No emojis. ';

function makeBrief_(who) {
  var n = names_()[who];
  var res = callClaudeJson_(AI_VOICE + 'Write this person\'s morning brief: what matters today, kept light, and the easiest good first move.',
    'Name: ' + n + '\n' + dayContext_(who), BRIEF_SCHEMA, claudeModel_(), 4000);
  var b = { date: todayYmd_(), brief: String(res.brief || ''), first: String(res.first || '') };
  setProp_('BRIEF_' + who, JSON.stringify(b));
  return b;
}

/** Daily job: briefs for both of you. */
function planBriefs_(ymd, cfg) {
  if (!claudeKey_()) return 'no Claude key';
  PEOPLE.forEach(function (w) { try { makeBrief_(w); } catch (e) { log_('WARN', 'Brief: ' + e); } });
  return 'briefs written';
}

// ---- Ask ----

var ASK_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Your answer to show in the app: short, warm, practical. No emojis.' },
    actions: {
      type: 'array',
      description: 'Things to do in the app because the person asked or clearly wants them. Empty if none.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['add_shopping', 'add_todo', 'add_deadline', 'add_chore', 'park', 'start_job', 'log_food'] },
          text: { type: 'string', description: 'The item, to-do, chore name, note, job, or food eaten. For add_deadline: the task with its time, like "Send the invoice by 3pm"' },
          rhythm: { type: 'string', enum: ['daily', 'weekly', 'biweekly', 'monthly', 'none'], description: 'For add_chore' },
          minutes: { type: 'integer', description: 'For add_chore or start_job: realistic minutes' }
        },
        required: ['type', 'text', 'rhythm', 'minutes'],
        additionalProperties: false
      }
    }
  },
  required: ['reply', 'actions'],
  additionalProperties: false
};

function ask(key, text) {
  var who = who_(key);
  text = String(text || '').trim().slice(0, 1000);
  if (!text) throw new Error('Type something to ask.');
  if (!claudeKey_()) throw new Error('Ask needs the Claude API key. Add it in Settings.');
  var history = JSON.parse(prop_('ASK_' + who) || '[]').slice(-6);
  var convo = history.map(function (h) { return (h.role === 'user' ? 'They said: ' : 'You said: ') + h.text; }).join('\n');
  var res = callClaudeJson_(AI_VOICE +
    'You can act in the app with actions: add_shopping (one per item), add_todo (a one-off task with no time), add_deadline (a task with a time it must be done by: the app will nag until it is done), add_chore (a repeating household job; pick a rhythm), ' +
    'park (a note or worry for later), start_job (suggest one job to start now on a timer), log_food (only for ' + (who === 'me' ? 'food they say they ate' : 'nothing: never use it') + '). ' +
    'Only act when they ask or clearly want it. If they are overwhelmed, pick ONE small thing and offer start_job.',
    'Today:\n' + dayContext_(who) + (convo ? '\n\nEarlier:\n' + convo : '') + '\n\nNow they say: ' + text, ASK_SCHEMA, claudeModel_(), 12000);
  var done = [];
  var startJob = null;
  withLock_(function () {
    (res.actions || []).slice(0, 10).forEach(function (a) {
      var t = String(a.text || '').trim().slice(0, 120);
      if (!t) return;
      if (a.type === 'add_shopping') { addShopping_(who, t); done.push('Added ' + t + ' to the shopping list'); }
      else if (a.type === 'park') { park_(who, t); done.push('Parked: ' + t); }
      else if (a.type === 'add_deadline') {
        try { var dl = addDeadline_(who, t); done.push('Deadline: ' + dl.task + ' by ' + dl.dueText.slice(-5)); } catch (e) { done.push('Couldn\'t set a deadline: ' + e.message); }
      } else if (a.type === 'add_todo') {
        park_(who, 'To do: ' + t);
        if (who === 'me') Tasks.Tasks.insert({ title: t, due: todayYmd_() + 'T00:00:00.000Z' }, TASK_LIST);
        done.push('To-do added: ' + t);
      } else if (a.type === 'add_chore') {
        if (!readChores_().some(function (q) { return q.name.toLowerCase() === t.toLowerCase(); })) {
          addQuestRow_(t, Math.max(1, Number(a.minutes) || 10), a.rhythm === 'none' ? 'as needed' : a.rhythm, 'Anyone');
          var plan = spreadSchedule_(readChores_().filter(function (q) { return q.name === t; }), todayYmd_(), gymDays_());
          applySchedule_(plan);
          delProp_('BOARD');
          done.push('New chore: ' + t + (plan[t] ? ' (' + rhythmLabel(plan[t].every).toLowerCase() + ')' : ''));
        }
      } else if (a.type === 'start_job') {
        var known = readChores_().filter(function (q) { return q.name.toLowerCase() === t.toLowerCase(); })[0];
        startJob = known ? { name: known.name, minutes: known.minutes, steps: known.steps } : { name: t, minutes: Math.max(5, Number(a.minutes) || 10), steps: [] };
      } else if (a.type === 'log_food' && who === 'me') {
        try { var items = estimateFood_(t, readPresets_(), claudeModel_()); addFood_(items, 'ask: ' + t); done.push('Logged ' + items.map(function (i) { return i.name; }).join(', ')); } catch (e) { done.push('Couldn\'t log that food: ' + e.message); }
      }
    });
    history.push({ role: 'user', text: text }, { role: 'assistant', text: String(res.reply || '') });
    setProp_('ASK_' + who, JSON.stringify(history.slice(-8)));
  });
  return { reply: String(res.reply || ''), done: done, startJob: startJob, state: appState_(who) };
}

function clearAsk(key) {
  var who = who_(key);
  delProp_('ASK_' + who);
  return true;
}

/** Morning brief on demand (the app asks for it after loading if 6am didn't make one). */
function getBrief(key) {
  var who = who_(key);
  var b = JSON.parse(prop_('BRIEF_' + who) || 'null');
  if (b && b.date === todayYmd_()) return b;
  if (!claudeKey_()) return null;
  return makeBrief_(who);
}

// ---- Meal ideas ----

var MEAL_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, kcal: { type: 'integer' }, protein_g: { type: 'integer' }, why: { type: 'string', description: 'Under 12 words' } },
        required: ['name', 'kcal', 'protein_g', 'why'],
        additionalProperties: false
      }
    }
  },
  required: ['ideas'],
  additionalProperties: false
};

function mealIdeas(key) {
  requireKey_(key);
  if (!claudeKey_()) throw new Error('Meal ideas need the Claude API key. Add it in Settings.');
  var f = foodState_();
  var left = Math.max(0, f.targets.kcal - f.totals.kcal), pLeft = Math.max(0, f.targets.proteinMin - f.totals.protein);
  var res = callClaudeJson_(AI_VOICE + 'Suggest exactly 3 easy UK meals or snacks that fit what is left today. Prefer high protein, simple, cheap, quick. Use their saved foods when they fit.',
    'Left today: ' + left + ' kcal, ' + pLeft + 'g protein still to go. Time: ' + now_('HH:mm') + '.\nSaved foods: ' +
    f.presets.map(function (p) { return p.name + ' (' + p.kcal + ' kcal, ' + p.protein + 'g)'; }).join('; '), MEAL_SCHEMA, claudeModel_(), 4000);
  return (res.ideas || []).slice(0, 3).map(function (i) { return { name: String(i.name), kcal: Math.round(i.kcal), protein: Math.round(i.protein_g), why: String(i.why) }; });
}

function logIdea(key, idea) {
  requireKey_(key);
  return withLock_(function () {
    undoable_('me', String(idea.name).slice(0, 40), function () { addFood_([{ name: String(idea.name).slice(0, 80), kcal: Math.max(0, Math.round(Number(idea.kcal) || 0)), protein: Math.max(0, Math.round(Number(idea.protein) || 0)) }], 'idea'); });
    return { state: foodState_(), added: [idea], undo: undoInfo_('me') };
  });
}

// ---- Weekly review ----

function weeklyReviewAI_(summaryText) {
  if (!claudeKey_()) return '';
  try {
    var res = callClaudeJson_(AI_VOICE + 'Write a short weekly review (3-4 sentences) for this couple from their numbers: notice real wins, be honest but kind about what slipped, and end with one focus for next week.',
      summaryText, { type: 'object', properties: { review: { type: 'string' } }, required: ['review'], additionalProperties: false }, claudeModel_(), 6000);
    return String(res.review || '');
  } catch (e) {
    log_('WARN', 'Weekly review: ' + e);
    return '';
  }
}
