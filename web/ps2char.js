/*
 * Nudge · ps2char.js: the character creator's renderer. Early-2000s console-style characters, made from
 * scratch: chunky low-poly parts (about 1,500 to 3,500 triangles a character) on one shared joint skeleton,
 * low-resolution hand-painted canvas textures (faces, folds, stitching, seams painted in), soft Gouraud
 * lighting with a warm sunset grade, and an optional "PS2 mode" (low internal resolution, dithering and the
 * vertex wobble of that hardware). Every design here is original. No external models or textures.
 *
 * PS2Char.normalize(look)            -> a complete look (fills defaults, migrates the old 3D looks)
 * PS2Char.build(look)                -> THREE.Group with joints in .userData.joints and .userData.tris
 * PS2Char.stage(el, looks, opts)     -> { set(looks), pose(name), ps2(on), dispose(), tris }
 * PS2Char.portrait(look, size)       -> data URL of a head-and-shoulders thumbnail (cached)
 * PS2Char.random(seed, glam)         -> a random but coherent look
 * PS2Char.OPTIONS                    -> everything the creator offers
 */
(function (root) {
  'use strict';
  var T = root.THREE;

  // ---------- options (all original) ----------
  var SKINS = ['#f6d7c3', '#efc3a4', '#e0ac85', '#d29a6e', '#c68a62', '#b27652', '#9c6644', '#8d5a3b', '#734a2f', '#5e3a24', '#4a2d1b', '#3a2214'];
  var HAIRC = ['#1b1410', '#2e1d14', '#4a2f1e', '#6b4226', '#8a5a33', '#b07a45', '#d8b06a', '#e8d29a', '#b33a2a', '#7c7c7c', '#e6e6e6', '#ff3fa4', '#8f5bff', '#2fd4c4', '#3a7bff', '#59e05b'];
  var CLOTH = ['#111111', '#f2f2f2', '#2b3a67', '#2e9e4f', '#c62828', '#ffb000', '#ff5fae', '#8f5bff', '#2fe0d6', '#6b4226', '#8a8f98', '#e76f51', '#1f6f8b', '#f0c96a'];
  var OPTIONS = {
    frame: [['m', 'Straight'], ['f', 'Curvy']],
    build: [['slim', 'Slim'], ['avg', 'Average'], ['muscular', 'Muscular'], ['heavy', 'Heavier']],
    stance: [['relaxed', 'Relaxed'], ['wide', 'Wide'], ['hip', 'Hip out']],
    faceShape: [['oval', 'Oval'], ['square', 'Square'], ['round', 'Round'], ['long', 'Long'], ['heart', 'Heart']],
    eyes: [['almond', 'Almond'], ['round', 'Round'], ['narrow', 'Narrow'], ['sleepy', 'Sleepy'], ['lashes', 'Lashes']],
    brows: [['straight', 'Straight'], ['arched', 'Arched'], ['thick', 'Thick'], ['thin', 'Thin']],
    nose: [['small', 'Small'], ['wide', 'Wide'], ['long', 'Long'], ['button', 'Button']],
    mouth: [['neutral', 'Neutral'], ['smile', 'Smile'], ['smirk', 'Smirk'], ['full', 'Full'], ['grin', 'Grin']],
    facial: [['none', 'None'], ['stubble', 'Stubble'], ['tache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Full beard']],
    glasses: [['none', 'None'], ['round', 'Round'], ['square', 'Square'], ['shades', 'Shades'], ['visor', 'Visor']],
    hair: [['buzz', 'Buzz'], ['fade', 'Fade'], ['crop', 'Short crop'], ['spikes', 'Spikes'], ['slick', 'Slick-back'], ['mullet', 'Mullet'], ['curls', 'Curls'], ['afro', 'Afro'],
      ['braids', 'Braids'], ['cornrow', 'Cornrows'], ['long', 'Long'], ['bob', 'Bob'], ['bun', 'Top bun'], ['buns', 'Space buns'], ['ponytail', 'Ponytail'], ['mohawk', 'Mohawk'], ['bigvolume', 'Big volume'], ['bald', 'Bald']],
    top: [['tee', 'T-shirt'], ['longtee', 'Long-sleeve tee'], ['vest', 'Vest'], ['crop', 'Crop top'], ['shirt', 'Printed shirt'], ['hawaii', 'Hawaiian shirt'], ['track', 'Tracksuit top'],
      ['hoodie', 'Hoodie'], ['bomber', 'Bomber jacket'], ['leather', 'Leather jacket'], ['corset', 'Corset top'], ['sequin', 'Sequin top']],
    bottom: [['jeans', 'Jeans'], ['cargos', 'Cargos'], ['trackies', 'Tracksuit bottoms'], ['shorts', 'Shorts'], ['skirt', 'Skirt'], ['mini', 'Mini skirt'], ['flares', 'Flares']],
    fit: [['skinny', 'Skinny'], ['regular', 'Regular'], ['baggy', 'Baggy']],
    shoes: [['retro', 'Retro trainers'], ['skate', 'Skate shoes'], ['boots', 'Boots'], ['heels', 'Heels'], ['platforms', 'Platforms']],
    acc: [['cap', 'Cap'], ['bandana', 'Bandana'], ['beanie', 'Beanie'], ['headphones', 'Headphones'], ['chain', 'Chain'], ['earrings', 'Hoop earrings'], ['bag', 'Cross-body bag'], ['gloves', 'Gloves'], ['crown', 'Crown'], ['bigjewels', 'Statement jewellery']],
    graphic: [['none', 'None'], ['star', 'Star'], ['bolt', 'Lightning'], ['wave', 'Wave'], ['heart', 'Heart'], ['eye', 'Eye'], ['number', 'Number'], ['stripes', 'Stripes'], ['check', 'Checks'], ['flames', 'Flames'], ['leopard', 'Spots'], ['sparkle', 'Sparkle']],
    tattoo: [['none', 'None'], ['sleeve', 'Arm sleeve'], ['band', 'Arm band'], ['stars', 'Little stars'], ['rose', 'Rose']],
    skins: SKINS, hairColours: HAIRC, colours: CLOTH
  };
  var GLAM_FIRST = ['sequin', 'corset', 'platforms', 'heels', 'bigvolume', 'bigjewels', 'crown'];

  var DEFAULT = {
    v: 2, frame: 'm', height: 1, build: 'avg', skin: '#c68a62', stance: 'relaxed',
    face: { shape: 'oval', eyes: 'almond', eyeC: '#4a2f1d', brows: 'straight', nose: 'small', mouth: 'neutral', facial: 'none', glasses: 'none', lips: '' },
    hair: { style: 'fade', c: '#1b1410' },
    top: { style: 'tee', c1: '#2e9e4f', c2: '#f2f2f2', graphic: 'none' },
    bottom: { style: 'jeans', fit: 'regular', c1: '#2b3a67', c2: '#e6e6e6' },
    shoes: { style: 'retro', c1: '#f2f2f2', c2: '#c62828' },
    acc: [], accC: '#f0c96a', tattoo: 'none', metallic: false
  };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** A complete look from anything (missing parts filled; the old 3D looks mapped to the closest match). */
  function normalize(L) {
    L = L || {}; var o = clone(DEFAULT);
    if (L.v === 2) {
      ['frame', 'height', 'build', 'skin', 'stance', 'accC', 'tattoo', 'metallic'].forEach(function (k) { if (L[k] !== undefined) o[k] = L[k]; });
      ['face', 'hair', 'top', 'bottom', 'shoes'].forEach(function (k) { if (L[k]) Object.keys(L[k]).forEach(function (j) { o[k][j] = L[k][j]; }); });
      if (Array.isArray(L.acc)) o.acc = L.acc.slice(0, 5);
      return o;
    }
    // old 3D wardrobe look -> v2
    var HAIR = { fade: 'fade', buzz: 'buzz', bob: 'bob', bald: 'bald', afro: 'afro', cornrows: 'cornrow', jheri: 'curls', mullet: 'mullet', slick: 'slick', waves: 'long', ponytail: 'ponytail', buns: 'buns', mohawk: 'mohawk', beehive: 'bun', volume: 'bigvolume' };
    var TOP = { tee: 'tee', tank: 'vest', grove: 'shirt', tracktop: 'track', hawaiian: 'hawaii', vcsuit: 'bomber', hoodie: 'hoodie', bomber: 'bomber', leather: 'leather', crop: 'crop', corset: 'corset', bodice: 'sequin', fur: 'bomber', streakhoodie: 'hoodie', stringer: 'vest' };
    var BOT = { jeans: 'jeans', shorts: 'shorts', baggy: 'jeans', trackpants: 'trackies', slacks: 'cargos', skirt: 'mini', hotpants: 'shorts', mermaid: 'skirt', gown: 'skirt' };
    var SH = { sneakers: 'retro', boots: 'boots', loafers: 'skate', heels: 'heels', thigh: 'boots' };
    var GRAPH = { stripes: 'stripes', plaid: 'check', flames: 'flames', floral: 'sparkle', leopard: 'leopard', chrome: 'none', sequins: 'sparkle' };
    var ACC = { shades: 'glasses', bandana: 'bandana', chain: 'chain', cap: 'cap', headphones: 'headphones', hoops: 'earrings', fan: 'bigjewels', boa: 'bigjewels', sash: 'bag', tiara: 'crown', wings: 'bigjewels', crown: 'crown', goldphones: 'headphones', petcrown: 'crown' };
    if (L.body) o.frame = L.body === 'f' ? 'f' : 'm';
    if (L.skin) o.skin = L.skin;
    if (L.build) o.build = L.build === 'broad' ? 'muscular' : L.build === 'big' ? 'heavy' : L.build;
    if (L.height) o.height = L.height === 'short' ? 0.95 : L.height === 'tall' ? 1.05 : 1;
    if (L.hair) o.hair.style = HAIR[L.hair] || 'crop';
    if (L.hairC) o.hair.c = L.hairC;
    if (L.top) o.top.style = TOP[L.top] || 'tee';
    if (L.topC) o.top.c1 = L.topC;
    if (L.top === 'grove') o.top.graphic = 'number';
    if (L.topPat && GRAPH[L.topPat]) o.top.graphic = GRAPH[L.topPat];
    if (L.bottom) o.bottom.style = BOT[L.bottom] || 'jeans';
    if (L.bottom === 'baggy') o.bottom.fit = 'baggy';
    if (L.botC) o.bottom.c1 = L.botC;
    if (L.shoes) o.shoes.style = SH[L.shoes] || 'retro';
    if (L.shoeC) o.shoes.c1 = L.shoeC;
    if (L.eyeC) o.face.eyeC = L.eyeC;
    if (L.beard) o.face.facial = L.beard === 'full' ? 'beard' : L.beard;
    if (L.lips && L.lips !== '#9c4a52') o.face.lips = L.lips;
    if (o.frame === 'f') { o.face.eyes = 'lashes'; o.face.brows = 'arched'; o.face.mouth = 'full'; }
    (L.acc || []).forEach(function (a) { var m = ACC[a]; if (m === 'glasses') o.face.glasses = 'shades'; else if (m && o.acc.indexOf(m) === -1) o.acc.push(m); });
    if (L.acc && L.acc.indexOf('goldphones') !== -1) o.accC = '#f0c96a';
    return o;
  }

  // ---------- small helpers ----------
  function hex(c, d) {   // lighten (d > 0) or darken (d < 0)
    var m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c || '#888';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, f = function (x) { return Math.max(0, Math.min(255, Math.round(d < 0 ? x * (1 + d) : x + (255 - x) * d))); };
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }
  function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var texCache = {};
  /** A low-res canvas texture painted by fn(g, w, h), nearest-filtered for the chunky look. */
  function tex(key, w, h, fn) {
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g, w, h);
    var t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    if ('colorSpace' in t) t.colorSpace = 'srgb'; else t.encoding = T.sRGBEncoding;
    return (texCache[key] = t);
  }
  /** Painterly noise: soft speckles that make flat colour look hand-painted. */
  function grain(g, w, h, col, n, a, seed) {
    var r = rnd(seed || 7); g.globalAlpha = a || 0.08; g.fillStyle = col;
    for (var i = 0; i < (n || 300); i++) g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
    g.globalAlpha = 1;
  }
  function shadeBand(g, w, h, col) {   // painted ambient occlusion: darker at the top and bottom edges of a part
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hex(col, -0.25)); gr.addColorStop(0.18, col); gr.addColorStop(0.82, col); gr.addColorStop(1, hex(col, -0.3));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }

  // ---------- painted textures ----------
  function skinTex(L) {
    return tex('skin|' + L.skin + '|' + L.tattoo, 64, 64, function (g, w, h) {
      shadeBand(g, w, h, L.skin); grain(g, w, h, hex(L.skin, -0.2), 200, 0.12, 3);
    });
  }
  function graphicPaint(g, kind, cx, cy, s, col) {
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(1, s / 8);
    if (kind === 'star') { g.beginPath(); for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? s * 0.4 : s; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); }
    else if (kind === 'bolt') { g.beginPath(); g.moveTo(cx + s * 0.2, cy - s); g.lineTo(cx - s * 0.5, cy + s * 0.1); g.lineTo(cx, cy + s * 0.1); g.lineTo(cx - s * 0.2, cy + s); g.lineTo(cx + s * 0.5, cy - s * 0.1); g.lineTo(cx, cy - s * 0.1); g.closePath(); g.fill(); }
    else if (kind === 'wave') { g.beginPath(); for (var x = -s; x <= s; x += 2) g.lineTo(cx + x, cy + Math.sin(x / s * Math.PI * 2) * s * 0.35); g.stroke(); g.beginPath(); for (x = -s; x <= s; x += 2) g.lineTo(cx + x, cy + s * 0.5 + Math.sin(x / s * Math.PI * 2) * s * 0.35); g.stroke(); }
    else if (kind === 'heart') { g.beginPath(); g.moveTo(cx, cy + s * 0.8); g.bezierCurveTo(cx - s * 1.2, cy - s * 0.1, cx - s * 0.5, cy - s, cx, cy - s * 0.35); g.bezierCurveTo(cx + s * 0.5, cy - s, cx + s * 1.2, cy - s * 0.1, cx, cy + s * 0.8); g.fill(); }
    else if (kind === 'eye') { g.beginPath(); g.ellipse(cx, cy, s, s * 0.5, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, s * 0.3, 0, 7); g.fill(); }
    else if (kind === 'number') { g.font = 'bold ' + Math.round(s * 1.9) + 'px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('08', cx, cy + 1); }
    else if (kind === 'sparkle') { [[0, 0, 1], [-1.1, -0.8, 0.45], [1, 0.9, 0.5]].forEach(function (p) { var x = cx + p[0] * s, y = cy + p[1] * s, k = s * p[2]; g.beginPath(); g.moveTo(x, y - k); g.lineTo(x + k * 0.25, y - k * 0.25); g.lineTo(x + k, y); g.lineTo(x + k * 0.25, y + k * 0.25); g.lineTo(x, y + k); g.lineTo(x - k * 0.25, y + k * 0.25); g.lineTo(x - k, y); g.lineTo(x - k * 0.25, y - k * 0.25); g.closePath(); g.fill(); }); }
  }
  function patternPaint(g, w, h, kind, c2, seed) {
    var r = rnd(seed || 11), i;
    if (kind === 'stripes') { g.fillStyle = c2; for (i = 6; i < h; i += 14) g.fillRect(0, i, w, 4); }
    else if (kind === 'check') { g.globalAlpha = 0.35; g.fillStyle = c2; for (i = 0; i < w; i += 16) g.fillRect(i, 0, 6, h); for (i = 0; i < h; i += 16) g.fillRect(0, i, w, 6); g.globalAlpha = 1; }
    else if (kind === 'flames') { g.fillStyle = c2; for (i = 0; i < w; i += 18) { g.beginPath(); g.moveTo(i, h); g.quadraticCurveTo(i + 2, h * 0.55, i + 9, h * (0.45 + r() * 0.15)); g.quadraticCurveTo(i + 12, h * 0.7, i + 18, h); g.fill(); } }
    else if (kind === 'leopard') { g.fillStyle = c2; for (i = 0; i < 60; i++) { var x = r() * w, y = r() * h; g.beginPath(); g.ellipse(x, y, 3 + r() * 3, 2 + r() * 2, r() * 3, 0, 7); g.fill(); } }
  }
  function topTex(L, part) {
    var t = L.top, sleeve = { tee: 0.55, crop: 0.45, shirt: 0.55, hawaii: 0.5, vest: 0, corset: 0, sequin: 0.2, longtee: 1, track: 1, hoodie: 1, bomber: 1, leather: 1 }[t.style];
    var key = 'top|' + part + '|' + JSON.stringify(t) + '|' + L.skin + '|' + L.tattoo + '|' + L.metallic;
    return tex(key, part === 'torso' ? 256 : 64, part === 'torso' ? 128 : 64, function (g, w, h) {
      var c1 = t.c1, c2 = t.c2;
      if (part === 'arm') {   // upper part sleeve, rest skin (tattoos painted on the skin)
        var sh = Math.round(h * (sleeve === undefined ? 0.55 : sleeve));
        shadeBand(g, w, h, L.skin); grain(g, w, h, hex(L.skin, -0.2), 80, 0.12, 5);
        if (L.tattoo === 'sleeve') { g.fillStyle = 'rgba(30,40,60,.55)'; for (var k = 0; k < 9; k++) { g.beginPath(); g.arc(8 + k * 7, sh + 8 + (k % 3) * 14, 5, 0, 7); g.fill(); } }
        if (L.tattoo === 'band') { g.fillStyle = 'rgba(30,30,40,.7)'; g.fillRect(0, Math.min(h - 10, sh + 6), w, 5); }
        if (L.tattoo === 'rose') { g.fillStyle = 'rgba(170,30,50,.75)'; g.beginPath(); g.arc(w * 0.75, Math.min(h - 12, sh + 14), 5, 0, 7); g.fill(); }
        if (L.tattoo === 'stars') { g.fillStyle = 'rgba(30,30,40,.7)'; graphicPaint(g, 'star', w * 0.72, Math.min(h - 10, sh + 10), 4, 'rgba(30,30,40,.75)'); }
        if (sh > 0) { shadeBand(g, w, sh, c1); grain(g, w, sh, hex(c1, -0.3), 60, 0.15, 6); g.fillStyle = hex(c1, -0.35); g.fillRect(0, sh - 2, w, 2); }
        if (t.style === 'track' && sh) { g.fillStyle = c2; g.fillRect(w * 0.45, 0, 4, sh); g.fillRect(w * 0.45 + 6, 0, 2, sh); }
        if (t.style === 'hoodie' || t.style === 'track' || t.style === 'bomber') { g.fillStyle = hex(c1, -0.25); g.fillRect(0, h - 6, w, 6); }   // cuffs
        return;
      }
      // torso: front is the middle of the strip (u = 0.5)
      shadeBand(g, w, h, c1);
      if (L.metallic || t.style === 'sequin') { var r = rnd(9); for (var y = 0; y < h; y += 3) for (var x = (y / 3) % 2 ? 1 : 0; x < w; x += 3) { g.fillStyle = r() > 0.5 ? hex(c1, 0.35) : hex(c1, -0.25); g.fillRect(x, y, 2, 2); } }
      else grain(g, w, h, hex(c1, -0.3), 500, 0.12, 8);
      // painted folds and stitching
      g.strokeStyle = hex(c1, -0.28); g.lineWidth = 2; g.globalAlpha = 0.6;
      [0.38, 0.62].forEach(function (u) { g.beginPath(); g.moveTo(w * u, h * 0.55); g.quadraticCurveTo(w * (u + 0.02), h * 0.75, w * (u - 0.01), h); g.stroke(); });
      g.globalAlpha = 1; g.fillStyle = hex(c1, -0.35);
      for (var s = 0; s < w; s += 6) g.fillRect(s, h - 5, 3, 1);   // hem stitching
      g.fillRect(0, h - 3, w, 3);
      if (['stripes', 'check', 'flames', 'leopard'].indexOf(t.graphic) !== -1) patternPaint(g, w, h, t.graphic, c2, 12);
      else if (t.graphic && t.graphic !== 'none') graphicPaint(g, t.graphic, w * 0.5, h * 0.42, h * 0.16, c2);
      if (t.style === 'hawaii') { var rr = rnd(21); for (var f = 0; f < 26; f++) { var fx = rr() * w, fy = rr() * h; g.fillStyle = rr() > 0.5 ? c2 : hex(c2, -0.3); for (var p = 0; p < 5; p++) { g.beginPath(); g.ellipse(fx + Math.cos(p * 1.26) * 4, fy + Math.sin(p * 1.26) * 4, 3, 2, p, 0, 7); g.fill(); } g.fillStyle = '#ffd36b'; g.fillRect(fx - 1, fy - 1, 2, 2); } }
      if (t.style === 'shirt' || t.style === 'hawaii') { g.fillStyle = hex(c1, -0.3); g.fillRect(w * 0.5 - 1, 0, 2, h); for (var b = 10; b < h - 8; b += 16) { g.fillStyle = '#f5f0e6'; g.fillRect(w * 0.5 + 2, b, 3, 3); } }
      if (t.style === 'track') { g.fillStyle = '#d9d9d9'; g.fillRect(w * 0.5 - 1, 0, 2, h); g.fillStyle = c2; g.fillRect(w * 0.18, 0, 4, h); g.fillRect(w * 0.82 - 4, 0, 4, h); }
      if (t.style === 'hoodie') { g.fillStyle = hex(c1, -0.22); g.fillRect(w * 0.38, h * 0.62, w * 0.24, h * 0.26); g.strokeStyle = '#eee'; g.lineWidth = 1; g.beginPath(); g.moveTo(w * 0.47, 0); g.lineTo(w * 0.46, h * 0.3); g.moveTo(w * 0.53, 0); g.lineTo(w * 0.54, h * 0.3); g.stroke(); }
      if (t.style === 'corset') { g.strokeStyle = c2; g.lineWidth = 1; for (var l = 8; l < h - 6; l += 9) { g.beginPath(); g.moveTo(w * 0.47, l); g.lineTo(w * 0.53, l + 6); g.moveTo(w * 0.53, l); g.lineTo(w * 0.47, l + 6); g.stroke(); } [0.3, 0.7].forEach(function (u) { g.fillStyle = hex(c1, -0.35); g.fillRect(w * u, 0, 2, h); }); }
      if (t.style === 'vest' || t.style === 'crop' || t.style === 'corset' || t.style === 'sequin') { g.fillStyle = L.skin; g.beginPath(); g.ellipse(w * 0.5, 0, w * 0.1, h * 0.12, 0, 0, 7); g.fill(); }   // neckline
      else { g.fillStyle = hex(c1, -0.3); g.fillRect(w * 0.43, 0, w * 0.14, 4); }   // collar band
    });
  }
  function legTex(L) {
    var b = L.bottom, short = b.style === 'shorts', skirt = b.style === 'skirt' || b.style === 'mini';
    return tex('leg|' + JSON.stringify(b) + '|' + L.skin, 64, 128, function (g, w, h) {
      if (skirt) { shadeBand(g, w, h, L.skin); grain(g, w, h, hex(L.skin, -0.2), 120, 0.1, 13); if (b.style === 'skirt') { g.fillStyle = 'rgba(20,10,15,.35)'; g.fillRect(0, 0, w, h); } return; }   // tights tint under a long skirt
      var cover = short ? 0.45 : 1, ch = Math.round(h * cover);
      shadeBand(g, w, h, L.skin); grain(g, w, h, hex(L.skin, -0.2), 100, 0.1, 14);
      shadeBand(g, w, ch, b.c1);
      if (b.style === 'jeans' || b.style === 'flares') {   // denim twill and seams
        var r = rnd(15); g.globalAlpha = 0.18; for (var i = 0; i < 500; i++) { g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000'; g.fillRect(r() * w, r() * ch, 1, 1); } g.globalAlpha = 1;
        g.fillStyle = '#d6a531'; for (var y = 4; y < ch; y += 5) { g.fillRect(4, y, 1, 2); g.fillRect(w - 5, y, 1, 2); }
        g.fillStyle = hex(b.c1, 0.25); g.fillRect(w * 0.4, ch * 0.35, w * 0.2, ch * 0.15);   // worn knee
      }
      if (b.style === 'trackies') { g.fillStyle = b.c2; g.fillRect(0, 0, 3, ch); g.fillRect(w - 3, 0, 3, ch); }
      if (b.style === 'cargos') { g.fillStyle = hex(b.c1, -0.2); g.fillRect(w * 0.6, ch * 0.3, w * 0.35, ch * 0.18); g.fillStyle = hex(b.c1, -0.35); g.fillRect(w * 0.6, ch * 0.3, w * 0.35, 2); }
      g.fillStyle = hex(b.c1, -0.35); g.fillRect(0, ch - 3, w, 3);
    });
  }
  function shoeTex(L) {
    var s = L.shoes;
    return tex('shoe|' + JSON.stringify(s), 64, 32, function (g, w, h) {
      shadeBand(g, w, h, s.c1); grain(g, w, h, hex(s.c1, -0.3), 60, 0.15, 17);
      if (s.style === 'retro' || s.style === 'skate') { g.fillStyle = '#f5f2ea'; g.fillRect(0, h - 7, w, 7); g.fillStyle = s.c2; g.beginPath(); g.moveTo(w * 0.15, h * 0.7); g.quadraticCurveTo(w * 0.45, h * 0.15, w * 0.75, h * 0.6); g.lineWidth = 3; g.strokeStyle = s.c2; g.stroke(); g.fillStyle = '#ddd'; for (var x = 10; x < 30; x += 5) g.fillRect(x, 3, 3, 1); }
      if (s.style === 'boots') { g.fillStyle = '#2a1a10'; g.fillRect(0, h - 6, w, 6); for (var y = 2; y < h - 8; y += 4) { g.fillStyle = '#d6a531'; g.fillRect(w * 0.5, y, 2, 2); } }
      if (s.style === 'platforms') { g.fillStyle = s.c2; g.fillRect(0, h - 12, w, 12); }
      if (s.style === 'heels') { g.fillStyle = hex(s.c1, 0.3); g.fillRect(0, 0, w, 3); }
    });
  }
  function faceTex(L) {
    var F = L.face, key = 'face|' + L.skin + '|' + JSON.stringify(F) + '|' + L.hair.c + '|' + L.frame;
    return tex(key, 256, 128, function (g, w, h) {
      // the head's strip: the face is painted at the middle (u = 0.5), the back of the head at the edges
      g.fillStyle = L.skin; g.fillRect(0, 0, w, h); grain(g, w, h, hex(L.skin, -0.2), 600, 0.1, 19);
      var cx = w * 0.5, cy = h * 0.56, rg = function (x, y, r, col) { var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
      // painted shading: eye sockets, cheeks, under the nose, jaw
      [-1, 1].forEach(function (s) { rg(cx + s * 14, cy - 8, 10, 'rgba(70,30,20,.22)'); rg(cx + s * 20, cy + 8, 9, 'rgba(210,90,90,.18)'); });
      rg(cx, cy + 22, 26, 'rgba(60,25,15,.12)');
      var ink = '#1c120e', eyeC = F.eyeC || '#4a2f1d';
      // eyes
      [-1, 1].forEach(function (s) {
        var ex = cx + s * 12, ey = cy - 6, ew = F.eyes === 'narrow' ? 6 : F.eyes === 'round' ? 5.5 : 6, eh = F.eyes === 'narrow' ? 2 : F.eyes === 'round' ? 4 : F.eyes === 'sleepy' ? 2.5 : 3;
        g.fillStyle = '#f7f3ee'; g.beginPath(); g.ellipse(ex, ey, ew, eh, 0, 0, 7); g.fill();
        g.fillStyle = eyeC; g.beginPath(); g.arc(ex + s * 0.5, ey, Math.min(eh, 2.8), 0, 7); g.fill();
        g.fillStyle = '#000'; g.fillRect(ex + s * 0.5 - 1, ey - 1, 2, 2);
        g.fillStyle = '#fff'; g.fillRect(ex + s * 0.5 + 1, ey - 2, 1, 1);
        g.strokeStyle = ink; g.lineWidth = F.eyes === 'lashes' ? 2 : 1.2; g.beginPath(); g.ellipse(ex, ey, ew, eh, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        if (F.eyes === 'lashes') { for (var k = 0; k < 3; k++) { g.beginPath(); g.moveTo(ex + s * (3 + k * 1.6), ey - eh + 0.5); g.lineTo(ex + s * (5 + k * 2), ey - eh - 3); g.stroke(); } }
        if (F.eyes === 'sleepy') { g.fillStyle = L.skin; g.fillRect(ex - ew, ey - eh - 1, ew * 2, eh); }
        // brows
        var bw = F.brows === 'thick' ? 3 : F.brows === 'thin' ? 1 : 2;
        g.strokeStyle = hex(L.hair.c, 0.05); g.lineWidth = bw; g.beginPath();
        if (F.brows === 'arched') { g.moveTo(ex - s * 7, ey - 6); g.quadraticCurveTo(ex, ey - 12, ex + s * 8, ey - 7); }
        else { g.moveTo(ex - s * 7, ey - 7); g.lineTo(ex + s * 8, ey - 8); }
        g.stroke();
      });
      // nose
      g.strokeStyle = 'rgba(80,35,25,.55)'; g.lineWidth = 1.4;
      var nw = F.nose === 'wide' ? 6 : F.nose === 'button' ? 3 : 4, nl = F.nose === 'long' ? 12 : 8;
      g.beginPath(); g.moveTo(cx - 1, cy - 2); g.lineTo(cx - 2, cy + nl - 2); g.stroke();
      g.beginPath(); g.moveTo(cx - nw, cy + nl); g.quadraticCurveTo(cx, cy + nl + 3, cx + nw, cy + nl); g.stroke();
      // mouth
      var my = cy + 20, lips = F.lips || (L.frame === 'f' ? '#a8344e' : hex(L.skin, -0.35));
      g.fillStyle = lips; g.strokeStyle = hex(lips, -0.3); g.lineWidth = 1.4;
      if (F.mouth === 'smile' || F.mouth === 'grin') { g.beginPath(); g.moveTo(cx - 9, my - 1); g.quadraticCurveTo(cx, my + 7, cx + 9, my - 1); g.quadraticCurveTo(cx, my + 3, cx - 9, my - 1); g.fill(); if (F.mouth === 'grin') { g.fillStyle = '#fff'; g.fillRect(cx - 6, my, 12, 2); } }
      else if (F.mouth === 'smirk') { g.beginPath(); g.moveTo(cx - 8, my + 1); g.quadraticCurveTo(cx + 2, my + 3, cx + 9, my - 2); g.stroke(); }
      else if (F.mouth === 'full') { g.beginPath(); g.moveTo(cx - 9, my); g.quadraticCurveTo(cx - 4, my - 4, cx, my - 2); g.quadraticCurveTo(cx + 4, my - 4, cx + 9, my); g.quadraticCurveTo(cx, my + 6, cx - 9, my); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(cx - 3, my + 1, 4, 1); }
      else { g.beginPath(); g.moveTo(cx - 8, my); g.quadraticCurveTo(cx, my + 2, cx + 8, my); g.stroke(); }
      // facial hair, painted
      var hc = hex(L.hair.c, 0.05);
      if (F.facial === 'stubble') { var r = rnd(23); g.fillStyle = hc; g.globalAlpha = 0.35; for (var i = 0; i < 380; i++) { var a = r() * Math.PI, rr = 14 + r() * 16; g.fillRect(cx + Math.cos(a) * rr * 1.15, cy + 12 + Math.sin(a) * rr * 0.75, 1, 1); } g.globalAlpha = 1; }
      if (F.facial === 'tache' || F.facial === 'goatee' || F.facial === 'beard') { g.fillStyle = hc; g.beginPath(); g.moveTo(cx - 10, my - 2); g.quadraticCurveTo(cx, my - 8, cx + 10, my - 2); g.quadraticCurveTo(cx, my - 4, cx - 10, my - 2); g.fill(); }
      if (F.facial === 'goatee') { g.fillStyle = hc; g.beginPath(); g.ellipse(cx, my + 9, 6, 6, 0, 0, 7); g.fill(); }
      if (F.facial === 'beard') { g.fillStyle = hc; g.beginPath(); g.moveTo(cx - 30, cy - 4); g.quadraticCurveTo(cx - 28, my + 18, cx, my + 20); g.quadraticCurveTo(cx + 28, my + 18, cx + 30, cy - 4); g.lineTo(cx + 22, cy + 6); g.quadraticCurveTo(cx + 16, my + 8, cx, my + 8); g.quadraticCurveTo(cx - 16, my + 8, cx - 22, cy + 6); g.closePath(); g.fill(); grain(g, w, h, hex(hc, 0.3), 120, 0.2, 29); }
      // painted hairline on the forehead and back of the head (hair meshes sit on top)
      if (L.hair.style !== 'bald') { g.fillStyle = L.hair.c; g.fillRect(0, 0, w, h * 0.16); g.fillRect(0, 0, w * 0.18, h * 0.62); g.fillRect(w * 0.82, 0, w * 0.18, h * 0.62); }
      // glasses
      if (F.glasses && F.glasses !== 'none') {
        g.strokeStyle = F.glasses === 'shades' || F.glasses === 'visor' ? '#111' : '#2a2a2a'; g.lineWidth = 2;
        if (F.glasses === 'visor') { g.fillStyle = 'rgba(40,200,220,.75)'; g.fillRect(cx - 24, cy - 12, 48, 11); g.strokeRect(cx - 24, cy - 12, 48, 11); }
        else [-1, 1].forEach(function (s) { var ex = cx + s * 12, ey = cy - 6; g.beginPath(); if (F.glasses === 'round') g.arc(ex, ey, 7, 0, 7); else g.rect(ex - 8, ey - 5, 16, 10); if (F.glasses === 'shades') { g.fillStyle = 'rgba(10,10,15,.88)'; g.fill(); } g.stroke(); });
        g.beginPath(); g.moveTo(cx - 4, cy - 7); g.lineTo(cx + 4, cy - 7); g.stroke();
      }
    });
  }
  function hairTex(L) {
    return tex('hair|' + L.hair.c + '|' + L.hair.style, 64, 64, function (g, w, h) {
      var c = L.hair.c; shadeBand(g, w, h, c);
      // painted strands
      var r = rnd(31); g.lineWidth = 1;
      for (var i = 0; i < 70; i++) { var x = r() * w; g.strokeStyle = r() > 0.5 ? hex(c, 0.28) : hex(c, -0.35); g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (r() - 0.5) * 10, h * 0.5, x + (r() - 0.5) * 6, h); g.stroke(); }
      if (L.hair.style === 'curls' || L.hair.style === 'afro') { for (i = 0; i < 90; i++) { g.strokeStyle = hex(c, r() > 0.5 ? 0.25 : -0.3); g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 2, 0, 5); g.stroke(); } }
    });
  }

  // ---------- geometry ----------
  function lambert(map, color, extra) {
    var m = new T.MeshLambertMaterial(Object.assign({ map: map || null, color: color || '#ffffff' }, extra || {}));
    m.userData.ps2 = true; return m;
  }
  function cyl(rt, rb, h, seg, open) { var gm = new T.CylinderGeometry(rt, rb, h, seg || 7, 1, !!open, Math.PI, Math.PI * 2); gm.translate(0, -h / 2, 0); return gm; }
  function mesh(gm, mat, x, y, z) { var m = new T.Mesh(gm, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = false; return m; }
  function joint(name, parent, x, y, z) { var j = new T.Group(); j.name = name; j.position.set(x, y, z); parent.add(j); return j; }

  // ---------- the body: ONE continuous skinned mesh (no ball joints), clothes painted into its textures ----------
  // Each part is a loft: rings of points around a line, joined into a tube, smooth-shaded, and weighted to the
  // bones so elbows and knees bend in one piece (how characters were built for consoles of that era).
  var BODY_FRONT = 0.5;   // u = 0.5 is the front of every part; u = 0 / 1 the back
  function loft(rings, sides, bones) {
    // rings: [{ y, x, z, rx, rz, v, w: [[bone, weight], ...], f(x,z,ang) optional reshaper }] in bind pose (world space)
    var pos = [], uv = [], si = [], sw = [], idx = [];
    rings.forEach(function (r, ri) {
      for (var k = 0; k <= sides; k++) {
        var a = (k / sides) * Math.PI * 2, x = Math.sin(a) * r.rx, z = -Math.cos(a) * r.rz;
        if (r.f) { var q = r.f(x, z, a); x = q[0]; z = q[1]; }
        pos.push(r.x + x, r.y, r.z + z); uv.push(k / sides, r.v);
        var w = r.w(x, z), tot = 0, ws = [0, 0, 0, 0], is = [0, 0, 0, 0];
        w.slice(0, 4).forEach(function (p, j) { is[j] = bones.indexOf(p[0]); ws[j] = p[1]; tot += p[1]; });
        for (var j = 0; j < 4; j++) ws[j] /= tot || 1;
        si.push.apply(si, is); sw.push.apply(sw, ws);
      }
      if (ri) for (var k2 = 0; k2 < sides; k2++) { var a0 = (ri - 1) * (sides + 1) + k2, b0 = ri * (sides + 1) + k2; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    });
    // close the ends with a fan so no part is ever hollow
    [0, rings.length - 1].forEach(function (ri, e) {
      var r = rings[ri], c = pos.length / 3; pos.push(r.x, r.y + (e ? 0.004 : -0.004), r.z); uv.push(0.5, r.v);
      var w = r.w(0, 0), ws = [0, 0, 0, 0], is = [0, 0, 0, 0], tot = 0; w.slice(0, 4).forEach(function (p, j) { is[j] = bones.indexOf(p[0]); ws[j] = p[1]; tot += p[1]; }); for (var j = 0; j < 4; j++) ws[j] /= tot || 1;
      si.push.apply(si, is); sw.push.apply(sw, ws);
      for (var k = 0; k < sides; k++) { var a = ri * (sides + 1) + k; if (e) idx.push(a, a + 1, c); else idx.push(a + 1, a, c); }
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function blend(a, b, t) { t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t); return [[a, 1 - t], [b, t]]; }
  function bump(x, c, s) { return Math.exp(-((x - c) * (x - c)) / (2 * s * s)); }

  /** Painted body textures. Each maps a part's length (v) to world height, so clothes land in the right place. */
  function torsoPaint(L, Y) {
    var t = L.top, b = L.bottom, sk = L.skin, c1 = t.c1, c2 = t.c2, jacket = ['bomber', 'leather', 'track', 'hoodie'].indexOf(t.style) !== -1;
    return tex('torso2|' + JSON.stringify(t) + JSON.stringify(b) + sk + L.frame + L.metallic, 128, 128, function (g, w, h) {
      var py = function (y) { return Math.round((1 - Y(y)) * h); };
      // skin, then the bottoms up to the waistband, then the top
      g.fillStyle = sk; g.fillRect(0, 0, w, h); grain(g, w, h, hex(sk, -0.2), 300, 0.1, 51);
      var waist = py(1.02), hem = t.style === 'crop' ? py(1.2) : t.style === 'corset' ? py(1.05) : py(0.97);
      g.fillStyle = b.c1; g.fillRect(0, waist, w, h - waist);
      if (b.style === 'jeans' || b.style === 'flares' || b.style === 'cargos') { g.fillStyle = hex(b.c1, -0.35); g.fillRect(0, waist, w, 3); g.fillStyle = '#d6a531'; for (var x = 0; x < w; x += 6) g.fillRect(x, waist + 5, 3, 1); g.fillStyle = hex(b.c1, -0.25); g.fillRect(w * 0.47, waist + 3, 2, 10); }
      if (b.style === 'trackies') { g.fillStyle = hex(b.c1, -0.25); g.fillRect(0, waist, w, 5); g.fillStyle = '#eee'; g.fillRect(w * 0.48, waist + 4, 1, 8); g.fillRect(w * 0.52, waist + 4, 1, 8); }
      // the top: from the hem up to the neckline
      var neck = py(1.455);
      var topBand = function () { var gr = g.createLinearGradient(0, neck, 0, hem); gr.addColorStop(0, hex(c1, 0.06)); gr.addColorStop(0.75, c1); gr.addColorStop(1, hex(c1, -0.18)); g.fillStyle = gr; g.fillRect(0, neck, w, hem - neck); };
      topBand();
      if (L.metallic || t.style === 'sequin') { var r = rnd(9); for (var yy = neck; yy < hem; yy += 3) for (var xx = (yy / 3) % 2 ? 1 : 0; xx < w; xx += 3) { g.fillStyle = r() > 0.5 ? hex(c1, 0.4) : hex(c1, -0.25); g.fillRect(xx, yy, 2, 2); } }
      else grain(g, w, hem - neck, hex(c1, -0.3), 260, 0.12, 52);
      // folds: under the chest and at the sides of the waist (painted shading, the PS2 trick)
      g.globalAlpha = 0.22; g.strokeStyle = hex(c1, -0.5); g.lineWidth = 2;
      [0.36, 0.64].forEach(function (u) { g.beginPath(); g.moveTo(w * u, py(1.2)); g.quadraticCurveTo(w * (u + (u < 0.5 ? -0.04 : 0.04)), py(1.08), w * u, hem); g.stroke(); });
      g.beginPath(); g.moveTo(w * 0.3, py(1.24)); g.quadraticCurveTo(w * 0.5, py(1.2), w * 0.7, py(1.24)); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = hex(c1, -0.3); g.fillRect(0, hem - 3, w, 3);   // hem
      // the front: necklines, plackets, zips, prints
      var fx = w * BODY_FRONT;
      if (['vest', 'crop', 'corset', 'sequin'].indexOf(t.style) !== -1) {
        g.fillStyle = sk; g.beginPath(); g.ellipse(fx, neck, w * 0.09, (py(1.36) - neck) * (t.style === 'vest' ? 1 : 0.8), 0, 0, 7); g.fill();
        // armholes (vests) or strapless (corset, sequin): skin over the shoulders
        if (t.style === 'vest' || t.style === 'crop') [0.25, 0.75].forEach(function (u) { g.fillStyle = sk; g.beginPath(); g.ellipse(w * u, neck, w * 0.1, py(1.33) - neck, 0, 0, 7); g.fill(); });
        else { g.fillStyle = sk; g.fillRect(0, neck, w, py(1.36) - neck); g.fillStyle = hex(c1, -0.3); g.fillRect(0, py(1.36), w, 2); }
      } else if (jacket) {
        if (t.style !== 'hoodie') { g.fillStyle = c2; g.fillRect(fx - w * 0.07, neck, w * 0.14, hem - neck); }   // the tee underneath shows at the open front
        g.fillStyle = hex(c1, -0.35); g.fillRect(fx - w * 0.075, neck, 2, hem - neck); g.fillRect(fx + w * 0.07, neck, 2, hem - neck);
        if (t.style === 'leather' || t.style === 'bomber') { g.fillStyle = hex(c1, -0.2); g.beginPath(); g.moveTo(fx - w * 0.075, neck); g.lineTo(fx - w * 0.16, neck); g.lineTo(fx - w * 0.075, py(1.3)); g.fill(); g.beginPath(); g.moveTo(fx + w * 0.075, neck); g.lineTo(fx + w * 0.16, neck); g.lineTo(fx + w * 0.075, py(1.3)); g.fill(); }
        if (t.style === 'leather') { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(w * 0.3, neck, 3, hem - neck); g.fillRect(w * 0.68, neck, 3, hem - neck); }
        if (t.style === 'track') { g.fillStyle = '#d9d9d9'; g.fillRect(fx - 1, neck, 2, hem - neck); g.fillStyle = c2; g.fillRect(w * 0.22, neck, 3, hem - neck); g.fillRect(w * 0.78 - 3, neck, 3, hem - neck); }
        if (t.style === 'hoodie') { g.fillStyle = hex(c1, -0.18); g.fillRect(fx - w * 0.13, py(1.14), w * 0.26, py(1.02) - py(1.14)); g.strokeStyle = '#eee'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx - 4, neck); g.lineTo(fx - 5, py(1.33)); g.moveTo(fx + 4, neck); g.lineTo(fx + 5, py(1.33)); g.stroke(); }
        g.fillStyle = hex(c1, -0.3); g.fillRect(0, hem - 6, w, 6);   // ribbed hem
      } else {
        g.fillStyle = sk; g.beginPath(); g.ellipse(fx, neck, w * 0.06, (py(1.42) - neck), 0, 0, 7); g.fill();   // crew neck
        g.strokeStyle = hex(c1, -0.35); g.lineWidth = 2; g.beginPath(); g.ellipse(fx, neck, w * 0.065, (py(1.415) - neck), 0, 0, Math.PI); g.stroke();
        if (t.style === 'shirt' || t.style === 'hawaii') { g.fillStyle = hex(c1, -0.25); g.fillRect(fx - 1, neck, 2, hem - neck); for (var bt = py(1.38); bt < hem - 4; bt += 9) { g.fillStyle = '#f5f0e6'; g.fillRect(fx + 2, bt, 2, 2); } g.fillStyle = hex(c1, 0.15); g.beginPath(); g.moveTo(fx - 2, neck); g.lineTo(fx - w * 0.12, neck); g.lineTo(fx - 3, py(1.4)); g.fill(); g.beginPath(); g.moveTo(fx + 2, neck); g.lineTo(fx + w * 0.12, neck); g.lineTo(fx + 3, py(1.4)); g.fill(); }
      }
      if (t.style === 'hawaii') { var rr = rnd(21); for (var f = 0; f < 22; f++) { var fx2 = rr() * w, fy = neck + rr() * (hem - neck); g.fillStyle = rr() > 0.5 ? c2 : hex(c2, -0.3); for (var p = 0; p < 5; p++) { g.beginPath(); g.ellipse(fx2 + Math.cos(p * 1.26) * 3, fy + Math.sin(p * 1.26) * 3, 2.4, 1.6, p, 0, 7); g.fill(); } } }
      if (t.style === 'corset') { g.strokeStyle = c2; g.lineWidth = 1; for (var l = py(1.34); l < hem - 6; l += 7) { g.beginPath(); g.moveTo(fx - 3, l); g.lineTo(fx + 3, l + 5); g.moveTo(fx + 3, l); g.lineTo(fx - 3, l + 5); g.stroke(); } [0.36, 0.64].forEach(function (u) { g.fillStyle = hex(c1, -0.35); g.fillRect(w * u, py(1.36), 2, hem - py(1.36)); }); }
      var gy = py(1.27);
      if (['stripes', 'check', 'flames', 'leopard'].indexOf(t.graphic) !== -1) { g.save(); g.beginPath(); g.rect(0, neck, w, hem - neck); g.clip(); patternPaint(g, w, h, t.graphic, c2, 12); g.restore(); }
      else if (t.graphic && t.graphic !== 'none' && !jacket) graphicPaint(g, t.graphic, fx, gy, (hem - neck) * 0.16, c2);
      else if (t.graphic && t.graphic !== 'none' && t.style === 'hoodie') graphicPaint(g, t.graphic, fx, gy, (hem - neck) * 0.13, c2);
      // neck at the very top: skin, with a soft shadow under the jaw
      g.fillStyle = sk; g.fillRect(0, 0, w, py(1.5)); var sg = g.createLinearGradient(0, 0, 0, py(1.5)); sg.addColorStop(0, 'rgba(60,25,15,.35)'); sg.addColorStop(1, 'rgba(60,25,15,0)'); g.fillStyle = sg; g.fillRect(0, 0, w, py(1.5));
      if (t.style === 'hoodie' || t.style === 'track' || t.style === 'bomber' || t.style === 'leather') { g.fillStyle = hex(c1, -0.12); g.fillRect(0, py(1.53), w, py(1.47) - py(1.53)); if (t.style !== 'hoodie') { g.fillStyle = sk; g.fillRect(fx - w * 0.05, py(1.53), w * 0.1, py(1.47) - py(1.53)); } }   // collars
    });
  }
  function armPaint(L, Dn) {   // Dn(d): distance down the arm (0 shoulder .. 0.68 fingertips) -> canvas y
    var t = L.top, sleeve = { tee: 0.17, crop: 0.14, shirt: 0.2, hawaii: 0.19, vest: 0, corset: 0, sequin: 0, longtee: 0.5, track: 0.5, hoodie: 0.5, bomber: 0.5, leather: 0.5 }[t.style];
    return tex('arm2|' + JSON.stringify(t) + L.skin + L.tattoo + L.metallic + (L.acc.indexOf('gloves') !== -1), 64, 128, function (g, w, h) {
      var sk = L.skin; g.fillStyle = sk; g.fillRect(0, 0, w, h); grain(g, w, h, hex(sk, -0.2), 160, 0.1, 61);
      // elbow and knuckle shading
      var e = Dn(0.27), sh = g.createLinearGradient(0, e - 8, 0, e + 8); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(70,30,20,.18)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, e - 8, w, 16);
      var se = Dn(sleeve || 0);
      if (L.tattoo === 'sleeve') { g.fillStyle = 'rgba(30,40,60,.55)'; for (var k = 0; k < 12; k++) { g.beginPath(); g.arc((k * 17) % w, se + 6 + (k % 4) * 12, 4, 0, 7); g.fill(); } }
      if (L.tattoo === 'band') { g.fillStyle = 'rgba(30,30,40,.7)'; g.fillRect(0, Math.max(se + 4, Dn(0.22)), w, 4); }
      if (L.tattoo === 'rose') { g.fillStyle = 'rgba(170,30,50,.75)'; g.beginPath(); g.arc(w * 0.75, Dn(0.36), 4, 0, 7); g.fill(); g.fillStyle = 'rgba(40,110,50,.75)'; g.fillRect(w * 0.75 - 1, Dn(0.36) + 3, 2, 6); }
      if (L.tattoo === 'stars') graphicPaint(g, 'star', w * 0.72, Dn(0.34), 3, 'rgba(30,30,40,.75)');
      if (sleeve) {
        var gr = g.createLinearGradient(0, 0, 0, se); gr.addColorStop(0, t.c1); gr.addColorStop(1, hex(t.c1, -0.15)); g.fillStyle = gr; g.fillRect(0, 0, w, se);
        if (L.metallic || t.style === 'sequin') { var r = rnd(19); for (var y = 0; y < se; y += 3) for (var x = 0; x < w; x += 3) { g.fillStyle = r() > 0.5 ? hex(t.c1, 0.4) : hex(t.c1, -0.25); g.fillRect(x, y, 2, 2); } }
        else grain(g, w, se, hex(t.c1, -0.3), 80, 0.14, 62);
        if (t.style === 'hawaii') { var rr = rnd(23); for (var f = 0; f < 6; f++) { g.fillStyle = t.c2; g.beginPath(); g.arc(rr() * w, rr() * se, 2, 0, 7); g.fill(); } }
        if (t.style === 'track') { g.fillStyle = t.c2; g.fillRect(w * 0.25 - 3, 0, 3, se); g.fillRect(w * 0.25 + 2, 0, 2, se); }
        // folds at the elbow of long sleeves, and the cuff
        if (sleeve >= 0.5) { g.strokeStyle = hex(t.c1, -0.35); g.globalAlpha = 0.5; for (var fo = -1; fo <= 1; fo++) { g.beginPath(); g.moveTo(w * 0.35, e + fo * 4); g.quadraticCurveTo(w * 0.5, e + fo * 4 + 3, w * 0.65, e + fo * 4); g.stroke(); } g.globalAlpha = 1; }
        g.fillStyle = hex(t.c1, -0.3); g.fillRect(0, se - (sleeve >= 0.5 ? 6 : 3), w, sleeve >= 0.5 ? 6 : 3);
      }
      if (L.acc.indexOf('gloves') !== -1) { g.fillStyle = '#1a1a1a'; g.fillRect(0, Dn(0.47), w, h); }
    });
  }
  function legPaint(L, Dn) {   // Dn(d): distance down the leg (0 hip .. 0.84 ankle) -> canvas y
    var b = L.bottom, skirt = b.style === 'skirt' || b.style === 'mini', len = b.style === 'shorts' ? 0.34 : skirt ? 0 : 0.84;
    return tex('leg2|' + JSON.stringify(b) + L.skin, 64, 128, function (g, w, h) {
      var sk = L.skin; g.fillStyle = sk; g.fillRect(0, 0, w, h); grain(g, w, h, hex(sk, -0.2), 160, 0.1, 71);
      var kn = Dn(0.42), sh = g.createLinearGradient(0, kn - 8, 0, kn + 8); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(70,30,20,.14)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, kn - 8, w, 16);
      if (b.style === 'skirt') { g.fillStyle = 'rgba(20,10,15,.4)'; g.fillRect(0, 0, w, h); }   // dark tights under a long skirt
      if (!len) return;
      var ch = Dn(len); g.fillStyle = b.c1; g.fillRect(0, 0, w, ch);
      if (b.style === 'jeans' || b.style === 'flares') {
        var r = rnd(15); g.globalAlpha = 0.16; for (var i = 0; i < 400; i++) { g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000'; g.fillRect(r() * w, r() * ch, 1, 1); } g.globalAlpha = 1;
        g.fillStyle = '#d6a531'; for (var y = 2; y < ch; y += 5) { g.fillRect(w * 0.25, y, 1, 2); g.fillRect(w * 0.75, y, 1, 2); }   // side seams
        g.fillStyle = hex(b.c1, 0.22); g.fillRect(w * 0.4, kn - 10, w * 0.2, 18);   // faded knees
        g.fillStyle = hex(b.c1, -0.3); g.fillRect(w * 0.6, Dn(0.03), w * 0.18, 2);  // pocket
      }
      if (b.style === 'trackies') { g.fillStyle = b.c2; g.fillRect(w * 0.25 - 2, 0, 2, ch); g.fillRect(w * 0.25 + 1, 0, 2, ch); }
      if (b.style === 'cargos') { g.fillStyle = hex(b.c1, -0.18); g.fillRect(w * 0.15, Dn(0.2), w * 0.2, Dn(0.34) - Dn(0.2)); g.fillStyle = hex(b.c1, -0.35); g.fillRect(w * 0.15, Dn(0.2), w * 0.2, 2); }
      // creases behind the knee and at the ankle, then the hem
      g.strokeStyle = hex(b.c1, -0.4); g.globalAlpha = 0.45; for (var c = 0; c < 3; c++) { g.beginPath(); g.moveTo(w * 0.85, kn - 5 + c * 4); g.lineTo(w * 0.95, kn - 3 + c * 4); g.stroke(); } g.globalAlpha = 1;
      g.fillStyle = hex(b.c1, -0.32); g.fillRect(0, ch - 3, w, 3);
    });
  }

  /** Build one character. Slightly stylised (a bigger head and hands), like a skate game of the early 2000s. */
  function build(look) {
    var L = normalize(look), f = L.frame === 'f';
    var B = { slim: 0.88, avg: 1, muscular: 1.1, heavy: 1.2 }[L.build] || 1, belly = L.build === 'heavy' ? 1.22 : 1, arm = L.build === 'muscular' ? 1.25 : L.build === 'heavy' ? 1.15 : B, shK = L.build === 'muscular' ? 1.12 : 1;
    var heel = L.shoes.style === 'heels' ? 0.05 : L.shoes.style === 'platforms' ? 0.07 : 0;
    var root = new T.Group(), J = {};
    // ---- the skeleton (bind pose: arms straight down) ----
    var bone = function (name, parent, x, y, z) { var b = new T.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); J[name] = b; return b; };
    var hips = bone('hips', null, 0, 0.92 + heel, 0); root.add(hips);
    var spine = bone('spine', hips, 0, 0.12, 0), neck = bone('neck', spine, 0, 0.42, 0), headB = bone('head', neck, 0, 0.08, 0.005);
    var shX = (f ? 0.142 : 0.16) * B * shK, shY = 0.37;
    ['L', 'R'].forEach(function (side, si) {
      var s = si ? 1 : -1;
      var sb = bone('shoulder' + side, spine, s * shX, shY, 0), eb = bone('elbow' + side, sb, 0, -0.27, 0); bone('hand' + side, eb, 0, -0.245, 0);
      var hb = bone('hip' + side, hips, s * (f ? 0.088 : 0.085) * B, -0.02, 0), kb = bone('knee' + side, hb, 0, -0.42, 0); bone('foot' + side, kb, 0, -0.42 + heel * 0.2, 0);
    });
    root.updateMatrixWorld(true);
    var W = function (name) { var v = new T.Vector3(); J[name].getWorldPosition(v); return v; };
    var names = Object.keys(J), bones = names.map(function (k) { return J[k]; });
    var skinM = lambert(skinTex(L));
    var skinned = function (geo, mat) { var m = new T.SkinnedMesh(geo, mat); m.frustumCulled = false; return m; };
    var meshes = [];
    // ---- torso: crotch to neck, one tube ----
    var y0 = hips.position.y, wst = (f ? 0.118 : 0.142) * B * belly, hipW = (f ? 0.168 : 0.148) * B, ch = (f ? 0.15 : 0.172) * B * shK, shW = (f ? 0.162 : 0.19) * B * shK;
    var jacketK = ['bomber', 'leather', 'hoodie', 'track'].indexOf(L.top.style) !== -1 ? 1.06 : 1;
    var TR = [   // [height above the hips joint, half width, half depth]
      [-0.07, hipW * 0.78, 0.085 * B], [-0.02, hipW * 0.98, 0.1 * B], [0.04, hipW, 0.105 * B], [0.1, wst * 1.06, 0.098 * B * belly], [0.18, wst, 0.092 * B * belly],
      [0.27, ch * 0.92 * jacketK, 0.1 * B * jacketK], [0.36, ch * jacketK, 0.112 * B * jacketK], [0.43, shW * 0.95 * jacketK, 0.104 * B * jacketK], [0.48, shW * 0.82 * jacketK, 0.09 * B * jacketK],
      [0.52, shW * 0.58, 0.072 * B], [0.55, 0.064, 0.058], [0.58, 0.056, 0.054], [0.63, 0.052, 0.05]
    ];
    var yMin = y0 + TR[0][0], yMax = y0 + TR[TR.length - 1][0], Yt = function (yw) { return (yw - yMin) / (yMax - yMin); };
    var bust = f ? 0.035 * B : 0;
    var torsoG = loft(TR.map(function (q) {
      var y = y0 + q[0];
      return { y: y, x: 0, z: q[0] > 0.5 ? 0.008 : 0, rx: q[1], rz: q[2], v: Yt(y),
        f: function (x, z) {
          if (z > 0 && bust && q[0] > 0.28 && q[0] < 0.44) z += bust * Math.max(bump(x, 0.06, 0.04), bump(x, -0.06, 0.04)) * Math.sin((q[0] - 0.28) / 0.16 * Math.PI);
          if (z > 0 && L.build === 'heavy' && q[0] > 0.04 && q[0] < 0.26) z += 0.03 * Math.sin((q[0] - 0.04) / 0.22 * Math.PI);
          if (z < 0 && q[0] < 0.06 && q[0] > -0.05) z -= (f ? 0.03 : 0.015) * B;   // seat
          if (q[0] > 0.4 && q[0] < 0.56) { var sq = Math.abs(x) / q[1]; z *= 1 - sq * sq * 0.25; }   // flatter across the shoulders
          return [x, z];
        },
        w: function (x) {
          var wts = q[0] < 0.08 ? blend('hips', 'spine', (q[0] + 0.02) / 0.1) : q[0] < 0.5 ? [['spine', 1]] : q[0] < 0.57 ? blend('spine', 'neck', (q[0] - 0.5) / 0.06) : blend('neck', 'head', (q[0] - 0.57) / 0.06);
          if (q[0] > 0.38 && q[0] < 0.56 && Math.abs(x) > shW * 0.55) { var k = Math.min(0.55, (Math.abs(x) - shW * 0.55) / (shW * 0.45) * 0.55); wts = wts.map(function (p) { return [p[0], p[1] * (1 - k)]; }).concat([[x < 0 ? 'shoulderL' : 'shoulderR', k]]); }
          return wts;
        } };
    }), 14, names);
    meshes.push(skinned(torsoG, lambert(torsoPaint(L, function (yNominal) { return Yt(yNominal - 0.92 + y0); }))));   // painted in heights for a flat-shod figure
    // ---- arms: shoulder to wrist, the hand a separate rigid piece ----
    var sleeveK = ['longtee', 'track', 'hoodie', 'bomber', 'leather'].indexOf(L.top.style) !== -1 ? 1.12 : 1;
    var armDn = function (d) { return Math.round(d / 0.5 * 128); };
    var armM = lambert(armPaint(L, armDn));
    ['L', 'R'].forEach(function (side, si) {
      var s = si ? 1 : -1, P = W('shoulder' + side), sb = 'shoulder' + side, eb = 'elbow' + side, hb = 'hand' + side;
      var AR = [[0.0, 0.036 * arm, 0.04 * arm], [0.035, 0.05 * arm * sleeveK, 0.05 * arm * sleeveK], [0.07, 0.053 * arm * sleeveK, 0.049 * arm * sleeveK], [0.14, 0.05 * arm * sleeveK, 0.046 * arm * sleeveK], [0.23, 0.041 * arm * sleeveK, 0.04 * arm * sleeveK],
        [0.28, 0.039 * arm * sleeveK, 0.037 * arm * sleeveK], [0.33, 0.042 * arm * sleeveK, 0.039 * arm * sleeveK], [0.42, 0.034 * arm * sleeveK, 0.031 * arm * sleeveK], [0.5, 0.027 * arm, 0.022 * arm]];
      var g = loft(AR.map(function (q) {
        return { y: P.y - q[0], x: P.x, z: P.z, rx: q[1], rz: q[2], v: 1 - Math.max(0, q[0]) / 0.5,
          f: function (x, z) { if (q[0] > 0.28 && q[0] < 0.44 && z > 0) z *= 1.12; return [x, z]; },   // forearm muscle
          w: function () { return q[0] < 0.2 ? [[sb, 1]] : q[0] < 0.34 ? blend(sb, eb, (q[0] - 0.2) / 0.14) : q[0] < 0.46 ? [[eb, 1]] : blend(eb, hb, (q[0] - 0.46) / 0.05); } };
      }), 9, names);
      meshes.push(skinned(g, armM));
      // hand: a tapered, slightly cupped palm with a thumb (rigid on the hand bone)
      var gl = L.acc.indexOf('gloves') !== -1, hm = gl ? lambert(null, '#1a1a1a') : skinM;
      var hg = new T.BoxGeometry(0.062 * arm, 0.1, 0.032, 2, 3, 1), hp = hg.attributes.position;
      for (var i = 0; i < hp.count; i++) { var hy = hp.getY(i), k = 1 - Math.max(0, -hy) * 2.4; hp.setX(i, hp.getX(i) * k); hp.setZ(i, hp.getZ(i) * (0.9 + 0.1 * k) + Math.max(0, -hy - 0.02) * 0.25); }
      hg.translate(0, -0.05, 0); hg.computeVertexNormals();
      var hand = new T.Mesh(hg, hm); J[hb].add(hand);
      var th = new T.Mesh(new T.BoxGeometry(0.02, 0.05, 0.022), hm); th.position.set(-s * 0.03 * arm, -0.03, 0.018); th.rotation.set(0.3, 0, s * 0.45); J[hb].add(th);
    });
    // ---- legs: hip to ankle ----
    var fit = { skinny: 0.9, regular: 1, baggy: 1.28 }[L.bottom.fit] || 1, flare = L.bottom.style === 'flares', bare = L.bottom.style === 'shorts' || L.bottom.style === 'skirt' || L.bottom.style === 'mini';
    var legDn = function (d) { return Math.round(d / 0.84 * 128); };
    var legM = lambert(legPaint(L, legDn));
    ['L', 'R'].forEach(function (side, si) {
      var s = si ? 1 : -1, P = W('hip' + side), hb = 'hip' + side, kb = 'knee' + side, fb = 'foot' + side;
      var cloth = function (d) { return bare && (L.bottom.style !== 'shorts' || d > 0.34) ? 1 : d < 0.42 ? fit : 1 + (fit - 1) * 1.15 + (flare ? (d - 0.42) * 0.9 : 0); };
      var LR = [[-0.04, 0.088], [0.04, 0.084], [0.16, 0.076], [0.3, 0.064], [0.4, 0.052], [0.44, 0.051], [0.5, 0.054], [0.6, 0.053], [0.72, 0.042], [0.84, 0.034]];
      var g = loft(LR.map(function (q) {
        var rr = q[1] * B * (f && q[0] < 0.3 ? 1.06 : 1) * cloth(q[0]);
        return { y: P.y - q[0], x: P.x - s * Math.max(0, q[0]) * 0.012, z: q[0] > 0.44 ? -0.008 : 0, rx: rr, rz: rr * 1.04, v: 1 - Math.max(0, q[0]) / 0.84,
          f: function (x, z) { if (q[0] > 0.46 && q[0] < 0.72 && z < 0) z *= 1.18; return [x, z]; },   // calf
          w: function (x) { return q[0] < 0.04 ? [['hips', 0.5 - q[0] * 5], [hb, 0.5 + q[0] * 5]] : q[0] < 0.36 ? [[hb, 1]] : q[0] < 0.48 ? blend(hb, kb, (q[0] - 0.36) / 0.12) : q[0] < 0.8 ? [[kb, 1]] : blend(kb, fb, (q[0] - 0.8) / 0.04); } };
      }), 10, names);
      meshes.push(skinned(g, legM));
      // the shoe: a lofted sole-and-upper (rigid on the foot bone)
      var fh = L.shoes.style === 'boots' ? 0.12 : L.shoes.style === 'platforms' ? 0.1 : 0.07, sg = new T.BoxGeometry(0.094, fh, 0.24, 3, 2, 4), sp = sg.attributes.position;
      for (var v = 0; v < sp.count; v++) {
        var z = sp.getZ(v), y = sp.getY(v), x = sp.getX(v), toe = Math.max(0, z / 0.12);
        if (y > 0) sp.setY(v, y - fh * 0.55 * toe * toe);                    // the upper slopes down to the toe
        sp.setX(v, x * (1 - 0.25 * toe * toe + (z < -0.06 ? -0.1 : 0)));     // rounded toe, narrower heel
        if (L.shoes.style === 'heels' && z < -0.04) sp.setY(v, sp.getY(v) + heel * 0.6);
      }
      sg.computeVertexNormals();
      var shoe = new T.Mesh(sg, lambert(shoeTex(L))); shoe.position.set(0, -fh / 2 + 0.035, 0.045); J[fb].add(shoe);
      if (L.shoes.style === 'heels') { var hl = new T.Mesh(new T.BoxGeometry(0.018, heel + 0.02, 0.02), lambert(shoeTex(L))); hl.position.set(0, -fh / 2 - heel / 2 + 0.03, -0.075); J[fb].add(hl); }
      if (L.bottom.style === 'boots' || L.shoes.style === 'boots') { var cuff = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.08, 9, 1, true), lambert(shoeTex(L), null, { side: T.DoubleSide })); cuff.position.set(0, 0.07, 0); J[fb].add(cuff); }
    });
    meshes.forEach(function (m) { root.add(m); });
    var skel = new T.Skeleton(bones);
    meshes.forEach(function (m) { m.bind(skel); });
    // ---- head (rigid on the head bone): the painted face, hair and hats from before ----
    var head = new T.Group(); head.position.set(0, 0.095, 0.014); head.scale.setScalar(1.2); headB.add(head);
    var hg2 = new T.SphereGeometry(0.105, 16, 12, -Math.PI / 2, Math.PI * 2), p = hg2.attributes.position;
    var shape = L.face.shape, jawK = shape === 'square' ? 0.06 : shape === 'heart' ? 0.3 : shape === 'round' ? 0.02 : 0.18, hy2 = shape === 'long' ? 1.22 : shape === 'round' ? 1.04 : 1.13, hx = shape === 'round' ? 1.05 : shape === 'long' ? 0.94 : 0.98;
    for (var i2 = 0; i2 < p.count; i2++) {
      var x = p.getX(i2), y = p.getY(i2), z = p.getZ(i2);
      if (y < 0) { var k = 1 - (-y / 0.105) * jawK; x *= k; z *= 1 - (-y / 0.105) * 0.1; }
      if (z > 0.06 && Math.abs(y + 0.005) < 0.03 && Math.abs(x) > 0.025 && Math.abs(x) < 0.07) z -= 0.008;   // eye sockets
      if (z > 0.07 && y > -0.05 && y < -0.015 && Math.abs(x) > 0.04) z += 0.006;                            // cheekbones
      if (z < 0) z *= 0.94;
      p.setXYZ(i2, x * hx, y * hy2, z * 1.02);
    }
    hg2.computeVertexNormals();
    head.add(new T.Mesh(hg2, lambert(faceTex(L))));
    var ng = new T.ConeGeometry(L.face.nose === 'wide' ? 0.021 : 0.016, 0.034, 4); ng.rotateX(Math.PI / 2); ng.scale(1, L.face.nose === 'long' ? 1.25 : 1, 1);
    var nose = new T.Mesh(ng, skinM); nose.position.set(0, -0.012, 0.104); head.add(nose);
    [-1, 1].forEach(function (s) { var ear = new T.Mesh(new T.SphereGeometry(0.022, 5, 4), skinM); ear.scale.set(0.45, 1, 0.8); ear.position.set(s * 0.101 * hx, -0.008, -0.004); head.add(ear); });
    var hairM = lambert(hairTex(L));
    addHair(head, L, hairM, hx, hy2);
    addHeadAcc(head, L);
    // ---- clothes that need their own shape: skirts, hoods ----
    if (L.bottom.style === 'skirt' || L.bottom.style === 'mini') {
      var len = L.bottom.style === 'skirt' ? 0.5 : 0.24;
      var skG = new T.CylinderGeometry(hipW * 1.06, hipW * (L.bottom.style === 'skirt' ? 1.7 : 1.45), len, 12, 2, true, Math.PI, Math.PI * 2); skG.translate(0, -len / 2, 0);
      var sk = new T.Mesh(skG, lambert(tex('skirt2|' + JSON.stringify(L.bottom), 64, 64, function (g, w, h) { shadeBand(g, w, h, L.bottom.c1); grain(g, w, h, hex(L.bottom.c1, -0.3), 160, 0.15, 43); g.strokeStyle = hex(L.bottom.c1, -0.3); for (var x2 = 3; x2 < w; x2 += 8) { g.beginPath(); g.moveTo(x2, 4); g.lineTo(x2 - 2, h); g.stroke(); } g.fillStyle = hex(L.bottom.c1, -0.35); g.fillRect(0, 0, w, 4); }), null, { side: T.DoubleSide }));
      sk.position.set(0, 0.07, 0); sk.scale.set(1, 1, 0.78); hips.add(sk);
    }
    var bigHair = ['long', 'bigvolume', 'afro', 'braids', 'buns', 'ponytail'].indexOf(L.hair.style) !== -1;
    if (L.top.style === 'hoodie' && !bigHair) { var hood = new T.Mesh(new T.TorusGeometry(0.085, 0.038, 6, 12), lambert(null, hex(L.top.c1, -0.08))); hood.position.set(0, 0.45, -0.105); hood.rotation.x = 1.0; hood.scale.set(0.95, 1, 0.62); spine.add(hood); }
    addBodyAcc(spine, L, shW);
    // ---- the resting pose: weight on one leg, arms relaxed, a little attitude ----
    var st = L.stance;
    J.shoulderL.rotation.z = -0.1; J.shoulderR.rotation.z = 0.1; J.elbowL.rotation.x = -0.18; J.elbowR.rotation.x = -0.22;
    J.shoulderL.rotation.x = 0.04; J.shoulderR.rotation.x = -0.03; J.handL.rotation.y = 0.3; J.handR.rotation.y = -0.3;
    if (st === 'wide') { J.hipL.rotation.z = -0.1; J.hipR.rotation.z = 0.1; }
    else if (st === 'hip') { hips.rotation.z = 0.07; J.hipL.rotation.z = -0.04; J.hipR.rotation.z = 0.12; J.kneeR.rotation.x = 0.12; spine.rotation.z = -0.08; J.shoulderR.rotation.z = 0.32; J.elbowR.rotation.z = 0.9; J.elbowR.rotation.x = -0.6; }
    else { hips.rotation.z = 0.03; J.hipR.rotation.z = 0.05; J.kneeR.rotation.x = 0.08; spine.rotation.z = -0.02; J.head.rotation.z = 0.03; }
    var hs = Math.max(0.9, Math.min(1.1, Number(L.height) || 1)); root.scale.setScalar(hs * (f ? 0.96 : 1));
    var tris = 0; root.traverse(function (o) { if (o.isMesh) { var g2 = o.geometry; tris += (g2.index ? g2.index.count : g2.attributes.position.count) / 3; } });
    root.userData = { joints: J, tris: Math.round(tris), look: L, rest: snapshot(J) };
    return root;
  }
  function snapshot(J) { var o = {}; Object.keys(J).forEach(function (k) { o[k] = { r: J[k].rotation.clone(), p: J[k].position.clone() }; }); return o; }

  function addHair(head, L, m, hx, hy) {
    var st = L.hair.style; if (st === 'bald') return;
    var add = function (gm, x, y, z, sx, sy, sz, rx) { var o = mesh(gm, m, x, y, z); o.scale.set(sx || 1, sy || 1, sz || 1); if (rx) o.rotation.x = rx; head.add(o); return o; };
    var cap = function (sc, lift) { return add(new T.SphereGeometry(0.111, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.012 + (lift || 0), -0.006, hx * (sc || 1), hy * 0.95 * (sc || 1), (sc || 1) * 1.04, -0.22); };
    if (st === 'buzz') { cap(0.985); return; }
    if (st === 'fade' || st === 'cornrow') { cap(1); if (st === 'cornrow') for (var i = -2; i <= 2; i++) add(new T.BoxGeometry(0.012, 0.012, 0.2), i * 0.03, 0.105, -0.02, 1, 1, 1, -0.15); return; }
    if (st === 'crop') { cap(1.04); add(new T.BoxGeometry(0.16, 0.035, 0.05), 0, 0.085, 0.07, hx, 1, 1, 0.4); return; }
    if (st === 'spikes') { cap(1.02); for (var k = 0; k < 9; k++) { var a = (k / 9) * Math.PI * 2; var c = add(new T.ConeGeometry(0.03, 0.08, 4), Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06 - 0.01); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); } return; }
    if (st === 'slick') { cap(1.03); add(new T.BoxGeometry(0.17, 0.05, 0.2), 0, 0.105, -0.01, hx, 1, 1, -0.1); return; }
    if (st === 'mullet') { cap(1.04); add(new T.BoxGeometry(0.19, 0.17, 0.06), 0, -0.04, -0.085, hx, 1, 1); return; }
    if (st === 'curls') { cap(1.05); for (var q = 0; q < 14; q++) { var a2 = (q / 14) * Math.PI * 2; add(new T.IcosahedronGeometry(0.03, 0), Math.cos(a2) * 0.09 * hx, 0.07 + (q % 2) * 0.03, Math.sin(a2) * 0.08 - 0.01); } return; }
    if (st === 'afro') { add(new T.IcosahedronGeometry(0.17, 1), 0, 0.07, -0.02, hx, 0.9, 0.95); return; }
    if (st === 'bigvolume') { add(new T.IcosahedronGeometry(0.16, 1), 0, 0.06, -0.04, hx * 1.15, 1.05, 1); add(new T.BoxGeometry(0.26, 0.24, 0.1), 0, -0.1, -0.07, hx); return; }
    if (st === 'mohawk') { cap(0.985); add(new T.BoxGeometry(0.03, 0.09, 0.2), 0, 0.14, -0.01, 1, 1, 1, -0.2); return; }
    if (st === 'bob') { cap(1.08); add(new T.CylinderGeometry(0.12, 0.125, 0.12, 9, 1, true, Math.PI * 0.75, Math.PI * 1.5), 0, -0.01, -0.01, hx, 1, 1); return; }
    if (st === 'long') { cap(1.06); add(new T.BoxGeometry(0.22, 0.3, 0.07), 0, -0.1, -0.08, hx); [-1, 1].forEach(function (s) { add(new T.BoxGeometry(0.04, 0.24, 0.06), s * 0.11 * hx, -0.08, 0.0); }); return; }
    if (st === 'braids') { cap(1.04); for (var b = -3; b <= 3; b++) add(new T.CylinderGeometry(0.014, 0.012, 0.32, 4), b * 0.03, -0.12, -0.08 + Math.abs(b) * 0.01); return; }
    if (st === 'bun') { cap(1.04); add(new T.IcosahedronGeometry(0.055, 0), 0, 0.15, -0.03); return; }
    if (st === 'buns') { cap(1.04); [-1, 1].forEach(function (s) { add(new T.IcosahedronGeometry(0.048, 0), s * 0.08, 0.13, -0.01); }); return; }
    if (st === 'ponytail') { cap(1.04); add(new T.CylinderGeometry(0.035, 0.015, 0.25, 5), 0, -0.02, -0.14, 1, 1, 1, 0.5); return; }
    cap(1.04);
  }
  function addHeadAcc(head, L) {
    var c = L.accC || '#f0c96a', a = L.acc;
    if (a.indexOf('cap') !== -1 && ['afro', 'bigvolume', 'mohawk', 'spikes', 'bun', 'buns'].indexOf(L.hair.style) === -1) { var cm = lambert(null, c); var cp = mesh(new T.SphereGeometry(0.118, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), cm, 0, 0.02, 0); cp.rotation.x = -0.15; head.add(cp); var brim = mesh(new T.BoxGeometry(0.15, 0.012, 0.09), cm, 0, 0.035, 0.12); brim.rotation.x = 0.1; head.add(brim); }
    if (a.indexOf('beanie') !== -1 && ['afro', 'bigvolume', 'mohawk'].indexOf(L.hair.style) === -1) { var bm = lambert(tex('beanie|' + c, 32, 32, function (g, w, h) { shadeBand(g, w, h, c); g.fillStyle = hex(c, -0.25); for (var x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h); })); head.add(mesh(new T.SphereGeometry(0.12, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), bm, 0, 0.03, -0.005)); }
    if (a.indexOf('bandana') !== -1) { var bd = mesh(new T.CylinderGeometry(0.113, 0.113, 0.035, 10, 1, true), lambert(null, c, { side: T.DoubleSide }), 0, 0.06, 0); bd.rotation.x = -0.15; head.add(bd); }
    if (a.indexOf('headphones') !== -1) { var hm = lambert(null, '#1a1a1a'), cm2 = lambert(null, c); var band = mesh(new T.TorusGeometry(0.12, 0.012, 4, 12, Math.PI), hm, 0, 0.0, 0); head.add(band); [-1, 1].forEach(function (s) { var cup = mesh(new T.CylinderGeometry(0.042, 0.042, 0.03, 8), cm2, s * 0.115, -0.01, 0); cup.rotation.z = Math.PI / 2; head.add(cup); }); }
    if (a.indexOf('earrings') !== -1) [-1, 1].forEach(function (s) { var e = mesh(new T.TorusGeometry(0.018, 0.004, 3, 8), lambert(null, '#f0c96a', { emissive: '#3a2a00' }), s * 0.107, -0.05, 0.005); e.rotation.y = Math.PI / 2; head.add(e); });
    if (a.indexOf('crown') !== -1) { var cr = mesh(new T.CylinderGeometry(0.07, 0.065, 0.05, 6, 1, true), lambert(null, '#f0c96a', { emissive: '#4a3500', side: T.DoubleSide }), 0, 0.14, -0.01); head.add(cr); for (var k = 0; k < 6; k++) { var sp = mesh(new T.ConeGeometry(0.012, 0.035, 3), lambert(null, '#f0c96a', { emissive: '#4a3500' }), Math.cos(k * 1.047) * 0.068, 0.18, Math.sin(k * 1.047) * 0.068 - 0.01); head.add(sp); } }
  }
  function addBodyAcc(spine, L, shW) {
    var a = L.acc, gold = lambert(null, '#f0c96a', { emissive: '#3a2a00' });
    if (a.indexOf('chain') !== -1) { var ch = mesh(new T.TorusGeometry(0.075, 0.009, 3, 14, Math.PI), gold, 0, 0.4, 0.06); ch.rotation.set(-0.15, 0, Math.PI); spine.add(ch); }
    if (a.indexOf('bigjewels') !== -1) { var nk = mesh(new T.TorusGeometry(0.085, 0.016, 4, 12, Math.PI), gold, 0, 0.39, 0.06); nk.rotation.set(-0.15, 0, Math.PI); spine.add(nk); spine.add(mesh(new T.OctahedronGeometry(0.025, 0), lambert(null, '#ff3d9a', { emissive: '#400018' }), 0, 0.3, 0.1)); }
    if (a.indexOf('bag') !== -1) { var strap = mesh(new T.BoxGeometry(0.02, 0.5, 0.012), lambert(null, '#2a1a10'), 0, 0.22, 0.1); strap.rotation.z = 0.7; spine.add(strap); spine.add(mesh(new T.BoxGeometry(0.12, 0.09, 0.04), lambert(null, L.accC || '#6b4226'), 0.12, 0.05, 0.1)); }
  }

  // ---------- poses (procedural, on the shared joints) ----------
  function pose(fig, name, t) {
    var J = fig.userData.joints, R = fig.userData.rest; if (!J) return;
    Object.keys(R).forEach(function (k) { J[k].rotation.copy(R[k].r); J[k].position.copy(R[k].p); });
    var s = Math.sin(t), c = Math.cos(t);
    if (name === 'idle') { J.spine.rotation.x += Math.sin(t * 0.5) * 0.015; J.head.rotation.y = Math.sin(t * 0.3) * 0.15; J.shoulderL.rotation.z -= Math.sin(t * 0.5) * 0.02; J.shoulderR.rotation.z += Math.sin(t * 0.5) * 0.02; }
    else if (name === 'walk' || name === 'runway') {
      var w = t * (name === 'runway' ? 2.2 : 3);
      J.hipL.rotation.x = Math.sin(w) * 0.5; J.hipR.rotation.x = -Math.sin(w) * 0.5;
      J.kneeL.rotation.x = Math.max(0, -Math.sin(w)) * 0.7; J.kneeR.rotation.x = Math.max(0, Math.sin(w)) * 0.7;
      J.shoulderL.rotation.x = -Math.sin(w) * 0.4; J.shoulderR.rotation.x = Math.sin(w) * 0.4;
      J.hips.position.y += Math.abs(Math.cos(w)) * 0.025;
      if (name === 'runway') { J.hips.rotation.y = Math.sin(w) * 0.18; J.hips.rotation.z = Math.sin(w) * 0.07; J.spine.rotation.y = -Math.sin(w) * 0.12; J.shoulderL.rotation.z = -0.3; J.head.rotation.y = 0.15; }
    }
    else if (name === 'dance') { J.hips.position.y += Math.abs(s) * 0.05; J.hips.rotation.y = s * 0.3; J.shoulderL.rotation.z = -1.25 - c * 0.25; J.shoulderR.rotation.z = 1.25 + s * 0.25; J.elbowL.rotation.z = -1.35; J.elbowR.rotation.z = 1.35; J.head.rotation.z = s * 0.15; J.kneeL.rotation.x = Math.max(0, s) * 0.5; J.kneeR.rotation.x = Math.max(0, -s) * 0.5; }
    else if (name === 'celebrate') { var up = Math.abs(Math.sin(t * 2)); J.hips.position.y += up * 0.08; J.shoulderL.rotation.z = -2.6; J.shoulderR.rotation.z = 2.6; J.elbowL.rotation.x = -0.3 * up; J.elbowR.rotation.x = -0.3 * up; J.head.rotation.x = -0.2; }
    else if (name === 'sleepy') { J.head.rotation.x = 0.35 + Math.sin(t * 0.6) * 0.04; J.spine.rotation.x = 0.1; J.shoulderL.rotation.z = -0.05; J.shoulderR.rotation.z = 0.05; }
    else if (name === 'portrait') { J.head.rotation.y = 0.12; }
  }

  // ---------- PS2 mode: vertex snapping (the wobble) ----------
  function ps2Material(m, on, res) {
    if (!m.userData.ps2) return;
    m.onBeforeCompile = on ? function (sh) {
      sh.uniforms.uSnap = { value: res };
      sh.vertexShader = 'uniform vec2 uSnap;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;');
    } : null;
    m.customProgramCacheKey = function () { return on ? 'ps2' : 'clean'; };
    m.needsUpdate = true;
  }

  // ---------- the stage ----------
  function stage(el, looks, opts) {
    opts = opts || {};
    var W = el.clientWidth || 320, H = el.clientHeight || 360;
    var r = new T.WebGLRenderer({ antialias: !opts.ps2, alpha: true, preserveDrawingBuffer: !!opts.capture });
    var ps2 = !!opts.ps2, low = 0.42;
    r.setPixelRatio(ps2 ? low : Math.min(2, root.devicePixelRatio || 1)); r.setSize(W, H);
    if ('outputColorSpace' in r) r.outputColorSpace = 'srgb'; else r.outputEncoding = T.sRGBEncoding;
    r.domElement.className = 'ps2-canvas' + (ps2 ? ' crunchy' : '');
    el.innerHTML = ''; el.appendChild(r.domElement);
    var dither = document.createElement('div'); dither.className = 'ps2-dither'; dither.hidden = !ps2; el.appendChild(dither);
    var scene = new T.Scene();
    // warm, sunset-graded light: soft ambient, a warm key from the front-left, a cool rim from behind
    scene.add(new T.HemisphereLight(opts.sky || '#ffd9b0', opts.ground || '#3a2246', 0.85));
    var key = new T.DirectionalLight('#ffe2c0', 0.75); key.position.set(-1.2, 2, 2.2); scene.add(key);
    var rim = new T.DirectionalLight(opts.rim || '#9f7bff', 0.45); rim.position.set(1.5, 1.5, -2); scene.add(rim);
    if (opts.spot) { var sp = new T.SpotLight('#fff0d0', 1.2, 8, 0.35, 0.6); sp.position.set(0, 4, 1.5); scene.add(sp); scene.add(sp.target); }
    var floor = new T.Mesh(new T.CircleGeometry(1.6, 18), new T.MeshLambertMaterial({ color: opts.floor || '#2a1d3a' })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    var cam = new T.PerspectiveCamera(opts.fov || 26, W / H, 0.1, 50);
    var figs = [], yaw = opts.yaw || 0, dist = opts.dist || 4.2, poseName = opts.pose || 'idle', t0 = performance.now(), raf = 0, dragging = false, lastX = 0;
    function place() {
      var n = figs.length, gap = opts.gap || 0.62;
      figs.forEach(function (f, i) { f.position.x = (i - (n - 1) / 2) * gap; });
      var cy = opts.camY !== undefined ? opts.camY : 1.0;
      cam.position.set(Math.sin(yaw) * dist, cy + 0.25, Math.cos(yaw) * dist); cam.lookAt(0, cy, 0);
    }
    function set(ls) {
      figs.forEach(function (f) { scene.remove(f); f.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); });
      figs = (ls || []).map(function (L) { var f = build(L); scene.add(f); return f; });
      if (ps2) figs.forEach(function (f) { f.traverse(function (o) { if (o.material) ps2Material(o.material, true, new T.Vector2(W * low * 0.5, H * low * 0.5)); }); });
      place();
    }
    function frame() {
      var t = (performance.now() - t0) / 1000, still = opts.still || (root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      figs.forEach(function (f, i) { pose(f, poseName, still ? 0.3 : t + i * 0.7); });
      if (opts.autoSpin && !dragging && !still) { yaw += 0.003; place(); }
      r.render(scene, cam);
      if (!opts.capture && !still) raf = requestAnimationFrame(frame);
    }
    var down = function (e) { dragging = true; lastX = e.clientX; }, move = function (e) { if (!dragging) return; yaw -= (e.clientX - lastX) * 0.012; lastX = e.clientX; place(); if (opts.still) frame(); }, up = function () { dragging = false; };
    var wheel = function (e) { e.preventDefault(); dist = Math.max(2.2, Math.min(6, dist + e.deltaY * 0.003)); place(); if (opts.still) frame(); };
    r.domElement.addEventListener('pointerdown', down); root.addEventListener('pointermove', move); root.addEventListener('pointerup', up); r.domElement.addEventListener('wheel', wheel, { passive: false });
    set(looks); frame();
    return {
      el: r.domElement, scene: scene,
      get tris() { return figs.map(function (f) { return f.userData.tris; }); },
      set: function (ls) { set(ls); if (opts.still || opts.capture) frame(); },
      pose: function (n) { poseName = n; if (opts.still || opts.capture) frame(); },
      ps2: function (on) { ps2 = !!on; r.setPixelRatio(ps2 ? low : Math.min(2, root.devicePixelRatio || 1)); r.setSize(W, H); r.domElement.classList.toggle('crunchy', ps2); dither.hidden = !ps2; set(figs.map(function (f) { return f.userData.look; })); frame(); },
      render: frame,
      dispose: function () { cancelAnimationFrame(raf); root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); set([]); r.dispose(); el.innerHTML = ''; }
    };
  }

  // ---------- 2D portraits for small spots (rendered once, cached) ----------
  var portraitCache = {}, pr = null;
  function portrait(look, size) {
    size = size || 96;
    var L = normalize(look), key = size + '|' + JSON.stringify(L);
    if (portraitCache[key]) return portraitCache[key];
    try {
      if (!pr) { pr = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); if ('outputColorSpace' in pr) pr.outputColorSpace = 'srgb'; else pr.outputEncoding = T.sRGBEncoding; }
      pr.setPixelRatio(1); pr.setSize(size, size);
      var sc = new T.Scene(); sc.add(new T.HemisphereLight('#ffd9b0', '#3a2246', 0.95)); var k = new T.DirectionalLight('#ffe2c0', 0.7); k.position.set(-1, 1.5, 2); sc.add(k);
      var f = build(L); pose(f, 'portrait', 0); sc.add(f);
      f.updateMatrixWorld(true); var hv = new T.Vector3(); f.userData.joints.head.getWorldPosition(hv); var cam = new T.PerspectiveCamera(22, 1, 0.1, 10); var hy = hv.y + 0.04; cam.position.set(0.16, hy + 0.04, 1.1); cam.lookAt(0, hy - 0.03, 0);
      pr.render(sc, cam);
      var url = pr.domElement.toDataURL('image/png');
      f.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      return (portraitCache[key] = url);
    } catch (e) { return ''; }
  }

  // ---------- randomise (coherent, never clashing) ----------
  function random(seed, glam) {
    var r = rnd(seed || Date.now()), pick = function (list) { return list[Math.floor(r() * list.length)][0]; }, col = function (list) { return list[Math.floor(r() * list.length)]; };
    var L = clone(DEFAULT);
    L.frame = glam ? (r() > 0.3 ? 'f' : 'm') : (r() > 0.5 ? 'f' : 'm');
    L.build = pick(OPTIONS.build); L.height = 0.94 + r() * 0.12; L.skin = col(SKINS); L.stance = pick(OPTIONS.stance);
    L.face = { shape: pick(OPTIONS.faceShape), eyes: L.frame === 'f' && r() > 0.4 ? 'lashes' : pick(OPTIONS.eyes), eyeC: col(['#4a2f1d', '#2a1a10', '#3f7cc0', '#6b8e23', '#7d8a96']), brows: pick(OPTIONS.brows), nose: pick(OPTIONS.nose), mouth: pick(OPTIONS.mouth), facial: L.frame === 'm' && r() > 0.5 ? pick(OPTIONS.facial) : 'none', glasses: r() > 0.75 ? pick(OPTIONS.glasses) : 'none', lips: '' };
    L.hair = { style: glam && r() > 0.4 ? col(['bigvolume', 'long', 'buns', 'bun', 'ponytail']) : pick(OPTIONS.hair), c: r() > 0.8 ? col(HAIRC.slice(11)) : col(HAIRC.slice(0, 11)) };
    L.top = { style: glam && r() > 0.4 ? col(['sequin', 'corset', 'crop']) : pick(OPTIONS.top), c1: col(CLOTH), c2: col(CLOTH), graphic: r() > 0.5 ? pick(OPTIONS.graphic) : 'none' };
    if (L.top.c2 === L.top.c1) L.top.c2 = '#f2f2f2';
    L.bottom = { style: pick(OPTIONS.bottom), fit: pick(OPTIONS.fit), c1: col(CLOTH), c2: '#f2f2f2' };
    L.shoes = { style: glam && r() > 0.5 ? col(['heels', 'platforms']) : pick(OPTIONS.shoes), c1: col(CLOTH), c2: col(CLOTH) };
    L.acc = []; var n = Math.floor(r() * 3); for (var i = 0; i < n; i++) { var a = pick(OPTIONS.acc); if (L.acc.indexOf(a) === -1) L.acc.push(a); }
    L.accC = col(['#f0c96a', '#e6e6e6', '#ff3fa4', '#111111', '#2fe0d6']); L.metallic = glam && r() > 0.6; L.tattoo = r() > 0.75 ? pick(OPTIONS.tattoo) : 'none';
    return L;
  }

  var api = { normalize: normalize, build: build, stage: stage, portrait: portrait, random: random, pose: pose, OPTIONS: OPTIONS, GLAM_FIRST: GLAM_FIRST, DEFAULT: DEFAULT };
  root.PS2Char = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
