/**
 * Undo.gs: one tap takes back your last action (ticked the wrong chore, logged
 * the wrong food, marked a block done by mistake). Each undoable action
 * remembers the XP, cash and food rows it added and what it changed; Undo
 * deletes exactly those rows and puts the old values back. Works for 10 minutes.
 */

var UNDO_WINDOW_MS = 10 * 60000;
var UNDO_TABS = ['xp', 'cash', 'food', 'later', 'cardio'];

/** Run fn as an undoable action. restore: {chore: {row, values}} or {block: {id, values}} or {deadline: {id, values}}. */
function undoable_(who, label, fn, restore) {
  var before = {}, feedBefore = (feed_()[0] || {}).id || '';
  UNDO_TABS.forEach(function (k) { before[k] = vals_(k).length; });
  var res = fn();
  var added = {};
  UNDO_TABS.forEach(function (k) { added[k] = vals_(k).slice(before[k]).map(function (r) { return r.slice(2).map(String); }); });   // Date and Time left out: Sheets may turn them into dates
  var feedIds = [];
  feed_().some(function (f) { if (f.id === feedBefore) return true; feedIds.push(f.id); return false; });
  setProp_('UNDO_' + who, JSON.stringify({ id: Utilities.getUuid().slice(0, 8), label: label, at: new Date().getTime(), added: added, restore: restore || null, feed: feedIds }));
  return res;
}

/** The last undoable action, if it's still fresh. */
function undoInfo_(who) {
  var u = JSON.parse(prop_('UNDO_' + who) || 'null');
  return u && new Date().getTime() - u.at < UNDO_WINDOW_MS ? { id: u.id, label: u.label, at: u.at } : null;
}

function undoAction(key) {
  var who = who_(key);
  return withLock_(function () {
    var u = JSON.parse(prop_('UNDO_' + who) || 'null');
    if (!u || new Date().getTime() - u.at > UNDO_WINDOW_MS) throw new Error('Nothing to undo.');
    // delete the exact rows the action added (searching from the bottom, in case anything was added since)
    UNDO_TABS.forEach(function (k) {
      (u.added[k] || []).slice().reverse().forEach(function (row) {
        var v = vals_(k);
        for (var i = v.length - 1; i >= 1; i--) {
          if (v[i].slice(2).map(String).join('\u0001') === row.join('\u0001')) { sheet_(k).deleteRow(i + 1); forget_(k); break; }
        }
      });
    });
    xpCache_ = null;
    var r = u.restore || {};
    if (r.chore) updateRow_('chores', r.chore.row, r.chore.values);
    if (r.block) { var br = blockRow_(r.block.id); if (br) updateRow_('blocks', br, r.block.values); }
    if (r.deadline) { var dr = deadlineRow_(r.deadline.id); if (dr) updateRow_('deadlines', dr, r.deadline.values); }
    if (r.clean) { var c = cleanDays_(who).filter(function (d) { return d !== r.clean; }); setProp_('CLEAN_' + who, JSON.stringify(c)); }
    if (u.feed && u.feed.length) PROPS.setProperty('FEED', JSON.stringify(feed_().filter(function (f) { return u.feed.indexOf(f.id) === -1; })));
    delProp_('UNDO_' + who);
    return { state: appState_(who), undone: u.label };
  });
}

/** What a chore row looked like before it was ticked, so Undo can put it back. */
function choreSnap_(name) {
  var q = readChores_().filter(function (x) { return x.name === name; })[0];
  if (!q) return null;
  var r = readRow_('chores', q.row);
  return { chore: { row: q.row, values: { 'Last done': r['Last done'], 'Last done by': r['Last done by'], 'Next due': r['Next due'] } } };
}
