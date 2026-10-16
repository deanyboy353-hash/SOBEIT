/* Nudge service worker: opens instantly (cached shell) and shows push notifications. */
var CACHE = 'lq-v9';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'setup.js', 'face.js', 'figure.js', 'look.js', 'outbox.js', 'chat.js', 'fmt.js', 'music.js', 'words.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

importScripts('config.js');

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// App files: straight from the cache (instant, works offline), refreshed in the background.
// When a file really changed, open pages are told so they can offer a reload. Data calls go straight to the network.
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Shared from another app (a photo or some text): keep it, then open the Food log with it
  if (e.request.method === 'POST' && url.origin === location.origin && /\/share$/.test(url.pathname)) {
    e.respondWith(e.request.formData().then(function (fd) {
      var photo = fd.get('photo'), text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join(' ').trim();
      return caches.open('nudge-share').then(function (c) {
        var jobs = [c.put('share-text', new Response(text || ''))];
        if (photo && photo.size) jobs.push(c.put('share-photo', new Response(photo, { headers: { 'Content-Type': photo.type || 'image/jpeg' } })));
        else jobs.push(c.delete('share-photo'));
        return Promise.all(jobs);
      }).then(function () { return Response.redirect('./#food:share', 303); });
    }).catch(function () { return Response.redirect('./#food', 303); }));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          if (hit && /\.(js|css|html)$|\/$/.test(url.pathname)) Promise.all([hit.clone().text(), res.clone().text()]).then(function (t) { if (t[0] !== t[1]) self.clients.matchAll({ type: 'window' }).then(function (list) { list.forEach(function (w) { w.postMessage({ updated: true }); }); }); });
          c.put(e.request, copy);
        }
        return res;
      });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net.catch(function () { return c.match('index.html'); });
    });
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
    return self.registration.showNotification(d.title || 'Nudge', opts);
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
