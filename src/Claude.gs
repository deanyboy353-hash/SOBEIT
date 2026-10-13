/**
 * Claude.gs: estimates kcal and protein from a free-text description using
 * the Claude API. The API key lives in Script Properties (ANTHROPIC_API_KEY),
 * never in code. It is pasted in once from the food page.
 */

var CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5';

var FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short label including the amount, e.g. "2 Weetabix Protein"' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' }
        },
        required: ['name', 'kcal', 'protein_g'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

function claudeKey_() {
  return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
}

/**
 * "2 protein weetabix 200ml milk" -> [{name, kcal, protein_g}, ...]
 * presets: [{name, kcal, protein}] so Claude reuses your own numbers where they match.
 */
function estimateFood_(text, presets, model) {
  var key = claudeKey_();
  if (!key) throw new Error('No Claude API key yet. Paste one in at the bottom of the food page.');

  var presetLines = presets.map(function (p) { return '- ' + p.name + ': ' + p.kcal + ' kcal, ' + p.protein + ' g protein'; }).join('\n');
  var system = 'You estimate calories and protein for a food diary. The user is in the UK, so assume UK products, ' +
    'UK supermarket brands and typical UK portion sizes when an amount is not given. Split the description into ' +
    'separate foods. When a food matches one of the user\'s saved foods below, use those numbers (scaled to the amount). ' +
    'Round kcal to the nearest 5 and protein to the nearest gram.\n\nSaved foods (per serving):\n' + (presetLines || '(none)');

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify({
      model: model || CLAUDE_DEFAULT_MODEL,
      max_tokens: 4000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: FOOD_SCHEMA } },
      system: system,
      messages: [{ role: 'user', content: String(text).slice(0, 500) }]
    })
  });

  var code = res.getResponseCode();
  var body = JSON.parse(res.getContentText() || '{}');
  if (code === 401) throw new Error('Claude rejected the API key. Paste a new one at the bottom of the food page.');
  if (code === 400 && /credit/i.test(res.getContentText())) throw new Error('Your Claude API account is out of credit. Top up at console.anthropic.com → Billing.');
  if (code !== 200) throw new Error('Claude API error ' + code + ': ' + ((body.error && body.error.message) || res.getContentText().slice(0, 200)));
  if (body.stop_reason === 'refusal') throw new Error("Claude wouldn't estimate that one. Try describing it differently.");
  if (body.stop_reason === 'max_tokens') throw new Error('That description was too long to estimate. Try splitting it up.');

  var textBlock = (body.content || []).filter(function (b) { return b.type === 'text'; })[0];
  if (!textBlock) throw new Error('Claude gave no answer. Please try again.');
  var items = JSON.parse(textBlock.text).items || [];
  return items.filter(function (i) { return i.name; }).map(function (i) {
    return { name: String(i.name), kcal: Math.round(Number(i.kcal) || 0), protein: Math.round(Number(i.protein_g) || 0) };
  });
}
