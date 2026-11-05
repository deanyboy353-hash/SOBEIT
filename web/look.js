/*
 * Nudge · character creator helpers (pure, so they can be tested).
 *   randomise(catalog, owned, rnd, base): a new look from things you own, with colours from the palettes.
 *   history(): undo / redo for the dressing room.
 */
(function (root) {
  var PALETTES = {
    skin: ['#f3cfb3', '#e0a982', '#c68a62', '#a8714d', '#8d5a3b', '#6b4226', '#4a2c1a'],
    hair: ['#1c1410', '#3b2416', '#6b4423', '#b5793f', '#e8c37a', '#f2f0e6', '#c1121f', '#ff5fae', '#7c5cff', '#2fe0d6'],
    clothes: ['#111111', '#f4f1ea', '#ffffff', '#e63946', '#ff5fae', '#ffb703', '#2e9e4f', '#2fe0d6', '#1f4fd1', '#7c5cff', '#8d5a3b', '#c9a227'],
    eyes: ['#4a2f1d', '#2a1a10', '#6b8e23', '#3f7cc0', '#7d8a96', '#a0522d'],
    lips: ['#9c4a52', '#c2185b', '#e63946', '#ff5fae', '#6a1b4d', '#d4a373', '#111111', '#7c5cff']
  };
  function pick(list, rnd) { return list[Math.floor(rnd() * list.length) % list.length]; }
  function randomise(catalog, owned, rnd, base) {
    rnd = rnd || Math.random; base = base || {};
    var mine = function (slot) { return catalog.filter(function (w) { return w.slot === slot && owned.indexOf(w.id) !== -1; }).map(function (w) { return w.id; }); };
    var L = JSON.parse(JSON.stringify(base));
    ['hair', 'top', 'bottom', 'shoes'].forEach(function (s) { var m = mine(s); if (m.length) L[s] = pick(m, rnd); });
    var pats = mine('pattern'); if (pats.length) { L.topPat = rnd() < 0.6 ? 'solid' : pick(pats, rnd); L.botPat = rnd() < 0.8 ? 'solid' : pick(pats, rnd); }
    var acc = mine('acc'), n = Math.floor(rnd() * 3); L.acc = [];
    while (L.acc.length < Math.min(n, acc.length)) { var a = pick(acc, rnd); if (L.acc.indexOf(a) === -1) L.acc.push(a); }
    L.hairC = pick(PALETTES.hair, rnd); L.topC = pick(PALETTES.clothes, rnd); L.botC = pick(PALETTES.clothes, rnd); L.shoeC = pick(PALETTES.clothes, rnd);
    if (L.botC === L.topC) L.botC = PALETTES.clothes[(PALETTES.clothes.indexOf(L.topC) + 4) % PALETTES.clothes.length];
    L.eyeC = pick(PALETTES.eyes, rnd);
    if (owned.indexOf('glam') !== -1) { L.lips = pick(PALETTES.lips, rnd); L.shadow = pick(PALETTES.clothes, rnd); }
    return L;   // body, skin, build and height are yours: randomise never changes who you are
  }
  /** Undo / redo: push() after every change; undo() and redo() hand back a copy of the look to show. */
  function history(start, max) {
    max = max || 50;
    var past = [], future = [], cur = JSON.stringify(start);
    return {
      push: function (look) { var s = JSON.stringify(look); if (s === cur) return; past.push(cur); if (past.length > max) past.shift(); cur = s; future = []; },
      undo: function () { if (!past.length) return null; future.push(cur); cur = past.pop(); return JSON.parse(cur); },
      redo: function () { if (!future.length) return null; past.push(cur); cur = future.pop(); return JSON.parse(cur); },
      canUndo: function () { return past.length > 0; }, canRedo: function () { return future.length > 0; }
    };
  }
  var api = { PALETTES: PALETTES, randomise: randomise, history: history };
  root.NudgeLook = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
