/*
 * 3D characters for Nudge: low-poly, San Andreas / Vice City style, with
 * runway glam. Built from simple shapes with three.js (loaded on demand), so
 * every hair style, outfit, pattern and extra is generated here, no model files.
 *   LQ3D.load() -> Promise
 *   LQ3D.stage(element, { looks: [look, ...], spin: true, theme: 'vice' }) -> { el, set(looks), sashay(i), pause(on), dispose() }
 * A look is { body, skin, hair, hairC, top, topC, topPat, bottom, botC, botPat, shoes, shoeC, acc: [], lips, shadow }.
 */
(function () {
  'use strict';
  var T = null, loading = null;
  function load() {
    if (window.THREE) { T = window.THREE; return Promise.resolve(T); }
    if (loading) return loading;
    var src = (window.LQ_THREE_URL || 'three.min.js');
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { T = window.THREE; T ? res(T) : rej(new Error('3D didn\'t load')); };
      s.onerror = function () { loading = null; rej(new Error('3D didn\'t load. Check your connection.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // ---------- textures for patterns ----------
  var texCache = {};
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
    var m = function (c) { return Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f))); };
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  function patternTex(pat, col) {
    if (!pat || pat === 'solid' || pat === 'chrome') return null;
    var key = pat + col; if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(42);
    g.fillStyle = col; g.fillRect(0, 0, 128, 128);
    if (pat === 'stripes') { g.fillStyle = shade(col, 0.55); for (var i = 0; i < 128; i += 32) g.fillRect(0, i, 128, 12); }
    else if (pat === 'plaid') {
      g.globalAlpha = 0.45; g.fillStyle = shade(col, -0.45); for (i = 0; i < 128; i += 32) { g.fillRect(i, 0, 12, 128); g.fillRect(0, i, 128, 12); }
      g.globalAlpha = 0.6; g.fillStyle = shade(col, 0.5); for (i = 16; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
    } else if (pat === 'flames') {
      for (i = 0; i < 6; i++) {
        var x = i * 24 - 6; g.fillStyle = i % 2 ? '#ffb703' : '#e63946';
        g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 8, 70, x + 4, 40 + rnd() * 30); g.quadraticCurveTo(x + 18, 80, x + 26, 128); g.fill();
      }
    } else if (pat === 'floral') {
      for (i = 0; i < 14; i++) {
        var fx = rnd() * 128, fy = rnd() * 128, fc = ['#ffffff', '#ffd166', '#ff5fae', '#2fe0d6'][i % 4];
        g.fillStyle = fc; for (var p = 0; p < 5; p++) { var a = p / 5 * Math.PI * 2; g.beginPath(); g.ellipse(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6, 5, 3, a, 0, 7); g.fill(); }
        g.fillStyle = '#ffb703'; g.beginPath(); g.arc(fx, fy, 3, 0, 7); g.fill();
        g.fillStyle = '#2e9e4f'; g.beginPath(); g.ellipse(fx + 10, fy + 9, 7, 3, 0.6, 0, 7); g.fill();
      }
    } else if (pat === 'leopard') {
      for (i = 0; i < 22; i++) {
        var lx = rnd() * 128, ly = rnd() * 128, r = 4 + rnd() * 4;
        g.fillStyle = '#2b1d0e'; g.beginPath(); g.ellipse(lx, ly, r, r * 0.75, rnd() * 3, 0, 7); g.fill();
        g.fillStyle = shade(col, -0.25); g.beginPath(); g.ellipse(lx, ly, r * 0.5, r * 0.35, 0, 0, 7); g.fill();
      }
    } else if (pat === 'sequins') {
      for (i = 0; i < 700; i++) { g.fillStyle = rnd() < 0.3 ? '#ffffff' : rnd() < 0.5 ? shade(col, 0.5) : shade(col, -0.3); g.fillRect(rnd() * 128, rnd() * 128, 3, 3); }
    }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2);
    if ('colorSpace' in t) t.colorSpace = 'srgb'; else t.encoding = T.sRGBEncoding;
    return (texCache[key] = t);
  }
  function weaveTex(col, denim) {
    var key = 'w' + col + (denim ? 'd' : ''); if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 1800; i++) { g.fillStyle = Math.random() < 0.5 ? shade(col, -0.08) : shade(col, 0.06); g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
    if (denim) { g.strokeStyle = shade(col, 0.18); g.globalAlpha = 0.35; for (i = -128; i < 128; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); } g.globalAlpha = 1; }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3);
    if ('colorSpace' in t) t.colorSpace = 'srgb'; else t.encoding = T.sRGBEncoding;
    return (texCache[key] = t);
  }
  function fabric(col, pat, extra, weave) {
    var tex = patternTex(pat, col) || (pat === 'chrome' ? null : weaveTex(col, weave === 'denim')), o = { color: tex ? 0xffffff : col, map: tex || null, roughness: 0.8, metalness: 0 };
    if (pat === 'chrome') { o.color = col; o.metalness = 0.95; o.roughness = 0.18; }
    if (pat === 'sequins') { o.metalness = 0.6; o.roughness = 0.3; o.emissive = new T.Color(col).multiplyScalar(0.18); }
    Object.assign(o, extra || {});
    return new T.MeshStandardMaterial(o);
  }
  function mat(col, extra) { return new T.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.7 }, extra || {})); }
  var GOLD = { color: '#f2c14e', metalness: 0.9, roughness: 0.25 };

  // ---------- the figure (smooth, Vice City proportions) ----------
  function mesh(geo, m, x, y, z) { var o = new T.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; return o; }
  function cyl(rt, rb, h, seg) { return new T.CylinderGeometry(rt, rb, h, seg || 20); }
  function ball(r, d) { return d === 0 ? new T.SphereGeometry(r, 12, 9) : new T.SphereGeometry(r, 20, 14); }
  function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
  /** An ellipsoid w x h x d (soft "boxes" for hair, shoes, hands). */
  function blob(w, h, d, seg) { var g = new T.SphereGeometry(0.5, seg || 18, Math.round((seg || 18) * 0.7)); g.scale(w, h, d); return g; }
  /** A smooth tapered limb hanging down from its joint: radius r1 at the top, r2 at the bottom, rounded ends. */
  function limb(r1, r2, len, bulge) {
    var pts = [], b = bulge || 1.06, n = 14;
    for (var i = 0; i <= 4; i++) { var a = i / 4 * Math.PI / 2; pts.push(new T.Vector2(Math.sin(a) * r2, -len - Math.cos(a) * r2 * 0.6 + r2 * 0.6)); }
    for (i = 1; i < n; i++) { var t = i / n, r = r2 + (r1 - r2) * t; r *= 1 + (b - 1) * Math.sin(t * Math.PI); pts.push(new T.Vector2(r, -len + len * t)); }
    for (i = 0; i <= 4; i++) { a = i / 4 * Math.PI / 2; pts.push(new T.Vector2(Math.cos(a) * r1, Math.sin(a) * r1 * 0.6)); }
    var g = new T.LatheGeometry(pts, 20); g.computeVertexNormals(); return g;
  }
  /** A body section turned from a radius profile [[r, y], ...], squashed front to back. */
  function lathe(profile, depth) {
    var g = new T.LatheGeometry(profile.map(function (p) { return new T.Vector2(p[0], p[1]); }), 28);
    g.scale(1, 1, depth || 0.66); g.computeVertexNormals(); return g;
  }
  var faceCache = {};
  function faceTex(L, f) {
    var key = [L.skin, L.lips, L.shadow, L.hairC, f ? 1 : 0, L.lips !== '#9c4a52' ? 1 : 0].join();
    if (faceCache[key]) return faceCache[key];
    var W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), cx = W * 0.25, glam = f || L.lips !== '#9c4a52';
    g.fillStyle = L.skin; g.fillRect(0, 0, W, H);
    // soft shading: cheeks, eye sockets, under the nose, jaw
    var shadeC = shade(L.skin, -0.18), warm = 'rgba(200,80,80,0.12)';
    var rg = function (x, y, r, col) { var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    [-1, 1].forEach(function (s) { rg(cx + s * 30, 152, 20, warm); rg(cx + s * 22, 118, 16, 'rgba(60,30,20,0.18)'); });
    rg(cx, 160, 10, 'rgba(60,30,20,0.15)');
    if (!f) { g.globalAlpha = 0.16; for (var i = 0; i < 500; i++) { var a = Math.random() * Math.PI, rr = 34 + Math.random() * 16; g.fillStyle = shade(L.hairC, 0.1); g.fillRect(cx + Math.cos(a) * rr * 0.95, 150 + Math.sin(a) * rr * 0.55, 1.4, 1.4); } g.globalAlpha = 1; }
    // eyes
    [-1, 1].forEach(function (s) {
      var ex = cx + s * 21, ey = 121;
      if (glam) { g.fillStyle = L.shadow; g.globalAlpha = 0.75; g.beginPath(); g.ellipse(ex, ey - 4, 12, 7, 0, Math.PI, 0); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ex, ey, 9.5, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a2f1d'; g.beginPath(); g.arc(ex + s * 0.5, ey, 4.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0d0907'; g.beginPath(); g.arc(ex + s * 0.5, ey, 2.1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex + s * 0.5 + 1.5, ey - 1.5, 1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = f ? '#120c0a' : 'rgba(40,25,20,0.8)'; g.lineWidth = f ? 2.4 : 1.4; g.beginPath(); g.ellipse(ex, ey, 9.5, 5, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      if (f) { for (var k = 0; k < 3; k++) { g.beginPath(); g.moveTo(ex + s * (5 + k * 2), ey - 4); g.lineTo(ex + s * (8 + k * 2.5), ey - 8); g.stroke(); } }
      g.strokeStyle = shade(L.hairC, -0.1); g.lineWidth = f ? 2.2 : 3.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - s * 9, ey - 11 + (f ? 0 : 1)); g.quadraticCurveTo(ex, ey - (f ? 17 : 15), ex + s * 11, ey - 11); g.stroke();
    });
    // nose line and mouth
    g.strokeStyle = 'rgba(70,35,25,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 6, 152); g.quadraticCurveTo(cx, 156, cx + 6, 152); g.stroke();
    g.fillStyle = L.lips; g.beginPath(); g.moveTo(cx - 15, 172); g.quadraticCurveTo(cx - 6, 165, cx, 168); g.quadraticCurveTo(cx + 6, 165, cx + 15, 172); g.quadraticCurveTo(cx, 182, cx - 15, 172); g.fill();
    g.strokeStyle = 'rgba(40,15,15,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 15, 172); g.quadraticCurveTo(cx, 174, cx + 15, 172); g.stroke();
    if (glam) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(cx - 3, 176, 4, 1.5, 0, 0, 7); g.fill(); }
    var t = new T.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = 'srgb'; else t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return (faceCache[key] = t);
  }
  function buildHead(L, f, skin) {
    var head = new T.Group();
    var geo = new T.SphereGeometry(0.115, 40, 30), p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0) { var k = 1 + y / 0.115 * (f ? 0.24 : 0.17); x *= k; z *= 1 + y / 0.115 * 0.1; }     // jaw and chin
      if (z < 0) z *= 0.93;                                                                            // flatter back
      if (y > 0.02 && z > 0.05) z *= 0.97;                                                             // brow
      p.setXYZ(i, x, y * 1.16, z * 1.04);
    }
    geo.computeVertexNormals();
    var faceM = new T.MeshStandardMaterial({ map: faceTex(L, f), roughness: 0.55 });
    head.add(mesh(geo, faceM, 0, 0, 0));
    var nose = mesh(blob(0.032, 0.05, 0.045), skin, 0, -0.01, 0.11); nose.rotation.x = -0.25; head.add(nose);
    [-1, 1].forEach(function (s) { var ear = mesh(blob(0.022, 0.05, 0.035), skin, s * 0.112, -0.005, -0.005); head.add(ear); });
    return head;
  }
  var fabricNoise = {};
  function buildFigure(L) {
    var f = L.body === 'f', root = new T.Group(), skin = mat(L.skin, { roughness: 0.55 });
    var top = fabric(L.topC, L.topPat), bot = fabric(L.botC, L.botPat, null, /jeans|baggy/.test(L.bottom) && L.botPat === 'solid' ? 'denim' : ''), shoe = mat(L.shoeC, { roughness: 0.45 }), hairM = mat(L.hairC, { roughness: 0.45, metalness: 0.05 });
    var parts = {};
    var heel = L.shoes === 'heels' || L.shoes === 'thigh' ? 0.07 : 0;
    var body = new T.Group(); body.position.y = heel; root.add(body); parts.body = body;
    var sleeves = { tee: 'short', tank: 'none', grove: 'none', tracktop: 'long', hawaiian: 'short', vcsuit: 'long', hoodie: 'long', bomber: 'long', leather: 'long', crop: 'short', corset: 'none', bodice: 'none', fur: 'long' }[L.top] || 'short';
    var bulky = L.top === 'fur' ? 1.22 : L.top === 'bomber' || L.top === 'hoodie' || L.top === 'leather' ? 1.07 : 1;
    // legs
    var legX = f ? 0.088 : 0.098, baggy = L.bottom === 'baggy' || L.bottom === 'trackpants' ? 1.28 : L.bottom === 'slacks' ? 1.1 : 1;
    var legCover = { jeans: [1, 1], shorts: [0.55, 0], baggy: [1, 1], trackpants: [1, 1], slacks: [1, 1], skirt: [0, 0], hotpants: [0.12, 0], mermaid: [1, 1], gown: [1, 1] }[L.bottom] || [1, 1];
    bot.side = T.DoubleSide;
    var thighM = legCover[0] >= 1 ? bot : skin, shinM = legCover[1] >= 1 ? bot : skin, hidden = L.bottom === 'gown' || L.bottom === 'mermaid';
    if (L.shoes === 'thigh') shinM = shoe;
    [-1, 1].forEach(function (s) {
      var hip = new T.Group(); hip.position.set(s * legX, 0.92, 0); hip.rotation.z = s * 0.02; body.add(hip); parts['leg' + s] = hip;
      var th = mesh(limb(0.085 * baggy * (f ? 1.06 : 1), 0.058 * baggy, 0.44, 1.05), thighM); th.scale.z = 0.95; th.visible = !hidden; hip.add(th);
      if (legCover[0] > 0 && legCover[0] < 1) { var sh = mesh(limb(0.092 * baggy, 0.082, 0.44 * legCover[0], 1), bot); hip.add(sh); }
      if (L.shoes === 'thigh') hip.add(mesh(limb(0.074, 0.066, 0.2, 1), shoe, 0, -0.26, 0));
      var knee = new T.Group(); knee.position.y = -0.44; hip.add(knee);
      var calf = mesh(limb(0.062 * baggy, 0.04 * (baggy > 1 ? 1.45 : 1), 0.43, 1.12), shinM); calf.visible = !hidden; knee.add(calf);
      var foot = new T.Group(); foot.position.y = -0.45; knee.add(foot);
      if (L.shoes === 'heels' || L.shoes === 'thigh') {
        var ft = mesh(blob(0.07, 0.05, 0.18), shoe, 0, -0.035, 0.045); ft.rotation.x = 0.35; foot.add(ft);
        foot.add(mesh(cyl(0.011, 0.008, 0.085, 10), shoe, 0, -0.075, -0.03));
        if (L.shoes === 'heels') { foot.add(mesh(blob(0.075, 0.03, 0.09), shoe, 0, -0.1, 0.1)); foot.add(mesh(new T.TorusGeometry(0.042, 0.008, 8, 20), shoe, 0, 0.02, 0)).rotation.x = Math.PI / 2; }
      } else if (L.shoes === 'boots') {
        foot.add(mesh(cyl(0.056, 0.06, 0.16), shoe, 0, 0.06, 0)); foot.add(mesh(blob(0.11, 0.085, 0.25), shoe, 0, -0.03, 0.045)); foot.add(mesh(blob(0.115, 0.03, 0.26), mat('#2a2018'), 0, -0.07, 0.045));
      } else if (L.shoes === 'loafers') {
        foot.add(mesh(blob(0.095, 0.065, 0.24), shoe, 0, -0.035, 0.045)); foot.add(mesh(box(0.05, 0.008, 0.025), mat('#c9a227', GOLD), 0, -0.002, 0.11));
      } else {
        foot.add(mesh(blob(0.105, 0.085, 0.25), shoe, 0, -0.03, 0.045)); foot.add(mesh(blob(0.112, 0.035, 0.262), mat('#f4f4f4', { roughness: 0.6 }), 0, -0.068, 0.045));
        foot.add(mesh(box(0.06, 0.006, 0.06), mat('#d0d0d0'), 0, 0.012, 0.075));
      }
    });
    // hips
    var hipM = L.bottom === 'skirt' || L.bottom === 'gown' || L.bottom === 'mermaid' || L.bottom === 'hotpants' || legCover[0] ? bot : skin;
    body.add(mesh(lathe([[0, 0.86], [0.12, 0.865], [f ? 0.185 : 0.17, 0.93], [f ? 0.17 : 0.165, 1.0], [f ? 0.14 : 0.16, 1.06], [0, 1.065]], 0.68), hipM));
    if (/jeans|baggy|slacks|shorts/.test(L.bottom)) { var belt = mesh(new T.TorusGeometry(f ? 0.15 : 0.163, 0.012, 8, 32), mat('#2a2018', { roughness: 0.4 }), 0, 1.035, 0); belt.rotation.x = Math.PI / 2; belt.scale.y = 0.68; body.add(belt); }
    if (L.bottom === 'skirt') body.add(mesh(cyl(0.17, 0.27, 0.27, 28), bot, 0, 0.84, 0));
    if (L.bottom === 'gown') { body.add(mesh(lathe([[0.15, 1.05], [0.2, 0.85], [0.34, 0.45], [0.5, 0.05], [0.52, -0.01], [0, -0.01]], 1), bot)); }
    if (L.bottom === 'mermaid') body.add(mesh(lathe([[0.15, 1.05], [0.19, 0.9], [0.16, 0.6], [0.12, 0.38], [0.2, 0.2], [0.36, 0.0], [0.37, -0.01], [0, -0.01]], 1), bot));
    // torso: belly and chest, turned from a profile
    var torso = new T.Group(); torso.position.y = 1.02; body.add(torso); parts.torso = torso;
    var sw = (f ? 0.17 : 0.215) * bulky, cw = (f ? 0.155 : 0.2) * bulky, ww = (f ? 0.128 : 0.165) * bulky;
    var belly = L.top === 'crop' ? skin : top;
    torso.add(mesh(lathe([[0, 0], [f ? 0.14 : 0.16, 0], [ww, 0.12], [ww * 1.02, 0.2], [0, 0.2]]), belly));
    torso.add(mesh(lathe([[0, 0.195], [ww * 1.02, 0.195], [cw, 0.32], [sw, 0.43], [sw * 0.82, 0.5], [0.075, 0.545], [0, 0.55]]), top));
    if (f) [-1, 1].forEach(function (s) { torso.add(mesh(blob(0.11, 0.1, 0.09), top, s * 0.062, 0.36, 0.075)); });
    if (L.top === 'grove') {
      var jc = document.createElement('canvas'); jc.width = jc.height = 64; var jg = jc.getContext('2d'); jg.fillStyle = L.topC; jg.fillRect(0, 0, 64, 64); jg.fillStyle = '#ffffff'; jg.font = 'bold 46px Arial, sans-serif'; jg.textAlign = 'center'; jg.fillText('7', 32, 50);
      var num = mesh(new T.PlaneGeometry(0.13, 0.13), new T.MeshStandardMaterial({ map: new T.CanvasTexture(jc), roughness: 0.8, transparent: true }), 0, 0.33, cw * 0.68 + 0.004); torso.add(num);
    }
    if (L.top === 'hawaiian' || L.top === 'tee' || L.top === 'grove' || L.top === 'tracktop') { var col = mesh(new T.TorusGeometry(0.068, 0.014, 8, 24), top, 0, 0.525, 0.005); col.rotation.x = Math.PI / 2 - 0.25; torso.add(col); }
    if (L.top === 'hawaiian') [-1, 1].forEach(function (s) { var cl = mesh(blob(0.06, 0.012, 0.07), top, s * 0.045, 0.5, 0.075); cl.rotation.z = s * 0.5; cl.rotation.x = -0.6; torso.add(cl); });
    if (L.top === 'vcsuit') { torso.add(mesh(blob(0.09, 0.3, 0.04), mat('#f4f1ea'), 0, 0.34, cw * 0.6)); [-1, 1].forEach(function (s) { var lp = mesh(box(0.05, 0.22, 0.012), top, s * 0.055, 0.38, cw * 0.64); lp.rotation.z = s * 0.28; torso.add(lp); }); }
    if (L.top === 'corset') for (var ci = 0; ci < 5; ci++) torso.add(mesh(box(0.05, 0.006, 0.006), mat('#111111'), 0, 0.12 + ci * 0.055, ww * 0.69));
    if (L.top === 'hoodie') { var hood = mesh(new T.TorusGeometry(0.1, 0.045, 12, 24), top, 0, 0.52, -0.06); hood.rotation.x = 1.25; torso.add(hood); }
    if (L.top === 'fur') for (var fi = 0; fi < 14; fi++) { var an = fi / 14 * Math.PI * 2; torso.add(mesh(ball(0.062), top, Math.cos(an) * 0.16, 0.5, Math.sin(an) * 0.1)); }
    if (L.top === 'tracktop') torso.add(mesh(box(0.008, 0.48, 0.006), mat('#ffffff'), 0, 0.27, cw * 0.66));
    if (L.top === 'leather' || L.top === 'bomber') torso.add(mesh(box(0.006, 0.46, 0.006), mat('#c0c0c0', { metalness: 0.8, roughness: 0.3 }), 0, 0.27, cw * 0.67));
    // neck and head
    torso.add(mesh(cyl(0.048, 0.056, 0.12), skin, 0, 0.58, 0));
    var head = buildHead(L, f, skin); head.position.y = 0.735; head.scale.setScalar(1.1); torso.add(head); parts.head = head;
    addHair(head, L, hairM);
    // arms, slightly bent, palms in
    var armM = sleeves === 'long' ? top : skin;
    [-1, 1].forEach(function (s) {
      var sh = new T.Group(); sh.position.set(s * (sw - 0.01), 0.45, -0.005); sh.rotation.z = s * 0.1; torso.add(sh); parts['arm' + s] = sh;
      sh.add(mesh(ball(0.056 * bulky), sleeves === 'none' ? skin : top, 0, -0.01, 0));
      sh.add(mesh(limb(0.054 * bulky, 0.043 * bulky, 0.3, 1.1), armM));
      if (sleeves === 'short') sh.add(mesh(limb(0.064 * bulky, 0.058, 0.14, 1), top));
      var el = new T.Group(); el.position.y = -0.3; el.rotation.x = -0.22; sh.add(el); parts['fore' + s] = el;
      el.add(mesh(limb(0.045 * bulky, 0.034, 0.26, 1.12), armM));
      var hand = mesh(blob(0.05, 0.095, 0.03), skin, 0, -0.3, 0); hand.rotation.y = s * 0.15; el.add(hand);
      var thumb = mesh(blob(0.018, 0.045, 0.018), skin, -s * 0.0, -0.285, 0.022); thumb.rotation.x = 0.5; el.add(thumb);
    });
    (L.acc || []).forEach(function (id) { addAcc(id, parts, L, f); });
    root.userData = parts;
    return root;
  }
  function addHair(head, L, m) {
    var h = L.hair, cap = function (sc, y) { var c = mesh(new T.SphereGeometry(0.124, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.47), m, 0, y || 0.02, -0.012); c.rotation.x = -0.38; c.scale.set(1.02 * (sc || 1), 1.2 * (sc || 1), 1.08 * (sc || 1)); head.add(c); return c; };
    if (h === 'bald') return;
    if (h === 'fade' || h === 'buzz') { cap(h === 'buzz' ? 1 : 1.03); return; }
    if (h === 'afro') { var a = mesh(ball(0.2, 1), m, 0, 0.08, -0.02); a.scale.set(1, 0.9, 0.95); head.add(a); return; }
    if (h === 'cornrows') { cap(1.01); for (var i = -3; i <= 3; i++) { var r = mesh(blob(0.014, 0.012, 0.26), m, i * 0.03, 0.135 - Math.abs(i) * 0.012, -0.01); r.rotation.x = 0.3; head.add(r); } return; }
    if (h === 'jheri') { cap(1.04); for (i = 0; i < 12; i++) { var an = i / 12 * Math.PI + Math.PI; head.add(mesh(ball(0.035, 0), mat(L.hairC, { roughness: 0.15, metalness: 0.3 }), Math.cos(an) * 0.13, -0.02 + (i % 2) * 0.03, Math.sin(an) * 0.12 + 0.02)); } return; }
    if (h === 'mullet') { cap(1.04); head.add(mesh(blob(0.2, 0.2, 0.06), m, 0, -0.1, -0.11)); return; }
    if (h === 'slick') { var s = cap(1.05); s.material = mat(L.hairC, { roughness: 0.15, metalness: 0.35 }); head.add(mesh(blob(0.2, 0.05, 0.12), s.material, 0, 0.12, -0.06)); return; }
    if (h === 'bob') { cap(1.08); [-1, 1].forEach(function (x) { head.add(mesh(blob(0.05, 0.18, 0.2), m, x * 0.125, -0.03, -0.01)); }); head.add(mesh(blob(0.25, 0.18, 0.06), m, 0, -0.03, -0.12)); head.add(mesh(blob(0.22, 0.04, 0.05), m, 0, 0.1, 0.1)); return; }
    if (h === 'waves') { cap(1.06); head.add(mesh(blob(0.27, 0.42, 0.07), m, 0, -0.16, -0.11)); [-1, 1].forEach(function (x) { head.add(mesh(blob(0.05, 0.32, 0.13), m, x * 0.13, -0.1, -0.03)); }); return; }
    if (h === 'ponytail') { cap(1.03); var t = mesh(cyl(0.035, 0.02, 0.32), m, 0, 0.06, -0.2); t.rotation.x = 0.6; head.add(t); head.add(mesh(new T.TorusGeometry(0.03, 0.01, 4, 8), mat('#ff5fae'), 0, 0.15, -0.14)); return; }
    if (h === 'buns') { cap(1.03); [-1, 1].forEach(function (x) { head.add(mesh(ball(0.06, 1), m, x * 0.09, 0.15, -0.02)); }); return; }
    if (h === 'mohawk') { cap(0.99); for (i = 0; i < 6; i++) head.add(mesh(blob(0.03, 0.08 + (i % 2) * 0.02, 0.04), m, 0, 0.16 - Math.abs(i - 2.5) * 0.008, 0.09 - i * 0.04)); return; }
    if (h === 'beehive') { cap(1.05); var b = mesh(ball(0.14, 1), m, 0, 0.2, -0.02); b.scale.set(0.95, 1.5, 1); head.add(b); head.add(mesh(new T.TorusGeometry(0.1, 0.012, 4, 12), mat('#ff5fae'), 0, 0.1, 0)); return; }
    if (h === 'volume') {
      cap(1.08);
      for (i = 0; i < 22; i++) { var ang = Math.PI * (0.92 + 1.16 * i / 21), ring = i % 2; head.add(mesh(ball(0.075 + ring * 0.02, 0), m, Math.cos(ang) * (0.17 + ring * 0.04), 0.08 - (i % 3) * 0.12, Math.sin(ang) * 0.13 - 0.05)); }   // sides and back, face clear
      for (i = 0; i < 5; i++) head.add(mesh(ball(0.09, 0), m, (i - 2) * 0.07, 0.2 + (i % 2) * 0.05, -0.04));
      return;
    }
    cap();
  }
  function addAcc(id, P, L, f) {
    var head = P.head, torso = P.torso, gold = mat('#f2c14e', GOLD);
    if (id === 'shades') { [-1, 1].forEach(function (s) { head.add(mesh(box(0.05, 0.03, 0.01), mat('#111111', { metalness: 0.6, roughness: 0.1 }), s * 0.045, 0.02, 0.128)); }); head.add(mesh(box(0.14, 0.008, 0.008), gold, 0, 0.035, 0.128)); }
    if (id === 'bandana') { var b = mesh(new T.TorusGeometry(0.122, 0.02, 10, 32), mat('#1f4fd1'), 0, 0.085, -0.01); b.rotation.x = Math.PI / 2 - 0.3; b.scale.z = 1.08; head.add(b); }
    if (id === 'chain') { var c = mesh(new T.TorusGeometry(0.1, 0.012, 6, 16), gold, 0, 0.47, 0.06); c.rotation.x = 1.3; torso.add(c); torso.add(mesh(ball(0.025, 0), gold, 0, 0.38, 0.13)); }
    if (id === 'cap') { var cp = mesh(new T.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#c1121f'), 0, 0.03, 0); cp.scale.y = 1.1; head.add(cp); head.add(mesh(box(0.15, 0.015, 0.12), mat('#c1121f'), 0, 0.04, -0.18)); }
    if (id === 'headphones') { var hb = mesh(new T.TorusGeometry(0.14, 0.015, 6, 16, Math.PI), mat('#222222'), 0, 0.02, 0); head.add(hb); [-1, 1].forEach(function (s) { var cu = mesh(cyl(0.045, 0.045, 0.04, 10), mat('#ff5fae', { metalness: 0.4 }), s * 0.14, 0.0, 0); cu.rotation.z = Math.PI / 2; head.add(cu); }); }
    if (id === 'hoops') { [-1, 1].forEach(function (s) { var h = mesh(new T.TorusGeometry(0.025, 0.005, 4, 12), gold, s * 0.125, -0.045, 0.01); h.rotation.y = Math.PI / 2; head.add(h); }); }
    if (id === 'boa') { for (var i = 0; i < 18; i++) { var a = i / 17 * Math.PI * 1.15 - 0.08; torso.add(mesh(ball(0.05, 0), mat('#ff7eb6', { roughness: 1 }), Math.cos(a + Math.PI) * -0.21, 0.5 - Math.sin(a) * 0.12 - (i > 14 ? (i - 14) * 0.06 : 0), Math.sin(a) * 0.13 + 0.02)); } }
    if (id === 'sash') {
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; var g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#c9a227'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center'; g.fillText('MISS NUDGE', 128, 23);
      var st = new T.CanvasTexture(cv), sm = mesh(box(0.06, 0.62, 0.01), new T.MeshStandardMaterial({ map: st, roughness: 0.5 }), 0, 0.28, 0.125);
      st.center.set(0.5, 0.5); st.rotation = Math.PI / 2; sm.rotation.z = -0.62; torso.add(sm);
    }
    if (id === 'tiara') { var tb = mesh(new T.TorusGeometry(0.11, 0.008, 4, 16, Math.PI), gold, 0, 0.14, 0.02); tb.rotation.x = -0.4; head.add(tb); for (var k = -2; k <= 2; k++) head.add(mesh(new T.ConeGeometry(0.012, 0.05 - Math.abs(k) * 0.01, 4), gold, k * 0.04, 0.2 - Math.abs(k) * 0.01, 0.06)); head.add(mesh(ball(0.012, 0), mat('#2fe0d6', { metalness: 0.5, roughness: 0.1, emissive: '#0a5a55' }), 0, 0.2, 0.07)); }
    if (id === 'crown') {
      head.add(mesh(cyl(0.11, 0.1, 0.06, 10, 1), gold, 0, 0.17, 0));
      for (var j = 0; j < 8; j++) { var an = j / 8 * Math.PI * 2; head.add(mesh(new T.ConeGeometry(0.018, 0.07, 4), gold, Math.cos(an) * 0.1, 0.23, Math.sin(an) * 0.1)); }
      ['#e63946', '#2fe0d6', '#7c5cff'].forEach(function (gc, n) { head.add(mesh(ball(0.014, 0), mat(gc, { metalness: 0.4, roughness: 0.1, emissive: new T.Color(gc).multiplyScalar(0.3) }), (n - 1) * 0.05, 0.17, 0.1)); });
    }
    if (id === 'fan') {
      var fan = mesh(new T.CircleGeometry(0.16, 12, 0, Math.PI), new T.MeshStandardMaterial({ color: '#ff5fae', side: T.DoubleSide, roughness: 0.6, emissive: '#3a0a22' }), 0, -0.33, 0.04);
      fan.rotation.y = Math.PI / 2; P['fore1'].add(fan);
    }
    if (id === 'wings') {
      [-1, 1].forEach(function (s) {
        var w = new T.Shape(); w.moveTo(0, 0); w.bezierCurveTo(s * 0.35, 0.35, s * 0.7, 0.3, s * 0.75, 0.05); w.bezierCurveTo(s * 0.55, -0.1, s * 0.4, -0.35, 0, -0.1);
        var wm = mesh(new T.ShapeGeometry(w), new T.MeshStandardMaterial({ color: '#ffffff', side: T.DoubleSide, roughness: 0.4, emissive: '#5b44b8', emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }), s * 0.04, 0.38, -0.14);
        torso.add(wm);
      });
    }
  }

  // ---------- a stage: one canvas, one or more figures ----------
  function stage(host, o) {
    o = o || {};
    var r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!o.keep });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if ('outputColorSpace' in r) r.outputColorSpace = 'srgb'; else r.outputEncoding = T.sRGBEncoding;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    var el = r.domElement; el.className = 'av3d-canvas'; el.style.touchAction = 'pan-y';
    host.appendChild(el);
    var scene = new T.Scene(), cam = new T.PerspectiveCamera(o.fov || 28, 1, 0.1, 50);
    scene.add(new T.HemisphereLight('#ffe9f2', '#3a2a4a', 0.8));
    var key = new T.DirectionalLight('#fff0dc', 1.25); key.position.set(1.5, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 2.5; key.shadow.camera.bottom = -0.5; scene.add(key);
    var rimA = new T.PointLight(o.theme === 'grove' ? '#2fe36b' : '#ff5fae', 1.3, 6); rimA.position.set(-2, 2, -1.5); scene.add(rimA);
    var rimB = new T.PointLight(o.theme === 'grove' ? '#ffb703' : '#2fe0d6', 1.1, 6); rimB.position.set(2, 1.6, -1.5); scene.add(rimB);
    var floor = new T.Mesh(new T.CircleGeometry(o.looks && o.looks.length > 1 ? 1.5 : 0.9, 40), new T.MeshStandardMaterial({ color: o.floor || '#2a1d3d', roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    var spot = new T.Mesh(new T.RingGeometry(0.55, 0.6, 40), new T.MeshBasicMaterial({ color: '#ff5fae', transparent: true, opacity: 0.55 })); spot.rotation.x = -Math.PI / 2; spot.position.y = 0.003; scene.add(spot);
    var swayT = 0, baseYaw = 0, figs = [], yaw = o.yaw || 0.35, dragging = null, raf = 0, paused = false, t0 = performance.now(), spinUntil = [], gap = 0.55;
    function set(looks) {
      figs.forEach(function (fg) { scene.remove(fg); fg.traverse(function (m) { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); });
      figs = (looks || []).map(function (L, i) { var g = buildFigure(L); g.position.x = (i - (looks.length - 1) / 2) * gap * 2 / Math.max(1, looks.length - 1 || 1) * (looks.length > 1 ? 1 : 0); scene.add(g); return g; });
      if (looks.length > 1) figs.forEach(function (g, i) { g.position.x = (i - (looks.length - 1) / 2) * 1.0; });
      spot.visible = looks.length === 1;
      frameCam();
    }
    function frameCam() {
      var w = host.clientWidth || 300, h = host.clientHeight || 300;
      r.setSize(w, h, false); el.style.width = w + 'px'; el.style.height = h + 'px';
      cam.aspect = w / h;
      // fit 2.3 m of height (tall wigs and crowns) and both figures' width
      var tan = Math.tan(cam.fov * Math.PI / 360), halfW = figs.length > 1 ? 1.15 : 0.62, dist = Math.max(1.2 / tan, halfW / (tan * cam.aspect)) + 0.5;
      cam.position.set(0, 1.12, dist); cam.lookAt(0, 1.02, 0); cam.updateProjectionMatrix();
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      var t = (now - t0) / 1000;
      if (!dragging && o.spin !== false) { swayT += 0.008; yaw = baseYaw + Math.sin(swayT) * 0.75; }
      figs.forEach(function (g, i) {
        var P = g.userData, extra = 0;
        if (spinUntil[i] && now < spinUntil[i]) { var k = 1 - (spinUntil[i] - now) / 1200; extra = Math.sin(k * Math.PI / 2) * Math.PI * 2; }
        g.rotation.y = yaw + (figs.length > 1 ? (i ? -0.25 : 0.25) : 0) + extra;
        var br = Math.sin(t * 2 + i) * 0.012;
        if (P.torso) P.torso.scale.set(1 + br * 0.5, 1 + br, 1 + br * 0.5);
        if (P['arm-1']) { P['arm-1'].rotation.x = Math.sin(t * 1.3 + i) * 0.07; P['arm1'].rotation.x = -Math.sin(t * 1.3 + i) * 0.07; }
        if (P.head) P.head.rotation.y = Math.sin(t * 0.7 + i * 2) * 0.18;
        if (P.body) P.body.rotation.z = Math.sin(t * 1.1 + i) * 0.015;
      });
      spot.material.opacity = 0.35 + Math.sin(t * 2) * 0.2;
      r.render(scene, cam);
    }
    function down(e) { dragging = { x: e.clientX, yaw: yaw }; }
    function move(e) { if (dragging) yaw = dragging.yaw + (e.clientX - dragging.x) * 0.012; }
    function up() { if (dragging) { baseYaw = yaw; swayT = 0; } dragging = null; }
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    var ro = window.ResizeObserver ? new ResizeObserver(frameCam) : null; if (ro) ro.observe(host);
    var io = window.IntersectionObserver ? new IntersectionObserver(function (en) { paused = !en[0].isIntersecting; }) : null; if (io) io.observe(el);
    set(o.looks || []);
    raf = requestAnimationFrame(loop);
    return {
      el: el,
      set: set,
      sashay: function (i) { spinUntil[i || 0] = performance.now() + 1200; },
      pause: function (on) { paused = on; },
      attach: function (h) { host = h; if (el.parentNode !== h) h.appendChild(el); if (ro) { ro.disconnect(); ro.observe(h); } frameCam(); },
      dispose: function () { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); set([]); r.dispose(); el.remove(); }
    };
  }
  window.LQ3D = { load: load, stage: stage };
})();
