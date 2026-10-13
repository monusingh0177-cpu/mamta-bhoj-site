'use strict';
// Weekly trend report, built only from data the daily runs already stored (reports/*.json, runs.jsonl, state history):
// no extra Google/API calls. Written next to the daily reports (weekly-YYYY-MM-DD.md/.json) on the first run of each
// week (Monday, India time) or whenever a week or more has passed since the last one.
const fs = require('fs');
const path = require('path');
const { addDays, daysBetween, writeJson, zonedDate } = require('./util');
const state = require('./state');

function due(cfg, st, now) {
  const z = zonedDate(now || new Date(), cfg.timezone);
  if (!st.lastWeekly) return z.weekday === 'Mon' ? z.date : null;
  return daysBetween(st.lastWeekly, z.date) >= 7 ? z.date : null;
}

// latest daily report JSON per calendar date (reports are named report-<date>-<id>.json)
function loadReports(files) {
  const byDate = {};
  let names = []; try { names = fs.readdirSync(files.reports).filter((n) => /^report-\d{4}-\d{2}-\d{2}-.+\.json$/.test(n)); } catch (e) { return byDate; }
  for (const n of names) {
    const f = path.join(files.reports, n); let r; try { r = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
    if (r.dryRun) continue;
    const m = fs.statSync(f).mtimeMs; const d = r.date;
    if (!byDate[d] || byDate[d].m < m) byDate[d] = { m, r };
  }
  return Object.fromEntries(Object.entries(byDate).map(([d, v]) => [d, v.r]));
}

const nearest = (reports, date, maxBack) => { for (let i = 0; i <= maxBack; i++) { const d = addDays(date, -i); if (reports[d]) return reports[d]; } return null; };
const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(0)}%` : 'n/a');
const fx = (x) => (x == null ? 'n/a' : Math.round(x * 10) / 10);

function build(cfg, files, st, istDate) {
  const reports = loadReports(files);
  const dates = Object.keys(reports).sort();
  const latest = dates.length ? reports[dates[dates.length - 1]] : null;
  const L = []; const J = { date: istDate, weekEnding: istDate };
  L.push(`# SEO autopilot weekly trend report: week ending ${istDate}`, '', 'Built from the stored daily reports. Search Console data lags about three days and uses rolling 28-day windows, so week-to-week movement is gradual. Nothing here predicts or guarantees rankings or indexing.');

  // runs this week
  const since = addDays(istDate, -6);
  const runs = state.readLedger(cfg, 500).filter((e) => !e.dryRun && e.date && e.date >= since);
  const count = (s) => runs.filter((e) => e.status === s).length;
  J.runs = { total: runs.length, success: count('success'), degraded: count('degraded'), failed: count('failed') };
  L.push('', '## Operations', '', `${runs.length} run(s) in the last 7 days: ${J.runs.success} success, ${J.runs.degraded} degraded, ${J.runs.failed} failed.`);
  const problems = {}; for (const e of runs) for (const id of e.health || []) problems[id] = (problems[id] || 0) + 1;
  J.problems = problems;
  L.push(Object.keys(problems).length ? `Problems seen: ${Object.entries(problems).map(([k, v]) => `${k} (${v} run${v > 1 ? 's' : ''})`).join(', ')}.` : 'No problems recorded.');
  if (runs.length < 5) L.push(`Only ${runs.length} run(s) were recorded; a daily timer should produce 7. Check: systemctl list-timers mamta-autopilot.timer`);

  // Search Console trend (28-day rolling totals as of each date)
  L.push('', '## Search Console (28-day rolling totals)', '');
  const points = [];
  if (latest) for (const back of [0, 7, 14, 21, 28]) {
    const r = nearest(reports, addDays(latest.date, -back), 2);
    if (r && r.gsc && r.gsc.available && r.gsc.totals) points.push({ asOf: r.date, ...r.gsc.totals.current });
  }
  J.gsc = points;
  if (points.length >= 2) {
    L.push('| As of | Clicks | Impressions | CTR | Avg position |', '|---|---|---|---|---|');
    for (const p of points) L.push(`| ${p.asOf} | ${p.clicks} | ${p.impressions} | ${(p.ctr * 100).toFixed(2)}% | ${fx(p.position)} |`);
    const a = points[0], b = points[1];
    L.push('', `Versus a week earlier: clicks ${pct(a.clicks, b.clicks)}, impressions ${pct(a.impressions, b.impressions)}.`);
  } else if (latest && latest.gsc && latest.gsc.available) L.push(`Search Console is connected; not enough history yet for a trend (${points.length} data point).`);
  else L.push(`Search Console data is not available (${latest && latest.gsc ? latest.gsc.status || latest.gsc.reason : 'no report yet'}). See the daily report for the remedy.`);

  if (latest) {
    const mv = (latest.pageMovement || []).slice(0, 10);
    L.push('', '## Pages gaining / losing impressions (latest 28 days vs previous 28)', '', ...(mv.length ? mv.map((m) => `- ${m.path}: ${m.previous} -> ${m.current} (${m.change > 0 ? '+' : ''}${m.change})`) : ['No page-level movement.']));
    const rc = (latest.risingCommercial || []).slice(0, 5);
    L.push('', '## Rising commercial queries', '', ...(rc.length ? rc.map((q) => `- ${q.query}: ${q.impressions} impressions, position ${fx(q.position)}`) : ['None this week.']));
    const op = (latest.opportunities || []).slice(0, 5);
    L.push('', '## Top opportunities (existing pages first; no new pages are created automatically)', '', ...(op.length ? op.map((o) => `- ${o.query} -> ${o.bestPage || 'no matching page'} (${o.action}, score ${o.score}, position ${fx(o.position)})`) : ['None.']));
    const ins = latest.inspections || [];
    if (ins.length) { const by = {}; for (const i of ins) { const k = i.verdict || (i.error ? 'error' : 'n/a'); by[k] = (by[k] || 0) + 1; } L.push('', '## Indexing status of key pages (URL Inspection; a status check, not a request to index)', '', Object.entries(by).map(([k, v]) => `${k}: ${v}`).join(', ')); J.inspections = by; }
    const prior = nearest(reports, addDays(latest.date, -7), 2);
    const sevNow = latest.auditSummary || {}; const sevThen = prior ? prior.auditSummary || {} : null;
    L.push('', '## Technical audit', '', `Now: ${sevNow.critical || 0} critical, ${sevNow.high || 0} high, ${sevNow.medium || 0} medium, ${sevNow.low || 0} low across ${(latest.inventory || {}).pageCount || 0} pages.` + (sevThen ? ` A week earlier: ${sevThen.critical || 0} critical, ${sevThen.high || 0} high.` : ''));
    J.audit = { now: sevNow, weekAgo: sevThen };
  }

  // proposals this week
  const prop = (st.history || []).filter((h) => h.date >= since);
  J.proposals = prop.map((h) => ({ date: h.date, page: h.page, status: h.status }));
  L.push('', '## Proposals this week', '', ...(prop.length ? prop.map((h) => `- ${h.date} ${h.page}: ${h.status}${h.branch ? ' (' + h.branch + ')' : ''}`) : ['None. In report mode, or no opportunity passed every gate.']));
  return { markdown: L.join('\n') + '\n', json: J };
}

function write(cfg, files, st, istDate) {
  const { markdown, json } = build(cfg, files, st, istDate);
  const base = path.join(files.reports, `weekly-${istDate}`);
  fs.writeFileSync(`${base}.md`, markdown); writeJson(`${base}.json`, json);
  return `${base}.md`;
}

module.exports = { due, build, write };
