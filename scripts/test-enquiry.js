#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-enquiry.js   (npm run test:enquiry)
//
// End-to-end test of the enquiry form pipeline: browser-style POST -> validation -> storage ->
// SMTP email, using a throw-away copy of the app (its own data/, port and sanitised environment) and a
// local FAKE SMTP server. It never contacts a real mail service and never touches the real data/.
//
//   node scripts/test-enquiry.js                 # test this working tree
//   node scripts/test-enquiry.js --repo DIR      # test another checkout (e.g. an export of an older commit)
//   node scripts/test-enquiry.js --only slow     # run only the "slow/unreachable mail service" case
//
// Covers: valid enquiry (JSON and plain form), validation and sanitising, mail failures that must not hang
// the request (silent server, refused connection, bad login, rejected sender, dropped connection, not
// configured), storage failure, malformed and oversized bodies, duplicate-submission protection, and that no
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
const TEST_USER = 'emailapikey';
const TEST_PASS = 'test-token-do-not-use-0123456789';
const TO = 'enquiries@example.test';

let passed = 0; let failed = 0; const lines = [];
const check = (cond, name, detail) => { if (cond) passed++; else failed++; const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : '  -> ' + detail}`; lines.push(l); console.log('  ' + l); };
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------ fake SMTP server ------------------------------
function startFakeSmtp() {
  const state = { mode: 'ok', messages: [], logins: [], connections: 0 };
  const server = net.createServer((sock) => {
    state.connections++;
    sock.setEncoding('utf8');
    if (state.mode === 'blackhole') return; // accepts the TCP connection, then never says a word
    if (state.mode === 'drop') return sock.destroy();
    let buf = ''; let data = null; let envelope = {}; let authStep = null;
    const send = (s) => sock.write(s + '\r\n');
    const greet = () => send('220 fake.smtp.test ESMTP ready');
    if (state.mode === 'slow-greeting') setTimeout(greet, 30000); else greet();
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      buf += chunk;
      for (;;) {
        if (data !== null) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end === -1) { data += buf; buf = ''; return; }
          data += buf.slice(0, end); buf = buf.slice(end + 5);
          state.messages.push({ envelope, raw: data, user: envelope.user });
          data = null; send('250 2.0.0 queued'); continue;
        }
        const nl = buf.indexOf('\r\n'); if (nl === -1) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const cmd = line.toUpperCase();
        if (authStep === 'user') { envelope.user = Buffer.from(line, 'base64').toString(); authStep = 'pass'; send('334 UGFzc3dvcmQ6'); continue; }
        if (authStep === 'pass') { const pass = Buffer.from(line, 'base64').toString(); authStep = null; finishAuth(envelope.user, pass); continue; }
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) { send('250-fake.smtp.test'); send('250-AUTH PLAIN LOGIN'); send('250 8BITMIME'); }
        else if (cmd.startsWith('AUTH PLAIN')) { const p = Buffer.from(line.slice(11).trim(), 'base64').toString().split('\0'); envelope.user = p[1]; finishAuth(p[1], p[2]); }
        else if (cmd === 'AUTH LOGIN') { authStep = 'user'; send('334 VXNlcm5hbWU6'); }
        else if (cmd.startsWith('MAIL FROM')) { envelope.from = line.slice(10); if (state.mode === 'reject-sender') send('550 5.7.1 Sender address is not verified for this account'); else send('250 ok'); }
        else if (cmd.startsWith('RCPT TO')) { envelope.to = line.slice(8); send('250 ok'); }
        else if (cmd === 'DATA') { data = ''; send('354 end with <CRLF>.<CRLF>'); }
        else if (cmd === 'QUIT') { send('221 bye'); sock.end(); }
        else if (cmd === 'RSET' || cmd === 'NOOP') send('250 ok');
        else send('502 not implemented');
      }
    });
    function finishAuth(user, pass) {
      state.logins.push({ user, passOk: pass === TEST_PASS });
      if (state.mode === 'authfail' || user !== TEST_USER || pass !== TEST_PASS) send('535 5.7.8 Authentication credentials invalid');
      else send('235 2.7.0 Authentication successful');
    }
  });
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

// Decode quoted-printable / base64 MIME parts so assertions can look at the readable text.
function decodeBodies(raw) {
  const out = [raw];
  for (const part of raw.split(/\r?\n\r?\n/).slice(1)) {
    const b64 = part.split(/\r?\n--/)[0].replace(/\s+/g, '');
    if (/^[A-Za-z0-9+\/]+=*$/.test(b64) && b64.length % 4 === 0) out.push(Buffer.from(b64, 'base64').toString('utf8'));
  }
  out.push(raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  return out.join('\n');
}

async function startApp(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mamta-enq-'));
  copyTree(REPO, dir);
  const nm = path.join(REPO, 'node_modules');
  if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'data', 'enquiries.json'), '[]');
  const port = await freePort();
  const clean = Object.assign({}, process.env);
  ['PERSIST_DIR', 'FORCE_HTTPS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_TIMEOUT_MS', 'ENQUIRY_TO_EMAIL', 'ENQUIRY_EMAIL_WAIT_MS'].forEach((k) => delete clean[k]);
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: Object.assign(clean, { PORT: String(port) }, env) });
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
const post = (app, body, json = true, headers) => request(app.port, 'POST', '/contact', { body, json, headers });
const parse = (r) => { try { return JSON.parse(r.text); } catch (e) { return null; } };
const noLeaks = (app) => { const all = app.log.join(''); return !all.includes(TEST_PASS) && !/\bat .*\.js:\d+/.test(all) && !/Error: [^\n]+\n\s+at /.test(all); };
const SMTP_ENV = (port, extra) => Object.assign({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_USER: TEST_USER, SMTP_PASSWORD: TEST_PASS, ENQUIRY_TO_EMAIL: TO, ENQUIRY_EMAIL_WAIT_MS: '1500', SMTP_TIMEOUT_MS: '4000' }, extra || {});

(async () => {
  console.log(`Enquiry pipeline test on ${REPO}`);
  const smtp = await startFakeSmtp();
  const cleanup = [() => smtp.server.close()];
  const run = (name) => !ONLY || ONLY === name;

  if (run('ok')) {
    section('A. Valid enquiry (fake SMTP accepts)');
    smtp.state.mode = 'ok'; smtp.state.messages.length = 0;
    const app = await startApp(SMTP_ENV(smtp.port)); cleanup.push(app.stop);
    const r = await post(app, VALID); const j = parse(r);
    check(r.status === 201 && j && j.ok === true, 'JSON submit -> HTTP 201 {ok:true}', `${r.status} ${r.text.slice(0, 120)}`);
    check(j && /submitted successfully/i.test(j.message) && /contact you shortly/i.test(j.message), 'success message is the agreed wording', j && j.message);
    check(r.ms < 3000, `answered in ${r.ms} ms (< 3000)`);
    const rows = app.rows();
    check(rows.length === 1 && rows[0].name === 'Website Test' && rows[0].phone === '9999999999' && rows[0].productInterest === 'All Products' && rows[0].message === 'TEST ENQUIRY - please ignore', 'enquiry stored with all fields', JSON.stringify(rows[0]));
    await sleep(300);
    const m = smtp.state.messages[0];
    check(smtp.state.messages.length === 1, 'exactly one email handed to the SMTP service', String(smtp.state.messages.length));
    check(m && smtp.state.logins.every((l) => l.user === TEST_USER && l.passOk), 'SMTP authentication used the configured user and password');
    check(m && new RegExp(`<${TO}>`).test(m.envelope.to), 'recipient is ENQUIRY_TO_EMAIL', m && m.envelope.to);
    check(m && new RegExp(`<${TO}>`).test(m.envelope.from) && !/emailapikey/i.test(m.envelope.from), 'sender is a real address (not the SMTP login name)', m && m.envelope.from);
    check(m && /Subject: .*(New Mamta Bhoj Enquiry|=\?UTF-8\?)/.test(m.raw) && /text\/html/.test(m.raw) && /text\/plain/.test(m.raw) && /Website Test/.test(decodeBodies(m.raw)) && /TEST ENQUIRY - please ignore/.test(decodeBodies(m.raw)), 'subject, text and HTML bodies carry the enquiry');
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
    const jsonOk = await request(app.port, 'POST', '/contact', { body: JSON.stringify(Object.assign({}, VALID, { name: 'Json Body' })), json: true, headers: { 'Content-Type': 'application/json' } });
    check(jsonOk.status === 201, 'a JSON request body is accepted too', String(jsonOk.status));
    check(noLeaks(app), 'logs contain no stack traces');
    app.stop();
  }

  const failureModes = [
    ['slow', 'blackhole', 'mail server accepts the connection and never answers'],
    ['refused', 'refused', 'connection refused (nothing listening)'],
    ['authfail', 'authfail', 'wrong SMTP login (535)'],
    ['reject-sender', 'reject-sender', 'sender not verified (550)'],
    ['drop', 'drop', 'connection dropped immediately'],
    ['slow-greeting', 'slow-greeting', 'greeting arrives after 30 s'],
  ];
  for (const [key, mode, label] of failureModes) {
    if (!run(key) && !(ONLY === 'failures')) continue;
    if (!ONLY && key === 'slow-greeting') continue; // covered by the silent-server case; run with --only slow-greeting
    section(`C. Mail service failure: ${label}`);
    smtp.state.mode = mode; smtp.state.messages.length = 0;
    const deadPort = mode === 'refused' ? await freePort() : smtp.port;
    const app = await startApp(SMTP_ENV(deadPort)); cleanup.push(app.stop);
    const r1 = await post(app, VALID); const j = parse(r1);
    const budget = 1500 + 1500;
    const limit = ONLY === 'slow' && args.includes('--legacy') ? 1e9 : budget;
    check(r1.status === 201 && j && j.ok === true, `visitor still gets success (HTTP ${r1.status}) because the enquiry is saved`, r1.text.slice(0, 120));
    check(r1.ms < limit, `answered in ${r1.ms} ms (limit ${limit} ms): the request does not wait on the mail service`);
    check(app.rows().length === 1, 'enquiry is stored even though the email failed');
    check(!/ECONN|socket|SMTP|535|550|nginx|Error:/.test(r1.text), 'no raw server or mail error text reaches the visitor');
    const t0 = Date.now(); let logged = false;
    while (Date.now() - t0 < 8000) { if (/email FAILED/.test(app.log.join(''))) { logged = true; break; } await sleep(100); }
    check(logged, 'the failure is logged server-side with a short reason', app.log.join('').slice(-300));
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
    check(/SMTP not configured/.test(app.log.join('')), 'the log says no email was sent because SMTP is not configured');
    app.stop();
  }

  if (run('storage')) {
    section('C. Storage failure');
    const app = await startApp(SMTP_ENV(smtp.port)); cleanup.push(app.stop);
    smtp.state.mode = 'ok'; smtp.state.messages.length = 0;
    fs.rmSync(path.join(app.dir, 'data', 'enquiries.json')); fs.mkdirSync(path.join(app.dir, 'data', 'enquiries.json'));
    const r = await post(app, VALID); const j = parse(r);
    check(r.status === 500 && j && j.ok === false && /try again|call or email/i.test(j.message) && !/EISDIR|enquiries\.json|at /.test(r.text), 'unwritable storage -> 500 with a friendly message, no path or stack', `${r.status} ${r.text.slice(0, 160)}`);
    await sleep(300);
    check(smtp.state.messages.length === 0, 'no email is sent for an enquiry that was not stored');
    fs.rmSync(path.join(app.dir, 'data', 'enquiries.json'), { recursive: true }); fs.writeFileSync(path.join(app.dir, 'data', 'enquiries.json'), '[]');
    const again = await post(app, VALID);
    check(again.status === 201 && !(parse(again) || {}).duplicate, 'a retry after the failure is accepted (not mistaken for a duplicate)', `${again.status} ${again.text.slice(0, 100)}`);
    const n = await post(app, VALID, false); // duplicate of 'again'
    check(n.status === 302, 'plain POST path still redirects');
    const dirOnly = fs.rmSync(path.join(app.dir, 'data', 'enquiries.json')) || fs.mkdirSync(path.join(app.dir, 'data', 'enquiries.json'));
    void dirOnly;
    const nr = await post(app, Object.assign({}, VALID, { name: 'Other Person' }), false);
    check(nr.status === 302 && /error=server/.test(nr.headers.location || ''), 'plain POST + storage failure -> redirect to /contact?error=server', `${nr.status} ${nr.headers.location}`);
    const page = await request(app.port, 'GET', '/contact?error=server');
    check(/could not save your enquiry/.test(page.text) && /noindex/.test(page.text), 'the error page explains it kindly and is noindex');
    check(noLeaks(app), 'logs contain no credentials and no stack traces');
    app.stop();
  }

  if (run('duplicates')) {
    section('D. Duplicate submissions');
    smtp.state.mode = 'ok'; smtp.state.messages.length = 0;
    const app = await startApp(SMTP_ENV(smtp.port)); cleanup.push(app.stop);
    const burst = await Promise.all(Array.from({ length: 6 }, () => post(app, VALID)));
    check(burst.every((r) => r.status === 200 || r.status === 201), 'six simultaneous identical submissions all get a success answer', burst.map((r) => r.status).join(','));
    check(burst.filter((r) => r.status === 201).length === 1, 'exactly one of them is processed; the rest are acknowledged as repeats', burst.map((r) => r.status).join(','));
    await sleep(500);
    check(app.rows().length === 1 && smtp.state.messages.length === 1, `one stored enquiry and one email (stored ${app.rows().length}, emailed ${smtp.state.messages.length})`);
    const seq = await post(app, VALID);
    check(seq.status === 200 && (parse(seq) || {}).duplicate === true && app.rows().length === 1, 'a later identical submission is acknowledged without a second row');
    const other = await post(app, Object.assign({}, VALID, { message: 'A different enquiry' }));
    check(other.status === 201 && app.rows().length === 2, 'a genuinely different enquiry is still accepted');
    app.stop();
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

  cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  console.log(`\nENQUIRY TESTS: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test harness error:', e); process.exit(2); });
