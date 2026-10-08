// Sends the "new enquiry" notification email through the business's SMTP service
// (ZeptoMail SMTP in production). Configured entirely through environment variables
// (see render.yaml and README section 9): no credentials ever live in source control.
//
// Reliability rules:
//   * every network step has a short timeout and the whole send has a hard cap, so a slow or
//     unreachable mail service can never hold an HTTP request open (it used to: nodemailer's
//     defaults allow 2 minutes to connect, 30 s for the greeting and 10 minutes of silence, while a
//     reverse proxy gives up after about 60 s, which the visitor sees as "504 Gateway Time-out");
//   * sendEnquiryEmail never throws and always resolves with { sent, reason };
//   * only short, credential-free error details are logged.
// If SMTP isn't configured (a fresh checkout, local dev), enquiries still save normally via
// lib/store.js; this just logs that no email was sent.
'use strict';
const nodemailer = require('nodemailer');
const { escapeHtml } = require('./http-utils');

const DEFAULT_TO = 'info@devmamflourishfoods.com';
const SENDER_NAME = 'Mamta Bhoj Website';

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

const positive = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// SMTP_TIMEOUT_MS (optional) is the hard cap for one send; the per-step timeouts never exceed it.
function timeouts() {
  const overall = positive(process.env.SMTP_TIMEOUT_MS, 15000);
  return {
    overall,
    connectionTimeout: Math.min(8000, overall),
    greetingTimeout: Math.min(8000, overall),
    socketTimeout: Math.min(12000, overall),
    dnsTimeout: Math.min(5000, overall),
  };
}

// SMTP_SECURE=1/true forces TLS-on-connect, 0/false forces STARTTLS; when it is unset the common
// convention applies (port 465 = TLS-on-connect, anything else = STARTTLS). Speaking plain SMTP to a
// TLS-on-connect port is a classic way to hang until the greeting timeout.
function useSecure(port) {
  const v = String(process.env.SMTP_SECURE || '').toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return port === 465;
}

let cachedTransporter = null;
function getTransporter() {
  if (!cachedTransporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const t = timeouts();
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: useSecure(port),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: t.connectionTimeout,
      greetingTimeout: t.greetingTimeout,
      socketTimeout: t.socketTimeout,
      dnsTimeout: t.dnsTimeout,
    });
  }
  return cachedTransporter;
}

// ZeptoMail's SMTP user name is a fixed token name (not an email address), and its sender must be an
// address on a verified domain. SMTP_FROM_EMAIL (optional) sets the sender; otherwise SMTP_USER is used
// when it is an email address, else the business enquiry address (info@ on the same domain).
function fromAddress(to) {
  const looksLikeEmail = (v) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v || '');
  const explicit = (process.env.SMTP_FROM_EMAIL || '').trim();
  const addr = looksLikeEmail(explicit) ? explicit : looksLikeEmail(process.env.SMTP_USER) ? process.env.SMTP_USER : looksLikeEmail(to) ? to : DEFAULT_TO;
  return `"${SENDER_NAME}" <${addr}>`;
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

function withTimeout(promise, ms) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`email send exceeded the ${ms} ms limit`), { code: 'EOVERALLTIMEOUT' })), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// Returns { sent: boolean, reason?: string, ms: number } and never throws, so a mail failure can never
// break the enquiry-submission flow that calls this. reason: not_configured | timeout | send_failed.
async function sendEnquiryEmail(enquiry) {
  const started = Date.now();
  const tag = `[mailer] enquiry #${enquiry && enquiry.id}`;
  if (!isConfigured()) {
    console.log('[mailer] SMTP not configured — enquiry saved but no email sent. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD to enable.');
    return { sent: false, reason: 'not_configured', ms: 0 };
  }
  const to = process.env.ENQUIRY_TO_EMAIL || DEFAULT_TO;
  try {
    const transporter = getTransporter();
    await withTimeout(
      transporter.sendMail({
        from: fromAddress(to),
        to,
        subject: `New Mamta Bhoj Enquiry — ${String(enquiry.type || '').replace(/[\r\n]+/g, ' ')}`,
        text: formatEnquiryBody(enquiry),
        html: formatEnquiryHtml(enquiry),
      }),
      timeouts().overall
    );
    const ms = Date.now() - started;
    console.log(`${tag} email accepted by the SMTP service for ${to} in ${ms} ms`);
    return { sent: true, ms };
  } catch (err) {
    const ms = Date.now() - started;
    const timedOut = err && (err.code === 'EOVERALLTIMEOUT' || err.code === 'ETIMEDOUT' || /timed? ?out|never received/i.test(err.message || ''));
    // Only short, credential-free details are logged: never the full error object or the SMTP settings.
    console.error(`${tag} email FAILED after ${ms} ms (${timedOut ? 'timeout' : 'error'}): code=${err.code || '-'} responseCode=${err.responseCode || '-'} command=${err.command || '-'} message=${String(err.message || '').slice(0, 200)}`);
    return { sent: false, reason: timedOut ? 'timeout' : 'send_failed', ms };
  }
}

module.exports = { sendEnquiryEmail, isConfigured, fromAddress, useSecure };
