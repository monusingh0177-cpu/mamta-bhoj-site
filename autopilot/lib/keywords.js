'use strict';
// Search Console facts about named target keywords and about queries that disappeared. Nothing is guessed:
//   * "unavailable"      - Search Console data could not be read (never reported as zero);
//   * "no_impressions"   - Search Console answered, and the query had no impressions in the window (a true zero);
//   * "data"             - measured values for the settled 28-day window and the previous 28 days.
const fs = require('fs');

function readKeywords(cfg) {
  if (!cfg.targetKeywordsFile) return { list: [], note: 'no target keyword file configured (set AUTOPILOT_TARGET_KEYWORDS_FILE: one keyword per line)' };
  try {
    const list = fs.readFileSync(cfg.targetKeywordsFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.toLowerCase());
    return { list: [...new Set(list)], note: `${list.length} keyword(s) from ${cfg.targetKeywordsFile}` };
  } catch (e) { return { list: [], note: `target keyword file cannot be read: ${e.code || e.message}` }; }
}

// rows: [{keys:[query,page], clicks, impressions, position}] -> Map(query -> {clicks, impressions, pos(weighted), page(best by impressions)})
function byQuery(rows) {
  const m = new Map();
  for (const r of rows) {
    const q = String(r.keys[0] || '').toLowerCase(); const e = m.get(q) || { clicks: 0, impressions: 0, posW: 0, pages: new Map() };
    e.clicks += r.clicks; e.impressions += r.impressions; e.posW += r.position * r.impressions; e.pages.set(r.keys[1], (e.pages.get(r.keys[1]) || 0) + r.impressions); m.set(q, e);
  }
  return m;
}
const fin = (e) => (e ? { clicks: e.clicks, impressions: e.impressions, ctr: e.impressions ? e.clicks / e.impressions : 0, position: e.impressions ? Math.round((e.posW / e.impressions) * 10) / 10 : null, page: [...e.pages.entries()].sort((a, b) => b[1] - a[1])[0][0] } : null);

function track(cfg, curRows, prevRows, gsc) {
  const { list } = readKeywords(cfg); if (!list.length) return [];
  if (!gsc || !gsc.available) return list.map((keyword) => ({ keyword, status: 'unavailable', detail: `Search Console data unavailable (${(gsc && gsc.status) || 'unknown'})` }));
  const cur = byQuery(curRows), prev = byQuery(prevRows);
  return list.map((keyword) => {
    const c = fin(cur.get(keyword)), p = fin(prev.get(keyword));
    if (!c && !p) return { keyword, status: 'no_impressions', detail: 'no impressions in either 28-day window' };
    return { keyword, status: 'data', current: c || { clicks: 0, impressions: 0, ctr: 0, position: null }, previous: p || { clicks: 0, impressions: 0, ctr: 0, position: null }, change: (c ? c.impressions : 0) - (p ? p.impressions : 0) };
  });
}

// queries that had real visibility in the previous window and none in the current one (only when both windows have data)
function lostQueries(curRows, prevRows) {
  if (!curRows.length || !prevRows.length) return [];
  const cur = byQuery(curRows); const out = [];
  for (const [q, e] of byQuery(prevRows)) if (e.impressions >= 5 && !cur.has(q)) out.push({ query: q, previousImpressions: e.impressions, previousClicks: e.clicks });
  return out.sort((a, b) => b.previousImpressions - a.previousImpressions).slice(0, 10);
}

module.exports = { readKeywords, track, lostQueries };
