/*
 * Nudge · face.js: a small drawn portrait from your 3D look (the same skin, hair, clothes and extras as your
 * character on Home), so you look like you everywhere: Play, the feed, the menu, the dressing room.
 * Pure SVG, a few hundred bytes each: no images, no lag. Moods and outfits react to the day:
 *   mood: 'happy' (bouncing, both hit the minimum) | 'sleepy' (after midnight) | 'proud' | ''
 *   wear: 'gym' (training day) | 'rain' (raining) | 'dj' (practised in Afters today, headphones) | ''
 */
(function (root) {
  'use strict';
  function hex(c, d) {   // lighten (d > 0) or darken (d < 0) a #rrggbb colour
    var m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c || '#888';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, f = function (x) { return Math.max(0, Math.min(255, Math.round(d < 0 ? x * (1 + d) : x + (255 - x) * d))); };
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }
  var LONG = { waves: 1, bob: 1, ponytail: 1, volume: 1, beehive: 1, jheri: 1, buns: 0 };
  function hairBack(h, c) {
    switch (h) {
      case 'waves': return '<path d="M27 40c-4 18-3 38 2 52h42c5-14 6-34 2-52-6-14-40-14-46 0z" fill="' + c + '"/>';
      case 'bob': return '<path d="M28 38c-3 12-2 22 1 28h42c3-6 4-16 1-28-6-13-38-13-44 0z" fill="' + c + '"/>';
      case 'volume': return '<path d="M20 44c-6 22 0 44 8 52h44c8-8 14-30 8-52-6-26-54-26-60 0z" fill="' + c + '"/>';
      case 'jheri': return '<path d="M27 40c-3 12-2 22 2 30h42c4-8 5-18 2-30-6-13-40-13-46 0z" fill="' + c + '"/>';
      case 'ponytail': return '<path d="M66 34c10 4 12 18 8 34-2-8-6-14-10-16z" fill="' + c + '"/>';
      default: return '';
    }
  }
  function hairFront(h, c) {
    var hi = hex(c, 0.18);
    switch (h) {
      case 'bald': return '<ellipse cx="44" cy="27" rx="7" ry="3" fill="#fff" opacity=".18"/>';
      case 'buzz': return '<path d="M30 38c0-14 9-20 20-20s20 6 20 20c-4-6-12-9-20-9s-16 3-20 9z" fill="' + c + '" opacity=".85"/>';
      case 'fade': return '<path d="M29 39c0-15 9-22 21-22s21 7 21 22c-3-5-6-7-8-8-4-4-9-5-13-5s-9 1-13 5c-2 1-5 3-8 8z" fill="' + c + '"/><path d="M30 40c1 3 1 6 0 9M70 40c-1 3-1 6 0 9" stroke="' + c + '" stroke-width="2" opacity=".5"/>';
      case 'afro': return '<circle cx="50" cy="28" r="22" fill="' + c + '"/><circle cx="33" cy="36" r="9" fill="' + c + '"/><circle cx="67" cy="36" r="9" fill="' + c + '"/>';
      case 'cornrows': return '<path d="M29 40c0-15 9-22 21-22s21 7 21 22c-4-7-12-11-21-11s-17 4-21 11z" fill="' + c + '"/>' + [36, 43, 50, 57, 64].map(function (x) { return '<path d="M' + x + ' 20c-1 6-1 11 0 16" stroke="' + hi + '" stroke-width="1.2"/>'; }).join('');
      case 'jheri': return '<path d="M29 38c0-14 9-21 21-21s21 7 21 21c-5-5-13-8-21-8s-16 3-21 8z" fill="' + c + '"/>' + [34, 42, 50, 58, 66].map(function (x) { return '<circle cx="' + x + '" cy="24" r="3" fill="' + hi + '"/>'; }).join('');
      case 'mullet': return '<path d="M29 38c0-14 9-21 21-21s21 7 21 21c-5-4-13-6-21-6s-16 2-21 6z" fill="' + c + '"/><path d="M30 44c-2 10 0 18 4 22l2-16zM70 44c2 10 0 18-4 22l-2-16z" fill="' + c + '"/>';
      case 'slick': return '<path d="M29 36c0-13 10-19 21-19s21 6 21 19c-3-3-8-5-12-5-6-1-12 0-18 2-5 1-9 2-12 3z" fill="' + c + '"/><path d="M36 26c8-3 20-3 28 1" stroke="' + hi + '" stroke-width="1.4" fill="none"/>';
      case 'waves': return '<path d="M29 40c0-16 9-23 21-23s21 7 21 23c-2-6-6-9-10-10-2 4-7 6-13 6-6 0-11-2-13-6-3 2-5 5-6 10z" fill="' + c + '"/>';
      case 'bob': return '<path d="M29 42c0-17 9-24 21-24s21 7 21 24c-3-6-7-10-13-11-5 0-10 1-14 1s-8 3-15 10z" fill="' + c + '"/>';
      case 'ponytail': return '<path d="M29 38c0-15 9-21 21-21s21 6 21 21c-5-5-13-8-21-8s-16 3-21 8z" fill="' + c + '"/><circle cx="66" cy="28" r="4" fill="' + hex(c, -0.2) + '"/>';
      case 'buns': return '<circle cx="34" cy="20" r="8" fill="' + c + '"/><circle cx="66" cy="20" r="8" fill="' + c + '"/><path d="M29 38c0-15 9-21 21-21s21 6 21 21c-5-5-13-8-21-8s-16 3-21 8z" fill="' + c + '"/>';
      case 'mohawk': return '<path d="M44 10c4-2 8-2 12 0l-1 24h-10z" fill="' + c + '"/><path d="M30 40c0-12 8-18 20-18s20 6 20 18c-4-6-12-8-20-8s-16 2-20 8z" fill="' + c + '" opacity=".35"/>';
      case 'beehive': return '<ellipse cx="50" cy="16" rx="16" ry="14" fill="' + c + '"/><path d="M29 40c0-15 9-22 21-22s21 7 21 22c-5-6-13-9-21-9s-16 3-21 9z" fill="' + c + '"/>';
      case 'volume': return '<path d="M26 44c0-22 10-30 24-30s24 8 24 30c-4-9-11-14-18-15-6 4-14 5-20 3-4 3-8 7-10 12z" fill="' + c + '"/>';
      default: return '<path d="M29 39c0-15 9-22 21-22s21 7 21 22c-5-6-13-9-21-9s-16 3-21 9z" fill="' + c + '"/>';
    }
  }
  function svg(look, size, o) {
    look = look || {}; o = o || {};
    var id = 'f' + Math.random().toString(36).slice(2, 7), skin = look.skin || '#c68a62', hairC = look.hairC || '#2a1a12', h = look.hair || 'fade';
    var top = o.wear === 'rain' ? '#f4c430' : o.wear === 'gym' ? hex(look.topC || '#333', -0.35) : look.topC || '#5b44b8', acc = (look.acc || []).slice();
    if (o.wear === 'dj' && acc.indexOf('headphones') === -1) acc.push('headphones');
    var glam = look.glam || look.body === 'f' || (look.acc || []).indexOf('glam') !== -1, lips = look.lips || (glam ? '#c2185b' : hex(skin, -0.3));
    var sleepy = o.mood === 'sleepy', happy = o.mood === 'happy' || o.mood === 'proud';
    var s = '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true" class="face' + (o.bounce ? ' bounce' : '') + '">';
    s += '<defs><radialGradient id="' + id + 'b" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="' + hex(o.bg || top, 0.55) + '"/><stop offset="1" stop-color="' + hex(o.bg || top, -0.25) + '"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><circle cx="50" cy="50" r="50"/></clipPath></defs>';
    s += '<g clip-path="url(#' + id + 'c)"><rect width="100" height="100" fill="url(#' + id + 'b)"/>';
    s += hairBack(h, hairC);
    // shoulders and top
    var sh = { slim: 4, broad: -3, big: -6 }[look.build] || 0;
    s += '<path d="M' + (12 + sh) + ' 104c2-18 16-26 38-26s36 8 38 26z" fill="' + top + '"/>';
    if (look.topPat === 'stripes') s += '<path d="M16 92h68M14 98h72" stroke="' + hex(top, 0.45) + '" stroke-width="3"/>';
    if (o.wear === 'gym') s += '<path d="M33 80c3 10 9 14 17 14s14-4 17-14" fill="' + skin + '"/>';                     // vest top
    else if (o.wear === 'rain') s += '<path d="M22 86c4-14 14-22 28-22s24 8 28 22" fill="none" stroke="' + hex(top, -0.2) + '" stroke-width="7"/>';  // hood
    else s += '<path d="M40 79c3 5 6 7 10 7s7-2 10-7" fill="' + hex(skin, -0.08) + '"/>';
    // neck, ears, head
    s += '<rect x="42" y="60" width="16" height="20" rx="6" fill="' + hex(skin, -0.12) + '"/>';
    s += '<ellipse cx="29" cy="47" rx="4" ry="6" fill="' + hex(skin, -0.06) + '"/><ellipse cx="71" cy="47" rx="4" ry="6" fill="' + hex(skin, -0.06) + '"/>';
    var bw = { slim: 19.5, broad: 22, big: 23.5 }[look.build] || 21;
    s += '<ellipse cx="50" cy="44" rx="' + bw + '" ry="24" fill="' + skin + '"/>';
    s += '<ellipse cx="50" cy="56" rx="15" ry="9" fill="' + hex(skin, -0.05) + '" opacity=".5"/>';
    // eyes and brows
    if (sleepy) s += '<path d="M38 47q5 3 9 0M53 47q5 3 9 0" stroke="#2a1f1a" stroke-width="2" fill="none" stroke-linecap="round"/>';
    else {
      if (glam) s += '<ellipse cx="42" cy="45" rx="6" ry="4" fill="' + (look.shadow || '#7b3fa0') + '" opacity=".45"/><ellipse cx="58" cy="45" rx="6" ry="4" fill="' + (look.shadow || '#7b3fa0') + '" opacity=".45"/>';
      s += '<ellipse cx="42" cy="47" rx="4.2" ry="' + (happy ? 2.6 : 3.6) + '" fill="#fff"/><ellipse cx="58" cy="47" rx="4.2" ry="' + (happy ? 2.6 : 3.6) + '" fill="#fff"/>';
      s += '<circle cx="42.5" cy="47.5" r="2.3" fill="' + (look.eyeC || '#2a1f1a') + '"/><circle cx="58.5" cy="47.5" r="2.3" fill="' + (look.eyeC || '#2a1f1a') + '"/><circle cx="43.3" cy="46.6" r=".8" fill="#fff"/><circle cx="59.3" cy="46.6" r=".8" fill="#fff"/>';
      if (glam) s += '<path d="M37 44l-2-2M38.5 43.2l-1.4-2.2M63 44l2-2M61.5 43.2l1.4-2.2" stroke="#1a1a1a" stroke-width="1"/>';
    }
    s += '<path d="M36 ' + (happy ? 39 : 40) + 'q6-3 11 0M53 ' + (happy ? 39 : 40) + 'q6-3 11 0" stroke="' + hex(hairC, 0.05) + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    // freckles and facial hair (from the dressing room)
    if (look.freckles) s += [[38, 52], [41, 54], [44, 52], [56, 52], [59, 54], [62, 52]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r=".8" fill="' + hex(skin, -0.35) + '"/>'; }).join('');
    var beard = look.beard || (look.body === 'f' ? 'none' : 'stubble'), bc = hex(hairC, 0.05);
    if (beard === 'stubble') s += '<path d="M31 52q2 15 19 16q17-1 19-16q-4 9-19 10q-15-1-19-10z" fill="' + bc + '" opacity=".22"/>';
    if (beard === 'full') s += '<path d="M29 46q0 22 21 23q21-1 21-23q-3 8-8 10q-3-4-13-4q-10 0-13 4q-5-2-8-10z" fill="' + bc + '"/>';
    if (beard === 'goatee' || beard === 'full') s += '<path d="M42 58q8-4 16 0q-8-2-16 0zM45 63q5 9 10 0q-5 3-10 0z" fill="' + bc + '" stroke="' + bc + '" stroke-width="2"/>';
    // nose, cheeks, mouth
    s += '<path d="M50 49q-3 6 0 7" stroke="' + hex(skin, -0.28) + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    s += '<ellipse cx="37" cy="55" rx="4" ry="2.4" fill="#ff7a9a" opacity="' + (happy || glam ? '.35' : '.15') + '"/><ellipse cx="63" cy="55" rx="4" ry="2.4" fill="#ff7a9a" opacity="' + (happy || glam ? '.35' : '.15') + '"/>';
    if (happy) s += '<path d="M42 59q8 8 16 0z" fill="' + hex(lips, -0.25) + '"/><path d="M43.5 59.6q6.5 3.4 13 0" stroke="#fff" stroke-width="1.6" fill="none"/>';
    else if (sleepy) s += '<ellipse cx="50" cy="61" rx="3" ry="2" fill="' + hex(lips, -0.2) + '"/>';
    else s += '<path d="M43 60q7 4 14 0" stroke="' + lips + '" stroke-width="' + (glam ? 3 : 2.2) + '" fill="none" stroke-linecap="round"/>';
    s += hairFront(h, hairC);
    // extras
    if (acc.indexOf('bandana') !== -1) s += '<path d="M28 33q22-8 44 0v5q-22-7-44 0z" fill="#c62828"/>';
    if (acc.indexOf('cap') !== -1) s += '<path d="M28 34c0-12 10-18 22-18s22 6 22 18z" fill="#1565c0"/><path d="M20 30c4-2 8-2 10 0l-2 4z" fill="#0d47a1"/>';
    if (acc.indexOf('shades') !== -1) s += '<path d="M35 44h13v5q-6 4-13 0zM52 44h13v5q-6 4-13 0z" fill="#111"/><path d="M48 46h4" stroke="#111" stroke-width="1.5"/>';
    if (acc.indexOf('hoops') !== -1) s += '<circle cx="28" cy="56" r="3.5" fill="none" stroke="#ffd54f" stroke-width="1.6"/><circle cx="72" cy="56" r="3.5" fill="none" stroke="#ffd54f" stroke-width="1.6"/>';
    if (acc.indexOf('chain') !== -1 && o.wear !== 'rain') s += '<path d="M38 80q12 9 24 0" stroke="#ffd54f" stroke-width="2.4" fill="none"/>';
    if (acc.indexOf('headphones') !== -1) s += '<path d="M27 46c0-20 10-30 23-30s23 10 23 30" stroke="#222" stroke-width="4" fill="none"/><rect x="21" y="40" width="9" height="15" rx="4" fill="#ff3fb4"/><rect x="70" y="40" width="9" height="15" rx="4" fill="#ff3fb4"/>';
    if (acc.indexOf('tiara') !== -1) s += '<path d="M38 22l4 6 4-8 4 8 4-8 4 8 4-6v5H38z" fill="#e0e0ff" stroke="#b39ddb" stroke-width=".6"/>';
    if (acc.indexOf('crown') !== -1) s += '<path d="M36 22l5 8 5-10 4 10 4-10 5 10 5-8v10H36z" fill="#ffd54f" stroke="#ff8f00" stroke-width=".8"/>';
    if (o.wear === 'gym') s += '<path d="M29 35q21-7 42 0v4q-21-6-42 0z" fill="#ff3fb4"/>';     // sweatband
    if (o.wear === 'rain') s += '<path d="M27 42c0-20 10-29 23-29s23 9 23 29c-2-3-4-5-6-6 0-10-8-16-17-16s-17 6-17 16c-2 1-4 3-6 6z" fill="#f4c430"/>';
    if (sleepy) s += '<text x="72" y="26" font-size="12" font-weight="800" fill="#fff" opacity=".85" font-family="system-ui,sans-serif">z</text><text x="80" y="17" font-size="9" font-weight="800" fill="#fff" opacity=".6" font-family="system-ui,sans-serif">z</text>';
    return s + '</g></svg>';
  }
  var api = { svg: svg, shade: hex };
  root.NudgeFace = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
