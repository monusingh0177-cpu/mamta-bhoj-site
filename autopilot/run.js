'use strict';
// One autopilot run (report-and-propose architecture):
//   audit the live site -> collect Search Console data -> score opportunities -> (optionally) ask the AI for a
//   patch -> validate it (claims, allow-list, exact match) -> apply it ONLY in a separate git worktree on a new
//   branch -> run every quality gate there -> commit to that branch only -> report.
// The production branch, the production working tree, PM2, nginx, .env, data/ and uploads are never modified.
// In AUTOPILOT_MODE=auto (activated, not paused) a validated title/description rewrite is released through the guarded
// publish pipeline only when every lib/ai-release.js gate passes; otherwise it stays on its review branch.
// publish=auto (AUTOPILOT_PUBLISH) is a configuration value that this build refuses: it is reported as a stop condition.
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
const { today, addDays, writeJson, zonedDate } = require('./lib/util');
const health = require('./lib/health');
const weekly = require('./lib/weekly');
const remediateLib = require('./lib/remediate');
const publishLib = require('./lib/publish');
const aiRelease = require('./lib/ai-release');
const keywordsLib = require('./lib/keywords');
const indexingLib = require('./lib/indexing');
const semrushLib = require('./lib/semrush');

const RUNTIME_DATA = /^(data\/|public\/uploads\/)/;
const IMPORTANT = ['/', '/flour-manufacturer-india', '/bulk-flour-supplier-india', '/wholesale-flour-supplier', '/institutional-flour-supplier', '/supply-distribution-india', '/flour-manufacturer-kanpur', '/products/fresh-chakki-atta', '/products/maida', '/products/besan', '/products/sooji-rava', '/products/tandoori-atta', '/products', '/contact'];

function windows(cfg) {
  const end = addDays(today(cfg.now), -3); // Search Console data lags by a couple of days
  return { cur: { startDate: addDays(end, -27), endDate: end }, prev: { startDate: addDays(end, -55), endDate: addDays(end, -28) } };
}
const sum = (rows) => { const t = { clicks: 0, impressions: 0, posW: 0 }; for (const r of rows) { t.clicks += r.clicks; t.impressions += r.impressions; t.posW += r.position * r.impressions; } return { clicks: t.clicks, impressions: t.impressions, ctr: t.impressions ? t.clicks / t.impressions : 0, position: t.impressions ? t.posW / t.impressions : null }; };
const tot = (r) => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });

async function runOnce(cfg, opts) {
  const o = opts || {};
  const runId = o.runId || crypto.randomBytes(3).toString('hex');
  const files = state.init(cfg);
  const st = state.load(cfg);
  const date = today(cfg.now);
  const dryRun = Boolean(o.dryRun);
  const initial = !st.initialAuditDone;
  const effectiveMode = dryRun || initial || cfg.mode === 'report' ? 'report-only' : cfg.mode; // report-only | propose | auto
  const R = { runId, date, startedAt: new Date().toISOString(), mode: cfg.mode, publish: cfg.publish, effectiveMode, dryRun, initialRun: initial, stops: [], repo: {}, gsc: { available: false, status: 'unknown', reason: '' }, opportunities: [], risingCommercial: [], newQueries: [], pageMovement: [], changes: [], notChanged: [], newPageProposals: [], findings: [], auditSummary: { critical: 0, high: 0, medium: 0, low: 0 }, inventory: {}, indexnow: { keyVerified: false, keyDetail: '', submissions: [] }, sitemapSubmission: { status: 'not attempted' }, inspections: [], rollbacks: [], semrush: { status: 'not_configured', items: [] }, indexing: [], sitemapStatus: null, gates: [], smoke: [], ai: { note: '', status: cfg.ai.mode === 'none' ? 'none' : 'unused' }, errors: [], fixes: [], keywords: [], lostQueries: [], auto: { mode: cfg.mode, effective: effectiveMode, enabled: false, reason: '', paused: st.autoPaused || null, published: [], rolledBack: [] } };
  const A = (event, data) => state.audit(cfg, runId, event, data);
  A('run_start', { mode: cfg.mode, effectiveMode, dryRun, initial, publish: cfg.publish });
  if (cfg.envFileWarning) R.errors.push(cfg.envFileWarning);
  const lastLedgerRun = state.readLedger(cfg, 20).filter((e) => !e.dryRun && e.endedAt).pop();
  const prevRun = lastLedgerRun ? { at: lastLedgerRun.endedAt } : st.lastRun;
  const finish = async () => {
    R.endedAt = new Date().toISOString();
    const h = health.assess(R, cfg, { prevRunAt: prevRun && prevRun.at });
    R.status = h.status; R.health = h.items;
    R.reportFile = reportLib.write(cfg, files, R);
    const n = state.rotate(cfg, date); if (n) A('rotated', { removed: n });
    if (!R.skipped) {
      const entry = health.ledgerEntry(R); state.recordRun(cfg, entry);
      if (!dryRun) {
        const z = zonedDate(new Date(), cfg.timezone);
        if (R.status !== 'failed') { const wk = weekly.due(cfg, st, new Date()); if (wk) { try { R.weeklyReport = weekly.write(cfg, files, st, wk); st.lastWeekly = wk; A('weekly_report', { file: R.weeklyReport }); } catch (e) { R.errors.push(`weekly report failed: ${e.message}`); } } }
        const reasons = health.alertReasons(R, st.lastHealth, Date.now());
        const ids = (R.health || []).filter((i) => i.level === 'warn' || i.level === 'fail').map((i) => i.id).sort().join(',');
        if (reasons.length) { const out = await health.sendAlert(cfg, health.alertText(R, reasons)); A('alert', { reasons, sent: out.sent, reason: out.reason || null }); st.lastHealth = { ids, at: new Date().toISOString(), alertedAt: out.sent ? new Date().toISOString() : (st.lastHealth || {}).alertedAt, pending: Boolean(cfg.alertWebhook) && !out.sent, status: R.status, day: z.date }; }
        else st.lastHealth = { ids, at: new Date().toISOString(), alertedAt: (st.lastHealth || {}).alertedAt, status: R.status, day: z.date };
        state.save(cfg, st);
      }
    }
    A('run_end', { status: R.status, stops: R.stops, proposals: R.changes.length, rejected: R.rollbacks.length });
    return R;
  };

  if (!o.manual && state.isDisabled(cfg)) { A('skipped', { reason: 'autopilot is disabled' }); R.stops.push('autopilot is disabled (run npm run seo:enable)'); R.skipped = true; return finish(); }
  if (cfg.publish === 'auto') R.stops.push('AUTOPILOT_PUBLISH=auto (autonomous publishing) is not a switch: automatic publication is enabled only by AUTOPILOT_MODE=auto together with AUTOPILOT_RESTART_CMD; nothing is proposed or published until AUTOPILOT_PUBLISH is removed');

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
  catch (e) { R.errors.push(`inventory failed: ${e.message}`); R.stops.push(`site inventory failed: ${e.message}`); R.fatal = `site inventory failed: ${e.message}`; A('inventory_failed', { error: e.message }); return finish(); }
  R.inventory = { pageCount: inv.sitemapPaths.length, indexablePages: Object.values(inv.pages).filter((p) => p.indexable).length, nonOk: inv.nonOk };
  writeJson(`${files.snapshots}/inventory-${date}.json`, inventory.compact(inv));
  if (st.pageCount != null && st.pageCount !== inv.sitemapPaths.length) R.stops.push(`page count changed unexpectedly (${st.pageCount} -> ${inv.sitemapPaths.length}); review it, then run: node autopilot/cli.js baseline`);
  R.findings = auditInventory(inv, { origin: cfg.siteOrigin, minInlinks: cfg.minInlinks });
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
  const gv = await gsc.verify();
  if (!gv.ok) {
    R.gsc = { available: false, status: gv.status, reason: gv.detail, remedy: gv.remedy };
    R.stops.push(`Google API auth is unavailable (${gv.detail})`);
    if (gv.status !== 'not_configured') A('gsc_failed', { status: gv.status, error: gv.detail });
  } else {
    try {
      const w = windows(cfg);
      curRows = (await gsc.query({ ...w.cur, dimensions: ['query', 'page'] })).rows;
      prevRows = (await gsc.query({ ...w.prev, dimensions: ['query', 'page'] })).rows;
      const totCur = (await gsc.query({ ...w.cur, dimensions: [] })).rows, totPrev = (await gsc.query({ ...w.prev, dimensions: [] })).rows;
      const pgCur = (await gsc.query({ ...w.cur, dimensions: ['page'] })).rows, pgPrev = (await gsc.query({ ...w.prev, dimensions: ['page'] })).rows;
      R.gsc = { available: true, status: 'ok', detail: gv.detail, window: w, totals: { current: totCur.length ? tot(totCur[0]) : sum(curRows), previous: totPrev.length ? tot(totPrev[0]) : sum(prevRows) } };
      // a healthy API with nothing to report is "no data", never an error
      if (!curRows.length && !prevRows.length && !pgCur.length && R.gsc.totals.current.impressions === 0) R.gsc.status = 'ok_no_data';
      const prevMap = new Map(pgPrev.map((r) => [new URL(r.keys[0]).pathname, r.impressions]));
      R.pageMovement = pgCur.map((r) => { const p = new URL(r.keys[0]).pathname; const prev = prevMap.get(p) || 0; return { path: p, current: r.impressions, previous: prev, change: r.impressions - prev }; }).filter((m) => m.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 10);
    } catch (e) {
      const kind = e.kind || 'api_error';
      R.gsc = { available: false, status: kind, reason: e.message, remedy: gscLib.REMEDY[kind] || gscLib.REMEDY.api_error };
      R.stops.push(`Google API auth is unavailable (${e.message})`); A('gsc_failed', { status: kind, error: e.message });
    }
  }

  // ---- opportunities
  if (R.gsc.available) {
    const targetList = keywordsLib.readKeywords(cfg).list;
    const all = opp.analyse(curRows, prevRows, inv, cfg, { match: (q) => keywordsLib.matchTarget(q, targetList) });
    R.opportunities = all.filter((x) => x.relevant).slice(0, 25);
    R.risingCommercial = all.filter((x) => x.kind === 'commercial' && x.flags.includes('rising impressions')).slice(0, 10);
    R.newQueries = all.filter((x) => x.prevImpressions == null).slice(0, 10);
    R.notChanged.push(...all.filter((x) => !x.relevant).slice(0, 8).map((x) => ({ query: x.query, reason: `${x.kind} query: ${x.reason}` })));
    R.newPageProposals = all.filter((x) => x.relevant && /content gap/.test(x.action)).slice(0, 5).map((x) => ({
      query: x.query, verdict: 'proposal only: a person must supply the facts and approve; new pages are never created automatically',
      gates: [{ name: 'high-confidence cluster', ok: x.score >= cfg.limits.minScore && x.impressions >= 10 }, { name: 'no cannibalisation', ok: x.cannibalRisk < 0.3 && x.bestPageFit < 0.15 }, { name: 'commercially relevant', ok: x.kind === 'commercial' || x.kind === 'product' }, { name: 'no location/doorway intent', ok: checkClaims(x.query, '/').length === 0 }, { name: 'rate limit (1 per 7 days)', ok: state.newPageAllowed(cfg, st, date) }, { name: 'real facts available (human check)', ok: false }],
    }));
    R.lostQueries = keywordsLib.lostQueries(curRows, prevRows);
  } else R.ai.note = 'No Search Console data, so no opportunities were scored.';
  R.keywords = keywordsLib.track(cfg, curRows, prevRows, R.gsc, inv);
  // optional Semrush market data (estimated volume only; separate states for no key / no units / no data)
  R.semrush = await semrushLib.collect(cfg, R.keywords.map((k) => k.keyword), files.cache);
  for (const it of R.semrush.items) { const k = R.keywords.find((x) => x.keyword === it.keyword); if (k) k.semrush = { state: it.state, volume: it.volume == null ? null : it.volume }; }
  if (R.gsc.status === 'ok_no_data') R.ai.note = 'Search Console is connected but returned no traffic data for the window (not an error), so no opportunities were scored.';

  // ---- proposals (separate branch only)
  let blocked = R.stops.length > 0 || effectiveMode === 'report-only';
  if (initial) R.notChanged.push({ page: '(all)', reason: 'first run: audit and baseline only, nothing is proposed' });
  if (dryRun) R.notChanged.push({ page: '(all)', reason: 'dry run: no branch, no submission, no lastmod' });
  // ---- deterministic remediation (no AI): audit finding / opportunity -> validated patch -> gates -> [auto] publish + live verification
  if (effectiveMode !== 'report-only') {
    const hard = R.stops.filter((x) => !/^(Google API auth is unavailable|IndexNow key cannot)/.test(x));
    if (hard.length) { R.auto.reason = 'stop conditions block remediation: ' + hard[0]; }
    else {
      const rr = await remediateLib.remediate({ cfg, R, st, inv, date, runId, A, remaining: state.limitStatus(cfg, st, date).remainingToday, effectiveMode, changedUrls });
      inv = rr.inv; if (rr.blocked) blocked = true;
    }
  } else R.auto.reason = dryRun ? 'dry run: nothing is applied' : initial ? 'first run: audit and baseline only' : `AUTOPILOT_MODE=${cfg.mode}: report only`;

  if (!blocked) {
    const openBranches = (() => { try { return branchLib.list(cfg); } catch (e) { return []; } })();
    let remaining = state.limitStatus(cfg, st, date).remainingToday; const chosen = new Set();
    for (const op of (blocked ? [] : R.opportunities.filter((x) => /improve existing page/.test(x.action)))) {
      const page = op.bestPage; if (!page || chosen.has(page)) continue;
      if (remaining <= 0) { R.notChanged.push({ query: op.query, reason: `daily limit of ${cfg.limits.pagesPerDay} proposed pages reached` }); continue; }
      const cd = state.onCooldown(cfg, st, page, date); if (cd) { R.notChanged.push({ page, reason: `proposal on ${cd.last}; cooldown until ${cd.until}` }); continue; }
      if (openBranches.some((b) => b.includes(`-${branchLib.slug(page)}-`))) { R.notChanged.push({ page, reason: 'an open autopilot proposal branch for this page is awaiting review' }); continue; }
      const block = patchLib.sourceBlock(cfg.repoDir, page); if (!block) { R.notChanged.push({ page, reason: 'no editable source block for this page' }); continue; }
      const proposal = await ai.propose(cfg, { opportunity: op, page: inv.pages[page], path: page, block });
      if (proposal.skipped && proposal.budget) { R.ai.status = 'budget_reached'; R.ai.note = proposal.reason; R.notChanged.push({ page, reason: `no patch generated: ${proposal.reason}` }); continue; }
      if (proposal.skipped) { R.ai.status = 'misconfigured'; R.ai.note = `AI-dependent changes are report-only: ${proposal.reason}`; R.notChanged.push({ page, reason: `no patch generated: ${proposal.reason}` }); continue; }
      if (proposal.error) {
        R.ai.status = 'error'; R.ai.note = proposal.error; R.notChanged.push({ page, reason: proposal.error }); A('ai_error', { page, error: proposal.error });
        // a provider-level failure (rate limit, outage, timeout, auth, model) will repeat for the next page: stop asking this run instead of spending more of the budget
        if (proposal.category && !['malformed', 'empty', 'truncated', 'blocked'].includes(proposal.category)) { R.notChanged.push({ page: '(all)', reason: 'AI provider failure: no further AI requests this run' }); break; }
        continue;
      }
      R.ai.status = 'ok'; if (proposal.usage) { const u = R.ai.usage || (R.ai.usage = { model: proposal.model, promptTokens: 0, outputTokens: 0, totalTokens: 0 }); u.promptTokens += proposal.usage.promptTokens || 0; u.outputTokens += proposal.usage.outputTokens || 0; u.totalTokens += proposal.usage.totalTokens || 0; }
      for (const why of proposal.rejected || []) { R.notChanged.push({ page, reason: `AI patch rejected: ${why}` }); A('patch_rejected', { page, kind: 'grounding', errors: [why] }); }
      const valid = []; const kinds = new Set();
      for (const d of proposal.decisions) {
        d.page = page; const v = patchLib.validate(d, { repoDir: cfg.repoDir });
        if (!v.ok) { R.notChanged.push({ page, reason: `AI patch rejected: ${v.errors.join('; ')}` }); A('patch_rejected', { page, kind: d.kind, errors: v.errors }); continue; }
        if (kinds.has(d.kind) || Number(d.confidence) < 0.6) { R.notChanged.push({ page, reason: 'AI patch skipped (duplicate kind or low confidence)' }); continue; }
        kinds.add(d.kind); valid.push(d);
      }
      if (!valid.length) continue;
      // auto mode: a title/description rewrite that passes every AI-release gate is published through the same guarded
      // pipeline as the deterministic fixes (see lib/ai-release.js); anything else falls through to the review branch below
      if (effectiveMode === 'auto' && R.auto.enabled) {
        const rel = await aiRelease.release({ cfg, R, st, inv, date, runId, A, op, page, valid, block, changedUrls });
        inv = rel.inv || inv;
        if (rel.handled) {
          if (rel.published) { remaining--; chosen.add(page); break; } // production HEAD moved: further AI changes wait for the next run
          if (rel.proposed) { remaining--; chosen.add(page); continue; }
          blocked = true; break;
        }
        for (const why of rel.reasons || []) R.notChanged.push({ page, reason: `AI change not auto-published (kept for review): ${why}` });
      }
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

  aiRelease.recordLedger(cfg, R, runId, date);

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

  // ---- Google's view of the sitemap and of key pages (read-only): problems are reported, never assumed
  if (gsc.configured() && R.gsc.available) {
    try { R.sitemapStatus = await gsc.sitemapStatus(`${cfg.siteOrigin}/sitemap.xml`); R.sitemapStatus.problems = indexingLib.sitemapProblems(R.sitemapStatus, inv).problems; }
    catch (e) { R.sitemapStatus = { error: e.message, problems: [] }; }
    R.indexing = indexingLib.discrepancies(R.inspections, inv);
  }

  if (!R.ai.note) R.ai.note = cfg.ai.mode === 'none' ? 'No AI integration configured: patch generation is report-only.' : `AI mode: ${cfg.ai.mode}. The model only receives the minimal page/query context; its output is a validated patch object.`;
  // the first completed audit is the "first dry run": it must pass (site reachable, no critical audit finding) before proposals are allowed
  if (initial && !critical.length && R.inventory.pageCount > 0) { st.initialAuditDone = true; st.initialAuditAt = new Date().toISOString(); A('initial_audit_done', { dryRun }); }
  R.stops = [...new Set(R.stops)];
  st.lastRun = { at: new Date().toISOString(), runId, stops: R.stops, proposals: R.changes.length };
  state.save(cfg, st);
  await finish();
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
