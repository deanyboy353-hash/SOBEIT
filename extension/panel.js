/* The side panel: your app, or a one-time setup if it doesn't know your link yet. */
(function () {
  var root = document.getElementById('root');
  function showApp(key) {
    root.innerHTML = '<iframe src="' + self.LQ_EXT.app + '?key=' + encodeURIComponent(key) + '#home" allow="autoplay; clipboard-write; screen-wake-lock" title="Life Quest"></iframe>';
  }
  function showSetup(msg) {
    root.innerHTML = '<div class="setup"><h1>Life Quest</h1><p>Paste your app link once. It\'s in the Config tab of your Google Sheet (Your app link, or Partner app link).</p>' +
      '<form id="f"><input id="link" placeholder="https://life-quest…web.app/?key=…" autofocus><button type="submit">Open my app</button></form>' + (msg ? '<p class="err">' + msg + '</p>' : '') + '</div>';
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      LQ.setFromLink(document.getElementById('link').value).then(showApp, function (err) { showSetup(err.message); });
    });
  }
  LQ.get().then(function (key) { if (key) showApp(key); else showSetup(''); });
  chrome.storage.onChanged.addListener(function (c) { if (c.key) { if (c.key.newValue) showApp(c.key.newValue); else showSetup(''); } });
})();
