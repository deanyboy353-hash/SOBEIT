/**
 * WebApp.gs: the endpoint your phone posts data to.
 *
 *   POST <Web app URL>?key=<Web app key>&source=<name>
 *
 * Every request is saved to the Inbox tab first, then passed to the handler
 * for its `source`. Phase 1 only has `raw` (save and stop).
 * Later: add `health` (HC Webhook), `geofence` (MacroDroid) and so on to POST_ROUTES.
 */

var POST_ROUTES = {
  raw: function () { return 'stored'; }
};

function doPost(e) {
  var params = (e && e.parameter) || {};
  if (!validKey_(params.key)) return json_({ ok: false, error: 'bad key' });
  var source = String(params.source || 'raw');
  var body = e.postData ? e.postData.contents : '';
  try {
    appendRow_('inbox', { 'Received at': now_('yyyy-MM-dd HH:mm:ss'), 'Source': source, 'Body': String(body).slice(0, 45000) });
    var handler = POST_ROUTES[source] || POST_ROUTES.raw;
    return json_({ ok: true, source: source, result: handler(body, params) });
  } catch (err) {
    log_('ERROR', 'doPost(' + source + '): ' + err);
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Pages: your key opens the food page (or chores with ?page=chores); your
 * partner's key only ever opens chores. No valid key (or ?status=1): a short
 * "I'm alive" reply that shows no data.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var who = null;
  try { who = who_(params.key); } catch (err) { /* no valid key */ }
  if (!who || params.status) {
    return json_({ ok: true, service: 'sobeit', keyAccepted: validKey_(params.key), time: now_() });
  }
  var chores = who === 'partner' || params.page === 'chores';
  var page = HtmlService.createTemplateFromFile(chores ? 'ChoresPage' : 'FoodPage');
  page.key = params.key;
  page.otherUrl = who === 'me' ? (chores ? foodPageUrl_() : WEBAPP_URL + '?page=chores&key=' + params.key) : '';
  page.initialJson = JSON.stringify(chores ? choresState_(who) : foodState_()).replace(/</g, '\\u003c');
  return page.evaluate()
    .setTitle(chores ? 'Chores' : 'Food')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function foodPageUrl_() {
  var key = PropertiesService.getScriptProperties().getProperty('WEBAPP_KEY');
  return key ? WEBAPP_URL + '?key=' + key : '';
}

function validKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('WEBAPP_KEY');
  return !!expected && key === expected;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
