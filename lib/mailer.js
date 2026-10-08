// Sends the "new enquiry" notification email through the ZeptoMail HTTP API (HTTPS, port 443).
// SMTP is deliberately not used: DigitalOcean Droplets block outbound SMTP ports 25, 465 and 587,
// so nodemailer/SMTP can never connect from the production server. Configured entirely through
// environment variables (see README section 4): no credentials ever live in source control.
//
// Reliability rules:
//   * the HTTP request has a hard timeout, so a slow or unreachable mail service can never hold an
//     enquiry request open (a reverse proxy gives up after about 60 s and shows a 504);
//   * sendEnquiryEmail never throws and always resolves with { sent, reason };
//   * only short, credential-free details are logged (never the token, headers or request body).
// If the API token isn't configured (a fresh checkout, local dev), enquiries still save normally via
// lib/store.js; this just logs that no email was sent.
'use strict';
const http = require('http');
const https = require('https');
const { escapeHtml } = require('./http-utils');

const DEFAULT_TO = 'info@devmamflourishfoods.com';
const SENDER_NAME = 'Mamta Bhoj Website';
const DEFAULT_API_URL = 'https://api.zeptomail.com/v1.1/email';
const AUTH_PREFIX = 'Zoho-enczapikey';

// The ZeptoMail "Send Mail" token: ZEPTOMAIL_API_TOKEN, or the existing SMTP_PASSWORD value (the same
// token ZeptoMail issues for both SMTP and the API), so the production .env needs no change.
function apiToken() {
  return String(process.env.ZEPTOMAIL_API_TOKEN || process.env.SMTP_PASSWORD || '').trim();
}

function isConfigured() {
  return Boolean(apiToken());
}

const positive = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Hard cap (ms) for one API call. ZEPTOMAIL_TIMEOUT_MS, or the older SMTP_TIMEOUT_MS; default 10 s.
function timeoutMs() {
  return positive(process.env.ZEPTOMAIL_TIMEOUT_MS || process.env.SMTP_TIMEOUT_MS, 10000);
}

// ZEPTOMAIL_API_URL (optional) overrides the endpoint, e.g. https://api.zeptomail.in/v1.1/email for an
// account in ZeptoMail's India data centre. Plain http is accepted only for a loopback address (tests),
// so the token can never be sent unencrypted over a network.
function apiUrl() {
  let u;
  try { u = new URL(process.env.ZEPTOMAIL_API_URL || DEFAULT_API_URL); } catch (e) { return null; }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol === 'https:' || (u.protocol === 'http:' && loopback)) return u;
  return null;
}

// The sender must be an address on a domain verified in ZeptoMail. SMTP_FROM_EMAIL sets it; otherwise
// SMTP_USER is used when it is an email address, else the recipient (info@ on the same domain).
function fromAddress(to) {
  const looksLikeEmail = (v) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v || '');
  const explicit = (process.env.SMTP_FROM_EMAIL || '').trim();
  return looksLikeEmail(explicit) ? explicit : looksLikeEmail(process.env.SMTP_USER) ? process.env.SMTP_USER : looksLikeEmail(to) ? to : DEFAULT_TO;
}

function rows(enquiry) {
  const when = new Date(enquiry.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  return [
    ['Name', enquiry.name],
    ['Phone', enquiry.phone],
    ['Enquiry Type', enquiry.type],
    ['Product Interest', enquiry.productInterest || '—'],
    ['Estimated Monthly Requirement', enquiry.monthlyRequirement || '—'],
    ['City / State', enquiry.cityState || '—'],
    ['Message', enquiry.message || '—'],
    ['Submitted', `${when} IST`],
  ];
}

function formatEnquiryBody(enquiry) {
  return rows(enquiry).map(([k, v]) => `${k}: ${v}`).concat(['', 'Submitted via Mamta Bhoj website']).join('\n');
}

function formatEnquiryHtml(enquiry) {
  const body = rows(enquiry)
    .map(([k, v]) => `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(k)}</th><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<table style="font-family:Arial,sans-serif;font-size:14px">${body}</table><p style="font-family:Arial,sans-serif;font-size:12px;color:#666">Submitted via Mamta Bhoj website</p>`;
}

// Builds the ZeptoMail "Send Mail" request body.
function buildPayload(enquiry, to) {
  return {
    from: { address: fromAddress(to), name: SENDER_NAME },
    to: [{ email_address: { address: to, name: 'Mamta Bhoj Enquiries' } }],
    subject: `New Mamta Bhoj Enquiry — ${String(enquiry.type || '').replace(/[\r\n]+/g, ' ')}`,
    textbody: formatEnquiryBody(enquiry),
    htmlbody: formatEnquiryHtml(enquiry),
  };
}

// One HTTPS POST with a hard timeout. Resolves { status, body } (body parsed JSON or null) and rejects
// only on network-level problems or the timeout (err.code ETIMEDOUT).
function postJson(url, token, payload, ms) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const lib = url.protocol === 'https:' ? https : http;
    const auth = token.toLowerCase().startsWith(AUTH_PREFIX.toLowerCase()) ? token : `${AUTH_PREFIX} ${token}`;
    let settled = false;
    const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const req = lib.request(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': data.length, Authorization: auth },
    }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size < 65536) chunks.push(c); });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { body = null; }
        finish(resolve, { status: res.statusCode, body });
      });
      res.on('error', (e) => finish(reject, e));
    });
    // a single deadline covers connect, TLS, sending and receiving
    const timer = setTimeout(() => {
      const err = Object.assign(new Error(`email API request exceeded the ${ms} ms limit`), { code: 'ETIMEDOUT' });
      finish(reject, err); req.destroy();
    }, ms);
    req.on('error', (e) => finish(reject, e));
    req.end(data);
  });
}

// Short, safe text from a ZeptoMail error body: {"error":{"code":"...","message":"...","request_id":"..."}}.
function describeApiError(body, token) {
  const e = body && typeof body === 'object' ? body.error || body : {};
  const pick = (v) => String(v == null ? '' : v).split(token).join('[token]').replace(/[\r\n]+/g, ' ').slice(0, 200);
  return `apiCode=${pick(e.code) || '-'} apiMessage=${pick(e.message) || '-'} requestId=${pick(body && body.request_id || e.request_id) || '-'}`;
}

// Returns { sent: boolean, reason?: string, ms: number } and never throws, so a mail failure can never
// break the enquiry-submission flow that calls this.
// reason: not_configured | timeout | api_error | network_error.
async function sendEnquiryEmail(enquiry) {
  const started = Date.now();
  const tag = `[mailer] enquiry #${enquiry && enquiry.id}`;
  const token = apiToken();
  if (!token) {
    console.log('[mailer] ZeptoMail API token not configured — enquiry saved but no email sent. Set ZEPTOMAIL_API_TOKEN (or SMTP_PASSWORD) to enable.');
    return { sent: false, reason: 'not_configured', ms: 0 };
  }
  const url = apiUrl();
  if (!url) {
    console.error('[mailer] ZEPTOMAIL_API_URL is not a valid https URL — enquiry saved but no email sent.');
    return { sent: false, reason: 'not_configured', ms: 0 };
  }
  const to = process.env.ENQUIRY_TO_EMAIL || DEFAULT_TO;
  try {
    const res = await postJson(url, token, buildPayload(enquiry, to), timeoutMs());
    const ms = Date.now() - started;
    if (res.status >= 200 && res.status < 300) {
      console.log(`${tag} email accepted by ZeptoMail for ${to} in ${ms} ms (HTTP ${res.status})`);
      return { sent: true, ms };
    }
    console.error(`${tag} email FAILED after ${ms} ms (api_error): httpStatus=${res.status} ${describeApiError(res.body, token)}`);
    return { sent: false, reason: 'api_error', ms };
  } catch (err) {
    const ms = Date.now() - started;
    const timedOut = err && err.code === 'ETIMEDOUT' && /exceeded/.test(err.message || '');
    console.error(`${tag} email FAILED after ${ms} ms (${timedOut ? 'timeout' : 'network_error'}): code=${(err && err.code) || '-'} message=${String((err && err.message) || '').split(token).join('[token]').slice(0, 200)}`);
    return { sent: false, reason: timedOut ? 'timeout' : 'network_error', ms };
  }
}

module.exports = { sendEnquiryEmail, isConfigured, fromAddress, buildPayload };
