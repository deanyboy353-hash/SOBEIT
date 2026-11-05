/**
 * Game.gs: the Duolingo layer. XP for everything you do, a daily XP goal,
 * streaks, lazy days, levels and a shared feed with high-fives. Everything
 * is stored in the XP log tab (one row per award) plus a few small Script
 * Properties.
 *
 * Missing your minimum resets the streak and costs a little XP and cash
 * (never below zero, never a level or an item). Win the next day and you
 * get it back. Two lazy days a week protect the streak instead.
 */

var PEOPLE = ['me', 'partner'];
var LAZY_PER_WEEK = 2;      // lazy days each, Monday to Sunday
var MISS_SHARE = 0.1;       // a missed day costs 10% of that day's potential XP...
var MISS_CAP = 10;          // ...but never more than 10 XP (and £10 a point)

var xpCache_ = null;

function xpRows_() {
  if (!xpCache_) {
    xpCache_ = rowsBetween_('xp', '0000', '9999').map(function (r) {
      return { date: String(r['Date']), time: hhmm_(r['Time']), who: String(r['Who']), what: String(r['What']), xp: Number(r['XP']) || 0, kind: String(r['Kind']) };
    });
  }
  return xpCache_;
}

function addXp_(who, what, xp, kind, cash) {
  appendRow_('xp', { 'Date': todayYmd_(), 'Time': now_('HH:mm'), 'Who': who, 'What': what, 'XP': xp, 'Kind': kind });
  xpCache_ = null;
  if (kind !== 'spice' && kind !== 'penalty') addFeed_(who, what + (xp > 0 ? ' · +' + xp + ' XP' : ''), kind);
  if (xp > 0) addCash_(who, what, cash === undefined ? xp * CASH_PER_XP : cash, 'earned');
  if (xp > 0 && kind !== 'comeback') comebackCheck_(who);
  return xp;
}

function xpOn_(who, ymd) {
  return xpRows_().reduce(function (s, r) { return r.who === who && r.date === ymd && (r.xp > 0 || r.kind === 'penalty') ? s + r.xp : s; }, 0);
}

function xpBetween_(who, from, to) {
  return xpRows_().reduce(function (s, r) { return r.who === who && r.date >= from && r.date <= to && (r.xp > 0 || r.kind === 'penalty') ? s + r.xp : s; }, 0);
}

/** Everything earned, minus penalties (never below zero). Old spending rows (negative, not penalties) don't count. */
function xpTotal_(who) {
  return Math.max(0, xpRows_().reduce(function (s, r) { return r.who === who && (r.xp > 0 || r.kind === 'penalty') ? s + r.xp : s; }, 0));
}

function countKind_(who, kind) {
  return xpRows_().filter(function (r) { return r.who === who && r.kind === kind && r.xp >= 0; }).length;
}

function dailyGoal_(settings) {
  return num_(settings || readConfig_().settings, 'Daily XP goal', 30);
}

// ---------- streaks ----------

function streakState_(id) {
  var st = JSON.parse(PROPS.getProperty('STREAK_' + id) || 'null') || { count: 0, best: 0, through: addDays_(todayYmd_(), -1) };
  delete st.freezes; delete st.frozeOn;   // streak freezes were replaced by lazy days
  return st;
}
function saveStreak_(id, st) { PROPS.setProperty('STREAK_' + id, JSON.stringify(st)); }

/**
 * Run each morning: settle every day up to yesterday. Won: the streak grows. A lazy day: neither won nor
 * lost. Missed: the streak starts again and a little XP and cash go (the comeback bonus pays it back).
 * "team" counts days you both won; a day you were both won-or-lazy (with a lazy one) leaves it as it was.
 */
function updateStreaks_(todayYmd) {
  var goal = dailyGoal_();
  var yesterday = addDays_(todayYmd, -1);
  var plan = JSON.parse(prop_('CPDAY') || 'null');   // still yesterday's plan: the quests job replans after this
  PEOPLE.concat(['team']).forEach(function (id) {
    if (id === 'partner' && solo_()) return;
    var st = streakState_(id);
    var d = st.through;
    while (d < yesterday) {
      d = addDays_(d, 1);
      var day = dayResult_(id, d, goal);
      if (day === 'won') {
        st.count++;
        if (id === 'team') st.total = (st.total === undefined ? st.best : st.total) + 1;   // the pet's lifetime days: never goes down
      } else if (day === 'missed') {
        if (st.count > 0) { st.lostOn = d; st.lostCount = st.count; }
        st.count = 0;
        if (id !== 'team') st.penalty = missPenalty_(id, d, plan && plan.date === d ? plan[id] : null, goal);
      }
      st.best = Math.max(st.best, st.count);
    }
    st.through = yesterday;
    saveStreak_(id, st);
  });
}

/** 'won', 'lazy' or 'missed' for one person (or the team) on a past day. */
function dayResult_(id, ymd, goal) {
  if (id === 'team') {
    var a = dayResult_('me', ymd, goal), b = solo_() ? 'won' : dayResult_('partner', ymd, goal);
    return a === 'missed' || b === 'missed' ? 'missed' : a === 'won' && b === 'won' ? 'won' : 'lazy';
  }
  if (lazyOn_(id, ymd)) return 'lazy';
  return dayWon_(id, ymd, goal) ? 'won' : 'missed';
}

/** A missed day: 10% of what the day could have earned (its planned jobs, or the XP goal), at most 10 XP. Never below zero, never a level. */
function missPenalty_(who, ymd, plan, goal) {
  var potential = goal;
  if (plan) {
    var xpOf = {}; readChores_().forEach(function (q) { xpOf[q.name] = Number(q.xp) || 0; });
    potential = (plan.must || []).concat(plan.bonus || []).reduce(function (s, n) { return s + (xpOf[n] || 0); }, 0) || goal;
  }
  var lv = levelFor(xpTotal_(who));
  var xp = Math.min(MISS_CAP, Math.max(1, Math.round(potential * MISS_SHARE)), lv.into);
  var cash = Math.min(xp * CASH_PER_XP, Math.max(0, cashBreakdown_(who).total));
  if (xp > 0) { appendRow_('xp', { 'Date': ymd, 'Time': now_('HH:mm'), 'Who': who, 'What': 'Missed the minimum', 'XP': -xp, 'Kind': 'penalty' }); xpCache_ = null; }
  if (cash > 0) addCash_(who, 'Missed the minimum (' + ymd + ')', -cash, 'penalty');
  return { date: ymd, xp: xp, cash: cash, back: false };
}

/** Win the day after a missed one and the missed day's XP and cash come back. */
function comebackCheck_(who) {
  var st = streakState_(who), p = st.penalty, today = todayYmd_();
  if (!p || p.back || p.date !== addDays_(today, -1) || !(p.xp || p.cash)) return;
  if (lazyOn_(who, today) || !dayWon_(who, today, dailyGoal_())) return;
  p.back = true; saveStreak_(who, st);
  if (p.xp) addXp_(who, 'Comeback: won back yesterday', p.xp, 'comeback', p.cash);
  else addCash_(who, 'Comeback: won back yesterday', p.cash, 'earned');
}

// ---------- lazy days ----------

function lazyDays_(who) { return JSON.parse(prop_('LAZY_' + who) || '[]'); }
function lazyOn_(who, ymd) { return lazyDays_(who).indexOf(ymd) !== -1; }
/** Lazy days left in the week (Monday to Sunday) that holds ymd. */
function lazyLeft_(who, ymd) {
  var mon = mondayOf_(ymd), sun = addDays_(mon, 6);
  return Math.max(0, LAZY_PER_WEEK - lazyDays_(who).filter(function (d) { return d >= mon && d <= sun; }).length);
}
/** Yesterday can still be made a lazy day until noon, if it was missed and that week has one left. */
function lazyOfferYesterday_(who, today) {
  var y = addDays_(today, -1), st = streakState_(who);
  if (minutesNow_() >= 12 * 60 || lazyOn_(who, y) || lazyLeft_(who, y) < 1) return null;
  if (st.through < y || dayResult_(who, y, dailyGoal_()) !== 'missed') return null;
  var p = st.penalty && st.penalty.date === y ? st.penalty : null;
  return { date: y, xp: p ? p.xp : 0, cash: p ? p.cash : 0, streak: st.lostOn === y ? st.lostCount : 0 };
}

/**
 * Take a lazy day: 'today', 'yesterday' (until noon, when yesterday was missed) or 'undo' (today's, back
 * into the week). Yesterday's comes with its streak back and the missed-day cost refunded.
 */
function lazyDay(key, which) {
  var who = who_(key);
  return withLock_(function () {
    var today = todayYmd_(), list = lazyDays_(who), y = addDays_(today, -1);
    if (which === 'undo') {
      if (!lazyOn_(who, today)) throw new Error('Today isn\'t a lazy day.');
      setProp_('LAZY_' + who, JSON.stringify(list.filter(function (d) { return d !== today; })));
      return appState_(who);
    }
    var ymd = which === 'yesterday' ? y : today;
    if (lazyOn_(who, ymd)) throw new Error(which === 'yesterday' ? 'Yesterday was already a lazy day.' : 'Today is already a lazy day.');
    if (lazyLeft_(who, ymd) < 1) throw new Error('No lazy days left this week. They reset on Monday.');
    if (which === 'yesterday' && !lazyOfferYesterday_(who, today)) throw new Error('Too late for yesterday. It can be changed until noon.');
    list.push(ymd);
    setProp_('LAZY_' + who, JSON.stringify(list.filter(function (d) { return d >= addDays_(today, -35); })));
    if (which === 'yesterday') {
      [who, 'team'].forEach(function (id) {
        var st = streakState_(id);
        if (st.lostOn === y && dayResult_(id, y, dailyGoal_()) !== 'missed') { st.count = st.lostCount; st.best = Math.max(st.best, st.count); delete st.lostOn; delete st.lostCount; }
        var p = st.penalty;
        if (p && p.date === y && !p.back) {
          if (p.xp) { appendRow_('xp', { 'Date': y, 'Time': now_('HH:mm'), 'Who': who, 'What': 'Lazy day: missed-day cost returned', 'XP': p.xp, 'Kind': 'penalty' }); xpCache_ = null; }
          if (p.cash) addCash_(who, 'Lazy day: missed-day cost returned', p.cash, 'penalty');
          delete st.penalty;
        }
        saveStreak_(id, st);
      });
    }
    return appState_(who);
  });
}

/** What Home shows about lazy days and yesterday. */
function lazyState_(who, today) {
  var st = streakState_(who), p = st.penalty, y = addDays_(today, -1);
  return {
    left: lazyLeft_(who, today), perWeek: LAZY_PER_WEEK, today: lazyOn_(who, today),
    offerYesterday: lazyOfferYesterday_(who, today),
    missed: p && p.date === y && (p.xp || p.cash) ? { xp: p.xp, cash: p.cash, back: !!p.back } : null
  };
}

/** A day counts for the streak: your chore minimum once setup has made your plan (any jobs count), otherwise the XP goal. */
function dayWon_(who, ymd, goal) {
  var m = minimumMet_(who, ymd);
  if (m === null && setupOn_() && ymd === todayYmd_()) { cpToday_(); m = minimumMet_(who, ymd); }
  return m === null ? xpOn_(who, ymd) >= goal : m;
}

/**
 * Win the day: the one daily score. Once setup has planned the day it's your chore minimum (any jobs count),
 * before that it's the XP goal. Exactly the rule the streak and the pet use (dayWon_).
 */
function winOf_(who, ymd, goal) {
  var m = minimumMet_(who, ymd);
  if (m === null && setupOn_() && ymd === todayYmd_()) { cpToday_(); m = minimumMet_(who, ymd); }
  if (m !== null) {
    var need = Number((JSON.parse(prop_('CPMIN') || '{}')[ymd] || {})[who]) || 0, done = choresDoneOn_(who, ymd);
    return { by: 'jobs', done: Math.min(done, need), need: need, extra: Math.max(0, done - need), won: cpIsWin(done, need) };
  }
  var xp = xpOn_(who, ymd);
  return { by: 'xp', done: Math.min(xp, goal), need: goal, extra: Math.max(0, xp - goal), won: xp >= goal };
}
/** Your win plus your partner's (null when solo); both: you've both won, which is what feeds the pet and the couple streak. */
function winState_(who, ymd, goal) {
  var w = winOf_(who, ymd, goal);
  if (lazyOn_(who, ymd)) { w.lazy = true; w.won = false; }
  w.partner = solo_() ? null : winOf_(who === 'me' ? 'partner' : 'me', ymd, goal);
  w.both = w.won && (!w.partner || w.partner.won);
  return w;
}

/** Streak as shown: settled days plus today once today's goal is hit. */
function streakNow_(id, todayYmd, goal) {
  var st = streakState_(id);
  var r = id === 'team' ? dayResult_('team', todayYmd, goal) : lazyOn_(id, todayYmd) ? 'lazy' : dayWon_(id, todayYmd, goal) ? 'won' : 'open';
  var today = r === 'won', lazy = r === 'lazy' || (id === 'team' && !today && (lazyOn_('me', todayYmd) || lazyOn_('partner', todayYmd)));
  return { count: st.count + (today ? 1 : 0), best: Math.max(st.best, st.count + (today ? 1 : 0)), todayDone: today, lazy: lazy,
    total: (st.total === undefined ? st.best : st.total) + (today ? 1 : 0) };
}

// ---------- the shared pet ----------
// Grows with every day you BOTH win (lifetime, so it never shrinks). Gets sleepy when the joint streak
// lapses or it's late. It never dies.
var PET_STAGES = [[0, 'egg', 'Egg'], [1, 'baby', 'Hatchling'], [3, 'kid', 'Little one'], [7, 'teen', 'Teen'], [14, 'adult', 'Grown-up'], [30, 'legend', 'Legend'], [100, 'mythic', 'Mythic']];
function petState(team, minutesNow, solo) {
  var days = Math.max(0, Number(team.total) || 0), stage = PET_STAGES[0], next = null;
  PET_STAGES.forEach(function (s, i) { if (days >= s[0]) { stage = s; next = PET_STAGES[i + 1] || null; } });
  var late = minutesNow >= 22 * 60 || minutesNow < 6 * 60;
  var mood = team.todayDone ? (late ? 'sleepy' : 'happy') : late || !team.count || team.lazy ? 'sleepy' : 'waiting';
  return { days: days, stage: stage[1], name: stage[2], next: next ? { at: next[0], name: next[2], left: next[0] - days } : null, mood: mood, streak: team.count,
    line: team.lazy && !team.todayDone ? 'Lazy day. Napping with you.' : mood === 'happy' ? (solo ? 'Fed and bouncing. You won today.' : 'Fed and bouncing. You both won today.') : mood === 'waiting' ? (solo ? 'Waiting for you to win the day.' : 'Waiting for you both to win the day.') : team.todayDone ? 'Full and fast asleep.' : !team.count ? (solo ? 'Having a long nap. One day you win wakes it up.' : 'Having a long nap. One day you both win wakes it up.') : 'Dozing. Still time to win today.' };
}

// ---------- feed and high-fives ----------

function feed_() {
  return JSON.parse(PROPS.getProperty('FEED') || '[]');
}

function addFeed_(who, text, kind) {
  var f = feed_();
  f.unshift({ id: Utilities.getUuid().replace(/-/g, '').slice(0, 10), t: new Date().getTime(), date: todayYmd_(), who: who, text: String(text).slice(0, 140), kind: kind, hi5: [] });
  PROPS.setProperty('FEED', JSON.stringify(f.slice(0, 30)));
}

/** Everything the game parts of the app show for one person. */
function gameState_(who) {
  var today = todayYmd_();
  var settings = readConfig_().settings;
  var goal = dailyGoal_(settings);
  var other = who === 'me' ? 'partner' : 'me';
  var streak = streakNow_(who, today, goal);
  var total = xpTotal_(who);
  var monday = addDays_(today, -((dayOfWeek_(today) + 6) % 7));
  return {
    goal: goal,
    xpToday: xpOn_(who, today),
    otherXpToday: xpOn_(other, today),
    win: winState_(who, today, goal),
    lazy: lazyState_(who, today),
    streak: streak,
    otherStreak: streakNow_(other, today, goal).count,
    team: streakNow_('team', today, goal),
    pet: petState(streakNow_('team', today, goal), minutesNow_(), solo_()),
    total: total,
    badges: [], rewards: [], balance: total,   // empty stand-ins so a phone still running an older cached app (which drew these) doesn't crash before it updates
    level: levelFor(total),
    week: { me: xpBetween_('me', monday, today), partner: xpBetween_('partner', monday, today) },
    month: { me: xpBetween_('me', today.slice(0, 8) + '01', today), partner: xpBetween_('partner', today.slice(0, 8) + '01', today) },
    feed: feed_().slice(0, 15)
  };
}

// ---------- called from the page ----------

function highFive(key, feedId) {
  var who = who_(key);
  return withLock_(function () {
    var f = feed_();
    var item = f.filter(function (x) { return x.id === feedId; })[0];
    if (item && item.who !== who && item.hi5.indexOf(who) === -1) {
      item.hi5.push(who);
      var props = PROPS;
      props.setProperty('FEED', JSON.stringify(f));
      props.setProperty('HI5_' + who, String(Number(props.getProperty('HI5_' + who) || 0) + 1));
      push_(item.who, names_()[who] + ' sent you a high-five', item.text, 'home');
    }
    return appState_(who);
  });
}
