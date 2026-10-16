'use strict';
// AI proposal -> automatic release. An AI-written change is only ever published when EVERY gate below passes; anything
// else falls back to the reviewable proposal branch (the previous behaviour) and is never published.
//
//   scope        existing, indexable page; only the SEO fields `title` and `description` (body `copy` stays review-only)
//   content      lib/ai.js grounding (no new numbers) + lib/patch.js validation (allow-listed file, exact single replace,
//                business-claim rules, no code/markup/URL) + a vocabulary gate (every word in the new text already exists
//                on the site, so nothing new - product, place, certification, promise - can be introduced) + a small size
//                change + confidence >= MIN_CONFIDENCE + real search evidence
//   rate         at most cfg.auto.maxPerDay releases per day across ALL fixes (default 1), page cooldown, no open proposal
//   quality      the same worktree gates as every other change (syntax, preview audit, SEO suite, enquiry tests) and the new
//                text must really render on the changed page in the preview
//   release      lib/publish.js: clean tree, HEAD == origin, protected-path guard, fast-forward merge, restart, live
//                verification (the new text is on the live page), push, and automatic rollback + pause on any failure
const patchLib = require('./patch');
const gates = require('./gates');
const branchLib = require('./branch');
const publishLib = require('./publish');
const state = require('./state');
const { git } = require('./git');

const AUTO_KINDS = ['title', 'description'];
const MIN_CONFIDENCE = 0.8;
const MAX_GROWTH = 40;        // characters the new text may be longer than the old
const MIN_IMPRESSIONS = 10;   // evidence from Search Console for the query behind the change
const MIN_FRAGMENT = 10;      // shortest literal fragment used to confirm the change on the live page

// Function words only: they carry no business meaning, so they may appear in a rewrite without being on the site already.
const STOP = new Set('a an the and or of in on at to for from by with without as is are was were be been being it its this that these those your our we you they their them us all any each every can may will would should could do does not no yes more most less per via here there when where how what which who why also into over under than then so such other another both either'.split(' '));

const wordsOf = (s) => (String(s || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []).filter((w) => w.length > 1);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Words already published on the site (titles, descriptions, headings of every page) plus the full text of the target page.
function vocabulary(inv, pagePath, extra) {
  const set = new Set();
  for (const pg of Object.values((inv && inv.pages) || {})) for (const t of [pg.title, pg.description, ...(pg.h1 || []), ...((pg.headings || []).map((h) => h.text))]) for (const w of wordsOf(t)) set.add(w);
  const own = ((inv && inv.pages) || {})[pagePath]; if (own) for (const w of wordsOf(own.text)) set.add(w);
  for (const t of extra || []) for (const w of wordsOf(t)) set.add(w);
  return set;
}
function newWords(replace, vocab) { return [...new Set(wordsOf(replace).filter((w) => !STOP.has(w) && !vocab.has(w) && !vocab.has(w.replace(/'s$/, ''))))]; }

// Longest literal run of the new text that is free of characters HTML would escape: used to find the change on the live page.
function fragmentOf(replace) {
  const parts = String(replace || '').split(/[&'"<>]/).map((x) => x.trim()).sort((a, b) => b.length - a.length);
  return parts[0] && parts[0].length >= MIN_FRAGMENT ? parts[0] : '';
}

// Pure decision. ctx: { cfg, R, st, inv, date, op, page, decision, block }  -> [{ name, ok, detail }]
function gateList(ctx) {
  const { cfg, R, st, inv, date, op, page, decision: d } = ctx; const out = []; const add = (name, ok, detail) => out.push({ name, ok: Boolean(ok), detail: String(detail || '').slice(0, 240) });
  add('auto-enabled', R.auto && R.auto.enabled, R.auto && R.auto.enabled ? 'auto-publishing is configured, activated and not paused' : (R.auto && R.auto.reason) || 'auto-publishing is not enabled');
  add('ai-field-allowlist', AUTO_KINDS.includes(d.kind), `kind "${d.kind}" (automatic: ${AUTO_KINDS.join(', ')}; anything else is review-only)`);
  add('ai-confidence', Number(d.confidence) >= MIN_CONFIDENCE, `confidence ${d.confidence} (minimum ${MIN_CONFIDENCE})`);
  const pg = inv && inv.pages && inv.pages[page];
  add('ai-page-eligible', pg && pg.status === 200 && pg.indexable && pg.inSitemap && pg.canonical === cfg.siteOrigin + (page === '/' ? '/' : page), pg ? 'existing, indexable, in the sitemap, self-canonical' : 'page is not in the live inventory');
  add('ai-search-evidence', Number(op.impressions) >= MIN_IMPRESSIONS, `${op.impressions} impressions for "${op.query}" (minimum ${MIN_IMPRESSIONS})`);
  const growth = String(d.replace).length - String(d.find).length;
  add('ai-size-change', growth <= MAX_GROWTH && !/\$\{/.test(d.replace), `${growth >= 0 ? '+' : ''}${growth} characters (max +${MAX_GROWTH}), no template code`);
  const vocab = vocabulary(inv, page, [d.find, ctx.block && ctx.block.text]); const nw = newWords(d.replace, vocab);
  add('ai-vocabulary', nw.length === 0, nw.length ? `introduces word(s) that appear nowhere on the site: ${nw.slice(0, 6).join(', ')}` : 'every word of the new text already exists on the site');
  add('ai-fragment', Boolean(fragmentOf(d.replace)), 'new text has a literal fragment that can be confirmed on the live page');
  const publishedToday = st.history.filter((h) => h.status === 'published' && h.date === date).length;
  add('one-change-per-day', publishedToday + (R.auto.published || []).length < cfg.auto.maxPerDay, `${publishedToday} release(s) today (limit ${cfg.auto.maxPerDay})`);
  return out;
}

// Choose the single change that may be released: the most confident allowed one. -> decision | null
function pickCandidate(valid) { return valid.filter((d) => AUTO_KINDS.includes(d.kind)).sort((a, b) => Number(b.confidence) - Number(a.confidence))[0] || null; }

// Run the whole release for one AI proposal. ctx: { cfg, R, st, inv, date, runId, A, op, page, valid[], block, changedUrls, inputInv }
// -> { handled, fallback?, reasons[], published?, blocked?, inv }
//    handled=false -> not eligible (nothing created); the caller keeps the normal review-branch path.
async function release(ctx) {
  const { cfg, R, st, date, runId, A, op, page, valid } = ctx; let inv = ctx.inv;
  const d = pickCandidate(valid) || valid[0]; // none allowed: the first one is still evaluated so the refusal is traced
  if (!d) return { handled: false, reasons: ['no validated decision'], inv };
  const gl = gateList({ cfg, R, st, inv, date, op, page, decision: d, block: ctx.block });
  const failed = gl.filter((g) => !g.ok);
  const out = { id: `ai:${d.kind}:${page}`, kind: `ai-${d.kind}`, page, target: op.query, source: 'ai', reason: `AI ${d.kind} rewrite for "${op.query}"`, outcome: 'planned', change: [{ file: d.file, kind: d.kind, old: d.find, new: d.replace }], trace: [] };
  const trace = (name, ok, detail) => { out.trace.push({ name, ok, detail: String(detail || '').slice(0, 300) }); A('fix_step', { id: out.id, name, ok, detail: String(detail || '').slice(0, 300) }); };
  trace('discover', true, `ai: ${out.reason}`);
  if (failed.length) {
    trace('ai-gates', false, failed.map((g) => `${g.name}: ${g.detail}`).join(' | '));
    out.outcome = 'review-only'; out.reason2 = failed[0].name; R.fixes.push(out);
    return { handled: false, reasons: failed.map((g) => `${g.name}: ${g.detail}`), inv };
  }
  trace('ai-gates', true, gl.map((g) => g.name).join(', '));

  let wt = null;
  try {
    wt = branchLib.create(cfg, { date, page, id: runId });
    const v = patchLib.validate(d, { repoDir: wt.dir }); if (!v.ok) throw new Error(`patch no longer applies in the worktree: ${v.errors.join('; ')}`); patchLib.apply(v, d);
    trace('propose', true, `${d.file}: ${d.rationale}`);
    const g = await gates.runGates(cfg, { dir: wt.dir, changedPaths: [page], baseline: inv, baselineAudit: R.findings });
    R.gates = g.results;
    const pv = g.inventory && g.inventory.pages && g.inventory.pages[page];
    const shown = pv && norm([pv.title, pv.description, ...(pv.h1 || []), pv.text].join(' ')).includes(norm(d.replace));
    const gatesAll = g.results.concat([{ name: 'ai-renders-in-preview', ok: Boolean(shown), detail: shown ? 'the new text renders on the changed page' : 'the new text does not render on the changed page' }]);
    if (!g.ok || !shown) {
      branchLib.remove(cfg, wt, true); wt = null;
      const bad = gatesAll.filter((x) => !x.ok).map((x) => x.name);
      trace('gates', false, `failed: ${bad.join(', ')}`); out.outcome = 'rejected';
      R.rollbacks.push({ page, reason: `gates failed (${bad.join(', ')}); change discarded, nothing was applied`, sha: null });
      st.history.push({ date, page, target: op.query, status: 'rejected', reason: `gates failed: ${bad.join(', ')}`, kind: d.kind });
      R.stops.push(`gates failed for ${page}; AI change discarded`); R.fixes.push(out); return { handled: true, blocked: true, inv };
    }
    trace('gates', true, gatesAll.map((x) => x.name).join(', '));
    const sha = branchLib.commit(wt, [d.file], `autopilot AI ${d.kind} for ${page}\n\nQuery: ${op.query} (score ${op.score})\n${d.rationale || ''}`.slice(0, 900));
    const branch = wt.branch; branchLib.remove(cfg, wt, false); wt = null;
    out.branch = branch; out.sha = sha;

    const res = await publishLib.publishFix(cfg, { sha, changedPages: [page], expect: [{ page, includes: [fragmentOf(d.replace)] }], baselineAudit: R.findings, onStep: (s) => trace(s.name, s.ok, s.detail) });
    out.release = { prev: res.prev, now: res.now, published: res.published, rolledBack: res.rolledBack };
    out.rollback = { attempted: res.rolledBack || res.rollbackFailed, ok: res.rolledBack, error: res.rolledBack || res.rollbackFailed ? res.error : null };
    if (res.published) {
      out.outcome = 'published';
      st.history.push({ date, page, target: op.query, status: 'published', branch, sha, kind: d.kind, source: 'ai', prev: res.prev });
      R.auto.published.push({ page, target: op.query, sha, prev: res.prev, source: 'ai', kind: d.kind });
      try { git(cfg.repoDir, ['branch', '-D', branch]); } catch (e) { /* already gone */ }
      try { inv = await require('./inventory').build(cfg.fetchBase, { origin: cfg.siteOrigin }); } catch (e) { R.errors.push(`post-release inventory failed: ${e.message}`); }
      if (!ctx.changedUrls.includes(page)) ctx.changedUrls.push(page);
      R.repo.head = res.now; A('fix_published', { id: out.id, sha, prev: res.prev, source: 'ai' });
      R.fixes.push(out); return { handled: true, published: true, inv };
    }
    if (res.rolledBack || res.rollbackFailed) {
      out.outcome = res.rolledBack ? 'rolled-back' : 'rollback-failed';
      try { git(cfg.repoDir, ['branch', '-D', branch]); } catch (e) { /* ignore */ }
      R.rollbacks.push({ page, reason: `release rolled back: ${res.error}`, sha });
      R.auto.rolledBack.push({ page, sha, reason: res.error, ok: res.rolledBack });
      st.history.push({ date, page, target: op.query, status: 'rolled-back', branch, sha, kind: d.kind, source: 'ai', reason: res.error });
      st.autoPaused = { at: new Date().toISOString(), runId, reason: res.error.slice(0, 160), page };
      R.auto.paused = st.autoPaused; R.stops.push(`release for ${page} was rolled back; auto-publishing paused`);
      if (res.rollbackFailed) { R.errors.push(`ROLLBACK FAILED for ${page}: ${res.error}`); R.fatal = `release rollback failed: ${res.error}`; }
      A('fix_rolled_back', { id: out.id, sha, error: res.error, ok: res.rolledBack }); R.fixes.push(out); return { handled: true, blocked: true, inv };
    }
    // refused before anything changed (preflight): keep it as a reviewable proposal
    out.outcome = 'proposed';
    R.changes.push({ page, kind: d.kind, query: op.query, branch, sha, rationale: d.rationale || '', files: [d.file], diffStat: branchLib.diffStat(cfg, branch), review: `git diff HEAD...${branch}   then, if you approve:   git merge --no-ff ${branch}` });
    st.history.push({ date, page, target: op.query, status: 'proposed', branch, sha, kind: d.kind, source: 'ai' });
    R.auto.reason = `publish refused before any change: ${res.error}`; R.auto.refused = (res.steps.find((x) => !x.ok) || {}).detail || res.error; R.notChanged.push({ page, reason: `not published: ${res.error}` });
    R.fixes.push(out); return { handled: true, proposed: true, inv };
  } catch (e) {
    if (wt) branchLib.remove(cfg, wt, true);
    trace('error', false, e.message); out.outcome = 'error'; R.errors.push(`AI release for ${page} failed: ${e.message}`); A('fix_error', { id: out.id, error: e.message });
    R.stops.push(`AI release for ${page} failed; discarded`); R.fixes.push(out); return { handled: true, blocked: true, inv };
  }
}

// every attempted AI change goes into the persistent change ledger like the deterministic ones
function recordLedger(cfg, R, runId, date) {
  for (const out of R.fixes) {
    if (out.source !== 'ai' || ['planned', 'review-only'].includes(out.outcome) || out.ledgered) continue; out.ledgered = true;
    try {
      state.recordChange(cfg, { runId, date, id: out.id, kind: out.kind, source: 'ai', page: out.page, target: out.target, outcome: out.outcome, reason: out.reason, change: out.change || [], branch: out.branch || null, commit: out.sha || null,
        previousCommit: (out.release || {}).prev || null, releasedCommit: (out.release || {}).published ? out.release.now : null, published: Boolean((out.release || {}).published), verification: out.trace || [], rollback: out.rollback || { attempted: false } });
    } catch (e) { R.errors.push(`change ledger write failed: ${e.message}`); }
  }
}

module.exports = { AUTO_KINDS, MIN_CONFIDENCE, MAX_GROWTH, MIN_IMPRESSIONS, gateList, pickCandidate, release, recordLedger, vocabulary, newWords, fragmentOf, wordsOf };
