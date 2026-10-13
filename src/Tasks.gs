/**
 * Tasks.gs: one-tap logging through Google Tasks.
 *
 * The script remembers which tasks it created (type + date) in Script
 * Properties. pollTasks() checks them every 10 minutes and hands ticked
 * ones to the matching handler in taskHandlers_(). Each morning, tasks from
 * earlier days are tidied away so nothing piles up.
 *
 * To add a new kind of one-tap task later: add a handler to taskHandlers_()
 * and call createTrackedTask_('yourtype', ymd, title, notes).
 */

var TASK_LIST = '@default';

function taskHandlers_() {
  return {
    gym: { onDone: onGymTaskDone_, onExpired: onGymTaskExpired_ },
    weigh: { onDone: onWeighTaskDone_, onExpired: onWeighTaskExpired_ },
    quest: { onDone: onQuestTaskDone_, onExpired: function () {} },
    prep: { onDone: onPrepTaskDone_, onExpired: function () {} }
  };
}

function tracked_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('TRACKED_TASKS') || '{}');
}

function saveTracked_(t) {
  PropertiesService.getScriptProperties().setProperty('TRACKED_TASKS', JSON.stringify(t));
}

/** Creates the task once per type (and ref, e.g. the quest name) per day. Re-running is safe. */
function createTrackedTask_(type, ymd, title, notes, ref) {
  var t = tracked_();
  for (var id in t) {
    if (t[id].type === type && t[id].date === ymd && (t[id].ref || '') === (ref || '')) {
      if (t[id].done) return null;
      var existing = getTask_(id);
      if (existing) return existing;
      delete t[id];
    }
  }
  var task = Tasks.Tasks.insert({ title: title, notes: notes || '', due: ymd + 'T00:00:00.000Z' }, TASK_LIST);
  t[task.id] = ref ? { type: type, date: ymd, ref: ref } : { type: type, date: ymd };
  saveTracked_(t);
  return task;
}

/** The task, or null if it has been deleted. */
function getTask_(id) {
  try {
    var task = Tasks.Tasks.get(TASK_LIST, id);
    return task && !task.deleted ? task : null;
  } catch (e) {
    if (/not found|404/i.test(String(e))) return null;
    throw e;
  }
}

/**
 * Every 10 minutes: log anything that has been ticked. A handler returns
 * true to say "not finished with this one" (e.g. it reopened the task).
 */
function pollTasks() {
  withLock_(function () {
    var t = tracked_();
    Object.keys(t).forEach(function (id) {
      var info = t[id];
      if (info.done) return;
      var task = getTask_(id);
      if (!task) { delete t[id]; return; }
      if (task.status === 'completed' && !taskHandlers_()[info.type].onDone(task, info)) info.done = true;
    });
    saveTracked_(t);
  });
}

/** Each morning: finish off tasks from earlier days and remove them. */
function sweepOldTasks_(todayYmd) {
  var t = tracked_();
  Object.keys(t).forEach(function (id) {
    var info = t[id];
    if (info.date >= todayYmd) return;
    var task = getTask_(id);
    var handler = taskHandlers_()[info.type];
    if (!info.done) {
      if (task && task.status === 'completed') handler.onDone(task, info);
      else handler.onExpired(task, info);
    }
    if (task) {
      try { Tasks.Tasks.remove(TASK_LIST, id); } catch (e) { /* already gone */ }
    }
    delete t[id];
  });
  saveTracked_(t);
}

function completedAt_(task) {
  return task.completed ? Utilities.formatDate(new Date(task.completed), TZ, 'yyyy-MM-dd HH:mm') : now_();
}
