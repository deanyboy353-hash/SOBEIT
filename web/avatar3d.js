/*
 * 3D characters for Life Quest: low-poly, San Andreas / Vice City style, with
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
  function fabric(col, pat, extra) {
    var tex = patternTex(pat, col), o = { color: tex ? 0xffffff : col, map: tex || null, roughness: 0.75, metalness: 0, flatShading: true };
    if (pat === 'chrome') { o.color = col; o.metalness = 0.95; o.roughness = 0.18; }
    if (pat === 'sequins') { o.metalness = 0.6; o.roughness = 0.3; o.emissive = new T.Color(col).multiplyScalar(0.18); }
    Object.assign(o, extra || {});
    return new T.MeshStandardMaterial(o);
  }
  function mat(col, extra) { return new T.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.7, flatShading: true }, extra || {})); }
  var GOLD = { color: '#f2c14e', metalness: 0.9, roughness: 0.25 };

  // ---------- the figure ----------
  function mesh(geo, m, x, y, z) { var o = new T.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; return o; }
  function cyl(rt, rb, h, seg) { return new T.CylinderGeometry(rt, rb, h, seg || 8); }
  function ball(r, d) { return new T.IcosahedronGeometry(r, d === undefined ? 1 : d); }
  function box(w, h, d) { return new T.BoxGeometry(w, h, d); }

  function buildFigure(L) {
    var f = L.body === 'f', root = new T.Group(), skin = mat(L.skin, { roughness: 0.6 });
    var top = fabric(L.topC, L.topPat), bot = fabric(L.botC, L.botPat), shoe = mat(L.shoeC, { roughness: 0.5 }), hairM = mat(L.hairC, { roughness: 0.55 });
    var parts = {};
    var heel = L.shoes === 'heels' || L.shoes === 'thigh' ? 0.07 : 0;
    var body = new T.Group(); body.position.y = heel; root.add(body); parts.body = body;
    var sleeves = { tee: 'short', tank: 'none', grove: 'none', tracktop: 'long', hawaiian: 'short', vcsuit: 'long', hoodie: 'long', bomber: 'long', leather: 'long', crop: 'short', corset: 'none', bodice: 'none', fur: 'long' }[L.top] || 'short';
    var bulky = L.top === 'fur' ? 1.25 : L.top === 'bomber' || L.top === 'hoodie' ? 1.08 : 1;
    // legs
    var legX = f ? 0.085 : 0.1, baggy = L.bottom === 'baggy' || L.bottom === 'trackpants' ? 1.3 : L.bottom === 'slacks' ? 1.12 : 1;
    var legCover = { jeans: [1, 1], shorts: [0.5, 0], baggy: [1, 1], trackpants: [1, 1], slacks: [1, 1], skirt: [0, 0], hotpants: [0.15, 0], mermaid: [1, 1], gown: [1, 1] }[L.bottom] || [1, 1];
    var thighM = legCover[0] >= 1 ? bot : skin, shinM = legCover[1] >= 1 ? bot : skin;
    if (L.shoes === 'thigh') { shinM = shoe; }
    [-1, 1].forEach(function (s) {
      var hip = new T.Group(); hip.position.set(s * legX, 0.9, 0); body.add(hip); parts['leg' + s] = hip;
      var th = mesh(cyl(0.075 * baggy * (f ? 1.05 : 1), 0.06 * baggy, 0.42), thighM, 0, -0.21, 0); hip.add(th);
      if (legCover[0] > 0 && legCover[0] < 1) hip.add(mesh(cyl(0.08 * baggy, 0.072, 0.42 * legCover[0]), bot, 0, -0.42 * legCover[0] / 2, 0));
      if (L.shoes === 'thigh') hip.add(mesh(cyl(0.07, 0.064, 0.2), shoe, 0, -0.34, 0));
      var knee = new T.Group(); knee.position.y = -0.42; hip.add(knee);
      knee.add(mesh(cyl(0.06 * baggy, 0.045 * (baggy > 1 ? 1.4 : 1), 0.42), shinM, 0, -0.21, 0));
      // shoes
      var foot = new T.Group(); foot.position.y = -0.44; knee.add(foot);
      if (L.shoes === 'heels' || L.shoes === 'thigh') {
        foot.add(mesh(box(0.08, 0.04, 0.17), shoe, 0, -0.01, 0.04)); foot.add(mesh(cyl(0.012, 0.01, 0.08), shoe, 0, -0.06, -0.03));
        foot.add(mesh(box(0.085, 0.03, 0.08), shoe, 0, -0.08, 0.08));
        if (L.shoes === 'heels') foot.add(mesh(cyl(0.05, 0.05, 0.06), shoe, 0, 0.03, 0));
      } else if (L.shoes === 'boots') {
        foot.add(mesh(cyl(0.055, 0.06, 0.16), shoe, 0, 0.07, 0)); foot.add(mesh(box(0.11, 0.07, 0.22), shoe, 0, -0.02, 0.04));
      } else if (L.shoes === 'loafers') {
        foot.add(mesh(box(0.095, 0.05, 0.22), shoe, 0, -0.02, 0.045)); foot.add(mesh(box(0.06, 0.01, 0.03), mat('#c9a227', GOLD), 0, 0.01, 0.1));
      } else {
        foot.add(mesh(box(0.11, 0.08, 0.24), shoe, 0, -0.02, 0.04)); foot.add(mesh(box(0.115, 0.025, 0.25), mat('#ffffff'), 0, -0.06, 0.04));
      }
    });
    // pelvis, torso, skirts
    body.add(mesh(box(f ? 0.32 : 0.3, 0.16, 0.19), L.bottom === 'skirt' || L.bottom === 'gown' || L.bottom === 'mermaid' || L.bottom === 'hotpants' || legCover[0] ? bot : skin, 0, 0.95, 0));
    if (L.bottom === 'skirt') body.add(mesh(cyl(0.17, 0.25, 0.26, 10), bot, 0, 0.8, 0));
    if (L.bottom === 'gown') { var gw = mesh(cyl(0.16, 0.5, 0.95, 14), bot, 0, 0.45, 0); body.add(gw); body.add(mesh(cyl(0.5, 0.52, 0.04, 14), bot, 0, -0.03, 0)); }
    if (L.bottom === 'mermaid') { body.add(mesh(cyl(0.17, 0.12, 0.6, 12), bot, 0, 0.62, 0)); body.add(mesh(cyl(0.12, 0.36, 0.3, 12), bot, 0, 0.17, 0)); }
    var torso = new T.Group(); torso.position.y = 1.02; body.add(torso); parts.torso = torso;
    var shoulder = (f ? 0.18 : 0.22) * bulky, waist = (f ? 0.13 : 0.165) * bulky;
    var belly = L.top === 'crop' ? skin : top, chest = top;
    var bellyMesh = mesh(cyl(waist + 0.015, waist, 0.2, 8), belly, 0, 0.1, 0); bellyMesh.scale.z = 0.62; torso.add(bellyMesh);
    var chestMesh = mesh(cyl(shoulder, waist + 0.015, 0.32, 8), chest, 0, 0.36, 0); chestMesh.scale.z = 0.62; torso.add(chestMesh);
    if (f) { [-1, 1].forEach(function (s) { var b = mesh(ball(0.065, 1), chest, s * 0.07, 0.38, 0.09); b.scale.z = 0.7; torso.add(b); }); }
    if (L.top === 'grove') { torso.add(mesh(box(0.12, 0.14, 0.01), mat('#ffffff'), 0, 0.36, 0.14)); }
    if (L.top === 'vcsuit') { torso.add(mesh(box(0.08, 0.3, 0.02), mat('#f4f1ea'), 0, 0.36, 0.13)); [-1, 1].forEach(function (s) { var lp = mesh(box(0.05, 0.22, 0.015), top, s * 0.06, 0.4, 0.14); lp.rotation.z = s * 0.25; torso.add(lp); }); }
    if (L.top === 'corset') { for (var ci = 0; ci < 5; ci++) torso.add(mesh(box(0.06, 0.008, 0.012), mat('#111111'), 0, 0.12 + ci * 0.06, 0.135)); }
    if (L.top === 'hoodie') { var hood = mesh(new T.TorusGeometry(0.11, 0.045, 6, 12), top, 0, 0.53, -0.07); hood.rotation.x = 1.2; torso.add(hood); }
    if (L.top === 'fur') { for (var fi = 0; fi < 10; fi++) { var a = fi / 10 * Math.PI * 2; torso.add(mesh(ball(0.07, 0), top, Math.cos(a) * 0.17, 0.5, Math.sin(a) * 0.1)); } }
    if (L.top === 'tracktop') { torso.add(mesh(box(0.01, 0.5, 0.01), mat('#ffffff'), 0, 0.27, 0.105)); }
    // neck and head
    torso.add(mesh(cyl(0.05, 0.055, 0.1), skin, 0, 0.56, 0));
    var head = new T.Group(); head.position.y = 0.7; torso.add(head); parts.head = head;
    var skull = mesh(ball(0.12, 1), skin, 0, 0, 0); skull.scale.set(1, 1.18, 1.05); head.add(skull);
    var dark = mat('#1a1410'), white = mat('#ffffff');
    [-1, 1].forEach(function (s) {
      head.add(mesh(ball(0.016, 0), white, s * 0.045, 0.02, 0.11)); head.add(mesh(ball(0.009, 0), dark, s * 0.045, 0.02, 0.123));
      head.add(mesh(box(0.045, 0.01, 0.01), mat(L.hairC), s * 0.045, 0.055, 0.112));
      if (f || L.lips !== '#9c4a52') { var sh = mesh(box(0.04, 0.012, 0.006), mat(L.shadow, { emissive: new T.Color(L.shadow).multiplyScalar(0.2) }), s * 0.045, 0.038, 0.115); head.add(sh); }
      var ear = mesh(ball(0.025, 0), skin, s * 0.122, 0.0, 0); ear.scale.set(0.5, 1, 1); head.add(ear);
    });
    head.add(mesh(box(0.025, 0.04, 0.03), skin, 0, -0.01, 0.125));
    head.add(mesh(box(0.06, 0.016, 0.015), mat(L.lips, { roughness: 0.35 }), 0, -0.065, 0.11));
    addHair(head, L, hairM);
    // arms
    var armM = sleeves === 'long' ? top : skin;
    [-1, 1].forEach(function (s) {
      var sh = new T.Group(); sh.position.set(s * (shoulder + 0.02), 0.45, 0); sh.rotation.z = s * 0.14; torso.add(sh); parts['arm' + s] = sh;
      sh.add(mesh(cyl(0.05 * bulky, 0.044 * bulky, 0.3), armM, 0, -0.15, 0));
      if (sleeves === 'short') sh.add(mesh(cyl(0.058 * bulky, 0.054, 0.13), top, 0, -0.06, 0));
      var el = new T.Group(); el.position.y = -0.3; el.rotation.x = -0.15; sh.add(el); parts['fore' + s] = el;
      el.add(mesh(cyl(0.043 * bulky, 0.036, 0.28), armM, 0, -0.14, 0));
      el.add(mesh(ball(0.045, 0), skin, 0, -0.31, 0));
    });
    // extras
    (L.acc || []).forEach(function (id) { addAcc(id, parts, L, f); });
    root.userData = parts;
    return root;
  }
  function addHair(head, L, m) {
    var h = L.hair, cap = function (sc, y) { var c = mesh(new T.SphereGeometry(0.128, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), m, 0, y || 0.015, -0.005); c.scale.set(1.02 * (sc || 1), 1.2 * (sc || 1), 1.08 * (sc || 1)); head.add(c); return c; };
    if (h === 'bald') return;
    if (h === 'fade' || h === 'buzz') { cap(h === 'buzz' ? 1 : 1.03); return; }
    if (h === 'afro') { var a = mesh(ball(0.2, 1), m, 0, 0.08, -0.02); a.scale.set(1, 0.9, 0.95); head.add(a); return; }
    if (h === 'cornrows') { cap(1.01); for (var i = -3; i <= 3; i++) { var r = mesh(box(0.014, 0.012, 0.26), m, i * 0.03, 0.135 - Math.abs(i) * 0.012, -0.01); r.rotation.x = 0.3; head.add(r); } return; }
    if (h === 'jheri') { cap(1.04); for (i = 0; i < 12; i++) { var an = i / 12 * Math.PI + Math.PI; head.add(mesh(ball(0.035, 0), mat(L.hairC, { roughness: 0.15, metalness: 0.3 }), Math.cos(an) * 0.13, -0.02 + (i % 2) * 0.03, Math.sin(an) * 0.12 + 0.02)); } return; }
    if (h === 'mullet') { cap(1.04); head.add(mesh(box(0.2, 0.2, 0.06), m, 0, -0.1, -0.11)); return; }
    if (h === 'slick') { var s = cap(1.05); s.material = mat(L.hairC, { roughness: 0.15, metalness: 0.35 }); head.add(mesh(box(0.2, 0.05, 0.12), s.material, 0, 0.12, -0.06)); return; }
    if (h === 'bob') { cap(1.08); [-1, 1].forEach(function (x) { head.add(mesh(box(0.05, 0.18, 0.2), m, x * 0.125, -0.03, -0.01)); }); head.add(mesh(box(0.25, 0.18, 0.06), m, 0, -0.03, -0.12)); head.add(mesh(box(0.22, 0.04, 0.05), m, 0, 0.1, 0.1)); return; }
    if (h === 'waves') { cap(1.06); head.add(mesh(box(0.27, 0.42, 0.07), m, 0, -0.16, -0.11)); [-1, 1].forEach(function (x) { head.add(mesh(box(0.05, 0.32, 0.13), m, x * 0.13, -0.1, -0.03)); }); return; }
    if (h === 'ponytail') { cap(1.03); var t = mesh(cyl(0.035, 0.02, 0.32), m, 0, 0.06, -0.2); t.rotation.x = 0.6; head.add(t); head.add(mesh(new T.TorusGeometry(0.03, 0.01, 4, 8), mat('#ff5fae'), 0, 0.15, -0.14)); return; }
    if (h === 'buns') { cap(1.03); [-1, 1].forEach(function (x) { head.add(mesh(ball(0.06, 1), m, x * 0.09, 0.15, -0.02)); }); return; }
    if (h === 'mohawk') { cap(0.99); for (i = 0; i < 6; i++) head.add(mesh(box(0.03, 0.08 + (i % 2) * 0.02, 0.04), m, 0, 0.16 - Math.abs(i - 2.5) * 0.008, 0.09 - i * 0.04)); return; }
    if (h === 'beehive') { cap(1.05); var b = mesh(ball(0.14, 1), m, 0, 0.2, -0.02); b.scale.set(0.95, 1.5, 1); head.add(b); head.add(mesh(new T.TorusGeometry(0.1, 0.012, 4, 12), mat('#ff5fae'), 0, 0.1, 0)); return; }
    if (h === 'volume') {
      cap(1.08);
      for (i = 0; i < 22; i++) { var ang = i / 22 * Math.PI * 2, ring = i % 2; head.add(mesh(ball(0.075 + ring * 0.02, 0), m, Math.cos(ang) * (0.17 + ring * 0.04), 0.08 - (i % 3) * 0.12, Math.sin(ang) * 0.13 - 0.06)); }
      for (i = 0; i < 5; i++) head.add(mesh(ball(0.09, 0), m, (i - 2) * 0.07, 0.2 + (i % 2) * 0.05, -0.04));
      return;
    }
    cap();
  }
  function addAcc(id, P, L, f) {
    var head = P.head, torso = P.torso, gold = mat('#f2c14e', GOLD);
    if (id === 'shades') { [-1, 1].forEach(function (s) { head.add(mesh(box(0.05, 0.03, 0.01), mat('#111111', { metalness: 0.6, roughness: 0.1 }), s * 0.045, 0.02, 0.128)); }); head.add(mesh(box(0.14, 0.008, 0.008), gold, 0, 0.035, 0.128)); }
    if (id === 'bandana') { var b = mesh(new T.TorusGeometry(0.128, 0.022, 4, 16), mat('#1f4fd1'), 0, 0.06, 0); b.rotation.x = Math.PI / 2 + 0.15; b.scale.z = 1.1; head.add(b); }
    if (id === 'chain') { var c = mesh(new T.TorusGeometry(0.1, 0.012, 6, 16), gold, 0, 0.47, 0.06); c.rotation.x = 1.3; torso.add(c); torso.add(mesh(ball(0.025, 0), gold, 0, 0.38, 0.13)); }
    if (id === 'cap') { var cp = mesh(new T.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#c1121f'), 0, 0.03, 0); cp.scale.y = 1.1; head.add(cp); head.add(mesh(box(0.15, 0.015, 0.12), mat('#c1121f'), 0, 0.04, -0.18)); }
    if (id === 'headphones') { var hb = mesh(new T.TorusGeometry(0.14, 0.015, 6, 16, Math.PI), mat('#222222'), 0, 0.02, 0); head.add(hb); [-1, 1].forEach(function (s) { var cu = mesh(cyl(0.045, 0.045, 0.04, 10), mat('#ff5fae', { metalness: 0.4 }), s * 0.14, 0.0, 0); cu.rotation.z = Math.PI / 2; head.add(cu); }); }
    if (id === 'hoops') { [-1, 1].forEach(function (s) { var h = mesh(new T.TorusGeometry(0.025, 0.005, 4, 12), gold, s * 0.125, -0.045, 0.01); h.rotation.y = Math.PI / 2; head.add(h); }); }
    if (id === 'boa') { for (var i = 0; i < 18; i++) { var a = i / 17 * Math.PI * 1.15 - 0.08; torso.add(mesh(ball(0.05, 0), mat('#ff7eb6', { roughness: 1 }), Math.cos(a + Math.PI) * -0.21, 0.5 - Math.sin(a) * 0.12 - (i > 14 ? (i - 14) * 0.06 : 0), Math.sin(a) * 0.13 + 0.02)); } }
    if (id === 'sash') {
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; var g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#c9a227'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center'; g.fillText('MISS LIFE QUEST', 128, 23);
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
    scene.add(new T.HemisphereLight('#ffffff', '#3a2a4a', 0.75));
    var key = new T.DirectionalLight('#ffffff', 1.1); key.position.set(1.5, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 2.5; key.shadow.camera.bottom = -0.5; scene.add(key);
    var rimA = new T.PointLight(o.theme === 'grove' ? '#2fe36b' : '#ff5fae', 1.3, 6); rimA.position.set(-2, 2, -1.5); scene.add(rimA);
    var rimB = new T.PointLight(o.theme === 'grove' ? '#ffb703' : '#2fe0d6', 1.1, 6); rimB.position.set(2, 1.6, -1.5); scene.add(rimB);
    var floor = new T.Mesh(new T.CircleGeometry(o.looks && o.looks.length > 1 ? 1.5 : 0.9, 40), new T.MeshStandardMaterial({ color: o.floor || '#2a1d3d', roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    var spot = new T.Mesh(new T.RingGeometry(0.55, 0.6, 40), new T.MeshBasicMaterial({ color: '#ff5fae', transparent: true, opacity: 0.55 })); spot.rotation.x = -Math.PI / 2; spot.position.y = 0.003; scene.add(spot);
    var figs = [], yaw = o.yaw || 0.35, dragging = null, raf = 0, paused = false, t0 = performance.now(), spinUntil = [], gap = 0.55;
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
      var span = figs.length > 1 ? 1.25 : 1.05, dist = Math.max(2.2 / Math.tan(cam.fov * Math.PI / 360) / 2 * 1.0, span / Math.tan(cam.fov * Math.PI / 360) / cam.aspect);
      cam.position.set(0, 1.05, dist); cam.lookAt(0, 0.92, 0); cam.updateProjectionMatrix();
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      var t = (now - t0) / 1000;
      if (!dragging && o.spin !== false) yaw += 0.004;
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
    function up() { dragging = null; }
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
