#!/usr/bin/env node
'use strict';
// npm run test:crm-forward
// Tests lib/crm-forward.js against a LOCAL mock CRM (http on 127.0.0.1) and injected fetch stubs.
// Nothing here contacts the real CRM or any buyer. The key below is a test fixture, not a credential.
const path = require('path');
const http = require('http');
const fs = require('fs');
const crm = require(path.join(__dirname, '..', 'lib', 'crm-forward.js'));

let passed = 0; let failed = 0;
const check = (c, n, d) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${c || !d ? '' : '  -> ' + d}`); };
const section = (t) => console.log(`\n== ${t}`);
const KEY = 'test-fixture-' + 'k'.repeat(20);
const ENQ = { id: 7, name: 'Test Buyer', phone: '9876543210', type: 'Wholesale / Bulk Purchase', productInterest: 'Maida', monthlyRequirement: '1–5 Tons', cityState: 'Kanpur, Uttar Pradesh', message: 'TEST - do not call', read: false, createdAt: 'x' };
const silent = () => { const l = { lines: [], log: (m) => l.lines.push(m), error: (m) => l.lines.push(m), warn: (m) => l.lines.push(m) }; return l; };
const noSleep = () => { const s = { calls: [], fn: (ms) => { s.calls.push(ms); return Promise.resolve(); } }; return s; };

function mockCrm(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => { const r = { method: req.method, url: req.url, headers: req.headers, body: b }; seen.push(r); handler(r, res, seen.length); });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/api/intake` })));
}
const reply = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj || {})); };
const cfgFor = (url) => crm.loadConfig({ CRM_INTAKE_URL: url, CRM_INTAKE_KEY: KEY });

(async () => {
  section('configuration');
  check(crm.loadConfig({}).reason === 'not_configured', 'nothing set -> disabled, not_configured');
  check(crm.loadConfig({ CRM_INTAKE_URL: 'https://crm.example.com/api/intake' }).reason === 'incomplete_configuration', 'URL without key -> disabled');
  check(crm.loadConfig({ CRM_INTAKE_KEY: KEY }).reason === 'incomplete_configuration', 'key without URL -> disabled');
  check(crm.loadConfig({ CRM_INTAKE_URL: 'not a url', CRM_INTAKE_KEY: KEY }).reason === 'invalid_url', 'malformed URL -> disabled');
  check(crm.loadConfig({ CRM_INTAKE_URL: 'http://crm.example.com/api/intake', CRM_INTAKE_KEY: KEY }).enabled === false, 'plain http to a remote host refused');
  check(crm.loadConfig({ CRM_INTAKE_URL: 'http://127.0.0.1:8787/api/intake', CRM_INTAKE_KEY: KEY }).enabled === true, 'http on loopback allowed');
  check(crm.loadConfig({ CRM_INTAKE_URL: 'https://u:p@crm.example.com/api/intake', CRM_INTAKE_KEY: KEY }).enabled === false, 'credentials in URL refused');
  check(crm.loadConfig({ CRM_INTAKE_URL: 'https://crm.example.com/api/intake', CRM_INTAKE_KEY: 'short' }).reason === 'invalid_key', 'key shorter than 24 chars refused');
  const cfgOk = cfgFor('https://crm.example.com/api/intake');
  check(cfgOk.enabled && cfgOk.timeoutMs === 5000, 'valid config enabled, default 5 s timeout');
  const missing = await crm.forwardEnquiry(ENQ, { env: {}, log: silent(), fetch: () => { throw new Error('must not be called'); } });
  check(!missing.ok && missing.attempts === 0 && missing.reason === 'not_configured', 'missing config: no request made, no throw');
  check(crm.forwardInBackground(ENQ, { env: {} }) === null, 'forwardInBackground is a silent no-op when unconfigured');

  section('payload');
  const p = crm.buildPayload(ENQ);
  check(p.source === 'WEBSITE_FORM', 'source is WEBSITE_FORM');
  check(p.name === ENQ.name && p.phone === ENQ.phone && p.type === ENQ.type && p.productInterest === 'Maida' && p.cityState === ENQ.cityState && p.message === ENQ.message && p.monthlyRequirement === ENQ.monthlyRequirement, 'documented fields mapped');
  check(!('id' in p) && !('read' in p) && !('createdAt' in p), 'internal fields (id, read, createdAt) not sent');
  check(!('message' in crm.buildPayload({ name: 'A B', phone: '9876543210', message: '' })), 'empty optional fields omitted');

  section('successful forwarding against a mock CRM');
  let m = await mockCrm((rq, res) => reply(res, 201, { ok: true, status: 'created', lead_code: 'LD-1' }));
  let r = await crm.forwardEnquiry(ENQ, { config: cfgFor(m.url), log: silent() });
  check(r.ok && r.attempts === 1 && r.status === 201, '201 -> ok after one attempt');
  check(m.seen.length === 1 && m.seen[0].method === 'POST', 'exactly one POST');
  check(m.seen[0].headers['x-intake-key'] === KEY, 'key sent in X-Intake-Key header');
  check(!m.seen[0].body.includes(KEY) && !m.seen[0].url.includes(KEY), 'key not in body or URL');
  check(/^application\/json/.test(m.seen[0].headers['content-type']), 'JSON content type');
  const sent = JSON.parse(m.seen[0].body);
  check(sent.source === 'WEBSITE_FORM' && sent.phone === ENQ.phone, 'body received by CRM contains source and phone');
  m.server.close();

  section('duplicate prevention (CRM replies 200 duplicate_attached)');
  m = await mockCrm((rq, res) => reply(res, 200, { ok: true, status: 'duplicate_attached', lead_code: 'LD-1' }));
  let sl = noSleep();
  r = await crm.forwardEnquiry(ENQ, { config: cfgFor(m.url), log: silent(), sleep: sl.fn });
  check(r.ok && r.attempts === 1 && m.seen.length === 1 && sl.calls.length === 0, '200 duplicate is success: not retried');
  m.server.close();

  section('retry then success (503, 503, 201) with backoff 1 s / 5 s');
  m = await mockCrm((rq, res, n) => (n < 3 ? reply(res, 503, { error: 'x' }) : reply(res, 201, { ok: true, status: 'created' })));
  sl = noSleep();
  r = await crm.forwardEnquiry(ENQ, { config: cfgFor(m.url), log: silent(), sleep: sl.fn });
  check(r.ok && r.attempts === 3 && m.seen.length === 3, 'succeeds on attempt 3');
  check(JSON.stringify(sl.calls) === '[1000,5000]', 'backoff 1000 then 5000 ms', JSON.stringify(sl.calls));
  m.server.close();

  section('retry exhausted: 5xx and 429 give up after 3 attempts');
  for (const code of [500, 502, 429]) {
    m = await mockCrm((rq, res) => reply(res, code, { error: 'x' }));
    sl = noSleep();
    const lg = silent();
    r = await crm.forwardEnquiry(ENQ, { config: cfgFor(m.url), log: lg, sleep: sl.fn });
    check(!r.ok && r.attempts === 3 && m.seen.length === 3, `${code}: 3 attempts then failure, no throw`);
    check(!lg.lines.join('\n').includes(KEY), `${code}: key not in logs`);
    m.server.close();
  }

  section('permanent errors are not retried');
  for (const code of [400, 401, 403, 413, 415]) {
    m = await mockCrm((rq, res) => reply(res, code, { error: 'x' }));
    sl = noSleep();
    const lg = silent();
    r = await crm.forwardEnquiry(ENQ, { config: cfgFor(m.url), log: lg, sleep: sl.fn });
    check(!r.ok && r.attempts === 1 && m.seen.length === 1 && sl.calls.length === 0, `${code}: single attempt`);
    check(!lg.lines.join('\n').includes(KEY), `${code}: key not in logs`);
    m.server.close();
  }
  check(crm.classify(401) === 'permanent' && crm.classify(400) === 'permanent' && crm.classify(503) === 'retry' && crm.classify(429) === 'retry' && crm.classify(201) === 'success' && crm.classify(200) === 'success', 'classify() table');

  section('redirects are never followed');
  m = await mockCrm((rq, res) => { res.writeHead(302, { Location: 'http://127.0.0.1:1/' }); res.end(); });
  sl = noSleep();
  r = await crm.forwardEnquiry(ENQ, { config: cfgFor(m.url), log: silent(), sleep: sl.fn });
  check(!r.ok && m.seen.length >= 1, '302 does not leak the key onward and does not throw');
  m.server.close();

  section('CRM unavailable / timeout');
  const dead = await mockCrm(() => {}); const deadUrl = dead.url; await new Promise((x) => dead.server.close(x));
  sl = noSleep();
  r = await crm.forwardEnquiry(ENQ, { config: cfgFor(deadUrl), log: silent(), sleep: sl.fn });
  check(!r.ok && r.attempts === 3 && r.reason === 'network_error', 'connection refused: 3 attempts, network_error, no throw');
  m = await mockCrm(() => { /* never answers */ });
  sl = noSleep();
  const t0 = Date.now();
  r = await crm.forwardEnquiry(ENQ, { config: Object.assign(cfgFor(m.url), { timeoutMs: 500 }), log: silent(), sleep: sl.fn });
  check(!r.ok && r.reason === 'timeout' && r.attempts === 3 && Date.now() - t0 < 5000, 'silent CRM: times out each attempt, gives up', `${Date.now() - t0} ms`);
  if (m.server.closeAllConnections) m.server.closeAllConnections();
  m.server.close();

  section('background wrapper never throws or rejects');
  const bg = crm.forwardInBackground(ENQ, { config: cfgFor('https://crm.example.com/api/intake'), fetch: () => { throw new Error('boom'); }, backoffMs: [1, 1], log: silent() });
  const bgr = await bg;
  check(bgr && bgr.ok === false && bgr.attempts === 3, 'fetch that throws synchronously is contained');

  section('route wiring (existing behaviour preserved)');
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  const iStore = route.indexOf("store.insertRow('enquiries'"); const iFwd = route.indexOf('forwardInBackground(saved)'); const iMail = route.indexOf('sendEnquiryEmail(saved)');
  check(iStore > 0 && iStore < iFwd && iFwd < iMail, 'forwarding runs after the enquiry is saved and before the email, un-awaited');
  check(!/await\s+forwardInBackground/.test(route), 'route never awaits the CRM');
  const jsDir = path.join(__dirname, '..', 'public', 'js');
  const pub = fs.readdirSync(jsDir).map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
  check(!/CRM_INTAKE|X-Intake-Key|api\/intake/.test(pub), 'no CRM key/endpoint in any browser script');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
