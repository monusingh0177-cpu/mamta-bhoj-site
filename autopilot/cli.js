#!/usr/bin/env node
'use strict';
// SEO autopilot command line. Commands (also available as npm run seo:*):
//   run          daily run (seo:auto). Report-only unless AUTOPILOT_MODE=propose AND the first audit passed.
//   dry-run      full audit + report; no branch, no submissions, no lastmod (seo:dry-run)
//   report       print the latest report (seo:report)
//   enable       allow scheduled runs (seo:enable)
//   disable      stop scheduled runs (seo:disable)
//   rollback     withdraw the latest proposal, or propose a revert if it was already merged (seo:rollback)
//   audit-log    show the latest audit-log entries (seo:audit-log)
//   baseline     accept the current live site as the new baseline after a deliberate manual deploy
//   status       show mode, state and limits
//   verify-google  check Google OAuth + access to the Search Console property (prints a status and a remedy, never a credential)
//   health       exit status for external monitoring: 0 healthy, 1 last run failed, 4 no recent run (scheduler problem)
//   weekly       build the weekly trend report now
//   ledger       show the latest run records (id, times, checks, actions, final status)
//
// Exit codes for `run`: 0 completed (success, degraded or skipped; degraded is stated on the last line and alerted),
// 1 the run FAILED (could not complete, crashed or hit the watchdog), 3 another run is in progress.
const crypto = require('crypto');
const fs = require('fs');
const { loadConfig } = require('./config');
const state = require('./lib/state');
const reportLib = require('./lib/report');
const gscLib = require('./lib/gsc');
const health = require('./lib/health');
const weekly = require('./lib/weekly');
const { redact, zonedDate } = require('./lib/util');
const { runOnce, rollbackLast, acceptBaseline } = require('./run');

const out = (...a) => console.log(redact(a.join(' ')));

// A crash or watchdog stop never leaves the run looking successful: it gets a ledger line, an audit event and an alert.
async function recordCrash(cfg, runId, e, startedAt, dryRun) {
  const now = new Date();
  const entry = { runId, date: now.toISOString().slice(0, 10), startedAt, endedAt: now.toISOString(), durationMs: now - Date.parse(startedAt), status: 'failed', dryRun, mode: cfg.mode, checks: {}, actions: {}, stops: [], errors: [redact(e.message)], health: ['crash'] };
  try { state.recordRun(cfg, entry); state.audit(cfg, runId, 'run_crashed', { error: e.message }); } catch (x) { /* never mask the original error */ }
  if (!dryRun) { const a = await health.sendAlert(cfg, redact(`Mamta SEO autopilot: run ${runId} FAILED: ${e.message}. Check: journalctl -u mamta-autopilot.service -n 50`)); try { state.audit(cfg, runId, 'alert', { reasons: ['the run failed'], sent: a.sent }); } catch (x) { /* ignore */ } }
}

async function main(argv) {
  const cmd = argv[0] || 'status'; const cfg = loadConfig();
  const files = state.init(cfg); const lim = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1], 10) : 40;
  switch (cmd) {
    case 'run': case 'auto': case 'dry-run': {
      if (!state.acquireLock(cfg)) { out('another autopilot run is in progress; exiting'); try { state.audit(cfg, 'locked', 'run_skipped_locked', {}); } catch (e) { /* ignore */ } return 3; }
      const runId = crypto.randomBytes(3).toString('hex'); const startedAt = new Date().toISOString(); const dryRun = cmd === 'dry-run';
      const limitMs = Number(process.env.AUTOPILOT_RUN_TIMEOUT_MS) || 50 * 60 * 1000; let timer;
      try {
        const R = await Promise.race([
          runOnce(cfg, { runId, dryRun, manual: process.stdout.isTTY || argv.includes('--manual') }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`watchdog: the run exceeded ${Math.round(limitMs / 60000)} minutes and was stopped`)), limitMs); }),
        ]);
        clearTimeout(timer);
        out(`SEO autopilot ${R.dryRun ? 'dry run' : 'run'} ${R.runId}: status=${R.status}; mode=${R.effectiveMode}; pages=${R.inventory.pageCount || 0}; findings critical=${R.auditSummary.critical} high=${R.auditSummary.high}; opportunities=${R.opportunities.length}; proposals=${R.changes.length}; discarded=${R.rollbacks.length}`);
        if (R.stops.length) { out('STOPPED (no proposals): ' + R.stops.join(' | ')); }
        for (const i of (R.health || []).filter((x) => x.level === 'warn' || x.level === 'fail')) out(`${R.status === 'failed' ? 'FAILED' : 'ATTENTION'} [${i.id}] ${i.title}${i.detail ? ': ' + i.detail : ''}`);
        out(`report: ${R.reportFile}`);
        return R.status === 'failed' ? 1 : 0;
      } catch (e) {
        clearTimeout(timer);
        await recordCrash(cfg, runId, e, startedAt, dryRun);
        out(`FAILED: ${e.message}`);
        return 1;
      } finally { state.releaseLock(cfg); }
    }
    case 'report': { const f = reportLib.latest(files); if (!f) { out('no report yet; run: npm run seo:dry-run'); return 1; } process.stdout.write(fs.readFileSync(f, 'utf8')); return 0; }
    case 'enable': state.setEnabled(cfg, true); out('autopilot enabled (scheduled runs will execute)'); return 0;
    case 'disable': state.setEnabled(cfg, false); out('autopilot disabled (scheduled runs will exit immediately; manual runs still work)'); return 0;
    case 'rollback': { const r = await rollbackLast(cfg); out(JSON.stringify(r, null, 2)); return 0; }
    case 'audit-log': for (const e of state.readAudit(cfg, lim)) out(JSON.stringify(e)); return 0;
    case 'ledger': for (const e of state.readLedger(cfg, lim)) out(JSON.stringify(e)); return 0;
    case 'baseline': { const r = await acceptBaseline(cfg); out(`baseline accepted: ${r.pages} pages`); return 0; }
    case 'verify-google': {
      const v = await gscLib.create(cfg, files.cache).verify();
      out(`google: ${v.ok ? 'OK' : 'NOT OK'} [${v.status}] ${v.detail}`); if (v.remedy) out(`remedy: ${v.remedy}`);
      return v.ok ? 0 : 1;
    }
    case 'weekly': { const z = zonedDate(new Date(), cfg.timezone); const st = state.load(cfg); const f = weekly.write(cfg, files, st, z.date); st.lastWeekly = z.date; state.save(cfg, st); out(`weekly report: ${f}`); return 0; }
    case 'health': {
      const last = state.readLedger(cfg, 200).filter((e) => !e.dryRun && e.status !== 'skipped').pop();
      if (!last) { out('health: no run recorded yet'); return 4; }
      const hours = (Date.now() - Date.parse(last.endedAt)) / 3600000;
      out(`health: last run ${last.runId} ${last.status} ${Math.round(hours)}h ago`);
      if (hours > health.GAP_HOURS) { out(`health: no run for more than ${health.GAP_HOURS}h: check the timer (systemctl list-timers mamta-autopilot.timer)`); return 4; }
      return last.status === 'failed' ? 1 : 0;
    }
    case 'status': {
      const st = state.load(cfg);
      out(JSON.stringify({ enabled: !state.isDisabled(cfg), mode: cfg.mode, publish: cfg.publish, aiMode: cfg.ai.mode, gscConfigured: Boolean(cfg.google.clientId && cfg.google.clientSecret && cfg.google.refreshToken), alertWebhookConfigured: Boolean(cfg.alertWebhook), initialAuditDone: st.initialAuditDone, lastRun: st.lastRun, lastHealth: st.lastHealth, lastWeekly: st.lastWeekly, stateDir: cfg.stateDir, repoDir: cfg.repoDir, fetchBase: cfg.fetchBase, envFile: cfg.envFileUsed, openProposals: st.history.filter((h) => h.status === 'proposed').map((h) => ({ page: h.page, branch: h.branch, date: h.date })) }, null, 2));
      return 0;
    }
    default: out('usage: node autopilot/cli.js <run|dry-run|report|enable|disable|rollback|audit-log|ledger|baseline|status|verify-google|health|weekly>'); return 2;
  }
}

main(process.argv.slice(2)).then((c) => process.exit(c || 0), (e) => { console.error(redact(`ERROR: ${e.message}`)); process.exit(1); });
