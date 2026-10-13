/**
 * Game.gs: the Duolingo layer. XP for everything you do, a daily XP goal,
 * streaks with freezes, levels, badges, a reward shop and a shared feed
 * with high-fives. Everything is stored in the XP log tab (one row per
 * award or reward) plus a few small Script Properties.
 *
 * Nothing here ever scolds: missed days use up a freeze if you have one,
 * and the app only ever shows what you did, not what you didn't.
 */

var PEOPLE = ['me', 'partner'];
var FREEZE_EVERY = 7;   // a streak freeze earned every 7 days of streak
var MAX_FREEZES = 2;

var xpCache_ = null;

function xpRows_() {
  if (!xpCache_) {
    xpCache_ = rowsBetween_('xp', '0000', '9999').map(function (r) {
      return { date: String(r['Date']), who: String(r['Who']), what: String(r['What']), xp: Number(r['XP']) || 0, kind: String(r['Kind']) };
    });
  }
  return xpCache_;
}

function addXp_(who, what, xp, kind) {
  appendRow_('xp', { 'Date': todayYmd_(), 'Time': now_('HH:mm'), 'Who': who, 'What': what, 'XP': xp, 'Kind': kind });
  xpCache_ = null;
  if (kind !== 'reward') addFeed_(who, what + (xp > 0 ? ' · +' + xp + ' XP' : ''), kind);
  return xp;
}

function xpOn_(who, ymd) {
  return xpRows_().reduce(function (s, r) { return r.who === who && r.date === ymd && r.xp > 0 ? s + r.xp : s; }, 0);
}

function xpBetween_(who, from, to) {
  return xpRows_().reduce(function (s, r) { return r.who === who && r.date >= from && r.date <= to && r.xp > 0 ? s + r.xp : s; }, 0);
}

function xpTotal_(who) {
  return xpRows_().reduce(function (s, r) { return r.who === who && r.xp > 0 ? s + r.xp : s; }, 0);
}

/** XP you can spend: everything earned minus rewards bought. */
function xpBalance_(who) {
  return xpRows_().reduce(function (s, r) { return r.who === who ? s + r.xp : s; }, 0);
}

function countKind_(who, kind) {
  return xpRows_().filter(function (r) { return r.who === who && r.kind === kind && r.xp >= 0; }).length;
}

function dailyGoal_(settings) {
  return num_(settings || readConfig_().settings, 'Daily XP goal', 30);
}

// ---------- streaks ----------

function streakState_(id) {
  return JSON.parse(PROPS.getProperty('STREAK_' + id) || 'null') ||
    { count: 0, freezes: 0, best: 0, through: addDays_(todayYmd_(), -1), frozeOn: '' };
}

/**
 * Run each morning: settle every day up to yesterday. A day counts if you hit
 * the XP goal; a missed day spends a freeze if you have one, otherwise the
 * streak starts again. "team" counts days you both hit it.
 */
function updateStreaks_(todayYmd) {
  var goal = dailyGoal_();
  var yesterday = addDays_(todayYmd, -1);
  PEOPLE.concat(['team']).forEach(function (id) {
    var st = streakState_(id);
    var d = st.through;
    while (d < yesterday) {
      d = addDays_(d, 1);
      var met = id === 'team' ? xpOn_('me', d) >= goal && xpOn_('partner', d) >= goal : xpOn_(id, d) >= goal;
      if (met) {
        st.count++;
        if (st.count % FREEZE_EVERY === 0) st.freezes = Math.min(MAX_FREEZES, st.freezes + 1);
      } else if (st.count > 0 && st.freezes > 0) {
        st.freezes--;
        st.frozeOn = d;
      } else {
        st.count = 0;
      }
      st.best = Math.max(st.best, st.count);
    }
    st.through = yesterday;
    PROPS.setProperty('STREAK_' + id, JSON.stringify(st));
  });
}

/** Streak as shown: settled days plus today once today's goal is hit. */
function streakNow_(id, todayYmd, goal) {
  var st = streakState_(id);
  var today = id === 'team' ? xpOn_('me', todayYmd) >= goal && xpOn_('partner', todayYmd) >= goal : xpOn_(id, todayYmd) >= goal;
  return { count: st.count + (today ? 1 : 0), freezes: st.freezes, best: Math.max(st.best, st.count + (today ? 1 : 0)), todayDone: today, frozeYesterday: st.frozeOn === addDays_(todayYmd, -1) };
}

// ---------- badges ----------

var BADGES = [
  ['first-quest', '🌱', 'First quest', 'Finish your first quest', function (s) { return s.quests >= 1; }],
  ['quests-25', '🧹', 'House hero', '25 quests done', function (s) { return s.quests >= 25; }],
  ['quests-100', '🏠', 'Home legend', '100 quests done', function (s) { return s.quests >= 100; }],
  ['streak-3', '🔥', 'On a roll', '3-day streak', function (s) { return s.bestStreak >= 3; }],
  ['streak-7', '🔥', 'One whole week', '7-day streak', function (s) { return s.bestStreak >= 7; }],
  ['streak-30', '💫', 'Unstoppable', '30-day streak', function (s) { return s.bestStreak >= 30; }],
  ['streak-100', '💯', 'Century', '100-day streak', function (s) { return s.bestStreak >= 100; }],
  ['gym-1', '🏋️', 'First session', 'Log a gym session', function (s) { return s.gym >= 1; }],
  ['gym-10', '💪', 'Regular', '10 gym sessions', function (s) { return s.gym >= 10; }],
  ['gym-50', '🦾', 'Gym rat', '50 gym sessions', function (s) { return s.gym >= 50; }],
  ['pr', '🏆', 'New PR', 'Beat a lift record', function (s) { return s.prs >= 1; }],
  ['weigh-8', '⚖️', 'Consistent', '8 weigh-ins', function (s) { return s.weighs >= 8; }],
  ['routine-7', '🌅', 'Routine machine', 'Finish 7 routines', function (s) { return s.routines >= 7; }],
  ['protein-7', '🥚', 'Protein pro', 'Hit protein 7 times', function (s) { return s.protein >= 7; }],
  ['cover-5', '🤝', 'Teammate', 'Cover 5 of your partner\'s jobs', function (s) { return s.covers >= 5; }],
  ['hi5-10', '🙌', 'Hype squad', 'Give 10 high-fives', function (s) { return s.hi5 >= 10; }],
  ['brain', '🧠', 'Brain dumped', 'Use the brain dump', function (s) { return s.brain >= 1; }],
  ['level-5', '⭐', 'Level 5', 'Reach level 5', function (s) { return s.level >= 5; }],
  ['level-10', '🌟', 'Level 10', 'Reach level 10', function (s) { return s.level >= 10; }]
];

function badges_(who, streak) {
  var stats = {
    quests: countKind_(who, 'quest'), gym: countKind_(who, 'gym'), prs: countKind_(who, 'pr'),
    weighs: countKind_(who, 'weigh'), routines: countKind_(who, 'routine'), protein: countKind_(who, 'protein'),
    covers: xpRows_().filter(function (r) { return r.who === who && r.kind === 'cover'; }).length,
    hi5: Number(PROPS.getProperty('HI5_' + who) || 0),
    brain: countKind_(who, 'brain'), bestStreak: streak.best, level: levelFor(xpTotal_(who)).level
  };
  return BADGES.map(function (b) { return { id: b[0], emoji: b[1], name: b[2], desc: b[3], earned: b[4](stats) }; });
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

// ---------- rewards ----------

function rewards_(who) {
  return vals_('rewards').slice(1)
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return { name: String(r[0]).trim(), cost: Math.max(1, Number(r[1]) || 100), who: String(r[2] || 'Anyone').trim().toLowerCase() }; })
    .filter(function (r) { return r.who === 'anyone' || r.who === who; });
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
    streak: streak,
    otherStreak: streakNow_(other, today, goal).count,
    team: streakNow_('team', today, goal),
    total: total,
    balance: xpBalance_(who),
    level: levelFor(total),
    week: { me: xpBetween_('me', monday, today), partner: xpBetween_('partner', monday, today) },
    month: { me: xpBetween_('me', today.slice(0, 8) + '01', today), partner: xpBetween_('partner', today.slice(0, 8) + '01', today) },
    badges: badges_(who, streak),
    rewards: rewards_(who),
    feed: feed_().slice(0, 15)
  };
}

// ---------- called from the page ----------

function redeemReward(key, name) {
  var who = who_(key);
  return withLock_(function () {
    var r = rewards_(who).filter(function (x) { return x.name === name; })[0];
    if (!r) throw new Error('That reward is no longer in the Rewards tab.');
    if (xpBalance_(who) < r.cost) throw new Error('Not quite yet: you need ' + (r.cost - xpBalance_(who)) + ' more XP.');
    addXp_(who, 'Reward: ' + r.name, -r.cost, 'reward');
    addFeed_(who, '🎁 Treated themselves: ' + r.name, 'reward');
    return appState_(who);
  });
}

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
    }
    return appState_(who);
  });
}
