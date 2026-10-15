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
let passed = 0; let failed = 0; let skipped = 0;
const check = (c, name, detail) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${name}${c || !detail ? '' : '  -> ' + String(detail).slice(0, 260)}`); };
const section = (t) => console.log(`\n== ${t}`);
// A skip is only for something this platform genuinely cannot test (never to hide a failure); the reason is always printed and counted.
const skip = (name, why) => { skipped++; console.log(`  SKIP  ${name}  -> ${why}`); };
const WIN = process.platform === 'win32';
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
let GOOGLE = null; // the fake Google server in use: its current/previous window boundary follows the CLI's clock (AUTOPILOT_NOW or real time), so the suite does not depend on today's date
async function startGoogle() {
  const g = { mode: 'ok', calls: { token: 0, query: 0, sitemapPut: [], inspect: [] }, rows: null }; GOOGLE = g;
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
      if (req.method === 'GET' && /\/sitemaps\//.test(req.url)) { g.calls.sitemapGet = (g.calls.sitemapGet || 0) + 1; if (g.mode === 'sitemapnone') return send(404, { error: { message: 'Sitemap not found' } }); const bad = g.mode === 'sitemaperr'; return send(200, { path: decodeURIComponent(req.url.split('/sitemaps/')[1]), lastSubmitted: '2026-10-01T00:00:00Z', lastDownloaded: '2026-10-12T00:00:00Z', isPending: false, errors: bad ? '2' : '0', warnings: '0', contents: [{ type: 'web', submitted: String(g.sitemapCount || 31), indexed: bad ? '20' : String(g.sitemapCount || 31) }] }); }
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
      if (/index:inspect$/.test(req.url) && g.mode === 'inspectbad') { const j = JSON.parse(body); g.calls.inspect.push(j.inspectionUrl); return send(200, { inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED', pageFetchState: 'SUCCESSFUL', lastCrawlTime: null, googleCanonical: 'https://devmamflourishfoods.com/other-page', userCanonical: j.inspectionUrl } } }); }
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
    AUTOPILOT_ENV_FILE: '/nonexistent', AUTOPILOT_TARGET_KEYWORDS_FILE: '', AUTOPILOT_REPO_DIR: site.repo, AUTOPILOT_STATE_DIR: state, AUTOPILOT_FETCH_BASE: site.base, AUTOPILOT_SITE_ORIGIN: 'https://devmamflourishfoods.com',
    AUTOPILOT_GATE_HARDCHECK: FULL && env.__full ? '1' : '0', AUTOPILOT_GATE_ENQUIRY: FULL && env.__full ? '1' : '0', AUTOPILOT_HTTP_TIMEOUT_MS: '3000', AUTOPILOT_RETRY_BASE_MS: '5', AUTOPILOT_DATA_DIR: path.join(site.repo, 'data'),
  }, env || {});
  delete e.__full;
  if (GOOGLE) GOOGLE.curStart = new Date((e.AUTOPILOT_NOW ? Date.parse(e.AUTOPILOT_NOW) : Date.now()) - 31 * 86400000).toISOString().slice(0, 10);
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

    // ---- E14 automatic remediation: discover -> proposal -> gates -> publish -> live verification -> rollback
    if (want('e14')) {
      const publishLib = require('../autopilot/lib/publish'); const keywordsLib = require('../autopilot/lib/keywords'); const fixersLib = require('../autopilot/lib/fixers'); const patchLib2 = require('../autopilot/lib/patch');
      const bare = path.join(root, 'origin.git');
      git(root, 'init', '-q', '--bare', '-b', 'main', bare);
      try { git(site.repo, 'remote', 'remove', 'origin'); } catch (e) { /* none yet */ }
      git(site.repo, 'remote', 'add', 'origin', bare);
      const resetOrigin = () => git(site.repo, 'push', '-q', '-f', 'origin', `${baseHead}:refs/heads/main`);
      const prodHead = () => git(site.repo, 'rev-parse', 'HEAD'); const originHead = () => git(bare, 'rev-parse', 'main');
      const ctrl = { queue: [], calls: 0 };
      ctrl.server = http.createServer(async (req, res) => {
        ctrl.calls++; const m = ctrl.queue.length ? ctrl.queue.shift() : 'ok';
        if (m === 'fail') { res.writeHead(500); return res.end('boom'); }
        if (m === 'norestart') { res.writeHead(200); return res.end('ok'); }
        if (m === 'crash') { site.stop(); await sleep(300); res.writeHead(200); return res.end('ok'); }
        await site.restart(); res.writeHead(200); res.end('ok');
      });
      await new Promise((r) => ctrl.server.listen(0, '127.0.0.1', r)); cleanups.push(() => ctrl.server.close());
      const restartJs = path.join(root, 'restart.js');
      fs.writeFileSync(restartJs, "require('http').get('http://127.0.0.1:' + process.argv[2] + '/', (r) => { r.resume(); r.on('end', () => process.exit(r.statusCode === 200 ? 0 : 1)); }).on('error', () => process.exit(1));");
      const RESTART = `node ${restartJs.replace(/\\/g, '/')} ${ctrl.server.address().port}`;
      const autoEnv = (extra) => Object.assign({ AUTOPILOT_MODE: 'auto', AUTOPILOT_RESTART_CMD: RESTART, AUTOPILOT_MIN_INLINKS: '10', AUTOPILOT_VERIFY_TIMEOUT_MS: '20000', AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }, extra || {});
      const fresh = async (extra, noActivation) => { const s = scenario(autoEnv(extra)); resetOrigin(); ctrl.queue.length = 0; await site.restart(); if (!noActivation) await runCli(site, 'activate-auto', s.env, root, s.state); return s; };
      const liveBody = async (p) => (await http_(site.base + p)).body;
      const ledgerLast = (st) => JSON.parse(fs.readFileSync(path.join(st, 'last-run.json'), 'utf8'));
      const tracked = git(site.repo, 'ls-files', 'data').split('\n').filter(Boolean)[0];
      const adminFile = path.join(site.repo, tracked || 'data/admin.json');
      const relatedLists = () => ['views/guides.js', 'views/guides-more.js', 'views/guides-phase3.js'].flatMap((f) => (fs.readFileSync(path.join(site.repo, f), 'utf8').match(/related: \[[^\]]*\]/g) || []));
      const noDupes = () => relatedLists().every((l) => { const xs = l.match(/'([a-z0-9-]+)'/g) || []; return new Set(xs).size === xs.length; });

      section('E14a: deterministic fixer proposes a validated internal-link fix without any AI; production untouched');
      let s = scenario({ AUTOPILOT_MODE: 'propose', AUTOPILOT_MIN_INLINKS: '10', AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); resetOrigin(); await site.restart();
      await runCli(site, 'dry-run', s.env, root, s.state); let r = await runCli(site, 'run', s.env, root, s.state); let rep = jsonReport(s.state); let bs = branches(site.repo);
      check(r.code === 0 && rep.fixes.length >= 1 && rep.fixes[0].outcome === 'proposed' && bs.length === 1 && ai.calls === 0, 'AUTOPILOT_MODE=propose: one fix is prepared on a review branch, with no AI configured or called', r.out + JSON.stringify(rep.fixes && rep.fixes.map((f) => [f.id, f.outcome])));
      const df = bs[0] ? git(site.repo, 'diff', `main...${bs[0]}`) : '';
      check(/^-\s+related: \[/m.test(df) && /^\+\s+related: \[/m.test(df) && git(site.repo, 'diff', '--name-only', `main...${bs[0]}`).split('\n').filter(Boolean).length === 1, 'the fix is exactly one changed related: [...] list in one guide source file', df.slice(0, 300));
      check(prodHead() === baseHead && git(site.repo, 'status', '--porcelain', '--untracked-files=no') === '' && originHead() === baseHead, 'production branch, working tree and origin are unchanged by a proposal');
      check(rep.fixes[0].trace.map((t) => t.name).join() === 'discover,propose,gates,publish', 'the trace shows discover -> propose -> gates -> (not published)', JSON.stringify(rep.fixes[0].trace.map((t) => t.name)));
      check(rep.auto.enabled === false && rep.status !== 'failed', 'propose mode never publishes');

      section('E14b: auto mode - discovery to live verification, traced, with protected data preserved');
      s = await fresh(); fs.appendFileSync(adminFile, '\n'); const adminBefore = fs.readFileSync(adminFile); const adminStat = git(site.repo, 'status', '--porcelain', '--', path.relative(site.repo, adminFile).replace(/\\/g, '/'));
      await runCli(site, 'dry-run', s.env, root, s.state); const before = prodHead(); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state); const fx = rep.fixes[0] || {};
      check(r.code === 0 && fx.outcome === 'published' && rep.auto.published.length === 1, 'the fix is published automatically (no approval step)', r.out + JSON.stringify(rep.fixes && rep.fixes.map((f) => [f.id, f.outcome, f.trace])));
      check(fx.trace && fx.trace.map((t) => t.name).join() === 'discover,propose,gates,preflight,merge,restart,verify-live,push' && fx.trace.every((t) => t.ok), 'every step is traced in order: discover, propose, gates, preflight, merge, restart, verify-live, push', JSON.stringify((fx.trace || []).map((t) => [t.name, t.ok])));
      check(git(site.repo, 'rev-list', '--count', `${before}..HEAD`) === '1' && prodHead() === originHead() && prodHead() !== before, 'production moved exactly one commit, and origin/main has the same verified commit');
      const changed = git(site.repo, 'diff', '--name-only', before, 'HEAD').split('\n').filter(Boolean);
      check(changed.length === 1 && /^views\/guides[a-z0-9-]*\.js$/.test(changed[0]), 'only one allow-listed guide source file changed', changed.join(','));
      const body = await liveBody(rep.auto.published[0].page); check(body.includes(`href="${rep.auto.published[0].target}"`), 'the new internal link is LIVE on the published page (fetched from the running site)');
      check(fs.readFileSync(adminFile).equals(adminBefore) && git(site.repo, 'status', '--porcelain', '--', path.relative(site.repo, adminFile).replace(/\\/g, '/')) === adminStat, 'the server-modified data/admin.json is byte-identical and still shown as locally modified');
      check(rep.status === 'success' && rep.health.some((i) => /^release-/.test(i.id)), 'run status success; the release is recorded as a health note', rep.status);
      const led = ledgerLast(s.state); check(led.actions && led.actions.published === 1 && led.status === 'success', 'the run ledger records the published fix');
      check(inow.posts.length > 0 && JSON.stringify(inow.posts).includes(rep.auto.published[0].page) && google.calls.sitemapPut.length >= 1, 'the changed URL is submitted to IndexNow and the sitemap is submitted to Google');
      check(/fix_published/.test(auditText(s.state)) && /fix_step/.test(auditText(s.state)), 'the audit log has the step-by-step record');
      check(git(site.repo, 'branch', '--list', 'seo-autopilot/*').trim() === '' && git(site.repo, 'worktree', 'list').split('\n').length === 1, 'no leftover proposal branch or worktree');
      const r2 = await runCli(site, 'run', s.env, root, s.state); const rep2 = jsonReport(s.state);
      check(prodHead() === before || git(site.repo, 'rev-list', '--count', `${before}..HEAD`) === '1', 'a second run the same day publishes nothing more (daily limit)', JSON.stringify(rep2.fixes && rep2.fixes.map((f) => [f.id, f.outcome, f.reason2])));
      check(noDupes(), 'no related list contains a duplicate slug');
      const s3 = { state: s.state, env: Object.assign({}, s.env, { AUTOPILOT_NOW: '2026-10-14T04:00:00Z' }) }; await runCli(site, 'run', s3.env, root, s3.state); const rep3 = jsonReport(s3.state);
      check(noDupes() && !rep3.fixes.some((f) => f.id === fx.id && f.outcome === 'published'), 'the next day the same fix is not applied again (idempotent, cooldown)', JSON.stringify(rep3.fixes.map((f) => [f.id, f.outcome])));

      section('E14c: live verification fails -> automatic rollback, nothing reaches origin, publishing is paused, alert sent');
      const hook = await startWebhook(); cleanups.push(() => hook.server.close());
      s = await fresh({ AUTOPILOT_ALERT_WEBHOOK: hook.base }); fs.appendFileSync(adminFile, '\n'); const adminB2 = fs.readFileSync(adminFile);
      await runCli(site, 'dry-run', s.env, root, s.state); ctrl.queue.push('norestart'); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.fixes[0] && rep.fixes[0].outcome === 'rolled-back' && prodHead() === baseHead && originHead() === baseHead, 'the release is rolled back to the previous commit and origin never received it', r.out + JSON.stringify(rep.fixes && rep.fixes[0] && rep.fixes[0].trace));
      check(git(site.repo, 'status', '--porcelain', '--untracked-files=no').split('\n').filter((l) => l && !/ data\//.test(l)).length === 0 && fs.readFileSync(adminFile).equals(adminB2), 'the working tree is restored and data/admin.json is untouched by the rollback');
      const tn = rep.fixes[0].trace.map((t) => t.name + ':' + t.ok).join(); check(/merge:true,restart:true,verify-live:false,rollback-code:true,rollback-restart:true,rollback-verify:true/.test(tn), 'trace: merge, restart, verify-live FAILED, then rollback-code, rollback-restart and rollback-verify all succeed', tn);
      check(r.code === 0 && rep.status === 'degraded' && rep.health.some((i) => i.id === 'release') && rep.health.some((i) => i.id === 'auto-paused'), 'status degraded (exit 0) with a "release rolled back" item and a "publishing paused" item with its remedy', rep.status);
      check(JSON.parse(fs.readFileSync(path.join(s.state, 'state.json'), 'utf8')).autoPaused != null, 'auto-publishing is paused (circuit breaker)');
      check(hook.posts.some((p) => /rolled back/.test(p.text)), 'a failure alert was sent', JSON.stringify(hook.posts.map((p) => (p.text || '').slice(0, 120))));
      check((await liveBody('/')).length > 1000 && !(await liveBody(rep.fixes[0].page)).includes(`href="${rep.fixes[0].target}"`), 'the live site serves the previous version');
      cleanBranches(site.repo); const r4 = await runCli(site, 'run', s.env, root, s.state); const rep4 = jsonReport(s.state);
      check(rep4.auto.enabled === false && /paused/.test(rep4.auto.reason) && (rep4.fixes[0] || {}).outcome === 'proposed' && prodHead() === baseHead && rep4.health.some((i) => i.id === 'auto-paused'), 'while paused, the next run only prepares a review branch and reports the pause with its remedy', r4.out + rep4.auto.reason);
      cleanBranches(site.repo); s.env.AUTOPILOT_NOW = '2026-10-14T04:00:00Z'; const rs = await runCli(site, 'resume-auto', s.env, root, s.state); const r5 = await runCli(site, 'run', s.env, root, s.state); const rep5 = jsonReport(s.state);
      check(rs.code === 0 && /resumed/.test(rs.out) && rep5.fixes.some((f) => f.outcome === 'published'), 'resume-auto clears the pause and the next run publishes (next day: the daily fix budget and page cooldown apply)', rs.out + JSON.stringify(rep5.fixes && rep5.fixes.map((f) => [f.id, f.outcome])));

      section('E14d: site down after restart, restart command failure, push failure, failed rollback');
      s = await fresh(); await runCli(site, 'dry-run', s.env, root, s.state); ctrl.queue.push('crash'); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.fixes[0].outcome === 'rolled-back' && prodHead() === baseHead && (await http_(site.base + '/robots.txt')).status === 200, 'site down after the restart -> rolled back, restarted and serving again', JSON.stringify(rep.fixes[0].trace));
      s = await fresh(); await runCli(site, 'dry-run', s.env, root, s.state); ctrl.queue.push('fail'); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.fixes[0].outcome === 'rolled-back' && prodHead() === baseHead && originHead() === baseHead && rep.fixes[0].trace.some((t) => t.name === 'restart' && !t.ok), 'a failing restart command -> rolled back, origin untouched', JSON.stringify(rep.fixes[0].trace));
      s = await fresh(); await runCli(site, 'dry-run', s.env, root, s.state); const hookFile = path.join(bare, 'hooks', 'pre-receive'); fs.writeFileSync(hookFile, '#!/bin/sh\nexit 1\n'); fs.chmodSync(hookFile, 0o755);
      r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state); fs.rmSync(hookFile, { force: true });
      check(rep.fixes[0].outcome === 'rolled-back' && prodHead() === baseHead && originHead() === baseHead && rep.fixes[0].trace.some((t) => t.name === 'push' && !t.ok), 'push rejected by origin -> the live release is withdrawn so server and origin stay consistent', JSON.stringify(rep.fixes[0].trace));
      check(!(await liveBody(rep.fixes[0].page)).includes(`href="${rep.fixes[0].target}"`), 'after the withdrawn release the live site serves the previous version');
      s = await fresh({ AUTOPILOT_ALERT_WEBHOOK: hook.base }); await runCli(site, 'dry-run', s.env, root, s.state); ctrl.queue.push('norestart', 'fail'); const nPosts = hook.posts.length; r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(r.code === 1 && rep.status === 'failed' && rep.fixes[0].outcome === 'rollback-failed' && rep.health.some((i) => i.id === 'release' && i.level === 'fail') && hook.posts.length > nPosts, 'a FAILED rollback is a failed run: exit code 1, a "fail" health item and an alert', r.out + rep.status);
      check(prodHead() === baseHead, 'even when the restart cannot be completed, the code on disk is back at the previous commit');

      section('E14e: guards - not at the remote release commit, not configured, protected paths, AI patches never auto-publish');
      s = await fresh(); await runCli(site, 'dry-run', s.env, root, s.state);
      const ahead = git(site.repo, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'someone else deployed'); git(site.repo, 'push', '-q', 'origin', `${ahead}:refs/heads/main`);
      r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.fixes[0].outcome === 'proposed' && prodHead() === baseHead && originHead() === ahead && !JSON.parse(fs.readFileSync(path.join(s.state, 'state.json'), 'utf8')).autoPaused && rep.fixes[0].trace.some((t) => t.name === 'preflight' && !t.ok && /differs/.test(t.detail)), 'production HEAD != origin/main -> nothing is changed or restarted, the fix stays a review branch, no pause', JSON.stringify(rep.fixes[0].trace));
      check(rep.health.some((i) => i.id === 'auto-preflight'), 'a refused publication is a visible health item with a remedy');
      s = await fresh(); await runCli(site, 'dry-run', s.env, root, s.state); const local = git(site.repo, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'unpushed release'); git(site.repo, 'update-ref', 'refs/heads/main', local);
      r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.fixes[0].outcome === 'proposed' && prodHead() === local && originHead() === baseHead && rep.fixes[0].trace.some((t) => t.name === 'preflight' && !t.ok && /AHEAD of .*unpushed/.test(t.detail)), 'unpushed commits on the server (an interrupted release) are detected, explained, and nothing is published on top of them', JSON.stringify(rep.fixes[0].trace));
      s = await fresh({ AUTOPILOT_RESTART_CMD: '' }); await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.auto.enabled === false && /AUTOPILOT_RESTART_CMD/.test(rep.auto.reason) && rep.fixes[0].outcome === 'proposed' && prodHead() === baseHead && rep.health.some((i) => i.id === 'auto-config') && ctrl.calls >= 0, 'auto mode without a restart command is reported as misconfigured and never publishes', rep.auto.reason);
      const mkCommit = (file, text) => { git(site.repo, 'checkout', '-q', '-b', 'tmp-guard', baseHead); fs.appendFileSync(path.join(site.repo, file), text); git(site.repo, 'add', '--', file); git(site.repo, 'commit', '-q', '-m', 'guard test'); const sha = git(site.repo, 'rev-parse', 'HEAD'); git(site.repo, 'checkout', '-q', 'main'); git(site.repo, 'branch', '-D', 'tmp-guard'); git(site.repo, 'update-ref', `refs/test/${sha.slice(0, 8)}`, sha); return sha; };
      s = await fresh(); const cfgG = require('../autopilot/config').loadConfig({ AUTOPILOT_ENV_FILE: '/nonexistent', AUTOPILOT_REPO_DIR: site.repo, AUTOPILOT_STATE_DIR: s.state, AUTOPILOT_FETCH_BASE: site.base, AUTOPILOT_RESTART_CMD: RESTART, AUTOPILOT_GATE_HARDCHECK: '0' });
      for (const [file, label] of [['lib/mailer.js', 'a protected mail file'], ['routes/admin.js', 'an admin route'], ['package.json', 'a file outside the SEO allow-list']]) {
        if (!fs.existsSync(path.join(site.repo, file))) continue; const sha = mkCommit(file, '\n// guard\n'); const calls0 = ctrl.calls; const res = await publishLib.publishFix(cfgG, { sha, changedPages: ['/'], expect: [], baselineAudit: [] });
        check(res.published === false && res.rolledBack === false && prodHead() === baseHead && originHead() === baseHead && ctrl.calls === calls0 && res.steps[0].name === 'preflight' && !res.steps[0].ok, `protected-path guard refuses ${label}: nothing merged, restarted or pushed`, JSON.stringify(res.steps));
      }
      fs.appendFileSync(path.join(site.repo, 'views/links.js'), '\n// dirty\n'); const resD = await publishLib.publishFix(cfgG, { sha: mkCommit('views/guides.js', '\n// x\n'), changedPages: ['/'], expect: [], baselineAudit: [] });
      check(!resD.published && /not clean/.test(resD.error), 'a modified tracked file in the production tree stops publication', resD.error); git(site.repo, 'checkout', '--', 'views/links.js');
      const aiAuto = await fresh({ AUTOPILOT_AI_MODE: 'openai', AUTOPILOT_AI_BASE_URL: ai.base, AUTOPILOT_AI_MODEL: 'm', AUTOPILOT_AI_API_KEY: AI_KEY, AUTOPILOT_MIN_INLINKS: '3' });
      await runCli(site, 'dry-run', aiAuto.env, root, aiAuto.state); r = await runCli(site, 'run', aiAuto.env, root, aiAuto.state); rep = jsonReport(aiAuto.state);
      check(rep.auto.published.length === 0 && prodHead() === baseHead && rep.changes.every((c) => branches(site.repo).includes(c.branch)) && rep.changes.length >= 1, 'AI-written changes are never published automatically: they stay on a review branch even in auto mode', r.out + JSON.stringify(rep.changes && rep.changes.map((c) => c.page)));

      section('E14f: patch validation for the related-link fix, planner, target keywords');
      const okPatch = fixersLib.plan({ repoDir: site.repo, inv: { pages: Object.fromEntries(fixersLib.parseGuides(site.repo).map((g) => ['/guides/' + g.slug, { indexable: true, linksIn: 1, linksOut: [] }])) }, findings: [{ code: 'few-inlinks', path: '/guides/what-is-besan', message: 'x' }], opportunities: [] })[0];
      check(okPatch && patchLib2.validate(okPatch.patches[0], { repoDir: site.repo }).ok, 'the planner emits a patch that validates');
      const badVariants = [['unknown slug', (p) => ({ ...p, replace: p.replace.replace(/'[a-z0-9-]+'\]$/, "'no-such-guide']") })], ['two slugs added', (p) => ({ ...p, replace: p.replace.replace(/\]$/, ", 'maida-vs-atta']") })], ['self link', (p) => ({ ...p, replace: p.replace.replace(/'[a-z0-9-]+'\]$/, `'${p.page.slice('/guides/'.length)}']`) })], ['existing slug removed', (p) => ({ ...p, replace: p.replace.replace(/^related: \['[a-z0-9-]+', /, 'related: [') })], ['markup', (p) => ({ ...p, replace: p.replace.replace(/\]$/, ", '<b>']") })], ['wrong file', (p) => ({ ...p, file: 'lib/mailer.js' })], ['not a guide', (p) => ({ ...p, page: '/wholesale-flour-supplier' })]];
      for (const [label, mut] of badVariants) check(!patchLib2.validate(mut(okPatch.patches[0]), { repoDir: site.repo }).ok, `related patch rejected: ${label}`);
      const nofix = fixersLib.plan({ repoDir: site.repo, inv: { pages: { '/guides/what-is-besan': { indexable: true, linksIn: 40, linksOut: [] } } }, findings: [], opportunities: [] });
      check(nofix.length === 0, 'a well-linked site produces no fix (nothing is changed for the sake of it)');
      const kfile = path.join(root, 'kw.txt'); fs.writeFileSync(kfile, '# target keywords\nbesan\nzzz no such query anywhere\n'); const kcfg = { targetKeywordsFile: kfile };
      const rowsC = [{ keys: ['besan', 'https://x/p'], clicks: 2, impressions: 40, position: 9 }, { keys: ['old query', 'https://x/p'], clicks: 0, impressions: 3, position: 30 }]; const rowsP = [{ keys: ['besan', 'https://x/p'], clicks: 1, impressions: 20, position: 11 }, { keys: ['lost query', 'https://x/p'], clicks: 1, impressions: 12, position: 8 }];
      const kt = keywordsLib.track(kcfg, rowsC, rowsP, { available: true }); check(kt[0].status === 'data' && kt[0].current.impressions === 40 && kt[0].previous.impressions === 20 && kt[1].status === 'no_impressions', 'target keywords: measured values for found queries, a true zero ("no impressions") for absent ones');
      const ku = keywordsLib.track(kcfg, [], [], { available: false, status: 'auth_invalid' }); check(ku.every((k) => k.status === 'unavailable'), 'target keywords: unavailable Google data is never reported as zero');
      const lq = keywordsLib.lostQueries(rowsC, rowsP); check(lq.length === 1 && lq[0].query === 'lost query' && keywordsLib.lostQueries([], rowsP).length === 0, 'lost queries are reported only from real data in both windows');
      s = scenario({ AUTOPILOT_TARGET_KEYWORDS_FILE: kfile, AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); await runCli(site, 'dry-run', s.env, root, s.state); await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.keywords.length === 2 && rep.keywords.every((k) => ['data', 'no_impressions'].includes(k.status)), 'a run with Google connected reports the target keywords from authenticated data', JSON.stringify(rep.keywords));
      google.mode = 'authfail'; await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state); check(rep.keywords.length === 2 && rep.keywords.every((k) => k.status === 'unavailable'), 'with Google auth failing the keywords are "unavailable", not zero');
      untouched('E14');
      resetOrigin();
    }

    // ---- E15 activation gate, change ledger, new audits, indexing monitoring, target keywords, Semrush
    if (want('e15')) {
      const keywordsLib = require('../autopilot/lib/keywords'); const semrushLib = require('../autopilot/lib/semrush');
      const indexingLib = require('../autopilot/lib/indexing'); const { auditInventory } = require('../autopilot/lib/audit'); const oppLib = require('../autopilot/lib/opportunity'); const inventoryLib = require('../autopilot/lib/inventory');
      const bare = path.join(root, 'origin-e15.git'); git(root, 'init', '-q', '--bare', '-b', 'main', bare);
      try { git(site.repo, 'remote', 'remove', 'origin'); } catch (e) { /* none yet */ }
      git(site.repo, 'remote', 'add', 'origin', bare);
      const resetOrigin = () => git(site.repo, 'push', '-q', '-f', 'origin', `${baseHead}:refs/heads/main`);
      const prodHead = () => git(site.repo, 'rev-parse', 'HEAD'); const originHead = () => git(bare, 'rev-parse', 'main');
      const ctrl = { queue: [] };
      ctrl.server = http.createServer(async (req, res) => { const m = ctrl.queue.length ? ctrl.queue.shift() : 'ok'; if (m === 'norestart') { res.writeHead(200); return res.end('ok'); } await site.restart(); res.writeHead(200); res.end('ok'); });
      await new Promise((r) => ctrl.server.listen(0, '127.0.0.1', r)); cleanups.push(() => ctrl.server.close());
      const restartJs = path.join(root, 'restart15.js');
      fs.writeFileSync(restartJs, "require('http').get('http://127.0.0.1:' + process.argv[2] + '/', (r) => { r.resume(); r.on('end', () => process.exit(r.statusCode === 200 ? 0 : 1)); }).on('error', () => process.exit(1));");
      const RESTART = `node ${restartJs.replace(/\\/g, '/')} ${ctrl.server.address().port}`;
      const autoEnv = (extra) => Object.assign({ AUTOPILOT_MODE: 'auto', AUTOPILOT_RESTART_CMD: RESTART, AUTOPILOT_MIN_INLINKS: '10', AUTOPILOT_VERIFY_TIMEOUT_MS: '20000', AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }, extra || {});
      const fresh = async (extra) => { const s = scenario(autoEnv(extra)); resetOrigin(); ctrl.queue.length = 0; await site.restart(); return s; };
      const ledgerLast = (st) => JSON.parse(fs.readFileSync(path.join(st, 'last-run.json'), 'utf8'));

      section('E15a: AUTOPILOT_MODE=auto alone never publishes: it needs an activation that passes every readiness check');
      let s = await fresh(undefined, true); await runCli(site, 'dry-run', s.env, root, s.state); let r = await runCli(site, 'run', s.env, root, s.state); let rep = jsonReport(s.state);
      check(rep.auto.enabled === false && /activate-auto/.test(rep.auto.reason) && rep.fixes[0].outcome === 'proposed' && prodHead() === baseHead && rep.health.some((i) => i.id === 'auto-config' && /activate-auto/.test(i.remedy)), 'without activation the fix is only a review branch and the report names the command to run', rep.auto.reason);
      cleanBranches(site.repo); s = await fresh(undefined, true); // a clean state for the activation checks (the run above left a proposal in its history)
      fs.appendFileSync(path.join(site.repo, 'views/links.js'), '\n// dirty\n'); r = await runCli(site, 'activate-auto', s.env, root, s.state);
      check(r.code === 1 && /FAIL clean-tree/.test(r.out) && /NOT ACTIVATED/.test(r.out) && !fs.existsSync(path.join(s.state, 'auto-activation.json')), 'activate-auto refuses (exit 1, nothing recorded) when the production tree is modified', r.out); git(site.repo, 'checkout', '--', 'views/links.js');
      const ahead = git(site.repo, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'x'); git(site.repo, 'push', '-q', 'origin', `${ahead}:refs/heads/main`); r = await runCli(site, 'activate-auto', s.env, root, s.state);
      check(r.code === 1 && /FAIL at-remote-release/.test(r.out), 'activate-auto refuses when production is not at origin/main', r.out); resetOrigin();
      r = await runCli(site, 'activate-auto', Object.assign({}, s.env, { AUTOPILOT_GIT_REMOTE: 'nonexistent-remote' }), root, s.state);
      check(r.code === 1 && /FAIL (at-remote-release|push-access)/.test(r.out), 'activate-auto refuses when the remote cannot be reached', r.out);
      r = await runCli(site, 'activate-auto', Object.assign({}, s.env, { AUTOPILOT_RESTART_CMD: '' }), root, s.state); check(r.code === 1 && /FAIL configuration/.test(r.out), 'activate-auto refuses without a restart command');
      r = await runCli(site, 'activate-auto', s.env, root, s.state);
      check(r.code === 0 && /ACTIVATED/.test(r.out) && /PASS push-access/.test(r.out) && /PASS write-access/.test(r.out) && /PASS live-smoke/.test(r.out) && !r.out.includes(RESTART) && fs.existsSync(path.join(s.state, 'auto-activation.json')), 'activate-auto passes all readiness checks, records the activation, and prints no secret/command', r.out);
      check(originHead() === baseHead && prodHead() === baseHead, 'the readiness checks changed nothing (the push check is a dry run)');
      let st1 = JSON.parse(await runCli(site, 'status', s.env, root, s.state).then((x) => x.out)); check(st1.autoPublish.activated === true, 'status reports the activation');
      r = await runCli(site, 'status', Object.assign({}, s.env, { AUTOPILOT_RESTART_CMD: RESTART + ' ' }), root, s.state); check(JSON.parse(r.out).autoPublish.activated === false, 'changing the restart command voids the activation');
      r = await runCli(site, 'status', Object.assign({}, s.env, { AUTOPILOT_GIT_BRANCH: 'release' }), root, s.state); check(JSON.parse(r.out).autoPublish.activated === false, 'changing the release branch voids the activation');
      await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.auto.enabled && rep.fixes.some((f) => f.outcome === 'published') && originHead() === prodHead() && prodHead() !== baseHead, 'with a valid activation the same configuration publishes, verified live, and origin has the release', r.out + JSON.stringify(rep.auto));
      r = await runCli(site, 'deactivate-auto', s.env, root, s.state); check(r.code === 0 && !fs.existsSync(path.join(s.state, 'auto-activation.json')), 'deactivate-auto removes the activation immediately');

      section('E15b: persistent change ledger (old/new value, commit, verification, rollback) and weekly summary');
      const ch = (await runCli(site, 'changes', s.env, root, s.state)).out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)); const c0 = ch[ch.length - 1] || {};
      check(ch.length >= 1 && c0.outcome === 'published' && c0.published === true && c0.releasedCommit === prodHead() && /^[0-9a-f]{40}$/.test(c0.previousCommit) && c0.previousCommit === baseHead, 'the ledger records the release commit and the previous commit', JSON.stringify(c0).slice(0, 400));
      check(c0.change && c0.change[0] && /^related: \[/.test(c0.change[0].old) && /^related: \[/.test(c0.change[0].new) && c0.change[0].new.length > c0.change[0].old.length && c0.change[0].file.startsWith('views/guides'), 'the ledger records the old value and the new value of the change');
      check(c0.verification.some((v) => v.name === 'verify-live' && v.ok) && c0.verification.some((v) => v.name === 'push' && v.ok) && c0.rollback && c0.rollback.attempted === false, 'the ledger records the verification steps and that no rollback was needed');
      const wk = await runCli(site, 'weekly', s.env, root, s.state); const wkMd = fs.readdirSync(path.join(s.state, 'reports')).filter((n) => /^weekly-.*\.md$/.test(n)).map((n) => fs.readFileSync(path.join(s.state, 'reports', n), 'utf8')).join('');
      check(wk.code === 0 && /## Changes this week/.test(wkMd) && /published/.test(wkMd) && wkMd.includes(String(c0.releasedCommit).slice(0, 8)), 'the weekly summary lists the change that was published', wkMd.slice(-500));
      s = await fresh(); await runCli(site, 'dry-run', s.env, root, s.state); await runCli(site, 'activate-auto', s.env, root, s.state); ctrl.queue.push('norestart'); r = await runCli(site, 'run', s.env, root, s.state);
      const ch2 = (await runCli(site, 'changes', s.env, root, s.state)).out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)); const c1 = ch2[ch2.length - 1] || {};
      check(c1.outcome === 'rolled-back' && c1.published === false && c1.releasedCommit === null && c1.rollback.attempted === true && c1.rollback.ok === true && c1.verification.some((v) => v.name === 'verify-live' && !v.ok) && c1.verification.some((v) => v.name === 'rollback-verify' && v.ok), 'a rolled-back change is ledgered with the failed verification and the successful rollback', JSON.stringify(c1).slice(0, 500));
      check(prodHead() === baseHead && originHead() === baseHead, 'and production/origin are back at the previous commit');
      const before = ch2.length; await runCli(site, 'run', s.env, root, s.state); const ch3 = (await runCli(site, 'changes', s.env, root, s.state)).out.split('\n').filter((l) => l.startsWith('{')).length;
      check(ch3 >= before, 'the change ledger is append-only');

      section('E15c: technical audit detects conflicting and inconsistent metadata');
      const mk = (over) => Object.assign({ title: 'A reasonable title for this page here', description: 'x'.repeat(130), h1: ['H'], canonical: 'https://devmamflourishfoods.com/a', indexable: true, inSitemap: true, jsonLdTypes: [], jsonLdNodes: [], jsonLdErrors: [], imgMissingAlt: 0, linksIn: 5, linksOut: [], words: 400, metaRobots: 'index,follow', xRobots: '', ogUrl: 'https://devmamflourishfoods.com/a' }, over);
      const invS = (pages, extra) => Object.assign({ origin: 'https://devmamflourishfoods.com', pages, nonOk: [], sitemapPaths: Object.keys(pages), robotsStatus: 200, robotsTxt: 'User-agent: *\nDisallow: /admin\nSitemap: https://devmamflourishfoods.com/sitemap.xml\n' }, extra || {});
      const codes = (inv) => auditInventory(inv, { origin: inv.origin }).map((f) => f.code);
      check(codes(invS({ '/a': mk() })).length === 0, 'a consistent page produces no finding');
      check(codes(invS({ '/a': mk({ ogUrl: 'https://devmamflourishfoods.com/b' }) })).includes('og-url-mismatch'), 'og:url that disagrees with the canonical is flagged');
      check(codes(invS({ '/a': mk({ xRobots: 'noindex' }) })).includes('robots-conflict'), 'meta robots "index" with an X-Robots-Tag noindex header is flagged as a conflict');
      check(codes(invS({ '/a': mk(), '/b': mk({ inSitemap: false, canonical: 'https://devmamflourishfoods.com/b', ogUrl: 'https://devmamflourishfoods.com/b', title: 'Another reasonable title for page b', description: 'y'.repeat(130) }) }, { sitemapPaths: ['/a'] })).includes('indexable-not-in-sitemap'), 'an indexable self-canonical page missing from the sitemap is flagged');
      check(codes(invS({ '/a': mk() }, { nonOk: [{ path: '/a', status: 301, location: '/c' }] })).includes('sitemap-redirect'), 'a sitemap URL that redirects is flagged');
      check(codes(invS({ '/a': mk() }, { robotsTxt: 'User-agent: *\nDisallow: /admin\nSitemap: https://other.example/sitemap.xml\n' })).includes('robots-sitemap-line') && codes(invS({ '/a': mk() }, { robotsTxt: 'User-agent: *\nDisallow: /admin\n' })).includes('robots-sitemap-line'), 'robots.txt with a missing or different Sitemap line is flagged');
      check(codes(invS({ '/a': mk(), '/b': mk({ canonical: 'https://devmamflourishfoods.com/b', ogUrl: 'https://devmamflourishfoods.com/b' }) })).filter((c) => c === 'duplicate-title' || c === 'duplicate-description').length === 2, 'duplicate titles and descriptions are still detected');
      check(codes(invS({ '/a': mk({ title: '', description: '' }) })).includes('title-missing') && codes(invS({ '/a': mk({ canonical: 'https://devmamflourishfoods.com/zzz' }) })).includes('canonical-mismatch'), 'missing and incorrect metadata are still detected');
      const liveInv = await inventoryLib.build(site.base, { origin: 'https://devmamflourishfoods.com' }); check(auditInventory(liveInv, { origin: liveInv.origin }).length === 0, 'the real site (served locally) has no finding: the new audits create no false positives');

      section('E15d: Search Console sitemap status and indexing discrepancies');
      google.sitemapCount = liveInv.sitemapPaths.length;
      s = scenario({ AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.sitemapStatus && rep.sitemapStatus.submitted === true && rep.sitemapStatus.errors === 0 && rep.sitemapStatus.problems.length === 0 && rep.indexing.length === 0 && !rep.health.some((i) => i.id === 'sitemap-status' || i.id === 'indexing'), 'healthy Search Console state: sitemap known, no errors, no discrepancy', JSON.stringify(rep.sitemapStatus) + JSON.stringify(rep.indexing));
      google.mode = 'sitemaperr'; s = scenario({ AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); google.mode = 'sitemaperr'; await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.sitemapStatus.errors === 2 && rep.sitemapStatus.problems.some((p) => /2 error/.test(p)) && rep.health.some((i) => i.id === 'sitemap-status' && i.level === 'warn'), 'sitemap errors reported by Google become a visible warning with a remedy', JSON.stringify(rep.sitemapStatus));
      s = scenario({ AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); google.mode = 'sitemapnone'; await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.sitemapStatus.submitted === false && rep.sitemapStatus.problems.some((p) => /no record/.test(p)), 'a sitemap Google has never seen is reported as such (not an error)');
      s = scenario({ AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); google.mode = 'inspectbad'; await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.indexing.length >= 1 && rep.indexing.some((x) => x.code === 'not-indexed') && rep.indexing.some((x) => x.code === 'canonical-differs') && rep.health.some((i) => i.id === 'indexing'), 'URL Inspection results that disagree with the site are reported as discrepancies', JSON.stringify(rep.indexing.slice(0, 2)));
      check(!/guarantee|will be indexed/i.test(JSON.stringify(rep.health.filter((i) => i.id === 'indexing' || i.id === 'sitemap-status').map((i) => i.remedy)).replace(/not a (promise|guarantee)[^"]*/gi, '')), 'no message promises indexing');
      const dsc = indexingLib.discrepancies([{ url: 'https://devmamflourishfoods.com/a', verdict: 'PASS', googleCanonical: 'https://devmamflourishfoods.com/a', userCanonical: 'https://devmamflourishfoods.com/a', robotsTxtState: 'ALLOWED', pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED' }, { url: 'https://devmamflourishfoods.com/b', error: 'quota' }], { pages: { '/a': { indexable: true } } });
      check(dsc.length === 0, 'inspection errors and passing pages produce no discrepancy');

      section('E15e: the 19 commercial target keywords');
      const KW = ['flour manufacturer India', 'flour supplier India', 'bulk flour supplier India', 'wholesale flour supplier', 'institutional flour supplier India', 'wheat flour supplier', 'flour mill manufacturer India', 'atta manufacturer India', 'bulk atta supplier', 'chakki atta supplier', 'maida manufacturer India', 'maida flour supplier', 'besan manufacturer India', 'besan supplier India', 'sooji manufacturer India', 'sooji supplier', 'semolina flour manufacturer', 'tandoori atta supplier', 'whole wheat flour manufacturer'];
      const kfile = require('../autopilot/config').loadConfig({ AUTOPILOT_ENV_FILE: '/nonexistent' }).targetKeywordsFile; const kl = keywordsLib.readKeywords({ targetKeywordsFile: path.join(SRC, 'autopilot/target-keywords.txt') }).list;
      check(kl.length === 19 && kl.join('|') === KW.map((k) => k.toLowerCase()).join('|'), 'the version-controlled keyword file holds exactly the 19 required keywords, in order', kl.join(', '));
      check(/target-keywords\.txt$/.test(String(kfile)) && require('../autopilot/config').loadConfig({ AUTOPILOT_ENV_FILE: '/nonexistent', AUTOPILOT_TARGET_KEYWORDS_FILE: '' }).targetKeywordsFile === '', 'the default configuration uses the repository file; an empty AUTOPILOT_TARGET_KEYWORDS_FILE switches tracking off');
      check(/AUTOPILOT_TARGET_KEYWORDS_FILE=\/var\/www\/mamta-bhoj-site\/autopilot\/target-keywords\.txt/.test(fs.readFileSync(path.join(SRC, 'deploy/autopilot/autopilot.env.example'), 'utf8')), 'the production environment template points AUTOPILOT_TARGET_KEYWORDS_FILE at that file');
      const kdup = path.join(root, 'kw-dup.txt'); fs.writeFileSync(kdup, '# c\n\nFlour  Supplier India\nflour supplier india\n  besan supplier india  \n'); check(keywordsLib.readKeywords({ targetKeywordsFile: kdup }).list.join('|') === 'flour supplier india|besan supplier india', 'parsing ignores comments, blank lines, case, extra spaces and duplicates');
      check(keywordsLib.readKeywords({ targetKeywordsFile: path.join(root, 'nope.txt') }).list.length === 0 && /cannot be read/.test(keywordsLib.readKeywords({ targetKeywordsFile: path.join(root, 'nope.txt') }).note), 'a missing keyword file is reported, not silently ignored');
      check(keywordsLib.matches('flour manufacturer in india', 'flour manufacturer india') && keywordsLib.matches('best bulk atta suppliers', 'bulk atta supplier') && !keywordsLib.matches('maida', 'maida flour supplier') && keywordsLib.matchTarget('wholesale flour supplier in kanpur', KW.map((k) => k.toLowerCase())) === 'wholesale flour supplier', 'query-to-keyword matching: variants match, partial queries do not');
      const tinv = (pages) => ({ pages: Object.fromEntries(Object.entries(pages).map(([p, v]) => [p, Object.assign({ title: '', description: '', h1: [], headings: [], text: '', indexable: true, inSitemap: true }, v)])) });
      const supplyPage = { title: 'Bulk flour supplier India', h1: ['Bulk flour supplier India'], description: 'bulk flour supplier', text: 'bulk flour supplier india for bakeries' }; const guidePage = { title: 'Flour supplier India guide', h1: ['Flour supplier India: how to choose a flour supplier'], description: 'flour supplier india guide flour supplier', headings: [{ level: 2, text: 'flour supplier india' }], text: 'flour supplier india flour supplier choose a flour supplier in india' };
      const cov = keywordsLib.coverage('flour supplier india', tinv({ '/bulk-flour-supplier-india': supplyPage, '/guides/how-to-choose-flour-supplier': guidePage })); check(cov.page === '/bulk-flour-supplier-india' && cov.competingGuide === '/guides/how-to-choose-flour-supplier', 'a supply keyword is mapped to the supply page; a guide that fits better is reported, not chosen', JSON.stringify(cov));
      check(keywordsLib.coverage('zzz unrelated quantum', tinv({ '/a': supplyPage })).level === 'none', 'a keyword no page fits is reported as a content gap (never creates a page)');
      const rowsC = [{ keys: ['flour manufacturer in india', 'https://devmamflourishfoods.com/guides/how-flour-is-made'], clicks: 3, impressions: 60, position: 12 }, { keys: ['flour manufacturer india', 'https://devmamflourishfoods.com/'], clicks: 1, impressions: 20, position: 9 }]; const rowsP = [{ keys: ['flour manufacturer india', 'https://devmamflourishfoods.com/'], clicks: 0, impressions: 30, position: 14 }];
      const tr = keywordsLib.track({ targetKeywordsFile: path.join(SRC, 'autopilot/target-keywords.txt') }, rowsC, rowsP, { available: true }, liveInv); const k0 = tr.find((x) => x.keyword === 'flour manufacturer india');
      check(tr.length === 19 && k0.status === 'data' && k0.current.impressions === 80 && k0.previous.impressions === 30 && k0.current.exact.impressions === 20 && k0.current.queryCount === 2 && k0.shownPage === '/guides/how-flour-is-made' && k0.mismatch === true && k0.coverage.page === '/flour-manufacturer-india' && k0.change.impressions === 50, 'all 19 keywords tracked: matching-query totals, exact totals, shown page, a page mismatch against the best-fitting page, period change', JSON.stringify(k0).slice(0, 500));
      check(tr.filter((x) => x.status === 'no_impressions').length === 18 && tr.every((x) => x.coverage), 'the other 18 keywords are a true "no impressions" (not invented), each with a content-coverage verdict');
      const tu = keywordsLib.track({ targetKeywordsFile: path.join(SRC, 'autopilot/target-keywords.txt') }, [], [], { available: false, status: 'auth_invalid' }, liveInv); check(tu.length === 19 && tu.every((x) => x.status === 'unavailable' && x.coverage.page), 'with unauthenticated Google data every keyword is "unavailable" (not zero) but the content coverage is still reported');
      const oq = oppLib.analyse(rowsC, rowsP, liveInv, { limits: { minScore: 40 } }, { match: (q) => keywordsLib.matchTarget(q, KW.map((k) => k.toLowerCase())) }); const oq0 = oppLib.analyse(rowsC, rowsP, liveInv, { limits: { minScore: 40 } });
      check(oq.every((o) => o.targetKeyword) && oq.every((o) => o.flags.includes('target keyword')) && oq[0].score >= oq0.find((o) => o.query === oq[0].query).score, 'opportunity analysis recognises target keywords (flag and a modest score boost)');
      s = scenario({ AUTOPILOT_TARGET_KEYWORDS_FILE: path.join(SRC, 'autopilot/target-keywords.txt'), AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); await runCli(site, 'dry-run', s.env, root, s.state); await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      const md = fs.readFileSync(path.join(s.state, 'reports', fs.readdirSync(path.join(s.state, 'reports')).filter((n) => /^report-.*\.md$/.test(n)).sort().pop()), 'utf8');
      check(rep.keywords.length === 19 && rep.keywords.every((k) => k.coverage) && /Target keywords/.test(md) && /flour manufacturer india/.test(md), 'a run reports all 19 keywords with Search Console data and content coverage', JSON.stringify(rep.keywords.map((k) => k.status)));

      section('E15f: Semrush (fixtures only): missing key, no units, no data and real data are different states');
      const smx = { mode: 'ok', calls: 0, urls: [] };
      smx.server = http.createServer((req, res) => {
        smx.calls++; smx.urls.push(req.url); const q = new URL(req.url, 'http://x'); const phrase = q.searchParams.get('phrase') || '';
        if (smx.mode === 'rate') { res.writeHead(429); return res.end('slow down'); }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        if (smx.mode === 'units') return res.end('ERROR 132 :: API UNITS BALANCE IS ZERO');
        if (smx.mode === 'badkey') return res.end('ERROR 120 :: WRONG KEY - ID PAIR');
        if (smx.mode === 'nothing' || /zzz/.test(phrase)) return res.end('ERROR 50 :: NOTHING FOUND');
        res.end(`Keyword;Search Volume;CPC;Competition\n${phrase};${phrase.length * 10};0.5;0.4\n`);
      });
      await new Promise((rs) => smx.server.listen(0, '127.0.0.1', rs)); cleanups.push(() => smx.server.close()); smx.base = `http://127.0.0.1:${smx.server.address().port}`;
      const SKEY = 'semrush-key-0123456789abcdef'; const scfg = (extra) => ({ semrush: Object.assign({ apiKey: SKEY, base: smx.base, database: 'in', maxKeywords: 19 }, extra || {}) });
      let sc0 = await semrushLib.collect({ semrush: { apiKey: '' } }, KW, null); check(sc0.status === 'not_configured' && sc0.items.length === 0 && smx.calls === 0, 'no API key: not_configured, no request is made, and nothing is reported as zero');
      const cdir = path.join(root, 'semcache'); smx.calls = 0; let sc1 = await semrushLib.collect(scfg(), ['flour supplier india', 'zzz nothing here'], cdir);
      check(sc1.status === 'ok' && sc1.items[0].state === 'data' && sc1.items[0].volume === 200 && sc1.items[1].state === 'no_data' && smx.calls === 2, 'ok: a number for a keyword with data, "no_data" for a keyword Semrush has nothing on (ERROR 50 is a genuine absence)', JSON.stringify(sc1));
      smx.calls = 0; const sc1b = await semrushLib.collect(scfg(), ['flour supplier india', 'zzz nothing here'], cdir); check(smx.calls === 0 && sc1b.items.every((i) => i.cached), 'results are cached 7 days: a second collection spends no API units');
      smx.mode = 'units'; smx.calls = 0; const sc2 = await semrushLib.collect(scfg(), KW, null); check(sc2.status === 'no_units' && sc2.items.length === 19 && sc2.items.every((i) => i.state === 'unavailable') && smx.calls === 1 && /not a zero/.test(sc2.remedy), 'zero API units: status no_units, every keyword "unavailable" (never 0), and the batch stops after one request', JSON.stringify(sc2).slice(0, 300));
      smx.mode = 'badkey'; smx.calls = 0; const sc3 = await semrushLib.collect(scfg(), KW, null); check(sc3.status === 'auth_invalid' && smx.calls === 1 && !JSON.stringify(sc3).includes(SKEY), 'wrong key: auth_invalid, one request, and the key is never in the result');
      smx.mode = 'rate'; smx.calls = 0; process.env.AUTOPILOT_RETRY_BASE_MS = '5'; const sc4 = await semrushLib.collect(scfg(), KW, null); check(sc4.status === 'rate_limited' && smx.calls === 3, 'HTTP 429: bounded retries, then rate_limited', String(smx.calls));
      const sc5 = await semrushLib.collect(scfg({ base: 'http://127.0.0.1:1' }), KW, null); check(sc5.status === 'network' && sc5.items.every((i) => i.state === 'unavailable'), 'unreachable API: network, all unavailable');
      check(semrushLib.parse(200, 'ERROR 131 :: LIMIT EXCEEDED').kind === 'rate_limited' && semrushLib.parse(200, 'ERROR 999 :: ???').kind === 'api_error' && semrushLib.parse(200, 'garbage').kind === 'api_error', 'other Semrush answers are classified conservatively');
      smx.mode = 'ok'; s = scenario({ AUTOPILOT_TARGET_KEYWORDS_FILE: path.join(SRC, 'autopilot/target-keywords.txt'), AUTOPILOT_SEMRUSH_API_KEY: SKEY, AUTOPILOT_SEMRUSH_BASE: smx.base, AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      check(rep.semrush.status === 'ok' && rep.semrush.items.length === 19 && rep.keywords.every((k) => k.semrush && k.semrush.state === 'data') && !JSON.stringify(rep).includes(SKEY) && !r.out.includes(SKEY), 'a run attaches Semrush volume to the 19 keywords and never writes the key into the report or output');
      smx.mode = 'units'; s = scenario({ AUTOPILOT_TARGET_KEYWORDS_FILE: path.join(SRC, 'autopilot/target-keywords.txt'), AUTOPILOT_SEMRUSH_API_KEY: SKEY, AUTOPILOT_SEMRUSH_BASE: smx.base, AUTOPILOT_NOW: '2026-10-13T04:00:00Z' }); await runCli(site, 'dry-run', s.env, root, s.state); r = await runCli(site, 'run', s.env, root, s.state); rep = jsonReport(s.state);
      const md2 = fs.readFileSync(path.join(s.state, 'reports', fs.readdirSync(path.join(s.state, 'reports')).filter((n) => /^report-.*\.md$/.test(n)).sort().pop()), 'utf8');
      check(rep.semrush.status === 'no_units' && rep.health.some((i) => i.id === 'semrush' && i.level === 'warn') && /NOT MEASURED/.test(md2) && r.code === 0, 'a run with no Semrush units degrades visibly ("NOT MEASURED"), does not fail, and shows no invented volume');
      untouched('E15'); resetOrigin();
    }

    // ---- E16 root-owned restart helper (fixed command, no sudo) and the auto-publish install with it
    if (want('helper')) {
      section('E16: restart helper - one fixed pm2 command, request content never interpreted, no sudo');
      const HD = path.join(SRC, 'deploy/autopilot/restart-helper'); const posix = (p) => p.replace(/\\/g, '/');
      const helperSrc = fs.readFileSync(path.join(HD, 'mamta-autopilot-restart'), 'utf8').replace(/\r\n/g, '\n'); const reqSrc = fs.readFileSync(path.join(HD, 'mamta-autopilot-restart-request'), 'utf8').replace(/\r\n/g, '\n');
      const consts = (src) => (src.match(/# CONSTANTS[^\n]*\n([\s\S]*?)# END CONSTANTS/) || [])[1] || '';
      check(/RUN_DIR=\/run\/mamta-autopilot-restart\n/.test(consts(helperSrc)) && /PM2_BIN=\/usr\/bin\/pm2\n/.test(consts(helperSrc)) && /APP=mamta-bhoj\n/.test(consts(helperSrc)) && /RUN_DIR=\/run\/mamta-autopilot-restart\n/.test(consts(reqSrc)), 'the shipped constants are the production ones (fixed run directory, /usr/bin/pm2, app mamta-bhoj)');
      const codeOnly = (src) => src.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
      check(!/\bsudo\b|\beval\b|\bsource\b|\bbash -c\b|\bsh -c\b/.test(codeOnly(helperSrc) + codeOnly(reqSrc)) && (codeOnly(helperSrc).match(/"\$PM2_BIN" restart "\$APP"/g) || []).length === 1 && !/PM2_BIN" (stop|delete|kill|start|reload|save|startup|update)/.test(codeOnly(helperSrc)), 'the helper has no sudo/eval/source/sh -c and its only action on PM2 is: restart "$APP"');
      const T = path.join(root, 'helper-test'); fs.mkdirSync(T, { recursive: true });
      const mkEnv = (name, o) => {
        const d = path.join(T, name); fs.mkdirSync(path.join(d, 'req'), { recursive: true }); fs.mkdirSync(path.join(d, 'res'), { recursive: true });
        const fake = path.join(d, 'fake-pm2'); const log = path.join(d, 'pm2.log');
        fs.writeFileSync(fake, `#!/bin/bash\necho "$@" >> '${posix(log)}'\ncase "$1" in\n  restart) exit ${o && o.restartFails ? 1 : 0} ;;\n  jlist) echo '[{"name":"mamta-bhoj","pm2_env":{"status":"${o && o.offline ? 'errored' : 'online'}"}},{"name":"other","pm2_env":{"status":"online"}}]' ;;\nesac\n`); fs.chmodSync(fake, 0o755);
        const hp = path.join(d, 'helper.sh'); fs.writeFileSync(hp, helperSrc.replace('RUN_DIR=/run/mamta-autopilot-restart', `RUN_DIR='${posix(d)}'`).replace('PM2_BIN=/usr/bin/pm2', `PM2_BIN='${posix(fake)}'`).replace('NODE_BIN=/usr/bin/node', `NODE_BIN='${posix(process.execPath)}'`).replace('PM2_HOME_DIR=/root/.pm2', `PM2_HOME_DIR='${posix(d)}/pm2home'`).replace('MIN_GAP=15', `MIN_GAP=${o && o.gap != null ? o.gap : 0}`).replace('ONLINE_WAIT=30', 'ONLINE_WAIT=2'));
        const rp = path.join(d, 'request.sh'); fs.writeFileSync(rp, reqSrc.replace('RUN_DIR=/run/mamta-autopilot-restart', `RUN_DIR='${posix(d)}'`).replace('WAIT=90', `WAIT=${o && o.wait != null ? o.wait : 6}`));
        return { d, hp, rp, log, run: () => spawnSync('bash', [hp], { encoding: 'utf8', env: Object.assign({}, process.env, { HOME: posix(d) }) }), calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []) };
      };
      let e = mkEnv('ok'); fs.writeFileSync(path.join(e.d, 'req', 'req.abcdef0123456789'), 'ignored content; touch ' + posix(path.join(e.d, 'PWNED')));
      let hr = e.run(); const resf = path.join(e.d, 'res', 'abcdef0123456789');
      check(hr.status === 0 && fs.existsSync(resf) && /^abcdef0123456789 ok \d{4}-/.test(fs.readFileSync(resf, 'utf8')) && fs.readdirSync(path.join(e.d, 'req')).length === 0 && e.calls()[0] === 'restart mamta-bhoj' && e.calls().filter((c) => c.startsWith('restart')).length === 1 && !fs.existsSync(path.join(e.d, 'PWNED')), 'a request restarts exactly "mamta-bhoj" once, answers ok with its own token, empties the request directory, and never interprets the request content', hr.stderr + e.calls().join('|'));
      check(e.calls().every((c) => c === 'restart mamta-bhoj' || c === 'jlist'), 'the only pm2 commands ever run are: restart mamta-bhoj and jlist (read-only status)', e.calls().join('|'));
      e = mkEnv('badnames'); for (const n of ['req.short', 'req.has space1234', 'req.$(touch PWNED2)', 'req.;touch PWNED3;', 'other.abcdefgh12', 'req.abcdefgh12/../x']) { try { fs.writeFileSync(path.join(e.d, 'req', n), 'x'); } catch (x) { /* a name the file system rejects is also fine */ } }
      hr = e.run(); check(e.calls().length === 0 && fs.readdirSync(path.join(e.d, 'res')).length === 0 && fs.readdirSync(path.join(e.d, 'req')).length === 0 && !fs.readdirSync(e.d).some((n) => /PWNED/.test(n)), 'malformed or hostile request names are discarded: no restart, no answer, nothing executed', e.calls().join('|'));
      e = mkEnv('symlink'); const victim = path.join(e.d, 'victim.txt'); fs.writeFileSync(victim, 'precious'); let linked = false;
      try { fs.symlinkSync(victim, path.join(e.d, 'req', 'req.symlink12345')); linked = true; } catch (x) { /* symlinks need privileges on Windows */ }
      if (linked) { hr = e.run(); check(fs.readFileSync(victim, 'utf8') === 'precious' && !fs.existsSync(path.join(e.d, 'req', 'req.symlink12345')) && fs.existsSync(victim), 'a symlinked request is removed as a link and never followed: its target is untouched'); } else skip('a symlinked request is never followed', 'creating symlinks needs elevated rights on this Windows account; asserted on Linux');
      e = mkEnv('gap', { gap: 3600 }); fs.writeFileSync(path.join(e.d, 'req', 'req.firstreq12345'), ''); e.run(); fs.writeFileSync(path.join(e.d, 'req', 'req.secondreq1234'), ''); hr = e.run();
      check(e.calls().filter((c) => c.startsWith('restart')).length === 1 && /busy/.test(fs.readFileSync(path.join(e.d, 'res', 'secondreq1234'), 'utf8')) && hr.status !== 0, 'a second request inside the minimum gap is answered "busy" and does not restart again');
      e = mkEnv('fail', { restartFails: true }); fs.writeFileSync(path.join(e.d, 'req', 'req.failedreq12345'), ''); hr = e.run(); check(/ failed /.test(fs.readFileSync(path.join(e.d, 'res', 'failedreq12345'), 'utf8')) && hr.status !== 0, 'a failing pm2 restart is answered "failed"');
      e = mkEnv('offline', { offline: true }); fs.writeFileSync(path.join(e.d, 'req', 'req.offlinereq12345'), ''); hr = e.run(); check(/ failed /.test(fs.readFileSync(path.join(e.d, 'res', 'offlinereq12345'), 'utf8')), 'a restart after which the app is not online is answered "failed", not "ok"');
      e = mkEnv('absent'); fs.rmSync(path.join(e.d, 'req'), { recursive: true }); hr = e.run(); check(hr.status === 0 && e.calls().length === 0, 'with no request directory the helper does nothing');
      // the requester (runs as the unprivileged service user)
      e = mkEnv('requester', { wait: 8 }); const rq = spawn('bash', [e.rp], { stdio: ['ignore', 'pipe', 'pipe'] }); let rqOut = ''; rq.stdout.on('data', (d) => (rqOut += d)); rq.stderr.on('data', (d) => (rqOut += d)); const rqDone = new Promise((r) => rq.on('close', r));
      let seen = null; for (let i = 0; i < 40 && !seen; i++) { await sleep(200); seen = fs.readdirSync(path.join(e.d, 'req')).find((n) => /^req\.[0-9a-f]{24}$/.test(n)); }
      check(!!seen, 'the request script creates a request file with a random 24-hex token'); e.run(); const code = await rqDone;
      check(code === 0 && /restarted at/.test(rqOut), 'the request script exits 0 only after the helper answered ok for its own token', rqOut);
      e = mkEnv('requester-timeout', { wait: 1 }); const to = spawnSync('bash', [e.rp], { encoding: 'utf8' }); check(to.status === 1 && /timed out/.test(to.stderr) && fs.readdirSync(path.join(e.d, 'req')).length === 0, 'without an answer the request script times out (exit 1) and withdraws its request');
      e = mkEnv('requester-busy', { wait: 6 }); const rq2 = spawn('bash', [e.rp], { stdio: ['ignore', 'pipe', 'pipe'] }); let o2 = ''; rq2.stderr.on('data', (d) => (o2 += d)); const d2 = new Promise((r) => rq2.on('close', r));
      let s2 = null; for (let i = 0; i < 40 && !s2; i++) { await sleep(200); s2 = fs.readdirSync(path.join(e.d, 'req')).find((n) => /^req\./.test(n)); } fs.writeFileSync(path.join(e.d, 'res', s2.slice(4)), `${s2.slice(4)} failed 2026-01-01T00:00:00Z\n`); check((await d2) === 1 && /restart was not done: failed/.test(o2), 'a "failed" answer makes the request script exit 1');
      e = mkEnv('requester-nodir'); fs.rmSync(path.join(e.d, 'req'), { recursive: true }); const nd = spawnSync('bash', [e.rp], { encoding: 'utf8' }); check(nd.status === 1 && /not installed/.test(nd.stderr), 'a missing helper installation is reported clearly (exit 1)');

      section('E16: installer - restart helper and the drop-in that matches it');
      const sh16 = (a) => spawnSync('bash', [path.join(SRC, 'deploy/autopilot/install-autopilot.sh'), ...a], { encoding: 'utf8' }); const pre3 = path.join(root, 'prefix-helper');
      let ir = sh16(['--user', 'deploy', '--prefix', pre3, '--node', process.execPath, '--repo', SRC, '--auto-publish', '--restart-helper']);
      const di3 = fs.existsSync(path.join(pre3, 'etc/systemd/system/mamta-autopilot.service.d/auto-publish.conf')) ? fs.readFileSync(path.join(pre3, 'etc/systemd/system/mamta-autopilot.service.d/auto-publish.conf'), 'utf8') : ''; const rw3 = (di3.match(/^ReadWritePaths=(.*)$/m) || [])[1] || '';
      check(ir.status === 0 && rw3.trim().split(/\s+/).length === 2 && /\/views$/.test(rw3.trim().split(/\s+/)[0]) && rw3.trim().split(/\s+/)[1] === '-/run/mamta-autopilot-restart/req' && !/pm2|\/home\/|\/root/.test(rw3.split(SRC).join('')) && !/@[A-Z0-9]+@/.test(di3), 'with the helper the drop-in grants write access to exactly the views directory and the restart-request directory (no PM2 path, no home directory)', ir.stdout + ir.stderr + di3);
      const need = ['usr/local/sbin/mamta-autopilot-restart', 'usr/local/bin/mamta-autopilot-restart-request', 'etc/systemd/system/mamta-autopilot-restart.service', 'etc/systemd/system/mamta-autopilot-restart.path', 'etc/tmpfiles.d/mamta-autopilot-restart.conf'];
      check(need.every((f) => fs.existsSync(path.join(pre3, f))) && !fs.existsSync(path.join(pre3, 'etc/sudoers.d')), 'the helper, the request command, both units and the tmpfiles entry are installed, and no sudoers rule is created');
      const tm = fs.readFileSync(path.join(pre3, 'etc/tmpfiles.d/mamta-autopilot-restart.conf'), 'utf8'); const hsvc = fs.readFileSync(path.join(pre3, 'etc/systemd/system/mamta-autopilot-restart.service'), 'utf8'); const hpath = fs.readFileSync(path.join(pre3, 'etc/systemd/system/mamta-autopilot-restart.path'), 'utf8');
      check(/^d \/run\/mamta-autopilot-restart\/req\s+1770 root deploy/m.test(tm) && /^d \/run\/mamta-autopilot-restart\/res\s+0755 root root/m.test(tm) && /^ExecStart=\/usr\/local\/sbin\/mamta-autopilot-restart$/m.test(hsvc) && /NoNewPrivileges=true/.test(hsvc) && /DirectoryNotEmpty=\/run\/mamta-autopilot-restart\/req/.test(hpath), 'request directory is sticky and writable only by root and the service user; the root unit runs the one fixed program; the path unit watches the request directory');
      if (WIN) skip('installed helper file modes (0750 helper, 0755 request command)', 'Windows/NTFS has no POSIX modes; asserted on Linux'); else check((fs.statSync(path.join(pre3, need[0])).mode & 0o777) === 0o750 && (fs.statSync(path.join(pre3, need[1])).mode & 0o777) === 0o755, 'installed helper file modes: 0750 helper, 0755 request command');
      // the installed ExecStart= program does not exist in a scratch prefix, so verify copies whose ExecStart points at /bin/true: this checks the unit syntax and the path-to-service link
      const vdir = path.join(root, 'verify-helper-units'); fs.mkdirSync(vdir, { recursive: true }); fs.writeFileSync(path.join(vdir, 'mamta-autopilot-restart.service'), hsvc.replace(/^ExecStart=.*$/m, 'ExecStart=/bin/true')); fs.writeFileSync(path.join(vdir, 'mamta-autopilot-restart.path'), hpath);
      const an3 = spawnSync('systemd-analyze', ['verify', path.join(vdir, 'mamta-autopilot-restart.service'), path.join(vdir, 'mamta-autopilot-restart.path')], { encoding: 'utf8' });
      if (an3.error) skip('systemd-analyze verify accepts the helper units', 'systemd-analyze is not installed on this machine'); else check(!/fatal|Unknown|error|Failed/i.test((an3.stdout || '') + (an3.stderr || '')), 'systemd-analyze verify accepts the helper units (service + path)', (an3.stdout || '') + (an3.stderr || ''));
      ir = sh16(['--user', 'deploy', '--dry-run', '--node', process.execPath, '--repo', SRC, '--auto-publish', '--restart-helper']); check(ir.status === 0 && /\[dry-run\] install .*mamta-autopilot-restart \(0750 root:root/.test(ir.stdout) && /no sudo rule is created/.test(ir.stdout), 'the installer dry-run prints the helper plan and says no sudo rule is created');
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
      check(/install -m 600 .*autopilot\.env/.test(sh('install-autopilot.sh', ['--user', 'deploy', '--dry-run', '--prefix', path.join(root, 'plan-only'), '--node', process.execPath, '--repo', SRC]).stdout), 'the installer plan creates the credentials file with mode 600 (checked on every platform)');
      if (WIN) skip('the credentials file is created with mode 600', 'Windows/NTFS cannot hold POSIX permission bits (Git Bash reports 644); asserted on Linux, where the CI job and the server run it');
      else check((fs.statSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env')).mode & 0o777) === 0o600, 'the credentials file is created with mode 600');
      check(/AUTOPILOT_MODE=report/.test(fs.readFileSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env'), 'utf8')), 'the default mode is report-only');
      fs.writeFileSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env'), 'AUTOPILOT_MODE=propose\n'); sh('install-autopilot.sh', ['--user', 'deploy', '--prefix', pre, '--node', process.execPath, '--repo', SRC]);
      check(/AUTOPILOT_MODE=propose/.test(fs.readFileSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env'), 'utf8')), 're-running the installer keeps an existing credentials file');
      const an = spawnSync('systemd-analyze', ['verify', path.join(pre, 'etc/systemd/system/mamta-autopilot.timer'), path.join(pre, 'etc/systemd/system/mamta-autopilot.service')], { encoding: 'utf8' });
      if (an.error) skip('systemd-analyze verify accepts the rendered units', 'systemd-analyze is not installed on this machine; the units are only checked structurally here'); else check(!/fatal|Unknown|error/i.test((an.stdout || '') + (an.stderr || '')), 'systemd-analyze verify accepts the rendered units', (an.stdout || '') + (an.stderr || ''));
      check(!fs.existsSync(path.join(pre, 'etc/systemd/system/mamta-autopilot.service.d')), 'a default install adds NO write-access drop-in (automatic publishing is opt-in)');
      // ---- least privilege and robustness of the installer
      check(/^User=deploy$/m.test(svc) && !/^User=(root|0)\b/m.test(svc) && /^NoNewPrivileges=true$/m.test(svc) && /^ProtectSystem=strict$/m.test(svc) && !/\bsudo\b/.test(svc.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')) && /^ReadWritePaths=\S+ \S+\/\.git$/m.test(svc), 'the unit runs as the unprivileged service user with NoNewPrivileges, a read-only file system (ProtectSystem=strict), no sudo, and write access only to the state directory and .git');
      r = sh('install-autopilot.sh', ['--user', 'root', '--dry-run', '--node', process.execPath, '--repo', SRC]); check(r.status === 2 && /refused/.test(r.stderr), 'the installer refuses --user root', r.stderr);
      r = sh('install-autopilot.sh', ['--user', 'bad user;x', '--dry-run', '--node', process.execPath, '--repo', SRC]); check(r.status === 2, 'the installer refuses an invalid account name');
      const spaced = path.join(root, 'repo with space'); fs.mkdirSync(path.join(spaced, 'autopilot'), { recursive: true }); fs.writeFileSync(path.join(spaced, 'autopilot/cli.js'), '');
      r = sh('install-autopilot.sh', ['--user', 'deploy', '--node', process.execPath, '--repo', spaced]); check(r.status === 2 && /unsafe path/.test(r.stderr) && !/sudo/.test(r.stderr), 'a real install refuses a repository path that would break the systemd unit (checked before anything is written)', r.stderr);
      const odd = path.join(root, 'odd&dir#x'); fs.mkdirSync(path.join(odd, 'autopilot'), { recursive: true }); fs.mkdirSync(path.join(odd, 'deploy/autopilot'), { recursive: true }); fs.writeFileSync(path.join(odd, 'autopilot/cli.js'), '');
      fs.cpSync(U, path.join(odd, 'deploy/autopilot'), { recursive: true });
      const preOdd = path.join(root, 'prefix-odd'); r = sh('install-autopilot.sh', ['--user', 'deploy', '--prefix', preOdd, '--node', process.execPath, '--repo', odd]); const svcOdd = fs.existsSync(path.join(preOdd, 'etc/systemd/system/mamta-autopilot.service')) ? fs.readFileSync(path.join(preOdd, 'etc/systemd/system/mamta-autopilot.service'), 'utf8') : '';
      check(r.status === 0 && svcOdd.includes('odd&dir#x') && svcOdd.includes(process.execPath), 'paths containing &, # (and, on Windows, backslashes and spaces) are rendered into the unit literally: the root cause of the former "one-shot run" failure', svcOdd.split('\n').filter((l) => /ExecStart/.test(l)).join());

      // ---- one-shot execution of the unit's exact command line (what systemd would run), against the local test site
      git(site.repo, 'reset', '-q', '--hard', baseHead); cleanBranches(site.repo); await site.restart();
      const unitEnv = {}; for (const l of svc.split('\n')) { const m = l.match(/^Environment=([A-Z0-9_]+)=(.*)$/); if (m) unitEnv[m[1]] = m[2]; }
      const exec = (svc.match(/^ExecStart=(.*)$/m) || [])[1] || ''; const nodeBin = process.execPath; const cliArgs = [path.join(SRC, 'autopilot/cli.js'), 'run'];
      check(/\/autopilot\/cli\.js run$/.test(exec) && unitEnv.AUTOPILOT_STATE_DIR === '/var/lib/mamta-autopilot' && unitEnv.AUTOPILOT_REPO_DIR != null, 'the unit command line and environment are well formed: node cli.js run with the repository and state directories', exec);
      const oneShotState = path.join(root, 'oneshot-state'); const oneShotEnv = Object.assign({}, process.env, { AUTOPILOT_ENV_FILE: path.join(pre, 'etc/mamta-autopilot/autopilot.env'), AUTOPILOT_REPO_DIR: site.repo, AUTOPILOT_STATE_DIR: oneShotState, AUTOPILOT_FETCH_BASE: site.base, AUTOPILOT_SITE_ORIGIN: 'https://devmamflourishfoods.com', AUTOPILOT_GATE_HARDCHECK: '0', AUTOPILOT_GATE_ENQUIRY: '0', AUTOPILOT_HTTP_TIMEOUT_MS: '3000' });
      for (const k of Object.keys(oneShotEnv)) if (/^AUTOPILOT_(MODE|PUBLISH|RESTART_CMD|GOOGLE|AI_MODE|ALERT|TARGET)/.test(k) && !['AUTOPILOT_ENV_FILE'].includes(k)) delete oneShotEnv[k];
      const asUid = typeof process.getuid === 'function' ? process.getuid() : null; const svcAcct = spawnSync('id', ['-u', 'deploy'], { encoding: 'utf8' }); const canSwitch = asUid === 0 && svcAcct.status === 0;
      const cmd = canSwitch ? ['runuser', ['-u', 'deploy', '--', nodeBin, ...cliArgs]] : [nodeBin, cliArgs];
      const one = await new Promise((resolve) => { const c = spawn(cmd[0], cmd[1], { env: oneShotEnv, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('close', (code) => resolve({ code, out: o })); });
      check(one.code === 0 && /SEO autopilot run \w+: status=\w+; mode=report-only/.test(one.out) && fs.existsSync(path.join(oneShotState, 'state.json')) && fs.existsSync(path.join(oneShotState, 'runs.jsonl')) && git(site.repo, 'rev-parse', 'HEAD') === baseHead && branches(site.repo).length === 0, 'the unit\'s command runs one report-only audit to completion: exit 0, state and run ledger written, no branch, production commit unchanged', one.out.slice(-400));
      if (!canSwitch) skip('the one-shot run as the configured service user account', asUid === 0 ? 'running as root but no "deploy" account exists here' : 'switching to the service user needs root and that account (here it ran as the current unprivileged user); systemd does this on the server; a root-capable Linux run (container or server) executes it');
      const pre2 = path.join(root, 'prefix-auto'); r = sh('install-autopilot.sh', ['--user', 'deploy', '--prefix', pre2, '--node', process.execPath, '--repo', SRC, '--auto-publish', '--pm2-home', '/home/deploy/.pm2']);
      const dropin = path.join(pre2, 'etc/systemd/system/mamta-autopilot.service.d/auto-publish.conf'); const di = fs.existsSync(dropin) ? fs.readFileSync(dropin, 'utf8') : '';
      const rw = (di.match(/^ReadWritePaths=(.*)$/m) || [])[1] || '';
      check(r.status === 0 && /\/views/.test(rw) && /\/home\/deploy\/\.pm2/.test(rw) && rw.trim().split(/\s+/).length === 2 && !/data|uploads|\.env|routes|lib\b|middleware/.test(rw) && !/@[A-Z0-9]+@/.test(di), '--auto-publish installs a drop-in granting write access to exactly two paths (the SEO view files and the service user\'s PM2 home)', r.stdout + r.stderr + di);
      check(/AUTOPILOT_MODE=auto is set AND/.test(r.stdout) && /MODE=report/.test(fs.readFileSync(path.join(pre2, 'etc/mamta-autopilot/autopilot.env'), 'utf8')) && /^AUTOPILOT_MODE=report/m.test(fs.readFileSync(path.join(pre2, 'etc/mamta-autopilot/autopilot.env'), 'utf8')), 'the installer never switches the mode: it stays report-only and says publishing also needs activate-auto');
      r = sh('uninstall-autopilot.sh', ['--prefix', pre]); check(r.status === 0 && !fs.existsSync(path.join(pre, 'etc/systemd/system/mamta-autopilot.timer')) && fs.existsSync(path.join(pre, 'etc/mamta-autopilot/autopilot.env')), 'uninstall removes the units and keeps credentials and state by default', r.stdout + r.stderr);
      r = sh('uninstall-autopilot.sh', ['--prefix', pre, '--purge', '--state-dir', '/var/lib/mamta-autopilot-test']); check(!fs.existsSync(path.join(pre, 'etc/mamta-autopilot')), 'uninstall --purge removes the credentials directory');

    }
  } catch (e) { failed++; console.log('  FAIL  test harness error: ' + (e.stack || e.message)); }
  finally { for (const f of cleanups) { try { f(); } catch (e) { /* ignore */ } } try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
  console.log(`\nAUTOPILOT TESTS: ${passed} passed, ${failed} failed, ${skipped} skipped${WIN ? ' (Windows: POSIX file-mode and service-user checks are skipped, see SKIP lines)' : ''}`);
  process.exit(failed ? 1 : 0);
})();
