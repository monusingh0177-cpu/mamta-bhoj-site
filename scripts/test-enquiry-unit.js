#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-enquiry-unit.js   (npm run test:enquiry-unit)
//
// Fast unit tests with no server and no network:
//   A. BACKEND phone/field validation   (lib/enquiry.js)
//   B. FRONTEND phone validation        (public/js/phone-validate.js), tested on its own, separately from the backend
//   C. Spam guard primitives            (lib/spam-guard.js): form token, honeypot, rate limit, client IP, Turnstile
// The HTTP-level behaviour is covered by scripts/test-enquiry.js.
// =============================================================================
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');

let passed = 0; let failed = 0;
const check = (cond, name, detail) => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : '  -> ' + detail}`); };
const section = (t) => console.log(`\n== ${t}`);

const enquiry = require(path.join(ROOT, 'lib', 'enquiry.js'));
const phoneFe = require(path.join(ROOT, 'public', 'js', 'phone-validate.js'));
const guard = require(path.join(ROOT, 'lib', 'spam-guard.js'));

const PRODUCTS = ['Chakki Atta', 'Maida'];
const BASE = { name: 'Asha Verma', phone: '9876543210', type: 'Retailer', productInterest: 'Maida' };
const run = (over) => enquiry.validateEnquiry(Object.assign({}, BASE, over), PRODUCTS);

// Shared cases: both implementations must agree on every one of them.
const PHONE_CASES = [
  // [input, valid?]
  ['9876543210', true], ['6000000000', true], ['7123456789', true], ['8999999999', true],
  ['  9876543210  ', true], ['98765 43210', true], ['98765-43210', true],
  ['98765432101', false], // 11 digits
  ['987654321', false], // 9 digits
  ['', false], ['   ', false],
  ['5876543210', false], ['0987654321', false], ['1234567890', false], // invalid first digit
  ['98765abcde', false], ['abcdefghij', false], ['9876 5432 1O', false],
  ['+919876543210', false], ['919876543210', false], ['(98765)43210', false],
  ['98765.43210', false], ['９８７６５４３２１０', false], // full-width digits are not ASCII digits
  ['9876543210\n9876543210', false], ['<script>', false],
];

section('A. Backend phone validation (lib/enquiry.js)');
for (const [input, valid] of PHONE_CASES) {
  const r = run({ phone: input });
  check(r.ok === valid, `backend ${valid ? 'accepts' : 'rejects'} ${JSON.stringify(input)}`, JSON.stringify(r));
  if (valid) check(r.data.phone === input.replace(/[\s-]+/g, ''), `  stored normalised as ${r.data.phone}`);
  else check(r.fields.phone && r.fields.phone.length > 5, '  clear message returned', JSON.stringify(r.fields));
}
section('A2. Optional email validation');
for (const [e, ok] of [['', true], ['a@example.com', true], ['  first.last+tag@sub.example.co.in ', true], ['nope', false], ['a@b', false], ['a b@c.com', false], ['a@c..com', false], ['@c.com', false], ['a@c.com\nBcc: x@y.com', false]]) {
  const r = enquiry.validateEnquiry({ name: 'Test Name', phone: '9876543210', type: 'Retailer', productInterest: 'All Products', email: e }, []);
  check(r.ok === ok, 'email ' + JSON.stringify(e) + (ok ? ' accepted' : ' rejected'), JSON.stringify(r));
  if (ok) check(r.data.email === e.trim(), '  stored trimmed');
}
check(enquiry.PHONE_RE.source === '^[6-9][0-9]{9}$', 'regex is exactly ^[6-9][0-9]{9}$', enquiry.PHONE_RE.source);
check(!run({ phone: '98765432101' }).ok, 'an 11-digit number is never truncated to 10 and accepted');
check(!run({ phone: ['9876543210'] }).ok && !run({ phone: { a: 1 } }).ok && !run({ phone: null }).ok, 'array / object / null phone values are rejected');

section('A2. Backend field validation');
check(run({}).ok, 'a complete valid enquiry passes');
check(run({ type: 'Hack' }).fields.type, 'unknown enquiry type rejected');
check(run({ type: '' }).fields.type, 'missing enquiry type rejected');
check(run({ productInterest: 'Gold' }).fields.productInterest, 'unknown product rejected');
check(run({ productInterest: 'All Products' }).ok, '"All Products" accepted');
check(run({ name: 'A' }).fields.name && run({ name: '12345' }).fields.name, 'name must be 2+ chars with a letter');
check(run({ name: 'आशा वर्मा' }).ok, 'Devanagari names are accepted');
check(run({ monthlyRequirement: 'lots' }).fields.monthlyRequirement, 'bad monthly range rejected');
check(run({ monthlyRequirement: '', cityState: '', message: '' }).ok, 'optional fields stay optional');
check(run({ message: 'see http://a.example http://b.example http://c.example' }).fields.message, 'message stuffed with links rejected');
check(run({ message: 'Please call. Our site is www.example.com' }).ok, 'a message with one link is accepted');
const big = run({ name: 'N'.repeat(500), message: 'm'.repeat(9000), cityState: 'c'.repeat(900) });
check(big.ok && big.data.name.length === 100 && big.data.message.length === 2000 && big.data.cityState.length === 120, 'long free-text fields are capped (100 / 2000 / 120)');
check(!/[\r\n\u0000]/.test(run({ name: 'Eve\r\nBcc: x' }).data.name), 'control characters / line breaks stripped from single-line fields');
check(!enquiry.validateEnquiry(null, PRODUCTS).ok && !enquiry.validateEnquiry('x', PRODUCTS).ok, 'null / non-object bodies are rejected, not thrown');

section('B. Frontend phone validation (public/js/phone-validate.js)');
for (const [input, valid] of PHONE_CASES) {
  check((phoneFe.error(input) === '') === valid, `frontend ${valid ? 'accepts' : 'rejects'} ${JSON.stringify(input)}`, phoneFe.error(input));
}
check(phoneFe.PHONE_RE.source === '^[6-9][0-9]{9}$', 'frontend regex is exactly ^[6-9][0-9]{9}$');
check(PHONE_CASES.every(([i]) => (phoneFe.error(i) === '') === (enquiry.phoneError(i) === '')), 'frontend and backend agree on every case');
check(/10-digit/.test(phoneFe.error('')) && /too short/.test(phoneFe.error('12345')) && /too long/.test(phoneFe.error('98765432101')) && /start with 6, 7, 8 or 9/.test(phoneFe.error('5876543210')) && /digits only/.test(phoneFe.error('abc')), 'messages are specific and friendly');
check(phoneFe.fromPaste('+91 98765 43210') === '9876543210' && phoneFe.fromPaste('098765 43210') === '9876543210', 'pasting +91 / 0 prefixed numbers yields the visible 10-digit number');
check(phoneFe.error(phoneFe.fromPaste('98765432101')) !== '', 'a pasted 11-digit number is still rejected');
check(phoneFe.fromPaste('12345678901234') === '12345678901234', 'fromPaste never cuts an over-long value down');

section('C. Spam guard primitives (lib/spam-guard.js)');
process.env.ENQUIRY_FORM_SECRET = 'unit-test-secret';
process.env.ENQUIRY_MIN_FILL_MS = '3000';
const now = 1900000000000;
const tok = guard.issueFormToken(now);
check(guard.checkFormToken(tok, now + 5000).ok, 'a token older than the minimum fill time is accepted');
check(guard.checkFormToken(tok, now + 500).reason === 'too_fast', 'a token used within 3 s is "too_fast"');
check(guard.checkFormToken(tok, now + 25 * 3600 * 1000).reason === 'expired', 'a token older than 24 h is expired');
check(guard.checkFormToken('', now).reason === 'missing' && guard.checkFormToken(undefined, now).reason === 'missing', 'missing token reported');
check(guard.checkFormToken('garbage', now).reason === 'invalid', 'malformed token is invalid');
check(guard.checkFormToken(String(now - 100000) + '.' + tok.split('.')[1], now + 9000).reason === 'invalid', 'a forged timestamp with a stolen signature is invalid');
check(guard.checkFormToken(String(now + 99999999) + '.' + '0'.repeat(32), now).reason === 'invalid', 'a made-up signature is invalid');
process.env.ENQUIRY_MIN_FILL_MS = '0';
check(guard.checkFormToken(tok, now).ok, 'ENQUIRY_MIN_FILL_MS=0 disables the minimum-time check (token still required)');
check(guard.honeypotTripped({ company_website: 'http://spam.example' }) && guard.honeypotTripped({ company_website: ['x'] }), 'honeypot: filled field is detected');
check(!guard.honeypotTripped({ company_website: '' }) && !guard.honeypotTripped({ company_website: '   ' }) && !guard.honeypotTripped({}) && !guard.honeypotTripped(null), 'honeypot: empty / absent field is fine');

process.env.ENQUIRY_RATE_LIMIT_MAX = '3';
process.env.ENQUIRY_RATE_LIMIT_WINDOW_MS = '60000';
guard.resetRateLimit();
const r = [guard.rateLimit('1.1.1.1', 1000), guard.rateLimit('1.1.1.1', 2000), guard.rateLimit('1.1.1.1', 3000), guard.rateLimit('1.1.1.1', 4000)];
check(!r[0].limited && !r[1].limited && !r[2].limited && r[3].limited, 'rate limit: 3 allowed, the 4th is limited');
check(r[3].retryAfterSec >= 1 && r[3].retryAfterSec <= 60, `retry-after is sensible (${r[3].retryAfterSec} s)`);
check(!guard.rateLimit('2.2.2.2', 4000).limited, 'another address is unaffected');
check(!guard.rateLimit('1.1.1.1', 1000 + 60001).limited, 'the limit expires after the window');
check(guard.config().rateMax === 3 && guard.config().rateWindowMs === 60000, 'limits come from the environment');

const fake = (peer, headers) => ({ socket: { remoteAddress: peer }, headers: headers || {} });
check(guard.clientIp(fake('203.0.113.9', { 'x-forwarded-for': '6.6.6.6' })) === '203.0.113.9', 'a direct visitor cannot spoof X-Forwarded-For');
check(guard.clientIp(fake('127.0.0.1', { 'x-forwarded-for': '6.6.6.6, 198.51.100.7' })) === '198.51.100.7', 'behind the local proxy the proxy-appended (right-most) address is used');
check(guard.clientIp(fake('::ffff:127.0.0.1', {})) === '127.0.0.1', 'IPv4-mapped loopback is normalised');
process.env.ENQUIRY_CLIENT_IP_HEADER = 'cf-connecting-ip';
check(guard.clientIp(fake('127.0.0.1', { 'cf-connecting-ip': '198.51.100.20' })) === '198.51.100.20', 'ENQUIRY_CLIENT_IP_HEADER selects another header (trusted proxy only)');
delete process.env.ENQUIRY_CLIENT_IP_HEADER;

(async () => {
  // Turnstile against a local fake siteverify endpoint
  const seen = [];
  const srv = http.createServer((req, res) => {
    const ch = []; req.on('data', (c) => ch.push(c));
    req.on('end', () => {
      const p = new URLSearchParams(Buffer.concat(ch).toString());
      seen.push(Object.fromEntries(p));
      if (p.get('response') === 'hang') return;
      if (p.get('response') === 'junk') { res.writeHead(200); return res.end('not json'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: p.get('response') === 'good-token' && p.get('secret') === 'sec-key' }));
    });
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${srv.address().port}/siteverify`;
  const origWarn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.join(' '));

  delete process.env.TURNSTILE_SITE_KEY; delete process.env.TURNSTILE_SECRET_KEY;
  check(!guard.turnstileEnabled(), 'Turnstile off when no keys are set');
  guard.logConfigWarnings();
  check(warns.some((w) => /Turnstile is not configured/.test(w) && /OFF/.test(w)), 'a clear warning is logged when Turnstile is not configured');
  const skipped = await guard.verifyTurnstile(undefined, '1.1.1.1');
  check(skipped.ok && skipped.skipped, 'unconfigured Turnstile is reported as skipped, never as "verified"');
  warns.length = 0; process.env.TURNSTILE_SITE_KEY = 'site-key';
  guard.logConfigWarnings();
  check(!guard.turnstileEnabled() && warns.some((w) => /only one of/.test(w)), 'only one key set -> disabled, with a warning');

  process.env.TURNSTILE_SECRET_KEY = 'sec-key'; process.env.TURNSTILE_VERIFY_URL = url; process.env.TURNSTILE_TIMEOUT_MS = '400';
  check(guard.turnstileEnabled(), 'both keys set -> enabled');
  check((await guard.verifyTurnstile('good-token', '1.2.3.4')).ok, 'valid token accepted by Cloudflare is accepted');
  check(seen[0] && seen[0].secret === 'sec-key' && seen[0].remoteip === '1.2.3.4', 'secret key and client IP are sent server-to-server');
  check((await guard.verifyTurnstile('bad-token', '1.2.3.4')).reason === 'failed', 'token Cloudflare rejects is refused');
  check((await guard.verifyTurnstile('', '1.2.3.4')).reason === 'missing' && (await guard.verifyTurnstile(undefined)).reason === 'missing', 'missing token is refused');
  check((await guard.verifyTurnstile('junk')).reason === 'unavailable', 'garbage verdict is "unavailable", never success');
  check((await guard.verifyTurnstile('hang')).reason === 'unavailable', 'a hanging verification times out as "unavailable"');
  process.env.TURNSTILE_FAIL_OPEN = '1';
  const open = await guard.verifyTurnstile('junk');
  check(open.ok && open.degraded, 'TURNSTILE_FAIL_OPEN=1 lets leads through when Cloudflare is down (flagged degraded)');
  check((await guard.verifyTurnstile('bad-token')).reason === 'failed', '...but a token Cloudflare actually rejects is still refused');
  const logged = warns.join('\n');
  check(!/sec-key|site-key/.test(logged), 'no key appears in warnings');

  console.warn = origWarn; srv.close();
  console.log(`\nENQUIRY UNIT TESTS: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
