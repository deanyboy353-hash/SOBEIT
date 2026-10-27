/* Nudge · fmt.js: small pure formatters shared by the app and the tests. */
(function (root) {
  'use strict';
  /** The XP ring's text: under the goal "12" / "of 30 XP"; at or past it "Goal hit" / "45 XP today". */
  /** Win the day, in words: {big, small, label}. Never claims a win that hasn't happened. */
  function winText(w) {
    if (!w) return { big: '', small: '', label: '' };
    var unit = w.by === 'xp' ? ' XP' : w.need === 1 ? ' job' : ' jobs';
    if (w.won && !w.need) return { big: 'Free win', small: 'nothing due today', label: 'Free win today' };
    if (w.won) return { big: 'Won', small: w.extra ? '+' + w.extra + (w.by === 'xp' ? ' XP' : ' bonus') : 'today', label: 'Day won' };
    var left = w.need - w.done;
    // nothing yet: say what wins it, never "0/30"
    if (!w.done) return { big: String(w.need), small: w.by === 'xp' ? 'XP wins the day' : (w.need === 1 ? 'job wins' : 'jobs win') + ' the day', label: 'Win the day: ' + w.need + unit + ' wins it' };
    return { big: w.done + '/' + w.need, small: left + unit.replace(/s$/, left === 1 ? '' : 's') + ' to go', label: 'Win the day: ' + w.done + ' of ' + w.need };
  }
  /** "just now", "4 min ago", "2 h ago" */
  function ago(ts, nowMs) {
    var m = Math.max(0, Math.floor((nowMs - (Number(ts) || 0)) / 60000));
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ago';
  }
  /** The brief's four slots a day, by minutes since midnight. Same as the server's briefSlot. */
  function briefSlot(min) { return min < 720 ? 'morning' : min < 900 ? 'midday' : min < 1140 ? 'after work' : 'evening'; }
  /** Should the brief be rewritten? 'stale' (a new slot), 'won' (the day was just won, once a day) or ''. */
  function briefDue(b, slot, won) {
    if (!b || !b.brief || b.part !== slot) return 'stale';
    return won && !b.won ? 'won' : '';
  }
  // Home's cards, in the order Home starts with. Anything can be moved or hidden in Edit home screen.
  var HOME_DEFAULT = ['brief', 'win', 'goal', 'deadlines', 'routine', 'tiles', 'stage', 'ask', 'gym', 'work', 'us', 'feed'];
  var HOME_QUIET = { feed: 1, stage: 1 };
  var NEW_CARDS = { goal: 1 };   // cards added after people had saved a layout
  // Characters and pet is off unless you turned it on after it became optional (an entry with on: true).
  function quiet(x) { return x.id === 'stage' ? !x.on : !!x.hide; }
  /**
   * The order to draw Home in. A saved order from before Win the day (no 'win' in it) is replaced by the new
   * default, but what you'd hidden stays hidden. Cards that were merged (ring, chores -> win; pet, wardrobe -> stage) show.
   */
  function homeOrder(saved) {
    saved = (saved || []).filter(function (x) { return x && x.id; });
    var known = {}, seen = {}, out = [];
    HOME_DEFAULT.forEach(function (id) { known[id] = 1; });
    var current = saved.some(function (x) { return x.id === 'win'; });
    if (current) saved.forEach(function (x) { if (known[x.id] && !seen[x.id]) { seen[x.id] = 1; out.push(x.id === 'stage' ? { id: x.id, hide: quiet(x), on: !quiet(x) } : { id: x.id, hide: !!x.hide }); } });
    var hid = {}; if (!current) saved.forEach(function (x) { if (known[x.id]) hid[x.id] = quiet(x); });
    HOME_DEFAULT.forEach(function (id, k) {
      if (seen[id]) return;
      var x = { id: id, hide: hid[id] !== undefined ? hid[id] : !!HOME_QUIET[id] }, prev = k ? HOME_DEFAULT[k - 1] : null, at = -1;
      out.forEach(function (o, j) { if (o.id === prev) at = j; });
      if (current && at !== -1 && NEW_CARDS[id]) out.splice(at + 1, 0, x); else out.push(x);   // a newly added card goes after the one it follows by default
      seen[id] = 1;
    });
    return out;
  }
  /** Win the day after one more job or some XP (the phone's guess until the server confirms). */
  function winStep(w, d) {
    if (w.by === 'jobs' && d.job) { if (w.done < w.need) w.done++; else w.extra = (w.extra || 0) + 1; }
    if (w.by === 'xp' && d.xp) { var t = w.done + (w.extra || 0) + d.xp; w.done = Math.min(t, w.need); w.extra = Math.max(0, t - w.need); }
    w.won = w.done >= w.need;
    w.both = w.won && (!w.partner || w.partner.won);
    return w;
  }
  /** The same fingerprint as the server's briefSig_: jobs done, day won, gym done, open deadlines. */
  function briefSig(S) {
    var w = (S.game && S.game.win) || {}, gym = (S.today && S.today.gym) || {};
    return [w.done || 0, w.won ? 1 : 0, gym.done ? 1 : 0, (S.deadlines || []).length].join('|');
  }
  /** Is the brief behind what's on screen (a job got done since it was written)? */
  function briefBehind(b, S) { return !!(b && b.sig && b.sig !== briefSig(S)); }

  // ---------- Memories (the training calendar) ----------
  /** Body parts as the server names them (Training.gs bodyOf), in words, front of the body first. */
  var BODY_NAMES = { chest: 'Chest', fdelt: 'Front delts', sdelt: 'Side delts', rdelt: 'Rear delts', bi: 'Biceps', tri: 'Triceps', fore: 'Forearms', abs: 'Abs',
    trap: 'Traps', back: 'Upper back', lat: 'Lats', lower: 'Lower back', glute: 'Glutes', quad: 'Quads', ham: 'Hamstrings', calf: 'Calves' };
  /** How hard a part was worked that day, 0 to 3, from its score (1 a set as the main muscle, 0.5 as a helper). */
  function memLevel(score) { return score >= 6 ? 3 : score >= 3 ? 2 : score > 0 ? 1 : 0; }
  /** The parts worked most, as words: ['Chest', 'Triceps']. Helpers only (under one set's worth) are left out. */
  function memTop(m, n) {
    return Object.keys(m || {}).filter(function (k) { return m[k] >= 1 && BODY_NAMES[k]; })
      .sort(function (a, b) { return m[b] - m[a] || Object.keys(BODY_NAMES).indexOf(a) - Object.keys(BODY_NAMES).indexOf(b); })
      .slice(0, n || 99).map(function (k) { return BODY_NAMES[k]; });
  }
  /** A month as weeks, Monday first: ['', '', '2026-10-01', …] padded to whole weeks. ym = 'yyyy-MM'. */
  function memGrid(ym) {
    var y = +ym.slice(0, 4), mo = +ym.slice(5, 7), first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var out = [], lead = (first.getUTCDay() + 6) % 7, i;
    for (i = 0; i < lead; i++) out.push('');
    for (i = 1; i <= days; i++) out.push(ym + '-' + (i < 10 ? '0' : '') + i);
    while (out.length % 7) out.push('');
    return out;
  }
  /** Every month from one to another, oldest first: ['2026-09', '2026-10']. */
  function memMonths(fromYm, toYm) {
    var out = [], y = +fromYm.slice(0, 4), m = +fromYm.slice(5, 7);
    while (out.length < 1200) { var k = y + '-' + (m < 10 ? '0' : '') + m; if (k > toYm) break; out.push(k); if (++m > 12) { m = 1; y++; } }
    return out;
  }
  /**
   * Today as the UK sees it, whatever the phone's own time zone: 'yyyy-MM-dd', the weekday (0 = Sunday) and a long label.
   * Uses Europe/London, so the clocks going back or forward never put the app a day out.
   */
  /** The next small food step, by the time of day (minutes since midnight): shown instead of an empty "0 kcal". */
  function mealNext(min) {
    if (min < 11 * 60) return 'Breakfast next: something with 30 g protein.';
    if (min < 16 * 60) return 'Lunch next: something with 30 g protein.';
    if (min < 21 * 60) return 'Tea next: some protein and some veg.';
    return 'Hungry? Yoghurt or a shake is plenty.';
  }
  var UK = 'Europe/London';
  function ukParts(ms) {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: UK, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  function ukYmd(ms) { var p = ukParts(ms); return p.year + '-' + p.month + '-' + p.day; }
  function ukDow(ms) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(ukParts(ms).weekday); }
  function ukMinutes(ms) { var p = ukParts(ms); return (+p.hour % 24) * 60 + +p.minute; }
  function ukLongDate(ms) { return new Date(ms).toLocaleDateString('en-GB', { timeZone: UK, weekday: 'long', day: 'numeric', month: 'long' }); }
  /** The clock correction to trust: only one measured against a fresh answer from the server, and never more than an hour out (a bigger gap is a stale screen, not a wrong clock). */
  function clockOffset(saved) { var n = Number(saved); return isFinite(n) && Math.abs(n) < 36e5 ? n : 0; }
  var api = { mealNext: mealNext, ukYmd: ukYmd, ukDow: ukDow, ukMinutes: ukMinutes, ukLongDate: ukLongDate, clockOffset: clockOffset, BODY_NAMES: BODY_NAMES, memLevel: memLevel, memTop: memTop, memGrid: memGrid, memMonths: memMonths, briefSig: briefSig, briefBehind: briefBehind, winStep: winStep, homeOrder: homeOrder, HOME_DEFAULT: HOME_DEFAULT, winText: winText, ago: ago, briefDue: briefDue, briefSlot: briefSlot };
  root.NudgeFmt = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
