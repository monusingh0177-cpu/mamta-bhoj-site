'use strict';
// Run health: turns one run's facts into a final status (success | degraded | failed | skipped), a list of items with
// a remedy for each problem, a ledger entry, and (only when something is worth saying) an alert.
//
//   success  - everything checked is fine (notes are informational)
//   degraded - the run completed but something needs attention (Google/AI/IndexNow/scheduler/critical SEO finding ...)
//   failed   - the run could not do its core job (site unreachable, crash, watchdog) -> the CLI exits non-zero
//   skipped  - autopilot disabled on purpose
// A run is never reported as success when a check could not be performed.
const { redact, request } = require('./util');
const { REMEDY } = require('./gsc');

const GAP_HOURS = 50; // daily timer + up to 10 min jitter; anything longer means a run was missed
const REALERT_DAYS = 7;

function aiMisconfigured(cfg) {
  const a = cfg.ai || {}; if (!a.mode || a.mode === 'none') return '';
  if (a.mode === 'openai') return !a.baseUrl || !a.apiKey || !a.model ? 'AUTOPILOT_AI_MODE=openai needs AUTOPILOT_AI_BASE_URL, _MODEL and _API_KEY' : '';
  if (a.mode === 'anthropic') return !a.apiKey || !a.model ? 'AUTOPILOT_AI_MODE=anthropic needs AUTOPILOT_AI_API_KEY and AUTOPILOT_AI_MODEL' : '';
  if (a.mode === 'claude-cli') return '';
  return `unknown AUTOPILOT_AI_MODE "${a.mode}"`;
}

// items: { id, level: ok|note|warn|fail, title, detail, remedy }
function assess(R, cfg, ctx) {
  const c = ctx || {}; const items = [];
  const add = (id, level, title, detail, remedy) => items.push({ id, level, title, detail: detail || '', remedy: remedy || '' });

  if (R.skipped) return { status: 'skipped', items: [{ id: 'disabled', level: 'note', title: 'Autopilot is disabled', detail: 'scheduled runs exit immediately', remedy: 'npm run seo:enable' }] };

  // site / inventory
  if (R.fatal) add('site', 'fail', 'Run could not complete', R.fatal, 'Check that the live site is reachable and that the server can make outbound requests.');
  else add('site', 'ok', 'Site inventory', `${(R.inventory || {}).pageCount || 0} pages`);

  // audit
  const a = R.auditSummary || {};
  if (a.critical) add('audit-critical', 'fail', 'Critical SEO findings', `${a.critical} critical finding(s): ${(R.findings || []).filter((f) => f.severity === 'critical').slice(0, 3).map((f) => `${f.path} ${f.code}`).join('; ')}`, 'Fix these first; they can stop pages being indexed. See the Audit findings section of the report.');
  else if (a.high) add('audit-high', 'note', 'High-severity SEO findings', `${a.high} high finding(s)`, 'Review the Audit findings section of the report.');

  // live smoke test
  const smokeFail = (R.smoke || []).filter((x) => !x.ok);
  if (smokeFail.length) add('smoke', 'fail', 'Public smoke test failed', smokeFail.map((x) => x.name).join(', '), 'The live site is not serving something it should; check the site and nginx/PM2 status.');

  // Google
  const gs = (R.gsc || {}).status || (R.gsc && R.gsc.available ? 'ok' : 'api_error');
  if (R.fatal && !(R.gsc || {}).status) { /* the run never got as far as Google */ }
  else if (gs === 'ok') add('google', 'ok', 'Search Console', R.gsc.detail || 'connected');
  else if (gs === 'ok_no_data') add('google', 'note', 'Search Console connected, no traffic data', 'the API answered normally but returned no rows for the window (new or low-traffic property, or data lag). This is not an error.');
  else if (gs === 'not_configured') add('google', 'warn', 'Search Console not configured', 'running in safe report-only mode without Google data', REMEDY.not_configured);
  else if (gs === 'quota') add('google', 'warn', 'Search Console rate limit', R.gsc.reason, (REMEDY.quota));
  else add('google', 'fail', `Search Console unavailable (${gs})`, R.gsc.reason, R.gsc.remedy || REMEDY[gs] || REMEDY.api_error);

  // IndexNow (separate from Google indexing)
  if (!(R.fatal) && R.indexnow && !R.indexnow.keyVerified) add('indexnow', 'warn', 'IndexNow key not verified', R.indexnow.keyDetail, 'Check that /<key>.txt is served by the site (lib/indexnow.js).');

  // AI
  const miss = aiMisconfigured(cfg); const ai = R.ai || {};
  if (miss) add('ai', 'warn', 'AI configured but incomplete', miss, 'Complete the AI settings in /etc/mamta-autopilot/autopilot.env, or set AUTOPILOT_AI_MODE=none. Meanwhile only deterministic audits and reports run.');
  else if (ai.status === 'error') add('ai', 'warn', 'AI request failed', ai.note, 'Check the AI key, model name and quota. The autopilot degrades to report-only; nothing is published.');
  else if (cfg.ai && cfg.ai.mode === 'none') add('ai', 'note', 'AI not configured', 'deterministic audits and reports only');
  else add('ai', 'ok', 'AI', ai.status || 'configured');

  // automatic remediation / publication
  const au = R.auto || {};
  if (cfg.mode === 'auto') {
    if (au.paused) add('auto-paused', 'warn', 'Automatic publishing is paused', `paused ${String(au.paused.at || '').slice(0, 10)}: ${au.paused.reason}`, 'Find out why the release was rolled back (report + audit log), fix the cause, then run: node autopilot/cli.js resume-auto');
    else if (au.effective === 'auto' && !au.enabled) add('auto-config', 'warn', 'Automatic publishing is not active', au.reason, 'Complete the settings in /etc/mamta-autopilot/autopilot.env and run node autopilot/cli.js activate-auto, which checks everything first (see docs/seo-autopilot.md, "Automatic publishing").');
  }
  if (au.refused) add('auto-preflight', 'warn', 'Automatic publishing was refused (nothing was changed)', au.refused, 'Bring the production checkout to origin/main (deploy, or push the unpushed commit), then the next run can publish. The fix is waiting on a review branch.');
  for (const x of au.rolledBack || []) add('release', x.ok ? 'warn' : 'fail', x.ok ? 'An automatic release was rolled back' : 'An automatic release was rolled back, but the rollback itself FAILED', `${x.page}: ${x.reason}`, x.ok ? 'The previous version is serving. Auto-publishing is paused until you run: node autopilot/cli.js resume-auto' : 'Check the site NOW: cd the app directory, git status, git log -3, restart the app. Use scripts/deploy-production.sh --rollback <previous SHA> if needed.');
  for (const x of au.published || []) add('release-' + String(x.sha).slice(0, 8), 'note', 'Automatic fix published and verified live', `${x.page} (link to ${x.target}) ${String(x.prev).slice(0, 8)} -> ${String(x.sha).slice(0, 8)}`);

  // Semrush (optional): a configured-but-failing account is visible and never turned into a zero
  const sem = R.semrush || {};
  if (sem.status && sem.status !== 'ok' && sem.status !== 'not_configured') add('semrush', sem.status === 'no_units' || sem.status === 'auth_invalid' ? 'warn' : 'note', `Semrush unavailable (${sem.status})`, sem.detail || '', sem.remedy);

  // Google's view of the sitemap / indexing (only when Search Console is connected)
  const sms = R.sitemapStatus;
  if (sms && sms.error) add('sitemap-status', 'note', 'Sitemap status could not be read from Google', sms.error);
  else if (sms && (sms.problems || []).length) add('sitemap-status', sms.errors > 0 ? 'warn' : 'note', 'Google reports a sitemap problem', sms.problems.join(' | '), 'Open Search Console > Sitemaps for details; the autopilot resubmits the sitemap after real content changes. A submission is not a guarantee of crawling or indexing.');
  const idx = R.indexing || [];
  if (idx.length) add('indexing', idx.some((x) => x.severity === 'high') ? 'warn' : 'note', `${idx.length} indexing discrepancy(ies) between the site and Google`, idx.slice(0, 3).map((x) => `${x.path}: ${x.message}`).join(' | '), 'See URL Inspection in Search Console. These are status facts, not a promise that a change will get the page indexed.');

  // target keywords: page mismatches and content coverage gaps (facts about the site, never a ranking claim)
  const kws = R.keywords || [];
  const mism = kws.filter((k) => k.mismatch); const gaps = kws.filter((k) => k.coverage && k.coverage.level !== 'good');
  if (mism.length) add('keyword-mismatch', 'note', `${mism.length} target keyword(s) are shown by a different page than the one that fits best`, mism.slice(0, 3).map((k) => `${k.keyword}: ${k.mismatchNote}`).join(' | '), 'Review the Target keywords section of the report; consider internal links to the better-fitting page.');
  if (gaps.length) add('keyword-coverage', 'note', `${gaps.length} target keyword(s) are only partly covered by an existing page`, gaps.slice(0, 3).map((k) => `${k.keyword}: ${k.coverage.note}`).join(' | '), 'A person decides whether content is needed; the autopilot never creates a page for a keyword.');

  // proposals discarded by quality gates
  const discarded = (R.rollbacks || []).filter((x) => !/^release rolled back/.test(x.reason));
  if (discarded.length) add('gates', 'warn', 'A proposal was discarded by the quality gates', discarded.map((x) => x.reason).join(' | ').slice(0, 300), 'Nothing was changed. Review the report; the page may need a manual edit.');

  // repository safety stops
  const repoStop = (R.stops || []).find((s) => /^(protected files|git working tree|git repository)/.test(s));
  if (repoStop) add('repo', 'warn', 'Repository not in the expected state', repoStop, 'Proposals are paused until the working tree is clean (data/ and uploads are ignored).');

  // scheduler gap: the previous completed run is much older than one day
  if (c.prevRunAt) {
    const hours = (Date.parse(R.startedAt) - Date.parse(c.prevRunAt)) / 3600000;
    if (Number.isFinite(hours) && hours > GAP_HOURS) add('scheduler', 'warn', 'A scheduled run was missed', `the previous run was ${Math.round(hours)} hours ago`, 'Check: systemctl list-timers mamta-autopilot.timer ; journalctl -u mamta-autopilot.service -n 50. The timer is Persistent, so it also catches up after a reboot.');
  }

  // configuration
  if (cfg.envFileWarning) add('config', 'warn', 'Credentials file permissions', cfg.envFileWarning, 'chmod 600 the file.');

  // any other collected errors
  const other = (R.errors || []).filter((e) => !/^inventory failed/.test(e) && e !== cfg.envFileWarning);
  if (other.length) add('errors', 'warn', 'Errors during the run', other.slice(0, 3).join(' | ').slice(0, 300), 'See the audit log: npm run seo:audit-log');

  const status = R.fatal ? 'failed' : items.some((i) => i.level === 'fail' || i.level === 'warn') ? 'degraded' : 'success';
  return { status, items };
}

// One ledger line: who/when/what was checked/what was done/what went wrong.
function ledgerEntry(R) {
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  return {
    runId: R.runId, date: R.date, startedAt: R.startedAt, endedAt: R.endedAt, durationMs: Date.parse(R.endedAt) - Date.parse(R.startedAt),
    status: R.status, mode: R.mode, effectiveMode: R.effectiveMode, dryRun: R.dryRun,
    checks: { pages: (R.inventory || {}).pageCount || 0, findings: R.auditSummary, smokeFailed: (R.smoke || []).filter((x) => !x.ok).length, google: (R.gsc || {}).status || 'unknown', indexnowKey: Boolean((R.indexnow || {}).keyVerified), inspections: n(R.inspections), ai: (R.ai || {}).status || 'none' },
    actions: { proposals: n(R.changes), published: n((R.auto || {}).published), rolledBack: n((R.auto || {}).rolledBack), fixesPlanned: n(R.fixes), discarded: n(R.rollbacks), changedUrls: n(R.changedUrls), indexnowSubmissions: n((R.indexnow || {}).submissions), sitemap: ((R.sitemapSubmission || {}).status || '').slice(0, 80) },
    stops: R.stops, errors: (R.errors || []).slice(0, 10), health: (R.health || []).filter((i) => i.level === 'warn' || i.level === 'fail').map((i) => i.id),
  };
}

// Decide whether to alert. Quiet when nothing changed; loud when something broke, recovered, or needs a decision.
function alertReasons(R, prev, nowMs) {
  const reasons = []; const bad = (R.health || []).filter((i) => i.level === 'warn' || i.level === 'fail');
  const ids = bad.map((i) => i.id).sort().join(',');
  if (R.status === 'skipped' || R.dryRun) return reasons;
  if (R.status === 'failed') reasons.push('the run failed');
  if (!prev) { if (bad.length) reasons.push('first run reports problems'); }
  else {
    if (prev.ids !== ids) reasons.push(ids ? 'the set of problems changed' : 'all problems cleared (recovered)');
    else if (prev.pending) reasons.push('the previous alert could not be delivered');
    else if (ids && nowMs - Date.parse(prev.alertedAt || prev.at || 0) > REALERT_DAYS * 86400000) reasons.push(`problems still open after ${REALERT_DAYS} days`);
  }
  if ((R.auto || {}).rolledBack && R.auto.rolledBack.length) reasons.push('an automatic release was rolled back');
  else if ((R.rollbacks || []).filter((x) => !/^release rolled back/.test(x.reason)).length) reasons.push('a proposal was discarded');
  if ((R.auto || {}).published && R.auto.published.length) reasons.push(`${R.auto.published.length} fix(es) published and verified live`);
  if ((R.changes || []).length) reasons.push(`${R.changes.length} proposal(s) ready for review`);
  const t = (R.gsc || {}).totals;
  if (t && t.previous.clicks >= 20 && t.current.clicks < t.previous.clicks * 0.7) reasons.push(`clicks fell ${Math.round((1 - t.current.clicks / t.previous.clicks) * 100)}% vs the previous 28 days`);
  return reasons;
}

function alertText(R, reasons) {
  const lines = [`Mamta SEO autopilot ${R.date}: ${String(R.status).toUpperCase()} (run ${R.runId})`, `Why: ${reasons.join('; ')}`];
  for (const i of (R.health || []).filter((x) => x.level === 'warn' || x.level === 'fail').slice(0, 5)) lines.push(`- [${i.level}] ${i.title}${i.detail ? ': ' + i.detail : ''}${i.remedy ? ' -> ' + i.remedy : ''}`);
  return redact(lines.join('\n')).slice(0, 1500);
}

// Existing channel only: AUTOPILOT_ALERT_WEBHOOK (Slack/Teams/Discord-style {text}). No webhook configured -> no alert, the
// ledger, reports and exit status still record everything. The payload is redacted; a failing webhook never fails the run.
async function sendAlert(cfg, text) {
  if (!cfg.alertWebhook) return { sent: false, reason: 'no AUTOPILOT_ALERT_WEBHOOK configured' };
  try { const r = await request(cfg.alertWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), timeoutMs: 10000 }); return { sent: r.status >= 200 && r.status < 300, status: r.status }; }
  catch (e) { return { sent: false, reason: redact(e.message) }; }
}

module.exports = { assess, ledgerEntry, alertReasons, alertText, sendAlert, aiMisconfigured, GAP_HOURS };
