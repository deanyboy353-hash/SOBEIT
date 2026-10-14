/**
 * Empire.gs: cash, and the things you buy with it.
 *
 * Every XP you earn also pays cash ($10 per XP). Spend it on San Andreas and
 * Vice City properties and businesses, and on cars, bikes, boats and aircraft.
 * Businesses pay you every morning; upgrades raise what a place pays (or what
 * it's worth). Sell anything back for 60% of what you put in.
 * The Cash tab is the ledger; what you own lives in Script Properties (EMPIRE_<who>).
 */

var CASH_PER_XP = 10;
var SELL_BACK = 0.6;

// [id, name, area, game, type, price, daily income]
var EMPIRE_ITEMS = [
  ['ganton', 'Grove Street house', 'Ganton, Los Santos', 'sa', 'home', 5000, 0],
  ['mulholland', 'Mulholland safehouse', 'Mulholland, Los Santos', 'sa', 'home', 40000, 0],
  ['doherty', 'Doherty garage', 'Doherty, San Fierro', 'sa', 'business', 30000, 150],
  ['bluffs', 'Verdant Bluffs safehouse', 'Verdant Bluffs, Los Santos', 'sa', 'home', 20000, 0],
  ['zeroshop', 'Zero RC shop', 'Garcia, San Fierro', 'sa', 'business', 25000, 120],
  ['pricklepine', 'Prickle Pine mansion', 'Prickle Pine, Las Venturas', 'sa', 'home', 150000, 0],
  ['fourdragons', 'Four Dragons Casino share', 'The Strip, Las Venturas', 'sa', 'business', 200000, 1100],
  ['maddogg', 'Madd Dogg\'s mansion', 'Mulholland, Los Santos', 'sa', 'home', 300000, 0],
  ['oceanview', 'Ocean View Hotel room', 'Ocean Beach, Vice City', 'vc', 'home', 8000, 0],
  ['hyman', 'Hyman Condo', 'Downtown, Vice City', 'vc', 'home', 45000, 0],
  ['icecream', 'Cherry Popper ice cream factory', 'Little Havana, Vice City', 'vc', 'business', 35000, 180],
  ['poleposition', 'Pole Position Club', 'Ocean Beach, Vice City', 'vc', 'business', 40000, 200],
  ['kaufman', 'Kaufman Cabs', 'Little Haiti, Vice City', 'vc', 'business', 60000, 300],
  ['sunshine', 'Sunshine Autos', 'Little Havana, Vice City', 'vc', 'business', 80000, 400],
  ['interglobal', 'InterGlobal Films studio', 'Prawn Island, Vice City', 'vc', 'business', 100000, 500],
  ['malibu', 'The Malibu Club', 'Washington Beach, Vice City', 'vc', 'business', 120000, 600],
  ['vercetti', 'Vercetti Estate', 'Starfish Island, Vice City', 'vc', 'home', 250000, 0],
  ['bmx', 'BMX', 'Bike', 'sa', 'bike', 500, 0],
  ['faggio', 'Faggio', 'Scooter', 'vc', 'bike', 800, 0],
  ['sanchez', 'Sanchez', 'Dirt bike', 'sa', 'bike', 3000, 0],
  ['greenwood', 'Greenwood', 'Car', 'sa', 'car', 6000, 0],
  ['savanna', 'Savanna', 'Lowrider', 'sa', 'car', 9000, 0],
  ['pcj', 'PCJ-600', 'Sports bike', 'vc', 'bike', 12000, 0],
  ['stallion', 'Stallion', 'Muscle car', 'vc', 'car', 15000, 0],
  ['nrg', 'NRG-500', 'Superbike', 'sa', 'bike', 40000, 0],
  ['cheetah', 'Cheetah', 'Sports car', 'vc', 'car', 60000, 0],
  ['infernus', 'Infernus', 'Supercar', 'sa', 'car', 95000, 0],
  ['squalo', 'Squalo', 'Speedboat', 'vc', 'boat', 70000, 0],
  ['sparrow', 'Sparrow', 'Helicopter', 'vc', 'air', 120000, 0],
  ['hydra', 'Hydra', 'Jump jet', 'sa', 'air', 500000, 0]
];

// [id, name, share of the price, extra income (share of base), for which types]
var UPGRADES = [
  ['paint', 'Fresh paint and furniture', 0.15, 0.10, ['home', 'business']],
  ['studio', 'Music studio and DJ booth', 0.30, 0.15, ['home', 'business']],
  ['gallery', 'Art wall and gallery lights', 0.20, 0.10, ['home', 'business']],
  ['garage', 'Garage with a workshop', 0.35, 0.15, ['home', 'business']],
  ['pool', 'Rooftop pool', 0.50, 0.25, ['home', 'business']],
  ['respray', 'Respray', 0.10, 0, ['car', 'bike', 'boat', 'air']],
  ['rims', 'New wheels', 0.15, 0, ['car', 'bike']],
  ['nitro', 'Nitro', 0.25, 0, ['car', 'bike', 'boat']],
  ['hydraulics', 'Hydraulics', 0.20, 0, ['car']],
  ['sound', 'Big sound system', 0.15, 0, ['car', 'boat']]
];

function empireItem_(id) {
  for (var i = 0; i < EMPIRE_ITEMS.length; i++) {
    var x = EMPIRE_ITEMS[i];
    if (x[0] === id) return { id: x[0], name: x[1], area: x[2], game: x[3], type: x[4], price: x[5], income: x[6] };
  }
  return null;
}

/** "the Savanna", but "The Malibu Club" (never "the The"). */
function the_(name) {
  return /^The /.test(name) ? name : 'the ' + name;
}

function upgradeFor_(id) {
  for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i][0] === id) return { id: UPGRADES[i][0], name: UPGRADES[i][1], share: UPGRADES[i][2], boost: UPGRADES[i][3], types: UPGRADES[i][4] };
  return null;
}

// ---- cash ----

function addCash_(who, what, amount, kind) {
  amount = Math.round(Number(amount) || 0);
  if (!amount) return 0;
  appendRow_('cash', { 'Date': todayYmd_(), 'Time': now_('HH:mm'), 'Who': who, 'What': String(what).slice(0, 120), 'Amount': amount, 'Kind': kind });
  return amount;
}

function cashOf_(who) {
  return rowsBetween_('cash', '0000', '9999').reduce(function (s, r) { return r['Who'] === who ? s + (Number(r['Amount']) || 0) : s; }, 0);
}

function empire_(who) {
  return JSON.parse(prop_('EMPIRE_' + who) || 'null') || { owned: [], ride: '', home: '' };
}

function saveEmpire_(who, e) {
  setProp_('EMPIRE_' + who, JSON.stringify(e));
}

/** What one owned thing pays a day and is worth. */
function ownedValue_(o) {
  var it = empireItem_(o.id), paid = it.price, income = it.income;
  (o.upgrades || []).forEach(function (u) { var up = upgradeFor_(u); paid += Math.round(it.price * up.share); income += Math.round(it.income * up.boost); });
  return { paid: paid, income: income, worth: paid };
}

function empireState_(who) {
  var e = empire_(who), other = empire_(who === 'me' ? 'partner' : 'me');
  var owned = e.owned.map(function (o) {
    var it = empireItem_(o.id), v = ownedValue_(o);
    return { id: o.id, name: it.name, type: it.type, game: it.game, area: it.area, since: o.since, upgrades: o.upgrades || [], income: v.income, worth: v.worth,
      next: UPGRADES.filter(function (u) { return u[4].indexOf(it.type) !== -1 && (o.upgrades || []).indexOf(u[0]) === -1; })
        .map(function (u) { return { id: u[0], name: u[1], cost: Math.round(it.price * u[2]), boost: Math.round(it.income * u[3]) }; }) };
  });
  var sum = function (list, k) { return list.reduce(function (s, x) { return s + x[k]; }, 0); };
  var otherOwned = other.owned.map(function (o) { return ownedValue_(o); });
  var name = function (id) { var it = empireItem_(id); return it ? it.name : ''; };
  return {
    cash: cashOf_(who), owned: owned, income: sum(owned, 'income'), worth: sum(owned, 'worth'),
    ride: e.ride, rideName: name(e.ride), home: e.home, homeName: name(e.home),
    other: { worth: otherOwned.reduce(function (s, v) { return s + v.worth; }, 0), count: other.owned.length, rideName: name(other.ride), homeName: name(other.home) }
  };
}

/** The shop list, sent once with the app. */
function empireCatalog_() {
  return EMPIRE_ITEMS.map(function (x) { return { id: x[0], name: x[1], area: x[2], game: x[3], type: x[4], price: x[5], income: x[6] }; });
}

/** Daily job: businesses pay out. */
function payIncome_() {
  var paid = [];
  PEOPLE.forEach(function (who) {
    var e = empire_(who), total = 0;
    e.owned.forEach(function (o) {
      var v = ownedValue_(o);
      if (v.income) { addCash_(who, 'Income: ' + empireItem_(o.id).name, v.income, 'income'); total += v.income; }
    });
    if (total) paid.push(who + ' $' + total);
  });
  return paid.length ? paid.join(', ') : 'no businesses yet';
}

// ---- called from the app ----

function buyItem(key, id) {
  var who = who_(key);
  return withLock_(function () {
    var it = empireItem_(id);
    if (!it) throw new Error('That isn\'t for sale.');
    var e = empire_(who);
    if (e.owned.some(function (o) { return o.id === id; })) throw new Error('You already own ' + the_(it.name) + '.');
    var cash = cashOf_(who);
    if (cash < it.price) throw new Error('You need $' + (it.price - cash).toLocaleString('en-GB') + ' more.');
    addCash_(who, 'Bought: ' + it.name, -it.price, 'buy');
    e.owned.push({ id: id, since: todayYmd_(), upgrades: [] });
    if (it.type === 'home' && !e.home) e.home = id;
    if (['car', 'bike', 'boat', 'air'].indexOf(it.type) !== -1 && !e.ride) e.ride = id;
    saveEmpire_(who, e);
    addFeed_(who, 'Bought ' + the_(it.name), 'empire');
    push_(who === 'me' ? 'partner' : 'me', nicks_()[who] + ' just bought ' + the_(it.name), it.area, 'you');
    return appState_(who);
  });
}

function upgradeItem(key, id, upgradeId) {
  var who = who_(key);
  return withLock_(function () {
    var e = empire_(who), o = e.owned.filter(function (x) { return x.id === id; })[0], it = empireItem_(id), up = upgradeFor_(upgradeId);
    if (!o) throw new Error('You don\'t own that yet.');
    if (!up || up.types.indexOf(it.type) === -1) throw new Error('That upgrade doesn\'t fit ' + the_(it.name) + '.');
    if ((o.upgrades || []).indexOf(upgradeId) !== -1) throw new Error('Already done.');
    var cost = Math.round(it.price * up.share), cash = cashOf_(who);
    if (cash < cost) throw new Error('You need $' + (cost - cash).toLocaleString('en-GB') + ' more.');
    addCash_(who, it.name + ': ' + up.name, -cost, 'upgrade');
    o.upgrades = (o.upgrades || []).concat([upgradeId]);
    saveEmpire_(who, e);
    addFeed_(who, 'Upgraded ' + the_(it.name) + ': ' + up.name.toLowerCase(), 'empire');
    return appState_(who);
  });
}

function sellItem(key, id) {
  var who = who_(key);
  return withLock_(function () {
    var e = empire_(who), o = e.owned.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error('You don\'t own that.');
    var it = empireItem_(id), back = Math.round(ownedValue_(o).paid * SELL_BACK);
    addCash_(who, 'Sold: ' + it.name, back, 'sell');
    e.owned = e.owned.filter(function (x) { return x.id !== id; });
    if (e.ride === id) e.ride = '';
    if (e.home === id) e.home = '';
    saveEmpire_(who, e);
    return appState_(who);
  });
}

/** Choose your ride or the place you call home (shown on your character card). */
function setFavourite(key, id) {
  var who = who_(key);
  return withLock_(function () {
    var e = empire_(who), it = empireItem_(id);
    if (!it || !e.owned.some(function (o) { return o.id === id; })) throw new Error('You don\'t own that.');
    if (it.type === 'home' || it.type === 'business') e.home = id; else e.ride = id;
    saveEmpire_(who, e);
    return appState_(who);
  });
}
