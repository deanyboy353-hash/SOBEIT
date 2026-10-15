/*
 * Nudge · Setup: one short question per screen (tap a chip, hardly any typing), then a chore list built from your answers.
 * Re-run any time from You, Settings, or change one answer from the list there. Every chore is editable in Chores, Schedule.
 * Talks to the server through the small API app.js hands over (window.NudgeSetup.init).
 */
(function () {
  'use strict';
  var N = null, W = null;            // N: app helpers; W: the wizard while it's open
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WEEK = [1, 2, 3, 4, 5, 6, 0];
  var FREQS = [['daily', 'Daily'], ['few', 'A few times a week'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['rarely', 'Rarely']];
  var ROOMS = { downstairs: ['Kitchen', 'Living room', 'Dining room', 'Hallway', 'Toilet', 'Utility room'], upstairs: ['Bedroom', 'Bedroom 2', 'Study', 'Bathroom', 'En-suite', 'Stairs and landing'], one: ['Kitchen', 'Living room', 'Bedroom', 'Bedroom 2', 'Study', 'Bathroom', 'Hallway'] };
  var BINS = ['General waste', 'Recycling', 'Garden waste', 'Food waste', 'Glass'];
  function esc(s) { return N.esc(s); }
  function el(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function hm(m) { m = Math.round(m); return ('0' + Math.floor(m / 60) % 24).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
  function mins(t) { var p = String(t || '').split(':'); return p.length === 2 ? +p[0] * 60 + +p[1] : null; }
  function who() { return N.S().who; }
  function other() { return N.names().other || 'Yaz'; }
  function personLabel(w) { return w === 'me' ? (who() === 'me' ? 'Me' : other()) : w === 'yaz' || w === 'partner' ? (who() === 'partner' ? 'Me' : other()) : w; }

  // ---------- small building blocks ----------
  /** A row of chips. multi: toggles; otherwise picks one. data-wz="field" data-v="value" */
  function chips(field, opts, cur, multi) {
    return '<div class="wz-chips">' + opts.map(function (o) {
      var v = String(o[0]), on = multi ? (cur || []).map(String).indexOf(v) !== -1 : String(cur) === v;
      return '<button type="button" class="wz-chip' + (on ? ' on' : '') + '" data-wz="' + esc(field) + '" data-v="' + esc(v) + '"' + (multi ? ' data-multi="1"' : '') + ' aria-pressed="' + on + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function timeRow(field, cur, presets) {
    return chips(field, presets.map(function (m) { return [m, hm(m)]; }), cur) + '<label class="wz-or">or exactly <input type="time" data-wzt="' + esc(field) + '" value="' + (cur !== null && cur !== undefined ? hm(cur) : '') + '"></label>';
  }
  function get(path) { var o = W.d; path.split('.').forEach(function (k) { o = o == null ? undefined : o[k]; }); return o; }
  function set(path, v) { var ks = path.split('.'), o = W.d; ks.slice(0, -1).forEach(function (k) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = v; }

  // ---------- the steps ----------
  // Each: { id, sec, q, help, opt, html(), save() -> data for saveSetup(sec, data), show() }
  function steps() {
    var me = who() === 'me', d = W.d, two = (d.house.floors || []).length > 1, list = [];
    function add(s) { if (!s.show || s.show()) list.push(s); }
    // profile
    add({ id: 'name', sec: 'profile', q: 'What should we call you?', html: function () { return '<input type="text" class="wz-text" data-wzi="profile.name" value="' + esc(d.profile.name || '') + '" maxlength="30" placeholder="Your name">'; }, save: function () { return { name: d.profile.name }; } });
    add({ id: 'avatar', sec: 'profile', q: 'Pick your character', help: 'It shows on your home screen and in the games. You can dress it up later in You, Dressing room.', opt: true,
      html: function () { return '<div class="wz-avs">' + N.chars().map(function (c) { return '<button type="button" class="wz-av' + (d.profile.avatar === c[0] ? ' on' : '') + '" data-wz="profile.avatar" data-v="' + esc(c[0]) + '">' + N.avatar(c[0], 54) + '<span>' + esc(c[2]) + '</span></button>'; }).join('') + '</div>'; },
      save: function () { if (d.profile.avatar) N.setChar(d.profile.avatar); return { avatar: d.profile.avatar || '' }; } });
    add({ id: 'work', sec: 'profile', q: 'Which days do you work, and when?', help: 'Tap a day to switch it on or off. Chores stay light on work days.',
      html: function () {
        var w = d.profile.work || {}, h = '<div class="wz-days">' + WEEK.map(function (i) { return '<button type="button" class="wz-chip' + (w[i] ? ' on' : '') + '" data-wzday="' + i + '" aria-pressed="' + !!w[i] + '">' + DAYS[i] + '</button>'; }).join('') + '</div>';
        var on = WEEK.filter(function (i) { return w[i]; });
        if (on.length) h += '<div class="wz-hours">' + on.map(function (i) { return '<div class="wz-hrow"><b>' + DAYS[i] + '</b><input type="time" data-wzh="' + i + '.0" value="' + hm(w[i][0]) + '" aria-label="' + DAYS[i] + ' start"><span>to</span><input type="time" data-wzh="' + i + '.1" value="' + hm(w[i][1]) + '" aria-label="' + DAYS[i] + ' finish"></div>'; }).join('') + '</div>' +
          '<div class="small muted">Same hours every day:</div>' + chips('workPreset', [['540-900', '9 to 3'], ['540-960', '9 to 4'], ['540-1020', '9 to 5'], ['540-1050', '9 to 5:30']], '');
        else h += '<p class="small muted">No work days: every day gets a normal amount of chores.</p>';
        return h;
      }, save: function () { return { work: d.profile.work || {} }; } });
    add({ id: 'wake', sec: 'profile', q: 'When do you usually wake up?', html: function () { return timeRow('profile.wake', d.profile.wake, [360, 390, 420, 450, 480, 510, 540]); }, save: function () { return { wake: d.profile.wake }; } });
    add({ id: 'bed', sec: 'profile', q: 'And go to bed?', html: function () { return timeRow('profile.bed', d.profile.bed, [1260, 1290, 1320, 1350, 1380, 1410, 0]); }, save: function () { return { bed: d.profile.bed }; } });
    add({ id: 'energy', sec: 'profile', q: 'When do you have the most energy?', help: 'Bigger jobs get suggested then.', html: function () { return chips('profile.energy', [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']], d.profile.energy); }, save: function () { return { energy: d.profile.energy }; } });
    add({ id: 'manageable', sec: 'profile', q: 'How many chores feel manageable on a normal day?', html: function () { return chips('profile.manageable', [['1-2', '1 to 2'], ['3-4', '3 to 4'], ['5+', '5 or more']], d.profile.manageable); }, save: function () { return { manageable: d.profile.manageable }; } });
    add({ id: 'minimum', sec: 'profile', q: 'How many must-do jobs make a day feel productive?', help: 'Your daily minimum: short jobs (10 minutes or less). Do this many and the day counts as a win, and your streak goes up. Anything more is a bonus.',
      html: function () { return chips('profile.minimum', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], d.profile.minimum); }, save: function () { return { minimum: +d.profile.minimum }; } });
    var choreOpts = function () { return W.setup.presets.filter(function (p) { return p.needs !== 'upstairs' || two; }).map(function (p) { return [p.key, p.ask]; }); };
    add({ id: 'likes', sec: 'profile', q: 'Chores you don\'t mind doing', help: 'Tap all that apply.', opt: true, html: function () { return chips('profile.likes', choreOpts(), d.profile.likes, true); }, save: function () { return { likes: d.profile.likes || [] }; } });
    add({ id: 'hates', sec: 'profile', q: 'Chores you hate', help: 'You\'ll get these less often where the other person doesn\'t mind them.', opt: true, html: function () { return chips('profile.hates', choreOpts(), d.profile.hates, true); }, save: function () { return { hates: d.profile.hates || [] }; } });
    add({ id: 'motivation', sec: 'profile', q: 'What keeps you going?', html: function () { return chips('profile.motivation', [['streaks', 'Streaks'], ['xp', 'XP and unlocks'], ['compete', 'Friendly competition with ' + other()], ['calm', 'Just a calm list']], d.profile.motivation); }, save: function () { return { motivation: d.profile.motivation }; } });
    add({ id: 'reminder', sec: 'profile', q: 'How should reminders sound?', html: function () { return chips('profile.reminder', [['gentle', 'Gentle: "your 2 small jobs and today counts"'], ['direct', 'Direct: "your streak needs you"']], d.profile.reminder); }, save: function () { return { reminder: d.profile.reminder }; } });
    add({ id: 'quiet', sec: 'profile', q: 'Quiet hours: no notifications between…', html: function () {
      var q = d.profile.quiet || [1350, 450];
      return '<div class="small muted">From</div>' + timeRow('profile.quiet.0', q[0], [1260, 1320, 1350, 1380]) + '<div class="small muted" style="margin-top:10px">Until</div>' + timeRow('profile.quiet.1', q[1], [390, 420, 450, 480, 540]);
    }, save: function () { return { quiet: [+d.profile.quiet[0], +d.profile.quiet[1]] }; } });
    // health: Dean's is on and pre-filled; Yaz never sees these unless she switched the module on in Settings
    var hOn = function () { return !!d.health.on; };
    if (me || d.health.on) {
      add({ id: 'healthOn', sec: 'health', q: 'Health and fitness', help: 'Weight, training and food targets. Private: ' + other() + ' can\'t see your weight or body data unless you switch sharing on.', html: function () { return chips('health.on', [['true', 'On'], ['false', 'Off']], String(!!d.health.on)); }, save: function () { return { on: !!d.health.on }; } });
      add({ id: 'body', sec: 'health', q: 'Height and weight', opt: true, show: hOn, html: function () { return '<div class="wz-grid"><label>Height (cm)<input type="number" class="wz-text" data-wzi="health.height" value="' + (d.health.height || '') + '" inputmode="decimal"></label><label>Weight now (kg)<input type="number" class="wz-text" data-wzi="health.weight" value="' + (d.health.weight || '') + '" step="0.1" inputmode="decimal"></label><label>Goal weight (kg)<input type="number" class="wz-text" data-wzi="health.goal" value="' + (d.health.goal || '') + '" step="0.1" inputmode="decimal"></label></div>'; }, save: function () { return { height: +d.health.height || null, weight: +d.health.weight || null, goal: +d.health.goal || null }; } });
      add({ id: 'pace', sec: 'health', q: 'By when, or how fast?', opt: true, show: hOn, html: function () { return chips('health.pace', [['0.25', '¼ kg a week (easy)'], ['0.5', '½ kg a week'], ['0.75', '¾ kg a week'], ['1', '1 kg a week (hard)']], d.health.pace) + '<label class="wz-or">or by a date <input type="date" data-wzi="health.goalDate" value="' + esc(d.health.goalDate || '') + '"></label>'; }, save: function () { return { pace: d.health.pace, goalDate: d.health.goalDate || '' }; } });
      add({ id: 'train', sec: 'health', q: 'Training days a week', show: hOn, html: function () { return '<div class="small muted">Target</div>' + chips('health.trainDays', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], d.health.trainDays) + '<div class="small muted" style="margin-top:10px">Stretch goal</div>' + chips('health.stretchDays', [[3, '3'], [4, '4'], [5, '5'], [6, '6']], d.health.stretchDays); }, save: function () { return { trainDays: +d.health.trainDays, stretchDays: +d.health.stretchDays }; } });
      add({ id: 'split', sec: 'health', q: 'Your training split', show: hOn, html: function () { return chips('health.split', [['Push / Pull / Shoulders-Arms', 'Push / Pull / Shoulders-Arms'], ['Upper / Lower', 'Upper / Lower'], ['Full body', 'Full body']], d.health.split) + chips('health.noHinge', [['true', 'No hip-hinge exercises'], ['false', 'Hip hinges are fine']], String(!!d.health.noHinge)); }, save: function () { return { split: d.health.split, noHinge: d.health.noHinge === true || d.health.noHinge === 'true' }; } });
      add({ id: 'food', sec: 'health', q: 'Daily food targets', show: hOn, html: function () { var p = d.health.protein || [130, 160]; return '<div class="wz-grid"><label>Calories<input type="number" class="wz-text" data-wzi="health.kcal" value="' + (d.health.kcal || '') + '" inputmode="numeric"></label><label>Protein from (g)<input type="number" class="wz-text" data-wzi="health.protein.0" value="' + p[0] + '" inputmode="numeric"></label><label>to (g)<input type="number" class="wz-text" data-wzi="health.protein.1" value="' + p[1] + '" inputmode="numeric"></label></div>'; }, save: function () { return { kcal: +d.health.kcal || 1800, protein: [+d.health.protein[0] || 130, +d.health.protein[1] || 160] }; } });
      add({ id: 'weigh', sec: 'health', q: 'Weigh-in days', help: 'Fasted, first thing. You get a reminder on these mornings.', show: hOn, html: function () { return chips('health.weighDays', WEEK.map(function (i) { return [i, DAYS[i]]; }), d.health.weighDays, true); }, save: function () { return { weighDays: (d.health.weighDays || []).map(Number), fasted: true }; } });
      add({ id: 'share', sec: 'health', q: 'Share your progress with ' + other() + '?', help: 'Off: ' + other() + ' sees nothing about your weight or body. On: your current and goal weight show on their screen.', show: hOn, html: function () { return chips('health.share', [['false', 'Keep it private'], ['true', 'Share it']], String(!!d.health.share)); }, save: function () { return { share: d.health.share === true || d.health.share === 'true' }; } });
    }
    // household (shared)
    var otherDid = W.setup.house.by && W.setup.house.by !== who() && (W.setup.house.rooms || []).length;
    if (otherDid && W.mode === 'full') add({ id: 'houseDone', sec: 'none', q: other() + ' already set up the house', help: 'Rooms, bins, laundry and how often the main chores get done. Check it over, or keep it as it is.', html: function () { return '<p>' + esc(houseSummary()) + '</p>' + chips('houseCheck', [['keep', 'Looks right, keep it'], ['change', 'Go through it']], W.houseCheck || ''); }, save: function () { return null; } });
    var doHouse = function () { return !otherDid || W.houseCheck === 'change' || W.mode === 'one'; };
    add({ id: 'floors', sec: 'house', q: 'How many floors is your home?', show: doHouse, html: function () { return chips('house.floorsN', [['1', 'One floor'], ['2', 'Downstairs and upstairs']], (d.house.floors || []).length > 1 ? '2' : '1'); }, save: function () { return { floors: d.house.floors }; } });
    add({ id: 'rooms', sec: 'house', q: 'Which rooms are there?', help: 'Tap to add. Bathrooms and bedrooms each get their own jobs.', show: doHouse, html: function () {
      var floors = (d.house.floors || []).length > 1 ? ['downstairs', 'upstairs'] : ['one'], rooms = d.house.rooms || [];
      return floors.map(function (f) {
        var fl = f === 'one' ? '' : f, mine = rooms.filter(function (r) { return (r.floor || '') === fl; }).map(function (r) { return r.name; });
        var opts = ROOMS[f].concat(mine.filter(function (n) { return ROOMS[f].indexOf(n) === -1; }));
        return (fl ? '<div class="wz-sub">' + (f === 'downstairs' ? 'Downstairs' : 'Upstairs') + '</div>' : '') + '<div class="wz-chips">' + opts.map(function (n) { var on = mine.indexOf(n) !== -1; return '<button type="button" class="wz-chip' + (on ? ' on' : '') + '" data-wzroom="' + esc(n) + '" data-floor="' + fl + '" aria-pressed="' + on + '">' + esc(n) + '</button>'; }).join('') + '</div>' +
          '<form class="wz-add" data-wzaddroom="' + fl + '"><input type="text" placeholder="Another room' + (fl ? ' ' + fl : '') + '" maxlength="30" aria-label="Another room"><button type="submit" class="btn soft sm">Add</button></form>';
      }).join('');
    }, save: function () { return { rooms: d.house.rooms || [] }; } });
    add({ id: 'others', sec: 'house', q: 'Does anyone else in the house share chores?', opt: true, show: doHouse, html: function () { return chips('house.others', [[0, 'No, just us'], [1, 'Yes, 1 more'], [2, 'Yes, 2 more'], [3, '3 or more']], d.house.others || 0); }, save: function () { return { others: +d.house.others || 0 }; } });
    add({ id: 'bins', sec: 'house', q: 'Bin collections', help: 'Tap each bin you have, then its collection day. "Bins out" goes on your list the evening before.', show: doHouse, html: function () {
      var bins = d.house.bins || [], h = '<div class="wz-chips">' + BINS.map(function (n) { var on = bins.some(function (b) { return b.name === n; }); return '<button type="button" class="wz-chip' + (on ? ' on' : '') + '" data-wzbin="' + esc(n) + '" aria-pressed="' + on + '">' + esc(n) + '</button>'; }).join('') + '</div>';
      bins.forEach(function (b, i) {
        h += '<div class="wz-bin"><b>' + esc(b.name) + '</b>' + chips('house.bins.' + i + '.day', WEEK.map(function (k) { return [k, DAYS[k]]; }), b.day) + chips('house.bins.' + i + '.weeks', [[1, 'Every week'], [2, 'Every 2 weeks']], b.weeks || 1) +
          (+b.weeks === 2 ? '<div class="small muted">Next collection:</div>' + chips('house.bins.' + i + '.which', [['this', 'This week'], ['next', 'Next week']], b.which || 'this') : '') + '</div>';
      });
      return h;
    }, save: function () { return { bins: (d.house.bins || []).filter(function (b) { return b.day !== undefined && b.day !== ''; }).map(function (b) { var o = { name: b.name, day: +b.day, weeks: +b.weeks || 1 }; if (o.weeks === 2) o.anchor = nextOn(o.day, b.which === 'next' ? 7 : 0); o.which = b.which; return o; }) }; } });
    add({ id: 'laundry', sec: 'house', q: 'Best day for laundry?', opt: true, show: doHouse, html: function () { return chips('house.laundryDay', WEEK.map(function (k) { return [k, DAYS[k]]; }).concat([['', 'No set day']]), d.house.laundryDay); }, save: function () { return { laundryDay: d.house.laundryDay === '' || d.house.laundryDay === undefined ? '' : +d.house.laundryDay }; } });
    add({ id: 'pets', sec: 'house', q: 'Any pets?', show: doHouse, html: function () { return chips('house.pets', [['true', 'Yes'], ['false', 'No']], String(!!d.house.pets)); }, save: function () { return { pets: d.house.pets === true || d.house.pets === 'true' }; } });
    // the 12 common chores: how often now, how often you'd like, who does it
    W.setup.presets.forEach(function (p) {
      if (p.needs === 'upstairs' && !two) return;
      var k = 'house.chores.' + p.key;
      add({ id: 'c_' + p.key, sec: 'house', ck: p.key, q: p.ask, show: doHouse, opt: true, help: p.key === 'bins' ? 'When it happens comes from your collection days.' : '', html: function () {
        var a = get(k) || {}, h = '';
        if (p.key !== 'bins') h += '<div class="wz-sub">How often now?</div>' + chips(k + '.now', FREQS.concat([['never', 'Never / not us']]), a.now) + '<div class="wz-sub">How often would you like?</div>' + chips(k + '.goal', FREQS, a.goal || a.now);
        return h + '<div class="wz-sub">Who usually does it?</div>' + chips(k + '.who', [['me', personLabel('me')], ['yaz', personLabel('partner')], ['shared', 'Shared (take turns)'], ['whoever', 'Whoever']], a.who);
      }, save: function () { return { chores: d.house.chores || {} }; } });
    });
    add({ id: 'extras', sec: 'house', q: 'Anything else you do regularly?', help: 'Like watering plants or cleaning the car. Add as many as you like.', opt: true, show: doHouse, html: function () {
      var ex = d.house.extras || [];
      return (ex.length ? '<div class="wz-list">' + ex.map(function (x, i) { return '<div class="wz-li"><span class="grow"><b>' + esc(x.name) + '</b> · ' + esc(freqName(x.now)) + ' · ' + esc(personLabel(x.who === 'whoever' ? 'Whoever' : x.who === 'shared' ? 'Shared' : x.who)) + '</span><button type="button" class="iconbtn sm" data-wzexdel="' + i + '" aria-label="Remove ' + esc(x.name) + '">×</button></div>'; }).join('') + '</div>' : '') +
        '<form class="wz-add" data-wzaddex="1"><input type="text" id="wzExName" placeholder="e.g. Water the plants" maxlength="60" aria-label="Chore name"><button type="submit" class="btn soft sm">Add</button></form>' +
        '<div class="wz-sub">How often</div>' + chips('exFreq', FREQS, W.exFreq || 'weekly') + '<div class="wz-sub">Who</div>' + chips('exWho', [['me', personLabel('me')], ['yaz', personLabel('partner')], ['shared', 'Shared'], ['whoever', 'Whoever']], W.exWho || 'whoever');
    }, save: function () { return { extras: d.house.extras || [] }; } });
    add({ id: 'review', sec: 'none', q: W.setup.built ? 'Rebuild your chore list?' : 'Your chore list', help: W.setup.built ? 'Only needed if your home or how often you want things done has changed. Nothing is lost either way.' : 'Here\'s what I\'ll make from your answers. Your existing chores and their history are kept.', html: reviewHtml, save: function () { return null; } });
    return list;
  }
  function pickKeys(o, ks) { var r = {}; ks.forEach(function (k) { r[k] = o[k]; }); return r; }
  function nextOn(day, extra) { var t = new Date(N.now()), k = (day - t.getDay() + 7) % 7 + extra; t.setDate(t.getDate() + k); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function freqName(k) { var f = FREQS.filter(function (x) { return x[0] === k; })[0]; return f ? f[1] : k || ''; }
  function houseSummary() {
    var h = W.setup.house, r = (h.rooms || []).map(function (x) { return x.name; });
    return ((h.floors || []).length > 1 ? 'Two floors' : 'One floor') + ', ' + r.length + ' rooms (' + r.join(', ') + '). ' + ((h.bins || []).length ? 'Bins: ' + h.bins.map(function (b) { return b.name + ' ' + DAYS[b.day]; }).join(', ') + '. ' : '') + (h.laundryDay !== '' && h.laundryDay !== undefined ? 'Laundry on ' + DAYS[h.laundryDay] + '. ' : '') + (h.pets ? 'Pets.' : '');
  }

  // ---------- review: what building the chore list will do ----------
  function rebuilding() { return !W.setup.built || W.rebuild === 'yes'; }
  function reviewHtml() {
    var ask = W.setup.built ? chips('rebuild', [['no', 'No, keep our chores as they are'], ['yes', 'Yes, rebuild from the answers']], W.rebuild) : '';
    if (!rebuilding()) return ask + '<p class="small muted">Your chores stay as they are. Your answers about you (work days, energy, your daily minimum, jobs you hate) shape your daily plan straight away.</p>';
    if (!W.preview) { loadPreview(); return ask + '<p class="muted">Working it out…</p>'; }
    var p = W.preview, groups = [['update', 'Your chores, updated', 'Matched to your answers: name, timing and who. History kept.'], ['add', 'New chores', ''], ['keep', 'Kept as they are', 'Not in the setup questions. Change them any time in Chores, Schedule.']];
    var whoTxt = function (w) { return w === 'me' ? personLabel('me') : w === 'partner' ? personLabel('partner') : w === 'rotate' ? 'Take turns' : w === 'together' ? 'Together' : 'Whoever'; };
    return ask + groups.map(function (g) {
      var l = p.filter(function (x) { return x.action === g[0]; }); if (!l.length) return '';
      return '<div class="wz-sub">' + g[1] + ' (' + l.length + ')</div>' + (g[2] ? '<div class="small muted">' + g[2] + '</div>' : '') + '<div class="wz-list">' + l.map(function (x) {
        return '<div class="wz-li"><span class="grow"><b>' + esc(x.name) + '</b>' + (x.was && x.was !== x.name ? ' <span class="muted">(was ' + esc(x.was) + ')</span>' : '') + '<br><span class="small muted">' + esc(x.every || '') + (x.goal && x.goal !== x.every ? ', building up to ' + esc(String(x.goal).toLowerCase()) : '') + ' · ' + x.minutes + ' min · ' + esc(whoTxt(x.who)) + '</span></span></div>';
      }).join('') + '</div>';
    }).join('') + '<p class="small muted">Jobs you\'d like to do more often start halfway between "now" and your goal and build up over 3 weeks.</p>';
  }
  function loadPreview() { N.rpc('previewChores', []).then(function (p) { W.preview = p; if (W && cur().id === 'review') draw(); }, function (e) { N.toast(e.message, true); }); }

  // ---------- the wizard ----------
  function cur() { return W.list[W.i]; }
  function open(opts) {
    opts = opts || {};
    N.rpc('setupState', []).then(function (st) {
      W = { setup: st, d: { profile: clone(st.profile), health: clone(st.health), house: clone(st.house) }, i: 0, mode: opts.only ? 'one' : 'full', only: opts.only || '', houseCheck: '', rebuild: opts.start === 'review' ? 'yes' : 'no' };
      W.list = steps();
      if (opts.only) { W.list = W.list.filter(function (s) { return s.id === opts.only; }); if (!W.list.length) { W = null; return N.toast('That question isn\'t in your setup.'); } }
      if (opts.start) { var k = W.list.map(function (s) { return s.id; }).indexOf(opts.start); if (k >= 0) W.i = k; }
      var box = el('wizard'); if (!box) { box = document.createElement('div'); box.id = 'wizard'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); document.body.appendChild(box); }
      box.hidden = false; document.body.classList.add('wizopen');
      draw();
    }, function (e) { N.toast(e.message, true); });
  }
  function close() { var b = el('wizard'); if (b) { b.hidden = true; b.innerHTML = ''; } document.body.classList.remove('wizopen'); W = null; }
  function draw() {
    if (!W) return;
    W.list = W.mode === 'one' ? W.list : steps();
    if (W.i >= W.list.length) W.i = W.list.length - 1;
    var s = cur(), n = W.list.length, last = W.i === n - 1, one = W.mode === 'one';
    var next = one ? 'Save' : s.id === 'review' ? (!rebuilding() ? 'Finish setup' : W.setup.built ? 'Rebuild the chore list' : 'Make our chore list') : s.id === 'houseDone' && W.houseCheck !== 'change' ? 'Keep it and carry on' : 'Next';
    el('wizard').innerHTML = '<div class="wz"><div class="wz-top">' +
      '<button type="button" class="iconbtn" data-wzgo="back" aria-label="' + (one || !W.i ? 'Close setup' : 'Back to the last question') + '">' + (one || !W.i ? '×' : '‹') + '</button>' +
      (one ? '<span class="grow small muted">Change one answer</span>' : '<div class="wz-bar grow" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + (W.i + 1) + '"><i style="width:' + Math.round((W.i + 1) / n * 100) + '%"></i></div><span class="small muted num">' + (W.i + 1) + '/' + n + '</span>') +
      (!one ? '<button type="button" class="btn ghost sm" data-wzgo="later" title="Your answers so far are saved">Finish later</button>' : '') + '</div>' +
      '<div class="wz-body"><div class="eyebrow">' + ({ profile: 'About you', health: 'Health and fitness (private)', house: 'Your home (shared with ' + esc(other()) + ')', none: '' })[s.sec] + '</div><h2>' + esc(s.q) + '</h2>' + (s.help ? '<p class="small muted">' + esc(s.help) + '</p>' : '') + s.html() + '</div>' +
      '<div class="wz-foot">' + (s.opt && !one ? '<button type="button" class="btn ghost" data-wzgo="skip">Skip for now</button>' : '<span></span>') + '<button type="button" class="btn primary big" data-wzgo="next"' + (s.id === 'review' && rebuilding() && !W.preview ? ' disabled' : '') + '>' + esc(next) + '</button></div></div>';
    var f = el('wizard').querySelector('input.wz-text, #wzExName'); if (f && s.id === 'name') setTimeout(function () { f.focus(); }, 60);
  }
  function saveStep(s) {
    var data = s.save(); if (!data || s.sec === 'none') return;
    if (s.sec === 'house' && W.setup.built && W.mode === 'full' && JSON.stringify(data) !== JSON.stringify(pickKeys(W.setup.house, Object.keys(data)))) W.rebuild = 'yes';
    if (s.sec === 'profile' && W.mode === 'full' && W.i === W.list.length - 1) data.done = true;
    N.send('saveSetup', [s.sec, data]).then(function (r) { if (W) { W.setup = r.setup; W.preview = null; } N.applyQuiet(r.state); }, function (e) { N.toast(e.message + ' (that answer wasn\'t saved: try again)', true); });
  }
  function go(dir) {
    var s = cur();
    if (dir === 'back') { if (W.mode === 'one' || W.i === 0) return close(); W.i--; return draw(); }
    if (dir === 'later') { saveStep(s); N.toast('Saved. Carry on any time from You, Settings, Setup.'); return close(); }
    if (dir === 'skip') { W.i++; return draw(); }
    // next
    if (s.id === 'name' && !String(W.d.profile.name || '').trim()) return N.toast('Type a name first (it\'s how the app talks to you).');
    if (s.id === 'houseDone' && W.houseCheck !== 'change') { W.list = steps(); var r = W.list.map(function (x) { return x.id; }).indexOf('review'); W.i = r; return draw(); }
    if (s.id === 'review' && !rebuilding()) { N.send('saveSetup', ['profile', { done: true }]).then(function (r) { N.applyQuiet(r.state); }, function (e) { N.toast(e.message, true); }); N.toast('Setup done. Your daily plan uses your answers from now on.'); return close(); }
    if (s.id === 'review') return build();
    saveStep(s);
    if (W.mode === 'one') { N.toast('Saved'); return close(); }
    if (W.i === W.list.length - 1) return close();
    W.i++; draw();
    var b = el('wizard').querySelector('.wz-body'); if (b) b.scrollTop = 0;
  }
  function build() {
    var btn = el('wizard').querySelector('[data-wzgo="next"]'); if (btn) { btn.disabled = true; btn.textContent = 'Making your chore list…'; }
    N.send('saveSetup', ['profile', { done: true }]).then(function () { return N.send('buildChores', []); }).then(function (r) {
      N.applyQuiet(r.state); W.preview = null; done(r);
    }, function (e) { N.toast(e.message, true); if (btn) { btn.disabled = false; btn.textContent = 'Try again'; } });
  }
  function done(r) {
    var q = N.S().quests, must = (q.board || []).filter(function (x) { return x.must; });
    el('wizard').innerHTML = '<div class="wz"><div class="wz-body center"><div class="wz-tick">✓</div><h2>All set</h2><p>' + r.built + ' chores made from your answers, ' + r.kept + ' of your own kept.</p>' +
      (q.planned ? '<p><b>Today: ' + q.minimum + ' small job' + (q.minimum === 1 ? '' : 's') + ' to win the day</b>' + (must.length ? '<br>' + must.map(function (x) { return esc(x.name); }).join(', ') : '') + '</p>' : '') +
      (!N.S().setup.partnerDone ? '<p class="small muted">' + esc(other()) + ' can do their part from their own phone: You, Settings, Setup. The house answers are already shared.</p>' : '') +
      '<p class="small muted">Change any chore in Chores, Schedule. Change any answer in You, Settings, Setup.</p></div><div class="wz-foot"><span></span><button type="button" class="btn primary big" data-wzgo="close">See today\'s chores</button></div></div>';
  }

  // ---------- input ----------
  document.addEventListener('click', function (ev) {
    if (!W || !ev.target.closest('#wizard')) return;
    var t = ev.target.closest('button'); if (!t) return;
    var ds = t.dataset;
    if (ds.wzgo === 'close') { close(); N.showTab('chores'); return; }
    if (ds.wzgo) return go(ds.wzgo);
    if (ds.wz) {
      var f = ds.wz, v = ds.v;
      if (f === 'houseCheck') { W.houseCheck = v; if (v === 'change') W.rebuild = 'yes'; return draw(); }
      if (f === 'rebuild') { W.rebuild = v; return draw(); }
      if (f === 'exFreq') { W.exFreq = v; return draw(); }
      if (f === 'exWho') { W.exWho = v; return draw(); }
      if (f === 'workPreset') { var p = v.split('-').map(Number), w = W.d.profile.work || {}; Object.keys(w).forEach(function (k) { if (w[k]) w[k] = p.slice(); }); return draw(); }
      if (f === 'house.floorsN') { W.d.house.floors = v === '2' ? ['downstairs', 'upstairs'] : ['one']; if (v !== '2') (W.d.house.rooms || []).forEach(function (r) { r.floor = ''; }); W.preview = null; return draw(); }
      if (ds.multi) { var a = (get(f) || []).map(String), i = a.indexOf(v); if (i === -1) a.push(v); else a.splice(i, 1); set(f, /weighDays/.test(f) ? a.map(Number) : a); }
      else { var num = /minimum|trainDays|stretchDays|others|\.day$|\.weeks$|wake|bed|quiet|laundryDay/.test(f) && v !== '' && !isNaN(+v); set(f, num ? +v : v === 'true' ? true : v === 'false' ? false : v); }
      if (/^house\.chores\.[a-z_]+\.now$/.test(f) && !get(f.replace(/now$/, 'goal'))) set(f.replace(/now$/, 'goal'), v === 'never' ? '' : v);
      W.preview = null; return draw();
    }
    if (ds.wzday !== undefined) { var wk = W.d.profile.work = W.d.profile.work || {}, dd = ds.wzday; if (wk[dd]) delete wk[dd]; else wk[dd] = (Object.keys(wk).map(function (k) { return wk[k]; })[0] || [540, 1020]).slice(); return draw(); }
    if (ds.wzroom) { var rs = W.d.house.rooms = W.d.house.rooms || [], ix = rs.map(function (r) { return r.name + '|' + (r.floor || ''); }).indexOf(ds.wzroom + '|' + ds.floor); if (ix === -1) rs.push({ name: ds.wzroom, floor: ds.floor }); else rs.splice(ix, 1); W.preview = null; return draw(); }
    if (ds.wzbin) { var bs = W.d.house.bins = W.d.house.bins || [], bi = bs.map(function (b) { return b.name; }).indexOf(ds.wzbin); if (bi === -1) bs.push({ name: ds.wzbin, day: '', weeks: 1 }); else bs.splice(bi, 1); return draw(); }
    if (ds.wzexdel !== undefined) { W.d.house.extras.splice(+ds.wzexdel, 1); return draw(); }
  });
  document.addEventListener('input', function (ev) {
    if (!W) return;
    var t = ev.target;
    if (t.dataset.wzi) { var path = t.dataset.wzi; set(path, t.type === 'number' ? (t.value === '' ? null : +t.value) : t.value); }
    if (t.dataset.wzh) { var p = t.dataset.wzh.split('.'), m = mins(t.value); if (m !== null && W.d.profile.work[p[0]]) W.d.profile.work[p[0]][+p[1]] = m; }
  });
  document.addEventListener('change', function (ev) {
    if (!W || !ev.target.dataset.wzt) return;
    var m = mins(ev.target.value); if (m !== null) { set(ev.target.dataset.wzt, m); draw(); }
  });
  document.addEventListener('submit', function (ev) {
    if (!W) return;
    var f = ev.target;
    if (f.dataset.wzaddroom !== undefined) {
      ev.preventDefault(); var v = f.querySelector('input').value.trim(); if (!v) return N.toast('Type the room\'s name first');
      (W.d.house.rooms = W.d.house.rooms || []).push({ name: v.charAt(0).toUpperCase() + v.slice(1), floor: f.dataset.wzaddroom }); W.preview = null; return draw();
    }
    if (f.dataset.wzaddex) {
      ev.preventDefault(); var n = el('wzExName').value.trim(); if (!n) return N.toast('Type the chore first, like "Water the plants"');
      (W.d.house.extras = W.d.house.extras || []).push({ name: n, now: W.exFreq || 'weekly', goal: W.exFreq || 'weekly', who: W.exWho || 'whoever' }); W.preview = null; return draw();
    }
  });
  document.addEventListener('keydown', function (ev) { if (W && ev.key === 'Escape') close(); });

  // ---------- the setup card in Settings: change one answer ----------
  function answers(st) {
    var p = st.profile || {}, h = st.health || {}, ho = st.house || {}, w = p.work || {}, rows = [];
    var workTxt = WEEK.filter(function (i) { return w[i]; }).map(function (i) { return DAYS[i] + ' ' + hm(w[i][0]) + '–' + hm(w[i][1]); }).join(', ') || 'No work days';
    rows.push(['name', 'Name', p.name], ['work', 'Work', workTxt], ['wake', 'Wake / bed', hm(p.wake) + ' / ' + hm(p.bed)], ['energy', 'Most energy', p.energy], ['manageable', 'Chores a day', p.manageable],
      ['minimum', 'Daily minimum', p.minimum + ' must-do job' + (p.minimum === 1 ? '' : 's')], ['hates', 'Chores you hate', (p.hates || []).length + ' picked'], ['motivation', 'Motivation', p.motivation], ['reminder', 'Reminders', p.reminder], ['quiet', 'Quiet hours', p.quiet && p.quiet.length === 2 ? hm(p.quiet[0]) + '–' + hm(p.quiet[1]) : 'None']);
    if (h.on) rows.push(['body', 'Height / weight / goal', [h.height ? h.height + ' cm' : '–', h.weight ? h.weight + ' kg' : '–', h.goal ? h.goal + ' kg' : '–'].join(' / ')], ['train', 'Training days', h.trainDays + ' (stretch ' + h.stretchDays + ')'], ['food', 'Food targets', h.kcal + ' kcal, ' + (h.protein || ['–'])[0] + '–' + (h.protein || ['', '–'])[1] + ' g protein'], ['weigh', 'Weigh-ins', (h.weighDays || []).map(function (d) { return DAYS[d]; }).join(', ')], ['share', 'Sharing with ' + st.partner.name, h.share ? 'On' : 'Private']);
    rows.push(['rooms', 'Rooms', (ho.rooms || []).length + ' rooms'], ['bins', 'Bins', (ho.bins || []).map(function (b) { return b.name + ' ' + DAYS[b.day]; }).join(', ') || 'None'], ['laundry', 'Laundry day', ho.laundryDay === '' || ho.laundryDay === undefined ? 'Any day' : DAYS[ho.laundryDay]]);
    return rows;
  }
  function settingsCard() {
    var S = N.S(), su = S.setup || {};
    return '<section class="card" id="setupCard"><div class="head"><h3>Setup</h3>' + (su.done ? '<span class="chip">Done</span>' : '<span class="chip pink">Not finished</span>') + '</div>' +
      '<p class="small muted" style="margin:0 0 10px">Your answers shape your daily chores. Change one without redoing the rest.</p>' +
      '<div id="setupAnswers"><button class="btn soft wide" type="button" data-setup="answers">Show my answers</button></div>' +
      '<div class="grid2" style="margin-top:8px"><button class="btn ' + (su.done ? 'soft' : 'primary') + '" type="button" data-setup="run">' + (su.done ? 'Run the whole setup again' : 'Start setup') + '</button><button class="btn soft" type="button" data-setup="rebuild">Rebuild the chore list</button></div>' +
      (!su.health && S.who === 'partner' ? '<div class="between" style="margin-top:12px"><span class="small"><b>Health and fitness</b> · off. Weight, training and food targets, private to you.</span><button class="btn line sm" type="button" data-setup="healthOn">Turn on</button></div>' : '') +
      (su.health ? '<div class="between" style="margin-top:12px"><span class="small"><b>Health and fitness</b> · on, private</span><button class="btn line sm" type="button" data-setup="healthOff">Turn off</button></div>' : '') + '</section>';
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-setup]'); if (!t || !N) return;
    var a = t.dataset.setup;
    if (a === 'run') return open({});
    if (a === 'rebuild') return open({ start: 'review' });
    if (a === 'edit') return open({ only: t.dataset.q });
    if (a === 'healthOn' || a === 'healthOff') return N.send('saveSetup', ['health', { on: a === 'healthOn' }]).then(function (r) { N.apply(r.state, a === 'healthOn' ? 'Health and fitness is on. Only you can see it.' : 'Health and fitness is off'); if (a === 'healthOn') open({ start: 'healthOn' }); }, function (e) { N.toast(e.message, true); });
    if (a === 'answers') {
      var box = el('setupAnswers'); if (box) box.innerHTML = '<p class="small muted">Loading…</p>';
      N.rpc('setupState', []).then(function (st) {
        var b = el('setupAnswers'); if (!b) return;
        b.innerHTML = answers(st).map(function (r) { return '<button type="button" class="item" data-setup="edit" data-q="' + r[0] + '" style="width:100%;text-align:left"><div class="grow"><div class="small muted">' + esc(r[1]) + '</div><div class="t">' + esc(r[2] || '–') + '</div></div><span class="small">Change</span></button>'; }).join('');
      }, function (e) { N.toast(e.message, true); });
    }
  });

  // ---------- editing any chore (Chores, Schedule) ----------
  var E = null;
  var EFREQ = FREQS.concat([['days', 'On set days'], ['asneeded', 'Only when needed']]);
  function freqKey(q) {
    var e = String(q.every || '').toLowerCase();
    if (/^weekly [a-z]|^2 weeks [a-z]/.test(e)) return 'days';
    if (/as needed|^$/.test(e)) return 'asneeded';
    if (e === 'daily' || e === '1 days') return 'daily';
    if (/^2\.5 days|^2 days|^3 days/.test(e)) return 'few';
    if (e === 'weekly' || e === '7 days') return 'weekly';
    if (/^2 weeks$|^14 days|^10 days/.test(e)) return 'biweekly';
    if (/month|30 days|^3 weeks|^45 days/.test(e)) return 'monthly';
    return /\d+ (days|weeks)/.test(e) ? (parseFloat(e) * (/weeks/.test(e) ? 7 : 1) >= 45 ? 'rarely' : 'monthly') : 'weekly';
  }
  function editChore(name) {
    var S = N.S(), q = name ? (S.quests.all || []).filter(function (x) { return x.name === name; })[0] : null;
    if (name && !q) return N.toast('That chore has gone.');
    var m = /^(weekly|2 weeks) (.+)$/i.exec(q ? q.every : '');
    E = q ? { original: q.name, name: q.name, area: q.area || '', freq: freqKey(q), days: m ? m[2].split(/,\s*/).map(function (d) { return DAYS.indexOf(d.slice(0, 3)); }).filter(function (d) { return d >= 0; }) : [], weeks: m && /^2 weeks/i.test(m[1]) ? 2 : 1,
      minutes: q.minutes, who: q.who, tod: q.tod || 'any', xp: q.xp, notes: q.notes || '', archived: !!q.archived, ramp: q.nowDays && q.goalDays && q.nowDays !== q.goalDays }
      : { original: '', name: '', area: '', freq: 'weekly', days: [], weeks: 1, minutes: 10, who: 'anyone', tod: 'any', xp: '', notes: '' };
    drawEdit();
  }
  function drawEdit() {
    var e = E, areas = ['Kitchen', 'Bathroom', 'Bedroom', 'Living areas', 'Floors', 'Laundry', 'Outside', 'Errands', 'Other'];
    var h = '<h2>' + (e.original ? 'Edit chore' : 'New chore') + '</h2>' +
      '<label class="f" for="ceName">Name</label><input type="text" id="ceName" value="' + esc(e.name) + '" maxlength="60" placeholder="e.g. Water the plants">' +
      '<label class="f">Room or area</label>' + edChips('area', areas.map(function (a) { return [a, a]; }), e.area) +
      '<label class="f">How often</label>' + edChips('freq', EFREQ, e.freq) +
      (e.ramp ? '<p class="small muted">Building up gently from how often you did it to your goal. Picking a new "how often" sets it straight away.</p>' : '') +
      (e.freq === 'days' ? '<label class="f">Which days</label>' + edChips('days', WEEK.map(function (i) { return [i, DAYS[i]]; }), e.days, true) + edChips('weeks', [[1, 'Every week'], [2, 'Every other week']], e.weeks) : '') +
      '<label class="f">Minutes it takes</label>' + edChips('minutes', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30'], [45, '45'], [60, '60']], e.minutes) +
      '<label class="f">Who does it</label>' + edChips('who', [['me', personLabel('me')], ['partner', personLabel('partner')], ['together', 'Together (2× XP)'], ['rotate', 'Take turns'], ['anyone', 'Whoever has time']], e.who) +
      '<label class="f">Best time of day</label>' + edChips('tod', [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['any', 'Any time']], e.tod) +
      (e.tod === 'evening' && e.minutes >= 20 ? '<p class="small muted">Jobs of 20 minutes or more never go after 9pm: this one will show in the afternoon.</p>' : '') +
      '<div class="grid2"><div><label class="f" for="ceXp">XP</label><input type="number" id="ceXp" value="' + esc(e.xp) + '" min="1" max="200" placeholder="auto"></div><div></div></div>' +
      '<label class="f" for="ceNotes">Notes</label><textarea id="ceNotes" maxlength="300" style="min-height:60px">' + esc(e.notes) + '</textarea>' +
      '<button class="btn primary big wide" type="button" data-ce="save" style="margin-top:14px">' + (e.original ? 'Save changes' : 'Add this chore') + '</button>';
    if (e.original) h += '<div class="grid2" style="margin-top:8px"><button class="btn soft" type="button" data-ce="up">Move up the list</button><button class="btn soft" type="button" data-ce="down">Move down the list</button>' +
      '<button class="btn soft" type="button" data-ce="' + (e.archived ? 'unarchive' : 'archive') + '">' + (e.archived ? 'Bring it back' : 'Archive (pause it)') + '</button><button class="btn line" type="button" data-ce="delete" style="color:var(--warn)">Delete for good</button></div>';
    N.openSheet(h, 'chore');
  }
  function edChips(f, opts, cur, multi) {
    return '<div class="wz-chips">' + opts.map(function (o) { var v = String(o[0]), on = multi ? (cur || []).map(String).indexOf(v) !== -1 : String(cur) === v; return '<button type="button" class="wz-chip' + (on ? ' on' : '') + '" data-cef="' + f + '" data-v="' + esc(v) + '"' + (multi ? ' data-multi="1"' : '') + ' aria-pressed="' + on + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function readEdit() { if (!el('ceName')) return; E.name = el('ceName').value; E.xp = el('ceXp').value; E.notes = el('ceNotes').value; }
  document.addEventListener('click', function (ev) {
    if (!E || !ev.target.closest('#sheet')) return;
    var t = ev.target.closest('[data-cef], [data-ce]'); if (!t) return;
    readEdit();
    if (t.dataset.cef) {
      var f = t.dataset.cef, v = t.dataset.v;
      if (t.dataset.multi) { var a = E[f].map(String), i = a.indexOf(v); if (i === -1) a.push(v); else a.splice(i, 1); E[f] = a.map(Number); }
      else E[f] = /minutes|weeks/.test(f) ? +v : v;
      if (f === 'freq') E.ramp = false;
      return drawEdit();
    }
    var a2 = t.dataset.ce;
    if (a2 === 'save') {
      if (!E.name.trim()) return N.toast('Give the chore a name first');
      if (E.freq === 'days' && !E.days.length) return N.toast('Pick at least one day');
      var f2 = { name: E.name.trim(), area: E.area, minutes: E.minutes, who: E.who, tod: E.tod, notes: E.notes };
      if (E.xp !== '' && E.xp !== undefined) f2.xp = +E.xp;
      var orig = E.original ? (N.S().quests.all.filter(function (x) { return x.name === E.original; })[0] || {}) : {};
      if (!E.original || freqKey(orig) !== E.freq || E.freq === 'days') { f2.freq = E.freq; if (E.freq === 'days') { f2.days = E.days; f2.weeks = E.weeks; } }
      var name = E.original; E = null; N.closeSheet();
      return N.call('saveChore', [name, f2], function (res) { N.apply(res, name ? 'Saved. Your days ahead are updated.' : 'Added ' + f2.name); });
    }
    if (a2 === 'delete' && !confirm('Delete ' + E.original + ' for good? (Archive keeps it but stops it coming up.)')) return;
    var nm = E.original; if (a2 !== 'up' && a2 !== 'down') { E = null; N.closeSheet(); }
    N.call('choreAction', [nm, a2], function (res) { N.apply(res, { archive: 'Archived. It won\'t come up until you bring it back.', unarchive: 'Back on the schedule', delete: 'Deleted', up: '', down: '' }[a2]); if (E) editChore(nm); });
  });
  /** Chores, Schedule once setup has built the list: every chore by area, tap to edit. */
  function choreList() {
    var S = N.S(), all = S.quests.all || [], showArch = !!W_arch, h = '<div class="row" style="gap:8px;margin-bottom:12px"><button class="btn primary grow" type="button" data-cedit="">+ Add a chore</button><button class="btn line" type="button" data-carch="1">' + (showArch ? 'Hide archived' : 'Show archived') + '</button></div>';
    var areas = {}; all.forEach(function (q) { if (q.archived && !showArch) return; var a = q.area || 'Other'; (areas[a] = areas[a] || []).push(q); });
    Object.keys(areas).forEach(function (a) {
      h += '<section class="card sched"><div class="head"><h3>' + esc(a) + '</h3><span class="muted small">' + areas[a].length + '</span></div>' + areas[a].map(function (q) {
        var w = q.who === 'together' ? 'Together' : q.who === 'rotate' ? 'Take turns' : q.who === 'anyone' ? 'Whoever' : q.who === S.who ? 'You' : other();
        return '<button class="item" type="button" data-cedit="' + esc(q.name) + '" style="width:100%;text-align:left;border-radius:0' + (q.archived ? ';opacity:.5' : '') + '"><div class="grow"><div class="t" style="font-weight:550">' + esc(q.name) + (q.archived ? ' (archived)' : '') + '</div><div class="m">' + esc(q.label || q.every) + ' · ' + q.minutes + ' min · ' + esc(w) + (q.tod && q.tod !== 'any' ? ' · ' + esc(q.tod) : '') + '</div></div><span class="small">Edit</span></button>';
      }).join('') + '</section>';
    });
    return h + '<p class="small muted center">Tap a chore to change anything: name, how often (or set days), time, who, time of day, XP, notes. Changes apply to the days ahead.</p>';
  }
  var W_arch = false;
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-cedit], [data-carch]'); if (!t || !N) return;
    if (t.dataset.carch) { W_arch = !W_arch; return N.renderChores(); }
    editChore(t.dataset.cedit);
  });

  window.NudgeSetup = {
    init: function (api) { N = api; },
    open: open, close: close, settingsCard: settingsCard, choreList: choreList, editChore: editChore,
    isOpen: function () { return !!W; }
  };
})();
