/* Life Quest portraits: original illustrated busts in each character's style
 * (their colours, hair, headwear, glasses and clothes), drawn as SVG.
 * Not game artwork; just a nod to the look. */
(function () {
  'use strict';
  var SKIN = { dark: '#6b4430', brown: '#8d5a3b', tan: '#c08a5e', light: '#e2b48f', pale: '#f0cdb0' };
  // hair, hairColour, facial, head(wear), eyes(wear), top, topColour, accent, build
  var LOOKS = {
    'sa-cj': { skin: 'dark', hair: 'buzz', hc: '#1a1a1a', face: 'stubble', top: 'vest', tc: '#f5f5f0', accent: '#2e9e4f' },
    'sa-smoke': { skin: 'dark', hair: 'buzz', hc: '#1a1a1a', face: 'goatee', eyes: 'glasses', top: 'jersey', tc: '#2e8b3d', accent: '#f5f5f0', build: 'big' },
    'sa-sweet': { skin: 'dark', hair: 'buzz', hc: '#1a1a1a', face: 'beard', top: 'shirt', tc: '#3f8f3f', accent: '#1c3d1c' },
    'sa-ryder': { skin: 'dark', hair: 'none', face: 'moustache', head: 'flatcap', hdc: '#b8a27a', eyes: 'shades', top: 'shirt', tc: '#3c7a3a', accent: '#d9c9a0', build: 'small' },
    'sa-kendl': { skin: 'dark', hair: 'bun', hc: '#1a1a1a', top: 'crop', tc: '#2e9e4f', accent: '#e0a33d', lips: 1 },
    'sa-cesar': { skin: 'tan', hair: 'none', face: 'moustache', top: 'vest', tc: '#f5f5f0', accent: '#c46a2b', tattoo: 1 },
    'sa-catalina': { skin: 'tan', hair: 'long', hc: '#2a1a12', top: 'crop', tc: '#b3402a', accent: '#2a0f0a', lips: 1 },
    'sa-woozie': { skin: 'light', hair: 'slick', hc: '#151515', top: 'suit', tc: '#1f1f1f', accent: '#b0202f' },
    'sa-truth': { skin: 'pale', hair: 'longgrey', hc: '#cfcac0', face: 'longbeard', fc: '#cfcac0', top: 'tiedye', tc: '#7a9a2a', accent: '#c9a35a' },
    'sa-toreno': { skin: 'tan', hair: 'slick', hc: '#8a8a8a', eyes: 'shades', top: 'suit', tc: '#2b2f36', accent: '#d9d9d9' },
    'sa-maddogg': { skin: 'dark', hair: 'none', face: 'goatee', head: 'beanie', hdc: '#6a2ba8', top: 'track', tc: '#7c3aed', accent: '#f5f5f0' },
    'sa-ogloc': { skin: 'dark', hair: 'none', face: 'goatee', head: 'cap', hdc: '#e0b228', top: 'tee', tc: '#e0b228', accent: '#c0392b' },
    'sa-zero': { skin: 'pale', hair: 'messy', hc: '#c25a2a', eyes: 'glasses', top: 'tee', tc: '#2563eb', accent: '#f5f5f0', build: 'small' },
    'sa-tenpenny': { skin: 'dark', hair: 'buzz', hc: '#1a1a1a', face: 'moustache', head: 'police', hdc: '#1f2a44', top: 'police', tc: '#2b3a5c', accent: '#d4af37', build: 'big' },
    'vc-tommy': { skin: 'light', hair: 'short', hc: '#2a1d14', top: 'hawaii', tc: '#14b8a6', accent: '#f472b6' },
    'vc-lance': { skin: 'brown', hair: 'slick', hc: '#151515', top: 'suit', tc: '#f2f2ee', accent: '#f9a8d4' },
    'vc-ken': { skin: 'light', hair: 'curly', hc: '#5a3a22', top: 'suit', tc: '#6b5a44', accent: '#e9c46a' },
    'vc-mercedes': { skin: 'tan', hair: 'long', hc: '#1d120c', top: 'crop', tc: '#ff4f9a', accent: '#7c3aed', lips: 1 },
    'vc-umberto': { skin: 'tan', hair: 'slick', hc: '#151515', face: 'moustache', top: 'hawaii', tc: '#e76f51', accent: '#2a9d8f' },
    'vc-phil': { skin: 'light', hair: 'none', face: 'stubble', head: 'cap', hdc: '#55603f', top: 'vest', tc: '#6b705c', accent: '#ddbe8a', build: 'big' },
    'vc-kent': { skin: 'pale', hair: 'longblond', hc: '#e8cf7a', eyes: 'shades', top: 'suit', tc: '#f2f2ee', accent: '#ffb703', build: 'small' },
    'vc-diaz': { skin: 'tan', hair: 'curly', hc: '#1a120c', face: 'moustache', top: 'shirt', tc: '#c1121f', accent: '#fdf0d5' },
    'vc-avery': { skin: 'pale', hair: 'none', face: 'moustache', fc: '#e8e4dc', head: 'stetson', hdc: '#e9e4d6', top: 'suit', tc: '#7a4e5b', accent: '#e8e4dc' },
    'vc-sonny': { skin: 'pale', hair: 'slick', hc: '#151515', top: 'suit', tc: '#2b2b2b', accent: '#a3a3a3' },
    // women of San Andreas and Vice City (named ones, and some inspired by the games)
    'sa-denise': { skin: 'dark', hair: 'long', hc: '#141414', head: 'bandana', hdc: '#2e9e4f', top: 'crop', tc: '#1f1f1f', accent: '#2e9e4f', lips: 1, ear: 'hoops' },
    'sa-millie': { skin: 'pale', hair: 'bob', hc: '#f0d27a', top: 'shirt', tc: '#f472b6', accent: '#ffffff', lips: 1 },
    'sa-helena': { skin: 'light', hair: 'long', hc: '#e8c873', eyes: 'glasses', top: 'tiedye', tc: '#8fbf5a', accent: '#e9c46a', lips: 1 },
    'sa-michelle': { skin: 'light', hair: 'ponytail', hc: '#7a4a22', top: 'overalls', tc: '#2563eb', accent: '#f5f5f0', lips: 1 },
    'sa-katie': { skin: 'light', hair: 'bob', hc: '#141414', top: 'scrubs', tc: '#2a9d8f', accent: '#dff4f5', lips: 1 },
    'sa-barbara': { skin: 'tan', hair: 'ponytail', hc: '#4a2e1c', head: 'police', hdc: '#1f2a44', top: 'police', tc: '#2b3a5c', accent: '#d4af37', lips: 1 },
    'sa-lowrider': { skin: 'tan', hair: 'long', hc: '#1d120c', head: 'bandana', hdc: '#1f1f1f', eyes: 'shades', top: 'vest', tc: '#f5f5f0', accent: '#c46a2b', lips: 1, ear: 'hoops' },
    'sa-vinewood': { skin: 'pale', hair: 'bighair', hc: '#f3dc8e', eyes: 'shades', top: 'sequin', tc: '#e11d48', accent: '#fde68a', lips: 1, ear: 'pearls' },
    'vc-skater': { skin: 'brown', hair: 'afro', hc: '#1a1a1a', head: 'visor', hdc: '#ff5fae', top: 'crop', tc: '#2fe0d6', accent: '#ff5fae', lips: 1, ear: 'hoops' },
    'vc-singer': { skin: 'dark', hair: 'bighair', hc: '#1a1a1a', top: 'sequin', tc: '#a855f7', accent: '#fde68a', lips: 1, ear: 'pearls' },
    'vc-lifeguard': { skin: 'tan', hair: 'ponytail', hc: '#e8cf7a', eyes: 'shades', top: 'swim', tc: '#e11d48', accent: '#fff', lips: 1 },
    'vc-heiress': { skin: 'pale', hair: 'bob', hc: '#2a1a12', eyes: 'shades', top: 'suit', tc: '#f2f2ee', accent: '#f9a8d4', lips: 1, ear: 'pearls' },
    'vc-aerobics': { skin: 'light', hair: 'bighair', hc: '#b5562a', head: 'headband', hdc: '#ff4f9a', top: 'leotard', tc: '#2fe0d6', accent: '#ff4f9a', lips: 1 }
  };

  function draw(id, c1, c2, gid, over) {
    if (!LOOKS[id]) return '';
    var L = Object.assign({}, LOOKS[id], over || {});
    if (over && over.hc && !over.fc && LOOKS[id].fc) L.fc = over.hc;
    var sk = SKIN[L.skin], dk = shade(sk, -0.18), w = L.build === 'big' ? 1.12 : L.build === 'small' ? 0.92 : 1;
    var o = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>';
    o += '<rect width="100" height="100" rx="26" fill="url(#' + gid + ')"/>';
    // long hair behind the head
    if (L.hair === 'long' || L.hair === 'longgrey' || L.hair === 'longblond') o += '<path d="M28 44 Q26 78 34 92 L66 92 Q74 78 72 44 Q50 30 28 44z" fill="' + L.hc + '"/>';
    if (L.hair === 'bighair') o += '<ellipse cx="50" cy="44" rx="31" ry="30" fill="' + L.hc + '"/>';
    if (L.hair === 'afro') o += '<circle cx="50" cy="36" r="27" fill="' + L.hc + '"/>';
    if (L.hair === 'ponytail') o += '<path d="M66 34 Q82 44 74 72 Q70 56 64 44z" fill="' + L.hc + '"/>';
    // shoulders and top
    var sw = 34 * w;
    o += '<path d="M' + (50 - sw) + ' 100 Q' + (50 - sw) + ' 78 ' + (50 - sw * 0.55) + ' 75 L' + (50 + sw * 0.55) + ' 75 Q' + (50 + sw) + ' 78 ' + (50 + sw) + ' 100z" fill="' + L.tc + '"/>';
    if (L.top === 'vest') o += '<path d="M' + (50 - sw) + ' 100 Q' + (50 - sw) + ' 80 ' + (50 - sw * 0.6) + ' 76 L40 76 Q50 90 60 76 L' + (50 + sw * 0.6) + ' 76 Q' + (50 + sw) + ' 80 ' + (50 + sw) + ' 100z" fill="' + sk + '"/><path d="M38 76 Q50 96 62 76 L66 100 L34 100z" fill="' + L.tc + '"/>';
    if (L.top === 'suit') o += '<path d="M44 75 L50 92 L56 75z" fill="#f5f5f0"/><path d="M48.5 78 L51.5 78 L52.5 96 L50 99 L47.5 96z" fill="' + L.accent + '"/><path d="M44 75 L50 92 L40 100 L36 100 Q38 84 44 75z M56 75 L50 92 L60 100 L64 100 Q62 84 56 75z" fill="' + shade(L.tc, -0.25) + '" opacity=".6"/>';
    if (L.top === 'shirt' || L.top === 'hawaii' || L.top === 'police') o += '<path d="M43 75 L50 84 L57 75 L54 74 L50 79 L46 74z" fill="' + shade(L.tc, 0.25) + '"/>';
    if (L.top === 'hawaii') o += [[30, 88], [42, 95], [62, 90], [72, 96], [56, 98]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="' + L.accent + '"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.2" fill="#fff"/>'; }).join('');
    if (L.top === 'jersey') o += '<text x="50" y="97" text-anchor="middle" font-size="13" font-weight="800" fill="' + L.accent + '" font-family="system-ui, sans-serif">7</text>';
    if (L.top === 'track') o += '<path d="M50 76 L50 100" stroke="' + L.accent + '" stroke-width="2"/><path d="M' + (50 - sw) + ' 92 L' + (50 - sw * 0.6) + ' 80 M' + (50 + sw) + ' 92 L' + (50 + sw * 0.6) + ' 80" stroke="' + L.accent + '" stroke-width="3"/>';
    if (L.top === 'tiedye') o += '<circle cx="50" cy="92" r="9" fill="' + L.accent + '" opacity=".8"/><circle cx="50" cy="92" r="4.5" fill="#e76f51" opacity=".85"/>';
    if (L.top === 'police') o += '<rect x="58" y="82" width="6" height="7" rx="1" fill="' + L.accent + '"/>';
    if (L.top === 'crop') o += '<path d="M40 76 Q50 84 60 76" stroke="' + shade(L.tc, -0.2) + '" stroke-width="2" fill="none"/>';
    if (L.top === 'overalls') o += '<rect x="38" y="80" width="24" height="20" rx="2" fill="' + shade(L.tc, -0.15) + '"/><path d="M40 80 L36 75 M60 80 L64 75" stroke="' + shade(L.tc, -0.15) + '" stroke-width="3"/><circle cx="41" cy="84" r="1.5" fill="#d4af37"/><circle cx="59" cy="84" r="1.5" fill="#d4af37"/>';
    if (L.top === 'scrubs') o += '<path d="M43 75 L50 86 L57 75" stroke="' + shade(L.tc, -0.25) + '" stroke-width="2" fill="none"/><rect x="58" y="86" width="7" height="6" rx="1" fill="' + shade(L.tc, -0.2) + '"/>';
    if (L.top === 'swim') o += '<path d="M36 100 Q38 82 44 78 L46 76 Q50 90 54 76 L56 78 Q62 82 64 100z" fill="' + L.tc + '"/><path d="M' + (50 - sw) + ' 100 Q' + (50 - sw) + ' 78 ' + (50 - sw * 0.55) + ' 75 L44 77 Q38 84 36 100z M' + (50 + sw) + ' 100 Q' + (50 + sw) + ' 78 ' + (50 + sw * 0.55) + ' 75 L56 77 Q62 84 64 100z" fill="' + SKIN[L.skin] + '"/>';
    if (L.top === 'sequin') for (var q = 0; q < 14; q++) o += '<circle cx="' + (30 + (q * 37) % 42) + '" cy="' + (82 + (q * 13) % 17) + '" r="1.3" fill="' + L.accent + '" opacity=".9"/>';
    if (L.top === 'leotard') o += '<path d="M' + (50 - sw) + ' 92 L' + (50 + sw) + ' 86" stroke="' + L.accent + '" stroke-width="5"/>';
    if (L.tattoo) o += '<path d="M24 92 q4 -6 8 0 q-4 4 -8 0z" fill="#3a5a8a" opacity=".7"/>';
    // neck and head
    o += '<rect x="44" y="60" width="12" height="17" rx="5" fill="' + dk + '"/>';
    var hw = 17 * (L.build === 'big' ? 1.1 : 1);
    o += '<ellipse cx="' + (50 - hw - 1) + '" cy="46" rx="3.5" ry="5" fill="' + dk + '"/><ellipse cx="' + (50 + hw + 1) + '" cy="46" rx="3.5" ry="5" fill="' + dk + '"/>';
    o += '<ellipse cx="50" cy="44" rx="' + hw + '" ry="21" fill="' + sk + '"/>';
    // hair on top
    var hc = L.hc || '#1a1a1a';
    if (L.hair === 'buzz') o += '<path d="M' + (50 - hw) + ' 40 Q' + (50 - hw) + ' 22 50 22 Q' + (50 + hw) + ' 22 ' + (50 + hw) + ' 40 Q50 30 ' + (50 - hw) + ' 40z" fill="' + hc + '" opacity=".85"/>';
    if (L.hair === 'short' || L.hair === 'slick') o += '<path d="M' + (50 - hw - 1) + ' 42 Q' + (50 - hw - 2) + ' 20 50 20 Q' + (50 + hw + 2) + ' 20 ' + (50 + hw + 1) + ' 42 Q' + (L.hair === 'slick' ? '52 26 ' : '60 30 ') + (50 - hw - 1) + ' 42z" fill="' + hc + '"/>' + (L.hair === 'slick' ? '<path d="M38 27 Q52 22 64 29" stroke="' + shade(hc, 0.35) + '" stroke-width="1.2" fill="none"/>' : '');
    if (L.hair === 'curly' || L.hair === 'messy') for (var i = 0; i < 9; i++) o += '<circle cx="' + (34 + i * 4) + '" cy="' + (26 + (i % 2) * 3) + '" r="' + (L.hair === 'curly' ? 5 : 4.5) + '" fill="' + hc + '"/>';
    if (L.hair === 'long' || L.hair === 'longgrey' || L.hair === 'longblond') o += '<path d="M' + (50 - hw - 2) + ' 50 Q' + (50 - hw - 3) + ' 20 50 20 Q' + (50 + hw + 3) + ' 20 ' + (50 + hw + 2) + ' 50 Q' + (50 + hw - 4) + ' 30 50 28 Q' + (50 - hw + 4) + ' 30 ' + (50 - hw - 2) + ' 50z" fill="' + hc + '"/>';
    if (L.hair === 'bob') o += '<path d="M' + (50 - hw - 3) + ' 58 Q' + (50 - hw - 4) + ' 20 50 20 Q' + (50 + hw + 4) + ' 20 ' + (50 + hw + 3) + ' 58 L' + (50 + hw - 2) + ' 58 Q' + (50 + hw - 3) + ' 32 50 31 Q' + (50 - hw + 3) + ' 32 ' + (50 - hw + 2) + ' 58z" fill="' + hc + '"/>';
    if (L.hair === 'ponytail') o += '<path d="M' + (50 - hw) + ' 40 Q' + (50 - hw) + ' 21 50 21 Q' + (50 + hw) + ' 21 ' + (50 + hw) + ' 40 Q50 27 ' + (50 - hw) + ' 40z" fill="' + hc + '"/>';
    if (L.hair === 'bighair' || L.hair === 'afro') o += '<path d="M' + (50 - hw) + ' 38 Q50 26 ' + (50 + hw) + ' 38 Q' + (50 + hw) + ' 22 50 22 Q' + (50 - hw) + ' 22 ' + (50 - hw) + ' 38z" fill="' + hc + '"/>';
    if (L.hair === 'bun') o += '<circle cx="50" cy="18" r="7" fill="' + hc + '"/><path d="M' + (50 - hw) + ' 42 Q' + (50 - hw) + ' 22 50 22 Q' + (50 + hw) + ' 22 ' + (50 + hw) + ' 42 Q50 28 ' + (50 - hw) + ' 42z" fill="' + hc + '"/>';
    // face
    var ey = 45;
    o += '<path d="M40 ' + (ey - 5) + ' L46 ' + (ey - 6) + ' M54 ' + (ey - 6) + ' L60 ' + (ey - 5) + '" stroke="' + shade(hc, 0.1) + '" stroke-width="1.8" stroke-linecap="round"/>';
    o += '<circle cx="43" cy="' + ey + '" r="1.9" fill="#1b1b1b"/><circle cx="57" cy="' + ey + '" r="1.9" fill="#1b1b1b"/>';
    o += '<path d="M50 ' + (ey + 2) + ' Q48 ' + (ey + 8) + ' 51 ' + (ey + 9) + '" stroke="' + dk + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
    o += '<path d="M44 ' + (ey + 14) + ' Q50 ' + (ey + 17) + ' 56 ' + (ey + 14) + '" stroke="' + (L.lips ? '#b5485d' : shade(sk, -0.4)) + '" stroke-width="' + (L.lips ? 2.4 : 1.6) + '" fill="none" stroke-linecap="round"/>';
    var fc = L.fc || hc;
    if (L.face === 'moustache') o += '<path d="M42 ' + (ey + 12) + ' Q50 ' + (ey + 8) + ' 58 ' + (ey + 12) + ' Q50 ' + (ey + 12) + ' 42 ' + (ey + 12) + 'z" fill="' + fc + '"/>';
    if (L.face === 'goatee') o += '<path d="M46 ' + (ey + 18) + ' Q50 ' + (ey + 25) + ' 54 ' + (ey + 18) + 'z" fill="' + fc + '"/><path d="M44 ' + (ey + 12) + ' Q50 ' + (ey + 9) + ' 56 ' + (ey + 12) + '" stroke="' + fc + '" stroke-width="1.6" fill="none"/>';
    if (L.face === 'beard' || L.face === 'longbeard') o += '<path d="M' + (50 - hw + 1) + ' 48 Q' + (50 - hw + 2) + ' ' + (L.face === 'longbeard' ? 80 : 66) + ' 50 ' + (L.face === 'longbeard' ? 82 : 67) + ' Q' + (50 + hw - 2) + ' ' + (L.face === 'longbeard' ? 80 : 66) + ' ' + (50 + hw - 1) + ' 48 Q' + (50 + hw - 6) + ' 58 50 58 Q' + (50 - hw + 6) + ' 58 ' + (50 - hw + 1) + ' 48z" fill="' + fc + '" opacity=".95"/>';
    if (L.face === 'stubble') o += '<path d="M' + (50 - hw + 3) + ' 52 Q50 70 ' + (50 + hw - 3) + ' 52" stroke="' + shade(sk, -0.35) + '" stroke-width="5" fill="none" opacity=".35"/>';
    // eyewear
    if (L.eyes === 'glasses') o += '<circle cx="43" cy="' + ey + '" r="5" fill="none" stroke="#1b1b1b" stroke-width="1.6"/><circle cx="57" cy="' + ey + '" r="5" fill="none" stroke="#1b1b1b" stroke-width="1.6"/><path d="M48 ' + ey + ' L52 ' + ey + '" stroke="#1b1b1b" stroke-width="1.6"/>';
    if (L.eyes === 'shades') o += '<path d="M36 ' + (ey - 4) + ' L64 ' + (ey - 4) + ' L62 ' + (ey + 3) + ' Q57 ' + (ey + 6) + ' 52 ' + (ey + 2) + ' L48 ' + (ey + 2) + ' Q43 ' + (ey + 6) + ' 38 ' + (ey + 3) + 'z" fill="#141414"/><path d="M40 ' + (ey - 2) + ' L44 ' + (ey - 2) + '" stroke="#fff" stroke-width="1" opacity=".5"/>';
    if (L.ear === 'hoops') o += '<circle cx="' + (50 - hw - 1) + '" cy="54" r="3.4" fill="none" stroke="#e0b228" stroke-width="1.4"/><circle cx="' + (50 + hw + 1) + '" cy="54" r="3.4" fill="none" stroke="#e0b228" stroke-width="1.4"/>';
    if (L.ear === 'pearls') { o += '<circle cx="' + (50 - hw - 1) + '" cy="52" r="1.8" fill="#f8f4ea"/><circle cx="' + (50 + hw + 1) + '" cy="52" r="1.8" fill="#f8f4ea"/>'; for (var pr = 0; pr < 7; pr++) o += '<circle cx="' + (42 + pr * 2.7) + '" cy="' + (76 + Math.sin(pr / 6 * Math.PI) * 3) + '" r="1.4" fill="#f8f4ea"/>'; }
    // headwear
    var hd = L.hdc || '#222';
    if (L.head === 'cap') o += '<path d="M' + (50 - hw - 1) + ' 34 Q' + (50 - hw) + ' 18 50 18 Q' + (50 + hw) + ' 18 ' + (50 + hw + 1) + ' 34z" fill="' + hd + '"/><path d="M' + (50 - hw - 1) + ' 34 L' + (50 + hw + 12) + ' 34 Q' + (50 + hw + 10) + ' 38 ' + (50 + hw - 2) + ' 37z" fill="' + shade(hd, -0.2) + '"/>';
    if (L.head === 'flatcap') o += '<path d="M' + (50 - hw - 2) + ' 34 Q50 14 ' + (50 + hw + 2) + ' 32 L' + (50 + hw + 6) + ' 36 L' + (50 - hw - 2) + ' 36z" fill="' + hd + '"/>';
    if (L.head === 'beanie') o += '<path d="M' + (50 - hw - 1) + ' 37 Q' + (50 - hw) + ' 14 50 14 Q' + (50 + hw) + ' 14 ' + (50 + hw + 1) + ' 37z" fill="' + hd + '"/><rect x="' + (50 - hw - 1.5) + '" y="32" width="' + (2 * hw + 3) + '" height="6" rx="2" fill="' + shade(hd, -0.2) + '"/>';
    if (L.head === 'police') o += '<path d="M' + (50 - hw - 1) + ' 32 L' + (50 - hw + 2) + ' 18 L' + (50 + hw - 2) + ' 18 L' + (50 + hw + 1) + ' 32z" fill="' + hd + '"/><rect x="' + (50 - hw - 3) + '" y="31" width="' + (2 * hw + 6) + '" height="4" rx="2" fill="#111"/><circle cx="50" cy="25" r="3" fill="#d4af37"/>';
    if (L.head === 'bandana') o += '<path d="M' + (50 - hw - 1) + ' 33 Q50 14 ' + (50 + hw + 1) + ' 33 Q50 28 ' + (50 - hw - 1) + ' 33z" fill="' + hd + '"/><path d="M' + (50 + hw - 2) + ' 30 L' + (50 + hw + 7) + ' 36 L' + (50 + hw + 2) + ' 38z" fill="' + hd + '"/><circle cx="44" cy="25" r=".9" fill="#fff"/><circle cx="54" cy="24" r=".9" fill="#fff"/>';
    if (L.head === 'visor') o += '<path d="M' + (50 - hw - 1) + ' 30 L' + (50 + hw + 1) + ' 30 L' + (50 + hw + 1) + ' 34 L' + (50 - hw - 1) + ' 34z" fill="' + hd + '"/><path d="M' + (50 - hw + 2) + ' 34 Q50 46 ' + (50 + hw - 2) + ' 34z" fill="' + hd + '" opacity=".7"/>';
    if (L.head === 'headband') o += '<rect x="' + (50 - hw - 1) + '" y="27" width="' + (2 * hw + 2) + '" height="5" rx="2.5" fill="' + hd + '"/>';
    if (L.head === 'stetson') o += '<ellipse cx="50" cy="31" rx="' + (hw + 12) + '" ry="5" fill="' + hd + '"/><path d="M' + (50 - hw + 2) + ' 31 Q' + (50 - hw + 2) + ' 12 50 14 Q' + (50 + hw - 2) + ' 12 ' + (50 + hw - 2) + ' 31z" fill="' + hd + '"/><rect x="' + (50 - hw + 2) + '" y="26" width="' + (2 * hw - 4) + '" height="3" fill="#6b4a2b"/>';
    return o;
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt))); };
    return '#' + [f(r), f(g), f(b)].map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
  }

  // What the style editor offers.
  var OPTIONS = {
    hair: [['', 'Theirs'], ['none', 'Shaved'], ['buzz', 'Buzz cut'], ['short', 'Short'], ['slick', 'Slicked back'], ['curly', 'Curly'], ['messy', 'Messy'], ['afro', 'Afro'], ['bob', 'Bob'], ['ponytail', 'Ponytail'], ['bun', 'Bun'], ['long', 'Long'], ['bighair', 'Big 80s hair']],
    hc: ['#141414', '#2a1d14', '#5a3a22', '#7a4a22', '#b5562a', '#c25a2a', '#e8cf7a', '#cfcac0', '#ff5fae', '#7c3aed', '#2fe0d6'],
    top: [['', 'Theirs'], ['vest', 'Vest'], ['tee', 'T-shirt'], ['shirt', 'Shirt'], ['hawaii', 'Hawaiian shirt'], ['jersey', 'Jersey'], ['track', 'Tracksuit'], ['suit', 'Suit'], ['crop', 'Crop top'], ['sequin', 'Sequins'], ['overalls', 'Overalls'], ['leotard', 'Leotard'], ['tiedye', 'Tie-dye']],
    tc: ['#f5f5f0', '#1f1f1f', '#2e9e4f', '#14b8a6', '#2563eb', '#7c3aed', '#ff4f9a', '#e11d48', '#e76f51', '#e0b228', '#6b705c'],
    head: [['', 'Theirs'], ['none', 'Nothing'], ['cap', 'Cap'], ['flatcap', 'Flat cap'], ['beanie', 'Beanie'], ['bandana', 'Bandana'], ['visor', 'Visor'], ['headband', 'Headband'], ['stetson', 'Cowboy hat']],
    eyes: [['', 'Theirs'], ['none', 'None'], ['glasses', 'Glasses'], ['shades', 'Shades']],
    face: [['', 'Theirs'], ['none', 'Clean'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Beard']],
    skin: [['', 'Theirs'], ['dark', ''], ['brown', ''], ['tan', ''], ['light', ''], ['pale', '']],
    ear: [['', 'Theirs'], ['none', 'None'], ['hoops', 'Hoops'], ['pearls', 'Pearls']]
  };

  window.LQPortrait = { draw: draw, has: function (id) { return !!LOOKS[id]; }, look: function (id) { return LOOKS[id]; }, OPTIONS: OPTIONS, SKIN: SKIN };
})();
