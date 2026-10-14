/* Shared by the side panel, the setup page and the background worker. */
self.LQ = {
  get: function () { return chrome.storage.local.get(['key']).then(function (s) { return s.key || ''; }); },
  setFromLink: function (text) {
    var m = String(text || '').match(/key=([A-Za-z0-9]+)/) || String(text || '').trim().match(/^([A-Za-z0-9]{20,})$/);
    if (!m) return Promise.reject(new Error('That doesn\'t look like your app link. It ends in ?key= and a long code.'));
    return chrome.storage.local.set({ key: m[1] }).then(function () { return m[1]; });
  },
  rpc: function (fn, args) {
    return LQ.get().then(function (key) {
      if (!key) throw new Error('Open the Nudge panel and paste your app link first.');
      return fetch(self.LQ_EXT.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, key: key, args: args || [] }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.error || 'Something went wrong.'); return j.result; });
    });
  }
};
