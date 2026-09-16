/**
 * 小番茄溫室作業板 — Google 試算表後端(Apps Script)
 *
 * 用法:在 Google 試算表按「擴充功能 → Apps Script」,刪掉原本內容,整份貼上這個檔案。
 * 詳細步驟請看 README.md。
 */

// ① 管理者密碼(至少 6 碼)。部署前一定要改。
//    之後可在網頁「排程設定 → 變更管理者密碼」修改,不用再改這裡。
const INITIAL_PASSWORD = '請改成管理者密碼';

const TZ = 'Asia/Taipei';
const TOKEN_DAYS = 30; // 管理者登入後保持登入的天數

const DEF = {
  log:    { name: '工作紀錄', head: ['日期', '時間', '工作編號', '作業項目', '紀錄表', '預定日期/週', '作業人員', '身分', '動作', '說明', 'ISO時間', '工作代碼'] },
  status: { name: '工作狀態', head: ['工作代碼', '工作編號', '作業項目', '狀態', '負責人', '管理者備註', '更新者', '更新時間', 'ISO時間'] },
  report: { name: '員工回報', head: ['工作代碼', '工作編號', '作業項目', '回報結果', '未完成原因', '回報人', '回報時間', 'ISO時間'] },
  cfg:    { name: '設定', head: ['參數', '值'] }
};
const STATUS_TEXT = { todo: '待辦', doing: '進行中', done: '完成', issue: '異常' };
const STATUS_KEY = { '待辦': 'todo', '進行中': 'doing', '完成': 'done', '異常': 'issue' };
const KEY_RE = /^[A-Z0-9]{1,10}(_[A-Za-z0-9-]{1,20})?$/;

/* ---------- 入口 ---------- */
function doGet() {
  setup();
  return out_({ ok: true, message: '小番茄溫室作業板 API 運作中' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad-request' }); }
  try {
    switch (d.action) {
      case 'load':      return out_(load_());
      case 'login':     return out_(login_(d));
      case 'logout':    return out_(logout_(d));
      case 'setReport': return out_(locked_(function () { return setReport_(d); }));
      case 'check':     return need_(d) || out_({ ok: true });
      case 'setStatus': return need_(d) || out_(locked_(function () { return setStatus_(d); }));
      case 'saveCfg':   return need_(d) || out_(locked_(function () { return saveCfg_(d); }));
      case 'logs':      return need_(d) || out_(logs_(d));
      case 'changePw':  return need_(d) || out_(changePw_(d));
    }
    return out_({ ok: false, error: 'unknown-action' });
  } catch (err) {
    return out_({ ok: false, error: 'server', message: String((err && err.message) || err) });
  }
}

/* ---------- 讀取 ---------- */
function load_() {
  const status = {};
  rows_('status').forEach(function (r) {
    if (r[0]) status[r[0]] = { status: STATUS_KEY[r[3]] || 'todo', assignee: r[4], note: r[5], by: r[6], at: r[8] };
  });
  const reports = {};
  rows_('report').forEach(function (r) {
    if (r[0]) reports[r[0]] = { result: r[3] === '完成' ? 'done' : 'notdone', reason: r[4], by: r[5], at: r[7] };
  });
  return { ok: true, cfg: readCfg_(), status: status, reports: reports };
}

function readCfg_() {
  const list = rows_('cfg');
  if (!list.length) return null;
  const c = {};
  list.forEach(function (r) {
    const k = r[0], v = r[1];
    if (!k) return;
    if (k === 'staff') c.staff = v ? v.split('、').filter(String) : [];
    else if (/^-?\d+(\.\d+)?$/.test(v)) c[k] = Number(v);
    else c[k] = v;
  });
  return c;
}

function logs_(d) {
  const month = String(d.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'bad-request' };
  const logs = rows_('log').filter(function (r) { return r[0].indexOf(month) === 0; }).map(function (r) {
    return { at: r[10], key: r[11], code: r[2], task: r[3], rec: r[4], plan: r[5], who: r[6],
      role: r[7] === '管理者' ? 'manager' : 'staff', action: r[8], detail: r[9] };
  });
  return { ok: true, month: month, logs: logs };
}

/* ---------- 寫入 ---------- */
function setReport_(d) {
  const key = String(d.key || ''), r = d.doc || {}, info = d.info || {};
  if (!KEY_RE.test(key) || (r.result !== 'done' && r.result !== 'notdone')) return { ok: false, error: 'bad-request' };
  const at = new Date().toISOString();
  const reason = r.result === 'notdone' ? str_(r.reason, 500) : '';
  const by = str_(r.by, 40) || '未具名';
  const sh = sheet_('report');
  writeRow_(sh, findRow_(sh, key) || sh.getLastRow() + 1,
    [key, str_(info.code, 20), str_(info.task, 80), r.result === 'done' ? '完成' : '未完成', reason, by, fmt_(at, 'yyyy-MM-dd HH:mm'), at]);
  appendLog_({ at: at, key: key, info: info, who: by, role: 'staff', action: r.result === 'done' ? '回報完成' : '回報未完成', detail: reason });
  return { ok: true, at: at };
}

function setStatus_(d) {
  const key = String(d.key || ''), s = d.doc || {}, info = d.info || {};
  if (!KEY_RE.test(key) || !STATUS_TEXT[s.status]) return { ok: false, error: 'bad-request' };
  const at = new Date().toISOString();
  const by = str_(s.by, 40) || '管理者';
  const sh = sheet_('status');
  writeRow_(sh, findRow_(sh, key) || sh.getLastRow() + 1,
    [key, str_(info.code, 20), str_(info.task, 80), STATUS_TEXT[s.status], str_(s.assignee, 300), str_(s.note, 1000), by, fmt_(at, 'yyyy-MM-dd HH:mm'), at]);
  (Array.isArray(d.logs) ? d.logs.slice(0, 5) : []).forEach(function (l) {
    appendLog_({ at: at, key: key, info: info, who: by, role: 'manager', action: l.action, detail: l.detail });
  });
  return { ok: true, at: at };
}

function saveCfg_(d) {
  const c = d.cfg;
  if (!c || typeof c !== 'object') return { ok: false, error: 'bad-request' };
  const list = Object.keys(c).filter(function (k) { return /^[a-zA-Z]{1,30}$/.test(k); }).map(function (k) {
    if (k === 'staff') {
      const names = Array.isArray(c.staff) ? c.staff : [];
      return [k, names.map(function (n) { return str_(n, 20).replace(/、/g, ''); }).filter(String).join('、')];
    }
    return [k, str_(c[k], 40)];
  });
  const sh = sheet_('cfg');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  list.forEach(function (row, i) { writeRow_(sh, i + 2, row); });
  return { ok: true };
}

function appendLog_(e) {
  const sh = sheet_('log'), info = e.info || {};
  writeRow_(sh, sh.getLastRow() + 1, [
    fmt_(e.at, 'yyyy-MM-dd'), fmt_(e.at, 'HH:mm'), str_(info.code, 20), str_(info.task, 80), str_(info.rec, 20), str_(info.plan, 20),
    str_(e.who, 40), e.role === 'manager' ? '管理者' : '員工', str_(e.action, 20), str_(e.detail, 500), e.at, e.key
  ]);
}

/* ---------- 管理者密碼與登入 ---------- */
function props_() { return PropertiesService.getScriptProperties(); }
function password_() { return props_().getProperty('PASSWORD') || INITIAL_PASSWORD; }

function login_(d) {
  const pw = password_();
  if (/^請改/.test(pw)) return { ok: false, error: 'no-password' };
  if (String(d.password || '') !== pw) { Utilities.sleep(1000); return { ok: false, error: 'bad-password' }; }
  const p = props_(), now = Date.now(), all = p.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('tok_') === 0 && Number(all[k]) < now) p.deleteProperty(k); });
  const tok = Utilities.getUuid();
  p.setProperty('tok_' + tok, String(now + TOKEN_DAYS * 86400000));
  return { ok: true, token: tok, sheetUrl: SpreadsheetApp.getActive().getUrl() };
}

function logout_(d) {
  if (typeof d.token === 'string' && d.token) props_().deleteProperty('tok_' + d.token);
  return { ok: true };
}

function changePw_(d) {
  if (String(d.current || '') !== password_()) { Utilities.sleep(1000); return { ok: false, error: 'bad-password' }; }
  const next = String(d.next || '');
  if (next.length < 6) return { ok: false, error: 'weak-password' };
  const p = props_(), all = p.getProperties();
  p.setProperty('PASSWORD', next);
  Object.keys(all).forEach(function (k) { if (k.indexOf('tok_') === 0 && k !== 'tok_' + d.token) p.deleteProperty(k); });
  return { ok: true };
}

function authed_(tok) {
  if (typeof tok !== 'string' || !tok || tok.length > 64) return false;
  const v = props_().getProperty('tok_' + tok);
  if (!v) return false;
  if (Number(v) < Date.now()) { props_().deleteProperty('tok_' + tok); return false; }
  return true;
}
function need_(d) { return authed_(d.token) ? null : out_({ ok: false, error: 'auth' }); }

/**
 * 忘記密碼時:在 Apps Script 編輯器上方選擇 resetPassword,按「執行」。
 * 密碼會回到上面 INITIAL_PASSWORD 的值,所有裝置的管理者登入都會被登出。
 */
function resetPassword() {
  const p = props_(), all = p.getProperties();
  p.deleteProperty('PASSWORD');
  Object.keys(all).forEach(function (k) { if (k.indexOf('tok_') === 0) p.deleteProperty(k); });
}

/* ---------- 試算表工具 ---------- */
/** 建立 4 張工作表。第一次可以在編輯器選 setup 按「執行」,順便完成授權。 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(DEF).forEach(sheet_);
  const blank = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

function sheet_(k) {
  const def = DEF[k], ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, sh.getMaxRows(), def.head.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold').setBackground('#DDEBDF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(k) {
  const sh = sheet_(k), n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, DEF[k].head.length).getDisplayValues() : [];
}

function findRow_(sh, key) {
  if (sh.getLastRow() < 2) return 0;
  const c = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(key).matchCase(true).matchEntireCell(true).findNext();
  return c ? c.getRow() : 0;
}

function writeRow_(sh, row, values) {
  sh.getRange(row, 1, 1, values.length).setNumberFormat('@').setValues([values.map(clean_)]);
}

// 以 = + - @ 開頭的文字前面加 ' ,避免被當成公式
function clean_(v) { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function str_(v, max) { return String(v == null ? '' : v).slice(0, max); }
function fmt_(iso, pattern) { return Utilities.formatDate(new Date(iso), TZ, pattern); }
function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
