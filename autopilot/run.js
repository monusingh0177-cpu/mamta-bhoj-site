'use strict';
// One autopilot run (report-and-propose architecture):
//   audit the live site -> collect Search Console data -> score opportunities -> (optionally) ask the AI for a
//   patch -> validate it (claims, allow-list, exact match) -> apply it ONLY in a separate git worktree on a new
//   branch -> run every quality gate there -> commit to that branch only -> report.
// The production branch, the production working tree, PM2, nginx, .env, data/ and uploads are never modified.
// Merging, pushing, deploying and restarting are manual. publish=auto (autonomous publishing) is a configuration
// value that this build refuses: it is reported as a stop condition.
const crypto = require('crypto');
const state = require('./lib/state');
const gscLib = require('./lib/gsc');
const inventory = require('./lib/inventory');
const { auditInventory } = require('./lib/audit');
const opp = require('./lib/opportunity');
const ai = require('./lib/ai');
const patchLib = require('./lib/patch');
const gates = require('./lib/gates');
const indexnow = require('./lib/indexnow');
const reportLib = require('./lib/report');
const branchLib = require('./lib/branch');
const { checkClaims } = require('./lib/claims');
const git = require('./lib/git');
const { today, addDays, writeJson, request, warn } = require('./lib/util');

const RUNTIME_DATA = /^(data\/|public\/uploads\/)/;
const IMPORTANT = ['/', '/flour-manufacturer-india', '/bulk-flour-supplier-india', '/wholesale-flour-supplier', '/institutional-flour-supplier', '/supply-distribution-india', '/flour-manufacturer-kanpur', '/products/fresh-chakki-atta', '/products/maida', '/products/besan', '/products/sooji-rava', '/products/tandoori-atta', '/products', '/contact'];

function windows(cfg) {
  const end = addDays(today(cfg.now), -3); // Search Console data lags by a couple of days
  return { cur: { startDate: addDays(end, -27), endDate: end }, prev: { startDate: addDays(end, -55), endDate: addDays(end, -28) } };
}
const sum = (rows) => { const t = { clicks: 0, impressions: 0, posW: 0 }; for (const r of rows) { t.clicks += r.clicks; t.impressions += r.impressions; t.posW += r.position * r.impressions; } return { clicks: t.clicks, impressions: t.impressions, ctr: t.impressions ? t.clicks / t.impressions : 0, position: t.impressions ? t.posW / t.impressions : null }; };
const tot = (r) => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });

async function notify(cfg, payload) {
  if (!cfg.alertWebhook) return;
  try { await request(cfg.alertWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 10000 }); } catch (e) { warn('alert webhook failed:', e.message); }
}

async function runOnce(cfg, opts) {
  const o = opts || {};
  const runId = o.runId || crypto.randomBytes(3).toString('hex');
  const files = state.init(cfg);
  const st = state.load(cfg);
  const date = today(cfg.now);
  const dryRun = Boolean(o.dryRun);
  const initial = !st.initialAuditDone;
  const effectiveMode = dryRun || initial || cfg.mode !== 'propose' ? 'report-only' : 'propose';
  const R = { runId, date, startedAt: new Date().toISOString(), mode: cfg.mode, publish: cfg.publish, effectiveMode, dryRun, initialRun: initial, stops: [], repo: {}, gsc: { available: false, reason: '' }, opportunities: [], risingCommercial: [], newQueries: [], pageMovement: [], changes: [], notChanged: [], newPageProposals: [], findings: [], auditSummary: { critical: 0, high: 0, medium: 0, low: 0 }, inventory: {}, indexnow: { keyVerified: false, keyDetail: '', submissions: [] }, sitemapSubmission: { status: 'not attempted' }, inspections: [], rollbacks: [], gates: [], smoke: [], ai: { note: '' }, errors: [] };
  const A = (event, data) => state.audit(cfg, runId, event, data);
  A('run_start', { mode: cfg.mode, effectiveMode, dryRun, initial, publish: cfg.publish });
  if (cfg.envFileWarning) R.errors.push(cfg.envFileWarning);
  const finish = () => { R.endedAt = new Date().toISOString(); R.reportFile = reportLib.write(cfg, files, R); const n = state.rotate(cfg, date); if (n) A('rotated', { removed: n }); A('run_end', { stops: R.stops, proposals: R.changes.length, rejected: R.rollbacks.length }); return R; };

  if (!o.manual && state.isDisabled(cfg)) { A('skipped', { reason: 'autopilot is disabled' }); R.stops.push('autopilot is disabled (run npm run seo:enable)'); return finish(); }
  if (cfg.publish === 'auto') R.stops.push('publish=auto (autonomous publishing) is not available in this build: patches are only proposed on a separate branch');

  // ---- preflight: production repository must be clean (runtime data/uploads are ignored) and untouched by us
  try {
    R.repo.head = git.head(cfg.repoDir); R.repo.branch = git.branch(cfg.repoDir);
    const dirty = git.dirty(cfg.repoDir).filter((d) => !RUNTIME_DATA.test(d.file));
    const prot = dirty.filter((d) => patchLib.isProtected(d.file));
    if (prot.length) R.stops.push(`protected files are modified: ${prot.map((d) => d.file).join(', ')}`);
    else if (dirty.length) R.stops.push(`git working tree has unexpected changes: ${dirty.slice(0, 5).map((d) => d.file).join(', ')}`);
  } catch (e) { R.stops.push(`git repository not usable: ${e.message}`); }

  // ---- inventory of the live site
  let inv;
  try { inv = await inventory.build(cfg.fetchBase, { origin: cfg.siteOrigin }); }
  catch (e) { R.errors.push(`inventory failed: ${e.message}`); R.stops.push(`site inventory failed: ${e.message}`); A('inventory_failed', { error: e.message }); return finish(); }
  R.inventory = { pageCount: inv.sitemapPaths.length, indexablePages: Object.values(inv.pages).filter((p) => p.indexable).length, nonOk: inv.nonOk };
  writeJson(`${files.snapshots}/inventory-${date}.json`, inventory.compact(inv));
  if (st.pageCount != null && st.pageCount !== inv.sitemapPaths.length) R.stops.push(`page count changed unexpectedly (${st.pageCount} -> ${inv.sitemapPaths.length}); review it, then run: node autopilot/cli.js baseline`);
  R.findings = auditInventory(inv, { origin: cfg.siteOrigin });
  for (const f of R.findings) R.auditSummary[f.severity] = (R.auditSummary[f.severity] || 0) + 1;
  const critical = R.findings.filter((f) => f.severity === 'critical');
  if (critical.length) R.stops.push(`critical audit finding(s): ${critical.slice(0, 3).map((f) => `${f.path} ${f.code}`).join('; ')}`);
  const firstBaseline = !Object.keys(st.hashes).length;
  const changedUrls = [];
  for (const [p, pg] of Object.entries(inv.pages)) if (pg.inSitemap && st.hashes[p] && st.hashes[p] !== pg.contentHash) changedUrls.push(p);
  const urlSetChanged = st.pageCount != null && st.pageCount !== inv.sitemapPaths.length;

  // ---- public smoke test (read-only GET requests against the live site)
  try { const sm = await gates.smoke(cfg, []); R.smoke = sm.results; if (!sm.ok) R.stops.push(`public smoke test failed: ${sm.results.filter((x) => !x.ok).map((x) => x.name).join(', ')}`); } catch (e) { R.smoke = [{ name: 'smoke', ok: false, detail: e.message }]; R.stops.push(`public smoke test failed: ${e.message}`); }

  // ---- IndexNow key
  const kv = await indexnow.verify(cfg); R.indexnow.keyVerified = kv.ok; R.indexnow.keyDetail = kv.detail;
  if (!kv.ok) R.stops.push(`IndexNow key cannot be validated: ${kv.detail}`);

  // ---- Google Search Console
  const gsc = gscLib.create(cfg, files.cache);
  let curRows = [], prevRows = [];
  if (!gsc.configured()) { R.gsc.reason = 'Google OAuth is not configured'; R.stops.push('Google API auth is unavailable (OAuth not configured)'); }
  else {
    try {
      const w = windows(cfg);
      curRows = (await gsc.query({ ...w.cur, dimensions: ['query', 'page'] })).rows;
      prevRows = (await gsc.query({ ...w.prev, dimensions: ['query', 'page'] })).rows;
      const totCur = (await gsc.query({ ...w.cur, dimensions: [] })).rows, totPrev = (await gsc.query({ ...w.prev, dimensions: [] })).rows;
      const pgCur = (await gsc.query({ ...w.cur, dimensions: ['page'] })).rows, pgPrev = (await gsc.query({ ...w.prev, dimensions: ['page'] })).rows;
      R.gsc = { available: true, window: w, totals: { current: totCur.length ? tot(totCur[0]) : sum(curRows), previous: totPrev.length ? tot(totPrev[0]) : sum(prevRows) } };
      const prevMap = new Map(pgPrev.map((r) => [new URL(r.keys[0]).pathname, r.impressions]));
      R.pageMovement = pgCur.map((r) => { const p = new URL(r.keys[0]).pathname; const prev = prevMap.get(p) || 0; return { path: p, current: r.impressions, previous: prev, change: r.impressions - prev }; }).filter((m) => m.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 10);
    } catch (e) { R.gsc = { available: false, reason: e.message }; R.stops.push(`Google API auth is unavailable (${e.message})`); A('gsc_failed', { error: e.message }); }
  }

  // ---- opportunities
  if (R.gsc.available) {
    const all = opp.analyse(curRows, prevRows, inv, cfg);
    R.opportunities = all.filter((x) => x.relevant).slice(0, 25);
    R.risingCommercial = all.filter((x) => x.kind === 'commercial' && x.flags.includes('rising impressions')).slice(0, 10);
    R.newQueries = all.filter((x) => x.prevImpressions == null).slice(0, 10);
    R.notChanged.push(...all.filter((x) => !x.relevant).slice(0, 8).map((x) => ({ query: x.query, reason: `${x.kind} query: ${x.reason}` })));
    R.newPageProposals = all.filter((x) => x.relevant && /content gap/.test(x.action)).slice(0, 5).map((x) => ({
      query: x.query, verdict: 'proposal only: a person must supply the facts and approve; new pages are never created automatically',
      gates: [{ name: 'high-confidence cluster', ok: x.score >= cfg.limits.minScore && x.impressions >= 10 }, { name: 'no cannibalisation', ok: x.cannibalRisk < 0.3 && x.bestPageFit < 0.15 }, { name: 'commercially relevant', ok: x.kind === 'commercial' || x.kind === 'product' }, { name: 'no location/doorway intent', ok: checkClaims(x.query, '/').length === 0 }, { name: 'rate limit (1 per 7 days)', ok: state.newPageAllowed(cfg, st, date) }, { name: 'real facts available (human check)', ok: false }],
    }));
  } else R.ai.note = 'No Search Console data, so no opportunities were scored.';

  // ---- proposals (separate branch only)
  let blocked = R.stops.length > 0 || effectiveMode !== 'propose';
  if (initial) R.notChanged.push({ page: '(all)', reason: 'first run: audit and baseline only, nothing is proposed' });
  if (dryRun) R.notChanged.push({ page: '(all)', reason: 'dry run: no branch, no submission, no lastmod' });
  if (!blocked) {
    const openBranches = (() => { try { return branchLib.list(cfg); } catch (e) { return []; } })();
    let remaining = state.limitStatus(cfg, st, date).remainingToday; const chosen = new Set();
    for (const op of R.opportunities.filter((x) => /improve existing page/.test(x.action))) {
      const page = op.bestPage; if (!page || chosen.has(page)) continue;
      if (remaining <= 0) { R.notChanged.push({ query: op.query, reason: `daily limit of ${cfg.limits.pagesPerDay} proposed pages reached` }); continue; }
      const cd = state.onCooldown(cfg, st, page, date); if (cd) { R.notChanged.push({ page, reason: `proposal on ${cd.last}; cooldown until ${cd.until}` }); continue; }
      if (openBranches.some((b) => b.includes(`-${branchLib.slug(page)}-`))) { R.notChanged.push({ page, reason: 'an open autopilot proposal branch for this page is awaiting review' }); continue; }
      const block = patchLib.sourceBlock(cfg.repoDir, page); if (!block) { R.notChanged.push({ page, reason: 'no editable source block for this page' }); continue; }
      const proposal = await ai.propose(cfg, { opportunity: op, page: inv.pages[page], path: page, block });
      if (proposal.skipped) { R.ai.note = `AI-dependent changes are report-only: ${proposal.reason}`; R.notChanged.push({ page, reason: `no patch generated: ${proposal.reason}` }); continue; }
      if (proposal.error) { R.ai.note = proposal.error; R.notChanged.push({ page, reason: proposal.error }); A('ai_error', { page, error: proposal.error }); continue; }
      const valid = []; const kinds = new Set();
      for (const d of proposal.decisions) {
        d.page = page; const v = patchLib.validate(d, { repoDir: cfg.repoDir });
        if (!v.ok) { R.notChanged.push({ page, reason: `AI patch rejected: ${v.errors.join('; ')}` }); A('patch_rejected', { page, kind: d.kind, errors: v.errors }); continue; }
        if (kinds.has(d.kind) || Number(d.confidence) < 0.6) { R.notChanged.push({ page, reason: 'AI patch skipped (duplicate kind or low confidence)' }); continue; }
        kinds.add(d.kind); valid.push(d);
      }
      if (!valid.length) continue;
      let wt = null;
      try {
        wt = branchLib.create(cfg, { date, page, id: runId });
        for (const d of valid) { const v = patchLib.validate(d, { repoDir: wt.dir }); if (!v.ok) throw new Error(`patch no longer applies in the worktree: ${v.errors.join('; ')}`); patchLib.apply(v, d); }
        const g = await gates.runGates(cfg, { dir: wt.dir, changedPaths: [page], baseline: inv, baselineAudit: R.findings });
        R.gates = g.results;
        if (!g.ok) {
          branchLib.remove(cfg, wt, true);
          const failed = g.results.filter((x) => !x.ok).map((x) => x.name);
          R.rollbacks.push({ page, reason: `gates failed (${failed.join(', ')}); branch discarded`, sha: null }); A('proposal_discarded', { page, failed: g.results.filter((x) => !x.ok) });
          st.history.push({ date, page, status: 'rejected', reason: `gates failed: ${failed.join(', ')}`, query: op.query }); blocked = true; R.stops.push(`gates failed for ${page}; proposal discarded`); break;
        }
        const touched = [...new Set(valid.map((d) => d.file))];
        const sha = branchLib.commit(wt, touched, `autopilot proposal: ${valid.map((d) => d.kind).join('+')} for ${page}\n\nQuery: ${op.query} (score ${op.score})\n${valid.map((d) => d.rationale).filter(Boolean).join('\n')}`.slice(0, 900));
        branchLib.remove(cfg, wt, false); // the worktree folder goes away; the branch stays for review
        const stat = branchLib.diffStat(cfg, wt.branch);
        const change = { page, kind: valid.map((d) => d.kind).join('+'), query: op.query, branch: wt.branch, sha, rationale: valid.map((d) => d.rationale).join(' '), files: touched, diffStat: stat, review: `git diff HEAD...${wt.branch}   then, if you approve:   git merge --no-ff ${wt.branch}` };
        st.history.push({ date, page, status: 'proposed', branch: wt.branch, sha, kind: change.kind, query: op.query });
        R.changes.push(change); remaining--; chosen.add(page); A('proposal_created', { page, branch: wt.branch, sha });
      } catch (e) {
        if (wt) branchLib.remove(cfg, wt, true);
        R.errors.push(`proposal for ${page} failed: ${e.message}`); A('proposal_error', { page, error: e.message }); blocked = true; R.stops.push(`proposal for ${page} failed; discarded`); break;
      }
    }
  }

  // ---- lastmod, IndexNow, Google sitemap (real live content changes only; never in dry-run)
  if (!dryRun) {
    const lastmod = state.loadLastmod(cfg); const submitNow = [];
    for (const p of changedUrls) { lastmod[p] = date; submitNow.push(p); }
    if (changedUrls.length) state.saveLastmod(cfg, lastmod);
    if (submitNow.length && kv.ok) { R.indexnow.submissions = indexnow.submit(cfg, submitNow, files); A('indexnow', { urls: submitNow, ok: R.indexnow.submissions.map((s) => s.ok) }); }
    if ((changedUrls.length || urlSetChanged) && gsc.configured() && R.gsc.available) {
      try { await gsc.submitSitemap(`${cfg.siteOrigin}/sitemap.xml`); R.sitemapSubmission.status = 'submitted to Google through the Search Console Sitemaps API (a submission, not a guarantee of crawling or indexing)'; }
      catch (e) { R.sitemapSubmission.status = `failed: ${e.message}${/403/.test(e.message) ? ' (the OAuth grant probably lacks the webmasters scope)' : ''}`; }
    } else R.sitemapSubmission.status = changedUrls.length || urlSetChanged ? 'not submitted (Google OAuth unavailable)' : 'not needed (no real content change)';
    for (const [p, pg] of Object.entries(inv.pages)) if (pg.inSitemap) st.hashes[p] = pg.contentHash;
    if (!R.stops.some((s) => /page count/.test(s))) st.pageCount = inv.sitemapPaths.length;
  } else {
    R.sitemapSubmission.status = 'dry run: no submission';
    if (firstBaseline) for (const [p, pg] of Object.entries(inv.pages)) if (pg.inSitemap) st.hashes[p] = pg.contentHash; // the first dry run records the baseline (state only)
    if (firstBaseline && st.pageCount == null) st.pageCount = inv.sitemapPaths.length;
  }
  R.changedUrls = changedUrls; R.firstBaseline = firstBaseline;

  // ---- URL Inspection (read-only status monitoring, cached 7 days, limited per run)
  if (gsc.configured() && R.gsc.available) {
    let n = 0;
    for (const p of IMPORTANT.filter((x) => inv.pages[x] && inv.pages[x].indexable)) {
      if (n >= cfg.limits.inspectPerRun) break;
      const url = cfg.siteOrigin + (p === '/' ? '/' : p); const prev = st.inspections[p];
      if (prev && Date.now() - prev.at < 7 * 86400000) { R.inspections.push(Object.assign({ url, cached: true }, prev.result)); continue; }
      try { const r = await gsc.inspect(url); st.inspections[p] = { at: Date.now(), result: r }; R.inspections.push(Object.assign({ url }, r)); n++; }
      catch (e) { R.inspections.push({ url, error: e.message }); if (/429|403/.test(e.message)) break; }
    }
  }

  if (!R.ai.note) R.ai.note = cfg.ai.mode === 'none' ? 'No AI integration configured: patch generation is report-only.' : `AI mode: ${cfg.ai.mode}. The model only receives the minimal page/query context; its output is a validated patch object.`;
  // the first completed audit is the "first dry run": it must pass (site reachable, no critical audit finding) before proposals are allowed
  if (initial && !critical.length && R.inventory.pageCount > 0) { st.initialAuditDone = true; st.initialAuditAt = new Date().toISOString(); A('initial_audit_done', { dryRun }); }
  R.stops = [...new Set(R.stops)];
  st.lastRun = { at: new Date().toISOString(), runId, stops: R.stops, proposals: R.changes.length };
  state.save(cfg, st);
  finish();
  if (R.rollbacks.length) await notify(cfg, { text: `Mamta SEO autopilot: a proposal was discarded on ${date}. ${R.stops.join(' | ')}`.slice(0, 500) });
  return R;
}

// "Rollback" in the propose-only design never touches the production branch:
//  - a proposal that is still only on its branch is withdrawn (branch deleted);
//  - a proposal that a person already merged gets a REVERT PROPOSAL on a new branch, for manual merge.
async function rollbackLast(cfg) {
  const files = state.init(cfg); const st = state.load(cfg); const runId = crypto.randomBytes(3).toString('hex');
  const last = st.history.slice().reverse().find((h) => h.status === 'proposed');
  if (!last) throw new Error('no autopilot proposal to roll back');
  const out = { page: last.page, branch: last.branch };
  if (branchLib.exists(cfg, last.branch) && !branchLib.isMerged(cfg, last.branch)) {
    git.git(cfg.repoDir, ['branch', '-D', last.branch]); last.status = 'withdrawn'; out.action = 'withdrawn: the unmerged proposal branch was deleted';
  } else {
    const dirty = git.dirty(cfg.repoDir).filter((d) => !RUNTIME_DATA.test(d.file)); if (dirty.length) throw new Error(`working tree is not clean: ${dirty.map((d) => d.file).join(', ')}`);
    const wt = branchLib.create(cfg, { date: today(cfg.now), page: `revert-${last.sha.slice(0, 8)}`, id: runId });
    try { git.git(wt.dir, ['revert', '--no-edit', last.sha]); out.revertBranch = wt.branch; out.revertSha = git.head(wt.dir); branchLib.remove(cfg, wt, false); }
    catch (e) { branchLib.remove(cfg, wt, true); throw e; }
    last.status = 'revert-proposed'; out.action = `revert proposed on branch ${out.revertBranch}; review and merge it manually: git merge --no-ff ${out.revertBranch}`;
  }
  state.save(cfg, st); state.audit(cfg, runId, 'rollback', out);
  return out;
}

// Accept the current live site as the new baseline (e.g. after a deliberate manual deploy that added a page).
async function acceptBaseline(cfg) {
  state.init(cfg); const st = state.load(cfg);
  const inv = await inventory.build(cfg.fetchBase, { origin: cfg.siteOrigin });
  st.hashes = {}; for (const [p, pg] of Object.entries(inv.pages)) if (pg.inSitemap) st.hashes[p] = pg.contentHash;
  st.pageCount = inv.sitemapPaths.length; state.save(cfg, st); state.audit(cfg, 'baseline', 'baseline_accepted', { pages: st.pageCount });
  return { pages: st.pageCount };
}

module.exports = { runOnce, rollbackLast, acceptBaseline };
