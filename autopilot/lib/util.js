'use strict';
// Small shared helpers: atomic JSON files, HTTP(S) client, date helpers, and a logger that can
// never print a secret value.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const SECRET_KEY_RE = /(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|REFRESH|AUTH|BEARER|PRIVATE)/i;
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

module.exports = { registerSecrets, redact, log, warn, ensureDir, readJson, writeJson, today, addDays, daysBetween, sha1, request };
