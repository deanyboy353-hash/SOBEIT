/* The setup page: save or forget your app link. */
var msg = document.getElementById('msg');
LQ.get().then(function (k) { if (k) msg.innerHTML = '<span class="ok">Linked to your app.</span>'; });
document.getElementById('f').addEventListener('submit', function (e) {
  e.preventDefault();
  LQ.setFromLink(document.getElementById('link').value).then(function () { msg.innerHTML = '<span class="ok">Saved. You\'re all set.</span>'; chrome.runtime.sendMessage({ refresh: true }); }, function (err) { msg.innerHTML = '<span class="err">' + err.message + '</span>'; });
});
document.getElementById('forget').addEventListener('click', function () { chrome.storage.local.remove('key').then(function () { msg.textContent = 'Forgotten.'; }); });
