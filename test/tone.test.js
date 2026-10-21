const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadProject } = require('./fakes');

const root = path.join(__dirname, '..');
const unescape = s => s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
const EMOJI = /\p{Extended_Pictographic}/gu;
// The only emoji allowed: what people send each other in the Us chat (reactions, the wink, dice faces) and the Tonight? quick replies.
const CHAT_OK = new Set(['😏', '❤', '😂', '😮', '😢', '🔥', '👍', '😉', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']);
const BANNED = /\b(awesome|amazing|crush(ed|ing)? it|you('ve)? got this|let'?s go|yay|super|rockstar|level up your life)\b/i;

function uiFiles() {
  const web = fs.readdirSync(path.join(root, 'web')).filter(f => /\.(js|html|webmanifest)$/.test(f) && f !== 'three.min.js').map(f => 'web/' + f);
  const gs = fs.readdirSync(path.join(root, 'src')).filter(f => /\.gs$/.test(f) && !/^(ImportData|Secrets|Instance)\.gs$/.test(f)).map(f => 'src/' + f);
  return web.concat(gs);
}

test('No emoji in UI strings, buttons, cards or notifications (the Us chat and Tonight? replies excepted)', () => {
  const found = [];
  uiFiles().forEach(f => {
    unescape(fs.readFileSync(path.join(root, f), 'utf8')).split('\n').forEach((line, i) => {
      (line.match(EMOJI) || []).forEach(e => { if (!(f === 'web/chat.js' && CHAT_OK.has(e))) found.push(f + ':' + (i + 1) + ' ' + e); });
    });
  });
  assert.deepStrictEqual(found, []);
  // and the exceptions are only where they should be
  const chat = unescape(fs.readFileSync(path.join(root, 'web/chat.js'), 'utf8'));
  assert.match(chat, /QUICK = \{ tonight: \['Yes 😏'/);
  assert.doesNotMatch(chat.match(/data-cs="wink">[^<]*</)[0], EMOJI, 'the Wink button uses an icon');
});

test('Tone: none of the banned words in the app, notifications or prompts; exclamation marks are rare', () => {
  const hits = [];
  let bangs = 0;
  uiFiles().forEach(f => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    (src.match(/'(?:[^'\\\n]|\\.)*'/g) || []).forEach(str => {
      str = str.replace(/\\'/g, "'");
      if (BANNED.test(str) && !/Never say:/.test(str)) hits.push(f + ': ' + str.slice(0, 80));
      if (/[A-Za-z)]!+(\s|'|$)/.test(str)) bangs++;
    });
  });
  assert.deepStrictEqual(hits, []);
  assert.ok(bangs <= 6, bangs + ' exclamation marks: keep them for celebrations');
});

test('Every Claude prompt carries the voice: British, direct, short, no emojis, no banned words', () => {
  const ai = fs.readFileSync(path.join(root, 'src/AI.gs'), 'utf8');
  const voice = ai.match(/var AI_VOICE = ([\s\S]*?);\n/)[1];
  ['British', 'direct', 'Start instructions with the action', 'UK spelling', '£', 'Friday 16 October', 'guilt', 'No emojis', 'awesome'].forEach(w => assert.ok(voice.includes(w), w));
  ['makeBrief_', 'function ask(', 'function mealIdeas', 'weeklyReviewAI_'].forEach(fn => {
    const body = ai.slice(ai.indexOf(fn), ai.indexOf('\n}\n', ai.indexOf(fn)));
    assert.match(body, /AI_VOICE/, fn + ' uses the voice');
  });
  assert.match(fs.readFileSync(path.join(root, 'src/Health.gs'), 'utf8'), /callClaudeJson_\(AI_VOICE/);
});

test('A full evening of reminders: firm, never needy; no emoji, no guilt lines', () => {
  const g = loadProject({ now: new Date('2026-10-13T09:00:00Z') });
  g.ctx.setup();
  delete g.state.props.EXTRAS_OFF;
  g.state.props.FCM_SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k', project_id: 'life-quest' });
  g.ctx.registerDevice(g.state.props.WEBAPP_KEY, 'me-phone-token-0123456789', 'Pixel');
  g.ctx.setPrefs(g.state.props.WEBAPP_KEY, { nag: 'aggressive' });
  g.state.props.STREAK_me = JSON.stringify({ count: 4, best: 4, through: '2026-10-12' });
  g.ctx.addDeadline(g.state.props.WEBAPP_KEY, 'Send the invoice by 5pm');
  for (let m = 16 * 60; m <= 22 * 60; m += 30) {
    g.state.now = new Date(Date.UTC(2026, 9, 13, Math.floor(m / 60) - 1, m % 60)); g.ctx.resetRun_();
    g.ctx.nagRun();
  }
  const texts = g.state.pushes.map(p => p.title + ' / ' + p.body);
  assert.ok(texts.length >= 5, texts.join('\n'));
  texts.forEach(t => {
    assert.doesNotMatch(t, EMOJI, t);
    assert.doesNotMatch(t, BANNED, t);
    assert.doesNotMatch(t, /misses you|trusted you|nervous|needs you|ignoring|annoyed|won't do itself|don't seem to be working/i, t);
  });
});
