'use strict';
// Validation, sanitising and duplicate protection for the contact / enquiry form.
// Kept free of any I/O so it is easy to test; routes/public.js does the storing and emailing.
const crypto = require('crypto');

const ENQUIRY_TYPES = ['Dealership', 'Distributorship', 'Wholesale / Bulk Purchase', 'Retailer', 'Institutional / HoReCa', 'General Product Enquiry'];
const MONTHLY_REQUIREMENTS = ['Less than 100 kg', '100–500 kg', '500 kg–1 Ton', '1–5 Tons', '5+ Tons'];
const ALL_PRODUCTS = 'All Products';

const LIMITS = { name: 100, phone: 10, email: 254, cityState: 120, message: 2000 };
const MAX_LINKS_IN_MESSAGE = 2;

// Shown to visitors (never raw server or proxy errors).
const MESSAGES = {
  success: 'Thank you! Your enquiry has been submitted successfully. We will contact you shortly.',
  invalid: 'Please check the highlighted details and try again.',
  server: 'Sorry, we could not save your enquiry just now. Please try again in a minute, or call or email us using the details on this page.',
  tooLarge: 'Your message is too large to send. Please shorten it and try again.',
  spam: 'We could not accept this submission. Please call or email us using the details on this page.',
  rateLimited: 'Too many enquiries from your connection. Please wait a few minutes and try again, or call or email us.',
  expired: 'This form has expired or could not be verified. Please reload the page and send your enquiry again.',
  tooFast: 'That was very quick. Please check your details and press Send Enquiry again in a few seconds.',
  captcha: 'Please complete the security check and send your enquiry again.',
  captchaDown: 'We could not complete the security check just now. Please try again in a minute, or call or email us.',
};

// Indian mobile number: exactly 10 digits, first digit 6-9. Whitespace and hyphens typed between digits
// are removed; nothing else is rewritten, and a wrong-length value is never cut down to fit.
const PHONE_RE = /^[6-9][0-9]{9}$/;
function normalizePhone(value) {
  return String(value == null ? '' : value).trim().replace(/[\s\-]+/g, '');
}
// Returns '' when valid, otherwise a user-facing message.
function phoneError(value) {
  const p = normalizePhone(value);
  if (!p) return 'Please enter your 10-digit mobile number.';
  if (!/^[0-9]+$/.test(p)) return 'Please enter digits only (no letters, spaces or +91).';
  if (p.length < 10) return 'That number is too short. Please enter all 10 digits.';
  if (p.length > 10) return 'That number is too long. Please enter exactly 10 digits, without +91 or 0.';
  if (!PHONE_RE.test(p)) return 'An Indian mobile number must start with 6, 7, 8 or 9.';
  return '';
}

// Optional email: pragmatic format check (one @, no spaces, dotted domain). Returns '' when valid or blank.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
function emailError(value) {
  if (!value) return '';
  if (value.length > LIMITS.email || !EMAIL_RE.test(value) || value.includes('..')) return 'Please enter a valid email address, or leave it blank.';
  return '';
}

// Plain text only: drop control characters (including line breaks inside single-line fields),
// collapse runs of whitespace, trim, and cap the length. HTML is never interpreted: pages and the
// email escape on output.
const CONTROL_ALL = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]+', 'g');
const CONTROL_KEEP_NEWLINE = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f\\u2028\\u2029]', 'g');

function cleanLine(value, max) {
  return String(value == null ? '' : value)
    .replace(CONTROL_ALL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_KEEP_NEWLINE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

// Returns { ok: true, data } or { ok: false, fields: { name: 'message', ... } }.
function validateEnquiry(body, productNames) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};
  const data = {
    name: cleanLine(b.name, LIMITS.name),
    phone: normalizePhone(typeof b.phone === 'string' || typeof b.phone === 'number' ? b.phone : ''),
    email: typeof b.email === 'string' ? b.email.trim() : '',
    type: cleanLine(b.type, 60),
    productInterest: cleanLine(b.productInterest, 80),
    monthlyRequirement: cleanLine(b.monthlyRequirement, 40),
    cityState: cleanLine(b.cityState, LIMITS.cityState),
    message: cleanText(b.message, LIMITS.message),
  };

  if (data.name.length < 2 || !/[A-Za-zऀ-ॿ]/.test(data.name)) fields.name = 'Please enter your name.';
  const pe = phoneError(data.phone);
  if (pe) fields.phone = pe;
  const ee = emailError(data.email);
  if (ee) fields.email = ee;
  if (!data.type) fields.type = 'Please choose an enquiry type.';
  else if (!ENQUIRY_TYPES.includes(data.type)) fields.type = 'Please choose one of the listed enquiry types.';
  const allowedProducts = (productNames || []).concat([ALL_PRODUCTS]);
  if (!data.productInterest) fields.productInterest = 'Please choose a product.';
  else if (!allowedProducts.includes(data.productInterest)) fields.productInterest = 'Please choose one of the listed products.';
  if (data.monthlyRequirement && !MONTHLY_REQUIREMENTS.includes(data.monthlyRequirement)) fields.monthlyRequirement = 'Please choose one of the listed ranges.';

  if ((data.message.match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS_IN_MESSAGE) fields.message = 'Please remove web links from your message.';

  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, data };
}

// The same enquiry submitted again within a short window (double click, impatient retry after a
// slow page, browser re-POST) is acknowledged but not stored or emailed a second time.
// In memory and per process: it only has to cover the seconds right after a submission.
const DEDUPE_WINDOW_MS = 120000;
const recent = new Map();

function fingerprint(data) {
  return crypto.createHash('sha1').update([data.name, data.phone, data.type, data.productInterest, data.message].join('|').toLowerCase()).digest('hex');
}

// true if this enquiry is a repeat of one accepted in the last two minutes; otherwise remembers it.
function isRecentDuplicate(data, now) {
  const t = now || Date.now();
  for (const [k, at] of recent) if (t - at > DEDUPE_WINDOW_MS) recent.delete(k);
  const key = fingerprint(data);
  if (recent.has(key)) return true;
  recent.set(key, t);
  return false;
}

// Forget a fingerprint (used when storing failed, so the visitor's retry is not mistaken for a duplicate).
function forget(data) {
  recent.delete(fingerprint(data));
}

module.exports = { emailError, ENQUIRY_TYPES, MONTHLY_REQUIREMENTS, ALL_PRODUCTS, LIMITS, MESSAGES, validateEnquiry, normalizePhone, phoneError, PHONE_RE, isRecentDuplicate, forget, cleanLine, cleanText };
