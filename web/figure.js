/*
 * Nudge · figure.js: full-body illustrated portraits (original 2D art, drawn in code), used until the
 * character creator's 3D characters take over. Reads the same look as the dressing room (skin, hair,
 * clothes, patterns, extras) and reacts to the day:
 *   mood: 'happy' (bounce, big smile) | 'sleepy' (eyes shut, z) | ''
 *   wear: 'gym' (vest, shorts, sweatband) | 'rain' (raincoat, hood up) | 'dj' (headphones) | ''
 * NudgeFigure.svg(look, height, opts) -> an <svg> string. Pure: no DOM, no network.
 */
(function (root) {
  'use strict';
  function hex(c, d) {
    var m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c || '#888';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, f = function (x) { return Math.max(0, Math.min(255, Math.round(d < 0 ? x * (1 + d) : x + (255 - x) * d))); };
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }
  var uid = 0;
  /** A filled shape with a darker outline (the illustrated look). */
  function shape(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '" stroke="' + hex(fill.charAt(0) === '#' ? fill : '#777777', -0.42) + '" stroke-width="1.3" stroke-linejoin="round"' + (extra || '') + '/>'; }
  /** A limb: a thick round-capped stroke with an outline underneath. */
  function limb(pts, w, col) {
    var d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L');
    return '<path d="' + d + '" fill="none" stroke="' + hex(col, -0.42) + '" stroke-width="' + (w + 2.6) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function patternDefs(id, kind, base) {
    var hi = hex(base, 0.4), lo = hex(base, -0.35), p = '<pattern id="' + id + '" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="' + base + '"/>';
    if (kind === 'stripes') p += '<rect y="0" width="12" height="4" fill="' + hi + '"/>';
    else if (kind === 'plaid') p += '<rect width="12" height="3" fill="' + lo + '" opacity=".6"/><rect width="3" height="12" fill="' + lo + '" opacity=".6"/><rect y="7" width="12" height="1" fill="' + hi + '"/>';
    else if (kind === 'flames') p += '<path d="M0 12 Q3 4 6 8 Q8 2 12 12z" fill="#ff8c1a"/><path d="M2 12 Q4 7 6 10 Q8 6 10 12z" fill="#ffd36b"/>';
    else if (kind === 'floral') p += '<circle cx="4" cy="4" r="2.2" fill="' + hi + '"/><circle cx="10" cy="10" r="1.8" fill="#ffd36b"/><circle cx="4" cy="4" r=".8" fill="#fff"/>';
    else if (kind === 'leopard') p += '<ellipse cx="3" cy="3" rx="2" ry="1.4" fill="' + lo + '"/><ellipse cx="9" cy="8" rx="1.8" ry="1.3" fill="' + lo + '"/>';
    else if (kind === 'chrome') p = '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f5f5"/><stop offset=".45" stop-color="' + base + '"/><stop offset=".6" stop-color="#ffffff"/><stop offset="1" stop-color="' + lo + '"/></linearGradient>';
    else if (kind === 'sequins') p += '<circle cx="3" cy="3" r="1.6" fill="' + hi + '"/><circle cx="9" cy="3" r="1.6" fill="' + lo + '"/><circle cx="6" cy="8" r="1.6" fill="' + hi + '"/><circle cx="0" cy="8" r="1.6" fill="' + lo + '"/><circle cx="12" cy="8" r="1.6" fill="' + lo + '"/>';
    else p += '';
    return kind === 'chrome' ? p : p + '</pattern>';
  }

  /**
   * look: { body 'm'|'f', skin, hair, hairC, top, topC, topPat, bottom, botC, botPat, shoes, shoeC, acc[], lips, shadow, build, height, beard, eyeC, freckles }
   */
  function svg(look, h, o) {
    look = look || {}; o = o || {}; h = h || 220;
    var id = 'nf' + (++uid), f = look.body === 'f', skin = look.skin || '#c68a62', hairC = look.hairC || '#2a1a12';
    var B = { slim: 0.88, broad: 1.12, big: 1.24 }[look.build] || 1, big = look.build === 'big';
    var HS = { short: 0.95, tall: 1.05 }[look.height] || 1;
    var wear = o.wear || '', mood = o.mood || '';
    var top = wear === 'gym' ? 'tank' : look.top || 'tee', topC = wear === 'gym' ? hex(look.topC || '#333333', -0.3) : look.topC || '#5b44b8';
    var bottom = wear === 'gym' ? 'shorts' : look.bottom || 'jeans', botC = wear === 'gym' ? '#20242c' : look.botC || '#2b3a67';
    var shoes = wear === 'gym' ? 'sneakers' : look.shoes || 'sneakers', shoeC = look.shoeC || '#f2f2f2';
    var acc = (look.acc || []).slice(); if (wear === 'dj' && acc.indexOf('headphones') === -1) acc.push('headphones');
    var topFill = topC, botFill = botC, defs = '';
    if (look.topPat && look.topPat !== 'solid' && wear !== 'gym') { defs += patternDefs(id + 't', look.topPat, topC); topFill = 'url(#' + id + 't)'; }
    if (look.botPat && look.botPat !== 'solid' && wear !== 'gym') { defs += patternDefs(id + 'b', look.botPat, botC); botFill = 'url(#' + id + 'b)'; }
    if (top === 'bodice') { defs += patternDefs(id + 's', 'sequins', topC); topFill = 'url(#' + id + 's)'; }
    var cx = 70, sw = (f ? 25 : 29) * B, waist = (f ? 17 : 21) * B * (big ? 1.18 : 1), hipW = (f ? 26 : 22) * B * (big ? 1.08 : 1);
    var yS = 78, yW = 140, yH = 154, yK = 212, yA = 266;
    var s = '';
    // ground shadow
    s += '<ellipse cx="70" cy="286" rx="' + (34 * B) + '" ry="6" fill="#000" opacity=".22"/>';
    // back layers: long hair, hood down, wings
    s += hairBack(look.hair, hairC, cx, wear);
    if (acc.indexOf('wings') !== -1) s += shape('M' + (cx - 10) + ' 90 Q' + (cx - 70) + ' 40 ' + (cx - 60) + ' 150 Q' + (cx - 35) + ' 120 ' + (cx - 8) + ' 120z', '#fbe7f2', ' opacity=".9"') + shape('M' + (cx + 10) + ' 90 Q' + (cx + 70) + ' 40 ' + (cx + 60) + ' 150 Q' + (cx + 35) + ' 120 ' + (cx + 8) + ' 120z', '#fbe7f2', ' opacity=".9"');
    // legs (trousers drawn as limbs; skin first so shorts/skirts show legs)
    var legW = 15 * B * (big ? 1.1 : 1), shinW = 11.5 * B;
    var lx = function (sgn) { return cx + sgn * (hipW * 0.48); };
    var legPath = function (sgn) { return [[lx(sgn), yH], [lx(sgn) + sgn * 1.5, yK], [lx(sgn) + sgn * 2.5, yA]]; };
    [-1, 1].forEach(function (g) { s += limb(legPath(g), legW, skin); });
    var long = ['jeans', 'baggy', 'trackpants', 'slacks'].indexOf(bottom) !== -1, gown = bottom === 'gown' || bottom === 'mermaid';
    if (long) [-1, 1].forEach(function (g) {
      var bw = bottom === 'baggy' ? legW * 1.3 : legW + 1;
      s += limb(legPath(g), bw, botC);
      if (botFill !== botC) s += '<path d="M' + legPath(g).map(function (p) { return p[0] + ' ' + p[1]; }).join(' L') + '" fill="none" stroke="' + botFill + '" stroke-width="' + (bw - 1) + '" stroke-linecap="round"/>';
      if (bottom === 'jeans' || bottom === 'baggy') s += '<path d="M' + (lx(g) + g * 3) + ' ' + (yH + 4) + ' L' + (lx(g) + g * 5) + ' ' + (yA - 4) + '" stroke="#d6a531" stroke-width=".8" stroke-dasharray="2 2" fill="none"/>';
      if (bottom === 'trackpants') s += '<path d="M' + (lx(g) + g * (bw / 2 - 2)) + ' ' + yH + ' L' + (lx(g) + g * (bw / 2 - 1.5)) + ' ' + yA + '" stroke="#fff" stroke-width="2" fill="none"/>';
      s += '<path d="M' + (lx(g) - g * 2) + ' ' + (yH + 6) + ' L' + (lx(g) - g * 1) + ' ' + (yA - 6) + '" stroke="#000" stroke-opacity=".18" stroke-width="' + (bw * 0.35) + '" fill="none" stroke-linecap="round"/>';   // inner-leg shade
    });
    if (bottom === 'shorts' || bottom === 'hotpants') { var sl = bottom === 'hotpants' ? 12 : 30; [-1, 1].forEach(function (g) { s += limb([[lx(g), yH], [lx(g) + g * 0.6, yH + sl]], legW + 3, botC); }); }
    // shoes
    [-1, 1].forEach(function (g) {
      var x = lx(g) + g * 2.5, y = yA;
      if (shoes === 'heels' || shoes === 'thigh') {
        if (shoes === 'thigh') s += limb([[lx(g) + g * 1.5, yK - 18], [x, y]], shinW + 2.5, shoeC);
        s += shape('M' + (x - 6) + ' ' + (y - 4) + ' L' + (x + 6) + ' ' + (y - 4) + ' L' + (x + 7 + g * 3) + ' ' + (y + 10) + ' L' + (x - 4) + ' ' + (y + 10) + 'z', shoeC);
        s += '<rect x="' + (x - g * 5 - 1) + '" y="' + (y + 4) + '" width="2.5" height="8" fill="' + hex(shoeC, -0.4) + '"/>';
      } else {   // a front-on shoe: rounded toe box, a sole, laces or a boot shaft
        var tall = shoes === 'boots' ? 14 : 0, tw = shoes === 'loafers' ? 9 : 10.5;
        if (tall) s += shape('M' + (x - 7) + ' ' + (y - tall) + ' L' + (x + 7) + ' ' + (y - tall) + ' L' + (x + 8) + ' ' + (y + 2) + ' L' + (x - 8) + ' ' + (y + 2) + 'z', shoeC);
        s += shape('M' + (x - tw) + ' ' + (y + 9) + ' Q' + (x - tw - 1) + ' ' + (y - 1) + ' ' + (x + g * 1) + ' ' + (y - 2) + ' Q' + (x + tw + 1) + ' ' + (y - 1) + ' ' + (x + tw) + ' ' + (y + 9) + 'z', shoeC);
        s += '<rect x="' + (x - tw - 0.5) + '" y="' + (y + 7) + '" width="' + (tw * 2 + 1) + '" height="4" rx="2" fill="' + (shoes === 'sneakers' ? '#f7f5ef' : '#2a1a10') + '" stroke="' + hex(shoeC, -0.42) + '" stroke-width="1"/>';
        if (shoes === 'sneakers') s += '<path d="M' + (x - 3) + ' ' + (y + 1) + ' h6 M' + (x - 3) + ' ' + (y + 3.5) + ' h6" stroke="' + hex(shoeC, -0.4) + '" stroke-width="1"/><path d="M' + (x - tw + 2) + ' ' + (y + 5) + ' q' + tw + ' -5 ' + (tw * 2 - 4) + ' 0" stroke="' + (look.shoeC2 || '#c62828') + '" stroke-width="1.4" fill="none"/>';
      }
    });
    // skirts and gowns over the legs
    if (bottom === 'skirt') s += shape('M' + (cx - hipW) + ' ' + (yH - 6) + ' L' + (cx + hipW) + ' ' + (yH - 6) + ' L' + (cx + hipW + 10) + ' ' + (yH + 34) + ' L' + (cx - hipW - 10) + ' ' + (yH + 34) + 'z', botFill === botC ? botC : botFill);
    if (gown) s += shape('M' + (cx - hipW) + ' ' + (yH - 8) + ' L' + (cx + hipW) + ' ' + (yH - 8) + ' Q' + (cx + hipW + (bottom === 'gown' ? 26 : 6)) + ' ' + (yA - 10) + ' ' + (cx + hipW + (bottom === 'gown' ? 22 : 16)) + ' ' + (yA + 10) + ' L' + (cx - hipW - (bottom === 'gown' ? 22 : 16)) + ' ' + (yA + 10) + ' Q' + (cx - hipW - (bottom === 'gown' ? 26 : 6)) + ' ' + (yA - 10) + ' ' + (cx - hipW) + ' ' + (yH - 8) + 'z', botFill === botC ? botC : botFill);
    // hips / waistband
    if (!gown && bottom !== 'skirt') s += shape('M' + (cx - waist) + ' ' + (yW + 2) + ' L' + (cx + waist) + ' ' + (yW + 2) + ' L' + (cx + hipW) + ' ' + (yH + 6) + ' L' + (cx - hipW) + ' ' + (yH + 6) + 'z', botFill === botC ? botC : botFill);
    // arms behind the torso edge
    var armW = 10.5 * B * (look.build === 'broad' ? 1.15 : 1), sleeve = { tee: 0.5, crop: 0.45, grove: 0.15, hawaiian: 0.5, tank: 0, corset: 0, bodice: 0, tracktop: 1, hoodie: 1, bomber: 1, leather: 1, vcsuit: 1, fur: 1 }[top];
    if (sleeve === undefined) sleeve = 0.5;
    if (wear === 'rain') sleeve = 1;
    var happy = mood === 'happy';
    var armPts = function (g) {
      var sx = cx + g * (sw - 3), sy = yS + 6;
      return happy ? [[sx, sy], [sx + g * 14, sy - 18], [sx + g * 12, sy - 44]] : [[sx, sy], [sx + g * 8, sy + 46], [sx + g * 10, sy + 88]];
    };
    var sleeveC = wear === 'rain' ? '#f4c430' : (top === 'bomber' || top === 'leather' || top === 'vcsuit') ? hex(topC, -0.08) : topC;
    [-1, 1].forEach(function (g) {
      var p = armPts(g);
      s += limb(p, armW, skin);
      if (sleeve >= 1) s += limb(p.slice(0, 2).concat([[p[1][0] + (p[2][0] - p[1][0]) * 0.85, p[1][1] + (p[2][1] - p[1][1]) * 0.85]]), armW + 2.5, sleeveC);
      else if (sleeve > 0) s += limb([p[0], [p[0][0] + (p[1][0] - p[0][0]) * sleeve * 1.4, p[0][1] + (p[1][1] - p[0][1]) * sleeve * 1.4]], armW + 2.5, sleeveC);
      var hx = p[2][0], hy = p[2][1];
      var glove = acc.indexOf('gloves') !== -1;
      s += '<circle cx="' + hx + '" cy="' + hy + '" r="' + (armW * 0.62) + '" fill="' + (glove ? '#1a1a1a' : skin) + '" stroke="' + hex(glove ? '#555555' : skin, -0.42) + '" stroke-width="1.2"/>';
    });
    // torso
    var neckY = yS - 6, tPath = 'M' + (cx - sw) + ' ' + (yS + 4) + ' Q' + (cx - sw) + ' ' + (yS - 2) + ' ' + (cx - sw + 8) + ' ' + (yS - 3) + ' L' + (cx + sw - 8) + ' ' + (yS - 3) + ' Q' + (cx + sw) + ' ' + (yS - 2) + ' ' + (cx + sw) + ' ' + (yS + 4) +
      ' Q' + (cx + sw - 2) + ' ' + (yW - 30) + ' ' + (cx + waist) + ' ' + (yW + 4) + ' L' + (cx - waist) + ' ' + (yW + 4) + ' Q' + (cx - sw + 2) + ' ' + (yW - 30) + ' ' + (cx - sw) + ' ' + (yS + 4) + 'z';
    var cropY = yW - 14;
    if (top === 'crop' || top === 'corset') s += shape('M' + (cx - waist - 1) + ' ' + (cropY - 4) + ' L' + (cx + waist + 1) + ' ' + (cropY - 4) + ' L' + (cx + waist) + ' ' + (yW + 4) + ' L' + (cx - waist) + ' ' + (yW + 4) + 'z', skin);
    s += '<clipPath id="' + id + 'c"><path d="' + tPath + '"/></clipPath>';
    if (wear === 'rain') {   // raincoat: long, hood up, toggles
      s += shape('M' + (cx - sw - 3) + ' ' + (yS - 2) + ' L' + (cx + sw + 3) + ' ' + (yS - 2) + ' L' + (cx + hipW + 12) + ' ' + (yK + 8) + ' L' + (cx - hipW - 12) + ' ' + (yK + 8) + 'z', '#f4c430');
      for (var tg = 0; tg < 4; tg++) s += '<rect x="' + (cx - 4) + '" y="' + (yS + 14 + tg * 22) + '" width="8" height="3" rx="1.5" fill="#7a5a10"/>';
      s += '<path d="M' + cx + ' ' + yS + ' L' + cx + ' ' + (yK + 8) + '" stroke="#b58a12" stroke-width="1.2"/>';
    } else {
      s += shape(tPath.replace(/ L(\S+) (\S+) L(\S+) (\S+) Q/, function (m0) { return m0; }), topFill === topC ? topC : topFill, top === 'crop' || top === 'corset' ? ' clip-path="inset(0 0 ' + (yW + 4 - cropY) + 'px 0)"' : '');
      if (top === 'crop' || top === 'corset') s += '<rect x="' + (cx - sw) + '" y="' + cropY + '" width="' + (sw * 2) + '" height="' + (yW + 6 - cropY) + '" fill="' + skin + '" clip-path="url(#' + id + 'c)"/><path d="M' + (cx - waist - 3) + ' ' + cropY + ' L' + (cx + waist + 3) + ' ' + cropY + '" stroke="' + hex(topC, -0.4) + '" stroke-width="1.3"/><circle cx="' + cx + '" cy="' + (yW - 4) + '" r="1.2" fill="' + hex(skin, -0.4) + '"/>';
      // volume: a shadow down the right side, a highlight on the left
      s += '<path d="' + tPath + '" fill="url(#' + id + 'g)" clip-path="url(#' + id + 'c)"/>';
      defs += '<linearGradient id="' + id + 'g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>';
      // details per top
      if (top === 'tee' || top === 'grove' || top === 'hawaiian' || top === 'tracktop' || top === 'hoodie') s += '<path d="M' + (cx - 8) + ' ' + (yS - 3) + ' Q' + cx + ' ' + (yS + 6) + ' ' + (cx + 8) + ' ' + (yS - 3) + '" fill="' + skin + '" stroke="' + hex(topC, -0.4) + '" stroke-width="1.2"/>';
      if (top === 'tank' || top === 'bodice') s += '<path d="M' + (cx - 11) + ' ' + (yS - 3) + ' Q' + cx + ' ' + (yS + 12) + ' ' + (cx + 11) + ' ' + (yS - 3) + '" fill="' + skin + '" stroke="' + hex(topC, -0.4) + '" stroke-width="1.2"/>';
      if (top === 'grove') s += '<text x="' + cx + '" y="' + (yS + 34) + '" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="22" text-anchor="middle" fill="#fff" stroke="' + hex(topC, -0.45) + '" stroke-width=".8">7</text>';
      if (top === 'hawaiian') { for (var fl = 0; fl < 7; fl++) { var fx = cx - sw + 8 + (fl * 13) % (sw * 2 - 14), fy = yS + 10 + (fl * 17) % 50; s += '<g clip-path="url(#' + id + 'c)"><circle cx="' + fx + '" cy="' + fy + '" r="4" fill="#ffd36b"/><circle cx="' + fx + '" cy="' + fy + '" r="1.5" fill="#e76f51"/></g>'; } s += '<path d="M' + cx + ' ' + (yS + 2) + ' L' + cx + ' ' + (yW + 4) + '" stroke="' + hex(topC, -0.4) + '" stroke-width="1"/>'; }
      if (top === 'tracktop') s += '<path d="M' + cx + ' ' + (yS + 2) + ' L' + cx + ' ' + (yW + 4) + '" stroke="#e0e0e0" stroke-width="1.5"/><path d="M' + (cx - sw + 3) + ' ' + yS + ' L' + (cx - waist + 1) + ' ' + yW + 'M' + (cx + sw - 3) + ' ' + yS + ' L' + (cx + waist - 1) + ' ' + yW + '" stroke="#fff" stroke-width="2.2" fill="none"/>';
      if (top === 'hoodie') s += shape('M' + (cx - 14) + ' ' + (yW - 26) + ' L' + (cx + 14) + ' ' + (yW - 26) + ' L' + (cx + 17) + ' ' + (yW - 6) + ' L' + (cx - 17) + ' ' + (yW - 6) + 'z', hex(topC, -0.12)) + '<path d="M' + (cx - 4) + ' ' + (yS + 3) + ' l-1 16 M' + (cx + 4) + ' ' + (yS + 3) + ' l1 16" stroke="#eee" stroke-width="1.2" fill="none"/>';
      if (top === 'corset') for (var cl = 0; cl < 4; cl++) s += '<path d="M' + (cx - 4) + ' ' + (yS + 18 + cl * 9) + ' l8 6 M' + (cx + 4) + ' ' + (yS + 18 + cl * 9) + ' l-8 6" stroke="#111" stroke-width="1"/>';
      if (top === 'fur') for (var fz = 0; fz < 18; fz++) s += '<circle cx="' + (cx - sw + 4 + (fz * 7.3) % (sw * 2 - 8)) + '" cy="' + (yS + 4 + (fz * 11) % 60) + '" r="4" fill="' + hex(topC, 0.15) + '" clip-path="url(#' + id + 'c)"/>';
      if (top === 'bomber' || top === 'leather' || top === 'vcsuit') {   // open jacket over a plain tee
        s += shape('M' + (cx - 10) + ' ' + (yS - 3) + ' L' + (cx + 10) + ' ' + (yS - 3) + ' L' + (cx + 8) + ' ' + (yW + 4) + ' L' + (cx - 8) + ' ' + (yW + 4) + 'z', top === 'vcsuit' ? '#f4f1ea' : '#e9e9e9');
        [-1, 1].forEach(function (g) { s += '<path d="M' + (cx + g * 10) + ' ' + (yS - 3) + ' L' + (cx + g * 14) + ' ' + (yS + 18) + ' L' + (cx + g * 8) + ' ' + (yW + 4) + '" fill="none" stroke="' + hex(topC, -0.45) + '" stroke-width="1.6"/>'; });
        if (top === 'leather') s += '<path d="M' + (cx - sw + 6) + ' ' + (yS + 8) + ' l6 30" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/>';
      }
      if (f && top !== 'fur') s += '<path d="M' + (cx - 14) + ' ' + (yS + 26) + ' Q' + (cx - 7) + ' ' + (yS + 32) + ' ' + cx + ' ' + (yS + 26) + ' Q' + (cx + 7) + ' ' + (yS + 32) + ' ' + (cx + 14) + ' ' + (yS + 26) + '" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.3"/>';
    }
    // neck
    s += '<rect x="' + (cx - 6) + '" y="' + (neckY - 8) + '" width="12" height="14" rx="4" fill="' + hex(skin, -0.12) + '"/>';
    // extras on the body
    if (acc.indexOf('chain') !== -1) s += '<path d="M' + (cx - 10) + ' ' + (yS - 2) + ' Q' + cx + ' ' + (yS + 16) + ' ' + (cx + 10) + ' ' + (yS - 2) + '" fill="none" stroke="#ffd54f" stroke-width="2.4" stroke-dasharray="2.5 1.2"/>';
    if (acc.indexOf('sash') !== -1) s += '<path d="M' + (cx - sw + 4) + ' ' + yS + ' L' + (cx + waist) + ' ' + (yW - 2) + '" stroke="#f0f0f0" stroke-width="9"/><path d="M' + (cx - sw + 4) + ' ' + yS + ' L' + (cx + waist) + ' ' + (yW - 2) + '" stroke="#d4af37" stroke-width="1" stroke-dasharray="3 2"/>';
    if (acc.indexOf('boa') !== -1) for (var bo = 0; bo < 9; bo++) s += '<circle cx="' + (cx - sw + 2 + bo * (sw * 2 - 4) / 8) + '" cy="' + (yS + Math.sin(bo / 8 * Math.PI) * 10) + '" r="5" fill="#ff8fca"/>';
    if (acc.indexOf('fan') !== -1) s += '<path d="M' + (armPts(1)[2][0]) + ' ' + armPts(1)[2][1] + ' l-16 -22 a26 26 0 0 1 28 4z" fill="#111" stroke="#d4af37" stroke-width="1"/>';
    // head
    s += '<g transform="translate(' + cx + ' 64) scale(1.22) translate(' + (-cx) + ' -64)">' + head(look, cx, 44, mood, acc, wear, hairC, skin) + '</g>';
    if (mood === 'sleepy') s += '<text x="' + (cx + 22) + '" y="22" font-size="13" font-weight="800" fill="currentColor" opacity=".7" font-family="system-ui,sans-serif">z</text><text x="' + (cx + 31) + '" y="12" font-size="9" font-weight="800" fill="currentColor" opacity=".5" font-family="system-ui,sans-serif">z</text>';
    var w = Math.round(h * 140 / 300);
    var body = '<g transform="translate(0 ' + (300 - 300 * HS) + ') scale(1 ' + HS + ')">' + s + '</g>';
    return '<svg class="figure' + (o.bounce ? ' bounce' : '') + '" viewBox="0 0 140 300" width="' + w + '" height="' + h + '" role="img" aria-hidden="true"><defs>' + defs + '</defs>' + body + '</svg>';
  }

  function hairBack(st, c, cx, wear) {
    if (wear === 'rain') return '';
    var lo = hex(c, -0.25);
    switch (st) {
      case 'waves': return shape('M' + (cx - 21) + ' 40 Q' + (cx - 26) + ' 80 ' + (cx - 18) + ' 104 L' + (cx + 18) + ' 104 Q' + (cx + 26) + ' 80 ' + (cx + 21) + ' 40z', c);
      case 'volume': return shape('M' + (cx - 30) + ' 36 Q' + (cx - 40) + ' 90 ' + (cx - 24) + ' 112 L' + (cx + 24) + ' 112 Q' + (cx + 40) + ' 90 ' + (cx + 30) + ' 36z', c);
      case 'bob': return shape('M' + (cx - 21) + ' 40 Q' + (cx - 23) + ' 64 ' + (cx - 18) + ' 70 L' + (cx + 18) + ' 70 Q' + (cx + 23) + ' 64 ' + (cx + 21) + ' 40z', c);
      case 'jheri': return shape('M' + (cx - 21) + ' 38 Q' + (cx - 24) + ' 66 ' + (cx - 16) + ' 74 L' + (cx + 16) + ' 74 Q' + (cx + 24) + ' 66 ' + (cx + 21) + ' 38z', c) + '<path d="M' + (cx - 16) + ' 72 q4 4 8 0 q4 4 8 0 q4 4 8 0 q4 4 8 0" fill="none" stroke="' + lo + '" stroke-width="1.4"/>';
      case 'ponytail': return shape('M' + (cx + 14) + ' 34 Q' + (cx + 34) + ' 46 ' + (cx + 26) + ' 84 Q' + (cx + 22) + ' 60 ' + (cx + 12) + ' 50z', c);
      default: return '';
    }
  }

  function head(look, cx, cy, mood, acc, wear, hairC, skin) {
    var f = look.body === 'f', s = '', sleepy = mood === 'sleepy', happy = mood === 'happy';
    var glam = f || (look.lips && look.lips !== '#9c4a52'), lips = look.lips || (f ? '#c2185b' : hex(skin, -0.3));
    // ears, face
    s += '<ellipse cx="' + (cx - 17) + '" cy="' + (cy + 2) + '" rx="3.5" ry="5" fill="' + hex(skin, -0.06) + '" stroke="' + hex(skin, -0.42) + '" stroke-width="1"/><ellipse cx="' + (cx + 17) + '" cy="' + (cy + 2) + '" rx="3.5" ry="5" fill="' + hex(skin, -0.06) + '" stroke="' + hex(skin, -0.42) + '" stroke-width="1"/>';
    s += shape('M' + cx + ' ' + (cy - 21) + ' C' + (cx + 13) + ' ' + (cy - 21) + ' ' + (cx + 18) + ' ' + (cy - 12) + ' ' + (cx + 18) + ' ' + cy + ' C' + (cx + 18) + ' ' + (cy + 12) + ' ' + (cx + (f ? 9 : 11)) + ' ' + (cy + 21) + ' ' + cx + ' ' + (cy + 21) + ' C' + (cx - (f ? 9 : 11)) + ' ' + (cy + 21) + ' ' + (cx - 18) + ' ' + (cy + 12) + ' ' + (cx - 18) + ' ' + cy + ' C' + (cx - 18) + ' ' + (cy - 12) + ' ' + (cx - 13) + ' ' + (cy - 21) + ' ' + cx + ' ' + (cy - 21) + 'z', skin);
    s += '<path d="M' + (cx + 8) + ' ' + (cy - 18) + ' C' + (cx + 18) + ' ' + (cy - 8) + ' ' + (cx + 17) + ' ' + (cy + 12) + ' ' + (cx + 4) + ' ' + (cy + 20) + ' C' + (cx + 13) + ' ' + (cy + 8) + ' ' + (cx + 14) + ' ' + (cy - 6) + ' ' + (cx + 8) + ' ' + (cy - 18) + 'z" fill="#000" opacity=".1"/>';   // shade
    // eyes
    var ey = cy - 1, ec = look.eyeC || '#2a1f1a';
    if (sleepy) s += '<path d="M' + (cx - 10) + ' ' + ey + ' q4 3 8 0 M' + (cx + 2) + ' ' + ey + ' q4 3 8 0" stroke="#2a1f1a" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    else if (happy) s += '<path d="M' + (cx - 10) + ' ' + (ey + 1) + ' q4 -4 8 0 M' + (cx + 2) + ' ' + (ey + 1) + ' q4 -4 8 0" stroke="#2a1f1a" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    else [-1, 1].forEach(function (g) {
      var ex = cx + g * 6.5;
      if (glam) s += '<ellipse cx="' + ex + '" cy="' + (ey - 1.5) + '" rx="5" ry="3" fill="' + (look.shadow || '#8e44ad') + '" opacity=".45"/>';
      s += '<ellipse cx="' + ex + '" cy="' + ey + '" rx="3.6" ry="3" fill="#fff"/><circle cx="' + (ex + 0.4) + '" cy="' + (ey + 0.3) + '" r="2" fill="' + ec + '"/><circle cx="' + (ex + 0.4) + '" cy="' + (ey + 0.3) + '" r=".9" fill="#111"/><circle cx="' + (ex + 1.2) + '" cy="' + (ey - 0.6) + '" r=".6" fill="#fff"/>';
      if (glam) s += '<path d="M' + (ex + g * 2.5) + ' ' + (ey - 2.6) + ' l' + (g * 2) + ' -2" stroke="#111" stroke-width="1"/>';
    });
    s += '<path d="M' + (cx - 11) + ' ' + (ey - 6) + ' q4.5 -' + (happy ? 3 : 2) + ' 8 0 M' + (cx + 3) + ' ' + (ey - 6) + ' q4.5 -' + (happy ? 3 : 2) + ' 8 0" stroke="' + hex(hairC, 0.05) + '" stroke-width="' + (f ? 1.3 : 2) + '" fill="none" stroke-linecap="round"/>';
    // nose, cheeks, mouth
    s += '<path d="M' + cx + ' ' + (cy + 1) + ' q-2 5 1 6" stroke="' + hex(skin, -0.35) + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>';
    s += '<ellipse cx="' + (cx - 10) + '" cy="' + (cy + 7) + '" rx="3" ry="1.8" fill="#ff7a9a" opacity="' + (happy || glam ? '.35' : '.15') + '"/><ellipse cx="' + (cx + 10) + '" cy="' + (cy + 7) + '" rx="3" ry="1.8" fill="#ff7a9a" opacity="' + (happy || glam ? '.35' : '.15') + '"/>';
    if (look.freckles) [[-9, 4], [-7, 6], [-11, 7], [9, 4], [7, 6], [11, 7]].forEach(function (p) { s += '<circle cx="' + (cx + p[0]) + '" cy="' + (cy + p[1]) + '" r=".6" fill="' + hex(skin, -0.38) + '"/>'; });
    var my = cy + 12;
    if (happy) s += '<path d="M' + (cx - 6) + ' ' + my + ' q6 7 12 0z" fill="' + hex(lips, -0.25) + '"/><path d="M' + (cx - 5) + ' ' + (my + 0.5) + ' q5 2.5 10 0" stroke="#fff" stroke-width="1.2" fill="none"/>';
    else if (sleepy) s += '<ellipse cx="' + cx + '" cy="' + (my + 1) + '" rx="2" ry="1.4" fill="' + hex(lips, -0.2) + '"/>';
    else s += '<path d="M' + (cx - 5) + ' ' + my + ' q5 3 10 0" stroke="' + lips + '" stroke-width="' + (glam ? 2.4 : 1.6) + '" fill="none" stroke-linecap="round"/>';
    var beard = look.beard || (f ? 'none' : 'stubble'), bc = hex(hairC, 0.05);
    if (beard === 'stubble') s += '<path d="M' + (cx - 15) + ' ' + (cy + 4) + ' Q' + (cx - 13) + ' ' + (cy + 21) + ' ' + cx + ' ' + (cy + 21) + ' Q' + (cx + 13) + ' ' + (cy + 21) + ' ' + (cx + 15) + ' ' + (cy + 4) + ' Q' + (cx + 8) + ' ' + (cy + 15) + ' ' + cx + ' ' + (cy + 15) + ' Q' + (cx - 8) + ' ' + (cy + 15) + ' ' + (cx - 15) + ' ' + (cy + 4) + 'z" fill="' + bc + '" opacity=".22"/>';
    if (beard === 'full') s += shape('M' + (cx - 17) + ' ' + (cy + 1) + ' Q' + (cx - 16) + ' ' + (cy + 24) + ' ' + cx + ' ' + (cy + 25) + ' Q' + (cx + 16) + ' ' + (cy + 24) + ' ' + (cx + 17) + ' ' + (cy + 1) + ' Q' + (cx + 10) + ' ' + (cy + 11) + ' ' + cx + ' ' + (cy + 10) + ' Q' + (cx - 10) + ' ' + (cy + 11) + ' ' + (cx - 17) + ' ' + (cy + 1) + 'z', bc);
    if (beard === 'goatee' || beard === 'full') s += '<path d="M' + (cx - 6) + ' ' + (my - 2) + ' q6 -3 12 0 M' + (cx - 3) + ' ' + (my + 4) + ' q3 6 6 0" stroke="' + bc + '" stroke-width="2.2" fill="' + bc + '"/>';
    // hair (front)
    s += hairFront(look.hair, hairC, cx, cy, wear);
    // extras on the head
    if (wear === 'rain') s += shape('M' + (cx - 23) + ' ' + (cy + 8) + ' Q' + (cx - 26) + ' ' + (cy - 30) + ' ' + cx + ' ' + (cy - 30) + ' Q' + (cx + 26) + ' ' + (cy - 30) + ' ' + (cx + 23) + ' ' + (cy + 8) + ' Q' + (cx + 19) + ' ' + (cy - 20) + ' ' + cx + ' ' + (cy - 21) + ' Q' + (cx - 19) + ' ' + (cy - 20) + ' ' + (cx - 23) + ' ' + (cy + 8) + 'z', '#f4c430');
    if (wear === 'gym') s += '<path d="M' + (cx - 18) + ' ' + (cy - 9) + ' Q' + cx + ' ' + (cy - 15) + ' ' + (cx + 18) + ' ' + (cy - 9) + '" stroke="#ff3fb4" stroke-width="4" fill="none"/>';
    if (acc.indexOf('bandana') !== -1) s += '<path d="M' + (cx - 19) + ' ' + (cy - 9) + ' Q' + cx + ' ' + (cy - 17) + ' ' + (cx + 19) + ' ' + (cy - 9) + '" stroke="#c62828" stroke-width="5" fill="none"/>';
    if (acc.indexOf('cap') !== -1) s += shape('M' + (cx - 19) + ' ' + (cy - 8) + ' Q' + (cx - 19) + ' ' + (cy - 27) + ' ' + cx + ' ' + (cy - 27) + ' Q' + (cx + 19) + ' ' + (cy - 27) + ' ' + (cx + 19) + ' ' + (cy - 8) + 'z', '#1565c0') + shape('M' + (cx - 19) + ' ' + (cy - 9) + ' L' + (cx - 32) + ' ' + (cy - 6) + ' L' + (cx - 19) + ' ' + (cy - 4) + 'z', '#0d47a1');
    if (acc.indexOf('shades') !== -1) s += '<path d="M' + (cx - 13) + ' ' + (cy - 4) + 'h11v4q-5 4 -11 0zM' + (cx + 2) + ' ' + (cy - 4) + 'h11v4q-5 4 -11 0z" fill="#111"/><path d="M' + (cx - 2) + ' ' + (cy - 3) + 'h4" stroke="#111" stroke-width="1.4"/>';
    if (acc.indexOf('hoops') !== -1) s += '<circle cx="' + (cx - 17) + '" cy="' + (cy + 9) + '" r="3" fill="none" stroke="#ffd54f" stroke-width="1.4"/><circle cx="' + (cx + 17) + '" cy="' + (cy + 9) + '" r="3" fill="none" stroke="#ffd54f" stroke-width="1.4"/>';
    if (acc.indexOf('headphones') !== -1) s += '<path d="M' + (cx - 19) + ' ' + cy + ' C' + (cx - 20) + ' ' + (cy - 32) + ' ' + (cx + 20) + ' ' + (cy - 32) + ' ' + (cx + 19) + ' ' + cy + '" stroke="#222" stroke-width="3.5" fill="none"/><rect x="' + (cx - 24) + '" y="' + (cy - 5) + '" width="8" height="13" rx="3.5" fill="#ff3fb4" stroke="#7a1450" stroke-width="1"/><rect x="' + (cx + 16) + '" y="' + (cy - 5) + '" width="8" height="13" rx="3.5" fill="#ff3fb4" stroke="#7a1450" stroke-width="1"/>';
    if (acc.indexOf('tiara') !== -1) s += '<path d="M' + (cx - 11) + ' ' + (cy - 20) + ' l4 -6 4 4 3 -7 3 7 4 -4 4 6z" fill="#e0e0ff" stroke="#9575cd" stroke-width=".8"/>';
    if (acc.indexOf('crown') !== -1 || acc.indexOf('petcrown') !== -1) s += '<path d="M' + (cx - 13) + ' ' + (cy - 20) + ' l3 -10 6 6 4 -9 4 9 6 -6 3 10z" fill="#ffd54f" stroke="#c77800" stroke-width="1"/>';
    return s;
  }

  function hairFront(st, c, cx, cy, wear) {
    if (wear === 'rain' || st === 'bald') return st === 'bald' ? '<ellipse cx="' + (cx - 6) + '" cy="' + (cy - 15) + '" rx="5" ry="2.4" fill="#fff" opacity=".2"/>' : '';
    var hi = hex(c, 0.22), top = 'M' + (cx - 19) + ' ' + (cy - 2) + ' C' + (cx - 21) + ' ' + (cy - 26) + ' ' + (cx + 21) + ' ' + (cy - 26) + ' ' + (cx + 19) + ' ' + (cy - 2);
    var strands = '<path d="M' + (cx - 8) + ' ' + (cy - 19) + ' q4 6 2 12 M' + (cx + 3) + ' ' + (cy - 20) + ' q3 5 1 10" stroke="' + hi + '" stroke-width="1" fill="none" opacity=".7"/>';
    switch (st) {
      case 'buzz': return '<path d="' + top + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z" fill="' + c + '" opacity=".8"/>';
      case 'fade': return shape(top + ' Q' + (cx + 15) + ' ' + (cy - 12) + ' ' + cx + ' ' + (cy - 14) + ' Q' + (cx - 15) + ' ' + (cy - 12) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + strands;
      case 'afro': return shape('M' + cx + ' ' + (cy - 42) + ' C' + (cx + 30) + ' ' + (cy - 42) + ' ' + (cx + 34) + ' ' + (cy - 8) + ' ' + (cx + 22) + ' ' + (cy + 2) + ' Q' + (cx + 18) + ' ' + (cy - 14) + ' ' + cx + ' ' + (cy - 16) + ' Q' + (cx - 18) + ' ' + (cy - 14) + ' ' + (cx - 22) + ' ' + (cy + 2) + ' C' + (cx - 34) + ' ' + (cy - 8) + ' ' + (cx - 30) + ' ' + (cy - 42) + ' ' + cx + ' ' + (cy - 42) + 'z', c);
      case 'cornrows': return shape(top + ' Q' + cx + ' ' + (cy - 16) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + [-10, -5, 0, 5, 10].map(function (x) { return '<path d="M' + (cx + x) + ' ' + (cy - 22) + ' L' + (cx + x * 1.2) + ' ' + (cy - 6) + '" stroke="' + hi + '" stroke-width="1.6" stroke-dasharray="2 1.5"/>'; }).join('');
      case 'jheri': return shape(top + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + [-12, -6, 0, 6, 12].map(function (x) { return '<circle cx="' + (cx + x) + '" cy="' + (cy - 16) + '" r="3.2" fill="' + hi + '" stroke="' + hex(c, -0.3) + '" stroke-width=".8"/>'; }).join('');
      case 'mullet': return shape(top + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + shape('M' + (cx - 19) + ' ' + (cy + 2) + ' Q' + (cx - 23) + ' ' + (cy + 18) + ' ' + (cx - 15) + ' ' + (cy + 24) + ' L' + (cx - 16) + ' ' + (cy + 6) + 'z', c) + shape('M' + (cx + 19) + ' ' + (cy + 2) + ' Q' + (cx + 23) + ' ' + (cy + 18) + ' ' + (cx + 15) + ' ' + (cy + 24) + ' L' + (cx + 16) + ' ' + (cy + 6) + 'z', c) + strands;
      case 'slick': return shape(top + ' Q' + (cx + 6) + ' ' + (cy - 18) + ' ' + (cx - 19) + ' ' + (cy - 4) + 'z', c) + '<path d="M' + (cx - 12) + ' ' + (cy - 18) + ' q12 -6 24 -1" stroke="' + hi + '" stroke-width="1.4" fill="none"/>';
      case 'waves': return shape(top + ' Q' + (cx + 12) + ' ' + (cy - 14) + ' ' + (cx + 4) + ' ' + (cy - 10) + ' Q' + (cx - 6) + ' ' + (cy - 16) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + strands;
      case 'bob': return shape(top + ' L' + (cx + 20) + ' ' + (cy + 8) + ' Q' + (cx + 16) + ' ' + (cy - 12) + ' ' + cx + ' ' + (cy - 13) + ' Q' + (cx - 16) + ' ' + (cy - 12) + ' ' + (cx - 20) + ' ' + (cy + 8) + 'z', c) + strands;
      case 'ponytail': return shape(top + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + '<circle cx="' + (cx + 14) + '" cy="' + (cy - 16) + '" r="3.5" fill="' + hex(c, -0.2) + '"/>' + strands;
      case 'buns': return shape('M' + (cx - 14) + ' ' + (cy - 30) + ' a7 7 0 1 0 0.1 0z', c) + shape('M' + (cx + 14) + ' ' + (cy - 30) + ' a7 7 0 1 0 0.1 0z', c) + shape(top + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c);
      case 'mohawk': return shape('M' + (cx - 4) + ' ' + (cy - 20) + ' L' + (cx - 2) + ' ' + (cy - 40) + ' L' + (cx + 2) + ' ' + (cy - 40) + ' L' + (cx + 4) + ' ' + (cy - 20) + 'z', c) + '<path d="' + top + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z" fill="' + c + '" opacity=".3"/>';
      case 'beehive': return shape('M' + cx + ' ' + (cy - 50) + ' C' + (cx + 20) + ' ' + (cy - 50) + ' ' + (cx + 22) + ' ' + (cy - 20) + ' ' + (cx + 19) + ' ' + (cy - 2) + ' Q' + cx + ' ' + (cy - 14) + ' ' + (cx - 19) + ' ' + (cy - 2) + ' C' + (cx - 22) + ' ' + (cy - 20) + ' ' + (cx - 20) + ' ' + (cy - 50) + ' ' + cx + ' ' + (cy - 50) + 'z', c) + strands;
      case 'volume': return shape('M' + (cx - 26) + ' ' + (cy + 4) + ' C' + (cx - 32) + ' ' + (cy - 36) + ' ' + (cx + 32) + ' ' + (cy - 36) + ' ' + (cx + 26) + ' ' + (cy + 4) + ' Q' + (cx + 14) + ' ' + (cy - 16) + ' ' + cx + ' ' + (cy - 14) + ' Q' + (cx - 14) + ' ' + (cy - 16) + ' ' + (cx - 26) + ' ' + (cy + 4) + 'z', c) + strands;
      default: return shape(top + ' Q' + (cx + 15) + ' ' + (cy - 12) + ' ' + cx + ' ' + (cy - 14) + ' Q' + (cx - 15) + ' ' + (cy - 12) + ' ' + (cx - 19) + ' ' + (cy - 2) + 'z', c) + strands;
    }
  }

  var api = { svg: svg };
  root.NudgeFigure = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
