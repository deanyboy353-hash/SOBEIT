/**
 * Wardrobe.gs: clothes, hair and glam for your 3D character.
 *
 * Everything costs cash (which you earn from XP), and the best pieces also
 * need chores done before they unlock: the Grove Street jersey after 5, the
 * ball gown after 75, the winner's crown after 100. Basics are free.
 * Styles: San Andreas (sa), Vice City (vc), and drag race runway (drag).
 */

var ACH_TEXT = { streak7: 'Hit a 7-day streak', gym10: 'Log 10 gym sessions', booth1: 'Master your first Booth lesson (Solid or better)', pet30: 'Grow your pet to Legend (30 days you both win)' };
var WARDROBE = [
  // hair
  ['fade', 'hair', 'Fade', 0, 0, 'basic'], ['buzz', 'hair', 'Buzz cut', 0, 0, 'basic'], ['bob', 'hair', 'Bob', 0, 0, 'basic'], ['bald', 'hair', 'Clean head', 0, 0, 'basic'],
  ['afro', 'hair', 'Afro', 800, 0, 'sa'], ['cornrows', 'hair', 'Cornrows', 1200, 0, 'sa'], ['jheri', 'hair', 'Jheri curl', 1500, 3, 'sa'],
  ['mullet', 'hair', 'Mullet', 1000, 0, 'vc'], ['slick', 'hair', 'Slicked back', 1200, 0, 'vc'], ['waves', 'hair', 'Long waves', 900, 0, 'basic'],
  ['ponytail', 'hair', 'High ponytail', 900, 0, 'basic'], ['buns', 'hair', 'Space buns', 1100, 0, 'basic'], ['mohawk', 'hair', 'Mohawk', 1400, 5, 'vc'],
  ['beehive', 'hair', 'Beehive', 3000, 15, 'drag'], ['volume', 'hair', 'Volume Queen wig', 6000, 40, 'drag'],
  // tops
  ['tee', 'top', 'T-shirt', 0, 0, 'basic'], ['tank', 'top', 'Vest top', 0, 0, 'basic'], ['grove', 'top', 'Grove Street jersey', 1500, 5, 'sa'], ['tracktop', 'top', 'Tracksuit top', 1800, 0, 'sa'],
  ['hawaiian', 'top', 'Hawaiian shirt', 1500, 0, 'vc'], ['vcsuit', 'top', 'Pastel suit jacket', 4000, 20, 'vc'], ['hoodie', 'top', 'Hoodie', 1200, 0, 'basic'],
  ['bomber', 'top', 'Bomber jacket', 2000, 0, 'basic'], ['leather', 'top', 'Leather jacket', 3500, 10, 'vc'], ['crop', 'top', 'Crop top', 1000, 0, 'basic'],
  ['corset', 'top', 'Corset', 4500, 25, 'drag'], ['bodice', 'top', 'Sequin bodice', 8000, 50, 'drag'], ['fur', 'top', 'Fur coat', 9000, 60, 'drag'],
  // bottoms
  ['jeans', 'bottom', 'Jeans', 0, 0, 'basic'], ['shorts', 'bottom', 'Shorts', 0, 0, 'basic'], ['baggy', 'bottom', 'Baggy jeans', 1200, 0, 'sa'], ['trackpants', 'bottom', 'Tracksuit bottoms', 1400, 0, 'sa'],
  ['slacks', 'bottom', 'Pleated slacks', 1800, 0, 'vc'], ['skirt', 'bottom', 'Mini skirt', 1000, 0, 'basic'], ['hotpants', 'bottom', 'Hot pants', 1500, 5, 'drag'],
  ['mermaid', 'bottom', 'Mermaid gown', 9000, 40, 'drag'], ['gown', 'bottom', 'Ball gown', 12000, 75, 'drag'],
  // shoes
  ['sneakers', 'shoes', 'Trainers', 0, 0, 'basic'], ['boots', 'shoes', 'Boots', 1500, 0, 'sa'], ['loafers', 'shoes', 'Loafers', 1500, 0, 'vc'],
  ['heels', 'shoes', 'Platform heels', 3000, 10, 'drag'], ['thigh', 'shoes', 'Thigh-high boots', 7000, 30, 'drag'],
  // extras (up to four at once)
  ['shades', 'acc', 'Aviators', 600, 0, 'vc'], ['bandana', 'acc', 'Bandana', 500, 0, 'sa'], ['chain', 'acc', 'Gold chain', 1500, 0, 'sa'], ['cap', 'acc', 'Backwards cap', 400, 0, 'sa'],
  ['headphones', 'acc', 'DJ headphones', 1200, 0, 'basic'], ['hoops', 'acc', 'Hoop earrings', 800, 0, 'basic'], ['fan', 'acc', 'Fan', 3000, 15, 'drag'],
  ['boa', 'acc', 'Feather boa', 5000, 20, 'drag'], ['sash', 'acc', 'Pageant sash', 4000, 30, 'drag'], ['tiara', 'acc', 'Tiara', 7000, 50, 'drag'],
  ['wings', 'acc', 'Runway wings', 15000, 80, 'drag'], ['crown', 'acc', 'Winner\'s crown', 20000, 100, 'drag'],
  // patterns (for tops and bottoms)
  ['solid', 'pattern', 'Plain', 0, 0, 'basic'], ['stripes', 'pattern', 'Stripes', 500, 0, 'basic'], ['plaid', 'pattern', 'Plaid', 900, 0, 'sa'], ['flames', 'pattern', 'Flames', 1500, 5, 'sa'],
  ['floral', 'pattern', 'Vice City florals', 1200, 0, 'vc'], ['leopard', 'pattern', 'Leopard', 2500, 10, 'drag'], ['chrome', 'pattern', 'Chrome', 4000, 25, 'drag'], ['sequins', 'pattern', 'Sequins', 6000, 35, 'drag'],
  // glam
  ['glam', 'glam', 'Glam kit (lipstick and shadow)', 2000, 5, 'drag'],
  // earned, not bought: free the moment you hit the achievement
  ['streakhoodie', 'top', 'Flame streak hoodie', 0, 0, 'ach', 'streak7'], ['stringer', 'top', 'Gym stringer vest', 0, 0, 'ach', 'gym10'],
  ['goldphones', 'acc', 'Gold DJ headphones', 0, 0, 'ach', 'booth1'], ['petcrown', 'acc', 'Pet keeper\'s crown', 0, 0, 'ach', 'pet30']
].map(function (r) { return { id: r[0], slot: r[1], name: r[2], price: r[3], chores: r[4], style: r[5], ach: r[6] || '', req: r[6] ? ACH_TEXT[r[6]] : '' }; });

var LOOK3D_DEFAULT = {
  me: { body: 'm', skin: '#8d5a3b', hair: 'fade', hairC: '#1c1410', top: 'tee', topC: '#2e9e4f', topPat: 'solid', bottom: 'jeans', botC: '#2b3a67', botPat: 'solid', shoes: 'sneakers', shoeC: '#f2f2f2', acc: [], lips: '#9c4a52', shadow: '#5b44b8' },
  partner: { body: 'f', skin: '#c68a62', hair: 'waves', hairC: '#2a1a12', top: 'crop', topC: '#ff5fae', topPat: 'solid', bottom: 'jeans', botC: '#33415c', botPat: 'solid', shoes: 'sneakers', shoeC: '#ffffff', acc: [], lips: '#c2185b', shadow: '#7c5cff' }
};

function wardrobeItem_(id) { return WARDROBE.filter(function (w) { return w.id === id; })[0] || null; }

/** Achievements someone has, for the earned outfits: { streak7, gym10, booth1, pet30 }. */
function achievements_(who) {
  var got = {}, today = todayYmd_(), goal = dailyGoal_();
  try { if (streakNow_(who, today, goal).best >= 7) got.streak7 = true; } catch (e) {}
  try { var team = streakNow_('team', today, goal); if (team.total >= 30) got.pet30 = true; } catch (e) {}
  try { var days = {}; rotationDone_(today).forEach(function (x) { days[x.date] = 1; }); rowsBetween_('workoutLog', '0000', today).forEach(function (r) { days[String(r['Date'])] = 1; }); if (who === 'me' && Object.keys(days).length >= 10) got.gym10 = true; } catch (e) {}
  JSON.parse(prop_('ACH_' + who) || '[]').forEach(function (k) { got[k] = true; });
  return got;
}
/** The app tells us about achievements that live on the phone (Booth lessons). */
function unlockAch(key, id) {
  var who = who_(key);
  if (['booth1'].indexOf(id) === -1) throw new Error('Unknown achievement.');
  return withLock_(function () {
    var a = JSON.parse(prop_('ACH_' + who) || '[]');
    if (a.indexOf(id) === -1) { a.push(id); setProp_('ACH_' + who, JSON.stringify(a)); addFeed_(who, 'Unlocked the ' + wardrobeItem_('goldphones').name, 'empire'); }
    return appState_(who);
  });
}

function owned3d_(who) {
  var mine = JSON.parse(prop_('WARDROBE_' + who) || '[]'), ach = achievements_(who);
  WARDROBE.forEach(function (w) { if ((w.ach ? ach[w.ach] : !w.price) && mine.indexOf(w.id) === -1) mine.push(w.id); });
  if (who === 'partner' && mine.indexOf('waves') === -1) mine.push('waves');
  if (who === 'partner' && mine.indexOf('crop') === -1) mine.push('crop');
  return mine;
}

function look3d_(who) {
  return Object.assign({}, LOOK3D_DEFAULT[who], JSON.parse(prop_('LOOK3D_' + who) || '{}'));
}

/** Chores you've finished, all time (together jobs and covering for each other count). */
function choresDone_(who) {
  return xpRows_().filter(function (r) { return r.who === who && (r.kind === 'quest' || r.kind === 'cover'); }).length;
}

function wardrobeState_(who) {
  var other = who === 'me' ? 'partner' : 'me';
  return { catalog: WARDROBE, owned: owned3d_(who), ach: achievements_(who), look: look3d_(who), other: look3d_(other), chores: choresDone_(who) };
}

// ---- called from the app ----

function buyWear(key, id) {
  var who = who_(key);
  return withLock_(function () {
    var it = wardrobeItem_(id);
    if (!it) throw new Error('That isn\'t in the shop.');
    var owned = owned3d_(who);
    if (owned.indexOf(id) !== -1) throw new Error('You already own the ' + it.name + '.');
    if (it.ach) throw new Error('The ' + it.name + ' can\'t be bought. ' + it.req + ' and it\'s yours.');
    var done = choresDone_(who);
    if (done < it.chores) throw new Error('Do ' + (it.chores - done) + ' more chore' + (it.chores - done === 1 ? '' : 's') + ' to unlock the ' + it.name + '.');
    var cash = cashOf_(who);
    if (cash < it.price) throw new Error('You need £' + (it.price - cash).toLocaleString('en-GB') + ' more.');
    addCash_(who, 'Wardrobe: ' + it.name, -it.price, 'buy');
    var mine = JSON.parse(prop_('WARDROBE_' + who) || '[]');
    mine.push(id);
    setProp_('WARDROBE_' + who, JSON.stringify(mine));
    addFeed_(who, 'Bought the ' + it.name, 'empire');
    if (it.style === 'drag') push_(who === 'me' ? 'partner' : 'me', nicks_()[who] + ' bought the ' + it.name, 'Category is: Nudge realness.', 'home');
    return appState_(who);
  });
}

/** Save what you're wearing. Only things you own; colours as #rrggbb. */
function setLook3d(key, look) {
  var who = who_(key);
  look = look || {};
  return withLock_(function () {
    var owned = owned3d_(who), cur = look3d_(who), hex = /^#[0-9a-f]{6}$/i;
    var slotOk = function (id, slot) { var it = wardrobeItem_(id); return it && it.slot === slot && owned.indexOf(id) !== -1; };
    if (look.body !== undefined) cur.body = look.body === 'f' ? 'f' : 'm';
    [['hair', 'hair'], ['top', 'top'], ['bottom', 'bottom'], ['shoes', 'shoes'], ['topPat', 'pattern'], ['botPat', 'pattern']].forEach(function (p) {
      if (look[p[0]] === undefined) return;
      if (!slotOk(look[p[0]], p[1])) throw new Error('You don\'t own that yet.');
      cur[p[0]] = look[p[0]];
    });
    ['skin', 'hairC', 'topC', 'botC', 'shoeC'].forEach(function (k) { if (look[k] !== undefined && hex.test(look[k])) cur[k] = look[k].toLowerCase(); });
    if ((look.lips !== undefined || look.shadow !== undefined) && owned.indexOf('glam') !== -1) {
      if (hex.test(look.lips || '')) cur.lips = look.lips.toLowerCase();
      if (hex.test(look.shadow || '')) cur.shadow = look.shadow.toLowerCase();
    }
    if (Array.isArray(look.acc)) {
      var acc = look.acc.filter(function (id, i, a) { return a.indexOf(id) === i; });
      if (acc.length > 4) throw new Error('Four extras at most.');
      acc.forEach(function (id) { if (!slotOk(id, 'acc')) throw new Error('You don\'t own that yet.'); });
      cur.acc = acc;
    }
    setProp_('LOOK3D_' + who, JSON.stringify(cur));
    return appState_(who);
  });
}
