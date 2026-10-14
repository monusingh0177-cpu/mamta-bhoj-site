'use strict';
// Anti-spam checks for the enquiry form. No I/O except the optional Cloudflare Turnstile call.
// Everything is decided on the server: nothing the browser says about itself is trusted.
//   * honeypot field      - a field real visitors never see; bots fill it
//   * signed form token   - proves when the form was served (HMAC), so "too fast" cannot be faked
//   * per-IP rate limit   - in memory, configurable, entries expire
//   * Turnstile           - optional, verified server-side with the secret key
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const HONEYPOT_FIELD = 'company_website';
const TOKEN_FIELD = 'form_token';
const TURNSTILE_FIELD = 'cf-turnstile-response';

function intEnv(name, dflt, min) {
  const raw = process.env[name];
  if (raw == null || raw === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n >= (min == null ? 0 : min) ? Math.floor(n) : dflt;
}

// Read at call time so tests (and a restart with new variables) see current values.
function config() {
  return {
    minFillMs: intEnv('ENQUIRY_MIN_FILL_MS', 3000),
    maxFormAgeMs: intEnv('ENQUIRY_FORM_MAX_AGE_MS', 24 * 3600 * 1000, 1),
    rateMax: intEnv('ENQUIRY_RATE_LIMIT_MAX', 8, 1),
    rateWindowMs: intEnv('ENQUIRY_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, 1000),
    ipHeader: String(process.env.ENQUIRY_CLIENT_IP_HEADER || '').trim().toLowerCase(),
    turnstileSite: String(process.env.TURNSTILE_SITE_KEY || '').trim(),
    turnstileSecret: String(process.env.TURNSTILE_SECRET_KEY || '').trim(),
    turnstileUrl: String(process.env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify'),
    turnstileTimeoutMs: intEnv('TURNSTILE_TIMEOUT_MS', 5000, 100),
    turnstileFailOpen: process.env.TURNSTILE_FAIL_OPEN === '1',
  };
}

function turnstileEnabled() {
  const c = config();
  return Boolean(c.turnstileSite && c.turnstileSecret);
}

// Logged once at start-up. Never prints a key.
function logConfigWarnings() {
  const c = config();
  if (!!c.turnstileSite !== !!c.turnstileSecret) {
    console.warn('[enquiry] WARNING: only one of TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY is set; Turnstile is DISABLED until both are set.');
  } else if (!turnstileEnabled()) {
    console.warn('[enquiry] WARNING: Cloudflare Turnstile is not configured (TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY); CAPTCHA verification is OFF. Honeypot, timing, rate limit and validation remain active.');
  }
  if (!process.env.ENQUIRY_FORM_SECRET) {
    console.warn('[enquiry] NOTE: ENQUIRY_FORM_SECRET is not set; a random per-process secret is used, so a form opened before a restart must be reloaded before sending.');
  }
  if (/^(1|true|yes)$/i.test(String(process.env.ENQUIRY_OTP_ENABLED || '')) && !String(process.env.ENQUIRY_OTP_PROVIDER || '').trim()) {
    console.warn('[enquiry] WARNING: ENQUIRY_OTP_ENABLED is set but no ENQUIRY_OTP_PROVIDER is configured; OTP verification is NOT enforced.');
  }
}

// ---------------------------------------------------------------- client IP
function isPrivatePeer(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  return a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^f[cd]/i.test(a);
}

// Forwarding headers are honoured ONLY when the TCP peer is a local/private proxy (nginx on the same
// host); a visitor connecting directly cannot spoof their address. Uses the right-most
// X-Forwarded-For entry (the one the trusted proxy appended) unless ENQUIRY_CLIENT_IP_HEADER names another header.
function clientIp(req) {
  const peer = (req.socket && req.socket.remoteAddress) || '';
  let ip = peer;
  if (isPrivatePeer(peer)) {
    const name = config().ipHeader || 'x-forwarded-for';
    const raw = String(req.headers[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const pick = name === 'x-forwarded-for' ? raw[raw.length - 1] : raw[0];
    if (pick && pick.length <= 64) ip = pick;
  }
  return String(ip).replace(/^::ffff:/, '') || 'unknown';
}

// ---------------------------------------------------------------- rate limit
const hits = new Map(); // ip -> number[] of timestamps
const MAX_TRACKED = 10000;

// Counts this attempt. Returns { limited, retryAfterSec }.
function rateLimit(ip, now) {
  const t = now || Date.now();
  const { rateMax, rateWindowMs } = config();
  if (hits.size > MAX_TRACKED) {
    for (const [k, arr] of hits) if (!arr.length || t - arr[arr.length - 1] > rateWindowMs) hits.delete(k);
    if (hits.size > MAX_TRACKED) hits.clear();
  }
  const arr = (hits.get(ip) || []).filter((x) => t - x < rateWindowMs);
  if (arr.length >= rateMax) {
    hits.set(ip, arr);
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((arr[0] + rateWindowMs - t) / 1000)) };
  }
  arr.push(t);
  hits.set(ip, arr);
  return { limited: false, retryAfterSec: 0 };
}

function resetRateLimit() { hits.clear(); }

// ---------------------------------------------------------------- signed form token
let randomSecret = null;
function secret() {
  const s = process.env.ENQUIRY_FORM_SECRET;
  if (s) return s;
  if (!randomSecret) randomSecret = crypto.randomBytes(32).toString('hex');
  return randomSecret;
}

function sign(ts) { return crypto.createHmac('sha256', secret()).update('enquiry-form|' + ts).digest('hex').slice(0, 32); }

function issueFormToken(now) {
  const ts = String(now || Date.now());
  return ts + '.' + sign(ts);
}

// Returns { ok: true } or { ok: false, reason: 'missing' | 'invalid' | 'expired' | 'too_fast' }.
function checkFormToken(token, now) {
  const t = now || Date.now();
  if (!token) return { ok: false, reason: 'missing' };
  const m = /^(\d{10,15})\.([0-9a-f]{32})$/.exec(String(Array.isArray(token) ? token[0] : token));
  if (!m) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(sign(m[1]));
  const given = Buffer.from(m[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, reason: 'invalid' };
  const age = t - Number(m[1]);
  const c = config();
  if (age < 0) return { ok: false, reason: 'invalid' };
  if (age > c.maxFormAgeMs) return { ok: false, reason: 'expired' };
  if (age < c.minFillMs) return { ok: false, reason: 'too_fast' };
  return { ok: true };
}

function honeypotTripped(body) {
  const v = body && body[HONEYPOT_FIELD];
  return v != null && String(Array.isArray(v) ? v.join('') : v).trim() !== '';
}

// ---------------------------------------------------------------- Turnstile
// Resolves { ok: true } | { ok: false, reason: 'missing' | 'failed' | 'unavailable' }.
// Only enforced when both keys are configured. The client's token is just input to Cloudflare's verdict.
function verifyTurnstile(token, ip) {
  const c = config();
  if (!turnstileEnabled()) return Promise.resolve({ ok: true, skipped: true });
  const t = Array.isArray(token) ? token[0] : token;
  if (!t || typeof t !== 'string' || t.length > 4096) return Promise.resolve({ ok: false, reason: 'missing' });
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    let url;
    try { url = new URL(c.turnstileUrl); } catch (e) { return finish({ ok: false, reason: 'unavailable' }); }
    const payload = new URLSearchParams({ secret: c.turnstileSecret, response: t });
    if (ip && ip !== 'unknown') payload.set('remoteip', ip);
    const data = payload.toString();
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request({
      hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (d) => { size += d.length; if (size < 65536) chunks.push(d); });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { /* unavailable */ }
        if (!j || typeof j.success !== 'boolean') return finish({ ok: false, reason: 'unavailable' });
        return finish(j.success ? { ok: true } : { ok: false, reason: 'failed' });
      });
    });
    req.setTimeout(c.turnstileTimeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', () => finish({ ok: false, reason: 'unavailable' }));
    req.write(data); req.end();
  }).then((r) => (!r.ok && r.reason === 'unavailable' && c.turnstileFailOpen ? { ok: true, degraded: true } : r));
}

module.exports = {
  HONEYPOT_FIELD, TOKEN_FIELD, TURNSTILE_FIELD,
  config, turnstileEnabled, logConfigWarnings, clientIp, rateLimit, resetRateLimit,
  issueFormToken, checkFormToken, honeypotTripped, verifyTurnstile,
};
