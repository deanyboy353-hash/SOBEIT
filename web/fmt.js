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
    return { big: w.done + '/' + w.need, small: left + unit.replace(/s$/, left === 1 ? '' : 's') + ' to go', label: 'Win the day: ' + w.done + ' of ' + w.need };
  }
  /** "just now", "4 min ago", "2 h ago" */
  function ago(ts, nowMs) {
    var m = Math.max(0, Math.floor((nowMs - (Number(ts) || 0)) / 60000));
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ago';
  }
  /** Should the brief be rewritten? 'stale' (new part of the day, or 3 hours old), 'big' (something big got done, 15+ min since the last one) or ''. */
  function briefDue(b, part, nowMs, dirtyAt, sig) {
    if (!b || !b.brief || b.part !== part) return 'stale';
    var age = nowMs - (Number(b.ts) || 0);
    if (age >= 3 * 3600000) return 'stale';
    if (sig && b.sig && b.sig !== sig && age >= 60000) return 'big';   // a job was done since: catch up
    if (dirtyAt && dirtyAt > (Number(b.ts) || 0) && age >= 15 * 60000) return 'big';
    return '';
  }
  /** Something worth rewriting the brief for: the day won, the gym done, a routine or deadline finished. */
  function bigMoment(prev, next) {
    if (!prev || !next) return false;
    var won = function (st) { return !!(st.game && (st.game.win ? st.game.win.won : st.game.streak && st.game.streak.todayDone)); };
    var gym = function (st) { return !!(st.today && st.today.gym && st.today.gym.done); };
    var fin = function (st) { return ((st.routines && st.routines.routines) || []).filter(function (r) { return r.finished; }).length; };
    var dl = function (st) { return Array.isArray(st.deadlines) ? st.deadlines.length : 0; };
    return won(next) && !won(prev) || gym(next) && !gym(prev) || fin(next) > fin(prev) || dl(next) < dl(prev);
  }
  // Home's cards, in the order Home starts with. Anything can be moved or hidden in Edit home screen.
  var HOME_DEFAULT = ['brief', 'win', 'deadlines', 'routine', 'tiles', 'stage', 'ask', 'gym', 'work', 'us', 'feed'];
  var HOME_QUIET = { feed: 1 };
  /**
   * The order to draw Home in. A saved order from before Win the day (no 'win' in it) is replaced by the new
   * default, but what you'd hidden stays hidden. Cards that were merged (ring, chores -> win; pet, wardrobe -> stage) show.
   */
  function homeOrder(saved) {
    saved = (saved || []).filter(function (x) { return x && x.id; });
    var known = {}, seen = {}, out = [];
    HOME_DEFAULT.forEach(function (id) { known[id] = 1; });
    var current = saved.some(function (x) { return x.id === 'win'; });
    if (current) saved.forEach(function (x) { if (known[x.id] && !seen[x.id]) { seen[x.id] = 1; out.push({ id: x.id, hide: !!x.hide }); } });
    var hid = {}; if (!current) saved.forEach(function (x) { if (known[x.id]) hid[x.id] = !!x.hide; });
    HOME_DEFAULT.forEach(function (id) { if (!seen[id]) out.push({ id: id, hide: hid[id] !== undefined ? hid[id] : !!HOME_QUIET[id] }); });
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
  var api = { briefSig: briefSig, briefBehind: briefBehind, winStep: winStep, homeOrder: homeOrder, HOME_DEFAULT: HOME_DEFAULT, winText: winText, ago: ago, briefDue: briefDue, bigMoment: bigMoment };
  root.NudgeFmt = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
