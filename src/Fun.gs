/**
 * Fun.gs: the extras that make it a game for two.
 *
 *   Names and eras    nicknames, a team name, and level titles (a DJ career
 *                     ladder, or album eras) instead of plain numbers
 *   Daily challenges  three small goals each a day; each one done is bonus
 *                     XP, all three opens a chest
 *   Double XP         a surprise half hour every day, announced by notification
 *   Reminders         Duolingo-style evening nudges when a streak is at risk
 *   Us                a private, playful counter for the two of you, with
 *                     winks and "tonight?"
 *   Wrapped           your week as a story
 *
 * The 10-minute trigger (pollTasks) calls heartbeat_() for the timed parts.
 */

var ERA_TITLES = {
  dj: ['Bedroom DJ', 'Warm-up set', 'Back to back', 'Peak time', 'Main room', 'Headliner', 'Closing set', 'Festival main stage', 'Residency', 'Legend'],
  glam: ['Fresh face', 'Lash apprentice', 'Rhinestone rookie', 'Spotlight seeker', 'Sequin specialist', 'Runway regular', 'Headline act', 'Crown in sight', 'Main stage', 'Icon'],
  city: ['New in town', 'Local face', 'Block regular', 'Night owl', 'Neighbourhood name', 'Big deal', 'City fixture', 'Skyline', 'Landmark', 'Legend of the coast']
};

function settingOn_(name) {
  var v = readConfig_().settings[name];
  return v === undefined || v === '' || v === true || /^(true|yes|on|1)$/i.test(String(v).trim());
}

/** Extras can be paused (the tests use this so XP totals stay predictable). */
function extrasOn_(name) {
  return prop_('EXTRAS_OFF') !== '1' && settingOn_(name);
}

function nicks_() {
  var s = readConfig_().settings, n = names_();
  var me = String(s['Your nickname'] || '').trim() || n.me;
  var partner = String(s['Partner nickname'] || '').trim() || n.partner;
  if (solo_()) return { me: me, partner: '', team: me };
  return { me: me, partner: partner, team: String(s['Team name'] || '').trim() || partner + ' & ' + me };
}

function eraTitle_(who, level) {
  var style = String(readConfig_().settings[who === 'me' ? 'Your level titles' : 'Partner level titles'] || '').trim().toLowerCase();
  // older settings: 'Ye' became Glam, 'GTA' became City (original title sets)
  var list = ERA_TITLES[style === 'ye' || style === 'kanye' || style === 'glam' ? 'glam' : style === 'dj' ? 'dj' : style === 'gta' || style === 'city' ? 'city' : ''];
  if (!list) return '';
  return level <= list.length ? list[level - 1] : list[list.length - 1] + ' ' + (level - list.length + 1);
}

function minutesNow_() {
  return parseClock(now_('HH:mm'));
}

function hhmm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  return String(v || '');
}

// ---------- double XP ----------

/** Today's surprise half hour, somewhere between noon and 9pm. Same for both of you. */
function boostWindow_(ymd) {
  var r = seededRandom('boost' + ymd);
  var start = 12 * 60 + Math.floor(r() * (8.5 * 60 / 5)) * 5;
  return { start: start, end: start + 30, from: formatClock(start), to: formatClock(start + 30) };
}

function boostActive_() {
  if (!extrasOn_('Double XP')) return false;
  var w = boostWindow_(todayYmd_()), m = minutesNow_();
  return m >= w.start && m < w.end;
}

// ---------- daily challenges ----------

var CHALLENGES = [
  ['chores2', 'Finish 2 chores', function (s) { return s.chores >= 2; }],
  ['chores3', 'Finish 3 chores', function (s) { return s.chores >= 3; }],
  ['word', 'Solve today\'s word', function (s) { return s.wordWon; }],
  ['games2', 'Play 2 of the daily games', function (s) { return s.games >= 2; }],
  ['tempo', 'Lock in a Tempo score', function (s) { return s.tempo; }],
  ['routine', 'Finish a routine', function (s) { return (s.kinds.routine || 0) >= 1; }],
  ['early', 'Earn 10 XP before noon', function (s) { return s.beforeNoon >= 10; }],
  ['create', 'Make something for 15 minutes', function (s) { return (s.kinds.create || 0) >= 1; }],
  ['water', 'Hit your water goal', function (s) { return (s.kinds.water || 0) >= 1; }],
  ['timer', 'Do a job on the timer', function (s) { return s.timers >= 1; }],
  ['goal8', 'Hit your daily goal before 8pm', function (s) { return s.goalBy8; }]
];
var CHALLENGE_XP = 5, CHEST_XP = 15;

function todaysChallenges_(who, ymd) {
  var r = seededRandom('challenge' + who + ymd), pool = CHALLENGES.slice(), out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

function challengeStats_(who, ymd) {
  var rows = xpRows_().filter(function (r) { return r.who === who && r.date === ymd && r.xp > 0; });
  var kinds = {}, beforeNoon = 0, by8 = 0;
  rows.forEach(function (r) {
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    if (r.time && r.time < '12:00') beforeNoon += r.xp;
    if (r.time && r.time < '20:00') by8 += r.xp;
  });
  var g = gamesDay_(ymd), w = g.word[who], t = g.target[who], rc = g.recall[who], tp = (g.tempo || {})[who], mx = (g.mix || {})[who];
  var timers = rowsBetween_('choresLog', ymd, ymd).filter(function (r) { return r['Who'] === who && r['Result'] === 'Done'; }).length;
  return {
    kinds: kinds, beforeNoon: beforeNoon, goalBy8: by8 >= dailyGoal_(), timers: timers,
    chores: (kinds.quest || 0) + (kinds.cover || 0),
    wordWon: !!(w && w.won), tempo: !!(tp && tp.final),
    games: [w && w.guesses.length, t && t.tries, rc && rc.plays, tp && tp.tries, mx && mx.tries].filter(Boolean).length
  };
}

function challengeLog_(who, ymd) {
  var c = JSON.parse(prop_('CHAL_' + who) || 'null');
  return c && c.date === ymd ? c : { date: ymd, done: [], chest: false };
}

/** Award any challenge you've just completed. Called after every XP award. */
function checkChallenges_(who) {
  if (!extrasOn_('Daily challenges')) return;
  var ymd = todayYmd_(), log = challengeLog_(who, ymd), stats = null, changed = false;
  todaysChallenges_(who, ymd).forEach(function (c) {
    if (log.done.indexOf(c[0]) !== -1) return;
    stats = stats || challengeStats_(who, ymd);
    if (!c[2](stats)) return;
    log.done.push(c[0]);
    changed = true;
    addXp_(who, 'Challenge: ' + c[1], CHALLENGE_XP, 'bonus');
  });
  if (changed && log.done.length >= 3 && !log.chest) {
    log.chest = true;
    addXp_(who, 'Opened today\'s chest', CHEST_XP, 'bonus');
  }
  if (changed) setProp_('CHAL_' + who, JSON.stringify(log));
}

function challengesState_(who) {
  if (!extrasOn_('Daily challenges')) return null;
  var ymd = todayYmd_(), log = challengeLog_(who, ymd);
  return {
    list: todaysChallenges_(who, ymd).map(function (c) { return { id: c[0], text: c[1], done: log.done.indexOf(c[0]) !== -1, xp: CHALLENGE_XP }; }),
    chest: log.chest, chestXp: CHEST_XP
  };
}

// ---------- reminders (every 10 minutes) ----------

var STREAK_LINES = [
  'Your {n}-day streak ends at midnight. {x} XP saves it.',
  'Five minutes now keeps your {n}-day streak alive.',
  'Your streak is looking at you. {x} XP to go.'
];
var PUSHY_LINES = [
  '{x} XP to go today. One chore does it.',
  'Your {n}-day streak is not going to save itself.',
  'Still {x} XP short. Pick the smallest job.',
  'Quick one: {x} XP and the day counts.',
  'The streak misses you. {x} XP.',
  'Ten minutes. That is all it takes. {x} XP to go.',
  '{other} has {ox} XP today. You have {mx}.',
  'Your {n}-day streak trusted you.',
  '{char} didn\'t get where they are by sitting on the sofa. {x} XP.'
];
var LATE_LINES = [
  'These reminders don\'t seem to be working. One small job and the streak lives.',
  'Last call for your {n}-day streak. Dishes count.',
  'It\'s getting late and your streak is getting nervous. {x} XP.'
];

/** Inside someone's quiet hours (from setup)? [start, end] in minutes; may wrap midnight. */
function quietFor_(who, m) {
  if (!setupOn_() && !prop_('SETUP_' + who)) return false;
  var q = profile_(who).quiet; if (!q || q.length !== 2 || q[0] === q[1]) return false;
  return q[0] < q[1] ? m >= q[0] && m < q[1] : m >= q[0] || m < q[1];
}

function heartbeat_() {
  var ymd = todayYmd_(), m = minutesNow_();
  var sent = JSON.parse(prop_('REMINDED') || 'null');
  if (!sent || sent.date !== ymd) sent = { date: ymd, me: [], partner: [] };
  var before = JSON.stringify(sent);
  try { alertsHeartbeat_(ymd, m, sent); } catch (e) { log_('WARN', 'Alerts: ' + e); }
  if ((!extrasOn_('Reminders') && !extrasOn_('Double XP')) || m < 9 * 60 || m >= 22 * 60 + 30) { if (JSON.stringify(sent) !== before) setProp_('REMINDED', JSON.stringify(sent)); return; }
  var nk = nicks_(), goal = dailyGoal_(), r = seededRandom('lines' + ymd);
  function once(who, id, title, body, tab) {
    if (sent[who].indexOf(id) !== -1 || quietFor_(who, m)) return;
    sent[who].push(id);
    push_(who, title, body, tab);
  }
  if (setupOn_()) PEOPLE.forEach(function (who) {
    // the day's list, once, half an hour after you usually wake
    var pf = profile_(who), plan = cpToday_()[who];
    if (m >= (pf.wake || 450) + 30 && plan.minimum + plan.bonus.length) once(who, 'list', plan.minimum ? 'Today: ' + plan.minimum + ' to win the day' : 'Today: nothing you have to do',
      (plan.must.length ? plan.must.join(', ') : 'Just the bonus jobs, if you feel like it') + (plan.bonus.length ? '. Bonus: ' + plan.bonus.slice(0, 3).join(', ') + (plan.bonus.length > 3 ? '…' : '') : '') + '.', 'chores');
  });
  var w = boostWindow_(ymd);
  if (extrasOn_('Double XP') && m >= w.start && m < w.end - 5) {
    PEOPLE.forEach(function (who) { once(who, 'boost', 'Double XP for the next half hour', 'Everything you do until ' + w.to + ' counts twice.', 'home'); });
  }
  if (extrasOn_('Reminders')) {
    var g = gamesDay_(ymd);
    PEOPLE.forEach(function (who) {
      var other = who === 'me' ? 'partner' : 'me';
      var xp = xpOn_(who, ymd), st = streakNow_(who, ymd, goal), behind = !st.todayDone, gentle = setupOn_() && profile_(who).reminder !== 'direct';
      var oxp = xpOn_(other, ymd), cname = nicks_()[who] || 'You';
      var fill = function (s) { return s.replace('{n}', st.count).replace('{x}', Math.max(0, goal - xp)).replace('{other}', nk[other]).replace('{ox}', oxp).replace('{mx}', xp).replace('{char}', cname); };
      var calm = setupOn_() && profile_(who).motivation === 'calm';   // "just a calm list": the morning list only, no streak or race nags
      var pushy = nagLevel_(who) === 'aggressive' && !gentle && !calm;
      var small = setupOn_() ? (function () { var pl = cpToday_()[who]; return 'Your ' + (pl.minimum === 1 ? 'one small job' : pl.minimum + ' small jobs') + ' and today counts' + (pl.must.length ? ': ' + pl.must.join(', ') : '') + '.'; })() : 'Two small jobs and today counts.';
      if (!pushy && !calm && m >= 19 * 60 + 30 && behind) once(who, 'streak', st.count ? 'Keep your streak' : 'Today still counts', gentle ? small : fill(st.count ? STREAK_LINES[Math.floor(r() * STREAK_LINES.length)] : small), 'chores');
      if (!pushy && !gentle && !calm && m >= 21 * 60 + 30 && behind && st.count) once(who, 'late', 'Streak alert', fill(LATE_LINES[Math.floor(r() * LATE_LINES.length)]), 'chores');
      // Duolingo level: from 6pm, every half hour until today's goal is hit.
      if (pushy && m >= 18 * 60 && behind) {
        var slot = Math.floor(m / 30), pool = PUSHY_LINES.filter(function (l) { return (st.count || l.indexOf('{n}') === -1) && (oxp > xp || l.indexOf('{ox}') === -1); });
        if (sent[who].indexOf('streak-' + slot) === -1 && !quietFor_(who, m)) {
          sent[who].push('streak-' + slot);
          push_(who, st.count ? 'Your streak needs you' : 'Today still counts', fill(pool[slot % pool.length]), 'chores', false, { persist: true, tag: 'streak' });
        }
      }
      if (!calm && m >= 17 * 60 && xpOn_(other, ymd) >= xp + 20) once(who, 'ahead', nk[other] + ' is ahead today', nk[other] + ' has ' + (xpOn_(other, ymd) - xp) + ' more XP than you today. Just saying.', 'home');
      var theirs = g.word[other], mine = g.word[who];
      if (m >= 20 * 60 && theirs && theirs.done && !(mine && mine.done)) once(who, 'word', 'Your move', nk[other] + (theirs.won ? ' got the word in ' + theirs.guesses.length + '.' : ' missed today\'s word.') + ' Can you do better?', 'play');
    });
  }
  if (JSON.stringify(sent) !== before) setProp_('REMINDED', JSON.stringify(sent));
}

// ---------- Us ----------

var US_XP = 20;

function usDates_() {
  return xpRows_().filter(function (r) { return r.who === 'me' && r.kind === 'spice'; }).map(function (r) { return r.date; });
}

function mondayOf_(ymd) {
  return addDays_(ymd, -((dayOfWeek_(ymd) + 6) % 7));
}

function usState_(who) {
  var today = todayYmd_(), dates = usDates_(), monday = mondayOf_(today);
  var byWeek = {};
  dates.forEach(function (d) { var k = mondayOf_(d); byWeek[k] = (byWeek[k] || 0) + 1; });
  var heat = 0, wk = byWeek[monday] ? monday : addDays_(monday, -7);
  while (byWeek[wk]) { heat++; wk = addDays_(wk, -7); }
  var bestWeek = Object.keys(byWeek).reduce(function (m, k) { return Math.max(m, byWeek[k]); }, 0);
  var weekend = dates.some(function (d) { return dayOfWeek_(d) === 6 && dates.indexOf(addDays_(d, 1)) !== -1; });
  var ask = JSON.parse(prop_('US_ASK') || 'null');
  if (ask && new Date().getTime() - ask.at > 12 * 3600000) ask = null;
  return {
    week: byWeek[monday] || 0,
    month: dates.filter(function (d) { return d.slice(0, 7) === today.slice(0, 7); }).length,
    total: dates.length, heat: heat, bestWeek: bestWeek, last: dates.length ? dates[dates.length - 1] : '',
    ask: ask,
    badges: [
      { name: 'First flame', desc: 'The first one', earned: dates.length >= 1 },
      { name: 'Hat trick', desc: 'Three in one week', earned: bestWeek >= 3 },
      { name: 'Weekend warriors', desc: 'Saturday and Sunday', earned: weekend },
      { name: 'Heatwave', desc: 'Four weeks running', earned: heat >= 4 },
      { name: 'Half century', desc: '50 in total', earned: dates.length >= 50 },
      { name: 'Triple digits', desc: '100 in total', earned: dates.length >= 100 }
    ]
  };
}

/** One tap from either of you: XP for both. */
function logUs(key) {
  var who = who_(key);
  return withLock_(function () {
    var last = Number(prop_('US_LAST') || 0), now = new Date().getTime();
    if (now - last < 2 * 3600000) throw new Error('Already counted. Hydrate.');
    setProp_('US_LAST', String(now));
    PEOPLE.forEach(function (p) { addXp_(p, 'Quality time', US_XP, 'spice'); });
    var other = who === 'me' ? 'partner' : 'me';
    push_(other, nicks_()[who] + ' logged it', '+' + US_XP + ' XP each. Nice work, team.', 'home');
    return appState_(who);
  });
}

/** A wink, or "tonight?" (which the other answers with one tap). */
function sendWink(key, kind) {
  var who = who_(key), nk = nicks_(), other = who === 'me' ? 'partner' : 'me';
  return withLock_(function () {
    if (kind === 'tonight') {
      setProp_('US_ASK', JSON.stringify({ from: who, at: new Date().getTime(), answer: '' }));
      push_(other, nk[who] + ': tonight?', 'Answer in the app.', 'home', true);
    } else {
      push_(other, nk[who] + ' sent you a wink', 'Just so you know.', 'home', true);
    }
    return appState_(who);
  });
}

function answerTonight(key, yes) {
  var who = who_(key), nk = nicks_();
  return withLock_(function () {
    var ask = JSON.parse(prop_('US_ASK') || 'null');
    if (!ask || ask.from === who) throw new Error('Nothing to answer.');
    ask.answer = yes ? 'yes' : 'rain check';
    ask.answeredAt = new Date().getTime();
    setProp_('US_ASK', JSON.stringify(ask));
    push_(ask.from, yes ? nk[who] + ' said yes' : nk[who] + ': rain check', yes ? 'See you later.' : 'Tomorrow, then.', 'home', true);
    return appState_(who);
  });
}

// ---------- word stakes ----------

function setStake(key, text) {
  var who = who_(key);
  text = String(text || '').trim().slice(0, 60);
  if (!text) throw new Error('Pick the stakes.');
  return withLock_(function () {
    var today = todayYmd_(), g = gamesDay_(today);
    if ((g.word.me && g.word.me.done) || (g.word.partner && g.word.partner.done)) throw new Error('Too late: someone has finished the word.');
    g.stake = { text: text, by: who };
    saveGamesDay_(today, g);
    push_(who === 'me' ? 'partner' : 'me', nicks_()[who] + ' set today\'s stakes', text + '. Play the word to settle it.', 'play');
    return gamesState_(who);
  });
}

// ---------- Wrapped ----------

/** The last seven days as a story. */
function getWrapped(key) {
  var who = who_(key), other = who === 'me' ? 'partner' : 'me';
  var to = todayYmd_(), from = addDays_(to, -6), nk = nicks_();
  var rows = xpRows_().filter(function (r) { return r.date >= from && r.date <= to; });
  function person(p) {
    var mine = rows.filter(function (r) { return r.who === p && r.xp > 0; });
    var count = {};
    mine.filter(function (r) { return r.kind === 'quest'; }).forEach(function (r) { count[r.what] = (count[r.what] || 0) + 1; });
    var top = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0] || '';
    var days = {};
    mine.forEach(function (r) { days[r.date] = (days[r.date] || 0) + r.xp; });
    var bestDay = Object.keys(days).sort(function (a, b) { return days[b] - days[a]; })[0] || '';
    return {
      name: nk[p], xp: mine.reduce(function (s, r) { return s + r.xp; }, 0),
      chores: mine.filter(function (r) { return r.kind === 'quest' || r.kind === 'cover'; }).length,
      top: top, topCount: count[top] || 0, bestDay: bestDay, bestDayXp: days[bestDay] || 0,
      gym: mine.filter(function (r) { return r.kind === 'gym'; }).length, prs: mine.filter(function (r) { return r.kind === 'pr'; }).length,
      create: mine.filter(function (r) { return r.kind === 'create'; }).length,
      challenges: mine.filter(function (r) { return r.kind === 'bonus' && /^Challenge/.test(r.what); }).length
    };
  }
  var games = rowsBetween_('games', from, to), wins = { me: 0, partner: 0 }, byDay = {}, bestWord = { me: 7, partner: 7 };
  games.forEach(function (r) {
    var k = r['Date'] + '|' + r['Game'];
    (byDay[k] = byDay[k] || {})[r['Who']] = Number(r['Score']);
    if (r['Game'] === 'word') bestWord[r['Who']] = Math.min(bestWord[r['Who']], Number(r['Score']));
  });
  Object.keys(byDay).forEach(function (k) {
    var d = byDay[k], low = k.split('|')[1] === 'word';
    if (d.me === undefined || d.partner === undefined || d.me === d.partner) return;
    wins[(d.me < d.partner) === low ? 'me' : 'partner']++;
  });
  var us = usDates_().filter(function (d) { return d >= from && d <= to; }).length;
  return {
    from: from, to: to, team: nk.team, you: person(who), them: person(other),
    games: { you: wins[who], them: wins[other], bestWord: bestWord[who] <= 6 ? bestWord[who] : null, theirBestWord: bestWord[other] <= 6 ? bestWord[other] : null },
    team: { name: nk.team, streak: streakNow_('team', to, dailyGoal_()).count, us: us }
  };
}

/** Everything fun the app shows for one person. */
function funState_(who, g) {
  g = g || gameState_(who);
  var nk = nicks_(), w = boostWindow_(todayYmd_());
  var since = xpRows_().length ? xpRows_()[0].date : todayYmd_();
  return {
    nick: nk[who], otherNick: nk[who === 'me' ? 'partner' : 'me'], team: nk.team,
    era: eraTitle_(who, g.level.level), nextEra: eraTitle_(who, g.level.level + 1),
    boost: extrasOn_('Double XP') ? { from: w.from, to: w.to, startsAt: atTime_(todayYmd_(), w.start).getTime(), endsAt: atTime_(todayYmd_(), w.end).getTime() } : null,
    challenges: challengesState_(who),
    us: usState_(who),
    day: Math.max(1, daysBetween_(since, todayYmd_()) + 1),
    appBase: appBaseUrl_(),
    prefs: prefs_(who),
    chars: { me: prefs_('me').char, partner: prefs_('partner').char },
    looks: { me: prefs_('me').look, partner: prefs_('partner').look },
    titles: String(readConfig_().settings[who === 'me' ? 'Your level titles' : 'Partner level titles'] || 'None')
  };
}

function daysBetween_(a, b) {
  return ymdToDays(b) - ymdToDays(a);
}

// ---------- customisation ----------

var HOME_BLOCKS = ['deadlines', 'work', 'wardrobe', 'brief', 'ask', 'ring', 'pet', 'challenges', 'next', 'whatnow', 'routine', 'gym', 'chores', 'tiles', 'make', 'us', 'feed'];
var PREF_DEFAULTS = { char: '', accent: '', text: 'normal', sound: false, haptics: true, confetti: true, motion: true, home: [], nag: '', look: {} };
// the style studio: the first choice is the default
var STYLE_CHOICES = { bg: ['live', 'lasers', 'grid', 'stars', 'plain'], cards: ['soft', 'glass', 'neon', 'outline', 'flat'], font: ['default', 'rounded', 'mono', 'serif', 'condensed'], corners: ['round', 'sharp', 'pill'] };
var LOOK_KEYS = { hair: 1, hc: 1, top: 1, tc: 1, head: 1, eyes: 1, face: 1, skin: 1, ear: 1 };

function prefs_(who) {
  return Object.assign({}, PREF_DEFAULTS, JSON.parse(prop_('PREFS_' + who) || '{}'));
}

/** Save your look and feel. Names and level titles live in the Config tab, so they're written there. */
function setPrefs(key, p) {
  var who = who_(key);
  p = p || {};
  return withLock_(function () {
    var cur = prefs_(who);
    if (p.char !== undefined) cur.char = /^(sa|vc)-[a-z]+$/.test(String(p.char)) ? String(p.char) : '';
    if (p.char !== undefined && p.look === undefined) cur.look = {};
    if (p.accent !== undefined) cur.accent = ['', 'pink', 'green', 'teal', 'orange', 'blue', 'lime', 'red', 'gold'].indexOf(p.accent) !== -1 ? p.accent : '';
    Object.keys(STYLE_CHOICES).forEach(function (k) { if (p[k] !== undefined) cur[k] = STYLE_CHOICES[k].indexOf(p[k]) !== -1 ? p[k] : STYLE_CHOICES[k][0]; });
    if (p.text !== undefined) cur.text = p.text === 'large' ? 'large' : 'normal';
    if (p.nag !== undefined) cur.nag = NAG_LEVELS[p.nag] ? p.nag : '';
    if (Array.isArray(p.workKit)) cur.workKit = p.workKit.map(function (x) { return String(x || '').trim().slice(0, 60); }).filter(Boolean).slice(0, 12);
    if (p.workStart !== undefined || p.workEnd !== undefined) {
      var ws = Math.round(Number(p.workStart !== undefined ? p.workStart : workHours_(who).start)), we = Math.round(Number(p.workEnd !== undefined ? p.workEnd : workHours_(who).end));
      if (!(ws >= 0 && we <= 1440 && we - ws >= 60)) throw new Error('Your work day needs to be at least an hour long.');
      cur.workStart = ws; cur.workEnd = we;
    }
    if (p.look && typeof p.look === 'object') {
      cur.look = {};
      Object.keys(p.look).forEach(function (k) { var v = String(p.look[k]); if (LOOK_KEYS[k] && (/^[a-z]{1,12}$/.test(v) || /^#[0-9a-f]{6}$/i.test(v))) cur.look[k] = v; });
    }
    ['sound', 'haptics', 'confetti', 'motion'].forEach(function (k) { if (p[k] !== undefined) cur[k] = !!p[k]; });
    if (p.waterGoal !== undefined) { var wg = Math.round(Number(p.waterGoal)); if (!(wg >= 0 && wg <= 20)) throw new Error('Pick a water goal from 0 to 20 glasses.'); cur.waterGoal = wg; }
    if (Array.isArray(p.home)) {
      cur.home = p.home.filter(function (x) { return x && HOME_BLOCKS.indexOf(x.id) !== -1; }).map(function (x) { return { id: x.id, hide: !!x.hide }; });
    }
    setProp_('PREFS_' + who, JSON.stringify(cur));
    var mine = who === 'me';
    if (p.nick !== undefined && String(p.nick).trim()) setSetting_(mine ? 'Your nickname' : 'Partner nickname', String(p.nick).trim().slice(0, 24));
    if (p.team !== undefined && String(p.team).trim()) setSetting_('Team name', String(p.team).trim().slice(0, 40));
    if (p.titles !== undefined) setSetting_(mine ? 'Your level titles' : 'Partner level titles', ({ dj: 'DJ', glam: 'Glam', city: 'City' })[p.titles] || 'None');
    return appState_(who);
  });
}
