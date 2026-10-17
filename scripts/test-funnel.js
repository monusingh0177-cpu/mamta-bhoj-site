#!/usr/bin/env node
'use strict';
// =============================================================================
// scripts/test-funnel.js   (npm run test:funnel)
//
// Opportunities, eligible candidates, proposals, publications and rollbacks are DIFFERENT counts. These tests pin the funnel that
// explains "25 opportunities, 0 proposals" (the real 2026-10-16 production run: 2 eligible queries on ONE page that was on
// cooldown, 23 monitor/consolidate/content-gap opportunities) and prove the funnel only reports; it changes no decision.
// Pure functions, no network, no filesystem.
// =============================================================================
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const funnel = require(path.join(ROOT, 'autopilot/lib/funnel'));
const report = require(path.join(ROOT, 'autopilot/lib/report'));

let passed = 0; let failed = 0;
const check = (c, name, detail) => { if (c) passed++; else failed++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${name}${c || !detail ? '' : '  -> ' + String(detail).slice(0, 300)}`); };

const PAGE = '/guides/types-of-flour-in-india';
const IMPROVE = 'improve existing page';
const op = (query, action, bestPage, impressions) => ({ query, action, bestPage, impressions: impressions || 1, score: 30, kind: 'product', position: 9 });
// the shape of the real run fc1ed2
function productionRun() {
  const ops = [op('types of flour in india', IMPROVE, PAGE, 8), op('indian flour types', IMPROVE, PAGE, 39)];
  for (let i = 0; i < 20; i++) ops.push(op('monitor query ' + i, 'monitor', '/guides/sooji-vs-rava'));
  ops.push(op('flour suppliers', 'consolidate on the strongest page / adjust internal links (no new page)', '/guides/how-to-choose-flour-supplier'));
  ops.push(op('besan', 'consolidate on the strongest page / adjust internal links (no new page)', '/guides/what-is-besan'));
  ops.push(op('ravo and suji same', 'possible content gap: needs human review (new page only if every gate passes)', '/guides/chakki-atta-vs-roller-milled-atta'));
  return {
    runId: 't1', date: '2026-10-17', mode: 'auto', effectiveMode: 'auto', opportunities: ops, changes: [], fixes: [], stops: [], rollbacks: [], errors: [],
    auto: { enabled: true, published: [], rolledBack: [] }, ai: { status: 'unused' },
    notChanged: [{ page: PAGE, reason: 'proposal on 2026-10-16; cooldown until 2026-10-30' }, { page: PAGE, reason: 'proposal on 2026-10-16; cooldown until 2026-10-30' }],
  };
}

console.log('== the real "25 opportunities, 0 proposals" run is explained, not hidden');
{
  const R = productionRun(); const f = funnel.build(R);
  check(f.opportunities === 25 && f.candidates === 2 && f.proposed === 0 && f.published === 0 && f.rolledBack === 0, 'counts are separate: 25 opportunities, 2 eligible, 0 proposed, 0 published, 0 rolled back', f.summary);
  check(f.dispositions.filter((d) => d.outcome === 'not-a-candidate').length === 23, '23 are not candidates (monitor / consolidate / content gap) and say so');
  const elig = f.dispositions.filter((d) => d.outcome !== 'not-a-candidate');
  check(elig.length === 2 && elig.every((d) => d.outcome === 'skipped' && /cooldown until 2026-10-30/.test(d.reason)), 'both eligible queries are reported as skipped because of the cooldown, with the date', JSON.stringify(elig));
  check(!f.dispositions.some((d) => d.outcome === 'proposed' || d.outcome === 'published'), 'nothing is mislabelled as proposed or published');
  check(/0 published/.test(f.summary) && /0 proposal/.test(f.summary), 'the summary states 0 proposal(s) and 0 published');
}

console.log('== every outcome is classified honestly');
{
  let R = productionRun(); R.notChanged = []; R.changes = [{ page: PAGE, branch: 'seo-autopilot/x', sha: 'abc' }];
  let f = funnel.build(R); check(f.proposed === 1 && f.published === 0 && f.dispositions.find((d) => d.page === PAGE).outcome === 'proposed' && /not published/.test(f.dispositions.find((d) => d.page === PAGE).reason), 'a prepared branch is "proposed ... not published", never published');
  R = productionRun(); R.notChanged = []; R.auto.published = [{ page: PAGE }];
  f = funnel.build(R); check(f.published === 1 && f.dispositions.find((d) => d.page === PAGE).outcome === 'published', 'published only when the release list says so');
  R = productionRun(); R.notChanged = []; R.auto.rolledBack = [{ page: PAGE }];
  f = funnel.build(R); check(f.rolledBack === 1 && f.published === 0 && f.dispositions.find((d) => d.page === PAGE).outcome === 'rolled-back', 'a rollback is its own count and is not a publication');
  R = productionRun(); R.notChanged = []; R.fixes = [{ id: 'ai:title:' + PAGE, page: PAGE, outcome: 'review-only', reason2: 'ai-search-evidence' }];
  f = funnel.build(R); check(f.dispositions.find((d) => d.page === PAGE).outcome === 'review-only' && /ai-search-evidence/.test(f.dispositions.find((d) => d.page === PAGE).reason), 'a review-only AI decision keeps the gate that refused it');
  R = productionRun(); R.notChanged = []; R.ai = { status: 'budget_reached' };
  f = funnel.build(R); check(/budget_reached/.test(f.dispositions.find((d) => d.page === PAGE).reason), 'an AI failure/budget stop is named');
  R = productionRun(); R.notChanged = []; R.effectiveMode = 'report-only'; R.auto = { enabled: false, reason: 'AUTOPILOT_MODE=report: report only', published: [], rolledBack: [] };
  f = funnel.build(R); check(/report-only/.test(f.dispositions.find((d) => d.page === PAGE).reason), 'a report-only run says it is report-only');
  R = productionRun(); R.notChanged = []; R.stops = ['gates failed for /x; proposal discarded'];
  f = funnel.build(R); check(/stop condition/.test(f.dispositions.find((d) => d.page === PAGE).reason), 'a stop condition is named');
  R = productionRun(); R.notChanged = [];
  f = funnel.build(R); const el = f.dispositions.filter((d) => d.outcome !== 'not-a-candidate');
  check(el[1].outcome === 'covered', 'a second query for an already-decided page is "covered", not a second finding');
  check(funnel.build({}).opportunities === 0, 'an empty run (no Search Console data) does not throw');
}

console.log('== the funnel only reports: it changes nothing');
{
  const R = productionRun(); const before = JSON.stringify(R); funnel.build(R);
  check(JSON.stringify(R) === before, 'build() does not mutate the run record (no decision, gate, threshold or counter is touched)');
}

console.log('== the report shows it');
{
  const R = productionRun(); R.funnel = funnel.build(R);
  const base = { gsc: { available: false, status: 'ok_no_data', reason: '' }, findings: [], auditSummary: { critical: 0, high: 0, medium: 0, low: 0 }, inventory: {}, repo: {}, status: 'success', publish: 'propose', rollbacks: [], newPageProposals: [], keywords: [], lostQueries: [], semrush: { status: 'not_configured', items: [] }, indexnow: { keyVerified: false, keyDetail: '', submissions: [] }, sitemapSubmission: { status: 'not attempted' }, inspections: [], indexing: [], sitemapStatus: null, smoke: [], risingCommercial: [], newQueries: [], pageMovement: [], gates: [], errors: [], stops: [] };
  let md = ''; let err = null; try { md = report.markdown(Object.assign({}, base, R)); } catch (e) { err = e; }
  check(!err && /Why this run produced the proposals it did/.test(md), 'the report has the funnel section', err && err.message);
  check(/25 opportunities scored; 2 eligible/.test(md) && /\[skipped\] "types of flour in india"/.test(md) && /cooldown until 2026-10-30/.test(md), 'it lists the eligible queries and the cooldown reason');
  check((md.match(/cooldown until 2026-10-30/g) || []).length === 2, 'the identical cooldown reason is not repeated in the "not changed" list (once in the funnel, once in the list)', (md.match(/cooldown until 2026-10-30/g) || []).length);
  check(/A successful audit is not an SEO publication/.test(md), 'it says an audit success is not a publication');
  const noF = report.markdown(Object.assign({}, base, R, { funnel: undefined }));
  check(!/Why this run produced/.test(noF), 'old run records without a funnel still render');
}

console.log(`\nFUNNEL TESTS: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
