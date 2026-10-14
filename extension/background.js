/* Life Quest for Chrome: menu, badge and desktop nags. */
importScripts('config.js', 'shared.js');

chrome.runtime.onInstalled.addListener(function () {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({ id: 'deadline', title: 'Life Quest: add "%s" as a deadline', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'block', title: 'Life Quest: time-block "%s"', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'shop', title: 'Life Quest: add "%s" to shopping', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'park', title: 'Life Quest: save "%s" for later', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'page', title: 'Life Quest: add this page as a deadline', contexts: ['page'] });
  });
  chrome.alarms.create('check', { periodInMinutes: 1 });
  LQ.get().then(function (k) { if (!k) chrome.runtime.openOptionsPage(); });
});
chrome.runtime.onStartup.addListener(function () { chrome.alarms.create('check', { periodInMinutes: 1 }); });

function note(title, message) {
  chrome.notifications.create('lq-' + Date.now(), { type: 'basic', iconUrl: 'icon-128.png', title: title, message: message || '' });
}
function ask(text) {
  chrome.windows.create({ url: 'deadline.html?text=' + encodeURIComponent(text.slice(0, 140)), type: 'popup', width: 420, height: 340 });
}
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var text = (info.selectionText || '').trim();
  if (info.menuItemId === 'page') return ask((tab && tab.title ? tab.title : 'This page') + ' ');
  if (!text) return;
  if (info.menuItemId === 'deadline') {
    LQ.rpc('addDeadline', [text]).then(function (r) { note('Deadline added', r.added.task + ': due ' + r.added.dueText.slice(-5)); check(); }, function (e) {
      if (/Add a time/.test(e.message)) ask(text); else note('Couldn\'t add it', e.message);
    });
  } else if (info.menuItemId === 'block') {
    LQ.rpc('addBlock', [text.slice(0, 140)]).then(function (r) {
      var a = r.added, hm = function (m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); };
      note('Blocked ' + hm(a.start) + '-' + hm(a.start + a.mins), a.task + (a.placed ? ' (next free slot)' : ''));
    }, function (e) { note('Couldn\'t block it', e.message); });
  } else if (info.menuItemId === 'shop') {
    LQ.rpc('addShopping', [text.slice(0, 80)]).then(function () { note('Added to shopping', text.slice(0, 80)); }, function (e) { note('Couldn\'t add it', e.message); });
  } else if (info.menuItemId === 'park') {
    LQ.rpc('parkThing', [text.slice(0, 300)]).then(function () { note('Saved for later', text.slice(0, 80)); }, function (e) { note('Couldn\'t save it', e.message); });
  }
});

// Badge, plus a desktop nag for anything late (every 5 minutes, with buttons).
var nagged = {};
function check() {
  return LQ.rpc('appState', []).then(function (s) {
    var list = s.deadlines || [], now = Date.now(), late = list.filter(function (d) { return d.due < now; });
    chrome.action.setBadgeText({ text: list.length ? String(list.length) : '' });
    chrome.action.setBadgeBackgroundColor({ color: late.length ? '#d6336c' : '#5b44b8' });
    late.forEach(function (d) {
      if (nagged[d.id] && now - nagged[d.id] < 5 * 60000) return;
      nagged[d.id] = now;
      var mins = Math.round((now - d.due) / 60000);
      chrome.notifications.create('dl-' + d.id, {
        type: 'basic', iconUrl: 'icon-128.png', requireInteraction: true, priority: 2,
        title: 'Overdue: ' + d.task, message: (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' min') + ' late. It won\'t do itself.',
        buttons: [{ title: 'Done' }, { title: '+30 min' }]
      });
    });
  }).catch(function () { chrome.action.setBadgeText({ text: '' }); });
}
chrome.alarms.onAlarm.addListener(function (a) { if (a.name === 'check') check(); });
chrome.runtime.onMessage.addListener(function (m) { if (m && m.refresh) check(); });
chrome.notifications.onButtonClicked.addListener(function (id, i) {
  if (id.indexOf('dl-') !== 0) return;
  var dl = id.slice(3);
  LQ.rpc('deadlineAction', [dl, i === 0 ? 'done' : 'extend']).then(function (r) {
    chrome.notifications.clear(id);
    note(i === 0 ? 'Done. +' + r.xp + ' XP' : 'Thirty more minutes', i === 0 ? 'Nice.' : 'That cost 3 XP.');
    delete nagged[dl]; check();
  }, function (e) { note('Couldn\'t do that', e.message); });
});
chrome.notifications.onClicked.addListener(function () {
  chrome.windows.getLastFocused(function (w) { if (w) chrome.sidePanel.open({ windowId: w.id }).catch(function () {}); });
});
