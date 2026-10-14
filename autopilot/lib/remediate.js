'use strict';
// Deterministic remediation: discover (audit finding / Search Console opportunity) -> proposal (validated patch on a
// separate branch) -> apply in an isolated worktree -> quality gates -> [auto mode only] publish + live verification
// + rollback -> record. Every step is written to R.fixes[i].trace, the audit log and the run ledger, so a change can
// be followed from discovery to live verification.
const fixers = require('./fixers');
const patchLib = require('./patch');
const gates = require('./gates');
const branchLib = require('./branch');
const publishLib = require('./publish');
const inventory = require('./inventory');
const state = require('./state');
const { git } = require('./git');

// ctx: { cfg, R, st, inv, date, runId, A, remaining, effectiveMode, changedUrls }
// -> { inv, remaining, blocked }   (R, st and changedUrls are updated in place)
async function remediate(ctx) {
  const { cfg, R, st, date, runId, A } = ctx; let { inv } = ctx; let blocked = false;
  let remaining = Math.max(0, cfg.limits.fixesPerDay - state.fixesToday(st, date));
  const auto = ctx.effectiveMode === 'auto';
  R.auto = { mode: cfg.mode, effective: ctx.effectiveMode, enabled: false, reason: '', paused: st.autoPaused || null, published: [], rolledBack: [] };
  if (auto) {
    const mis = publishLib.misconfigured(cfg);
    if (mis) R.auto.reason = mis;
    else if (st.autoPaused) R.auto.reason = `auto-publishing is paused since ${st.autoPaused.at.slice(0, 10)} (${st.autoPaused.reason}); run: node autopilot/cli.js resume-auto`;
    else R.auto.enabled = true;
  } else R.auto.reason = cfg.mode === 'auto' ? 'not publishing in this run (' + (ctx.R.dryRun ? 'dry run' : 'first/baseline run') + ')' : `AUTOPILOT_MODE=${cfg.mode}: fixes are prepared on a branch for review`;

  const fixes = fixers.plan({ repoDir: cfg.repoDir, inv, findings: R.findings, opportunities: R.opportunities, opportunityInlinks: cfg.opportunityInlinks, limit: 3 });
  R.fixes = fixes.map((f) => ({ id: f.id, kind: f.kind, page: f.page, target: f.target, source: f.source, reason: f.reason, outcome: 'planned', trace: [] }));
  const openBranches = (() => { try { return branchLib.list(cfg); } catch (e) { return []; } })();
  const publishedToday = st.history.filter((h) => h.status === 'published' && h.date === date).length;

  for (let i = 0; i < fixes.length; i++) {
    const fx = fixes[i]; const out = R.fixes[i];
    const trace = (name, ok, detail) => { out.trace.push({ name, ok, detail: String(detail || '').slice(0, 300) }); A('fix_step', { id: fx.id, name, ok, detail: String(detail || '').slice(0, 300) }); };
    const skip = (reason) => { out.outcome = 'skipped'; out.reason2 = reason; R.notChanged.push({ page: fx.page, reason: `${fx.id}: ${reason}` }); };
    trace('discover', true, `${fx.source}: ${fx.reason}`);
    if (remaining <= 0) { skip(`daily limit of ${cfg.limits.fixesPerDay} automatic fix(es) reached`); continue; }
    const cd = state.onCooldown(cfg, st, fx.page, date); if (cd) { skip(`page changed on ${cd.last}; cooldown until ${cd.until}`); continue; }
    const tcd = st.history.filter((h) => h.target === fx.target && ['proposed', 'published'].includes(h.status)).map((h) => h.date).sort().pop();
    if (tcd && date <= require('./util').addDays(tcd, cfg.limits.cooldownDays - 1)) { skip(`a link to ${fx.target} was already added on ${tcd}; waiting ${cfg.limits.cooldownDays} days for the effect to show`); continue; }
    if (openBranches.some((b) => b.includes(`-${branchLib.slug(fx.page)}-`))) { skip('an open autopilot proposal branch for this page is awaiting review'); continue; }
    let wt = null; let gatesRes = null;
    try {
      wt = branchLib.create(cfg, { date, page: fx.page, id: runId });
      for (const p of fx.patches) { const v = patchLib.validate(p, { repoDir: wt.dir }); if (!v.ok) throw new Error(`patch no longer applies: ${v.errors.join('; ')}`); patchLib.apply(v, p); }
      trace('propose', true, fx.patches.map((p) => `${p.file}: ${p.rationale}`).join(' | '));
      gatesRes = await gates.runGates(cfg, { dir: wt.dir, changedPaths: [fx.page], baseline: inv, baselineAudit: R.findings });
      R.gates = gatesRes.results;
      if (!gatesRes.ok) {
        branchLib.remove(cfg, wt, true); wt = null;
        const failed = gatesRes.results.filter((x) => !x.ok).map((x) => x.name);
        trace('gates', false, `failed: ${failed.join(', ')}`); out.outcome = 'rejected';
        R.rollbacks.push({ page: fx.page, reason: `gates failed (${failed.join(', ')}); change discarded, nothing was applied`, sha: null });
        st.history.push({ date, page: fx.page, target: fx.target, status: 'rejected', reason: `gates failed: ${failed.join(', ')}`, kind: fx.kind });
        R.stops.push(`gates failed for ${fx.page}; fix discarded`); blocked = true; break;
      }
      trace('gates', true, gatesRes.results.map((g) => g.name).join(', '));
      const sha = branchLib.commit(wt, [...new Set(fx.patches.map((p) => p.file))], `autopilot fix: ${fx.kind} for ${fx.page}\n\n${fx.reason}\n${fx.patches.map((p) => p.rationale).join('\n')}`.slice(0, 900));
      branchLib.remove(cfg, wt, false); const branch = wt.branch; wt = null;
      out.branch = branch; out.sha = sha;

      if (!R.auto.enabled || publishedToday + R.auto.published.length >= cfg.auto.maxPerDay) {
        const why = !R.auto.enabled ? R.auto.reason : `auto-publish limit of ${cfg.auto.maxPerDay} release(s) per day reached`;
        trace('publish', false, `not published: ${why}`); out.outcome = 'proposed';
        const change = { page: fx.page, kind: fx.kind, query: fx.target, branch, sha, rationale: fx.patches.map((p) => p.rationale).join(' '), files: [...new Set(fx.patches.map((p) => p.file))], diffStat: branchLib.diffStat(cfg, branch), review: `git diff HEAD...${branch}   then, if you approve:   git merge --no-ff ${branch}` };
        st.history.push({ date, page: fx.page, target: fx.target, status: 'proposed', branch, sha, kind: fx.kind, source: fx.source });
        R.changes.push(change); remaining--; A('proposal_created', { page: fx.page, branch, sha, deterministic: true });
        continue;
      }

      // ---- publish (auto mode, everything configured, not paused)
      const res = await publishLib.publishFix(cfg, { sha, changedPages: [fx.page], expect: [fx.expect], baselineAudit: R.findings, onStep: (s) => trace(s.name, s.ok, s.detail) });
      out.release = { prev: res.prev, now: res.now, published: res.published, rolledBack: res.rolledBack };
      if (res.published) {
        out.outcome = 'published'; remaining--;
        st.history.push({ date, page: fx.page, target: fx.target, status: 'published', branch, sha, kind: fx.kind, source: fx.source, prev: res.prev });
        R.auto.published.push({ page: fx.page, target: fx.target, sha, prev: res.prev });
        try { git(cfg.repoDir, ['branch', '-D', branch]); } catch (e) { /* branch already gone */ }
        // the live page changed for real: refresh the inventory so the stored hash is the new one, and notify engines for this URL only
        try { inv = await inventory.build(cfg.fetchBase, { origin: cfg.siteOrigin }); } catch (e) { R.errors.push(`post-release inventory failed: ${e.message}`); }
        if (!ctx.changedUrls.includes(fx.page)) ctx.changedUrls.push(fx.page);
        R.repo.head = res.now; A('fix_published', { id: fx.id, sha, prev: res.prev });
        break; // production HEAD moved: the remaining planned fixes were built on the old HEAD; they are re-planned on the next run
      }
      if (res.rolledBack || res.rollbackFailed) {
        out.outcome = res.rolledBack ? 'rolled-back' : 'rollback-failed';
        try { git(cfg.repoDir, ['branch', '-D', branch]); } catch (e) { /* ignore */ }
        R.rollbacks.push({ page: fx.page, reason: `release rolled back: ${res.error}`, sha });
        R.auto.rolledBack.push({ page: fx.page, sha, reason: res.error, ok: res.rolledBack });
        st.history.push({ date, page: fx.page, target: fx.target, status: 'rolled-back', branch, sha, kind: fx.kind, reason: res.error });
        st.autoPaused = { at: new Date().toISOString(), runId, reason: res.error.slice(0, 160), page: fx.page };
        R.auto.paused = st.autoPaused; R.stops.push(`release for ${fx.page} was rolled back; auto-publishing paused`);
        if (res.rollbackFailed) { R.errors.push(`ROLLBACK FAILED for ${fx.page}: ${res.error}`); R.fatal = `release rollback failed: ${res.error}`; }
        A('fix_rolled_back', { id: fx.id, sha, error: res.error, ok: res.rolledBack }); blocked = true; break;
      }
      // refused before anything changed (preflight): keep it as a reviewable proposal
      out.outcome = 'proposed'; R.changes.push({ page: fx.page, kind: fx.kind, query: fx.target, branch, sha, rationale: fx.patches.map((p) => p.rationale).join(' '), files: [...new Set(fx.patches.map((p) => p.file))], diffStat: branchLib.diffStat(cfg, branch), review: `git diff HEAD...${branch}   then, if you approve:   git merge --no-ff ${branch}` });
      st.history.push({ date, page: fx.page, target: fx.target, status: 'proposed', branch, sha, kind: fx.kind, source: fx.source }); remaining--;
      R.auto.reason = `publish refused before any change: ${res.error}`; R.auto.refused = (res.steps.find((x) => !x.ok) || {}).detail || res.error; R.notChanged.push({ page: fx.page, reason: `not published: ${res.error}` });
    } catch (e) {
      if (wt) branchLib.remove(cfg, wt, true);
      trace('error', false, e.message); out.outcome = 'error'; R.errors.push(`fix ${fx.id} failed: ${e.message}`); A('fix_error', { id: fx.id, error: e.message });
      blocked = true; R.stops.push(`fix for ${fx.page} failed; discarded`); break;
    }
  }
  return { inv, blocked };
}

module.exports = { remediate };
