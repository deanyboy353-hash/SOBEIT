/**
 * Tasks.gs: Google Tasks is no longer used (everything is logged in the app).
 * retireTasks_() runs once: it archives the list of tasks the app made, removes those tasks from your
 * Google Tasks list and stops the old 10-minute trigger. Nothing else of yours in Google Tasks is touched.
 */
var TASK_LIST = '@default';

function retireTasks_() {
  if (prop_('TASKS_RETIRED')) return;
  var raw = prop_('TRACKED_TASKS') || '{}', t = JSON.parse(raw);
  archive_('Google Tasks', 'TRACKED_TASKS', raw);
  Object.keys(t).forEach(function (id) { try { Tasks.Tasks.remove(TASK_LIST, id); } catch (e) { /* already gone */ } });
  delProp_('TRACKED_TASKS');
  try { ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'pollTasks') ScriptApp.deleteTrigger(tr); }); } catch (e) {}
  setProp_('TASKS_RETIRED', '1');
}
/** Old trigger name: does nothing now (kept so a trigger that hasn't been removed yet doesn't error). */
function pollTasks() { try { retireTasks_(); } catch (e) {} }
