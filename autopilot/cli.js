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
const fs = require('fs');
const { loadConfig } = require('./config');
const state = require('./lib/state');
const reportLib = require('./lib/report');
const { redact } = require('./lib/util');
const { runOnce, rollbackLast, acceptBaseline } = require('./run');

const out = (...a) => console.log(redact(a.join(' ')));

async function main(argv) {
  const cmd = argv[0] || 'status'; const cfg = loadConfig();
  const files = state.init(cfg); const lim = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1], 10) : 40;
  switch (cmd) {
    case 'run': case 'auto': case 'dry-run': {
      if (!state.acquireLock(cfg)) { out('another autopilot run is in progress; exiting'); return 3; }
      try {
        const R = await runOnce(cfg, { dryRun: cmd === 'dry-run', manual: process.stdout.isTTY || argv.includes('--manual') });
        out(`SEO autopilot ${R.dryRun ? 'dry run' : 'run'} ${R.runId}: mode=${R.effectiveMode}; pages=${R.inventory.pageCount || 0}; findings critical=${R.auditSummary.critical} high=${R.auditSummary.high}; opportunities=${R.opportunities.length}; proposals=${R.changes.length}; discarded=${R.rollbacks.length}`);
        if (R.stops.length) { out('STOPPED (no proposals): ' + R.stops.join(' | ')); }
        out(`report: ${R.reportFile}`);
        return 0;
      } finally { state.releaseLock(cfg); }
    }
    case 'report': { const f = reportLib.latest(files); if (!f) { out('no report yet; run: npm run seo:dry-run'); return 1; } process.stdout.write(fs.readFileSync(f, 'utf8')); return 0; }
    case 'enable': state.setEnabled(cfg, true); out('autopilot enabled (scheduled runs will execute)'); return 0;
    case 'disable': state.setEnabled(cfg, false); out('autopilot disabled (scheduled runs will exit immediately; manual runs still work)'); return 0;
    case 'rollback': { const r = await rollbackLast(cfg); out(JSON.stringify(r, null, 2)); return 0; }
    case 'audit-log': for (const e of state.readAudit(cfg, lim)) out(JSON.stringify(e)); return 0;
    case 'baseline': { const r = await acceptBaseline(cfg); out(`baseline accepted: ${r.pages} pages`); return 0; }
    case 'status': {
      const st = state.load(cfg);
      out(JSON.stringify({ enabled: !state.isDisabled(cfg), mode: cfg.mode, publish: cfg.publish, aiMode: cfg.ai.mode, gscConfigured: Boolean(cfg.google.clientId && cfg.google.clientSecret && cfg.google.refreshToken), initialAuditDone: st.initialAuditDone, lastRun: st.lastRun, stateDir: cfg.stateDir, repoDir: cfg.repoDir, fetchBase: cfg.fetchBase, envFile: cfg.envFileUsed, openProposals: st.history.filter((h) => h.status === 'proposed').map((h) => ({ page: h.page, branch: h.branch, date: h.date })) }, null, 2));
      return 0;
    }
    default: out('usage: node autopilot/cli.js <run|dry-run|report|enable|disable|rollback|audit-log|baseline|status>'); return 2;
  }
}

main(process.argv.slice(2)).then((c) => process.exit(c || 0), (e) => { console.error(redact(`ERROR: ${e.message}`)); process.exit(1); });
