'use strict';
// Opportunity funnel: "25 opportunities, 0 proposals" must be explainable from the report alone. Pure and read-only: it only
// classifies what the run already decided (R.opportunities, R.changes, R.fixes, R.notChanged, R.ai); it never changes a decision,
// a threshold or a gate. Opportunities, proposals, publications and rollbacks are four separate counts.
const CANDIDATE = /improve existing page/;

// -> { opportunities, candidates, proposed, published, rolledBack, dispositions: [{ query, page, action, outcome, reason }], summary }
function build(R) {
  const changes = R.changes || []; const fixes = R.fixes || []; const nc = R.notChanged || [];
  const auto = R.auto || {}; const pub = new Set((auto.published || []).map((p) => p.page)); const rb = new Set((auto.rolledBack || []).map((p) => p.page));
  const claimed = new Set(); // one disposition per page: the page is decided once, later queries for it are "covered"
  const dispositions = (R.opportunities || []).map((op) => {
    const d = { query: op.query, page: op.bestPage || null, action: op.action, impressions: op.impressions, outcome: '', reason: '' };
    if (!CANDIDATE.test(String(op.action))) { d.outcome = 'not-a-candidate'; d.reason = `action is "${op.action}": only "improve existing page" opportunities can become a title/description proposal; this one is monitored or needs a person`; return d; }
    const page = op.bestPage;
    if (!page) { d.outcome = 'skipped'; d.reason = 'no best page'; return d; }
    if (pub.has(page)) { d.outcome = 'published'; d.reason = 'released and verified live this run'; return d; }
    if (rb.has(page)) { d.outcome = 'rolled-back'; d.reason = 'released, failed verification and was rolled back'; return d; }
    const ch = changes.find((c) => c.page === page); if (ch) { d.outcome = 'proposed'; d.reason = `proposal branch ${ch.branch} awaits review (not published)`; return d; }
    const fx = fixes.find((f) => f.page === page && !['planned', 'skipped'].includes(f.outcome)); if (fx) { d.outcome = fx.outcome; d.reason = `${fx.id}: ${fx.reason2 || fx.reason || fx.outcome}`; return d; }
    const why = nc.find((n) => n.page === page && n.reason); if (why) { d.outcome = 'skipped'; d.reason = why.reason; return d; }
    if (claimed.has(page)) { d.outcome = 'covered'; d.reason = 'another opportunity for the same page was handled first (one change per page per run)'; return d; }
    claimed.add(page);
    const ai = R.ai || {};
    if (R.effectiveMode === 'report-only') { d.outcome = 'skipped'; d.reason = `report-only run (${R.auto && R.auto.reason ? R.auto.reason : 'no changes are prepared'})`; return d; }
    if ((R.stops || []).length) { d.outcome = 'skipped'; d.reason = `stop condition: ${R.stops[0]}`; return d; }
    d.outcome = 'skipped'; d.reason = ai.status && ai.status !== 'unused' ? `AI produced no usable change (ai status: ${ai.status})` : 'no change was generated (AI unused or returned nothing)';
    return d;
  });
  const candidates = dispositions.filter((d) => d.outcome !== 'not-a-candidate').length;
  const count = (o) => dispositions.filter((d) => d.outcome === o).length;
  const out = { opportunities: dispositions.length, candidates, proposed: changes.length, published: (auto.published || []).length, rolledBack: (auto.rolledBack || []).length, dispositions };
  out.summary = `${out.opportunities} opportunities scored; ${candidates} eligible for a title/description change; ${out.proposed} proposal(s) prepared; ${out.published} published; ${out.rolledBack} rolled back. ` +
    `Not eligible: ${count('not-a-candidate')}; eligible but not changed: ${dispositions.filter((d) => d.outcome === 'skipped' || d.outcome === 'covered').length}.`;
  return out;
}

module.exports = { build, CANDIDATE };
