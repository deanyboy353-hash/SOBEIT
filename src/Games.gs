/**
 * Games.gs: daily brain games you both play, with live scores.
 *
 *   Word    a five-letter word in six guesses (same word for both of you).
 *           Checked here on the server, so neither of you can peek.
 *   Target  six numbers, one target: get as close as you can (+ − × ÷).
 *   Recall  remember a growing sequence of flashes; your best length counts.
 *   Tempo   hear a beat, then keep it going by tapping; closest BPM wins.
 *   Stakes  what the loser of today's word owes the winner (Fun.gs).
 *
 * Today's progress lives in Script Properties (GAMES_<date>) so the other
 * person sees it live; finished games are logged to the Games tab.
 */

var GAME_LIST = ['word', 'target', 'recall', 'tempo'];

function gamesDay_(ymd) {
  var g = JSON.parse(prop_('GAMES_' + ymd) || 'null') ||
    { word: { me: null, partner: null }, target: { me: null, partner: null }, recall: { me: null, partner: null } };
  g.tempo = g.tempo || { me: null, partner: null };
  g.stake = g.stake || null;
  return g;
}

function saveGamesDay_(ymd, g) {
  setProp_('GAMES_' + ymd, JSON.stringify(g));
  var old = 'GAMES_' + addDays_(ymd, -3);
  if (prop_(old)) delProp_(old);
}

function todaysWord_(ymd) {
  var i = wordIndex(ymd, ANSWERS.length / 5);
  return ANSWERS.substr(i * 5, 5);
}

function isAllowedWord_(w) {
  // ALLOWED is sorted: binary search over 5-letter chunks.
  var lo = 0, hi = ALLOWED.length / 5 - 1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1, x = ALLOWED.substr(mid * 5, 5);
    if (x === w) return true;
    if (x < w) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

function names_() {
  var s = readConfig_().settings;
  return { me: String(s['Your name'] || '').trim() || 'Your partner', partner: String(s['Partner name'] || '').trim() || 'Your partner' };
}

/** All three games for one viewer: your full boards, the other person's progress (no spoilers), and head-to-head records. */
function gamesState_(who) {
  var today = todayYmd_();
  var other = who === 'me' ? 'partner' : 'me';
  var g = gamesDay_(today);
  var w = g.word, mine = w[who] || { guesses: [], colours: [], done: false, won: false };
  var theirs = w[other];
  var answer = mine.done ? todaysWord_(today) : '';
  var t = g.target, puzzle = numbersPuzzle(today);
  return {
    date: today,
    word: {
      guesses: mine.guesses, colours: mine.colours, done: mine.done, won: mine.won, answer: answer,
      other: theirs ? { colours: theirs.colours, done: theirs.done, won: theirs.won, tries: theirs.colours.length, guesses: mine.done && theirs.done ? theirs.guesses : [] } : null
    },
    target: {
      numbers: puzzle.numbers, target: puzzle.target,
      mine: t[who], other: t[other] ? { best: t[other].best, points: t[other].points, expr: t[who] && t[who].final ? t[other].expr : '' } : null
    },
    recall: { mine: g.recall[who], other: g.recall[other] },
    tempo: tempoState_(today, g.tempo[who], g.tempo[other]),
    stake: g.stake ? { text: g.stake.text, by: g.stake.by === who ? 'you' : 'them', result: stakeResult_(w[who], w[other]) } : null,
    stats: gameStats_(who)
  };
}

function tempoState_(ymd, mine, theirs) {
  var pz = tempoPuzzle(ymd), done = mine && mine.final;
  return {
    bpm: pz.bpm, style: done ? pz.style : '', mine: mine,
    other: theirs ? { points: theirs.points, final: theirs.final, bpm: done && theirs.final ? theirs.bpm : null, tries: theirs.tries } : null
  };
}

/** Once you've both finished the word: 'you', 'them' or 'draw'. */
function stakeResult_(mine, theirs) {
  if (!mine || !theirs || !mine.done || !theirs.done) return '';
  var a = mine.won ? mine.guesses.length : 7, b = theirs.won ? theirs.guesses.length : 7;
  return a === b ? 'draw' : a < b ? 'you' : 'them';
}

/** Wins, current word streak and averages from the Games tab. */
function gameStats_(who) {
  var other = who === 'me' ? 'partner' : 'me';
  var rows = rowsBetween_('games', addDays_(todayYmd_(), -365), todayYmd_());
  var byDay = {};
  rows.forEach(function (r) {
    var k = r['Date'] + '|' + r['Game'];
    (byDay[k] = byDay[k] || {})[r['Who']] = Number(r['Score']);
  });
  var h2h = { me: 0, partner: 0, draws: 0 };
  Object.keys(byDay).forEach(function (k) {
    var d = byDay[k], game = k.split('|')[1];
    if (d.me === undefined || d.partner === undefined) return;
    // Word: fewer guesses wins (7 = didn't get it). Target: more points. Recall: longer sequence.
    var lowWins = game === 'word';  // the rest: more points wins
    if (d.me === d.partner) h2h.draws++;
    else if ((d.me < d.partner) === lowWins) h2h.me++;
    else h2h.partner++;
  });
  var words = rows.filter(function (r) { return r['Who'] === who && r['Game'] === 'word'; });
  var won = words.filter(function (r) { return Number(r['Score']) <= 6; });
  var streak = 0, d = todayYmd_();
  var wonDays = {};
  won.forEach(function (r) { wonDays[r['Date']] = true; });
  if (!wonDays[d]) d = addDays_(d, -1);
  while (wonDays[d]) { streak++; d = addDays_(d, -1); }
  var dist = [0, 0, 0, 0, 0, 0];
  won.forEach(function (r) { dist[Number(r['Score']) - 1]++; });
  return {
    you: h2h[who], them: h2h[other], draws: h2h.draws,
    word: { played: words.length, won: won.length, streak: streak, dist: dist,
      avg: won.length ? Math.round(won.reduce(function (s, r) { return s + Number(r['Score']); }, 0) / won.length * 10) / 10 : null }
  };
}

function logGame_(who, game, score, detail) {
  appendRow_('games', { 'Date': todayYmd_(), 'Time': now_('HH:mm'), 'Who': who, 'Game': game, 'Score': score, 'Detail': String(detail || '').slice(0, 200) });
}

// ---- called from the page ----

function gamesState(key) {
  return gamesState_(who_(key));
}

function guessWord(key, guess) {
  var who = who_(key);
  guess = String(guess || '').toLowerCase().trim();
  if (!/^[a-z]{5}$/.test(guess)) throw new Error('Five letters, please.');
  if (!isAllowedWord_(guess)) throw new Error('Not in the word list.');
  return withLock_(function () {
    var today = todayYmd_();
    var g = gamesDay_(today);
    var me = g.word[who] || { guesses: [], colours: [], done: false, won: false };
    if (me.done) throw new Error('You\'ve finished today\'s word. New one tomorrow.');
    var colours = scoreGuess(guess, todaysWord_(today));
    me.guesses.push(guess);
    me.colours.push(colours);
    me.won = colours === 'ggggg';
    me.done = me.won || me.guesses.length >= 6;
    g.word[who] = me;
    saveGamesDay_(today, g);
    var n = names_()[who];
    if (me.done) {
      var tries = me.won ? me.guesses.length : 7;
      logGame_(who, 'word', tries, me.colours.join(' '));
      addXp_(who, me.won ? 'Word in ' + tries : 'Word attempt', me.won ? 10 + (7 - tries) * 5 : 5, 'game');
      var res = stakeResult_(me, g.word[who === 'me' ? 'partner' : 'me']);
      if (g.stake && res) {
        var nk = nicks_(), win = res === 'you' ? who : who === 'me' ? 'partner' : 'me', lose = win === 'me' ? 'partner' : 'me';
        var line = res === 'draw' ? 'A draw. ' + g.stake.text + ': you both owe each other.' : nk[win] + ' wins. ' + nk[lose] + ' owes: ' + g.stake.text.toLowerCase() + '.';
        PEOPLE.forEach(function (p) { push_(p, 'Word settled', line, 'play'); });
      } else {
        push_(who === 'me' ? 'partner' : 'me', me.won ? n + ' got the word in ' + tries : n + ' missed today\'s word', me.won ? 'Your turn. Can you beat ' + tries + '/6?' : 'Can you get it?', 'play');
      }
    } else if (me.guesses.length === 1) {
      push_(who === 'me' ? 'partner' : 'me', n + ' has started today\'s word', 'Race you.', 'play');
    }
    return gamesState_(who);
  });
}

/** A numbers answer. Your best counts; "final" locks it in and shows it to your partner. */
function submitTarget(key, expr, final) {
  var who = who_(key);
  return withLock_(function () {
    var today = todayYmd_();
    var pz = numbersPuzzle(today);
    var g = gamesDay_(today);
    var me = g.target[who] || { best: null, points: 0, expr: '', tries: 0, final: false };
    if (me.final) throw new Error('Locked in already. New numbers tomorrow.');
    if (!final) {
      var res = evalNumbers(expr, pz.numbers);
      if (res.error) throw new Error(res.error);
      me.tries++;
      var dist = Math.abs(res.value - pz.target);
      if (me.best === null || dist < Math.abs(me.best - pz.target)) { me.best = res.value; me.expr = String(expr).slice(0, 80); me.points = numbersPoints(res.value, pz.target); }
    }
    if (final || (me.best !== null && me.best === pz.target)) {
      me.final = true;
      logGame_(who, 'target', me.points, me.expr + ' = ' + me.best);
      addXp_(who, 'Numbers: ' + (me.best === pz.target ? 'spot on' : me.points + ' points'), 5 + me.points * 2, 'game');
      push_(who === 'me' ? 'partner' : 'me', names_()[who] + ' locked in the numbers', me.best === pz.target ? 'Hit the target exactly.' : 'Got within ' + Math.abs(me.best - pz.target) + '.', 'play');
    }
    g.target[who] = me;
    saveGamesDay_(today, g);
    return gamesState_(who);
  });
}

/** Recall: the length of sequence you remembered. Best of the day counts. */
function submitRecall(key, level) {
  var who = who_(key);
  level = Math.max(0, Math.min(40, Math.round(Number(level) || 0)));
  return withLock_(function () {
    var today = todayYmd_();
    var g = gamesDay_(today);
    var me = g.recall[who] || { best: 0, plays: 0 };
    var first = me.plays === 0;
    me.plays++;
    if (level > me.best) me.best = level;
    g.recall[who] = me;
    saveGamesDay_(today, g);
    if (first) addXp_(who, 'Recall: ' + level + ' in a row', 5 + level, 'game');
    var rows = rowsBetween_('games', today, today).filter(function (r) { return r['Who'] === who && r['Game'] === 'recall'; });
    if (rows.length) updateRow_('games', findRow_('games', 'Detail', 'recall-' + who + '-' + today), { 'Score': me.best });
    else logGame_(who, 'recall', me.best, 'recall-' + who + '-' + today);
    return gamesState_(who);
  });
}

/** A Tempo attempt: the BPM you tapped. Three tries a day; your best counts. */
function submitTempo(key, bpm) {
  var who = who_(key);
  bpm = Math.round(Number(bpm) * 10) / 10;
  if (!(bpm > 30 && bpm < 300)) throw new Error('That tap didn\'t register. Try again.');
  return withLock_(function () {
    var today = todayYmd_(), g = gamesDay_(today), pz = tempoPuzzle(today);
    var me = g.tempo[who] || { best: null, bpm: null, points: 0, tries: 0, final: false };
    if (me.final) throw new Error('Done for today. New beat tomorrow.');
    me.tries++;
    var pts = tempoPoints(bpm, pz.bpm);
    if (me.best === null || pts > me.points || (pts === me.points && Math.abs(bpm - pz.bpm) < Math.abs(me.bpm - pz.bpm))) { me.points = pts; me.bpm = bpm; me.best = pts; }
    if (me.tries >= 3 || pts === 10) {
      me.final = true;
      logGame_(who, 'tempo', me.points, me.bpm + ' BPM (' + pz.bpm + ')');
      addXp_(who, 'Tempo: ' + me.points + ' points', 5 + me.points, 'game');
      push_(who === 'me' ? 'partner' : 'me', nicks_()[who] + ' locked in Tempo', me.points + ' points. Can you keep better time?', 'play');
    }
    g.tempo[who] = me;
    saveGamesDay_(today, g);
    return gamesState_(who);
  });
}
