/* The little "Add a deadline" window opened from the right-click menu. */
(function () {
  var task = document.getElementById('task'), msg = document.getElementById('msg');
  task.value = new URLSearchParams(location.search).get('text') || '';
  function add(text) {
    msg.textContent = 'Adding…';
    LQ.rpc('addDeadline', [text]).then(function (r) {
      msg.innerHTML = '<span class="ok">' + r.added.task + ': due ' + r.added.dueText.slice(-5) + '. Nudge will keep reminding you.</span>';
      chrome.runtime.sendMessage({ refresh: true });
      setTimeout(function () { window.close(); }, 1800);
    }, function (e) { msg.innerHTML = '<span class="err">' + e.message + '</span>'; });
  }
  document.querySelectorAll('[data-when]').forEach(function (b) { b.addEventListener('click', function () { add(task.value.trim() + ' ' + b.dataset.when); }); });
  document.getElementById('go').addEventListener('click', function () { add(task.value.trim()); });
})();
