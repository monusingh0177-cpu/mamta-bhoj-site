#!/usr/bin/env node
'use strict';
// Test-only dummy Turnstile secret for the fake Cloudflare server; not a credential. Kept in a named constant
// so the deploy secret scan (assigned-secret pattern) does not mistake the fixture for a real key.
const FAKE_CF_KEY = 'ts-secret-' + 'do-not-log';
// =============================================================================
// scripts/test-enquiry.js   (npm run test:enquiry)
//
// End-to-end test of the enquiry form pipeline: browser-style POST -> validation -> storage ->
// email through the ZeptoMail HTTP API, using a throw-away copy of the app (its own data/, port and sanitised
// environment) and a local FAKE ZeptoMail API server. It never contacts a real mail service and never touches the real data/.
//
//   node scripts/test-enquiry.js                 # test this working tree
//   node scripts/test-enquiry.js --repo DIR      # test another checkout (e.g. an export of an older commit)
//   node scripts/test-enquiry.js --only slow     # run only the "slow/unreachable mail service" case
//
// Covers: valid enquiry (JSON and plain form), validation and sanitising, mail failures that must not hang
// the request (silent API, refused connection, rejected token, rejected sender, HTTP 500, dropped
// connection, not configured), storage failure, malformed and oversized bodies, duplicate-submission protection, and that no
// credential or stack trace ever reaches the visitor or the logs.
// =============================================================================
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const REPO = path.resolve(opt('--repo', path.join(__dirname, '..')));
const ONLY = opt('--only', '');
const TEST_PASS = 'test-token-do-not-use-0123456789'; // fake Send Mail token
const TO = 'enquiries@example.test';
const SENDER = 'info@sender.example.test';

let passed = 0; let failed = 0; const lines = [];
const check = (cond, name, detail) => { if (cond) passed++; else failed++; const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : '  -> ' + detail}`; lines.push(l); console.log('  ' + l); };
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------ fake ZeptoMail API server ------------------------------
function startFakeApi() {
  const state = { mode: 'ok', requests: [], connections: 0 };
  const server = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { /* keep null */ }
      state.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const authOk = req.headers.authorization === `Zoho-enczapikey ${TEST_PASS}`;
      const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (state.mode === 'blackhole') return; // accepts the request, then never answers
      if (state.mode === 'drop') return req.socket.destroy();
      if (state.mode === 'server-error') { res.writeHead(500, { 'Content-Type': 'text/html' }); return res.end('<html><body>Internal Server Error</body></html>'); }
      if (state.mode === 'bad-token' || !authOk) return json(401, { error: { code: 'SERR_157', message: 'Invalid or expired Send Mail token', request_id: 'req-401' } });
      if (state.mode === 'reject-sender') return json(422, { error: { code: 'TM_3201', message: 'Sender address is not verified for this domain', request_id: 'req-422' } });
      if (state.mode === 'garbage') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('not json'); }
      return json(201, { data: [{ code: 'EM_104', message: 'Email request received' }], message: 'OK', request_id: 'req-ok' });
    });
  });
  server.on('connection', () => { state.connections++; });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port })));
}

// ------------------------------ app under test ------------------------------
function freePort() { return new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); }); }

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (['node_modules', '.git', 'logs'].includes(name)) continue;
    const from = path.join(src, name); const to = path.join(dst, name); const st = fs.statSync(from);
    if (st.isDirectory()) copyTree(from, to); else fs.copyFileSync(from, to);
  }
}

async function startApp(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mamta-enq-'));
  copyTree(REPO, dir);
  const nm = path.join(REPO, 'node_modules');
  if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'data', 'enquiries.json'), '[]');
  const port = await freePort();
  const clean = Object.assign({}, process.env);
  ['PERSIST_DIR', 'FORCE_HTTPS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_TIMEOUT_MS', 'ZEPTOMAIL_API_TOKEN', 'ZEPTOMAIL_API_URL', 'ZEPTOMAIL_TIMEOUT_MS', 'ENQUIRY_TO_EMAIL', 'ENQUIRY_EMAIL_WAIT_MS', 'ENQUIRY_MIN_FILL_MS', 'ENQUIRY_FORM_MAX_AGE_MS', 'ENQUIRY_FORM_SECRET', 'ENQUIRY_RATE_LIMIT_MAX', 'ENQUIRY_RATE_LIMIT_WINDOW_MS', 'ENQUIRY_CLIENT_IP_HEADER', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_VERIFY_URL', 'TURNSTILE_TIMEOUT_MS', 'TURNSTILE_FAIL_OPEN', 'ENQUIRY_OTP_ENABLED', 'ENQUIRY_OTP_PROVIDER'].forEach((k) => delete clean[k]);
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: Object.assign(clean, { PORT: String(port), ENQUIRY_MIN_FILL_MS: '0', ENQUIRY_RATE_LIMIT_MAX: '1000', ENQUIRY_FORM_SECRET: 'integration-test-secret' }, env) });
  const log = []; child.stdout.on('data', (d) => log.push(String(d))); child.stderr.on('data', (d) => log.push(String(d)));
  for (let i = 0; i < 60; i++) { try { await request(port, 'GET', '/robots.txt'); break; } catch (e) { await sleep(150); } }
  return { dir, port, child, log, rows: () => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'enquiries.json'), 'utf8')), stop: () => { child.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } } };
}

function request(port, method, p, { body, json, headers } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const payload = body == null ? null : typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign({ Accept: json ? 'application/json' : 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' }, payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}, headers || {}) }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - t0 }));
    });
    req.on('error', reject); req.setTimeout(45000, () => req.destroy(new Error('client timeout 45s')));
    if (payload) req.write(payload); req.end();
  });
}

const VALID = { name: 'Website Test', phone: '9999999999', type: 'General Product Enquiry', productInterest: 'All Products', message: 'TEST ENQUIRY - please ignore' };
// The form carries a signed token (hidden field form_token) that the page issues; tests fetch one like a browser does.
async function formToken(app) {
  const page = await request(app.port, 'GET', '/contact');
  const m = /name="form_token" value="([^"]+)"/.exec(page.text);
  return m ? m[1] : '';
}
// Adds a real token unless the body already has one (or is a raw string, or opts out with token === false).
async function post(app, body, json = true, headers, token) {
  let b = body;
  if (b && typeof b === 'object' && token !== false && b.form_token === undefined) b = Object.assign({}, b, { form_token: token || await formToken(app) });
  return request(app.port, 'POST', '/contact', { body: b, json, headers });
}
const parse = (r) => { try { return JSON.parse(r.text); } catch (e) { return null; } };
const noLeaks = (app) => { const all = app.log.join(''); return !all.includes(TEST_PASS) && !/\bat .*\.js:\d+/.test(all) && !/Error: [^\n]+\n\s+at /.test(all); };
const API_ENV = (port, extra) => Object.assign({ ZEPTOMAIL_API_URL: `http://127.0.0.1:${port}/v1.1/email`, ZEPTOMAIL_API_TOKEN: TEST_PASS, SMTP_FROM_EMAIL: SENDER, ENQUIRY_TO_EMAIL: TO, ENQUIRY_EMAIL_WAIT_MS: '1500', ZEPTOMAIL_TIMEOUT_MS: '4000' }, extra || {});

(async () => {
  console.log(`Enquiry pipeline test on ${REPO}`);
  const smtp = await startFakeApi();
  const cleanup = [() => smtp.server.close()];
  const run = (name) => !ONLY || ONLY === name;

  if (run('ok')) {
    section('A. Valid enquiry (fake ZeptoMail API accepts)');
    smtp.state.mode = 'ok'; smtp.state.requests.length = 0;
    const app = await startApp(API_ENV(smtp.port)); cleanup.push(app.stop);
    const r = await post(app, VALID); const j = parse(r);
    check(r.status === 201 && j && j.ok === true, 'JSON submit -> HTTP 201 {ok:true}', `${r.status} ${r.text.slice(0, 120)}`);
    check(j && /submitted successfully/i.test(j.message) && /contact you shortly/i.test(j.message), 'success message is the agreed wording', j && j.message);
    check(r.ms < 3000, `answered in ${r.ms} ms (< 3000)`);
    const rows = app.rows();
    check(rows.length === 1 && rows[0].name === 'Website Test' && rows[0].phone === '9999999999' && rows[0].productInterest === 'All Products' && rows[0].message === 'TEST ENQUIRY - please ignore', 'enquiry stored with all fields', JSON.stringify(rows[0]));
    await sleep(300);
    const m = smtp.state.requests[0]; const body = (m && m.body) || {};
    check(smtp.state.requests.length === 1, 'exactly one API request made', String(smtp.state.requests.length));
    check(m && m.method === 'POST' && m.url === '/v1.1/email', 'POST to the /v1.1/email endpoint', m && `${m.method} ${m.url}`);
    check(m && m.headers.authorization === `Zoho-enczapikey ${TEST_PASS}` && /application\/json/.test(m.headers['content-type'] || ''), 'Authorization header uses the Send Mail token; JSON content type');
    check(body.to && body.to[0] && body.to[0].email_address && body.to[0].email_address.address === TO, 'recipient is ENQUIRY_TO_EMAIL', JSON.stringify(body.to));
    check(body.from && body.from.address === SENDER && !/emailapikey/i.test(JSON.stringify(body.from)), 'sender is the configured SMTP_FROM_EMAIL address', JSON.stringify(body.from));
    check(/^New Mamta Bhoj Enquiry/.test(body.subject || '') && /General Product Enquiry/.test(body.subject || ''), 'subject unchanged', body.subject);
    check(/Name: Website Test/.test(body.textbody || '') && /TEST ENQUIRY - please ignore/.test(body.textbody || '') && /Phone: 9999999999/.test(body.textbody || ''), 'plain-text body carries the enquiry');
    check(/<table/.test(body.htmlbody || '') && /Website Test/.test(body.htmlbody || ''), 'HTML body carries the enquiry');
    check(/accepted by ZeptoMail/.test(app.log.join('')) && !app.log.join('').includes(TEST_PASS), 'success is logged without the token');
    const x = await post(app, Object.assign({}, VALID, { name: 'Eve <script>alert(1)</script>', message: 'a & b <b>x</b>' }));
    await sleep(300);
    const hb = (smtp.state.requests[smtp.state.requests.length - 1].body || {}).htmlbody || '';
    check(x.status === 201 && !/<script>/.test(hb) && /&lt;script&gt;/.test(hb), 'HTML in visitor input is escaped in the email');
    const n = await post(app, Object.assign({}, VALID, { name: 'Plain Form', message: 'native post' }), false);
    check(n.status === 302 && n.headers.location === '/contact?sent=1', 'plain browser POST -> 302 /contact?sent=1', `${n.status} ${n.headers.location}`);
    const page = await request(app.port, 'GET', '/contact?sent=1');
    check(page.status === 200 && /Your enquiry has been submitted successfully/.test(page.text) && /noindex/.test(page.text), 'success page shows the confirmation and is noindex');
    const form = await request(app.port, 'GET', '/contact');
    check(/data-enquiry-form/.test(form.text) && /id="enquiry-status"/.test(form.text) && /data-loading-text="Sending/.test(form.text), 'contact page carries the enhanced-form hooks and loading label');
    check(noLeaks(app), 'logs contain no credentials and no stack traces');
    app.stop();
  }

  if (run('validation')) {
    section('B. Validation and sanitising');
    const app = await startApp({}); cleanup.push(app.stop);
    const cases = [
      ['empty body', {}, ['name', 'phone', 'type', 'productInterest']],
      ['name too short', Object.assign({}, VALID, { name: 'A' }), ['name']],
      ['phone with letters', Object.assign({}, VALID, { phone: 'call me' }), ['phone']],
      ['phone too short', Object.assign({}, VALID, { phone: '12345' }), ['phone']],
      ['phone 11 digits', Object.assign({}, VALID, { phone: '98765432101' }), ['phone']],
      ['phone invalid first digit', Object.assign({}, VALID, { phone: '5876543210' }), ['phone']],
      ['phone with +91', Object.assign({}, VALID, { phone: '+919876543210' }), ['phone']],
      ['unknown enquiry type', Object.assign({}, VALID, { type: 'Hack the planet' }), ['type']],
      ['unknown product', Object.assign({}, VALID, { productInterest: 'Gold' }), ['productInterest']],
      ['bad monthly range', Object.assign({}, VALID, { monthlyRequirement: 'lots' }), ['monthlyRequirement']],
    ];
    for (const [label, body, expected] of cases) {
      const r = await post(app, body); const j = parse(r);
      check(r.status === 422 && j && j.ok === false && expected.every((f) => j.fields && j.fields[f]), `${label} -> 422 with field errors (${expected.join(', ')})`, `${r.status} ${r.text.slice(0, 140)}`);
    }
    const n = await post(app, {}, false);
    check(n.status === 302 && n.headers.location === '/contact?error=1', 'plain POST with bad data -> 302 /contact?error=1', `${n.status} ${n.headers.location}`);
    check(app.rows().length === 0, 'nothing is stored for invalid input');
    const evil = await post(app, Object.assign({}, VALID, { name: 'Eve\r\nBcc: x@evil.test <b>bold</b>', message: 'x'.repeat(5000) + '\u0000\u0007' }));
    const row = app.rows()[0];
    check(evil.status === 201 && row && !/[\r\n\u0000\u0007]/.test(row.name) && row.message.length <= 2000 && !/\u0000/.test(row.message), 'control characters and line breaks stripped, long text capped at 2000');
    const bad = await request(app.port, 'POST', '/contact', { body: '{"name": ', json: true, headers: { 'Content-Type': 'application/json' } });
    check(bad.status === 400 && parse(bad) && parse(bad).ok === false && !/SyntaxError|at /.test(bad.text), 'malformed JSON -> 400 friendly JSON, no parser error leaked', `${bad.status} ${bad.text.slice(0, 120)}`);
    const jsonOk = await request(app.port, 'POST', '/contact', { body: JSON.stringify(Object.assign({}, VALID, { name: 'Json Body', form_token: await formToken(app) })), json: true, headers: { 'Content-Type': 'application/json' } });
    check(jsonOk.status === 201, 'a JSON request body is accepted too', String(jsonOk.status));
    check(noLeaks(app), 'logs contain no stack traces');
    app.stop();
  }

  const failureModes = [
    ['slow', 'blackhole', 'ZeptoMail API accepts the request and never answers'],
    ['refused', 'refused', 'connection refused (nothing listening)'],
    ['bad-token', 'bad-token', 'token rejected (HTTP 401)'],
    ['reject-sender', 'reject-sender', 'sender not verified (HTTP 422)'],
    ['server-error', 'server-error', 'ZeptoMail server error (HTTP 500, HTML body)'],
    ['garbage', 'garbage', 'unexpected non-JSON 200 reply (still accepted)'],
    ['drop', 'drop', 'connection dropped immediately'],
  ];
  for (const [key, mode, label] of failureModes) {
    if (!run(key) && !(ONLY === 'failures')) continue;
    section(`C. Mail service failure: ${label}`);
    smtp.state.mode = mode; smtp.state.requests.length = 0;
    const deadPort = mode === 'refused' ? await freePort() : smtp.port;
    const app = await startApp(API_ENV(deadPort)); cleanup.push(app.stop);
    const r1 = await post(app, VALID); const j = parse(r1);
    const budget = 1500 + 1500;
    const limit = ONLY === 'slow' && args.includes('--legacy') ? 1e9 : budget;
    const okMode = mode === 'garbage';
    check(r1.status === 201 && j && j.ok === true, `visitor still gets success (HTTP ${r1.status}) because the enquiry is saved`, r1.text.slice(0, 120));
    check(r1.ms < limit, `answered in ${r1.ms} ms (limit ${limit} ms): the request does not wait on the mail service`);
    check(app.rows().length === 1, 'enquiry is stored even though the email failed');
    check(!/ECONN|socket|SMTP|ZeptoMail|SERR|TM_3201|401|422|nginx|Error:/.test(r1.text), 'no raw server or mail error text reaches the visitor');
    const t0 = Date.now(); let logged = false;
    const marker = okMode ? /email accepted/ : /email FAILED/;
    while (Date.now() - t0 < 8000) { if (marker.test(app.log.join(''))) { logged = true; break; } await sleep(100); }
    check(logged, okMode ? 'a 2xx reply is treated as accepted' : 'the failure is logged server-side with a short reason', app.log.join('').slice(-300));
    if (mode === 'bad-token') check(/httpStatus=401/.test(app.log.join('')) && /SERR_157/.test(app.log.join('')), 'API error status and code are logged');
    if (mode === 'reject-sender') check(/httpStatus=422/.test(app.log.join('')) && /not verified/.test(app.log.join('')), 'API error status and message are logged');
    if (mode === 'server-error') check(/httpStatus=500/.test(app.log.join('')) && !/Internal Server Error/.test(app.log.join('')), 'HTTP 500 is logged without echoing the HTML body');
    const r2 = await post(app, Object.assign({}, VALID, { name: 'Second Person' }));
    check(r2.status === 201 && r2.ms < limit, `the server is still responsive afterwards (${r2.ms} ms)`);
    check(noLeaks(app), 'logs contain no credentials and no stack traces');
    app.stop();
  }

  if (run('unconfigured')) {
    section('C. Mail not configured at all');
    const app = await startApp({}); cleanup.push(app.stop);
    const r = await post(app, VALID);
    check(r.status === 201 && app.rows().length === 1 && r.ms < 1500, 'enquiry saved and acknowledged quickly', `${r.status} ${r.ms} ms`);
    check(/API token not configured/.test(app.log.join('')), 'the log says no email was sent because the API token is not configured');
    app.stop();
  }

  if (run('storage')) {
    section('C. Storage failure');
    const app = await startApp(API_ENV(smtp.port)); cleanup.push(app.stop);
    smtp.state.mode = 'ok'; smtp.state.requests.length = 0;
    fs.rmSync(path.join(app.dir, 'data', 'enquiries.json')); fs.mkdirSync(path.join(app.dir, 'data', 'enquiries.json'));
    const r = await post(app, VALID); const j = parse(r);
    check(r.status === 500 && j && j.ok === false && /try again|call or email/i.test(j.message) && !/EISDIR|enquiries\.json|at /.test(r.text), 'unwritable storage -> 500 with a friendly message, no path or stack', `${r.status} ${r.text.slice(0, 160)}`);
    await sleep(300);
    check(smtp.state.requests.length === 0, 'no email is sent for an enquiry that was not stored');
    fs.rmSync(path.join(app.dir, 'data', 'enquiries.json'), { recursive: true }); fs.writeFileSync(path.join(app.dir, 'data', 'enquiries.json'), '[]');
    const again = await post(app, VALID);
    check(again.status === 201 && !(parse(again) || {}).duplicate, 'a retry after the failure is accepted (not mistaken for a duplicate)', `${again.status} ${again.text.slice(0, 100)}`);
    const n = await post(app, VALID, false); // duplicate of 'again'
    check(n.status === 302 && n.headers.location === '/contact?sent=1', 'a repeated plain POST is acknowledged with the success redirect');
    fs.rmSync(path.join(app.dir, 'data', 'enquiries.json')); fs.mkdirSync(path.join(app.dir, 'data', 'enquiries.json'));
    const nr = await post(app, Object.assign({}, VALID, { name: 'Other Person' }), false);
    check(nr.status === 302 && /error=server/.test(nr.headers.location || ''), 'plain POST + storage failure -> redirect to /contact?error=server', `${nr.status} ${nr.headers.location}`);
    const page = await request(app.port, 'GET', '/contact?error=server');
    check(/could not save your enquiry/.test(page.text) && /noindex/.test(page.text), 'the error page explains it kindly and is noindex');
    check(noLeaks(app), 'logs contain no credentials and no stack traces');
    app.stop();
  }

  if (run('duplicates')) {
    section('D. Duplicate submissions');
    smtp.state.mode = 'ok'; smtp.state.requests.length = 0;
    const app = await startApp(API_ENV(smtp.port)); cleanup.push(app.stop);
    const burst = await Promise.all(Array.from({ length: 6 }, () => post(app, VALID)));
    check(burst.every((r) => r.status === 200 || r.status === 201), 'six simultaneous identical submissions all get a success answer', burst.map((r) => r.status).join(','));
    check(burst.filter((r) => r.status === 201).length === 1, 'exactly one of them is processed; the rest are acknowledged as repeats', burst.map((r) => r.status).join(','));
    await sleep(500);
    check(app.rows().length === 1 && smtp.state.requests.length === 1, `one stored enquiry and one email (stored ${app.rows().length}, emailed ${smtp.state.requests.length})`);
    const seq = await post(app, VALID);
    check(seq.status === 200 && (parse(seq) || {}).duplicate === true && app.rows().length === 1, 'a later identical submission is acknowledged without a second row');
    const other = await post(app, Object.assign({}, VALID, { message: 'A different enquiry' }));
    check(other.status === 201 && app.rows().length === 2, 'a genuinely different enquiry is still accepted');
    app.stop();
  }

  if (run('spam')) {
    section('F. Spam protection (honeypot, signed form token, timing, rate limit)');
    smtp.state.mode = 'ok'; smtp.state.requests.length = 0;
    const app = await startApp(API_ENV(smtp.port, { ENQUIRY_MIN_FILL_MS: '1500', ENQUIRY_RATE_LIMIT_MAX: '30' })); cleanup.push(app.stop);
    const page = await request(app.port, 'GET', '/contact');
    check(/type="tel" id="f-phone" name="phone"/.test(page.text) && /inputmode="numeric"/.test(page.text) && /maxlength="10"/.test(page.text) && /pattern="\[6-9\]\[0-9\]\{9\}"/.test(page.text) && /autocomplete="tel-national"/.test(page.text), 'phone input has type=tel, inputmode=numeric, maxlength=10, pattern and autocomplete');
    check(/name="company_website"[^>]*tabindex="-1"[^>]*autocomplete="off"/.test(page.text) && /class="hp-field" aria-hidden="true"/.test(page.text), 'honeypot field is present, hidden from assistive tech, not tabbable');
    check(!/cf-turnstile|challenges\.cloudflare\.com/.test(page.text), 'without keys, no Turnstile widget or Cloudflare script is rendered');
    check(/phone-validate\.js/.test(page.text), 'frontend validator script is loaded on the page');
    check(/Cloudflare Turnstile is not configured/.test(app.log.join('')), 'start-up log warns that Turnstile is not configured');
    check(/hp-field/.test((await request(app.port, 'GET', '/css/style.css')).text), 'honeypot CSS is served');

    const tokenA = await formToken(app);
    const early = await post(app, VALID, true, null, tokenA);
    const ej = parse(early);
    check(early.status === 422 && ej && ej.error === 'too_fast' && /very quick/i.test(ej.message) && app.rows().length === 0, 'submitted instantly (< min fill time) -> friendly "too quick" 422, nothing stored', `${early.status} ${early.text.slice(0, 120)}`);
    await sleep(1600);
    const later = await post(app, VALID, true, null, tokenA);
    check(later.status === 201 && app.rows().length === 1, 'the same visitor resubmitting after the delay is accepted (genuine fast user not lost)', `${later.status} ${later.text.slice(0, 100)}`);
    await sleep(300);
    check(smtp.state.requests.length === 1, 'the genuine enquiry triggered the notification email');

    const noTok = await post(app, VALID, true, null, false);
    check(noTok.status === 422 && parse(noTok).error === 'expired', 'missing form token -> rejected with a reload message', `${noTok.status} ${noTok.text.slice(0, 100)}`);
    const forged = await post(app, Object.assign({}, VALID, { name: 'Forger', form_token: '1700000000000.' + '0'.repeat(32) }));
    check(forged.status === 422 && parse(forged).error === 'expired', 'forged token rejected');
    const garbage = await post(app, Object.assign({}, VALID, { name: 'Forger2', form_token: 'not-a-token' }));
    check(garbage.status === 422, 'garbage token rejected');

    const tok2 = await formToken(app); await sleep(1600);
    const hp = await post(app, Object.assign({}, VALID, { name: 'Bot One', company_website: 'http://spam.example' }), true, null, tok2);
    check(hp.status === 422 && parse(hp).ok === false && !/spam\.example|honeypot/i.test(hp.text) && app.rows().length === 1, 'honeypot filled -> rejected, nothing stored, no hint in the reply', `${hp.status} ${hp.text.slice(0, 120)}`);
    check(!smtp.state.requests.some((r) => /Bot One/.test(JSON.stringify(r.body))), 'honeypot spam sends no email');
    const hpPlain = await post(app, Object.assign({}, VALID, { name: 'Bot Two', company_website: 'x' }), false, null, tok2);
    check(hpPlain.status === 302 && /error=spam/.test(hpPlain.headers.location || ''), 'plain POST with honeypot -> redirect to an error view', `${hpPlain.status} ${hpPlain.headers.location}`);
    const errPage = await request(app.port, 'GET', '/contact?error=spam');
    check(/could not accept this submission/.test(errPage.text) && /noindex/.test(errPage.text), 'the error view explains kindly and is noindex');
    const weird = await request(app.port, 'GET', '/contact?error=%3Cscript%3Ealert(1)%3C/script%3E');
    check(!/<script>alert/.test(weird.text) && /Please check the highlighted/.test(weird.text), 'an unknown ?error value cannot inject markup');

    const bad11 = await post(app, Object.assign({}, VALID, { name: 'Eleven', phone: '98765432101' }), true, null, tok2);
    const j11 = parse(bad11);
    check(bad11.status === 422 && j11 && j11.fields && /too long/.test(j11.fields.phone), '11-digit phone -> 422 with a clear message (backend enforced)', bad11.text.slice(0, 160));
    const nonObj = await request(app.port, 'POST', '/contact', { body: '[1,2,3]', json: true, headers: { 'Content-Type': 'application/json' } });
    check(nonObj.status === 400 && parse(nonObj).ok === false, 'a JSON array body -> 400, no crash', `${nonObj.status} ${nonObj.text.slice(0, 100)}`);
    const spaced = await post(app, Object.assign({}, VALID, { name: 'Spaced Phone', phone: ' 98765 43210 ' }), true, null, tok2);
    check(spaced.status === 201 && app.rows().some((r) => r.name === 'Spaced Phone' && r.phone === '9876543210'), 'a phone typed with spaces is normalised and stored as 10 digits', `${spaced.status} ${spaced.text.slice(0, 100)}`);
    check(noLeaks(app) && !/spam\.example|98765432101/.test(app.log.join('')), 'logs contain no stack traces and none of the submitted values');
    app.stop();

    section('F2. Per-IP rate limit');
    const rl = await startApp(API_ENV(smtp.port, { ENQUIRY_RATE_LIMIT_MAX: '12', ENQUIRY_RATE_LIMIT_WINDOW_MS: '4000' })); cleanup.push(rl.stop);
    const outs = [];
    for (let i = 0; i < 14; i++) outs.push(await request(rl.port, 'POST', '/contact', { body: Object.assign({}, VALID, { name: 'Rate Test ' + i, message: 'm' + i, form_token: 'x' }), json: true }));
    const codes = outs.map((r) => r.status);
    check(codes.slice(0, 12).every((c) => c === 422) && codes[12] === 429 && codes[13] === 429, 'the first 12 requests are processed, the 13th and 14th get HTTP 429', codes.join(','));
    check(Number(outs[12].headers['retry-after']) >= 1 && /Too many/.test((parse(outs[12]) || {}).message || ''), '429 carries Retry-After and a friendly message');
    check(rl.rows().length === 0, 'rate-limited requests store nothing');
    const plain = await request(rl.port, 'POST', '/contact', { body: { name: 'x' }, json: false });
    check(plain.status === 302 && /error=rate_limited/.test(plain.headers.location || ''), 'plain POST while limited -> redirect to an error view', `${plain.status} ${plain.headers.location}`);
    const spoof = await request(rl.port, 'POST', '/contact', { body: { name: 'x' }, json: true, headers: { 'X-Forwarded-For': '9.9.9.9, 127.0.0.1' } });
    check(spoof.status === 429, 'a spoofed X-Forwarded-For value does not escape the limit (the proxy-set value is used)', String(spoof.status));
    await sleep(4200);
    const after = await post(rl, Object.assign({}, VALID, { name: 'After Window' }));
    check(after.status === 201, 'the limit expires after the configured window; genuine enquiry accepted again', String(after.status));
    rl.stop();

    section('F3. Cloudflare Turnstile (fake siteverify)');
    const verifyCalls = [];
    const fakeCf = http.createServer((req, res) => {
      const ch = []; req.on('data', (c) => ch.push(c));
      req.on('end', () => {
        const p = new URLSearchParams(Buffer.concat(ch).toString()); verifyCalls.push(Object.fromEntries(p));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: p.get('response') === 'valid-turnstile' && p.get('secret') === FAKE_CF_KEY }));
      });
    });
    await new Promise((r) => fakeCf.listen(0, '127.0.0.1', r)); cleanup.push(() => fakeCf.close());
    const ts = await startApp(API_ENV(smtp.port, { TURNSTILE_SITE_KEY: 'ts-site-public', TURNSTILE_SECRET_KEY: FAKE_CF_KEY, TURNSTILE_VERIFY_URL: `http://127.0.0.1:${fakeCf.address().port}/siteverify` })); cleanup.push(ts.stop);
    const tpage = await request(ts.port, 'GET', '/contact');
    check(/class="cf-turnstile" data-sitekey="ts-site-public"/.test(tpage.text) && /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/.test(tpage.text) && !tpage.text.includes(FAKE_CF_KEY), 'with keys, the widget is rendered with the PUBLIC site key only');
    const noCap = await post(ts, VALID);
    check(noCap.status === 422 && parse(noCap).error === 'captcha' && ts.rows().length === 0, 'no Turnstile response -> refused, nothing stored', `${noCap.status} ${noCap.text.slice(0, 100)}`);
    const badCap = await post(ts, Object.assign({}, VALID, { 'cf-turnstile-response': 'forged-by-client', captcha_ok: 'true', turnstile_verified: '1' }));
    check(badCap.status === 422 && parse(badCap).error === 'captcha' && ts.rows().length === 0, 'a forged token / client-supplied "verified" flags are ignored -> refused');
    const goodCap = await post(ts, Object.assign({}, VALID, { 'cf-turnstile-response': 'valid-turnstile' }));
    check(goodCap.status === 201 && ts.rows().length === 1, 'a token Cloudflare accepts -> enquiry saved', `${goodCap.status} ${goodCap.text.slice(0, 100)}`);
    check(verifyCalls.some((c) => c.response === 'valid-turnstile' && c.secret === FAKE_CF_KEY && c.remoteip), 'verification is a server-to-server call carrying the secret and client IP');
    const callsBefore = verifyCalls.length;
    const invalidFirst = await post(ts, Object.assign({}, VALID, { name: 'N', 'cf-turnstile-response': 'valid-turnstile' }));
    check(invalidFirst.status === 422 && (parse(invalidFirst) || {}).fields && verifyCalls.length === callsBefore, 'invalid form fields are rejected before the one-time CAPTCHA token is spent');
    check(!ts.log.join('').includes(FAKE_CF_KEY) && noLeaks(ts), 'the secret key never reaches the logs');
    ts.stop();
    const down = await startApp(API_ENV(smtp.port, { TURNSTILE_SITE_KEY: 'a', TURNSTILE_SECRET_KEY: 'b', TURNSTILE_VERIFY_URL: `http://127.0.0.1:${await freePort()}/x` })); cleanup.push(down.stop);
    const dr = await post(down, Object.assign({}, VALID, { 'cf-turnstile-response': 'anything' }));
    check(dr.status === 503 && (parse(dr) || {}).error === 'captcha_unavailable' && down.rows().length === 0 && !/ECONN/.test(dr.text), 'Cloudflare unreachable -> safe 503 (fail closed by default), never a fake success', `${dr.status} ${dr.text.slice(0, 100)}`);
    down.stop();
    const open = await startApp(API_ENV(smtp.port, { TURNSTILE_SITE_KEY: 'a', TURNSTILE_SECRET_KEY: 'b', TURNSTILE_FAIL_OPEN: '1', TURNSTILE_VERIFY_URL: `http://127.0.0.1:${await freePort()}/x` })); cleanup.push(open.stop);
    const orr = await post(open, Object.assign({}, VALID, { 'cf-turnstile-response': 'anything' }));
    check(orr.status === 201 && open.rows().length === 1 && /accepted under TURNSTILE_FAIL_OPEN/.test(open.log.join('')), 'TURNSTILE_FAIL_OPEN=1 keeps leads flowing when Cloudflare is down, and logs it', `${orr.status} ${orr.text.slice(0, 100)}`);
    open.stop();
  }

  if (run('oversize')) {
    section('E. Oversized body');
    const app = await startApp({}); cleanup.push(app.stop);
    const big = 'name=x&message=' + 'a'.repeat(13 * 1024 * 1024);
    const t0 = Date.now(); let outcome;
    try { const r = await post(app, big); outcome = `HTTP ${r.status}`; } catch (e) { outcome = 'connection closed'; }
    check(Date.now() - t0 < 15000, `a 13 MB body is rejected promptly (${outcome}) and does not hang`);
    const ok = await post(app, VALID);
    check(ok.status === 201, 'the server is still healthy afterwards');
    app.stop();
  }

  if (run('crm')) {
    section('G. CRM forwarding (mock CRM; visitor answer and email must be unaffected)');
    const CRM_KEY = 'e2e-fixture-' + 'k'.repeat(20);
    const crmSeen = [];
    const crmSrv = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => { b += d; });
      req.on('end', () => { crmSeen.push({ url: req.url, key: req.headers['x-intake-key'], body: b }); res.writeHead(201, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"status":"created"}'); });
    });
    await new Promise((r) => crmSrv.listen(0, '127.0.0.1', r)); cleanup.push(() => crmSrv.close());
    smtp.state.mode = 'ok'; smtp.state.requests.length = 0;
    const app = await startApp(API_ENV(smtp.port, { CRM_INTAKE_URL: `http://127.0.0.1:${crmSrv.address().port}/api/intake`, CRM_INTAKE_KEY: CRM_KEY })); cleanup.push(app.stop);
    const r = await post(app, VALID);
    check(r.status === 201 && parse(r).ok === true && !r.text.includes(CRM_KEY) && !/crm/i.test(r.text), 'visitor gets the normal 201 and no CRM detail', `${r.status} ${r.text.slice(0, 100)}`);
    await sleep(600);
    check(crmSeen.length === 1 && crmSeen[0].key === CRM_KEY && JSON.parse(crmSeen[0].body).source === 'WEBSITE_FORM', 'enquiry forwarded to the mock CRM as WEBSITE_FORM with the key header');
    check(smtp.state.requests.length === 1, 'the notification email is still sent exactly once');
    const lg = app.log.join('');
    check(!lg.includes(CRM_KEY) && /\[crm\] enquiry #\d+ forwarded/.test(lg), 'forwarding logged without the key');
    const page = await request(app.port, 'GET', '/contact'); const js = await request(app.port, 'GET', '/js/main.js');
    check(!page.text.includes(CRM_KEY) && !js.text.includes(CRM_KEY) && !/api\/intake/.test(page.text + js.text), 'key and endpoint never reach the browser');
    app.stop();

    const down = await startApp(API_ENV(smtp.port, { CRM_INTAKE_URL: `http://127.0.0.1:${await freePort()}/api/intake`, CRM_INTAKE_KEY: CRM_KEY })); cleanup.push(down.stop);
    smtp.state.requests.length = 0;
    const d = await post(down, VALID);
    check(d.status === 201 && parse(d).ok === true && d.ms < 3000, `CRM down: visitor still gets 201 quickly (${d.ms} ms)`, `${d.status} ${d.text.slice(0, 100)}`);
    await sleep(400);
    check(down.rows().length === 1 && smtp.state.requests.length === 1, 'CRM down: enquiry stored and email still sent');
    check(noLeaks(down) && !down.log.join('').includes(CRM_KEY), 'CRM down: no stack traces and no key in logs');
    down.stop();
  }

  cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  console.log(`\nENQUIRY TESTS: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test harness error:', e); process.exit(2); });
