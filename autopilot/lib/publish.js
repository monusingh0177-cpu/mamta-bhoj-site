'use strict';
// Automatic publication of ONE already-gated fix (AUTOPILOT_MODE=auto only).
//
// Input: a commit that the autopilot created on a proposal branch, whose parent is the current production HEAD, and
// that already passed every quality gate in an isolated worktree. This module then:
//
//   1 preflight  production checkout on the release branch, tracked tree clean (data/ and uploads are ignored),
//                HEAD == remote/branch right now, the commit is a single child of HEAD, only allow-listed
//                non-protected files changed
//   2 merge      git merge --ff-only <sha>        (never reset/clean/stash; local data edits are never touched)
//   3 restart    the operator-configured restart command
//   4 verify     live site answers, smoke test, changed pages contain the expected change, no new critical/high
//                SEO defect, optionally the project's SEO health check against the live URL
//   5 push       git push remote <sha>:branch     (the remote only ever receives a commit that was verified live)
//
// If step 2, 3, 4 or 5 fails, the release is rolled back: git reset --keep <previous HEAD> (refuses to overwrite
// local edits), restart again, verify the old site is serving. The caller then pauses auto-publishing (circuit
// breaker) and alerts. Nothing here ever force-pushes or touches data/, uploads, .env, auth or the mailer.
const { git, run, head, branch, dirty } = require('./git');
const { isProtected, ALLOWED_FILES } = require('./patch');
const { request } = require('./util');
const inventory = require('./inventory');
const gates = require('./gates');
const { auditInventory } = require('./audit');

const RUNTIME_DATA = /^(data\/|public\/uploads\/)/;
const MAX_FILES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is auto-publishing configured well enough to even try? -> '' or the reason it is not.
function misconfigured(cfg) {
  if (!cfg.auto.restartCmd) return 'AUTOPILOT_RESTART_CMD is not set (the command that restarts the site after a release, e.g. "pm2 restart mamta-bhoj")';
  if (!/^[A-Za-z0-9._-]+$/.test(cfg.auto.remote)) return 'AUTOPILOT_GIT_REMOTE has an unsafe format';
  if (!/^[A-Za-z0-9._\/-]+$/.test(cfg.auto.branch)) return 'AUTOPILOT_GIT_BRANCH has an unsafe format';
  return '';
}

async function waitForSite(cfg, timeoutMs) {
  const end = Date.now() + timeoutMs; let last = '';
  while (Date.now() < end) {
    try { const r = await request(cfg.fetchBase + '/robots.txt', { timeoutMs: 4000 }); if (r.status === 200) return { ok: true }; last = `HTTP ${r.status}`; } catch (e) { last = e.message; }
    await sleep(500);
  }
  return { ok: false, detail: `the site did not answer within ${Math.round(timeoutMs / 1000)}s (${last})` };
}

// Live verification of the release. -> { ok, results[] }
async function verifyLive(cfg, changedPages, expect, baselineAudit) {
  const results = []; const add = (name, ok, detail) => results.push({ name, ok, detail: String(detail || '').slice(0, 300) });
  const up = await waitForSite(cfg, cfg.auto.verifyTimeoutMs); add('site-answers', up.ok, up.detail);
  if (!up.ok) return { ok: false, results };
  try { const sm = await gates.smoke(cfg, changedPages); for (const r of sm.results) add(`smoke:${r.name}`, r.ok, r.detail); } catch (e) { add('smoke', false, e.message); }
  for (const x of expect || []) {
    try { const r = await request(cfg.fetchBase + x.page, { timeoutMs: 8000 }); const miss = (x.includes || []).filter((s) => !String(r.body).includes(s)); add(`live-change:${x.page}`, r.status === 200 && miss.length === 0, r.status !== 200 ? `HTTP ${r.status}` : miss.length ? `missing on the live page: ${miss.join(', ')}` : 'the change is live'); }
    catch (e) { add(`live-change:${x.page}`, false, e.message); }
  }
  try {
    const inv = await inventory.build(cfg.fetchBase, { origin: cfg.siteOrigin }); const key = (f) => `${f.path}|${f.code}`; const before = new Set((baselineAudit || []).map(key));
    const fresh = auditInventory(inv, { origin: cfg.siteOrigin, minInlinks: cfg.minInlinks }).filter((f) => ['critical', 'high'].includes(f.severity) && !before.has(key(f)));
    add('no-new-seo-defects', fresh.length === 0, fresh.slice(0, 4).map((f) => `${f.path} ${f.code}`).join('; '));
  } catch (e) { add('no-new-seo-defects', false, e.message); }
  if (cfg.gates.hardCheck) {
    const hc = require('path').join(cfg.repoDir, 'scripts/seo-health-check.sh');
    if (require('fs').existsSync(hc)) { const r = run(`bash scripts/seo-health-check.sh --base-url ${cfg.fetchBase}`, cfg.repoDir, 300000); add('seo-health-check', r.code === 0, r.code === 0 ? (r.out.match(/RESULT:.*/) || ['passed'])[0] : r.out.split('\n').filter((l) => /FAIL|ERROR/.test(l)).slice(0, 3).join(' | ')); }
  }
  return { ok: results.every((r) => r.ok), results };
}

function restart(cfg) {
  const r = run(cfg.auto.restartCmd, cfg.repoDir, cfg.auto.restartTimeoutMs);
  return { ok: r.code === 0, detail: r.code === 0 ? 'restarted' : `restart command exited ${r.code}: ${r.out.split('\n').slice(-3).join(' ').slice(0, 200)}` };
}

// ctx: { sha, changedPages[], expect[], baselineAudit[], onStep(step) }
// -> { ok, published, rolledBack, rollbackFailed, prev, now, steps[], error }
async function publishFix(cfg, ctx) {
  const steps = []; const step = (name, ok, detail) => { const s = { name, ok, detail: String(detail || '').slice(0, 400) }; steps.push(s); if (ctx.onStep) ctx.onStep(s); return ok; };
  const R = { ok: false, published: false, rolledBack: false, rollbackFailed: false, prev: null, now: null, steps, error: '' };
  const fail = (msg) => { R.error = msg; return R; };
  const { remote, branch: rel } = cfg.auto; const repo = cfg.repoDir; const sha = ctx.sha;

  // ---- 1 preflight (nothing has changed yet; a failure here is just "not published")
  try {
    if (branch(repo) !== rel) { step('preflight', false, `the production checkout is on "${branch(repo)}", not "${rel}"`); return fail('production checkout is not on the release branch'); }
    const d = dirty(repo).filter((x) => !RUNTIME_DATA.test(x.file));
    if (d.length) { step('preflight', false, `tracked files are modified: ${d.slice(0, 4).map((x) => x.file).join(', ')}`); return fail('production working tree is not clean'); }
    git(repo, ['fetch', '--quiet', remote, rel], { timeoutMs: cfg.auto.pushTimeoutMs });
    const remoteHead = git(repo, ['rev-parse', 'FETCH_HEAD']); R.prev = head(repo);
    if (remoteHead !== R.prev) {
      let ahead = false; try { git(repo, ['merge-base', '--is-ancestor', remoteHead, R.prev]); ahead = true; } catch (e) { /* behind or diverged */ }
      step('preflight', false, ahead
        ? `production HEAD ${R.prev.slice(0, 8)} is AHEAD of ${remote}/${rel} ${remoteHead.slice(0, 8)}: there are unpushed commits (an interrupted release?). Check the site, then push them yourself: git push ${remote} ${rel}`
        : `production HEAD ${R.prev.slice(0, 8)} differs from ${remote}/${rel} ${remoteHead.slice(0, 8)} (deploy or push first; the autopilot only publishes on top of the released commit)`);
      return fail('production checkout is not at the remote release commit');
    }
    if (git(repo, ['rev-parse', `${sha}^`]) !== R.prev || git(repo, ['rev-list', '--count', `${R.prev}..${sha}`]) !== '1') { step('preflight', false, 'the fix is not exactly one commit on top of production HEAD'); return fail('fix commit does not sit directly on production HEAD'); }
    const files = git(repo, ['diff', '--name-only', R.prev, sha]).split('\n').filter(Boolean);
    const bad = files.filter((f) => isProtected(f) || !ALLOWED_FILES.includes(f));
    if (!files.length || files.length > MAX_FILES || bad.length) { step('preflight', false, bad.length ? `protected or non-allow-listed files: ${bad.join(', ')}` : `${files.length} files changed (allowed: 1-${MAX_FILES})`); return fail('protected-path guard refused the change'); }
    step('preflight', true, `on ${rel}, tree clean, HEAD == ${remote}/${rel} (${R.prev.slice(0, 8)}), ${files.join(', ')}`);
  } catch (e) { step('preflight', false, e.message); return fail(e.message); }

  // ---- 2..5 release; any failure rolls back
  const rollback = async (why) => {
    R.error = why;
    try {
      if (head(repo) !== R.prev) git(repo, ['reset', '--keep', R.prev]);
      step('rollback-code', head(repo) === R.prev, `production checkout restored to ${R.prev.slice(0, 8)} with git reset --keep (local data edits untouched)`);
      const rs = restart(cfg); step('rollback-restart', rs.ok, rs.detail);
      const v = await verifyLive(cfg, ctx.changedPages, [], ctx.baselineAudit); step('rollback-verify', v.ok, v.ok ? 'the previous version is serving' : v.results.filter((x) => !x.ok).map((x) => `${x.name}: ${x.detail}`).join('; '));
      R.rolledBack = head(repo) === R.prev && rs.ok && v.ok; R.rollbackFailed = !R.rolledBack;
    } catch (e) { step('rollback', false, e.message); R.rollbackFailed = true; }
    R.now = (() => { try { return head(repo); } catch (e) { return null; } })();
    return R;
  };
  try {
    git(repo, ['merge', '--ff-only', sha]);
    if (head(repo) !== sha) return await rollback('the fast-forward did not land on the expected commit');
    step('merge', true, `fast-forwarded ${R.prev.slice(0, 8)} -> ${sha.slice(0, 8)}`);
  } catch (e) { step('merge', false, e.message); return rollback(`merge failed: ${e.message}`); }
  const rs = restart(cfg); step('restart', rs.ok, rs.detail); if (!rs.ok) return rollback(rs.detail);
  const v = await verifyLive(cfg, ctx.changedPages, ctx.expect, ctx.baselineAudit);
  step('verify-live', v.ok, v.ok ? v.results.map((x) => x.name).join(', ') : v.results.filter((x) => !x.ok).map((x) => `${x.name}: ${x.detail}`).join('; '));
  if (!v.ok) return rollback('live verification failed: ' + v.results.filter((x) => !x.ok).map((x) => x.name).join(', '));
  try {
    git(repo, ['push', '--quiet', remote, `${sha}:refs/heads/${rel}`], { timeoutMs: cfg.auto.pushTimeoutMs });
    step('push', true, `${remote}/${rel} now at ${sha.slice(0, 8)}`);
  } catch (e) {
    let there = false; try { there = git(repo, ['ls-remote', remote, `refs/heads/${rel}`], { timeoutMs: 30000 }).startsWith(sha); } catch (x) { /* unreachable */ }
    if (!there) { step('push', false, e.message); return rollback(`push failed, so the release was withdrawn to keep the server and ${remote} consistent: ${e.message}`); }
    step('push', true, `${remote}/${rel} already at ${sha.slice(0, 8)}`);
  }
  R.ok = true; R.published = true; R.now = sha;
  return R;
}

module.exports = { publishFix, misconfigured, verifyLive, waitForSite, restart };
