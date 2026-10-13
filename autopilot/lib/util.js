'use strict';
// Small shared helpers: atomic JSON files, HTTP(S) client, date helpers, and a logger that can
// never print a secret value.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const SECRET_KEY_RE = /(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|REFRESH|AUTH|BEARER|PRIVATE|WEBHOOK)/i;
const secretValues = new Set();

// Remember a secret value so redact() can scrub it wherever it shows up.
function registerSecrets(env) {
  for (const [k, v] of Object.entries(env || {})) if (SECRET_KEY_RE.test(k) && typeof v === 'string' && v.length >= 6) secretValues.add(v);
}

function redact(text) {
  let s = String(text == null ? '' : text);
  for (const v of secretValues) if (v) s = s.split(v).join('[redacted]');
  return s
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[redacted]')
    .replace(/((?:refresh_token|access_token|client_secret|api[_-]?key)["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]');
}

const log = (...a) => console.log(redact(a.join(' ')));
const warn = (...a) => console.error(redact(a.join(' ')));

function ensureDir(d, mode) { fs.mkdirSync(d, { recursive: true, mode: mode || 0o750 }); return d; }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error(`cannot read ${file}: ${e.message}`); }
}

// temp file + rename: a crash never leaves a half-written state file
function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o640 });
  fs.renameSync(tmp, file);
}

const today = (d) => (d || new Date()).toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return today(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

// request(url, {method, headers, body, timeoutMs}) -> { status, headers, body (string) }; never throws on HTTP status.
function request(url, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = o.body == null ? null : Buffer.from(o.body);
    const req = lib.request(u, { method: o.method || 'GET', headers: Object.assign({ 'User-Agent': 'mamta-autopilot/1.0', 'Accept-Encoding': 'identity' }, o.headers || {}, body ? { 'Content-Length': body.length } : {}) }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size <= 8 * 1024 * 1024) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    const limit = Math.min(o.timeoutMs || 30000, Number(process.env.AUTOPILOT_HTTP_TIMEOUT_MS) || 1e9);
    req.setTimeout(limit, () => req.destroy(Object.assign(new Error(`timeout after ${limit} ms`), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bounded retry for TRANSIENT failures only (network error, timeout, HTTP 429, HTTP 5xx), with exponential backoff.
// Honours Retry-After (capped). Never retries other 4xx. After the last attempt the final response/error is returned/thrown
// unchanged, with `attempts` set, so callers can tell a rate limit from an outage.
async function requestRetry(url, opts, retry) {
  const r = Object.assign({ retries: 2, baseMs: 1000, maxMs: 30000 }, retry || {});
  const envBase = Number(process.env.AUTOPILOT_RETRY_BASE_MS);
  if (process.env.AUTOPILOT_RETRY_BASE_MS !== undefined && Number.isFinite(envBase) && envBase >= 0) r.baseMs = envBase;
  for (let attempt = 0; ; attempt++) {
    let res = null; let err = null;
    try { res = await request(url, opts); } catch (e) { err = e; }
    const transient = err ? true : res.status === 429 || res.status >= 500;
    if (!transient || attempt >= r.retries) { if (err) { err.attempts = attempt + 1; throw err; } res.attempts = attempt + 1; return res; }
    let wait = Math.min(r.maxMs, r.baseMs * 2 ** attempt);
    const ra = res && res.headers ? Number(res.headers['retry-after']) : NaN;
    if (Number.isFinite(ra)) wait = Math.min(r.maxMs, Math.max(wait, ra * 1000));
    await sleep(wait);
  }
}

// YYYY-MM-DD and weekday in a named time zone (the daily/weekly schedule is in Asia/Kolkata; today() stays UTC for limits).
function zonedDate(d, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d || new Date());
  const g = (t) => (parts.find((x) => x.type === t) || {}).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, weekday: g('weekday') };
}

module.exports = { registerSecrets, redact, log, warn, ensureDir, readJson, writeJson, today, addDays, daysBetween, sha1, request, requestRetry, sleep, zonedDate };
