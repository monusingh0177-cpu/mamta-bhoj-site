// Sends the "new enquiry" notification email. Configured entirely through
// environment variables (see render.yaml) — no credentials ever live in
// source control. If SMTP isn't configured (e.g. a fresh checkout, or local
// dev without the env vars set), enquiries still save normally via
// lib/store.js; this just logs that no email was sent, rather than
// throwing and breaking the visitor's form submission.
'use strict';
const nodemailer = require('nodemailer');

const DEFAULT_TO = 'info@devmamflourishfoods.com';

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

let cachedTransporter = null;
function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return cachedTransporter;
}

function formatEnquiryBody(enquiry) {
  const when = new Date(enquiry.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  return [
    `Name: ${enquiry.name}`,
    `Phone: ${enquiry.phone}`,
    `Enquiry Type: ${enquiry.type}`,
    `Product Interest: ${enquiry.productInterest || '—'}`,
    `Estimated Monthly Requirement: ${enquiry.monthlyRequirement || '—'}`,
    `City / State: ${enquiry.cityState || '—'}`,
    `Message: ${enquiry.message || '—'}`,
    `Submitted: ${when} IST`,
    '',
    'Submitted via Mamta Bhoj website',
  ].join('\n');
}

// Returns { sent: boolean, reason?: string } — never throws, so a mail
// failure can never break the enquiry-submission flow that calls this.
async function sendEnquiryEmail(enquiry) {
  if (!isConfigured()) {
    console.log('[mailer] SMTP not configured — enquiry saved but no email sent. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD to enable.');
    return { sent: false, reason: 'not_configured' };
  }
  const to = process.env.ENQUIRY_TO_EMAIL || DEFAULT_TO;
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: `New Mamta Bhoj Enquiry — ${enquiry.type}`,
      text: formatEnquiryBody(enquiry),
    });
    console.log(`[mailer] enquiry email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    // Only the short error message is logged — never the full error object
    // or credentials, which could otherwise leak SMTP auth details.
    console.error(`[mailer] enquiry email failed: ${err.message}`);
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = { sendEnquiryEmail, isConfigured };
