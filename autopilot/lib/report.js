'use strict';
// Daily report: JSON (machine), Markdown and HTML (human), stored outside the web root.
const fs = require('fs');
const path = require('path');
const { writeJson, ensureDir } = require('./util');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x) => (x == null ? 'n/a' : (x * 100).toFixed(2) + '%');
const num = (x) => (x == null ? 'n/a' : Math.round(x * 10) / 10);

function markdown(r) {
  const L = [];
  const h = (t) => L.push('', `## ${t}`, '');
  L.push(`# SEO autopilot report: ${r.date}`, '', `Run ${r.runId} | mode: **${r.effectiveMode}** | ${r.dryRun ? 'DRY RUN (no branch, no submission)' : 'live run'} | repo ${r.repo.head ? r.repo.head.slice(0, 8) : 'n/a'}`);
  if (r.status) {
    h('Summary');
    const open = (r.health || []).filter((i) => i.level === 'warn' || i.level === 'fail');
    L.push(`Status: **${r.status.toUpperCase()}**${r.status === 'success' ? ' (every check that ran passed)' : r.status === 'degraded' ? ' (the run completed; items below need attention)' : r.status === 'failed' ? ' (the run could not complete)' : ''}.`);
    L.push(...(open.length ? open.flatMap((i) => [`- [${i.level.toUpperCase()}] ${i.title}${i.detail ? ': ' + i.detail : ''}`, ...(i.remedy ? [`  - What to do: ${i.remedy}`] : [])]) : ['- No open problems.']));
    const notes = (r.health || []).filter((i) => i.level === 'note');
    if (notes.length) L.push(...notes.map((i) => `- Note: ${i.title}${i.detail ? ': ' + i.detail : ''}`));
    L.push(`- Pages ${(r.inventory || {}).pageCount || 0} | findings ${r.auditSummary.critical} critical, ${r.auditSummary.high} high | opportunities ${r.opportunities.length} | proposals ${r.changes.length} | Google: ${(r.gsc || {}).status || 'n/a'}`);
  }
  if (r.stops.length) { h('Stop conditions (no proposals were prepared)'); r.stops.forEach((s) => L.push(`- ${s}`)); }
  h('Search Console (28-day window vs previous 28 days)');
  if (!r.gsc.available) L.push(`Not available (${r.gsc.status || 'unknown'}): ${r.gsc.reason}`, ...(r.gsc.remedy ? [`What to do: ${r.gsc.remedy}`] : []));
  else { const c = r.gsc.totals.current, p = r.gsc.totals.previous; L.push('| Metric | Current | Previous |', '|---|---|---|', `| Clicks | ${c.clicks} | ${p.clicks} |`, `| Impressions | ${c.impressions} | ${p.impressions} |`, `| CTR | ${pct(c.ctr)} | ${pct(p.ctr)} |`, `| Avg position | ${num(c.position)} | ${num(p.position)} |`); }
  if (r.gsc.available) {
    h('Top rising commercial queries'); L.push(...(r.risingCommercial.length ? r.risingCommercial.map((q) => `- ${q.query}: ${q.impressions} impressions (was ${q.prevImpressions == null ? 'new' : q.prevImpressions}), position ${q.position} -> ${q.bestPage || 'no page'}`) : ['None this period.']));
    h('Top new queries'); L.push(...(r.newQueries.length ? r.newQueries.map((q) => `- ${q.query} (${q.kind}): ${q.impressions} impressions, position ${q.position}`) : ['None this period.']));
    h('Pages gaining / losing visibility'); L.push(...(r.pageMovement.length ? r.pageMovement.map((m) => `- ${m.path}: impressions ${m.previous} -> ${m.current} (${m.change > 0 ? '+' : ''}${m.change})`) : ['No page-level data.']));
  }
  h('Opportunities (scored; branded and unrelated queries are never opportunities)');
  L.push(...(r.opportunities.length ? ['| Score | Query | Kind | Impr. | Pos. | Best page | Action |', '|---|---|---|---|---|---|---|', ...r.opportunities.map((o) => `| ${o.score} | ${o.query} | ${o.kind} | ${o.impressions} | ${o.position} | ${o.bestPage || '-'} | ${o.action} |`)] : ['None found (no Search Console data, or nothing relevant).']));
  if (r.funnel) {
    h('Why this run produced the proposals it did (opportunities are not proposals)'); L.push(r.funnel.summary);
    const rows = []; const seen = new Set();
    for (const d of r.funnel.dispositions) { const k = `${d.outcome}|${d.page}|${d.reason}`; if (d.outcome === 'not-a-candidate' || seen.has(k)) continue; seen.add(k); rows.push(`- ${d.page || '(no page)'} [${d.outcome}] "${d.query}" (${d.impressions} impr.): ${d.reason}`); }
    L.push(...(rows.length ? rows : ['- No opportunity was eligible for a change this run.']));
    L.push('A successful audit is not an SEO publication: only the "published" count above reflects a verified live change.');
  }
  h('Proposals prepared on separate branches (nothing was merged, pushed, deployed or restarted)'); L.push(...(r.changes.length ? r.changes.flatMap((c) => [`- ${c.page}: ${c.kind} for query "${c.query}" -> branch \`${c.branch}\` (${c.sha ? c.sha.slice(0, 8) : ''}). ${c.rationale || ''}`, `  review: \`${c.review}\``]) : ['None.']));
  h('Automated remediation (discovery -> proposal -> gates -> publication -> live verification)');
  const au = r.auto || {};
  L.push(`Mode: **${au.effective || r.effectiveMode}** (configured: ${au.mode || r.mode}). ${au.enabled ? 'Automatic publishing is ACTIVE.' : 'Automatic publishing is not active' + (au.reason ? ': ' + au.reason : '.')}`);
  if (au.paused) L.push(`- PAUSED since ${String(au.paused.at).slice(0, 10)}: ${au.paused.reason} (resume with: node autopilot/cli.js resume-auto)`);
  if ((r.fixes || []).length) for (const f of r.fixes) { L.push(`- ${f.id}: **${f.outcome}** - ${f.reason}`); for (const t of f.trace || []) L.push(`  - ${t.ok ? 'ok' : 'FAILED'} ${t.name}: ${t.detail}`); if (f.release && f.release.published) L.push(`  - production ${String(f.release.prev).slice(0, 8)} -> ${String(f.release.now).slice(0, 8)}`); }
  else L.push('No deterministic fix was needed or possible this run (no internal-link finding on a guide, or no suitable related guide).');
  h('Target keywords (Search Console, settled 28 days vs previous 28 days)');
  const kwLine = (k) => {
    const sem = k.semrush ? ` | Semrush estimated monthly volume: ${k.semrush.state === 'data' ? k.semrush.volume : k.semrush.state === 'no_data' ? 'none recorded' : 'NOT MEASURED'}` : '';
    const cov = k.coverage ? ` | page that fits best: ${k.coverage.page || 'none'} (${k.coverage.level}${k.coverage.competingGuide ? '; a guide fits better than any supply page: ' + k.coverage.competingGuide : ''})` : '';
    if (k.status === 'data') return `- ${k.keyword}: impressions ${k.current.impressions} (was ${k.previous.impressions}), clicks ${k.current.clicks} (was ${k.previous.clicks}), position ${k.current.position == null ? 'n/a' : k.current.position} (was ${k.previous.position == null ? 'n/a' : k.previous.position}); ${k.current.queryCount} matching query(ies); Google shows ${k.shownPage || 'n/a'}${k.mismatch ? ' - MISMATCH: ' + k.mismatchNote : ''}${cov}${sem}`;
    return `- ${k.keyword}: ${k.status === 'unavailable' ? 'UNAVAILABLE' : 'no impressions'} (${k.detail})${cov}${sem}`;
  };
  L.push(...((r.keywords || []).length ? r.keywords.map(kwLine) : ['No target keyword file configured (AUTOPILOT_TARGET_KEYWORDS_FILE).']));
  if ((r.lostQueries || []).length) { h('Queries with visibility last period and none this period'); L.push(...r.lostQueries.map((q) => `- ${q.query}: ${q.previousImpressions} impressions previously`)); }
  h('Pages deliberately not changed, and why'); L.push(...(r.notChanged.length ? r.notChanged.filter((n, i, a) => a.findIndex((m) => (m.page || m.query) === (n.page || n.query) && m.reason === n.reason) === i).map((n) => `- ${n.page || n.query}: ${n.reason}`) : ['None to report.']));
  h('New page proposals (never auto-published)'); L.push(...(r.newPageProposals.length ? r.newPageProposals.map((n) => `- "${n.query}": ${n.verdict} (${n.gates.map((g) => `${g.name}:${g.ok ? 'ok' : 'NO'}`).join(', ')})`) : ['None.']));
  h('Audit findings'); L.push(`${r.auditSummary.critical} critical, ${r.auditSummary.high} high, ${r.auditSummary.medium} medium, ${r.auditSummary.low} low across ${r.inventory.pageCount} pages.`);
  r.findings.filter((f) => ['critical', 'high'].includes(f.severity)).slice(0, 20).forEach((f) => L.push(`- [${f.severity}] ${f.path}: ${f.message}`));
  h('IndexNow'); L.push(r.indexnow.keyVerified ? `Key verified (${r.indexnow.keyDetail}).` : `Key NOT verified: ${r.indexnow.keyDetail}`, ...(r.indexnow.submissions.length ? r.indexnow.submissions.map((s) => `- ${s.urls.length} URL(s): ${s.ok ? 'accepted' : 'failed'} (${s.detail})`) : ['No submissions this run.']), 'IndexNow only notifies participating engines (not Google) and does not guarantee indexing.');
  h('Google sitemap submission'); L.push(r.sitemapSubmission.status);
  h('Google sitemap status and indexing discrepancies (read-only)');
  if (r.sitemapStatus && !r.sitemapStatus.error) { const sm = r.sitemapStatus; L.push(sm.submitted ? `Sitemap known to Google: last downloaded ${sm.lastDownloaded || 'n/a'}, errors ${sm.errors}, warnings ${sm.warnings}${sm.urlsSubmitted != null ? `, URLs submitted ${sm.urlsSubmitted}, indexed ${sm.urlsIndexed}` : ''}.` : 'Google has no record of the sitemap yet.'); for (const p of sm.problems || []) L.push(`- ${p}`); }
  else L.push(r.sitemapStatus ? `Not available: ${r.sitemapStatus.error}` : 'Not available (Search Console is not connected).');
  L.push(...((r.indexing || []).length ? r.indexing.map((x) => `- [${x.severity}] ${x.path}: ${x.message}`) : (r.sitemapStatus ? ['No discrepancy between the inspected pages and Google.'] : [])));
  h('URL Inspection (status monitoring only; it does not request a crawl)'); L.push(...(r.inspections.length ? r.inspections.map((i) => `- ${i.url}: ${i.verdict || i.error || 'n/a'}${i.coverageState ? ' / ' + i.coverageState : ''}`) : ['None this run.']));
  h('Discarded proposals / rollback events'); L.push(...(r.rollbacks.length ? r.rollbacks.map((x) => `- ${x.page || ''} ${x.reason} (${x.sha ? x.sha.slice(0, 8) : ''})`) : ['None.']));
  h('Health and test results'); L.push(...(r.smoke.length ? ['Public smoke test (live, read-only):', ...r.smoke.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} ${g.name}${g.detail ? ': ' + g.detail : ''}`)] : []), ...(r.gates.length ? ['Quality gates for the proposal:', ...r.gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} ${g.name}${g.detail ? ': ' + g.detail : ''}`)] : ['No proposal was prepared, so no change gates ran.']));
  h('AI'); L.push(r.ai.note);
  return L.join('\n') + '\n';
}

function html(md) {
  const body = md.split('\n').map((l) => (/^# /.test(l) ? `<h1>${esc(l.slice(2))}</h1>` : /^## /.test(l) ? `<h2>${esc(l.slice(3))}</h2>` : /^- /.test(l) ? `<li>${esc(l.slice(2))}</li>` : /^\|[-|]+\|$/.test(l) ? '' : /^\|/.test(l) ? `<tr>${l.split('|').slice(1, -1).map((c) => `<td>${esc(c.trim())}</td>`).join('')}</tr>` : l.trim() ? `<p>${esc(l)}</p>` : '')).join('\n');
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>SEO autopilot report</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#1d2659}td{border:1px solid #ddd;padding:3px 8px}table{border-collapse:collapse}</style>${body}`;
}

function write(cfg, files, r) {
  ensureDir(files.reports);
  const stamp = `${r.date}-${r.runId}`;
  writeJson(path.join(files.reports, `report-${stamp}.json`), r);
  const md = markdown(r);
  fs.writeFileSync(path.join(files.reports, `report-${stamp}.md`), md);
  fs.writeFileSync(path.join(files.reports, `report-${stamp}.html`), html(md));
  return path.join(files.reports, `report-${stamp}.md`);
}

function latest(files) {
  let names = []; try { names = fs.readdirSync(files.reports).filter((n) => n.endsWith('.md')).map((n) => [n, fs.statSync(path.join(files.reports, n)).mtimeMs]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)); } catch (e) { return null; }
  return names.length ? path.join(files.reports, names[names.length - 1][0]) : null;
}

module.exports = { write, latest, markdown };
