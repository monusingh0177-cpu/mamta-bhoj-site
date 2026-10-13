'use strict';
// Quality gates. Every change must pass all of them before it is committed, and again (smoke) after a restart.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const inventory = require('./inventory');
const { auditInventory } = require('./audit');
const { git, run } = require('./git');
const { isProtected, ALLOWED_FILES } = require('./patch');
const { request, requestRetry } = require('./util');

function freePort() { return new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    if (['node_modules', '.git', 'logs'].includes(n)) continue;
    const f = path.join(src, n), t = path.join(dst, n), st = fs.statSync(f);
    if (st.isDirectory()) copyTree(f, t); else fs.copyFileSync(f, t);
  }
}

// An isolated copy of the working tree on a free port, with a sanitised environment (its own data/, no mail, no PERSIST_DIR).
async function previewServer(repoDir, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mamta-autopilot-'));
  copyTree(repoDir, dir);
  // use the production data/ (read-only copy) so the preview renders the real content
  if (opts && opts.dataDir && fs.existsSync(opts.dataDir)) { fs.rmSync(path.join(dir, 'data'), { recursive: true, force: true }); copyTree(opts.dataDir, path.join(dir, 'data')); }
  const nm = path.join(repoDir, 'node_modules'); if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(dir, 'node_modules'));
  const port = await freePort();
  const env = Object.assign({}, process.env, { PORT: String(port) });
  for (const k of ['PERSIST_DIR', 'FORCE_HTTPS', 'SMTP_HOST', 'SMTP_PASSWORD', 'ZEPTOMAIL_API_TOKEN', 'ENQUIRY_TO_EMAIL', 'SEO_LASTMOD_FILE']) delete env[k];
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await request(base + '/robots.txt', { timeoutMs: 2000 }); up = r.status === 200; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const stop = () => { try { child.kill(); } catch (e) { /* ignore */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } };
  if (!up) { stop(); throw new Error('preview copy of the site did not start'); }
  return { base, stop };
}

const key = (f) => `${f.path}|${f.code}`;

function checkChangedPages(inv, changed, origin) {
  const problems = [];
  for (const p of changed) {
    const pg = inv.pages[p];
    if (!pg) { problems.push(`${p}: did not return 200 in the preview`); continue; }
    if (!pg.indexable) problems.push(`${p}: accidental noindex`);
    if (pg.canonical !== origin + (p === '/' ? '/' : p)) problems.push(`${p}: canonical is ${pg.canonical}`);
    if (pg.h1.length !== 1) problems.push(`${p}: ${pg.h1.length} H1 elements`);
    if (!pg.title || pg.title.length < 25 || pg.title.length > 62) problems.push(`${p}: title length ${pg.title.length}`);
    if (!pg.description || pg.description.length < 110 || pg.description.length > 165) problems.push(`${p}: description length ${pg.description.length}`);
  }
  return problems;
}

async function sitemapAndRobotsOk(base) {
  const sm = await requestRetry(base + '/sitemap.xml'); const rb = await requestRetry(base + '/robots.txt');
  const smOk = sm.status === 200 && /<urlset[\s\S]*<\/urlset>/.test(sm.body) && !/<loc>\s*<\/loc>/.test(sm.body);
  const rbOk = rb.status === 200 && /Disallow:\s*\/admin/i.test(rb.body) && !/^\s*Disallow:\s*\/\s*$/m.test(rb.body) && /Sitemap:\s*\S+/.test(rb.body);
  return { smOk, rbOk };
}

// gates(cfg, {changedFiles, changedPaths, baseline}) -> { ok, results: [{name, ok, detail}] }
async function runGates(cfg, ctx) {
  const results = []; const add = (name, ok, detail) => results.push({ name, ok, detail: String(detail || '').slice(0, 600) });
  const repo = ctx.dir || cfg.repoDir;
  // 1. only allow-listed, non-protected files changed
  let files = []; try { files = git(repo, ['diff', '--name-only']).split('\n').filter(Boolean); } catch (e) { add('changed-files', false, e.message); return { ok: false, results }; }
  const bad = files.filter((f) => isProtected(f) || !ALLOWED_FILES.includes(f));
  add('changed-files', bad.length === 0 && (files.length > 0 || ctx.skipChangedCheck), bad.length ? `unexpected or protected files changed: ${bad.join(', ')}` : files.join(', ') || 'none (revert check)');
  if (bad.length) return { ok: false, results };
  // 2. syntax
  const jsFiles = git(repo, ['ls-files', '*.js']).split('\n').filter(Boolean);
  const synBad = jsFiles.filter((f) => spawnSync(process.execPath, ['--check', path.join(repo, f)]).status !== 0);
  add('js-syntax', synBad.length === 0, synBad.join(', ') || `${jsFiles.length} files parse`);
  if (synBad.length) return { ok: false, results };
  // 3. preview: render the changed tree and re-audit it
  let pv; let inv = null;
  try {
    pv = await previewServer(repo, { dataDir: cfg.dataDir || path.join(cfg.repoDir, 'data') });
    inv = await inventory.build(pv.base, { origin: cfg.siteOrigin });
    const sr = await sitemapAndRobotsOk(pv.base);
    add('sitemap-valid', sr.smOk, ''); add('robots-valid', sr.rbOk, '');
    add('page-count', !ctx.baseline || inv.sitemapPaths.length === ctx.baseline.sitemapPaths.length, `${inv.sitemapPaths.length} URLs (baseline ${ctx.baseline ? ctx.baseline.sitemapPaths.length : 'n/a'})`);
    const cp = checkChangedPages(inv, ctx.changedPaths || [], cfg.siteOrigin);
    add('changed-pages', cp.length === 0, cp.join('; ') || (ctx.changedPaths || []).join(', '));
    const after = auditInventory(inv, { origin: cfg.siteOrigin });
    const before = new Set((ctx.baselineAudit || []).map(key));
    const fresh = after.filter((f) => ['critical', 'high'].includes(f.severity) && !before.has(key(f)));
    add('no-new-seo-defects', fresh.length === 0, fresh.slice(0, 4).map((f) => `${f.path} ${f.code}`).join('; '));
    const schemaBad = Object.entries(inv.pages).filter(([, p]) => p.jsonLdErrors.length || p.jsonLdTypes.some((t) => /Product/.test(t)) || /"(offers|aggregateRating|review|price)"\s*:/.test(JSON.stringify(p.jsonLdNodes))).map(([p]) => p);
    add('schema-valid', schemaBad.length === 0, schemaBad.join(', '));
    add('no-5xx-or-404', inv.nonOk.filter((n) => n.status >= 500 || n.status === 0 || (n.status === 404 && inv.sitemapPaths.includes(n.path))).length === 0, JSON.stringify(inv.nonOk.slice(0, 3)));
  } catch (e) { add('preview', false, e.message); } finally { if (pv) pv.stop(); }
  // 4. the project's own strict SEO suite and enquiry tests
  if (cfg.gates.hardCheck) { const r = run('bash scripts/seo-hard-check.sh', repo, 600000); add('seo-hard-check', r.code === 0, r.code === 0 ? (r.out.match(/RESULT:.*/) || ['passed'])[0] : r.out.split('\n').filter((l) => /FAIL|ERROR/.test(l)).slice(0, 3).join(' | ')); }
  if (cfg.gates.enquiry && fs.existsSync(path.join(repo, 'scripts/test-enquiry.js'))) { const r = run('node scripts/test-enquiry.js', repo, 600000); add('enquiry-tests', r.code === 0, (r.out.match(/ENQUIRY TESTS:.*/) || [r.out.slice(-200)])[0]); }
  return { ok: results.every((r) => r.ok), results, inventory: inv };
}

// After a restart: public smoke test + PM2 state.
async function smoke(cfg, paths) {
  const results = []; const add = (name, ok, detail) => results.push({ name, ok, detail: String(detail || '').slice(0, 300) });
  const base = cfg.fetchBase;
  try {
    const sr = await sitemapAndRobotsOk(base); add('sitemap-valid', sr.smOk, ''); add('robots-valid', sr.rbOk, '');
    const inv = await inventory.build(base, { origin: cfg.siteOrigin });
    add('no-5xx', inv.nonOk.filter((n) => n.status >= 500 || n.status === 0).length === 0, JSON.stringify(inv.nonOk.slice(0, 3)));
    const cp = checkChangedPages(inv, (paths || []).concat(['/']), cfg.siteOrigin); add('public-pages', cp.length === 0, cp.join('; '));
    add('page-count', true, `${inv.sitemapPaths.length} URLs`);
  } catch (e) { add('public-smoke', false, e.message); }
  if (cfg.pm2Check) { // read-only status query; nothing is ever restarted
    const r = run('pm2 jlist', cfg.repoDir, 30000); let online = false;
    try { const list = JSON.parse(r.out.slice(r.out.indexOf('['))); online = list.some((a) => a.name === cfg.pm2App && a.pm2_env && a.pm2_env.status === 'online'); } catch (e) { online = false; }
    add('pm2-online', online, online ? cfg.pm2App : r.out.slice(0, 200));
  }
  return { ok: results.every((r) => r.ok), results };
}

module.exports = { runGates, smoke, previewServer, checkChangedPages };
