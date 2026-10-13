#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-autopilot.js   (npm run test:autopilot)
//
// Tests the SEO autopilot end to end with FAKE services only: a fake Google (OAuth, Search Analytics, Sitemaps,
// URL Inspection), a fake OpenAI-compatible AI provider, a fake IndexNow endpoint and a throw-away copy of the
// repository (real git) with its own live site on a local port. It never contacts a real service and never touches
// the real repository, data/, .env, PM2 or nginx.
//
//   node scripts/test-autopilot.js            # everything except the slow real-suite gate
//   node scripts/test-autopilot.js --full     # also runs the project's real seo-hard-check + enquiry tests as gates
//   node scripts/test-autopilot.js --only e3  # one scenario
// =============================================================================
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn, spawnSync, execFileSync } = require('child_process');

const SRC = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const FULL = args.includes('--full');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
let passed = 0; let failed = 0;
const check = (c, name, detail) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${name}${c || !detail ? '' : '  -> ' + String(detail).slice(0, 260)}`); };
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (n) => !ONLY || ONLY === n;
const SECRET = 'rt-SECRET-refresh-token-0123456789';
const AI_KEY = 'ai-SECRET-key-0123456789';

const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
function git(cwd, ...a) { return execFileSync('git', a, { cwd, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }) }).trim(); }
function copyTree(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    if (['node_modules', '.git', 'logs'].includes(n) || (skip && skip.includes(n))) continue;
    const f = path.join(src, n), t = path.join(dst, n);
    if (fs.statSync(f).isDirectory()) copyTree(f, t, skip); else fs.copyFileSync(f, t);
  }
}
function http_(url, opts) { return new Promise((res, rej) => { const o = opts || {}; const u = new URL(url); const r = http.request(u, { method: o.method || 'GET', headers: o.headers || {} }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => res({ status: x.statusCode, body: d })); }); r.on('error', rej); if (o.body) r.write(o.body); r.end(); }); }

// ------------------------------------------------------------------ fake Google
async function startGoogle() {
  const g = { mode: 'ok', calls: { token: 0, query: 0, sitemapPut: [], inspect: [] }, rows: null };
  const mk = (q, p, i, pos, c) => ({ keys: [q, 'https://devmamflourishfoods.com' + p], clicks: c, impressions: i, ctr: c / i, position: pos });
  const CUR = [mk('bulk besan supplier india', '/products/besan', 60, 14, 1), mk('maida wholesale supplier', '/products/maida', 45, 18, 0), mk('besan', '/products/besan', 25, 9, 1), mk('flourish', '/', 10, 3, 2), mk('gata', '/contact', 4, 50, 0), mk('how is wheat made into flour', '/guides/how-flour-is-made', 12, 22, 0), mk('tandoori atta supplier', '/products/tandoori-atta', 30, 16, 0)];
  const PREV = [mk('bulk besan supplier india', '/products/besan', 10, 20, 0), mk('besan', '/products/besan', 20, 10, 1)];
  g.server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (g.mode === 'timeout') return; // never answers
      try {
      if (req.url === '/token') { g.calls.token++; return g.mode === 'authfail' ? send(400, { error: 'invalid_grant' }) : g.mode === 'badclient' ? send(401, { error: 'invalid_client' }) : send(200, { access_token: 'fake-access-token-abcdef', expires_in: 3600 }); }
      if (req.headers.authorization !== 'Bearer fake-access-token-abcdef') return send(401, { error: { message: 'unauthorized' } });
      if (req.method === 'GET' && /\/sites\/[^/]+$/.test(req.url)) { g.calls.siteGet = (g.calls.siteGet || 0) + 1; return g.mode === 'noaccess' ? send(403, { error: { message: 'User does not have sufficient permission for site' } }) : g.mode === 'nosite' ? send(404, { error: { message: 'Site not found' } }) : send(200, { siteUrl: 'sc-domain:devmamflourishfoods.com', permissionLevel: g.mode === 'unverified' ? 'siteUnverifiedUser' : 'siteOwner' }); }
      if (/searchAnalytics\/query$/.test(req.url) && g.mode === 'quota') { g.calls.query++; res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '0' }); return res.end(JSON.stringify({ error: { message: 'Quota exceeded' } })); }
      if (/searchAnalytics\/query$/.test(req.url) && g.mode === 'flaky' && g.flakyLeft > 0) { g.flakyLeft--; g.calls.query++; return send(500, { error: { message: 'backend error' } }); }
      if (/searchAnalytics\/query$/.test(req.url) && g.mode === 'empty') { g.calls.query++; return send(200, {}); }
      if (/searchAnalytics\/query$/.test(req.url)) {
        g.calls.query++; const j = JSON.parse(body || '{}'); const cur = j.startDate >= new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10) || g.nowCurrent;
        const base = (g.rows || CUR); const rows = j.dimensions.length === 2 ? (j.startDate >= g.curStart ? base : PREV) : j.dimensions.length === 0 ? [{ keys: [], clicks: 3, impressions: 186, ctr: 0.016, position: 14.2 }] : [{ keys: ['https://devmamflourishfoods.com/products/besan'], clicks: 1, impressions: 85, ctr: 0.01, position: 12 }];
        return send(200, { rows });
      }
      if (/\/sitemaps\//.test(req.url) && req.method === 'PUT') { g.calls.sitemapPut.push(decodeURIComponent(req.url.split('/sitemaps/')[1])); return g.mode === 'sitemap403' ? send(403, { error: { message: 'insufficient scope' } }) : (res.writeHead(204), res.end()); }
      if (/index:inspect$/.test(req.url) && g.mode === 'inspect429') { g.calls.inspect429 = (g.calls.inspect429 || 0) + 1; return send(429, { error: { message: 'Quota exceeded' } }); }
      if (/index:inspect$/.test(req.url)) { const j = JSON.parse(body); g.calls.inspect.push(j.inspectionUrl); return send(200, { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED', pageFetchState: 'SUCCESSFUL', lastCrawlTime: '2026-10-08T03:00:00Z', googleCanonical: j.inspectionUrl, userCanonical: j.inspectionUrl } } }); }
      send(404, {});
      } catch (e) { send(500, { error: { message: 'fake google bug: ' + e.message } }); }
    });
  });
  const port = await freePort(); await new Promise((r) => g.server.listen(port, '127.0.0.1', r)); g.base = `http://127.0.0.1:${port}`;
  g.setNow = () => { g.curStart = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10); }; g.setNow();
  return g;
}

// ------------------------------------------------------------------ fake AI (OpenAI-compatible)
const PATCH = {
  '/wholesale-flour-supplier': { file: 'views/b2b-pages.js', find: 'Dealers and retailers can enquire.', good: 'Dealers, traders and retailers can enquire.', long: 'Dealers, traders, retailers and shops across India can enquire here.' },
  '/bulk-flour-supplier-india': { file: 'views/b2b-pages.js', find: 'Tell us your requirement and city.', good: 'Tell us your requirement, product and city.', long: 'Tell us your requirement, product, pack size and city today.' },
};
async function startAi() {
  const a = { mode: 'good', calls: 0, prompts: [] };
  a.server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      a.calls++; const prompt = (JSON.parse(body || '{}').messages || [{}])[0].content || ''; a.prompts.push({ auth: req.headers.authorization, prompt });
      if (a.mode === 'timeout') return;
      if (a.mode === 'http500') { res.writeHead(500); return res.end('boom'); }
      const page = (prompt.match(/Target page: (\S+)/) || [])[1]; const P = PATCH[page];
      const mk = (replace, extra) => ({ page, kind: 'description', file: P.file, find: P.find, replace, rationale: 'Clearer wording for buyers.', confidence: 0.9, ...(extra || {}) });
      let content;
      if (a.mode === 'garbage') content = 'Sure! Here is my advice: change things.';
      else if (!P) content = JSON.stringify({ decisions: [] });
      else if (a.mode === 'good') content = JSON.stringify({ decisions: [mk(P.good)] });
      else if (a.mode === 'claims') content = JSON.stringify({ decisions: [mk('Lowest price flour in Delhi, 5 stars, delivery within 24 hours.')] });
      else if (a.mode === 'badfind') content = JSON.stringify({ decisions: [mk(P.good, { find: 'this text does not exist anywhere in the file' })] });
      else if (a.mode === 'syntax') content = JSON.stringify({ decisions: [mk("Dealers can't miss this.")] });
      else if (a.mode === 'length') content = JSON.stringify({ decisions: [mk(P.long)] });
      else if (a.mode === 'protected') content = JSON.stringify({ decisions: [mk(P.good, { file: 'lib/mailer.js' })] });
      else if (a.mode === 'code') content = JSON.stringify({ decisions: [mk('x ${process.exit(1)} y')] });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  const port = await freePort(); await new Promise((r) => a.server.listen(port, '127.0.0.1', r)); a.base = `http://127.0.0.1:${port}`; return a;
}

// ------------------------------------------------------------------ fake IndexNow
async function startIndexNow() {
  const n = { posts: [], status: 200 };
  n.server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { n.posts.push(JSON.parse(b)); } catch (e) { n.posts.push({ raw: b }); } res.writeHead(n.status); res.end(); }); });
  const port = await freePort(); await new Promise((r) => n.server.listen(port, '127.0.0.1', r)); n.base = `http://127.0.0.1:${port}/indexnow`; return n;
}

// ------------------------------------------------------------------ fake alert webhook
async function startWebhook() {
  const w = { posts: [], status: 200 };
  w.server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { w.posts.push(JSON.parse(b)); } catch (e) { w.posts.push({ raw: b }); } res.writeHead(w.status); res.end('ok'); }); });
  const port = await freePort(); await new Promise((r) => w.server.listen(port, '127.0.0.1', r)); w.base = `http://127.0.0.1:${port}/hook`; return w;
}

// ------------------------------------------------------------------ throw-away production repo + live site
async function makeSite(root) {
  const repo = path.join(root, 'prod'); copyTree(SRC, repo, ['node_modules']);
  git(repo, 'init', '-q', '-b', 'main'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'baseline');
  fs.symlinkSync(path.join(SRC, 'node_modules'), path.join(repo, 'node_modules'));
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), 'node_modules\n');
  const site = { repo, port: await freePort(), child: null };
  site.base = `http://127.0.0.1:${site.port}`;
  site.start = async () => {
    const env = Object.assign({}, process.env, { PORT: String(site.port) }); for (const k of ['PERSIST_DIR', 'FORCE_HTTPS', 'SEO_LASTMOD_FILE', 'ZEPTOMAIL_API_TOKEN', 'SMTP_PASSWORD']) delete env[k];
    site.child = spawn(process.execPath, ['server.js'], { cwd: repo, env, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { if ((await http_(site.base + '/robots.txt')).status === 200) return; } catch (e) { await sleep(150); } }
    throw new Error('live site did not start');
  };
  site.stop = () => { try { site.child.kill(); } catch (e) { /* ignore */ } };
  site.restart = async () => { site.stop(); await sleep(300); await site.start(); };
  await site.start(); return site;
}

function runCli(site, cmd, env, root, state) {
  // asynchronous on purpose: the fake Google/AI/IndexNow servers live in THIS process and must keep answering while the CLI runs
  const e = Object.assign({}, process.env, {
    AUTOPILOT_ENV_FILE: '/nonexistent', AUTOPILOT_REPO_DIR: site.repo, AUTOPILOT_STATE_DIR: state, AUTOPILOT_FETCH_BASE: site.base, AUTOPILOT_SITE_ORIGIN: 'https://devmamflourishfoods.com',
    AUTOPILOT_GATE_HARDCHECK: FULL && env.__full ? '1' : '0', AUTOPILOT_GATE_ENQUIRY: FULL && env.__full ? '1' : '0', AUTOPILOT_HTTP_TIMEOUT_MS: '3000', AUTOPILOT_RETRY_BASE_MS: '5', AUTOPILOT_DATA_DIR: path.join(site.repo, 'data'),
  }, env || {});
  delete e.__full;
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(SRC, 'autopilot/cli.js'), cmd], { cwd: SRC, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
    const t = setTimeout(() => { c.kill(); }, 900000);
    c.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}
const jsonReport = (state) => { const d = path.join(state, 'reports'); const f = fs.readdirSync(d).filter((n) => n.endsWith('.json')).map((n) => [n, fs.statSync(path.join(d, n)).mtimeMs]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).pop(); return f ? JSON.parse(fs.readFileSync(path.join(d, f[0]), 'utf8')) : null; };
const auditText = (state) => { const d = path.join(state, 'audit'); try { return fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), 'utf8')).join(''); } catch (e) { return ''; } };
const branches = (repo) => git(repo, 'branch', '--list', 'seo-autopilot/*', '--format=%(refname:short)').split('\n').filter(Boolean);
const cleanBranches = (repo) => { try { git(repo, 'worktree', 'prune'); } catch (e) { /* ignore */ } for (const b of branches(repo)) git(repo, 'branch', '-D', b); };

(async () => {
  console.log('SEO autopilot tests (fake Google, fake AI, fake IndexNow, throw-away git repo and live site)');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'));
  const cleanups = [];
  try {
    // ============================================================ unit tests
    if (want('unit')) {
      section('Unit: business-claim validator');
      const { checkClaims } = require('../autopilot/lib/claims');
      check(checkClaims('Bulk wheat flour supplier in India, milled at our Kanpur unit.', '/bulk-flour-supplier-india').length === 0, 'a truthful B2B sentence passes');
      const bad = { 'price': 'Atta at ₹30 per kg', 'cheapest': 'The cheapest atta', 'MOQ': 'MOQ is 500 kg', 'private label': 'We do private label and OEM packing', 'contract manufacturing': 'Contract manufacturing available', 'rating': 'Rated 4.8 stars by buyers', 'review': 'Read our reviews', 'delivery promise': 'Delivery within 24 hours', 'capacity': 'Production capacity of 50 tons per day', 'other certification': 'HACCP and ISO 22000 certified', 'location': 'Serving Delhi and Mumbai', 'office': 'Offices in Pune', 'ranking': 'Guaranteed #1 ranking', 'near me': 'flour near me', 'lab claim off-page': 'lab verified atta' };
      for (const [k, t] of Object.entries(bad)) check(checkClaims(t, '/maida').length > 0, `blocked: ${k}`);
      check(checkClaims('100% whole wheat, rich in fibre, lab verified', '/products/fresh-chakki-atta').length === 0, 'the approved lab-verified Chakki Atta wording is allowed on its own page only');
      check(checkClaims('Flour from Kanpur, Uttar Pradesh, for buyers across India.', '/').length === 0, 'Kanpur, Uttar Pradesh and India are allowed place names');

      section('Unit: query classification and scoring');
      const opp = require('../autopilot/lib/opportunity');
      const c = (q) => opp.classify(q);
      check(c('flourish').kind === 'branded' && !c('flourish').relevant, 'brand query "flourish" is tracked, never an opportunity');
      check(c('gata').kind === 'irrelevant', 'address word "gata" is irrelevant');
      check(c('bulk besan supplier india').kind === 'commercial' && c('bulk besan supplier india').intent === 1, 'bulk besan supplier india is commercial');
      check(c('what is besan called in english').kind === 'informational', 'what is besan called in english is informational');
      check(c('how is wheat made into flour').businessFit < c('maida wholesale supplier').businessFit, 'informational traffic is weighted below commercial intent');

      section('Unit: patch validation');
      const patch = require('../autopilot/lib/patch');
      const ctx = { repoDir: SRC };
      const okP = { page: '/wholesale-flour-supplier', kind: 'description', file: 'views/b2b-pages.js', find: PATCH['/wholesale-flour-supplier'].find, replace: PATCH['/wholesale-flour-supplier'].good };
      check(patch.validate(okP, ctx).ok, 'a valid, in-block, single-occurrence patch is accepted');
      const rej = (o, label) => { const v = patch.validate(Object.assign({}, okP, o), ctx); check(!v.ok, `rejected: ${label}`, v.errors && v.errors.join(';')); };
      rej({ file: 'lib/mailer.js' }, 'protected file'); rej({ file: 'routes/admin.js' }, 'admin file'); rej({ file: 'data/content.json' }, 'data file'); rej({ file: 'lib/seo.js' }, 'file outside the SEO allow-list');
      rej({ find: 'text that is not in the file at all' }, 'find text absent'); rej({ find: 'Mamta Bhoj' }, 'find text occurring many times');
      rej({ page: '/bulk-flour-supplier-india' }, 'find text outside the editable block of the page');
      rej({ replace: 'x ${process.exit(1)} y' }, 'code interpolation'); rej({ replace: 'see https://example.com now' }, 'external URL'); rej({ replace: 'a <b>bold</b> claim' }, 'markup'); rej({ replace: 'line one\nline two' }, 'line break');
      rej({ replace: "Link ${PRODLINK('no-such-page', 'Nothing here')} now" }, 'helper link to an unknown page'); rej({ replace: 'Lowest price for dealers' }, 'unsupported claim'); rej({ kind: 'script' }, 'unsupported kind');
      check(patch.validate(Object.assign({}, okP, { replace: "Dealers can enquire, see ${B2BLINK('bulk-flour-supplier-india', 'bulk supply')}." }), ctx).ok, 'a page-link helper to a known page is allowed');

      section('Unit: sitemap lastmod (lib/seo.js)');
      const seo = require('../lib/seo');
      const lm = path.join(root, 'lm.json'); const prev = process.env.SEO_LASTMOD_FILE;
      delete process.env.SEO_LASTMOD_FILE; check(!/<lastmod>/.test(seo.buildSitemapXml([])), 'no lastmod file: sitemap has no <lastmod> at all (nothing invented)');
      fs.writeFileSync(lm, JSON.stringify({ '/about': '2026-10-01', '/products': '2999-01-01', '/faq': 'yesterday', '/nope-not-in-sitemap': '2026-10-02' })); process.env.SEO_LASTMOD_FILE = lm;
      const xml = seo.buildSitemapXml([]);
      check(xml.includes('<loc>https://devmamflourishfoods.com/about</loc>\n    <lastmod>2026-10-01</lastmod>'), 'a real date is written as <lastmod>');
      check(!xml.includes('2999') && !xml.includes('yesterday') && !xml.includes('nope-not-in-sitemap'), 'future, malformed and unknown entries are ignored');
      fs.writeFileSync(lm, '{broken'); check(!/<lastmod>/.test(seo.buildSitemapXml([])), 'a corrupt lastmod file never breaks the sitemap');
      if (prev) process.env.SEO_LASTMOD_FILE = prev; else delete process.env.SEO_LASTMOD_FILE;

      section('Unit: state limits, cooldown, retention, redaction');
      const { loadConfig } = require('../autopilot/config'); const state = require('../autopilot/lib/state'); const util = require('../autopilot/lib/util');
      const cfg = loadConfig({ AUTOPILOT_STATE_DIR: path.join(root, 'ustate'), AUTOPILOT_ENV_FILE: '/nonexistent', AUTOPILOT_GOOGLE_REFRESH_TOKEN: SECRET });
      state.init(cfg); const st = state.load(cfg);
      st.history.push({ date: '2026-10-10', page: '/a', status: 'proposed' }, { date: '2026-10-10', page: '/b', status: 'proposed' });
      check(state.limitStatus(cfg, st, '2026-10-10').remainingToday === 0, 'daily limit: 2 pages per day');
      check(state.limitStatus(cfg, st, '2026-10-11').remainingToday === 2, 'the limit resets the next day');
      check(!!state.onCooldown(cfg, st, '/a', '2026-10-20') && !state.onCooldown(cfg, st, '/a', '2026-10-24'), 'cooldown: 14 days per page');
      check(!state.newPageAllowed(cfg, Object.assign({}, st, { lastNewPageAt: '2026-10-10' }), '2026-10-15') && state.newPageAllowed(cfg, Object.assign({}, st, { lastNewPageAt: '2026-10-10' }), '2026-10-17'), 'new pages: at most 1 per 7 days');
      fs.writeFileSync(path.join(cfg.stateDir, 'reports', 'report-2020-01-01-x.json'), '{}'); fs.writeFileSync(path.join(cfg.stateDir, 'reports', 'report-2026-10-09-x.json'), '{}');
      state.rotate(cfg, '2026-10-10'); check(!fs.existsSync(path.join(cfg.stateDir, 'reports', 'report-2020-01-01-x.json')) && fs.existsSync(path.join(cfg.stateDir, 'reports', 'report-2026-10-09-x.json')), 'retention rotates old reports and keeps recent ones');
      check(loadConfig({ AUTOPILOT_ENV_FILE: '/nonexistent', AUTOPILOT_RETENTION_DAYS: '10' }).retentionDays >= 90, 'retention can never be set below 90 days');
      check(!util.redact(`token=${SECRET} Authorization: Bearer abcdefghijklmnop`).includes(SECRET) && !/abcdefghijklmnop/.test(util.redact('Authorization: Bearer abcdefghijklmnop')), 'secrets are redacted from log text');
    }

    // ============================================================ scenarios against the live fake site
    const google = await startGoogle(); const ai = await startAi(); const inow = await startIndexNow(); cleanups.push(() => { google.server.close(); ai.server.close(); inow.server.close(); });
    const site = await makeSite(root); cleanups.push(site.stop);
    const mainHead = () => git(site.repo, 'rev-parse', 'main');
    const baseHead = mainHead();
    let n = 0;
    const baseEnv = () => ({ AUTOPILOT_GOOGLE_CLIENT_ID: 'cid', AUTOPILOT_GOOGLE_CLIENT_SECRET: 'csecret-0123456789', AUTOPILOT_GOOGLE_REFRESH_TOKEN: SECRET, AUTOPILOT_GOOGLE_TOKEN_URL: google.base + '/token', AUTOPILOT_GSC_API_BASE: google.base + '/webmasters/v3', AUTOPILOT_GSC_INSPECT_BASE: google.base + '/v1', AUTOPILOT_INDEXNOW_ENDPOINT: inow.base });
    const scenario = (extra) => { n++; const state = path.join(root, `state-${n}`); cleanBranches(site.repo); git(site.repo, 'reset', '-q', '--hard', baseHead); google.mode = 'ok'; ai.mode = 'good'; google.calls = { token: 0, query: 0, sitemapPut: [], inspect: [] }; ai.calls = 0; inow.posts.length = 0; return { state, env: Object.assign(baseEnv(), extra || {}) }; };
    const untouched = (label) => { check(mainHead() === baseHead && git(site.repo, 'status', '--porcelain', '--untracked-files=no') === '', `${label}: the production branch and working tree are exactly as before`); };
    const mark = (st) => { const s = JSON.parse(fs.readFileSync(path.join(st, 'state.json'), 'utf8')); s.initialAuditDone = true; fs.writeFileSync(path.join(st, 'state.json'), JSON.stringify(s)); };

    // ---- E1 first run / dry run
    if (want('e1')) {
      section('E1: first run is audit-only (dry run)');
      const s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY });
      const r = (await runCli(site, 'dry-run', s.env, root, s.state)); const rep = jsonReport(s.state);
      check(r.code === 0 && rep, 'dry run completes and writes a report', r.out);
      check(rep && rep.inventory.pageCount === 31 && rep.auditSummary.critical === 0, 'inventory: 31 pages, no critical audit finding', rep && JSON.stringify(rep.auditSummary));
      check(rep && rep.indexnow.keyVerified, 'the existing IndexNow key is discovered and verified on the site');
      check(rep && rep.gsc.available && rep.gsc.totals.current.clicks === 3, 'Search Console data collected (totals)', rep && JSON.stringify(rep.gsc) + JSON.stringify(rep.stops));
      const ops = (rep && rep.opportunities) || [];
      check(ops.some((o) => o.query === 'bulk besan supplier india' && o.kind === 'commercial' && o.score > 40), 'a commercial query is scored as an opportunity');
      check(!ops.some((o) => o.query === 'flourish' || o.query === 'gata'), 'branded and unrelated queries ("flourish", "gata") are never opportunities');
      check(rep && rep.newQueries.some((q) => q.query === 'maida wholesale supplier'), 'new queries are reported');
      check(rep && rep.inspections.length > 0 && google.calls.inspect.length > 0, 'URL Inspection ran (status monitoring)');
      check(rep && rep.changes.length === 0 && branches(site.repo).length === 0 && ai.calls === 0, 'dry run: no AI call, no proposal, no branch');
      check(google.calls.sitemapPut.length === 0 && inow.posts.length === 0, 'dry run: no sitemap submission and no IndexNow submission');
      check(!fs.existsSync(path.join(s.state, 'lastmod.json')), 'dry run: no lastmod written');
      const st = JSON.parse(fs.readFileSync(path.join(s.state, 'state.json'), 'utf8'));
      check(st.initialAuditDone === true && Object.keys(st.hashes).length === 31, 'the passing first audit records the baseline (31 content hashes) and unlocks proposals');
      const names = fs.readdirSync(path.join(s.state, 'reports'));
      check(['json', 'md', 'html'].every((x) => names.some((f) => f.endsWith('.' + x))), 'report is stored as JSON, Markdown and HTML outside the web root');
      check(!r.out.includes(SECRET) && !auditText(s.state).includes(SECRET) && !names.some((f) => fs.readFileSync(path.join(s.state, 'reports', f), 'utf8').includes(SECRET)), 'no credential appears in output, audit log or reports');
      untouched('E1');
      const rp = (await runCli(site, 'report', s.env, root, s.state)); check(rp.code === 0 && /SEO autopilot report/.test(rp.out), 'seo:report prints the latest report');
      const al = (await runCli(site, 'audit-log', s.env, root, s.state)); check(/run_start/.test(al.out) && /initial_audit_done/.test(al.out), 'seo:audit-log shows the decisions');
    }

    // ---- E2 first real run without prior dry run stays audit-only
    if (want('e2')) {
      section('E2: a first live run is also audit-only; report mode never proposes');
      let s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY });
      let r = (await runCli(site, 'run', s.env, root, s.state)); let rep = jsonReport(s.state);
      check(rep && rep.initialRun && rep.changes.length === 0 && branches(site.repo).length === 0 && ai.calls === 0, 'first run: audit and baseline only, nothing proposed', r.out);
      s = scenario({ AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY }); (await runCli(site, 'dry-run', s.env, root, s.state));
      r = (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(rep.effectiveMode === 'report-only' && rep.changes.length === 0 && branches(site.repo).length === 0 && ai.calls === 0, 'default mode (report) never proposes, even after the first audit passed');
      s = scenario({ AUTOPILOT_MODE: 'propose' }); (await runCli(site, 'dry-run', s.env, root, s.state)); r = (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(rep.effectiveMode === 'propose' && rep.changes.length === 0 && /report-only/.test(rep.ai.note), 'propose mode without an AI integration is report-only for patches', rep.ai.note);
      untouched('E2');
    }

    // ---- E3 happy path: proposal on a separate branch
    if (want('e3')) {
      section('E3: validated proposal is committed ONLY to a separate branch');
      const aiEnv = { AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY, AUTOPILOT_MAX_PAGES_PER_DAY: '1' };
      const s = scenario(aiEnv); (await runCli(site, 'dry-run', s.env, root, s.state));
      const r = (await runCli(site, 'run', s.env, root, s.state)); const rep = jsonReport(s.state);
      const bs = branches(site.repo);
      check(r.code === 0 && rep.changes.length === 1 && bs.length === 1, 'exactly one proposal (daily limit of 1 page) on exactly one new branch', r.out + JSON.stringify(rep && rep.notChanged));
      check(bs[0] && /^seo-autopilot\/\d{4}-\d{2}-\d{2}-wholesale-flour-supplier-/.test(bs[0]), 'branch is named seo-autopilot/<date>-<page>-<id>', bs[0]);
      untouched('E3');
      const diffFiles = bs[0] ? git(site.repo, 'diff', '--name-only', `main...${bs[0]}`).split('\n').filter(Boolean) : [];
      check(diffFiles.length === 1 && diffFiles[0] === 'views/b2b-pages.js', 'the branch changes only the one allow-listed SEO source file', diffFiles.join(','));
      const diff = bs[0] ? git(site.repo, 'diff', `main...${bs[0]}`) : '';
      check(/-.*Dealers and retailers can enquire\./.test(diff) && /\+.*Dealers, traders and retailers can enquire\./.test(diff), 'the diff is the single validated wording change');
      check(rep.gates.length >= 8 && rep.gates.every((g) => g.ok), `all quality gates passed in the worktree (${rep.gates.map((g) => g.name).join(', ')})`);
      check(['changed-files', 'js-syntax', 'sitemap-valid', 'robots-valid', 'page-count', 'changed-pages', 'no-new-seo-defects', 'schema-valid'].every((x) => rep.gates.some((g) => g.name === x)), 'required gates ran: changed files, syntax, sitemap, robots, page count, changed pages, defects, schema');
      check(rep.changes[0] && /git merge --no-ff/.test(rep.changes[0].review), 'the report tells the owner how to review and merge manually');
      check(git(site.repo, 'worktree', 'list').split('\n').length === 1, 'the temporary worktree was cleaned up');
      const live = await http_(site.base + '/wholesale-flour-supplier'); check(!/name="description" content="[^"]*Dealers, traders and retailers can enquire\./.test(live.body) && /name="description" content="[^"]*Dealers and retailers can enquire\./.test(live.body), 'the LIVE site still serves the old wording (nothing deployed or restarted)');
      check(ai.prompts.length > 0 && !ai.prompts.some((p) => /SECRET|passwordHash|refresh|enquiries\.json/i.test(p.prompt)) && ai.prompts[0].auth === `Bearer ${AI_KEY}`, 'the AI received only page/query context (no secrets or data files)');
      const again = (await runCli(site, 'run', s.env, root, s.state)); const rep2 = jsonReport(s.state);
      check(branches(site.repo).length === 1 && rep2.changes.length === 0 && rep2.notChanged.some((x) => /awaiting review|cooldown|daily limit/.test(x.reason)), 'a second run does not stack proposals (open branch / cooldown / daily limit)', again.out);
      // rollback while the branch is unmerged: withdrawn
      const rb = (await runCli(site, 'rollback', s.env, root, s.state));
      check(rb.code === 0 && branches(site.repo).length === 0 && /withdrawn/.test(rb.out), 'rollback of an unmerged proposal deletes the branch', rb.out);
      untouched('E3 rollback');
      check(/proposal_created/.test(auditText(s.state)) && /rollback/.test(auditText(s.state)), 'the audit log records the proposal and the rollback');
    }

    // ---- E4 rollback of a merged proposal produces a revert PROPOSAL
    if (want('e4')) {
      section('E4: rollback after a manual merge proposes a revert on a new branch');
      const s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY, AUTOPILOT_MAX_PAGES_PER_DAY: '1' });
      (await runCli(site, 'dry-run', s.env, root, s.state)); (await runCli(site, 'run', s.env, root, s.state));
      const b = branches(site.repo)[0]; check(!!b, 'a proposal exists to merge');
      git(site.repo, 'merge', '--no-ff', '-q', '-m', 'owner merged the proposal', b); const merged = mainHead();
      const rb = (await runCli(site, 'rollback', s.env, root, s.state));
      const rv = branches(site.repo).filter((x) => /revert/.test(x));
      check(rb.code === 0 && rv.length === 1 && /revert proposed/.test(rb.out), 'a revert branch is proposed', rb.out);
      check(mainHead() === merged, 'the production branch was NOT changed by the rollback (the owner merges the revert)');
      const back = rv[0] ? git(site.repo, 'diff', `main...${rv[0]}`) : '';
      check(/-.*Dealers, traders and retailers can enquire\./.test(back) && /\+.*Dealers and retailers can enquire\./.test(back), 'the revert branch restores the original wording');
      git(site.repo, 'reset', '-q', '--hard', baseHead);
    }

    // ---- E5 rejected AI output
    for (const [id, mode, why] of [['e5a', 'claims', 'unsupported business claims'], ['e5b', 'badfind', 'a find text that is not in the file'], ['e5c', 'protected', 'a protected file'], ['e5d', 'code', 'code injection']]) {
      if (!want('e5') && !want(id)) continue;
      section(`E5: AI output with ${why} is rejected`);
      const s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY }); (await runCli(site, 'dry-run', s.env, root, s.state)); ai.mode = mode;
      const r = (await runCli(site, 'run', s.env, root, s.state)); const rep = jsonReport(s.state);
      check(r.code === 0 && rep.changes.length === 0 && branches(site.repo).length === 0, 'nothing is proposed and no branch is created', r.out);
      check(/patch_rejected/.test(auditText(s.state)) && rep.notChanged.some((x) => /rejected/.test(x.reason)), 'the rejection and its reason are recorded');
      untouched(`E5 ${mode}`);
    }

    // ---- E6 gates catch what the validator cannot
    for (const [id, mode, why, gate] of [['e6a', 'syntax', 'breaks JavaScript syntax', 'js-syntax'], ['e6b', 'length', 'makes the rendered description too long', 'changed-pages']]) {
      if (!want('e6') && !want(id)) continue;
      section(`E6: a patch that ${why} is stopped by the quality gates`);
      const s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY }); (await runCli(site, 'dry-run', s.env, root, s.state)); ai.mode = mode;
      const r = (await runCli(site, 'run', s.env, root, s.state)); const rep = jsonReport(s.state);
      check(rep.changes.length === 0 && branches(site.repo).length === 0 && git(site.repo, 'worktree', 'list').split('\n').length === 1, 'the proposal branch and worktree are discarded automatically', r.out);
      check(rep.gates.some((g) => g.name === gate && !g.ok), `the "${gate}" gate failed`, JSON.stringify(rep.gates.filter((g) => !g.ok)));
      check(rep.rollbacks.length === 1 && rep.stops.some((x) => /gates failed/.test(x)), 'the run stops and records the discarded proposal');
      untouched(`E6 ${mode}`);
    }

    // ---- E7 failures and timeouts
    if (want('e7')) {
      section('E7: failure and timeout scenarios');
      let s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY, AUTOPILOT_HTTP_TIMEOUT_MS: '2000' }); (await runCli(site, 'dry-run', s.env, root, s.state));
      for (const mode of ['timeout', 'http500', 'garbage']) { ai.mode = mode; cleanBranches(site.repo); const t0 = Date.now(); const r = (await runCli(site, 'run', s.env, root, s.state)); const rep = jsonReport(s.state); check(r.code === 0 && rep.changes.length === 0 && branches(site.repo).length === 0 && Date.now() - t0 < 120000, `AI provider ${mode}: the run completes, nothing is proposed`, r.out); }
      s = scenario({}); google.mode = 'authfail'; let r = (await runCli(site, 'dry-run', s.env, root, s.state)); let rep = jsonReport(s.state);
      check(r.code === 0 && rep.gsc.available === false && rep.stops.some((x) => /Google API auth is unavailable/.test(x)), 'Google OAuth failure: audit still reports, stop condition recorded', r.out);
      s = scenario({ AUTOPILOT_HTTP_TIMEOUT_MS: '1500' }); google.mode = 'timeout'; r = (await runCli(site, 'dry-run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(r.code === 0 && rep.gsc.available === false, 'Search Console timeout: handled, report still produced', r.out);
      s = scenario({}); (await runCli(site, 'dry-run', s.env, root, s.state)); google.mode = 'sitemap403';
      fs.appendFileSync(path.join(site.repo, 'views', 'faq.js'), '\n'); git(site.repo, 'add', '-A'); git(site.repo, 'commit', '-q', '-m', 'content tweak'); await site.restart();
      r = (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(/failed: .*403/.test(rep.sitemapSubmission.status) || rep.sitemapSubmission.status.includes('not needed'), 'a sitemap-submission 403 is reported, not fatal', rep.sitemapSubmission.status);
      git(site.repo, 'reset', '-q', '--hard', baseHead); await site.restart();
    }

    // ---- E8 stop conditions
    if (want('e8')) {
      section('E8: stop conditions block all proposals');
      const proposeEnv = { AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY };
      const stopCase = async (label, setup, re, teardown) => { const s = scenario(proposeEnv); (await runCli(site, 'dry-run', s.env, root, s.state)); setup(s); const r = (await runCli(site, 'run', s.env, root, s.state)); const rep = jsonReport(s.state); check(rep.changes.length === 0 && branches(site.repo).length === 0 && rep.stops.some((x) => re.test(x)), label, r.out + JSON.stringify(rep.stops)); if (teardown) teardown(s); git(site.repo, 'checkout', '-q', '--', '.'); };
      await stopCase('unexpected change in the git working tree', () => fs.appendFileSync(path.join(site.repo, 'views', 'faq.js'), '\n// stray edit\n'), /unexpected changes/);
      await stopCase('a protected file is modified', () => fs.appendFileSync(path.join(site.repo, 'lib', 'mailer.js'), '\n// stray edit\n'), /protected files are modified/);
      await stopCase('page count changes unexpectedly', (s) => { const f = path.join(s.state, 'state.json'); const st = JSON.parse(fs.readFileSync(f, 'utf8')); st.pageCount = 30; fs.writeFileSync(f, JSON.stringify(st)); }, /page count changed unexpectedly/);
      await stopCase('publish=auto is refused', (s) => { s.env.AUTOPILOT_PUBLISH = 'auto'; }, /autonomous publishing/);
      // runtime data edits (production admin changes) must NOT stop the autopilot
      const s2 = scenario(proposeEnv); (await runCli(site, 'dry-run', s2.env, root, s2.state)); fs.appendFileSync(path.join(site.repo, 'data', 'content.json'), ' '); const r2 = (await runCli(site, 'run', s2.env, root, s2.state)); const rep2 = jsonReport(s2.state);
      check(!rep2.stops.some((x) => /unexpected changes|protected/.test(x)), 'edits to runtime data/ (made through the admin panel) are ignored by the dirty-tree check', JSON.stringify(rep2.stops)); git(site.repo, 'checkout', '-q', '--', '.');
      // IndexNow key cannot be validated: the repo says one key, the live site serves another
      const s3 = scenario(proposeEnv); (await runCli(site, 'dry-run', s3.env, root, s3.state));
      const kf = path.join(site.repo, 'lib', 'indexnow.js'); const orig = fs.readFileSync(kf, 'utf8'); fs.writeFileSync(kf, orig.replace(/INDEXNOW_KEY = '[^']+'/, "INDEXNOW_KEY = 'aaaabbbbccccddddeeeeffff00001111'")); git(site.repo, 'commit', '-qam', 'key change');
      (await runCli(site, 'run', s3.env, root, s3.state)); const rep3 = jsonReport(s3.state);
      check(rep3.stops.some((x) => /IndexNow key cannot be validated/.test(x)) && rep3.changes.length === 0, 'IndexNow key mismatch is a stop condition'); git(site.repo, 'reset', '-q', '--hard', baseHead);
    }

    // ---- E9 limits and cooldown across days
    if (want('e9')) {
      section('E9: daily limit and cooldown across days');
      const env = { AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY, AUTOPILOT_MAX_PAGES_PER_DAY: '1', AUTOPILOT_NOW: '2026-10-12T04:00:00Z' };
      const s = scenario(env); (await runCli(site, 'dry-run', s.env, root, s.state)); (await runCli(site, 'run', s.env, root, s.state));
      let rep = jsonReport(s.state); const first = rep.changes[0] && rep.changes[0].page;
      check(rep.changes.length === 1 && rep.notChanged.some((x) => /daily limit/.test(x.reason)), 'day 1: one page proposed, the second opportunity waits (daily limit)', JSON.stringify(rep.notChanged));
      cleanBranches(site.repo); // the owner merged or discarded it; the cooldown must still apply
      s.env.AUTOPILOT_NOW = '2026-10-13T04:00:00Z'; (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(rep.changes.length === 1 && rep.changes[0].page !== first && rep.notChanged.some((x) => /cooldown/.test(x.reason) && x.page === first), 'day 2: the other page is proposed; the first page is on cooldown', JSON.stringify(rep.notChanged));
      cleanBranches(site.repo); s.env.AUTOPILOT_NOW = '2026-10-27T04:00:00Z'; (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(rep.notChanged.every((x) => !(/cooldown/.test(x.reason) && x.page === first)), 'after 14 days the cooldown is over');
    }

    // ---- E10 real content change -> lastmod, IndexNow, Google sitemap
    if (want('e10')) {
      section('E10: a real live content change updates lastmod and notifies search engines');
      const s = scenario({ AUTOPILOT_NOW: '2026-10-14T04:00:00Z' }); (await runCli(site, 'dry-run', s.env, root, s.state));
      let r = (await runCli(site, 'run', s.env, root, s.state)); let rep = jsonReport(s.state);
      check(rep.changedUrls.length === 0 && !fs.existsSync(path.join(s.state, 'lastmod.json')) && inow.posts.length === 0 && google.calls.sitemapPut.length === 0, 'no content change: no lastmod, no IndexNow, no sitemap submission', r.out);
      const f = path.join(site.repo, 'views', 'b2b-pages.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Dealers and retailers can enquire.', 'Dealers and retailers can enquire.').replace("A branded range, packed for the shelf'", "A branded range, packed for the shelf'")); // no-op edit must not count
      const g = path.join(site.repo, 'views', 'b2b-pages.js'); fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace("h2: 'A branded range, packed for the shelf',", "h2: 'A branded flour range, packed for the shelf',")); git(site.repo, 'commit', '-qam', 'owner edit'); await site.restart();
      r = (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state);
      check(rep.changedUrls.length === 1 && rep.changedUrls[0] === '/wholesale-flour-supplier', 'exactly the changed page is detected from live content hashes', JSON.stringify(rep.changedUrls));
      const lm = JSON.parse(fs.readFileSync(path.join(s.state, 'lastmod.json'), 'utf8')); check(lm['/wholesale-flour-supplier'] === '2026-10-14' && Object.keys(lm).length === 1, 'lastmod is recorded for that page only', JSON.stringify(lm));
      check(inow.posts.length === 1 && inow.posts[0].urlList && inow.posts[0].urlList.length === 1 && inow.posts[0].urlList[0] === 'https://devmamflourishfoods.com/wholesale-flour-supplier' && inow.posts[0].key === require('../lib/indexnow').INDEXNOW_KEY, 'IndexNow receives only the changed URL, with the existing key', JSON.stringify(inow.posts));
      check(google.calls.sitemapPut.length === 1 && google.calls.sitemapPut[0] === 'https://devmamflourishfoods.com/sitemap.xml', 'the sitemap is submitted to Google through the Sitemaps API');
      check(/not a guarantee/.test(rep.sitemapSubmission.status), 'the report does not claim Google indexing was forced');
      const again = (await runCli(site, 'run', s.env, root, s.state)); const rep2 = jsonReport(s.state); check(rep2.changedUrls.length === 0 && inow.posts.length === 1, 'an unchanged site is not re-submitted');
      const calls = google.calls.inspect.length; (await runCli(site, 'run', s.env, root, s.state)); check(google.calls.inspect.length === calls, 'URL Inspection results are cached (no repeat calls within 7 days)');
      git(site.repo, 'reset', '-q', '--hard', baseHead); await site.restart();
    }

    // ---- E11 enable / disable
    if (want('e11')) {
      section('E11: enable / disable');
      const s = scenario({});
      check((await runCli(site, 'disable', s.env, root, s.state)).code === 0, 'seo:disable');
      let r = (await runCli(site, 'run', s.env, root, s.state)); let rep = jsonReport(s.state); check(rep && rep.stops.some((x) => /disabled/.test(x)) && rep.inventory.pageCount === undefined, 'a scheduled (non-interactive) run exits immediately when disabled', r.out);
      check((await runCli(site, 'enable', s.env, root, s.state)).code === 0, 'seo:enable');
      r = (await runCli(site, 'run', s.env, root, s.state)); rep = jsonReport(s.state); check(rep.inventory.pageCount === 31, 'after enable the run executes');
      const st = (await runCli(site, 'status', s.env, root, s.state)); check(/"enabled": true/.test(st.out) && !st.out.includes(SECRET), 'status shows state without secrets');
    }

    // ---- E13 operations: classified Google failures, retries, status/exit codes, ledger, alerts, lock, watchdog, weekly
    if (want('e13')) {
      const reportText = async (s) => (await runCli(site, 'report', s.env, root, s.state)).out;
      const ledgerLast = (st) => JSON.parse(fs.readFileSync(path.join(st, 'last-run.json'), 'utf8'));

      section('E13a: Google failures are classified, explained, and degrade to safe report-only');
      const cases = [['authfail', 'auth_invalid', /refresh token/i], ['badclient', 'auth_invalid_client', /OAuth client/i], ['noaccess', 'no_access', /owner\/full user/i], ['unverified', 'no_access', /unverified/i], ['nosite', 'not_found', /AUTOPILOT_GSC_SITE/], ['quota', 'quota', /rate\/quota limit/i]];
      for (const [mode, kind, re] of cases) {
        const s = scenario({}); google.mode = mode; const r = await runCli(site, 'run', s.env, root, s.state); const rep = jsonReport(s.state); const md = await reportText(s);
        check(rep.gsc.available === false && rep.gsc.status === kind, `Google ${mode}: classified as ${kind}`, JSON.stringify(rep.gsc));
        check(rep.status === 'degraded' && r.code === 0 && rep.inventory.pageCount === 31 && rep.changes.length === 0, `Google ${mode}: the run completes as DEGRADED, the audit still runs, nothing is proposed`, r.out);
        check(re.test(md) && /What to do/.test(md), `Google ${mode}: the report explains what to do`);
        check(!md.includes(SECRET) && !r.out.includes(SECRET) && !md.includes('csecret-0123456789'), `Google ${mode}: no credential in the report or output`);
      }
      let s = scenario({ AUTOPILOT_GOOGLE_REFRESH_TOKEN: '' }); let r = await runCli(site, 'run', s.env, root, s.state); let rep = jsonReport(s.state);
      check(rep.gsc.status === 'not_configured' && rep.status === 'degraded' && rep.effectiveMode === 'report-only' && /safe report-only/.test(await reportText(s)), 'missing OAuth: safe report-only mode with a remediation report');
      s = scenario({}); google.mode = 'timeout'; r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.gsc.status === 'network' && rep.status === 'degraded', 'a Google timeout is a network problem, not "no data"', JSON.stringify(rep.gsc));
      s = scenario({}); google.mode = 'empty'; r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state); const mdEmpty = await reportText(s);
      check(rep.gsc.available === true && rep.gsc.status === 'ok_no_data' && rep.status === 'success' && !rep.stops.some((x) => /Google/.test(x)), 'a healthy API with zero traffic is "no data", never a failure', JSON.stringify(rep.gsc) + JSON.stringify(rep.stops));
      check(/no traffic data/i.test(mdEmpty) && rep.opportunities.length === 0, 'the report says so and invents no opportunities');
      s = scenario({}); r = await runCli(site, 'verify-google', s.env, root, s.state); check(r.code === 0 && /OK \[ok\]/.test(r.out) && /siteOwner/.test(r.out) && !r.out.includes(SECRET), 'verify-google confirms access to the property without printing credentials', r.out);
      google.mode = 'authfail'; r = await runCli(site, 'verify-google', s.env, root, s.state); check(r.code === 1 && /NOT OK \[auth_invalid\]/.test(r.out) && /remedy:/.test(r.out) && !r.out.includes(SECRET), 'verify-google reports bad credentials with a remedy', r.out);
      google.mode = 'ok'; r = await runCli(site, 'verify-google', Object.assign({}, s.env, { AUTOPILOT_GOOGLE_CLIENT_ID: '' }), root, s.state); check(r.code === 1 && /\[not_configured\]/.test(r.out), 'verify-google reports missing configuration');

      section('E13b: bounded retries, rate limits and no repeated submissions');
      const util2 = require('../autopilot/lib/util'); const prevBase = process.env.AUTOPILOT_RETRY_BASE_MS; process.env.AUTOPILOT_RETRY_BASE_MS = '1';
      let hits = 0; let behave = 'flaky';
      const probe = http.createServer((req, res) => { hits++; if (behave === 'flaky' && hits <= 2) { res.writeHead(429, { 'Retry-After': '0' }); return res.end('slow down'); } if (behave === 'always429') { res.writeHead(429); return res.end(); } if (behave === 'always500') { res.writeHead(503); return res.end(); } if (behave === '400') { res.writeHead(400); return res.end(); } res.writeHead(200); res.end('ok'); });
      const probePort = await freePort(); await new Promise((r2) => probe.listen(probePort, '127.0.0.1', r2)); const purl = `http://127.0.0.1:${probePort}/`;
      let x = await util2.requestRetry(purl, {}); check(x.status === 200 && hits === 3 && x.attempts === 3, 'two 429s then success: retried and succeeded (3 attempts)', `${x.status} ${hits}`);
      hits = 0; behave = 'always429'; x = await util2.requestRetry(purl, {}); check(x.status === 429 && hits === 3, 'a persistent 429 gives up after a bounded number of attempts (never loops)', `${x.status} ${hits}`);
      hits = 0; behave = 'always500'; x = await util2.requestRetry(purl, {}); check(x.status === 503 && hits === 3, 'a persistent 5xx gives up after a bounded number of attempts', `${x.status} ${hits}`);
      hits = 0; behave = '400'; x = await util2.requestRetry(purl, {}); check(x.status === 400 && hits === 1, 'a client error (400) is never retried', `${x.status} ${hits}`);
      probe.close(); let thrown = null; try { await util2.requestRetry(purl, { timeoutMs: 500 }); } catch (e) { thrown = e; } check(thrown && thrown.attempts === 3, 'a network failure is retried a bounded number of times, then reported', thrown && String(thrown.attempts));
      if (prevBase === undefined) delete process.env.AUTOPILOT_RETRY_BASE_MS; else process.env.AUTOPILOT_RETRY_BASE_MS = prevBase;
      s = scenario({}); google.mode = 'flaky'; google.flakyLeft = 2; r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.gsc.available === true && rep.gsc.status === 'ok' && google.calls.query > 4, 'transient Google 5xx errors are retried and the run still gets its data', JSON.stringify(rep.gsc) + google.calls.query);
      s = scenario({}); google.mode = 'quota'; r = await runCli(site, 'run', s.env, root, s.state);
      check(google.calls.query >= 1 && google.calls.query <= 3 && google.calls.sitemapPut.length === 0, 'a rate-limited Search Console is queried a bounded number of times and nothing is submitted', String(google.calls.query));
      s = scenario({}); await runCli(site, 'run', s.env, root, s.state); const sitemapPuts = google.calls.sitemapPut.length; await runCli(site, 'run', s.env, root, s.state); await runCli(site, 'run', s.env, root, s.state);
      check(google.calls.sitemapPut.length === sitemapPuts && inow.posts.length === 0, 'unchanged site: the sitemap and URLs are not re-submitted on later runs');

      section('E13c: run status, exit codes and the run ledger');
      s = scenario({}); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state); let led = ledgerLast(s.state);
      check(r.code === 0 && /status=success/.test(r.out) && rep.status === 'success', 'a clean run is SUCCESS with exit code 0', r.out);
      check(led.runId === rep.runId && led.status === 'success' && led.startedAt && led.endedAt && led.durationMs >= 0 && led.checks.pages === 31 && led.checks.google === 'ok' && 'proposals' in led.actions && Array.isArray(led.errors), 'the ledger records run id, start/end, checks, actions, errors and final status', JSON.stringify(led).slice(0, 300));
      check((await runCli(site, 'ledger', s.env, root, s.state)).out.includes(rep.runId), 'seo ledger lists the run');
      check((await runCli(site, 'health', s.env, root, s.state)).code === 0, 'health: exit 0 after a successful recent run');
      s = scenario({ AUTOPILOT_FETCH_BASE: 'http://127.0.0.1:1' }); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state); led = ledgerLast(s.state);
      check(r.code === 1 && /FAILED/.test(r.out) && rep.status === 'failed' && led.status === 'failed', 'an unreachable site is a FAILED run: exit code 1, never reported as success', r.out);
      check((await runCli(site, 'health', s.env, root, s.state)).code === 1, 'health: exit 1 when the last run failed');
      s = scenario({ AUTOPILOT_RUN_TIMEOUT_MS: '1500', AUTOPILOT_HTTP_TIMEOUT_MS: '20000' }); google.mode = 'timeout'; r = await runCli(site, 'run', s.env, root, s.state); led = ledgerLast(s.state);
      check(r.code === 1 && /watchdog/.test(r.out) && led.status === 'failed' && led.errors.some((e) => /watchdog/.test(e)) && !fs.existsSync(path.join(s.state, 'run.lock')), 'the watchdog stops a hung run: FAILED, recorded, lock released', r.out);
      s = scenario({}); const state0 = require('../autopilot/lib/state'); const cfg0 = require('../autopilot/config').loadConfig({ AUTOPILOT_STATE_DIR: s.state, AUTOPILOT_ENV_FILE: '/nonexistent' }); state0.init(cfg0);
      state0.recordRun(cfg0, { runId: 'old', date: '2026-10-01', startedAt: new Date(Date.now() - 80 * 3600000).toISOString(), endedAt: new Date(Date.now() - 80 * 3600000).toISOString(), status: 'success' });
      check((await runCli(site, 'health', s.env, root, s.state)).code === 4, 'health: exit 4 when no run happened for over 50 hours (scheduler problem)');
      s = scenario({}); fs.mkdirSync(s.state, { recursive: true }); fs.writeFileSync(path.join(s.state, 'state.json'), JSON.stringify({ lastRun: { at: new Date(Date.now() - 72 * 3600000).toISOString() } })); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.health.some((i) => i.id === 'scheduler' && i.level === 'warn') && rep.status === 'degraded', 'a missed scheduled run is detected and reported', JSON.stringify(rep.health.filter((i) => i.level !== 'ok')));

      section('E13d: duplicate-run protection');
      const lockCfg = require('../autopilot/config').loadConfig({ AUTOPILOT_STATE_DIR: path.join(root, 'lockstate'), AUTOPILOT_ENV_FILE: '/nonexistent' }); const st2 = require('../autopilot/lib/state'); const lockFile = st2.paths(lockCfg).lock;
      check(st2.acquireLock(lockCfg) === true && st2.acquireLock(lockCfg) === false, 'a second acquire while a live run holds the lock is refused');
      st2.releaseLock(lockCfg); fs.writeFileSync(lockFile, JSON.stringify({ pid: 2000000000, at: new Date().toISOString() })); check(st2.acquireLock(lockCfg) === true, 'a lock left by a dead process is reclaimed'); st2.releaseLock(lockCfg);
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: new Date(Date.now() - 3 * 3600000).toISOString() })); check(st2.acquireLock(lockCfg) === true, 'a lock older than the longest allowed run is reclaimed even if the PID exists'); st2.releaseLock(lockCfg);
      fs.writeFileSync(lockFile, '{not json'); check(st2.acquireLock(lockCfg) === true, 'a corrupt lock file is reclaimed'); st2.releaseLock(lockCfg);
      s = scenario({}); fs.mkdirSync(s.state, { recursive: true }); fs.writeFileSync(path.join(s.state, 'run.lock'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); r = await runCli(site, 'run', s.env, root, s.state);
      check(r.code === 3 && /in progress/.test(r.out) && fs.existsSync(path.join(s.state, 'run.lock')) && fs.readdirSync(path.join(s.state, 'reports')).length === 0, 'CLI: a run is refused (exit 3) while another is in progress, and does not touch the other run\'s lock', r.out);
      s = scenario({}); const both = await Promise.all([runCli(site, 'run', s.env, root, s.state), runCli(site, 'run', s.env, root, s.state)]); const codes = both.map((b) => b.code).sort();
      check(codes[0] === 0 && codes[1] === 3, 'two simultaneous starts: exactly one runs, the other exits 3 (atomic lock)', JSON.stringify(codes) + both.map((b) => b.out.slice(0, 80)).join(' | '));
      check(fs.readdirSync(path.join(s.state, 'reports')).filter((n) => /^report-.*[.]json$/.test(n)).length === 1, 'only one report was produced by the two simultaneous starts');

      section('E13e: alerts are useful, quiet when nothing changed, and never contain secrets');
      const hook = await startWebhook(); cleanups.push(() => hook.server.close());
      s = scenario({ AUTOPILOT_ALERT_WEBHOOK: hook.base }); google.mode = 'authfail'; r = await runCli(site, 'run', s.env, root, s.state);
      check(hook.posts.length === 1 && /DEGRADED/.test(hook.posts[0].text) && /auth_invalid/.test(hook.posts[0].text) && /Re-authorise/.test(hook.posts[0].text), 'an OAuth failure sends one alert that says what is wrong and what to do', JSON.stringify(hook.posts));
      check(!JSON.stringify(hook.posts).includes(SECRET) && !JSON.stringify(hook.posts).includes('csecret-0123456789'), 'the alert contains no credential');
      await runCli(site, 'run', s.env, root, s.state); check(hook.posts.length === 1, 'the same problem on the next run does not alert again (no daily spam)');
      google.mode = 'ok'; await runCli(site, 'run', s.env, root, s.state); check(hook.posts.length === 2 && /SUCCESS/.test(hook.posts[1].text) && /recovered/i.test(hook.posts[1].text), 'recovery is announced once, as SUCCESS', JSON.stringify(hook.posts));
      s = scenario({ AUTOPILOT_ALERT_WEBHOOK: 'http://127.0.0.1:1/hook' }); google.mode = 'authfail'; r = await runCli(site, 'run', s.env, root, s.state);
      check(r.code === 0 && jsonReport(s.state).status === 'degraded', 'a failing alert webhook never fails or hides the run');
      s = scenario({ AUTOPILOT_AI_MODE: 'openai' }); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.health.some((i) => i.id === 'ai' && i.level === 'warn' && /needs AUTOPILOT_AI_BASE_URL/.test(i.detail)) && rep.status === 'degraded' && rep.changes.length === 0, 'AI configured but incomplete: reported, runs deterministic audits only, nothing proposed');
      const healthLib = require('../autopilot/lib/health');
      const txt = healthLib.alertText({ date: '2026-10-13', status: 'degraded', runId: 'abc', health: [{ level: 'fail', title: 'Search Console unavailable', detail: `refresh_token=${SECRET} Authorization: Bearer abcdefghijklmnop0123`, remedy: 'x' }] }, ['test']);
      check(!txt.includes(SECRET) && !/abcdefghijklmnop0123/.test(txt), 'alert text is redacted even if a detail accidentally contained a secret');
      check(healthLib.alertReasons({ status: 'degraded', dryRun: true, health: [{ id: 'google', level: 'fail' }], rollbacks: [], changes: [] }, null, Date.now()).length === 0, 'dry runs never alert');

      section('E13f: weekly trend report');
      const weekly = require('../autopilot/lib/weekly'); const wcfg = { timezone: 'Asia/Kolkata' };
      check(weekly.due(wcfg, { lastWeekly: null }, new Date('2026-10-18T22:00:00Z')) === '2026-10-19', 'first weekly report is due on the first run of a Monday (India time)');
      check(weekly.due(wcfg, { lastWeekly: null }, new Date('2026-10-20T04:00:00Z')) === null, 'not due on a Tuesday when none has been built yet');
      check(weekly.due(wcfg, { lastWeekly: '2026-10-19' }, new Date('2026-10-25T10:00:00Z')) === null && weekly.due(wcfg, { lastWeekly: '2026-10-19' }, new Date('2026-10-26T04:00:00Z')) === '2026-10-26', 'then one report every 7 days');
      s = scenario({}); const wc = require('../autopilot/config').loadConfig({ AUTOPILOT_STATE_DIR: s.state, AUTOPILOT_ENV_FILE: '/nonexistent' }); const wf = state0.init(wc);
      const mk = (date, clicks, impr, pos, crit) => ({ runId: 'r' + date, date, dryRun: false, gsc: { available: true, status: 'ok', totals: { current: { clicks, impressions: impr, ctr: clicks / impr, position: pos }, previous: { clicks: 1, impressions: 10, ctr: 0.1, position: 20 } } }, auditSummary: { critical: crit, high: 1, medium: 2, low: 3 }, inventory: { pageCount: 31 }, pageMovement: [{ path: '/products/besan', current: 90, previous: 40, change: 50 }], risingCommercial: [{ query: 'bulk besan supplier india', impressions: 60, position: 14 }], opportunities: [{ query: 'maida wholesale supplier', bestPage: '/products/maida', action: 'improve existing page', score: 55, position: 18 }], inspections: [{ verdict: 'PASS' }, { verdict: 'PASS' }, { verdict: 'NEUTRAL' }] });
      for (const [d, c, i] of [['2026-09-21', 10, 400], ['2026-09-28', 14, 480], ['2026-10-05', 20, 600], ['2026-10-12', 30, 800]]) { fs.writeFileSync(path.join(wf.reports, `report-${d}-x.json`), JSON.stringify(mk(d, c, i, 15, d === '2026-10-05' ? 1 : 0))); state0.recordRun(wc, { runId: 'r' + d, date: d, startedAt: d + 'T22:00:00Z', endedAt: d + 'T22:05:00Z', status: d === '2026-10-12' ? 'degraded' : 'success', health: d === '2026-10-12' ? ['google'] : [] }); }
      const out = weekly.build(wc, wf, { history: [{ date: '2026-10-10', page: '/wholesale-flour-supplier', status: 'proposed', branch: 'seo-autopilot/x' }] }, '2026-10-13');
      check(/\| 2026-10-12 \| 30 \| 800 \|/.test(out.markdown) && /\| 2026-10-05 \| 20 \| 600 \|/.test(out.markdown) && /clicks \+50%, impressions \+33%/.test(out.markdown), 'weekly report: a 28-day rolling trend table with the week-over-week change', out.markdown.slice(0, 900));
      check(/\/products\/besan: 40 -> 90 \(\+50\)/.test(out.markdown) && /bulk besan supplier india/.test(out.markdown) && /maida wholesale supplier -> \/products\/maida/.test(out.markdown), 'weekly report: page movement, rising commercial queries and opportunities');
      check(/PASS: 2, NEUTRAL: 1/.test(out.markdown) && /google \(1 run\)/.test(out.markdown) && /wholesale-flour-supplier: proposed/.test(out.markdown), 'weekly report: indexing status, operational problems and proposals');
      check(/guarantee/i.test(out.markdown) && !/rank(s|ing)? (will|guaranteed)/i.test(out.markdown.replace(/Nothing here predicts or guarantees rankings or indexing\./, '')), 'weekly report makes no ranking or indexing promises');
      r = await runCli(site, 'weekly', s.env, root, s.state); check(r.code === 0 && /weekly report:/.test(r.out) && fs.readdirSync(wf.reports).some((n) => /^weekly-\d{4}-\d{2}-\d{2}\.md$/.test(n)), 'seo weekly builds the report on demand');
      section('E13g: review fixes (monitoring file, scheduler gap, webhook secrecy, inspection quota, undelivered alerts)');
      s = scenario({}); await runCli(site, 'run', s.env, root, s.state); const realId = ledgerLast(s.state).runId; await runCli(site, 'dry-run', s.env, root, s.state);
      check(ledgerLast(s.state).runId === realId && (await runCli(site, 'ledger', s.env, root, s.state)).out.split('\n').filter((l) => l.includes('"dryRun":true')).length === 1, 'a manual dry run is recorded in the ledger but never overwrites last-run.json (the monitoring file)');
      s = scenario({}); const gcfg = require('../autopilot/config').loadConfig({ AUTOPILOT_STATE_DIR: s.state, AUTOPILOT_ENV_FILE: '/nonexistent' }); state0.init(gcfg);
      fs.writeFileSync(path.join(s.state, 'state.json'), JSON.stringify({ lastRun: { at: new Date(Date.now() - 72 * 3600000).toISOString() } }));
      state0.recordRun(gcfg, { runId: 'recentfail', date: '2026-10-13', startedAt: new Date(Date.now() - 6 * 3600000).toISOString(), endedAt: new Date(Date.now() - 6 * 3600000).toISOString(), status: 'failed' });
      r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(!rep.health.some((i) => i.id === 'scheduler'), 'a recent FAILED run counts as "the timer fired": no false "missed run" warning after an outage', JSON.stringify(rep.health.filter((i) => i.level !== 'ok')));
      util2.registerSecrets({ AUTOPILOT_ALERT_WEBHOOK: 'https://hooks.example.test/services/T000/B000/XXXXsecretpathXXXX' });
      check(!util2.redact('alert failed for https://hooks.example.test/services/T000/B000/XXXXsecretpathXXXX').includes('XXXXsecretpath'), 'the alert webhook URL is redacted from logs and errors');
      s = scenario({}); google.mode = 'inspect429'; google.calls.inspect429 = 0; r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(google.calls.inspect429 === 1 && rep.gsc.available === true, 'URL Inspection is never retried on a 429: one call, then the run moves on and still completes', String(google.calls.inspect429));
      const hook2 = await startWebhook(); cleanups.push(() => hook2.server.close()); hook2.status = 500;
      s = scenario({ AUTOPILOT_ALERT_WEBHOOK: hook2.base }); google.mode = 'authfail'; await runCli(site, 'run', s.env, root, s.state);
      hook2.status = 200; await runCli(site, 'run', s.env, root, s.state); const afterFix = hook2.posts.length; await runCli(site, 'run', s.env, root, s.state);
      check(afterFix === 2 && hook2.posts.length === 2 && /could not be delivered/.test(hook2.posts[1].text), 'an alert that could not be delivered is retried on the next run, then not repeated', JSON.stringify(hook2.posts.map((x) => (x.text || '').slice(0, 120))));
      untouched('E13');
    }

    // ---- E12 optional: real project suites as gates
    if (FULL && want('full')) {
      section('E12: the project\'s real SEO hard check and enquiry tests run as gates in the worktree');
      const s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY, AUTOPILOT_MAX_PAGES_PER_DAY: '1', __full: true }); (await runCli(site, 'dry-run', s.env, root, s.state));
      const r = (await runCli(site, 'run', s.env, root, s.state)); const rep = jsonReport(s.state);
      check(rep.changes.length === 1 && rep.gates.some((g) => g.name === 'seo-hard-check' && g.ok) && rep.gates.some((g) => g.name === 'enquiry-tests' && g.ok), 'seo-hard-check and enquiry tests passed on the proposal branch', r.out + JSON.stringify(rep.gates.filter((g) => !g.ok)));
      untouched('E12');
    }

    // ============================================================ installer
    if (want('install')) {
      section('Installer: systemd units, install and uninstall scripts');
      const U = path.join(SRC, 'deploy/autopilot'); const pre = path.join(root, 'fakeroot');
      const sh = (script, a) => spawnSync('bash', [path.join(U, script), ...a], { encoding: 'utf8' });
      let r = sh('install-autopilot.sh', ['--user', 'deploy', '--dry-run', '--node', process.execPath]); check(r.status === 0 && /\[dry-run\]/.test(r.stdout) && !fs.existsSync('/etc/mamta-autopilot/autopilot.env.test'), 'install --dry-run prints the plan and changes nothing', r.stdout + r.stderr);
      r = sh('install-autopilot.sh', ['--user', 'deploy', '--prefix', pre, '--node', process.execPath, '--repo', SRC]); check(r.status === 0, 'install into a scratch root succeeds', r.stdout + r.stderr);
      const svc = fs.readFileSync(path.join(pre, 'etc/systemd/system/mamta-autopilot.service'), 'utf8'); const tim = fs.readFileSync(path.join(pre, 'etc/systemd/system/mamta-autopilot.timer'), 'utf8');
      check(!/@[A-Z]+@/.test(svc + tim), 'all unit placeholders were substituted');
      check(/User=deploy/.test(svc) && /ExecStart=.*autopilot\/cli\.js run/.test(svc) && /Type=oneshot/.test(svc), 'service: one-shot run of the CLI as the service user');
      check(/OnCalendar=\*-\*-\* 03:30:00 Asia\/Kolkata/.test(tim) && /Persistent=true/.test(tim), 'timer: once a day at 03:30 India time');
      check(!/pm2|nginx|systemctl restart|git (merge|push)/i.test(svc.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')), 'the service contains no PM2, nginx, merge or push commands');
      check((fs.statSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env')).mode & 0o777) === 0o600, 'the credentials file is created with mode 600');
      check(/AUTOPILOT_MODE=report/.test(fs.readFileSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env'), 'utf8')), 'the default mode is report-only');
      fs.writeFileSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env'), 'AUTOPILOT_MODE=propose\n'); sh('install-autopilot.sh', ['--user', 'deploy', '--prefix', pre, '--node', process.execPath, '--repo', SRC]);
      check(/AUTOPILOT_MODE=propose/.test(fs.readFileSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env'), 'utf8')), 're-running the installer keeps an existing credentials file');
      const an = spawnSync('systemd-analyze', ['verify', path.join(pre, 'etc/systemd/system/mamta-autopilot.timer'), path.join(pre, 'etc/systemd/system/mamta-autopilot.service')], { encoding: 'utf8' });
      if (an.error) console.log('  (systemd-analyze not available here; unit syntax verified structurally only)'); else check(!/fatal|Unknown|error/i.test((an.stdout || '') + (an.stderr || '')), 'systemd-analyze verify accepts the rendered units', (an.stdout || '') + (an.stderr || ''));
      r = sh('uninstall-autopilot.sh', ['--prefix', pre]); check(r.status === 0 && !fs.existsSync(path.join(pre, 'etc/systemd/system/mamta-autopilot.timer')) && fs.existsSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env')), 'uninstall removes the units and keeps credentials and state by default', r.stdout + r.stderr);
      r = sh('uninstall-autopilot.sh', ['--prefix', pre, '--purge', '--state-dir', '/var/lib/mamta-autopilot-test']); check(!fs.existsSync(path.join(pre, 'etc/mamta-autopilot')), 'uninstall --purge removes the credentials directory');

    }
  } catch (e) { failed++; console.log('  FAIL  test harness error: ' + (e.stack || e.message)); }
  finally { for (const f of cleanups) { try { f(); } catch (e) { /* ignore */ } } try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
  console.log(`\nAUTOPILOT TESTS: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
