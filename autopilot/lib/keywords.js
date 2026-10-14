'use strict';
// Target keywords: what Search Console says about each one, which page should serve it, and whether Google is
// showing a different page. Nothing is guessed:
//   * "unavailable"      - Search Console data could not be read (never reported as zero);
//   * "no_impressions"   - Search Console answered, and no matching query had impressions in either window (a true zero);
//   * "data"             - measured values for the settled 28-day window and the previous 28 days.
// "Matching queries" are Search Console queries that contain every word of the keyword (so "flour manufacturer in india"
// counts for "flour manufacturer India"); the exact query is reported separately. Content coverage (which page fits the
// keyword best) comes from the site's own text, is independent of Google, and never claims a ranking.
const fs = require('fs');
const { tokens, mapToPages, classify } = require('./opportunity');

const stem = (t) => t.replace(/(ers|er|s)$/, '');
const stems = (s) => [...new Set(tokens(s).map(stem))];

function readKeywords(cfg) {
  if (!cfg.targetKeywordsFile) return { list: [], note: 'no target keyword file configured (set AUTOPILOT_TARGET_KEYWORDS_FILE: one keyword per line)' };
  try {
    const lines = fs.readFileSync(cfg.targetKeywordsFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const seen = new Set(); const list = [];
    for (const l of lines) { const k = l.toLowerCase().replace(/\s+/g, ' '); if (!seen.has(k)) { seen.add(k); list.push(k); } }
    return { list, note: `${list.length} keyword(s) from ${cfg.targetKeywordsFile}` };
  } catch (e) { return { list: [], note: `target keyword file cannot be read: ${e.code || e.message}` }; }
}

// does this Search Console query contain every word of the keyword?
function matches(query, keyword) { const q = new Set(stems(query)); const k = stems(keyword); return k.length > 0 && k.every((t) => q.has(t)); }
// the target keyword (if any) that a query belongs to; the longest keyword wins
function matchTarget(query, list) { return (list || []).filter((k) => matches(query, k)).sort((a, b) => b.length - a.length)[0] || null; }

const pathOf = (u) => { try { return new URL(u).pathname.replace(/(.)\/$/, '$1'); } catch (e) { return String(u); } };
function agg(rows, keyword) {
  const t = { clicks: 0, impressions: 0, posW: 0, exact: { clicks: 0, impressions: 0 }, queries: new Set(), pages: new Map() };
  for (const r of rows || []) {
    const q = String(r.keys[0] || '').toLowerCase().replace(/\s+/g, ' ');
    if (!matches(q, keyword)) continue;
    t.clicks += r.clicks; t.impressions += r.impressions; t.posW += r.position * r.impressions; t.queries.add(q);
    if (q === keyword) { t.exact.clicks += r.clicks; t.exact.impressions += r.impressions; }
    const p = pathOf(r.keys[1]); const e = t.pages.get(p) || { impressions: 0, clicks: 0, posW: 0 }; e.impressions += r.impressions; e.clicks += r.clicks; e.posW += r.position * r.impressions; t.pages.set(p, e);
  }
  if (!t.queries.size) return null;
  const pages = [...t.pages.entries()].map(([path, e]) => ({ path, impressions: e.impressions, clicks: e.clicks, position: e.impressions ? Math.round((e.posW / e.impressions) * 10) / 10 : null })).sort((a, b) => b.impressions - a.impressions);
  return { clicks: t.clicks, impressions: t.impressions, ctr: t.impressions ? t.clicks / t.impressions : 0, position: t.impressions ? Math.round((t.posW / t.impressions) * 10) / 10 : null, exact: t.exact, queryCount: t.queries.size, queries: [...t.queries].slice(0, 5), pages };
}

// -> one record per target keyword. `inv` (optional) adds the content-coverage analysis.
function track(cfg, curRows, prevRows, gsc, inv) {
  const { list } = readKeywords(cfg); if (!list.length) return [];
  return list.map((keyword) => {
    const cov = inv ? coverage(keyword, inv) : null;
    if (!gsc || !gsc.available) return Object.assign({ keyword, status: 'unavailable', detail: `Search Console data unavailable (${(gsc && gsc.status) || 'unknown'})` }, cov ? { coverage: cov } : {});
    const c = agg(curRows, keyword), p = agg(prevRows, keyword);
    if (!c && !p) return Object.assign({ keyword, status: 'no_impressions', detail: 'no matching query had impressions in either 28-day window' }, cov ? { coverage: cov } : {});
    const empty = { clicks: 0, impressions: 0, ctr: 0, position: null, exact: { clicks: 0, impressions: 0 }, queryCount: 0, queries: [], pages: [] };
    const cur = c || empty, prev = p || empty; const shown = cur.pages[0] ? cur.pages[0].path : null;
    const mismatch = Boolean(shown && cov && cov.page && shown !== cov.page && cov.fit >= 0.3);
    return Object.assign({ keyword, status: 'data', current: cur, previous: prev, change: { impressions: cur.impressions - prev.impressions, clicks: cur.clicks - prev.clicks, position: cur.position != null && prev.position != null ? Math.round((cur.position - prev.position) * 10) / 10 : null }, shownPage: shown, mismatch,
      mismatchNote: mismatch ? `Google shows ${shown}, but ${cov.page} fits this keyword better` : null }, cov ? { coverage: cov } : {});
  });
}

// which existing page fits the keyword best (site text only) and how well
function coverage(keyword, inv) {
  const all = mapToPages(keyword, inv, null, 60); const guide = (p) => p.path.startsWith('/guides/');
  const commercial = classify(keyword).kind === 'commercial';
  // a supply keyword should be served by a supply/product page, not by an informational guide that merely mentions the words
  const top = commercial ? (all.find((c) => !guide(c)) || all[0]) : all[0];
  if (!top) return { page: null, fit: 0, level: 'none', note: 'no indexable page' };
  const fit = Math.round(top.fit * 100) / 100; const guideFirst = commercial && all[0] && guide(all[0]) && all[0].fit > top.fit;
  return { page: top.path, fit, level: fit >= 0.4 ? 'good' : fit >= 0.15 ? 'weak' : 'none', competingGuide: guideFirst ? all[0].path : null, note: fit >= 0.4 ? 'an existing page covers this keyword' : fit >= 0.15 ? 'the best existing page covers this keyword only partly: improve that page (no new page)' : 'no existing page fits this keyword: content gap for a person to review (a page is never created automatically)' };
}

// queries that had real visibility in the previous window and none in the current one (only when both windows have data)
function lostQueries(curRows, prevRows) {
  if (!curRows.length || !prevRows.length) return [];
  const sum = (rows) => { const m = new Map(); for (const r of rows) { const q = String(r.keys[0] || '').toLowerCase(); const e = m.get(q) || { impressions: 0, clicks: 0 }; e.impressions += r.impressions; e.clicks += r.clicks; m.set(q, e); } return m; };
  const cur = sum(curRows); const out = [];
  for (const [q, e] of sum(prevRows)) if (e.impressions >= 5 && !cur.has(q)) out.push({ query: q, previousImpressions: e.impressions, previousClicks: e.clicks });
  return out.sort((a, b) => b.previousImpressions - a.previousImpressions).slice(0, 10);
}

module.exports = { readKeywords, track, lostQueries, matches, matchTarget, coverage };
