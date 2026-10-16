// In-memory stand-ins for the Google services the script uses, so whole
// days can be simulated in Node. Only the methods the script calls exist.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RealDate = Date;

function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23'
  });
  const p = {};
  f.formatToParts(date).forEach(x => { p[x.type] = x.value; });
  return p;
}

const Utilities = {
  formatDate(date, tz, pattern) {
    const p = tzParts(date, tz);
    const iso = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss|u/g, t =>
      ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, u: String(iso) }[t]));
  },
  parseDate(str, tz, pattern) {
    if (pattern !== 'yyyy-MM-dd HH:mm') throw new Error('fake parseDate pattern ' + pattern);
    const [d, t] = str.split(' ');
    const [y, mo, da] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    const target = RealDate.UTC(y, mo - 1, da, h, mi);
    let guess = target;
    for (let i = 0; i < 3; i++) {
      const p = tzParts(new RealDate(guess), tz);
      const shown = RealDate.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      guess += target - shown;
    }
    return new RealDate(guess);
  },
  getUuid: () => require('crypto').randomUUID(),
  newBlob: (data, type) => { const buf = Buffer.isBuffer(data) ? data : typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(Uint8Array.from(data)); return { getBytes: () => Array.from(buf), getDataAsString: () => buf.toString('utf8'), _buf: buf }; },
  gzip: blob => { const z = require('zlib').gzipSync(blob._buf); return { getBytes: () => Array.from(z), _buf: z }; },
  ungzip: blob => { const u = require('zlib').gunzipSync(blob._buf); return { getBytes: () => Array.from(u), getDataAsString: () => u.toString('utf8'), _buf: u }; },
  base64Encode: x => Buffer.from(Uint8Array.from(x)).toString('base64'),
  base64Decode: s => Array.from(Buffer.from(s, 'base64')),
  base64EncodeWebSafe: x => Buffer.from(typeof x === 'string' ? x : Uint8Array.from(x)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  computeRsaSha256Signature: (text, key) => Array.from(Buffer.from('sig:' + text.length))
};

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    vals.forEach((row, i) => row.forEach((v, j) => {
      const ri = this.r - 1 + i;
      this.sheet.data[ri] = this.sheet.data[ri] || [];
      this.sheet.data[ri][this.c - 1 + j] = typeof v === 'string' && v[0] === "'" ? v.slice(1) : v; // like Sheets: ' forces text
    }));
    if (this.sheet.ss && this.sheet.ss.onEdit) this.sheet.ss.onEdit({ range: this });   // a hand edit fires onEdit (script writes don't)
    return this;
  }
  getSheet() { return this.sheet; }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; }
  clearContent() { return this.setValues(Array.from({ length: this.nr }, () => Array(this.nc).fill(''))); }
  setFontWeight() { return this; }
  insertCheckboxes() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some(v => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.data.forEach(r => (r || []).forEach((v, j) => { if (v !== '' && v !== undefined) m = Math.max(m, j + 1); }));
    return m;
  }
  getMaxRows() { return 1000; }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  setFrozenRows() {}
  insertRowAfter(r) { this.data.splice(r, 0, []); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  deleteRows(r, n) { this.data.splice(r - 1, n); }
  setName(n) { this.name = n; }
  setColumnWidth() {}
  rows() { return this.getDataRange().getValues(); }
}

class FakeSpreadsheet {
  constructor(id, name) { this.sheets = [new FakeSheet('Sheet1')]; this.id = id || 'sheet-id'; this.name = name || 'Nudge'; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); s.ss = this; this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  setSpreadsheetTimeZone() {}
}

function makeCalendar() {
  const events = [];
  const cal = {
    events,
    createEvent(title, start, end, opts) {
      const ev = {
        title, start, end, opts, tags: {}, reminders: [], color: null, deleted: false,
        getTitle() { return this.title; }, getStartTime() { return this.start; },
        setTag(k, v) { this.tags[k] = v; }, getTag(k) { return this.tags[k] || null; },
        removeAllReminders() { this.reminders = []; }, addPopupReminder(m) { this.reminders.push(m); },
        setColor(c) { this.color = c; }, deleteEvent() { this.deleted = true; }
      };
      events.push(ev);
      return ev;
    },
    getEvents(s, e) { return events.filter(ev => !ev.deleted && ev.start < e && ev.end > s); },
    live() { return events.filter(ev => !ev.deleted); }
  };
  return cal;
}

function makeTasks() {
  const store = {};
  let n = 0;
  const api = {
    store,
    insert(res) { const id = 't' + (++n); store[id] = Object.assign({ id, status: 'needsAction' }, res); return store[id]; },
    get(list, id) { if (!store[id]) throw new Error('API call to tasks.tasks.get failed with error: Not Found'); return Object.assign({}, store[id]); },
    remove(list, id) { delete store[id]; },
    patch(res, list, id) { Object.assign(store[id], res); return store[id]; },
    tick(id, when) { store[id].status = 'completed'; store[id].completed = when; },
    open() { return Object.values(store).filter(t => t.status !== 'completed'); }
  };
  return api;
}

function forecastJson(ymd, rainy) {
  const time = [], t = [], pp = [], pr = [], ws = [], wg = [];
  for (let h = 0; h < 24; h++) {
    time.push(ymd + 'T' + String(h).padStart(2, '0') + ':00');
    t.push(12); pp.push(rainy && h >= 16 ? 80 : 10); pr.push(rainy && h >= 16 ? 1.2 : 0); ws.push(12); wg.push(25);
  }
  return {
    hourly: { time, temperature_2m: t, precipitation_probability: pp, precipitation: pr, wind_speed_10m: ws, wind_gusts_10m: wg },
    daily: { sunset: [ymd + 'T18:10'] }
  };
}

/** Load every .gs file into one sandbox, like Apps Script does. */
function loadProject(opts = {}) {
  const state = {
    now: opts.now || new RealDate('2026-10-13T05:00:00Z'),
    rainy: false, weatherDown: false,
    props: { EXTRAS_OFF: '1' }, cache: {}, mails: [], triggers: [], fetches: [], claudeRequests: [], pushes: [],
    claudeReply: { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items: [
      { name: '2 Weetabix Protein', kcal: 200, protein_g: 14 }, { name: '200ml semi-skimmed milk', kcal: 100, protein_g: 7 }] }) }] } }
  };
  const ss = new FakeSpreadsheet();
  const calendar = makeCalendar();
  const tasks = makeTasks();

  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(state.now.getTime()); }
    static now() { return state.now.getTime(); }
  }

  const ctx = {
    Date: FakeDate, console, JSON, Math, Object, String, Number, Array, Error, RegExp, encodeURIComponent, isNaN,
    Utilities,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: id => (state.spreadsheets || []).find(x => x.id === id) || ss, getUi: () => null,
      create: name => { const x = new FakeSpreadsheet('ss-' + ((state.spreadsheets = state.spreadsheets || []).length + 1), name); state.spreadsheets.push(x); return x; } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in state.props ? state.props[k] : null),
        getProperties: () => Object.assign({}, state.props),
        setProperty: (k, v) => { state.props[k] = String(v); },
        deleteProperty: k => { delete state.props[k]; }
      })
    },
    CacheService: { getScriptCache: () => ({
      get: k => (k in state.cache ? state.cache[k] : null),
      getAll: ks => { const o = {}; ks.forEach(k => { if (k in state.cache) o[k] = state.cache[k]; }); return o; },
      put: (k, v) => { if (v.length > 100000) throw new Error('Argument too large'); state.cache[k] = v; },
      putAll: o => { Object.keys(o).forEach(k => { if (String(o[k]).length > 100000) throw new Error('Argument too large'); }); Object.assign(state.cache, o); },
      removeAll: ks => ks.forEach(k => { delete state.cache[k]; })
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CalendarApp: { getDefaultCalendar: () => calendar, EventColor: { GREEN: '10', BLUE: '9', YELLOW: '5', ORANGE: '6', PALE_BLUE: '1', GRAY: '8', MAUVE: '3' } },
    Tasks: { Tasks: tasks },
    UrlFetchApp: {
      fetch(url, opts) {
        state.fetches.push(url);
        if (/anthropic/.test(url)) {
          state.claudeRequests.push({ headers: opts.headers, body: JSON.parse(opts.payload) });
          const r = state.claudeReply;
          return { getResponseCode: () => r.code || 200, getContentText: () => JSON.stringify(r.body) };
        }
        if (/oauth2\.googleapis/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'fcm-token', expires_in: 3600 }) };
        if (/fcm\.googleapis/.test(url)) {
          const msg = JSON.parse(opts.payload).message;
          state.pushes.push({ token: msg.token, title: msg.webpush.notification.title, body: msg.webpush.notification.body, tab: msg.data.tab, note: msg.webpush.notification, data: msg.data });
          if (/bad/.test(msg.token)) return { getResponseCode: () => 400, getContentText: () => '{"error":{"code":400,"message":"Invalid JSON payload received.","status":"INVALID_ARGUMENT"}}' };
          return /dead/.test(msg.token) ? { getResponseCode: () => 404, getContentText: () => '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}' }
            : { getResponseCode: () => 200, getContentText: () => '{"name":"ok"}' };
        }
        if (/firestore\.googleapis/.test(url)) { state.firestore = state.firestore || []; state.firestore.push({ url, opts }); return { getResponseCode: () => 200, getContentText: () => '{}' }; }
        if (state.weatherDown) return { getResponseCode: () => 503, getContentText: () => 'down' };
        const ymd = url.match(/start_date=([\d-]+)/)[1];
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(forecastJson(ymd, state.rainy)) };
      }
    },
    ScriptApp: {
      getProjectTriggers: () => state.triggers,
      deleteTrigger: t => { state.triggers = state.triggers.filter(x => x !== t); },
      newTrigger(fn) {
        const t = { fn, getHandlerFunction: () => fn };
        const chain = { timeBased: () => chain, everyDays: () => chain, atHour: () => chain, inTimezone: () => chain, everyMinutes: () => chain,
          onWeekDay: () => chain, at: d => { t.at = d; return chain; }, create: () => { state.triggers.push(t); return t; } };
        return chain;
      },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }),
      WeekDay: { SUNDAY: 'SUNDAY' }
    },
    MailApp: { sendEmail: (to, subject, body) => state.mails.push({ to, subject, body }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) },
    HtmlService: {
      createTemplateFromFile(name) {
        const tpl = { name, evaluate() {
          const html = fs.readFileSync(path.join(__dirname, '..', 'src', name + '.html'), 'utf8')
            .replace(/<\?!?=\s*([\s\S]*?)\s*\?>/g, (m, expr) => String(new Function('t', 'with (t) { return (' + expr + '); }')(tpl)));
          const out = { html, setTitle: () => out, addMetaTag: () => out };
          return out;
        } };
        return tpl;
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ text: s, setMimeType() { return this; } })
    }
  };
  vm.createContext(ctx);
  const src = path.join(__dirname, '..', 'src');
  fs.readdirSync(src).filter(f => f.endsWith('.gs') && !['Secrets.gs', 'ImportData.gs', 'Instance.gs'].includes(f)).sort().forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(src, f), 'utf8'), ctx, { filename: f });
  });
  // Like Apps Script, each call from outside (a tap, a trigger, a test step) is a fresh run
  // with nothing remembered from the last one; calls inside the code share the run.
  let depth = 0;
  Object.keys(ctx).forEach(name => {
    const f = ctx[name];
    if (typeof f !== 'function' || /^[A-Z]/.test(name) || name === 'resetRun_' || f.prototype && Object.keys(f.prototype).length) return;
    ctx[name] = function () {
      if (depth === 0 && ctx.resetRun_) ctx.resetRun_();
      depth++;
      try { return f.apply(this, arguments); } finally { depth--; }
    };
  });
  // Hand edits (a test writing straight into a tab) fire the onEdit simple trigger, like the real Sheet.
  ss.sheets.forEach(s => { s.ss = ss; });
  ss.onEdit = e => { if (depth === 0 && ctx.onEdit) ctx.onEdit(e); };
  return { ctx, state, ss, calendar, tasks, tab: name => ss.getSheetByName(name) };
}

module.exports = { loadProject, Utilities };
