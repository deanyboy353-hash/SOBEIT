/* Life Quest service worker: opens instantly (cached shell) and shows push notifications. */
var CACHE = 'lq-v1';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'music.js', 'portraits.js', 'words.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

importScripts('config.js');

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// App files: network first so updates arrive, cache when offline. Data calls go straight to the network.
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});

// Push: Firebase sends a webpush notification, which the browser shows by itself.
// This only handles data-only messages and taps.
if (self.LQ_CONFIG && self.LQ_CONFIG.firebase) {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(self.LQ_CONFIG.firebase);
  firebase.messaging().onBackgroundMessage(function (p) {
    if (p.notification) return;
    var d = p.data || {};
    var opts = { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tab || 'home', data: { tab: d.tab || 'home' } };
    if (d.deadline) {
      opts.tag = 'deadline-' + d.deadline; opts.renotify = true; opts.requireInteraction = true; opts.data.deadline = d.deadline;
      opts.actions = [{ action: 'done', title: 'Done' }, { action: 'extend', title: '+30 min' }, { action: 'park', title: 'Park it' }];
    }
    return self.registration.showNotification(d.title || 'Life Quest', opts);
  });
}
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = e.notification.data || {}, fd = (d.FCM_MSG && d.FCM_MSG.data) || {};
  var tab = fd.tab || d.tab || 'home', deadline = fd.deadline || d.deadline || '';
  var act = ['done', 'extend', 'park'].indexOf(e.action) !== -1 ? e.action : '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].postMessage({ tab: tab, deadline: deadline, act: act }); return list[i].focus(); }
    }
    return self.clients.openWindow(self.registration.scope + '#' + (deadline && act ? 'dl=' + deadline + ':' + act : tab));
  }));
});
